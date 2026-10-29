package main

// The store keeps the newest record per (author, path), like any NIP-33 relay, in SQLite.
// It also works out who the owners, registrars and members are, from the records themselves.

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const (
	MaxEvent       = 64 * 1024
	FutureSlack    = 600 // seconds
	DefaultCap     = 10000
	checkpointLife = 2 * time.Second // after a change, the fingerprint is worked out again at most this often
)

type HostRef struct {
	URL    string `json:"url"`
	PubKey string `json:"pubkey"`
	Name   string `json:"name"`
}

type Store struct {
	mu  sync.RWMutex // guards the trust state below; writes to the database also take it
	db  *sql.DB
	cfg *Config

	registrars map[string]bool
	members    map[string]bool
	seeds      []HostRef // the party's own hosts, from the signed party config
	memberCap  int
	hostCap    int
	cleared    bool // the records from before RecordStart have been removed

	ckMu    sync.Mutex
	ck      Checkpoint
	ckAt    time.Time
	ckDirty bool
}

type Checkpoint struct {
	Count int    `json:"count"`
	Hash  string `json:"hash"`
	At    int64  `json:"at"`
	Bytes int64  `json:"-"`
	Votes int64  `json:"-"` // votes sealed into the record's pages (chain/*)
}

func OpenStore(cfg *Config) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(cfg.DB), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(cfg.DB)+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(10000)&_pragma=synchronous(NORMAL)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	for _, q := range []string{
		"create table if not exists ev (id text primary key, pubkey text, created_at int, d text, c text, ms int, json text)",
		"create unique index if not exists ev_pd on ev(pubkey, d)",
		"create index if not exists ev_c on ev(c)",
		"create index if not exists ev_t on ev(created_at)",
		// what this host has seen of other hosts: used to rank them and drop the ones that fail
		"create table if not exists hoststat (pubkey text primary key, url text, first_ok int, last_ok int, last_check int, oks int, fails int, consec int, bad_until int)",
		"create table if not exists cursor (url text primary key, since int)",
	} {
		if _, err := db.Exec(q); err != nil {
			return nil, fmt.Errorf("database: %w", err)
		}
	}
	s := &Store{db: db, cfg: cfg}
	s.RefreshTrust()
	return s, nil
}

// ---- trust: owners (from settings), registrars and seed hosts (from the party config), members (from approvals) ----

func (s *Store) RefreshTrust() {
	regs, members := map[string]bool{}, map[string]bool{}
	var seeds []HostRef
	memberCap, hostCap := DefaultCap, DefaultCap
	if e := s.latestBy(s.cfg.Owners, "party/config"); e != nil {
		var p struct {
			Registrars []string  `json:"registrars"`
			Hosts      []HostRef `json:"hosts"`
			MemberCap  int       `json:"memberCap"`
			HostCap    int       `json:"hostCap"`
		}
		if json.Unmarshal([]byte(e.Content), &p) == nil {
			for _, r := range p.Registrars {
				regs[strings.ToLower(r)] = true
			}
			for _, h := range p.Hosts {
				h.PubKey = strings.ToLower(h.PubKey)
				seeds = append(seeds, h)
			}
			if p.MemberCap > 0 {
				memberCap = p.MemberCap
			}
			if p.HostCap > 0 {
				hostCap = p.HostCap
			}
		}
	}
	best := map[string]*Event{}
	rows, err := s.db.Query("select json from ev where c='reg'")
	if err == nil {
		for rows.Next() {
			var j string
			rows.Scan(&j)
			var e Event
			if json.Unmarshal([]byte(j), &e) != nil || !(s.cfg.Owners[e.PubKey] || regs[e.PubKey]) {
				continue
			}
			who := strings.TrimPrefix(e.D(), "reg/")
			if b := best[who]; b == nil || newer(&e, b) {
				ec := e
				best[who] = &ec
			}
		}
		rows.Close()
	}
	for who, e := range best {
		var c struct {
			OK bool `json:"ok"`
		}
		if json.Unmarshal([]byte(e.Content), &c) == nil && c.OK {
			members[who] = true
		}
	}
	s.mu.Lock()
	s.registrars, s.members, s.seeds, s.memberCap, s.hostCap = regs, members, seeds, memberCap, hostCap
	was := s.cleared
	s.cleared = true
	s.mu.Unlock()
	if !was {
		s.clear(RecordStart)
	}
}

// RecordStart is when the record begins: votes and proposals made before it (the first test phase, ended Oct 26, 2026)
// are removed and refused. It's fixed in the program: no key, not even the party's, can move it or clear the record.
// Members, approvals and voting stamps from before it stay.
const RecordStart int64 = 1793066261

// Protocol is the version of the record's rules. Every record is labeled with it (tag "p"); a later version starts a
// fresh record that this one ignores, and the other way around. Records from before the label (Oct 28, 2026) count as 1.
const Protocol = "1"

