//go:build registrar

// Citizens Party registrar: a separate program from the host, for the party's own computers only (not on the
// website). Build it with: go build -tags registrar -o citizens-registrar .   (tools/build.py makes dist/registrar/)
//
// It has its own registrar key (data/registrar.key), never the party key, and does nothing until the party owner
// lists that key (python3 tools/party.py add-registrar <key>, sign, deploy). Once listed it:
//   - approves join requests (reg/<member>), during the beta for everyone (AUTO_APPROVE=off turns this off);
//     after launch it will approve only people who passed the ID check;
//   - publishes its stamping key for each quarter (stampkeys/<registrar>_<quarter>), and
//   - blind-signs members' sealed envelopes (stampok/<member>_<quarter>), one per member per quarter, for the
//     grid they're in. The signature can't be linked to the voting key it ends up on (see stamps.go).
//
// It doesn't listen for anything: it connects out to hosts like a member's app does, so it needs no public
// address, no tunnel and no open port. It checks every record itself before believing it.
// Everything it signs is public, so a bad approval shows; the owner removes a registrar from the list to stop it.
//
// Settings (environment or a .env file next to the program):
//   HOSTS=wss://a,wss://b   the hosts to use (default: the party's hosts and the directory at citizensparty.ca)
//   AUTO_APPROVE=off        stop approving everyone (beta)
//   DATA_DIR                where registrar.key, stampkeys.json and registrar.db live (default: data/ next to it)
//   REGISTRAR_SECRET        the key itself, instead of data/registrar.key (tests)
// Moving from a 0.3 host that was a registrar: put this program next to the host program, so it finds the same
// data/registrar.key and data/stampkeys.json. Nothing else to do; the party list doesn't change.

package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/coder/websocket"
	"golang.org/x/term"
)

const regWant = 5 // hosts connected at a time

type stampSecret struct{ P, Q, N *big.Int }

type regConn struct {
	url   string
	ws    *websocket.Conn
	ready bool            // has sent everything it had
	seen  map[string]bool // ids it has sent us or taken from us
}

type Registrar struct {
	cfg         *Config
	store       *Store
	key         *Key
	autoApprove bool
	fixedHosts  []string

	mu       sync.Mutex
	conns    map[string]*regConn
	keys     map[string]*stampSecret // quarter -> stamping key
	approved int
	stamped  int
	listed   bool
	warned   map[string]bool
	kick     chan struct{}
}

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Println("citizens-registrar", version)
		return
	}
	dir := exeDir()
	loadDotEnv(filepath.Join(dir, ".env"))
	cfg := &Config{Owners: map[string]bool{}, Bind: "127.0.0.1"}
	cfg.DataDir = env("DATA_DIR", filepath.Join(dir, "data"))
	cfg.DB = filepath.Join(cfg.DataDir, "registrar.db")
	os.MkdirAll(cfg.DataDir, 0o755)
	owners := splitList(os.Getenv("OWNER_PUBKEYS"))
	if len(owners) == 0 {
		owners = splitList(defaultOwners)
	}
	for _, o := range owners {
		cfg.Owners[strings.ToLower(o)] = true
	}
	cfg.Peers = splitList(defaultSeeds)
	cfg.PartyURL = env("PARTY_URL", defaultPartyURL)
	cfg.Directory = strings.TrimRight(env("DIRECTORY", defaultDirectory), "/")
	for _, v := range []*string{&cfg.PartyURL, &cfg.Directory} {
		if *v == "off" {
			*v = ""
		}
	}
	if f, err := os.OpenFile(filepath.Join(cfg.DataDir, "registrar.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); err == nil {
		log.SetOutput(io.MultiWriter(os.Stdout, f))
	}
	log.SetFlags(log.LstdFlags)
	if len(cfg.Owners) == 0 {
		regFatal("No party key built in. Build it with tools/build.py, or set OWNER_PUBKEYS.")
	}
	secret := os.Getenv("REGISTRAR_SECRET")
	if secret == "" {
		secret = savedSecret(filepath.Join(cfg.DataDir, "registrar.key"))
	}
	k, err := NewKey(secret)
	if err != nil {
		regFatal("registrar key: " + err.Error())
	}
	cfg.Key = k
	st, err := OpenStore(cfg)
	if err != nil {
		regFatal(fmt.Sprintf("Can't open %s: %v", cfg.DB, err))
	}
	g := &Registrar{cfg: cfg, store: st, key: k, autoApprove: strings.ToLower(env("AUTO_APPROVE", "on")) != "off",
		fixedHosts: splitList(os.Getenv("HOSTS")), conns: map[string]*regConn{}, keys: map[string]*stampSecret{},
		warned: map[string]bool{}, kick: make(chan struct{}, 1)}
	fmt.Println("\n Citizens Party registrar " + version)
	fmt.Println(" Registrar key  " + k.Pub)
	fmt.Println(" The party lists it with:  python3 tools/party.py add-registrar " + k.Pub)
	if term.IsTerminal(int(os.Stdout.Fd())) {
		fmt.Println(" Leave this window open. Close it to stop.")
	}
	fmt.Println()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go g.fetchParty(ctx)
	go g.connector(ctx)
	g.Run(ctx)
}

