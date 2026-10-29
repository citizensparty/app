package main

// The relay: members' apps and other hosts connect over WebSocket (NIP-01), and anyone can read its info (NIP-11).
// The record is public: anyone may read. Writes follow the rules in Store.WriteError.
// Members' apps come first: copying to other hosts slows down while apps are busy.

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

const (
	maxSubs       = 64
	maxClients    = 5000
	sendQueue     = 2048
	eventsPerSec  = 30
	eventsBurst   = 300
	peerReplays   = 2 // other hosts copying from us at the same time
	appQuietAfter = 3 * time.Second
)

type Relay struct {
	cfg   *Config
	store *Store
	hosts *Hosts

	mu      sync.Mutex
	clients map[*Client]bool
	recent  map[string]time.Time // members whose app left recently: phones drop the connection whenever the app is in the background

	peerSem chan struct{}
	lastApp atomic.Int64 // unix nanos of the last request from a member's app

	statDay      atomic.Int64
	statRequests atomic.Int64
	statBytes    atomic.Int64
}

func NewRelay(cfg *Config, st *Store) *Relay {
	return &Relay{cfg: cfg, store: st, clients: map[*Client]bool{}, recent: map[string]time.Time{}, peerSem: make(chan struct{}, peerReplays)}
}

// Accept checks and stores an event from an app or a host. Host announcements are checked first (see hosts.go).
func (r *Relay) Accept(e *Event, from string) (bool, string) {
	if len(e.Content) > MaxEvent {
		return false, "invalid: too large"
	}
	if !e.Valid() {
		return false, "invalid: bad signature"
	}
	if msg := r.store.WriteError(e); msg != "" {
		return false, msg
	}
	if e.C() == "hosts" && e.PubKey != r.cfg.Key.Pub {
		return r.hosts.Announced(e, from)
	}
	if r.store.Put(e) {
		r.Broadcast(e)
	}
	return true, ""
}

// OwnChallenge reports whether ch is a challenge this host handed out: a "peer" that is really ourselves.
func (r *Relay) OwnChallenge(ch string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for c := range r.clients {
		if c.challenge == ch {
			return true
		}
	}
	return false
}

func (r *Relay) Broadcast(e *Event) {
	raw := string(e.JSON())
	r.mu.Lock()
	defer r.mu.Unlock()
	for c := range r.clients {
		c.push(e, raw)
	}
}

// Online counts members with the app open now or in the last 10 minutes.
func (r *Relay) Online() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	seen := map[string]bool{}
	for c := range r.clients {
		if pk := c.PK(); pk != "" {
			seen[pk] = true
		}
	}
	for pk, t := range r.recent {
		if time.Since(t) > onlineWindow {
			delete(r.recent, pk)
		} else {
			seen[pk] = true
		}
	}
	n := 0
	for pk := range seen {
		if pk != r.cfg.Key.Pub && !r.hosts.IsHost(pk) {
			n++
		}
	}
	return n
}

const onlineWindow = 10 * time.Minute

// PeersIn counts other hosts connected to us and copying.
func (r *Relay) PeersIn() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for c := range r.clients {
		if c.isPeer() {
			n++
		}
	}
	return n
}

func (r *Relay) count(bytes int) {
	day := time.Now().YearDay()
	if r.statDay.Swap(int64(day)) != int64(day) {
		r.statRequests.Store(0)
		r.statBytes.Store(0)
	}
	r.statBytes.Add(int64(bytes))
}

func (r *Relay) Info() map[string]any {
	ck := r.store.Checkpoint()
	return map[string]any{
		"name": r.cfg.Name, "description": "A member-run host for Citizens Party records.", "pubkey": r.cfg.Key.Pub,
		"supported_nips": []int{1, 11, 33, 42, 78}, "software": "citizens-host", "version": version, "protocol": Protocol,
		"limitation": map[string]any{"auth_required": false, "restricted_writes": true, "max_message_length": MaxEvent},
		"checkpoint": ck,
		"stats":      map[string]any{"members": r.store.MemberCount(), "online": r.Online(), "bytes": ck.Bytes, "votes": ck.Votes},
		"network":    map[string]any{"hosts": r.hosts.Listed()},
		"onion":      r.hosts.Onion(),
	}
}