var clearedColls = []string{"items", "ballots", "turnout", "ends", "chain", "chainlock", "meetings"}

func (s *Store) clear(before int64) {
	q := "delete from ev where created_at < ? and c in ('" + strings.Join(clearedColls, "','") + "')"
	if r, err := s.db.Exec(q, before); err == nil {
		if n, _ := r.RowsAffected(); n > 0 {
			logf("the record starts %s: %d older test votes, proposals and related records removed", time.Unix(before, 0).Format("Jan 2 15:04"), n)
		}
	}
	s.Expire()
}

func (s *Store) latestBy(authors map[string]bool, d string) *Event {
	var best *Event
	for a := range authors {
		if e := s.Get(a, d); e != nil && (best == nil || newer(e, best)) {
			best = e
		}
	}
	return best
}

func (s *Store) Get(pubkey, d string) *Event {
	var j string
	if s.db.QueryRow("select json from ev where pubkey=? and d=?", pubkey, d).Scan(&j) != nil {
		return nil
	}
	var e Event
	if json.Unmarshal([]byte(j), &e) != nil {
		return nil
	}
	return &e
}

func (s *Store) IsRegistrar(pk string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.registrars[pk]
}

// Collection is every record held in collection c.
func (s *Store) Collection(c string) []*Event {
	var out []*Event
	rows, err := s.db.Query("select json from ev where c=?", c)
	if err != nil {
		return nil
	}
	defer rows.Close()
	for rows.Next() {
		var j string
		rows.Scan(&j)
		var e Event
		if json.Unmarshal([]byte(j), &e) == nil {
			out = append(out, &e)
		}
	}
	return out
}

// Has reports whether any record is held at path d.
func (s *Store) Has(d string) bool {
	var n int
	s.db.QueryRow("select count(*) from ev where d=?", d).Scan(&n)
	return n > 0
}

func (s *Store) IsMember(pk string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg.Owners[pk] || s.registrars[pk] || s.members[pk]
}

func (s *Store) MemberCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n := len(s.members)
	for o := range s.cfg.Owners {
		if !s.members[o] {
			n++
		}
	}
	return n
}

func (s *Store) Seeds() []HostRef {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]HostRef(nil), s.seeds...)
}

func (s *Store) HostCap() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.hostCap
}

// WriteError returns "" if the record may be stored, else a reason with a NIP-01 prefix (blocked:, invalid:).
// The record is public; these rules only decide who may write what.
func (s *Store) WriteError(e *Event) string {
	if e.Kind != KindDoc {
		return "blocked: this host only stores Citizens Party records"
	}
	d, c, pk := e.D(), e.C(), e.PubKey
	if d == "" || c == "" || !strings.HasPrefix(d, c+"/") {
		return "invalid: missing or mismatched d/c tags"
	}
	if p := e.Tag("p"); p != "" && p != Protocol {
		return "blocked: made for version " + p + " of the protocol (this host runs version " + Protocol + ")"
	}
	if e.CreatedAt > time.Now().Unix()+FutureSlack {
		return "invalid: created_at is in the future"
	}
	if e.CreatedAt < RecordStart && in(clearedColls, c) {
		return "blocked: made before the record starts"
	}
	s.mu.RLock()
	owner, registrar := s.cfg.Owners[pk], s.registrars[pk]
	member := owner || registrar || s.members[pk]
	nMembers, memberCap := len(s.members), s.memberCap
	who := strings.TrimPrefix(d, "reg/")
	already := s.members[who]
	s.mu.RUnlock()
	switch c {
	case "party":
		if !owner {
			return "blocked: only the party owner signs the party config"
		}
		return ""
	case "reg":
		if !owner && !registrar {
			return "blocked: only registrars approve members"
		}
		var v struct {
			OK bool `json:"ok"`
		}
		json.Unmarshal([]byte(e.Content), &v)
		if v.OK && !already && nMembers >= memberCap {
			return fmt.Sprintf("blocked: the party is full for now (%d members)", memberCap)
		}
		return ""
	case "join":
		if d != "join/"+pk {
			return "blocked: a join request must be your own"
		}
		return ""
	case "hosts":
		if d != "hosts/"+pk {
			return "blocked: a host can only announce itself"
		}
		return ""
	case "stampkeys": // a registrar's key for stamping voting keys, one per quarter
		if (!owner && !registrar) || !strings.HasPrefix(d, "stampkeys/"+pk+"_") {
			return "blocked: only a registrar publishes its own stamping key"
		}
		return ""
	case "stampok": // a registrar's blind signature on a member's sealed envelope
		if !owner && !registrar {
			return "blocked: only registrars stamp voting keys"
		}
		return ""
	// A voting key isn't a member key: it may write its own stamp, if the stamp checks out, and then its own ballots.
	case "stamps":
		if d != "stamps/"+pk {
			return "blocked: a voting key can only publish its own stamp"
		}
		if !s.stampValid(e) {
			return "blocked: this voting stamp doesn't check out (or its registrar's key hasn't arrived yet)"
		}
		return ""
	case "ballots":
		if !strings.HasPrefix(d, "ballots/"+pk+"_") {
			return "blocked: a ballot must be signed by its own voting key"
		}
		if s.earliest("stamps/"+pk) == nil {
			return "blocked: this voting key has no stamp yet"
		}
		return ""
	}
	if !member {
		return "blocked: your key hasn't been approved by a registrar yet"
	}
	if c == "config" {
		return "blocked: the vote rules are fixed in the programs, not settings"
	}
	// The party key signs the party config and approves members; it can never write another member's records,
	// and there are no test members (removed Oct 28, before launch).
	if (c == "members" || c == "turnout") && d != c+"/"+pk {
		return "blocked: you can only write your own record"
	}
	// a proposal (or a team meeting link) is filed under an id that starts with its author's key
	if (c == "items" || c == "meetings") && !strings.HasPrefix(d, c+"/"+pk[:16]+"-") {
		return "blocked: only its author can write a proposal"
	}
	if c == "stampreq" && !strings.HasPrefix(d, "stampreq/"+pk+"_") {
		return "blocked: you can only ask for your own stamp"
	}
	switch c {
	case "members", "turnout", "items", "meetings", "ends", "chain", "chainlock", "stampreq":
		return ""
	}
	return "blocked: this host doesn't store " + c + " records"
}


