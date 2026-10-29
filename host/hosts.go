package main

// Hosts find each other through the record itself: each host signs a "hosts/<its key>" record with its address.
// Before storing another host's record, this host connects back and checks that it really holds the record:
// it answers with the key it claims, holds about as many records as we do, and returns a few we pick at random.
// Listed hosts are checked again every half hour; one that fails three times in a row is dropped.
// At most hostCap hosts are listed (from the party config, 10,000 by default); when full, the worst one makes room.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/coder/websocket"
)

const (
	failsToDrop  = 3
	badFor       = 6 * time.Hour
	announceLife = 6 * time.Hour
	maxPeers     = 8 // hosts this one copies from at a time
	checkWorkers = 3
)

type Announcement struct {
	URL   string `json:"url"`
	Name  string `json:"name"`
	V     string `json:"v"`
	Onion string `json:"onion,omitempty"` // ws://<56 letters>.onion: the same host through Tor (onion.go)
}

type PeerState struct {
	URL       string
	Name      string
	Trusted   bool // a seed: from the party config or PEERS
	Connected bool
	Synced    bool
	Listed    bool // it holds our current announcement
	Same      int  // 1: same fingerprint as ours, 0: unknown, -1: differs
	Diff      int  // their record count minus ours
	conn      *websocket.Conn
	cancel    context.CancelFunc
}

type Hosts struct {
	cfg   *Config
	store *Store
	relay *Relay
	safe  *http.Client // for hosts we don't know: never dials private or local addresses
	open  *http.Client // for the party's own seed hosts

	queue chan *Event

	mu      sync.Mutex
	pending map[string]bool
	known   map[string]bool // keys of listed hosts and seeds
	peers   map[string]*PeerState
	myURL   string
	myOnion string
	myAnn   *Event
	ready   bool
	self    map[string]bool // addresses that turned out to be this host

	kick     chan struct{} // wakes the peer manager when a host is newly listed
	dirState string        // how the directory at citizensparty.ca sees this host
	dirSeen  int           // other hosts the directory listed (-1 until it has answered)
}

var (
	errPrivate = errors.New("private or local address")
	errSelf    = errors.New("that's this host")
)

func NewHosts(cfg *Config, st *Store, r *Relay) *Hosts {
	guard := func(network, address string, _ syscall.RawConn) error {
		host, _, _ := net.SplitHostPort(address)
		ip := net.ParseIP(host)
		if ip != nil && !cfg.AllowLocal && (ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast()) {
			return errPrivate
		}
		return nil
	}
	mk := func(control func(string, string, syscall.RawConn) error) *http.Client {
		d := &net.Dialer{Timeout: 10 * time.Second, Control: control}
		return &http.Client{Timeout: 15 * time.Second, Transport: &http.Transport{DialContext: d.DialContext, Proxy: http.ProxyFromEnvironment, TLSHandshakeTimeout: 10 * time.Second}}
	}
	h := &Hosts{cfg: cfg, store: st, relay: r, safe: mk(guard), open: mk(nil), queue: make(chan *Event, 1000),
		pending: map[string]bool{}, known: map[string]bool{}, peers: map[string]*PeerState{}, self: map[string]bool{}, kick: make(chan struct{}, 1), dirSeen: -1}
	r.hosts = h
	h.refreshKnown()
	return h
}

func (h *Hosts) refreshKnown() {
	k := map[string]bool{}
	h.store.Query(&Filter{C: []string{"hosts"}}, func(raw string) bool {
		var e Event
		if json.Unmarshal([]byte(raw), &e) == nil {
			k[e.PubKey] = true
		}
		return true
	})
	for _, s := range h.store.Seeds() {
		if s.PubKey != "" {
			k[s.PubKey] = true
		}
	}
	h.mu.Lock()
	h.known = k
	h.mu.Unlock()
}

func (h *Hosts) IsHost(pk string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.known[pk]
}

func (h *Hosts) Listed() int { return h.store.Count("hosts") }

func (h *Hosts) validURL(u string) bool {
	p, err := url.Parse(u)
	if err != nil || len(u) > 200 || p.Host == "" || p.User != nil || (p.Path != "" && p.Path != "/") || p.RawQuery != "" {
		return false
	}
	return p.Scheme == "wss" || (p.Scheme == "ws" && h.cfg.AllowLocal)
}

