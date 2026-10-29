package main

// Putting the host online with Cloudflare's tunnel program (cloudflared), so no ports need opening and the
// home address stays private.
//   TUNNEL=auto (default): a free "quick tunnel", no Cloudflare account. The address changes on each restart;
//                          the host announces the new one by itself.
//   TUNNEL_TOKEN=...      : your own named tunnel, with a fixed address (set RELAY_URL to it).
//   TUNNEL=off            : no tunnel (you have your own address, or you're just trying it locally).
// cloudflared is found next to this program, in its data folder, or on the PATH; otherwise it's downloaded once.
// A tunnel can die quietly (a VPN switched on, the network changed, the computer slept): the host checks its own public
// address every few minutes, and when it fails 3 times in a row while the internet works, it restarts the tunnel.

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

// how often the host checks its own public address, and how many failures in a row restart the tunnel
var (
	watchEvery = 3 * time.Minute
	watchFails = 3
)

func init() {
	if n, err := time.ParseDuration(os.Getenv("TUNNEL_CHECK_EVERY")); err == nil && n > 0 { // tests only
		watchEvery = n
	}
}

var quickURL = regexp.MustCompile(`https://[a-z0-9-]+\.trycloudflare\.com`)

type Tunnel struct {
	cfg   *Config
	hosts *Hosts

	mu    sync.Mutex
	state string // shown on the status screen
	cmd   *exec.Cmd
}

func (t *Tunnel) State() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.state
}

func (t *Tunnel) set(s string) {
	t.mu.Lock()
	t.state = s
	t.mu.Unlock()
}

func cloudflaredName() string {
	if runtime.GOOS == "windows" {
		return "cloudflared.exe"
	}
	return "cloudflared"
}