func regFatal(m string) {
	fmt.Fprintln(os.Stderr, "\n "+m)
	pauseIfDoubleClicked()
	os.Exit(1)
}

// accept checks a record the same way a host does, then keeps it.
func (g *Registrar) accept(e *Event) (bool, string) {
	if len(e.Content) > MaxEvent {
		return false, "invalid: too large"
	}
	if !e.Valid() {
		return false, "invalid: bad signature"
	}
	if msg := g.store.WriteError(e); msg != "" {
		return false, msg
	}
	g.store.Put(e)
	return true, ""
}

// fetchParty reads the signed party config from the website (hourly), like a host does.
func (g *Registrar) fetchParty(ctx context.Context) {
	if g.cfg.PartyURL == "" {
		return
	}
	for ctx.Err() == nil {
		req, _ := http.NewRequestWithContext(ctx, "GET", g.cfg.PartyURL, nil)
		if resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req); err == nil {
			var e Event
			if json.NewDecoder(io.LimitReader(resp.Body, MaxEvent)).Decode(&e) == nil && e.ID != "" {
				g.accept(&e)
			}
			resp.Body.Close()
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Hour):
		}
	}
}

// candidates: HOSTS if set, else the party's hosts and the directory's.
func (g *Registrar) candidates(ctx context.Context) []string {
	if len(g.fixedHosts) > 0 {
		return g.fixedHosts
	}
	seen := map[string]bool{}
	var out []string
	add := func(u string) {
		u = strings.TrimRight(strings.TrimSpace(u), "/")
		if (strings.HasPrefix(u, "wss://") || strings.HasPrefix(u, "ws://")) && !seen[u] {
			seen[u] = true
			out = append(out, u)
		}
	}
	for _, h := range g.store.Seeds() {
		add(h.URL)
	}
	for _, u := range g.cfg.Peers {
		add(u)
	}
	if g.cfg.Directory != "" {
		c, cancel := context.WithTimeout(ctx, 20*time.Second)
		req, _ := http.NewRequestWithContext(c, "GET", g.cfg.Directory+"/hosts.json", nil)
		if resp, err := http.DefaultClient.Do(req); err == nil {
			var d struct {
				Hosts []struct {
					URL string `json:"url"`
				} `json:"hosts"`
			}
			json.NewDecoder(io.LimitReader(resp.Body, 32<<20)).Decode(&d)
			resp.Body.Close()
			for _, h := range d.Hosts {
				add(h.URL)
			}
		}
		cancel()
	}
	return out
}

// connector keeps up to regWant hosts connected.
func (g *Registrar) connector(ctx context.Context) {
	tries := map[string]time.Time{}
	for ctx.Err() == nil {
		for _, u := range g.candidates(ctx) {
			g.mu.Lock()
			n, have := len(g.conns), g.conns[u] != nil
			g.mu.Unlock()
			if n >= regWant {
				break
			}
			if have || time.Since(tries[u]) < time.Minute {
				continue
			}
			tries[u] = time.Now()
			go g.serve(ctx, u)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(30 * time.Second):
		}
	}
}