func norm(u string) string { return strings.TrimRight(strings.ToLower(strings.TrimSpace(u)), "/") }

// Announced handles another host's announcement: stored at once if we checked it recently, else queued for a check.
func (h *Hosts) Announced(e *Event, from string) (bool, string) {
	var a Announcement
	if json.Unmarshal([]byte(e.Content), &a) != nil || !h.validURL(a.URL) {
		return false, "invalid: a host announcement needs a wss:// address"
	}
	if a.Onion != "" && !validOnion(a.Onion) {
		return false, "invalid: a host's Tor address looks like ws://<56 letters and digits>.onion"
	}
	h.mu.Lock()
	mine := h.myURL != "" && norm(a.URL) == norm(h.myURL)
	h.mu.Unlock()
	if mine {
		return false, "blocked: that's this host's own address"
	}
	st := h.stat(e.PubKey)
	now := time.Now().Unix()
	if st.BadUntil > now {
		// a quick-tunnel host gets a new address every restart: the failures were at its old one, so check the new
		// one (at most once a minute) instead of making it wait out the 6 hours
		var lastURL string
		h.store.db.QueryRow("select url from hoststat where pubkey=?", e.PubKey).Scan(&lastURL)
		if norm(lastURL) == norm(a.URL) || now-st.LastCheck < 60 {
			return false, "blocked: this host failed its checks; it can try again later"
		}
	}
	if cur := h.store.Get(e.PubKey, e.D()); cur != nil {
		var ca Announcement
		json.Unmarshal([]byte(cur.Content), &ca)
		if norm(ca.URL) == norm(a.URL) && now-st.LastOK < 3600 {
			if h.store.Put(e) {
				h.relay.Broadcast(e)
			}
			return true, ""
		}
		if cur.ID == e.ID || !newer(e, cur) {
			return true, "duplicate: already have it"
		}
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.pending[e.PubKey] {
		return true, "pending: checking this host"
	}
	select {
	case h.queue <- e:
		h.pending[e.PubKey] = true
		return true, "pending: checking this host"
	default:
		return false, "rate-limited: busy checking other hosts; try again later"
	}
}

func (h *Hosts) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case e := <-h.queue:
			var a Announcement
			json.Unmarshal([]byte(e.Content), &a)
			err := h.check(ctx, a.URL, e.PubKey)
			h.record(e.PubKey, a.URL, err)
			if err == nil {
				if why := h.admit(e); why != "" {
					logf("not listing %s: %s", a.URL, why)
				} else {
					logf("listed host %s", a.URL)
				}
			} else {
				logf("host %s failed its check: %v", a.URL, err)
			}
			h.mu.Lock()
			delete(h.pending, e.PubKey)
			h.mu.Unlock()
		}
	}
}

// admit stores a checked announcement, making room if the list is full.
func (h *Hosts) admit(e *Event) string {
	if h.store.Get(e.PubKey, e.D()) == nil && h.Listed() >= h.store.HostCap() {
		var worst string
		var consec int
		h.store.db.QueryRow(`select h.pubkey, h.consec from hoststat h join ev on ev.pubkey=h.pubkey and ev.c='hosts'
			where h.pubkey<>? order by h.consec desc, h.oks asc limit 1`, h.cfg.Key.Pub).Scan(&worst, &consec)
		if worst == "" || consec == 0 {
			return fmt.Sprintf("the list is full (%d hosts) and they're all working", h.store.HostCap())
		}
		h.store.Delete(worst, "hosts/"+worst)
	}
	if h.store.Put(e) {
		h.relay.Broadcast(e)
		h.refreshKnown()
		select {
		case h.kick <- struct{}{}:
		default:
		}
	}
	return ""
}

type hostStat struct{ FirstOK, LastOK, LastCheck, OKs, Fails, Consec, BadUntil int64 }

func (h *Hosts) stat(pk string) hostStat {
	var s hostStat
	h.store.db.QueryRow("select first_ok,last_ok,last_check,oks,fails,consec,bad_until from hoststat where pubkey=?", pk).
		Scan(&s.FirstOK, &s.LastOK, &s.LastCheck, &s.OKs, &s.Fails, &s.Consec, &s.BadUntil)
	return s
}