func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if strings.EqualFold(req.Header.Get("Upgrade"), "websocket") {
		r.serveWS(w, req)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Accept")
	if req.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.Header().Set("Content-Type", "application/nostr+json")
	json.NewEncoder(w).Encode(r.Info())
}

func (r *Relay) serveWS(w http.ResponseWriter, req *http.Request) {
	r.mu.Lock()
	full := len(r.clients) >= maxClients
	r.mu.Unlock()
	if full {
		http.Error(w, "this host is full; your app will use another", http.StatusServiceUnavailable)
		return
	}
	ws, err := websocket.Accept(w, req, &websocket.AcceptOptions{InsecureSkipVerify: true}) // apps connect from any site
	if err != nil {
		return
	}
	ws.SetReadLimit(MaxEvent * 2)
	ctx, cancel := context.WithCancel(req.Context())
	c := &Client{relay: r, ws: ws, subs: map[string][]Filter{}, out: make(chan string, sendQueue), cancel: cancel, tokens: eventsBurst, refill: time.Now()}
	b := make([]byte, 16)
	rand.Read(b)
	c.challenge = hex.EncodeToString(b)
	r.mu.Lock()
	r.clients[c] = true
	r.mu.Unlock()
	defer func() {
		r.mu.Lock()
		delete(r.clients, c)
		if pk := c.PK(); pk != "" {
			r.recent[pk] = time.Now()
		}
		r.mu.Unlock()
		cancel()
		ws.CloseNow()
	}()
	go c.writer(ctx)
	go func() { // keep the connection alive through tunnels and proxies
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				pc, pcancel := context.WithTimeout(ctx, 20*time.Second)
				if ws.Ping(pc) != nil {
					pcancel()
					cancel()
					return
				}
				pcancel()
			}
		}
	}()
	c.send([]any{"AUTH", c.challenge})
	c.run(ctx)
}

type Client struct {
	relay     *Relay
	ws        *websocket.Conn
	challenge string
	cancel    context.CancelFunc
	out       chan string

	replayMu sync.Mutex
	mu       sync.Mutex
	pk       string
	subs     map[string][]Filter
	peer     bool // another host copying from us
	tokens   float64
	refill   time.Time
}

func (c *Client) PK() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.pk
}

func (c *Client) isPeer() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.peer || (c.pk != "" && c.relay.hosts.IsHost(c.pk))
}

func (c *Client) writer(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case m := <-c.out:
			wc, cancel := context.WithTimeout(ctx, 30*time.Second)
			err := c.ws.Write(wc, websocket.MessageText, []byte(m))
			cancel()
			if err != nil {
				c.cancel()
				return
			}
			c.relay.count(len(m))
		}
	}
}

func msg(parts ...any) string {
	b, _ := json.Marshal(parts)
	return string(b)
}

// send queues a message, waiting if the queue is full (used for replies and replays).
func (c *Client) send(parts []any) {
	select {
	case c.out <- msg(parts...):
	case <-time.After(30 * time.Second):
		c.cancel()
	}
}

func (c *Client) sendRaw(m string) bool {
	select {
	case c.out <- m:
		return true
	case <-time.After(30 * time.Second):
		c.cancel()
		return false
	}
}

// push sends a new record to matching subscriptions; a client too slow to keep up is disconnected.
func (c *Client) push(e *Event, raw string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for sid, fs := range c.subs {
		for i := range fs {
			if fs[i].Match(e) {
				select {
				case c.out <- `["EVENT",` + mustJSON(sid) + `,` + raw + `]`:
				default:
					c.cancel()
				}
				break
			}
		}
	}
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func (c *Client) allowEvent() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	c.tokens = min(eventsBurst, c.tokens+now.Sub(c.refill).Seconds()*eventsPerSec)
	c.refill = now
	if c.tokens < 1 {
		return false
	}
	c.tokens--
	return true
}