func (g *Registrar) serve(ctx context.Context, u string) {
	dc, cancel := context.WithTimeout(ctx, 15*time.Second)
	ws, _, err := websocket.Dial(dc, u, nil)
	cancel()
	if err != nil {
		logf("can't reach %s (%v)", u, err)
		return
	}
	ws.SetReadLimit(MaxEvent * 2)
	c := &regConn{url: u, ws: ws, seen: map[string]bool{}}
	g.mu.Lock()
	if g.conns[u] != nil {
		g.mu.Unlock()
		ws.CloseNow()
		return
	}
	g.conns[u] = c
	g.mu.Unlock()
	defer func() {
		g.mu.Lock()
		delete(g.conns, u)
		g.mu.Unlock()
		ws.CloseNow()
		logf("lost %s", u)
	}()
	g.send(c, "REQ", "trust", map[string]any{"kinds": []int{KindDoc}, "#c": []string{"party", "reg", "stampkeys"}})
	logf("connected to %s", u)
	go func() {
		for ctx.Err() == nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(30 * time.Second):
			}
			pc, cancel := context.WithTimeout(ctx, 20*time.Second)
			err := ws.Ping(pc)
			cancel()
			if err != nil {
				ws.CloseNow()
				return
			}
		}
	}()
	var retry []*Event // refused before the approval that allows them arrived
	for {
		_, data, err := ws.Read(ctx)
		if err != nil {
			return
		}
		var m []json.RawMessage
		if json.Unmarshal(data, &m) != nil || len(m) < 2 {
			continue
		}
		var t, sid string
		json.Unmarshal(m[0], &t)
		switch t {
		case "EVENT":
			var e Event
			if len(m) < 3 || json.Unmarshal(m[2], &e) != nil {
				continue
			}
			g.mu.Lock()
			c.seen[e.ID] = true
			g.mu.Unlock()
			if ok, why := g.accept(&e); !ok && strings.HasPrefix(why, "blocked:") && len(retry) < 200000 {
				retry = append(retry, &e)
			} else if ok && c.ready {
				g.poke()
			}
		case "EOSE":
			json.Unmarshal(m[1], &sid)
			if sid == "trust" {
				g.send(c, "REQ", "work", map[string]any{"kinds": []int{KindDoc}, "#c": []string{"join", "members", "stampreq", "stampok"}})
			}
			if sid == "work" && !c.ready {
				for _, e := range retry {
					g.accept(e)
				}
				retry = nil
				g.mu.Lock()
				c.ready = true
				g.mu.Unlock()
				g.resend(c)
				g.poke()
			}
		}
	}
}

func (g *Registrar) send(c *regConn, parts ...any) error {
	b, _ := json.Marshal(parts)
	wc, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return c.ws.Write(wc, websocket.MessageText, b)
}

// resend gives a host everything this registrar signed that it hasn't sent us (it may have lost them).
func (g *Registrar) resend(c *regConn) {
	g.store.Query(&Filter{Authors: []string{g.key.Pub}}, func(raw string) bool {
		var e Event
		if json.Unmarshal([]byte(raw), &e) != nil {
			return true
		}
		g.mu.Lock()
		had := c.seen[e.ID]
		g.mu.Unlock()
		if !had {
			if g.send(c, "EVENT", &e) != nil {
				return false
			}
			time.Sleep(40 * time.Millisecond) // hosts allow 30 records a second per connection
		}
		return true
	})
}

func (g *Registrar) poke() {
	select {
	case g.kick <- struct{}{}:
	default:
	}
}

func (g *Registrar) readyHosts() []*regConn {
	g.mu.Lock()
	defer g.mu.Unlock()
	var out []*regConn
	for _, c := range g.conns {
		if c.ready {
			out = append(out, c)
		}
	}
	return out
}

func (g *Registrar) state() string {
	g.mu.Lock()
	defer g.mu.Unlock()
	n := 0
	for _, c := range g.conns {
		if c.ready {
			n++
		}
	}
	if !g.listed {
		return fmt.Sprintf("%d hosts · not on the party's list yet", n)
	}
	return fmt.Sprintf("%d hosts · on · %d approved · %d stamped since it started", n, g.approved, g.stamped)
}