func (h *Hosts) record(pk, u string, err error) {
	now := time.Now().Unix()
	s := h.stat(pk)
	s.LastCheck = now
	if err == nil {
		if s.FirstOK == 0 {
			s.FirstOK = now
		}
		s.LastOK, s.OKs, s.Consec, s.BadUntil = now, s.OKs+1, 0, 0
	} else {
		s.Fails++
		s.Consec++
		if s.Consec >= failsToDrop {
			s.BadUntil = now + int64(badFor.Seconds())
			if h.store.Get(pk, "hosts/"+pk) != nil {
				h.store.Delete(pk, "hosts/"+pk)
				h.refreshKnown()
				logf("dropped host %s after %d failed checks", u, s.Consec)
			}
		}
	}
	h.store.db.Exec(`insert into hoststat values (?,?,?,?,?,?,?,?,?) on conflict(pubkey) do update set
		url=excluded.url, first_ok=excluded.first_ok, last_ok=excluded.last_ok, last_check=excluded.last_check,
		oks=excluded.oks, fails=excluded.fails, consec=excluded.consec, bad_until=excluded.bad_until`,
		pk, u, s.FirstOK, s.LastOK, s.LastCheck, s.OKs, s.Fails, s.Consec, s.BadUntil)
}

func httpURL(ws string) string {
	if strings.HasPrefix(ws, "wss://") {
		return "https://" + ws[6:]
	}
	if strings.HasPrefix(ws, "ws://") {
		return "http://" + ws[5:]
	}
	return ws
}

type info struct {
	PubKey     string `json:"pubkey"`
	Name       string `json:"name"`
	Checkpoint struct {
		Count int    `json:"count"`
		Hash  string `json:"hash"`
	} `json:"checkpoint"`
}

func (h *Hosts) fetchInfo(ctx context.Context, cl *http.Client, u string) (*info, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", httpURL(u), nil)
	req.Header.Set("Accept", "application/nostr+json")
	resp, err := cl.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var in info
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&in); err != nil {
		return nil, fmt.Errorf("its info page didn't make sense")
	}
	return &in, nil
}

// check makes sure the host at u is a real, working copy of the record, run by the key that announced it.
func (h *Hosts) check(ctx context.Context, u, pk string) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	in, err := h.fetchInfo(ctx, h.safe, u)
	if err != nil {
		return fmt.Errorf("unreachable (%v)", err)
	}
	if in.PubKey != pk {
		return fmt.Errorf("it answers with a different key")
	}
	ours := h.store.Checkpoint().Count
	if ours >= 50 && in.Checkpoint.Count*10 < ours*8 {
		return fmt.Errorf("it holds %d records; we hold %d", in.Checkpoint.Count, ours)
	}
	ids := h.store.SampleIDs(3, time.Hour)
	if len(ids) < 3 {
		ids = h.store.SampleIDs(3, 0)
	}
	if len(ids) == 0 {
		return nil
	}
	ws, _, err := websocket.Dial(ctx, u, &websocket.DialOptions{HTTPClient: h.safe})
	if err != nil {
		return fmt.Errorf("can't open a connection (%v)", err)
	}
	defer ws.CloseNow()
	ws.SetReadLimit(MaxEvent * 2)
	b, _ := json.Marshal([]any{"REQ", "check", map[string]any{"ids": ids}})
	if err := ws.Write(ctx, websocket.MessageText, b); err != nil {
		return err
	}
	want := map[string]bool{}
	for _, id := range ids {
		want[id] = true
	}
	for {
		_, data, err := ws.Read(ctx)
		if err != nil {
			return fmt.Errorf("it stopped answering")
		}
		var m []json.RawMessage
		if json.Unmarshal(data, &m) != nil || len(m) < 2 {
			continue
		}
		var t string
		json.Unmarshal(m[0], &t)
		if t == "EVENT" && len(m) >= 3 {
			var e Event
			if json.Unmarshal(m[2], &e) == nil && want[e.ID] && e.Valid() {
				delete(want, e.ID)
			}
		} else if t == "EOSE" {
			if len(want) > 0 {
				return fmt.Errorf("it's missing %d of %d records we asked for", len(want), len(ids))
			}
			return nil
		}
	}
}

