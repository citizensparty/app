package main

// Settings: environment variables, then a .env file next to the program, then party-defaults.json next to it,
// then the defaults built into the program (tools/build.py sets the party's key and hosts at build time).
// A new host needs no settings at all.

import (
	"bufio"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Set at build time with -ldflags "-X main.defaultOwners=... -X main.defaultSeeds=...".
var (
	version          = "0.5.0"
	defaultOwners    = ""
	defaultSeeds     = ""
	defaultPartyURL  = "https://citizensparty.ca/app/party.json"
	defaultDirectory = "https://citizensparty.ca"
)

type Config struct {
	Port        int
	Bind        string
	DataDir     string
	DB          string
	Owners      map[string]bool
	Peers       []string // seed hosts to copy from, besides the ones in the party config
	RelayURL    string   // this host's public wss:// address; found by the tunnel when not set
	Name        string
	Key         *Key
	Tunnel      string // auto (a free Cloudflare quick tunnel), token (a named tunnel), off
	TunnelToken string
	Tor         string // auto (run Tor and announce a .onion address too), off
	PartyURL    string
	Directory   string // the site with /hosts.json and /api/hosts ("" = don't use it)
	AllowLocal  bool   // tests: let hosts on 127.0.0.1 announce themselves and be checked
	Status      bool   // draw the live status screen
	CheckEvery  time.Duration
}

func exeDir() string {
	if p, err := os.Executable(); err == nil {
		if r, err := filepath.EvalSymlinks(p); err == nil {
			p = r
		}
		return filepath.Dir(p)
	}
	return "."
}

func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		k, v, ok := strings.Cut(line, "=")
		k = strings.TrimSpace(k)
		if !ok || k == "" || strings.HasPrefix(k, "#") || os.Getenv(k) != "" {
			continue
		}
		os.Setenv(k, strings.Trim(strings.TrimSpace(v), `"'`))
	}
}

func env(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

func splitList(s string) []string {
	var out []string
	for _, x := range strings.Split(s, ",") {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	return out
}

func LoadConfig() *Config {
	dir := exeDir()
	loadDotEnv(filepath.Join(dir, ".env"))
	if wd, _ := os.Getwd(); wd != dir {
		loadDotEnv(filepath.Join(wd, ".env"))
	}
	var defs struct {
		Owners []string `json:"owners"`
		Peers  []string `json:"peers"`
	}
	if b, err := os.ReadFile(filepath.Join(dir, "party-defaults.json")); err == nil {
		json.Unmarshal(b, &defs)
	}
	c := &Config{Owners: map[string]bool{}}
	c.Port, _ = strconv.Atoi(env("PORT", "7447"))
	c.Bind = env("BIND", "127.0.0.1")
	c.DataDir = env("DATA_DIR", filepath.Join(dir, "data"))
	c.DB = env("DB_PATH", filepath.Join(c.DataDir, "citizens.db"))
	if os.Getenv("DATA_DIR") == "" && os.Getenv("DB_PATH") != "" {
		c.DataDir = filepath.Dir(c.DB)
	}
	owners := splitList(os.Getenv("OWNER_PUBKEYS"))
	if len(owners) == 0 {
		owners = defs.Owners
	}
	if len(owners) == 0 {
		owners = splitList(defaultOwners)
	}
	for _, o := range owners {
		c.Owners[strings.ToLower(o)] = true
	}
	c.Peers = splitList(os.Getenv("PEERS"))
	if len(c.Peers) == 0 {
		c.Peers = append(defs.Peers, splitList(defaultSeeds)...)
	}
	c.RelayURL = strings.TrimRight(env("RELAY_URL", ""), "/")
	c.Name = env("HOST_NAME", "Citizens Party host")
	c.TunnelToken = env("TUNNEL_TOKEN", "")
	c.Tunnel = strings.ToLower(env("TUNNEL", "auto"))
	if c.TunnelToken != "" {
		c.Tunnel = "token"
	} else if c.RelayURL != "" && c.Tunnel == "auto" {
		c.Tunnel = "off" // you have your own address (Caddy, your own tunnel...)
	}
	c.Tor = strings.ToLower(env("TOR", "auto"))
	c.PartyURL = env("PARTY_URL", defaultPartyURL)
	if c.PartyURL == "off" {
		c.PartyURL = ""
	}
	c.Directory = strings.TrimRight(env("DIRECTORY", defaultDirectory), "/")
	if c.Directory == "off" {
		c.Directory = ""
	}
	c.AllowLocal = os.Getenv("ALLOW_LOCAL_HOSTS") == "1"
	c.Status = os.Getenv("STATUS") != "off"
	c.CheckEvery = 30 * time.Minute
	if n, err := strconv.Atoi(os.Getenv("CHECK_EVERY")); err == nil && n > 0 {
		c.CheckEvery = time.Duration(n) * time.Second // tests
	}
	secret := env("HOST_SECRET", "")
	if secret == "" {
		secret = savedSecret(filepath.Join(c.DataDir, "host.key"))
	}
	k, err := NewKey(secret)
	if err != nil {
		log.Fatalf("HOST_SECRET: %v", err)
	}
	c.Key = k
	return c
}

// savedSecret reads this host's key from data/host.key, making one on the first run.
func savedSecret(path string) string {
	if b, err := os.ReadFile(path); err == nil && len(strings.TrimSpace(string(b))) == 64 {
		return strings.TrimSpace(string(b))
	}
	os.MkdirAll(filepath.Dir(path), 0o755)
	s := RandomSecret()
	if err := os.WriteFile(path, []byte(s+"\n"), 0o600); err != nil {
		log.Fatalf("can't save this host's key in %s: %v", path, err)
	}
	return s
}