func (g *Registrar) Run(ctx context.Context) {
	last, lastAt := "", time.Time{}
	for ctx.Err() == nil {
		if len(g.readyHosts()) > 0 {
			g.tick()
		}
		if s := g.state(); s != last || time.Since(lastAt) > 30*time.Minute {
			logf("%s", s)
			last, lastAt = s, time.Now()
		}
		select {
		case <-ctx.Done():
			return
		case <-g.kick:
			time.Sleep(time.Second) // let a burst of records arrive
		case <-time.After(15 * time.Second):
		}
	}
}

// quarters: 2026Q4. A stamp works for votes opened in its quarter; the next quarter's comes in the last 14 days.
func periodOf(t time.Time) string {
	t = t.UTC()
	return strconv.Itoa(t.Year()) + "Q" + strconv.Itoa((int(t.Month())-1)/3+1)
}

func periodStart(p string) time.Time {
	y, _ := strconv.Atoi(p[:4])
	q, _ := strconv.Atoi(p[5:])
	return time.Date(y, time.Month((q-1)*3+1), 1, 0, 0, 0, 0, time.UTC)
}

func wantedPeriods(now time.Time) []string {
	p := periodOf(now)
	next := periodOf(periodStart(p).AddDate(0, 3, 0))
	if periodStart(next).Sub(now) < 14*24*time.Hour {
		return []string{p, next}
	}
	return []string{p}
}

// publish signs a record, keeps it, and sends it to every connected host.
func (g *Registrar) publish(d string, v any) bool {
	b, _ := json.Marshal(v)
	c := d[:strings.Index(d, "/")]
	e := g.key.Sign(KindDoc, [][]string{{"d", d}, {"c", c}, {"p", Protocol}, {"ms", strconv.Itoa(time.Now().Nanosecond() / 1e6)}}, string(b))
	if ok, why := g.accept(e); !ok {
		logf("%s: %s", d, why)
		return false
	}
	for _, h := range g.readyHosts() {
		if g.send(h, "EVENT", e) == nil {
			g.mu.Lock()
			h.seen[e.ID] = true
			g.mu.Unlock()
		}
	}
	return true
}

func (g *Registrar) warn(k, m string) {
	g.mu.Lock()
	w := g.warned[k]
	g.warned[k] = true
	g.mu.Unlock()
	if !w {
		logf("%s", m)
	}
}