// firstWins: these paths are written once. A host keeps the first version it receives and never replaces it;
// apps pick the earliest. chain = pages of the vote record (checking each page's links and vote signatures on the
// hosts is the complete fix; see docs/strategy.md); items = proposals, which nobody can reword, not even the
// author; ends = a vote closed early or voided (apps check it); meetings = team meeting links.
func firstWins(d string) bool {
	for _, p := range []string{"chain/", "items/", "ends/", "meetings/", "stampkeys/", "stampreq/", "stampok/", "stamps/", "ballots/"} {
		if strings.HasPrefix(d, p) {
			return true
		}
	}
	return false
}

// Put stores e if it's newer than what we hold for (author, path). It reports whether it was stored.
func (s *Store) Put(e *Event) bool {
	d, c := e.D(), e.C()
	s.mu.Lock()
	if firstWins(d) {
		// a page of the record, once held, is never replaced: not by a newer version, not by a backdated one
		if s.earliest(d) != nil {
			s.mu.Unlock()
			return false
		}
	} else if cur := s.Get(e.PubKey, d); cur != nil && (cur.ID == e.ID || !newer(e, cur)) {
		s.mu.Unlock()
		return false
	}
	tx, err := s.db.Begin()
	if err == nil {
		if firstWins(d) {
			tx.Exec("delete from ev where d=?", d)
		}
		tx.Exec("delete from ev where pubkey=? and d=?", e.PubKey, d)
		_, err = tx.Exec("insert into ev values (?,?,?,?,?,?,?)", e.ID, e.PubKey, e.CreatedAt, d, c, e.Ms(), string(e.JSON()))
		if err == nil {
			err = tx.Commit()
		} else {
			tx.Rollback()
		}
	}
	s.mu.Unlock()
	if err != nil {
		return false
	}
	s.Expire()
	if c == "party" || c == "reg" {
		s.RefreshTrust()
	}
	return true
}

// earliest is the first version of path d held, by any author.
func (s *Store) earliest(d string) *Event {
	rows, err := s.db.Query("select json from ev where d=?", d)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var first *Event
	for rows.Next() {
		var j string
		rows.Scan(&j)
		var e Event
		if json.Unmarshal([]byte(j), &e) == nil && (first == nil || newer(first, &e)) {
			ec := e
			first = &ec
		}
	}
	return first
}

func (s *Store) Delete(pubkey, d string) {
	s.mu.Lock()
	s.db.Exec("delete from ev where pubkey=? and d=?", pubkey, d)
	s.mu.Unlock()
	s.Expire()
}

// ---- queries ----

type Filter struct {
	IDs     []string `json:"ids"`
	Authors []string `json:"authors"`
	Kinds   []int    `json:"kinds"`
	Since   *int64   `json:"since"`
	Until   *int64   `json:"until"`
	Limit   *int     `json:"limit"`
	C       []string `json:"#c"`
	D       []string `json:"#d"`
}