// recheck keeps checking listed hosts; the ones that keep failing are dropped (see record).
func (h *Hosts) recheck(ctx context.Context) {
	t := time.NewTicker(max(time.Second, h.cfg.CheckEvery/15))
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		type due struct{ pk, url string }
		var list []due
		cutoff := time.Now().Add(-h.cfg.CheckEvery).Unix()
		h.store.Query(&Filter{C: []string{"hosts"}}, func(raw string) bool {
			var e Event
			if json.Unmarshal([]byte(raw), &e) != nil || e.PubKey == h.cfg.Key.Pub {
				return true
			}
			var a Announcement
			json.Unmarshal([]byte(e.Content), &a)
			if h.stat(e.PubKey).LastCheck < cutoff {
				list = append(list, due{e.PubKey, a.URL})
			}
			return len(list) < 10
		})
		for _, d := range list {
			h.record(d.pk, d.url, h.check(ctx, d.url, d.pk))
		}
	}
}

// ---- this host's own announcement ----

func (h *Hosts) SetURL(u string) {
	h.mu.Lock()
	changed := norm(u) != norm(h.myURL)
	h.myURL = u
	h.mu.Unlock()
	if changed {
		logf("this host's address: %s", u)
		h.Announce()
	}
}

// SetOnion is this host's Tor address, announced along with its usual one.
func (h *Hosts) SetOnion(u string) {
	h.mu.Lock()
	changed := u != h.myOnion
	h.myOnion = u
	h.mu.Unlock()
	if changed {
		logf("this host's Tor address: %s", u)
		h.Announce()
	}
}

func (h *Hosts) Onion() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.myOnion
}

func validOnion(u string) bool {
	name, ok := strings.CutPrefix(u, "ws://")
	return ok && onionName.MatchString(name)
}

func (h *Hosts) URL() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.myURL
}

func (h *Hosts) setReady() {
	h.mu.Lock()
	was := h.ready
	h.ready = true
	h.mu.Unlock()
	if !was {
		h.Announce()
	}
}

// Announce signs and shares this host's address, once it has caught up with the record (so its checks pass).
func (h *Hosts) Announce() {
	h.mu.Lock()
	u, onion, ready := h.myURL, h.myOnion, h.ready
	h.mu.Unlock()
	if u == "" || !ready {
		return
	}
	content, _ := json.Marshal(Announcement{URL: u, Name: h.cfg.Name, V: version, Onion: onion})
	e := h.cfg.Key.Sign(KindDoc, [][]string{{"d", "hosts/" + h.cfg.Key.Pub}, {"c", "hosts"}, {"p", Protocol}, {"ms", strconv.Itoa(time.Now().Nanosecond() / 1e6)}}, string(content))
	if h.store.Put(e) {
		h.relay.Broadcast(e)
	}
	h.mu.Lock()
	h.myAnn = e
	var conns []*websocket.Conn
	for _, p := range h.peers {
		p.Listed = false
		if p.conn != nil {
			conns = append(conns, p.conn)
		}
	}
	h.mu.Unlock()
	b, _ := json.Marshal([]any{"EVENT", e})
	for _, c := range conns {
		wc, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		c.Write(wc, websocket.MessageText, b)
		cancel()
	}
	go h.register(e)
}

// ---- the directory at citizensparty.ca: the front door for finding hosts ----