func (t *Tunnel) find() string {
	for _, p := range []string{filepath.Join(exeDir(), cloudflaredName()), filepath.Join(t.cfg.DataDir, cloudflaredName())} {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	if p, err := exec.LookPath("cloudflared"); err == nil {
		return p
	}
	return ""
}

func (t *Tunnel) download(ctx context.Context) (string, error) {
	arch := runtime.GOARCH
	var asset string
	switch runtime.GOOS {
	case "windows":
		asset = "cloudflared-windows-" + arch + ".exe"
	case "linux":
		asset = "cloudflared-linux-" + arch
	default:
		return "", fmt.Errorf("install cloudflared yourself on %s", runtime.GOOS)
	}
	t.set("downloading Cloudflare's tunnel program (one time)…")
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://github.com/cloudflare/cloudflared/releases/latest/download/"+asset, nil)
	resp, err := (&http.Client{Timeout: 10 * time.Minute}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("download failed: %s", resp.Status)
	}
	dst := filepath.Join(t.cfg.DataDir, cloudflaredName())
	os.MkdirAll(t.cfg.DataDir, 0o755)
	f, err := os.CreateTemp(t.cfg.DataDir, "cloudflared-*")
	if err != nil {
		return "", err
	}
	_, err = io.Copy(f, resp.Body)
	f.Close()
	if err != nil {
		os.Remove(f.Name())
		return "", err
	}
	os.Chmod(f.Name(), 0o755)
	if err := os.Rename(f.Name(), dst); err != nil {
		return "", err
	}
	return dst, nil
}

func (t *Tunnel) Run(ctx context.Context) {
	switch t.cfg.Tunnel {
	case "off":
		if t.cfg.RelayURL != "" {
			t.set("your own address")
			t.hosts.SetURL(t.cfg.RelayURL)
		} else {
			t.set("off: only this computer can reach the host")
		}
		return
	case "token":
		if t.cfg.RelayURL == "" {
			t.set("set RELAY_URL to your tunnel's address (wss://…)")
		} else {
			t.hosts.SetURL(t.cfg.RelayURL)
		}
	}
	exe := t.find()
	if exe == "" {
		var err error
		if exe, err = t.download(ctx); err != nil {
			t.set("couldn't get Cloudflare's tunnel program: " + err.Error())
			logf("tunnel: %v", err)
			return
		}
	}
	wait := 5 * time.Second
	for ctx.Err() == nil {
		started := time.Now()
		t.runOnce(ctx, exe)
		if ctx.Err() != nil {
			return
		}
		if time.Since(started) > 5*time.Minute {
			wait = 5 * time.Second
		}
		t.set(fmt.Sprintf("tunnel stopped; restarting in %s", wait))
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
		wait = min(wait*2, 2*time.Minute)
	}
}

func (t *Tunnel) runOnce(ctx context.Context, exe string) {
	local := fmt.Sprintf("http://127.0.0.1:%d", t.cfg.Port)
	var args []string
	if t.cfg.Tunnel == "token" {
		args = []string{"tunnel", "--no-autoupdate", "run", "--token", t.cfg.TunnelToken}
	} else {
		args = []string{"tunnel", "--no-autoupdate", "--url", local}
	}
	cmd := exec.CommandContext(ctx, exe, args...)
	hideWindow(cmd)
	out, _ := cmd.StderrPipe()
	cmd.Stdout = cmd.Stderr
	logFile, _ := os.OpenFile(filepath.Join(t.cfg.DataDir, "tunnel.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if logFile != nil {
		defer logFile.Close()
	}
	if err := cmd.Start(); err != nil {
		t.set("couldn't start the tunnel: " + err.Error())
		return
	}
	t.mu.Lock()
	t.cmd = cmd
	t.mu.Unlock()
	t.set("starting the tunnel…")
	wctx, stopWatch := context.WithCancel(ctx)
	defer stopWatch()
	var addr string // the public address, once known
	var addrMu sync.Mutex
	if t.cfg.Tunnel == "token" && t.cfg.RelayURL != "" {
		addr = t.cfg.RelayURL
	}
	go t.watch(wctx, cmd, func() string { addrMu.Lock(); defer addrMu.Unlock(); return addr })
	sc := bufio.NewScanner(out)
	for sc.Scan() {
		line := sc.Text()
		if logFile != nil {
			fmt.Fprintln(logFile, line)
		}
		if t.cfg.Tunnel != "token" {
			if u := quickURL.FindString(line); u != "" {
				t.set("quick tunnel (the address changes when the host restarts)")
				addrMu.Lock()
				addr = "wss://" + u[len("https://"):]
				addrMu.Unlock()
				t.hosts.SetURL(addr)
			}
		} else if regexp.MustCompile(`Registered tunnel connection`).MatchString(line) {
			t.set("your Cloudflare tunnel")
		}
	}
	cmd.Wait()
}

// watch checks the host's own public address (its info page, which must show this host's key) and stops the tunnel
// after watchFails failures in a row, so Run starts a fresh one. Failures while the internet itself is down don't count.
func (t *Tunnel) watch(ctx context.Context, cmd *exec.Cmd, addr func() string) {
	cl := &http.Client{Timeout: 20 * time.Second}
	fails := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(watchEvery):
		}
		a := addr()
		if a == "" {
			continue
		}
		if t.reachable(ctx, cl, a) {
			fails = 0
			continue
		}
		if !online(ctx, cl) {
			continue
		}
		fails++
		logf("tunnel: this host's address didn't answer (%d of %d)", fails, watchFails)
		if fails >= watchFails {
			logf("tunnel: restarting it")
			t.set("the tunnel stopped answering; restarting it")
			if cmd.Process != nil {
				cmd.Process.Kill()
			}
			return
		}
	}
}

func (t *Tunnel) reachable(ctx context.Context, cl *http.Client, wss string) bool {
	u := "https://" + strings.TrimPrefix(strings.TrimPrefix(wss, "wss://"), "ws://")
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return false
	}
	req.Header.Set("Accept", "application/nostr+json")
	res, err := cl.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	var in struct {
		PubKey string `json:"pubkey"`
	}
	return res.StatusCode == 200 && json.NewDecoder(io.LimitReader(res.Body, 1<<16)).Decode(&in) == nil && in.PubKey == t.cfg.Key.Pub
}

// online: can this computer reach the internet at all? (If not, a dead address isn't the tunnel's fault.)
func online(ctx context.Context, cl *http.Client) bool {
	for _, u := range []string{"https://www.cloudflare.com/cdn-cgi/trace", "https://www.google.com/generate_204"} {
		req, _ := http.NewRequestWithContext(ctx, "HEAD", u, nil)
		if res, err := cl.Do(req); err == nil {
			res.Body.Close()
			return true
		}
	}
	return false
}

func (t *Tunnel) Stop() {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.cmd != nil && t.cmd.Process != nil {
		t.cmd.Process.Kill()
	}
}