func in(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func (f *Filter) Match(e *Event) bool {
	if len(f.IDs) > 0 && !in(f.IDs, e.ID) {
		return false
	}
	if len(f.Authors) > 0 && !in(f.Authors, e.PubKey) {
		return false
	}
	if len(f.Kinds) > 0 {
		ok := false
		for _, k := range f.Kinds {
			ok = ok || k == e.Kind
		}
		if !ok {
			return false
		}
	}
	if len(f.C) > 0 && !in(f.C, e.C()) {
		return false
	}
	if len(f.D) > 0 && !in(f.D, e.D()) {
		return false
	}
	if f.Since != nil && e.CreatedAt < *f.Since {
		return false
	}
	if f.Until != nil && e.CreatedAt > *f.Until {
		return false
	}
	return true
}

// Query streams matching records, newest first, to fn (which returns false to stop).
func (s *Store) Query(f *Filter, fn func(raw string) bool) error {
	if len(f.Kinds) > 0 {
		ok := false
		for _, k := range f.Kinds {
			ok = ok || k == KindDoc
		}
		if !ok {
			return nil
		}
	}
	var where []string
	var args []any
	list := func(col string, vals []string) {
		if len(vals) == 0 {
			return
		}
		if len(vals) > 1000 {
			vals = vals[:1000]
		}
		where = append(where, col+" in ("+strings.TrimSuffix(strings.Repeat("?,", len(vals)), ",")+")")
		for _, v := range vals {
			args = append(args, v)
		}
	}
	list("id", f.IDs)
	list("pubkey", f.Authors)
	list("c", f.C)
	list("d", f.D)
	if f.Since != nil {
		where = append(where, "created_at >= ?")
		args = append(args, *f.Since)
	}
	if f.Until != nil {
		where = append(where, "created_at <= ?")
		args = append(args, *f.Until)
	}
	q := "select json from ev"
	if len(where) > 0 {
		q += " where " + strings.Join(where, " and ")
	}
	q += " order by created_at desc"
	if f.Limit != nil {
		q += fmt.Sprintf(" limit %d", max(0, *f.Limit))
	}
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var j string
		if rows.Scan(&j) == nil && !fn(j) {
			break
		}
	}
	return rows.Err()
}

// SampleIDs picks up to n random record ids older than minAge, to check that another host really holds the record.
func (s *Store) SampleIDs(n int, minAge time.Duration) []string {
	var out []string
	rows, err := s.db.Query("select id from ev where created_at < ? and c <> 'hosts' order by random() limit ?", time.Now().Add(-minAge).Unix(), n)
	if err != nil {
		return nil
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		rows.Scan(&id)
		out = append(out, id)
	}
	return out
}

// Checkpoint is a fingerprint of everything held: the count and SHA-256 over the sorted ids. Cached briefly.
func (s *Store) Checkpoint() Checkpoint {
	s.ckMu.Lock()
	defer s.ckMu.Unlock()
	if !s.ckAt.IsZero() && (!s.ckDirty || time.Since(s.ckAt) < checkpointLife) {
		return s.ck
	}
	s.ckDirty = false
	h := sha256.New()
	n := 0
	rows, err := s.db.Query("select id from ev order by id")
	if err == nil {
		for rows.Next() {
			var id string
			rows.Scan(&id)
			h.Write([]byte(id))
			n++
		}
		rows.Close()
	}
	var size int64
	s.db.QueryRow("select coalesce(sum(length(json)),0) from ev").Scan(&size)
	var votes int64
	// one page per path: the first version, as the app and Put keep
	if rows, err := s.db.Query("select d, json from ev where c='chain' order by d, created_at asc, ms asc, id asc"); err == nil {
		last := ""
		for rows.Next() {
			var d, j string
			rows.Scan(&d, &j)
			if d == last {
				continue
			}
			last = d
			var e Event
			var blk struct {
				Votes []json.RawMessage `json:"votes"`
			}
			if json.Unmarshal([]byte(j), &e) == nil && json.Unmarshal([]byte(e.Content), &blk) == nil {
				votes += int64(len(blk.Votes))
			}
		}
		rows.Close()
	}
	s.ck = Checkpoint{Count: n, Hash: hex.EncodeToString(h.Sum(nil)), At: time.Now().Unix(), Bytes: size, Votes: votes}
	s.ckAt = time.Now()
	return s.ck
}

// Expire marks the fingerprint as out of date (after any change to the record).
func (s *Store) Expire() {
	s.ckMu.Lock()
	s.ckDirty = true
	s.ckMu.Unlock()
}

func (s *Store) Count(c string) int {
	var n int
	s.db.QueryRow("select count(*) from ev where c=?", c).Scan(&n)
	return n
}

func (s *Store) Cursor(url string) int64 {
	var n int64
	s.db.QueryRow("select since from cursor where url=?", url).Scan(&n)
	return n
}

func (s *Store) SetCursor(url string, since int64) {
	s.db.Exec("insert into cursor values (?,?) on conflict(url) do update set since=excluded.since", url, since)
}