// register sends this host's announcement to the directory, retrying for a while if it can't be reached.
func (h *Hosts) register(e *Event) {
	if h.cfg.Directory == "" {
		return
	}
	if h.cfg.Tunnel == "auto" {
		time.Sleep(10 * time.Second) // a new quick tunnel takes a few seconds before Cloudflare routes to it
	}
	for try := 0; try < 12; try++ {
		h.mu.Lock()
		stale := h.myAnn == nil || h.myAnn.ID != e.ID
		h.mu.Unlock()
		if stale {
			return // a newer announcement took over
		}
		req, _ := http.NewRequest("POST", h.cfg.Directory+"/api/hosts", strings.NewReader(string(e.JSON())))
		req.Header.Set("Content-Type", "application/json")
		resp, err := h.open.Do(req)
		if err == nil {
			var r struct {
				OK  bool   `json:"ok"`
				Why string `json:"why"`
			}
			json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&r)
			resp.Body.Close()
			h.mu.Lock()
			if r.OK {
				h.dirState = "listed"
			} else {
				h.dirState = r.Why
			}
			h.mu.Unlock()
			if r.OK || resp.StatusCode == 400 || resp.StatusCode == 409 {
				if !r.OK {
					logf("citizensparty.ca didn't list this host: %s", r.Why)
				}
				return
			}
			logf("citizensparty.ca didn't list this host yet: %s", r.Why)
		} else {
			h.mu.Lock()
			h.dirState = "couldn't reach it"
			h.mu.Unlock()
		}
		time.Sleep(time.Duration(30*(try+1)) * time.Second)
	}
}

func (h *Hosts) DirState() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.dirState
}

// directoryLoop reads the directory's host list and checks each host like any other announcement.
func (h *Hosts) directoryLoop(ctx context.Context) {
	if h.cfg.Directory == "" {
		return
	}
	for ctx.Err() == nil {
		n := h.readDirectory(ctx)
		if n >= 0 {
			h.mu.Lock()
			h.dirSeen = n
			h.mu.Unlock()
			h.checkReady(false)
		}
		wait := 30 * time.Minute
		if n < 0 {
			wait = 2 * time.Minute
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

func (h *Hosts) readDirectory(ctx context.Context) int {
	c, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(c, "GET", h.cfg.Directory+"/hosts.json", nil)
	resp, err := h.open.Do(req)
	if err != nil {
		return -1
	}
	defer resp.Body.Close()
	var d struct {
		Hosts []struct {
			Ev Event `json:"ev"`
		} `json:"hosts"`
	}
	if resp.StatusCode != 200 || json.NewDecoder(io.LimitReader(resp.Body, 32<<20)).Decode(&d) != nil {
		return -1
	}
	n := 0
	for i := range d.Hosts {
		e := d.Hosts[i].Ev
		if e.PubKey == h.cfg.Key.Pub || e.C() != "hosts" {
			continue
		}
		n++
		h.relay.Accept(&e, "directory")
	}
	return n
}

func (h *Hosts) announceLoop(ctx context.Context) {
	t := time.NewTicker(announceLife)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			h.Announce()
		}
	}
}

// ---- copying from other hosts ----

// seedSet lists the party's own hosts (from the party config and PEERS); this host always copies from them.
func (h *Hosts) seedSet() map[string]bool {
	out := map[string]bool{}
	me := norm(h.URL())
	for _, s := range h.store.Seeds() {
		if s.URL != "" && s.PubKey != h.cfg.Key.Pub && norm(s.URL) != me && !h.isSelf(s.URL) {
			out[s.URL] = true
		}
	}
	for _, p := range h.cfg.Peers {
		if norm(p) != me && !h.isSelf(p) {
			out[p] = true
		}
	}
	return out
}

func (h *Hosts) isSelf(u string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.self[u]
}

// listedURLs lists other hosts' addresses, best first: the ones that have passed the most checks (ties shuffled).
func (h *Hosts) listedURLs() []string {
	type cand struct {
		url string
		oks int64
	}
	var cs []cand
	me := norm(h.URL())
	h.store.Query(&Filter{C: []string{"hosts"}}, func(raw string) bool {
		var e Event
		if json.Unmarshal([]byte(raw), &e) != nil || e.PubKey == h.cfg.Key.Pub {
			return true
		}
		var a Announcement
		json.Unmarshal([]byte(e.Content), &a)
		if norm(a.URL) != me && !h.isSelf(a.URL) {
			cs = append(cs, cand{a.URL, h.stat(e.PubKey).OKs})
		}
		return true
	})
	rand.Shuffle(len(cs), func(i, j int) { cs[i], cs[j] = cs[j], cs[i] })
	sort.SliceStable(cs, func(i, j int) bool { return cs[i].oks > cs[j].oks })
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = c.url
	}
	return out
}

