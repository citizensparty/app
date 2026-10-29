package main

// The live status screen, redrawn every two seconds while the host runs in a terminal window.
// Log lines go to data/host.log; the last few are shown at the bottom of the screen.

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type ring struct {
	mu    sync.Mutex
	lines []string
	file  io.Writer
}

func (r *ring) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.file != nil {
		r.file.Write(p)
	}
	for _, l := range strings.Split(strings.TrimRight(string(p), "\n"), "\n") {
		r.lines = append(r.lines, l)
	}
	if len(r.lines) > 5 {
		r.lines = r.lines[len(r.lines)-5:]
	}
	return len(p), nil
}

func (r *ring) last() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.lines...)
}

func human(n int64) string {
	u := []string{"bytes", "KB", "MB", "GB", "TB"}
	f, i := float64(n), 0
	for f >= 1000 && i < len(u)-1 {
		f /= 1000
		i++
	}
	if i == 0 {
		return fmt.Sprintf("%d bytes", n)
	}
	if f < 10 {
		return fmt.Sprintf("%.1f %s", f, u[i])
	}
	return fmt.Sprintf("%.0f %s", f, u[i])
}

func commas(n int64) string {
	s := fmt.Sprint(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

func since(t time.Time) string {
	d := time.Since(t).Round(time.Minute)
	h, m := int(d.Hours()), int(d.Minutes())%60
	if h >= 24 {
		return fmt.Sprintf("%dd %dh", h/24, h%24)
	}
	return fmt.Sprintf("%dh %02dm", h, m)
}

func short(k string) string {
	if len(k) < 16 {
		return k
	}
	return k[:8] + "…" + k[len(k)-8:]
}

// screen redraws the status every two seconds (when the host runs in a terminal window).
func screen(r *Relay, h *Hosts, t *Tunnel, o *Onion, logs *ring, started time.Time) {
	for {
		os.Stdout.WriteString("\x1b[H\x1b[2J" + render(r, h, t, o, logs, started, true))
		time.Sleep(2 * time.Second)
	}
}

// render draws the status screen as text. The status command gets the same text from a running host.
func render(r *Relay, h *Hosts, t *Tunnel, o *Onion, logs *ring, started time.Time, window bool) string {
	const line = " ──────────────────────────────────────────────────────────────"
	{
		ck := r.store.Checkpoint()
		peers := h.Peers()
		connected, listed, same := 0, 0, 0
		for _, p := range peers {
			if p.Connected {
				connected++
			}
			if p.Listed {
				listed++
			}
			if p.Same == 1 {
				same++
			}
		}
		addr := h.URL()
		if addr == "" {
			addr = "not online yet"
		}
		listedLine := "waiting until this host has caught up"
		h.mu.Lock()
		ready := h.ready
		h.mu.Unlock()
		if ready && h.URL() != "" {
			switch {
			case len(peers) == 0:
				listedLine = "no other hosts yet: this is the first one"
			case listed == 0:
				listedLine = "being checked by the other hosts…"
			default:
				listedLine = fmt.Sprintf("listed by %d of %d hosts it copies from", listed, len(peers))
			}
		}
		fp := "no other hosts to compare with"
		if len(peers) > 0 {
			fp = fmt.Sprintf("same as %d of %d hosts", same, len(peers))
			if same < len(peers) {
				for _, p := range peers {
					if p.Same == -1 && p.Diff != 0 {
						fp += fmt.Sprintf(" (catching up: %+d records)", p.Diff)
						break
					}
				}
			}
		}
		var b strings.Builder
		fmt.Fprintf(&b, " Citizens Party host %-24s up %s\n", version, since(started))
		fmt.Fprintf(&b, " Address     %s\n", addr)
		fmt.Fprintf(&b, " Tunnel      %s\n", t.State())
		if o != nil {
			fmt.Fprintf(&b, " Tor         %s\n", o.State())
		}
		fmt.Fprintf(&b, " Public key  %s\n", short(r.cfg.Key.Pub))
		fmt.Fprintf(&b, " Status      %s\n", listedLine)
		if r.cfg.Directory != "" {
			d := h.DirState()
			switch d {
			case "":
				d = "not registered yet"
			case "listed":
				d = "listed"
			}
			fmt.Fprintf(&b, " Directory   %s: %s\n", strings.TrimPrefix(strings.TrimPrefix(r.cfg.Directory, "https://"), "http://"), d)
		}
		b.WriteString(line + "\n")
		fmt.Fprintf(&b, " Members connected now   %8s\n", commas(int64(r.Online())))
		fmt.Fprintf(&b, " Members in the party    %8s\n", commas(int64(r.store.MemberCount())))
		fmt.Fprintf(&b, " Hosts                   %8d copying with this one · %s in the network\n", connected+r.PeersIn(), commas(int64(h.Listed())))
		fmt.Fprintf(&b, " Records held            %8s   %s\n", commas(int64(ck.Count)), human(ck.Bytes))
		fmt.Fprintf(&b, " Votes on the record     %8s\n", commas(ck.Votes))
		fmt.Fprintf(&b, " Fingerprint             %s\n", fp)
		fmt.Fprintf(&b, " Served today            %s requests · %s\n", commas(r.statRequests.Load()), human(r.statBytes.Load()))
		b.WriteString(line + "\n")
		for _, l := range logs.last() {
			if len(l) > 100 {
				l = l[:100]
			}
			b.WriteString(" " + l + "\n")
		}
		if window {
			b.WriteString("\n Close this window or press Ctrl+C to stop.\n")
		}
		return b.String()
	}
}

// serveStatus answers /status with the status screen, only to this computer itself. Requests through the
// tunnel also come from 127.0.0.1, but cloudflared marks them with Cf-Connecting-IP.
func serveStatus(w http.ResponseWriter, req *http.Request, text func() string) bool {
	if req.URL.Path != "/status" {
		return false
	}
	host, _, _ := net.SplitHostPort(req.RemoteAddr)
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() || req.Header.Get("Cf-Connecting-IP") != "" || req.Header.Get("Cf-Ray") != "" {
		http.Error(w, "not found", http.StatusNotFound)
		return true
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	io.WriteString(w, text())
	return true
}

// statusCommand is "citizens-host status": the status screen of the host running on this computer
// (for example as a service). --once prints it once instead of refreshing.
func statusCommand(once bool) {
	loadDotEnv("/etc/citizens-host.env") // the service's settings (install.sh), in case it uses another port
	port := env("PORT", "7447")
	get := func() (string, error) {
		resp, err := (&http.Client{Timeout: 5 * time.Second}).Get("http://127.0.0.1:" + port + "/status")
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
		return string(b), err
	}
	for {
		text, err := get()
		if err != nil {
			text = " The Citizens Party host isn't running on this computer (nothing answers on port " + port + ").\n" +
				" As a service: sudo systemctl start citizens-host   ·   its log: journalctl -u citizens-host -e\n"
		}
		if once {
			os.Stdout.WriteString(text)
			if err != nil {
				os.Exit(1)
			}
			return
		}
		os.Stdout.WriteString("\x1b[H\x1b[2J" + text + "\n Press Ctrl+C to leave this screen (the host keeps running).\n")
		time.Sleep(2 * time.Second)
	}
}