func (c *Client) run(ctx context.Context) {
	for {
		_, data, err := c.ws.Read(ctx)
		if err != nil {
			return
		}
		var m []json.RawMessage
		if json.Unmarshal(data, &m) != nil || len(m) < 2 {
			c.send([]any{"NOTICE", "invalid: not a Nostr message"})
			continue
		}
		var t string
		json.Unmarshal(m[0], &t)
		switch t {
		case "EVENT":
			var e Event
			if json.Unmarshal(m[1], &e) != nil {
				c.send([]any{"NOTICE", "invalid: bad event"})
				continue
			}
			if !c.isPeer() {
				c.relay.lastApp.Store(time.Now().UnixNano())
			}
			if !c.allowEvent() {
				c.send([]any{"OK", e.ID, false, "rate-limited: slow down"})
				continue
			}
			ok, why := c.relay.Accept(&e, "client")
			c.send([]any{"OK", e.ID, ok, why})
		case "REQ":
			var sid string
			json.Unmarshal(m[1], &sid)
			var fs []Filter
			for _, raw := range m[2:] {
				var f Filter
				if json.Unmarshal(raw, &f) == nil {
					fs = append(fs, f)
				}
			}
			c.mu.Lock()
			if _, had := c.subs[sid]; !had && len(c.subs) >= maxSubs {
				c.mu.Unlock()
				c.send([]any{"CLOSED", sid, "error: too many subscriptions"})
				continue
			}
			if strings.HasPrefix(sid, "sync") {
				c.peer = true
			}
			c.subs[sid] = fs
			c.mu.Unlock()
			c.relay.statRequests.Add(1)
			go func() { // replay alongside reading, so pings and new messages keep flowing
				c.replayMu.Lock()
				defer c.replayMu.Unlock()
				c.replay(ctx, sid, fs)
			}()
		case "CLOSE":
			var sid string
			json.Unmarshal(m[1], &sid)
			c.mu.Lock()
			delete(c.subs, sid)
			c.mu.Unlock()
		case "AUTH":
			var e Event
			json.Unmarshal(m[1], &e)
			ok := e.Kind == KindAuth && e.Valid() && e.Tag("challenge") == c.challenge && abs(e.CreatedAt-time.Now().Unix()) < 600
			if ok {
				c.mu.Lock()
				c.pk = e.PubKey
				c.mu.Unlock()
			}
			why := ""
			if !ok {
				why = "auth-required: bad AUTH event"
			}
			c.send([]any{"OK", e.ID, ok, why})
		}
	}
}

func abs(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}

// replay sends stored records matching the subscription, then EOSE. Other hosts' copying waits for a free
// slot and pauses whenever members' apps are busy, so members always come first.
func (c *Client) replay(ctx context.Context, sid string, fs []Filter) {
	low := c.isPeer()
	if low {
		select {
		case c.relay.peerSem <- struct{}{}:
			defer func() { <-c.relay.peerSem }()
		case <-ctx.Done():
			return
		}
	} else {
		c.relay.lastApp.Store(time.Now().UnixNano())
	}
	prefix := `["EVENT",` + mustJSON(sid) + `,`
	seen := map[string]bool{}
	n := 0
	for i := range fs {
		f := fs[i]
		if f.Limit != nil && *f.Limit > 100000 {
			*f.Limit = 100000
		}
		c.relay.store.Query(&f, func(raw string) bool {
			if ctx.Err() != nil {
				return false
			}
			var head struct {
				ID string `json:"id"`
			}
			json.Unmarshal([]byte(raw), &head)
			if len(fs) > 1 {
				if seen[head.ID] {
					return true
				}
				seen[head.ID] = true
			}
			n++
			if low && n%200 == 0 && time.Since(time.Unix(0, c.relay.lastApp.Load())) < appQuietAfter {
				time.Sleep(150 * time.Millisecond)
			}
			return c.sendRaw(prefix + raw + "]")
		})
	}
	c.send([]any{"EOSE", sid})
}

func logf(format string, a ...any) { log.Printf(format, a...) }