// peerManager keeps this host copying from every seed plus listed hosts, up to maxPeers, rotating one every half hour.
func (h *Hosts) peerManager(ctx context.Context) {
	rotated := time.Now()
	startedAt := time.Now()
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		seeds := h.seedSet()
		listed := h.listedURLs()
		isListed := map[string]bool{}
		for _, u := range listed {
			isListed[u] = true
		}
		h.mu.Lock()
		start := func(u string) {
			pc, cancel := context.WithCancel(ctx)
			p := &PeerState{URL: u, Trusted: seeds[u], cancel: cancel}
			h.peers[u] = p
			go h.syncPeer(pc, p)
		}
		stop := func(u string) { h.peers[u].cancel(); delete(h.peers, u) }
		for u := range h.peers {
			if !seeds[u] && !isListed[u] {
				stop(u)
			}
		}
		if time.Since(rotated) > h.cfg.CheckEvery {
			rotated = time.Now()
			for u, p := range h.peers {
				if !p.Trusted {
					stop(u)
					break
				}
			}
		}
		for u := range seeds {
			if h.peers[u] == nil {
				start(u)
			}
		}
		for _, u := range listed {
			if len(h.peers) >= maxPeers {
				break
			}
			if h.peers[u] == nil {
				start(u)
			}
		}
		h.mu.Unlock()
		h.checkReady(time.Since(startedAt) > 10*time.Minute)
		h.compareFingerprints(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-h.kick:
		}
	}
}

// checkReady announces this host once it has caught up: every seed has sent what it has and, without seeds,
// at least one other host has. A host with nobody to copy from (the very first one) is ready at once.
func (h *Hosts) checkReady(force bool) {
	h.mu.Lock()
	seedsDone, anySynced, seeds := true, false, 0
	for _, p := range h.peers {
		if p.Trusted {
			seeds++
			if !p.Synced {
				seedsDone = false
			}
		}
		if p.Synced {
			anySynced = true
		}
	}
	alone := len(h.peers) == 0 && (h.cfg.Directory == "" || h.dirSeen == 0)
	h.mu.Unlock()
	if force || alone || (seeds > 0 && seedsDone) || (seeds == 0 && anySynced) {
		h.setReady()
	}
}

func (h *Hosts) compareFingerprints(ctx context.Context) {
	h.mu.Lock()
	var ps []*PeerState
	for _, p := range h.peers {
		ps = append(ps, p)
	}
	h.mu.Unlock()
	ours := h.store.Checkpoint()
	for _, p := range ps {
		cl := h.safe
		if p.Trusted {
			cl = h.open
		}
		c, cancel := context.WithTimeout(ctx, 10*time.Second)
		in, err := h.fetchInfo(c, cl, p.URL)
		cancel()
		h.mu.Lock()
		if err != nil {
			p.Same = 0
		} else {
			p.Name = in.Name
			p.Diff = in.Checkpoint.Count - ours.Count
			if in.Checkpoint.Hash == ours.Hash {
				p.Same = 1
			} else {
				p.Same = -1
			}
		}
		h.mu.Unlock()
	}
}

func (h *Hosts) Peers() []PeerState {
	h.mu.Lock()
	defer h.mu.Unlock()
	var out []PeerState
	for _, p := range h.peers {
		q := *p
		q.conn, q.cancel = nil, nil
		out = append(out, q)
	}
	return out
}