func (g *Registrar) tick() {
	me := g.key.Pub
	listed := g.store.IsRegistrar(me)
	g.mu.Lock()
	g.listed = listed
	g.mu.Unlock()
	if !listed {
		return
	}
	periods := wantedPeriods(time.Now())
	usable := map[string]bool{}
	for _, p := range periods {
		pub := g.store.earliest("stampkeys/" + me + "_" + p)
		k := g.stampKey(p, pub == nil)
		switch {
		case k == nil && pub != nil:
			g.warn("nokey"+p, "can't stamp for "+p+": this registrar's stamping key for it isn't in "+filepath.Join(g.cfg.DataDir, "stampkeys.json")+" (copy that file from the computer that made it)")
		case k == nil:
		case pub == nil:
			usable[p] = g.publish("stampkeys/"+me+"_"+p, map[string]string{"n": k.N.Text(16), "period": p})
		default:
			var kd struct {
				N string `json:"n"`
			}
			json.Unmarshal([]byte(pub.Content), &kd)
			if kd.N == k.N.Text(16) {
				usable[p] = true
			} else {
				g.warn("diff"+p, "can't stamp for "+p+": the stamping key in the record isn't the one in stampkeys.json")
			}
		}
	}
	if g.autoApprove {
		for _, e := range g.store.Collection("join") {
			pk := strings.TrimPrefix(e.D(), "join/")
			if pk != e.PubKey || g.store.IsMember(pk) || g.store.Has("reg/"+pk) {
				continue // already in, or a registrar has decided already
			}
			var j struct {
				Cell string `json:"cell"`
				Del  int    `json:"_del"`
			}
			if json.Unmarshal([]byte(e.Content), &j) != nil || j.Del != 0 || j.Cell == "" {
				continue
			}
			if g.publish("reg/"+pk, map[string]any{"ok": true, "cell": j.Cell, "at": time.Now().UnixMilli(), "auto": true}) {
				g.mu.Lock()
				g.approved++
				g.mu.Unlock()
				logf("approved a new member in grid %s", j.Cell)
			}
		}
	}
	for _, e := range g.store.Collection("stampreq") {
		rest := strings.TrimPrefix(e.D(), "stampreq/")
		i := strings.Index(rest, "_")
		if i < 0 {
			continue
		}
		pk, p := rest[:i], rest[i+1:]
		if pk != e.PubKey || !usable[p] || g.store.earliest("stampok/"+pk+"_"+p) != nil || !g.store.IsMember(pk) {
			continue
		}
		var r struct {
			Reg  string `json:"reg"`
			Grid string `json:"grid"`
			B    string `json:"b"`
		}
		if json.Unmarshal([]byte(e.Content), &r) != nil || r.Reg != me || r.Grid == "" {
			continue
		}
		// one stamp per member per quarter. Not tied to their grid (Oct 28): new requests say "BC", and a move doesn't
		// cost anyone their vote; each ballot names the voter's grid, which apps check
		if g.store.Get(pk, "members/"+pk) == nil {
			continue
		}
		k := g.stampKey(p, false)
		b, ok := new(big.Int).SetString(r.B, 16)
		if k == nil || !ok || b.Sign() <= 0 || b.Cmp(k.N) >= 0 {
			continue
		}
		sig := blindSign(k, r.Grid, b)
		if sig == nil {
			continue
		}
		if g.publish("stampok/"+pk+"_"+p, map[string]string{"sig": sig.Text(16)}) {
			g.mu.Lock()
			g.stamped++
			g.mu.Unlock()
		}
	}
}

// stampKey is this registrar's RSA key for a quarter: two random 1024-bit primes, kept in data/stampkeys.json
// (they must stay secret: they make stamps). make: create one if there's none (only before one is published).
func (g *Registrar) stampKey(p string, make bool) *stampSecret {
	g.mu.Lock()
	defer g.mu.Unlock()
	if k := g.keys[p]; k != nil {
		return k
	}
	path := filepath.Join(g.cfg.DataDir, "stampkeys.json")
	saved := map[string]map[string]string{}
	if b, err := os.ReadFile(path); err == nil {
		json.Unmarshal(b, &saved)
	}
	if s := saved[p]; s != nil {
		P, ok1 := new(big.Int).SetString(s["p"], 16)
		Q, ok2 := new(big.Int).SetString(s["q"], 16)
		if ok1 && ok2 {
			k := &stampSecret{P: P, Q: Q, N: new(big.Int).Mul(P, Q)}
			g.keys[p] = k
			return k
		}
	}
	if !make {
		return nil
	}
	P, err1 := rand.Prime(rand.Reader, 1024)
	Q, err2 := rand.Prime(rand.Reader, 1024)
	if err1 != nil || err2 != nil || P.Cmp(Q) == 0 {
		return nil
	}
	saved[p] = map[string]string{"p": P.Text(16), "q": Q.Text(16)}
	b, _ := json.Marshal(saved)
	if os.WriteFile(path, b, 0o600) != nil {
		return nil
	}
	k := &stampSecret{P: P, Q: Q, N: new(big.Int).Mul(P, Q)}
	g.keys[p] = k
	return k
}

// blindSign: m^d mod n, where d inverts the grid's exponent. The registrar never sees what it signs.
func blindSign(k *stampSecret, grid string, m *big.Int) *big.Int {
	e := gridExp(grid)
	one := big.NewInt(1)
	p1, q1 := new(big.Int).Sub(k.P, one), new(big.Int).Sub(k.Q, one)
	gc := new(big.Int).GCD(nil, nil, p1, q1)
	lam := new(big.Int).Div(new(big.Int).Mul(p1, q1), gc)
	d := new(big.Int).ModInverse(e, lam)
	if d == nil {
		return nil
	}
	return new(big.Int).Exp(m, d, k.N)
}