// syncPeer copies everything from one host, then keeps receiving new records. It also checks that the
// host lists us.
func (h *Hosts) syncPeer(ctx context.Context, p *PeerState) {
	wait := 5 * time.Second
	for ctx.Err() == nil {
		err := h.syncOnce(ctx, p)
		h.mu.Lock()
		p.Connected, p.conn = false, nil
		if err == errSelf {
			delete(h.peers, p.URL)
		}
		h.mu.Unlock()
		if err == errSelf {
			logf("%s is this host; not copying from it", p.URL)
			return
		}
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			logf("host %s unavailable (%v); retrying", p.URL, err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
		wait = min(wait*2, 2*time.Minute)
	}
}

func (h *Hosts) syncOnce(ctx context.Context, p *PeerState) error {
	cl := h.safe
	if p.Trusted {
		cl = h.open
	}
	dc, cancel := context.WithTimeout(ctx, 15*time.Second)
	ws, _, err := websocket.Dial(dc, p.URL, &websocket.DialOptions{HTTPClient: cl})
	cancel()
	if err != nil {
		return err
	}
	defer ws.CloseNow()
	ws.SetReadLimit(MaxEvent * 2)
	write := func(parts ...any) error {
		b, _ := json.Marshal(parts)
		wc, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		return ws.Write(wc, websocket.MessageText, b)
	}
	since := max(0, h.store.Cursor(p.URL)-120)
	// the party config and approvals first: they decide which of the other records are allowed
	if err := write("REQ", "sync-trust", map[string]any{"kinds": []int{KindDoc}, "#c": []string{"party", "reg", "stampkeys"}}); err != nil {
		return err
	}
	write("REQ", "mine", map[string]any{"kinds": []int{KindDoc}, "authors": []string{h.cfg.Key.Pub}, "#d": []string{"hosts/" + h.cfg.Key.Pub}})
	h.mu.Lock()
	p.Connected, p.conn = true, ws
	ann := h.myAnn
	h.mu.Unlock()
	if ann != nil {
		write("EVENT", ann)
	}
	logf("copying from %s", p.URL)
	var newest int64
	n := 0
	go func() { // keep the connection alive
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				pc, cancel := context.WithTimeout(ctx, 20*time.Second)
				err := ws.Ping(pc)
				cancel()
				if err != nil {
					ws.CloseNow()
					return
				}
			}
		}
	}()
	synced := false
	var retry []*Event // refused before the approvals that allow them arrived; tried again once caught up
	for {
		_, data, err := ws.Read(ctx)
		if err != nil {
			if synced && newest > 0 {
				h.store.SetCursor(p.URL, newest)
			}
			return err
		}
		var m []json.RawMessage
		if json.Unmarshal(data, &m) != nil || len(m) < 2 {
			continue
		}
		var t string
		json.Unmarshal(m[0], &t)
		switch t {
		case "AUTH":
			var ch string
			json.Unmarshal(m[1], &ch)
			if h.relay.OwnChallenge(ch) { // this address leads back to this very host
				h.mu.Lock()
				h.self[p.URL] = true
				h.mu.Unlock()
				return errSelf
			}
			write("AUTH", h.cfg.Key.Sign(KindAuth, [][]string{{"relay", p.URL}, {"challenge", ch}}, ""))
		case "EVENT":
			if len(m) < 3 {
				continue
			}
			var e Event
			if json.Unmarshal(m[2], &e) != nil {
				continue
			}
			if e.PubKey == h.cfg.Key.Pub && e.C() == "hosts" {
				h.mu.Lock()
				if h.myAnn != nil && e.ID == h.myAnn.ID {
					p.Listed = true
				}
				h.mu.Unlock()
				continue
			}
			if ok, why := h.relay.Accept(&e, "peer"); !ok && strings.HasPrefix(why, "blocked:") && !synced && len(retry) < 200000 {
				retry = append(retry, &e)
			}
			newest = max(newest, e.CreatedAt)
			if n++; synced && n%500 == 0 {
				h.store.SetCursor(p.URL, newest)
			}
		case "EOSE":
			var sid string
			json.Unmarshal(m[1], &sid)
			if sid == "sync-trust" {
				write("REQ", "sync", map[string]any{"kinds": []int{KindDoc}, "since": since})
			}
			if sid == "sync" && !synced {
				synced = true
				for len(retry) > 0 { // keep going while approvals unlock more records
					var left []*Event
					for _, e := range retry {
						if ok, _ := h.relay.Accept(e, "peer"); !ok {
							left = append(left, e)
						}
					}
					if len(left) == len(retry) {
						break
					}
					retry = left
				}
				retry = nil
				if newest > 0 {
					h.store.SetCursor(p.URL, newest)
				}
				h.store.Expire()
				h.mu.Lock()
				p.Synced = true
				h.mu.Unlock()
				logf("caught up with %s", p.URL)
				h.checkReady(false)
			}
		case "OK":
			// our announcement: true with "pending" while they check us; the record comes back on "mine" once listed
		}
	}
}
