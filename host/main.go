//go:build !registrar

// Citizens Party host: keeps a full copy of the party's public record and shares it with members' apps
// and the other hosts. Everything in the record is signed on members' phones, so a host can't forge or
// change anything; its job is to keep a copy, share it, and refuse writes the rules don't allow.
//
// Double-click it (Windows) or run ./citizens-host (Linux). No settings needed; see README.md for options.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"golang.org/x/term"
)

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Println("citizens-host", version)
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "status" {
		statusCommand(len(os.Args) > 2 && os.Args[2] == "--once")
		return
	}
	cfg := LoadConfig()
	os.MkdirAll(cfg.DataDir, 0o755)
	tty := cfg.Status && term.IsTerminal(int(os.Stdout.Fd())) && enableTerminal()
	logs := &ring{}
	if tty {
		f, _ := os.OpenFile(filepath.Join(cfg.DataDir, "host.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if f != nil {
			logs.file = f
		}
		log.SetOutput(logs)
		log.SetFlags(log.Ltime)
	} else {
		log.SetOutput(io.MultiWriter(os.Stdout, logs)) // logs: the last lines, for the status command
		log.SetFlags(log.LstdFlags)
	}

	st, err := OpenStore(cfg)
	if err != nil {
		fatal(fmt.Sprintf("Can't open the record in %s: %v", cfg.DB, err))
	}
	r := NewRelay(cfg, st)
	h := NewHosts(cfg, st, r)
	t := &Tunnel{cfg: cfg, hosts: h}

	ln, err := net.Listen("tcp", fmt.Sprintf("%s:%d", cfg.Bind, cfg.Port))
	if err != nil {
		if errors.Is(err, syscall.EADDRINUSE) || isAddrInUse(err) {
			fatal(fmt.Sprintf("Port %d is already in use. Is another Citizens Party host already running on this computer?", cfg.Port))
		}
		fatal(err.Error())
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	started := time.Now()
	var o *Onion
	text := func() string { return render(r, h, t, o, logs, started, false) }
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if !serveStatus(w, req, text) {
			r.ServeHTTP(w, req)
		}
	}), ReadHeaderTimeout: 15 * time.Second}
	go srv.Serve(ln)
	// Tor traffic arrives on its own local port, which never shows the status page (see onion.go)
	o = &Onion{cfg: cfg, hosts: h}
	if cfg.Tor != "off" {
		if oln, err := net.Listen("tcp", "127.0.0.1:0"); err == nil {
			o.port = oln.Addr().(*net.TCPAddr).Port
			osrv := &http.Server{Handler: r, ReadHeaderTimeout: 60 * time.Second}
			go osrv.Serve(oln)
		} else {
			cfg.Tor = "off"
		}
	}

	logf("listening on %s:%d · owners=%d · seeds=%d", cfg.Bind, cfg.Port, len(cfg.Owners), len(cfg.Peers)+len(st.Seeds()))
	logf("this host's public key: %s", cfg.Key.Pub)
	if len(cfg.Owners) == 0 {
		logf("no party key: download the host from https://citizensparty.ca/host.html, or set OWNER_PUBKEYS")
	}
	go fetchParty(ctx, cfg, r)
	for i := 0; i < checkWorkers; i++ {
		go h.worker(ctx)
	}
	go h.recheck(ctx)
	go h.peerManager(ctx)
	go h.announceLoop(ctx)
	go h.directoryLoop(ctx)
	go t.Run(ctx)
	go o.Run(ctx)
	if tty {
		go screen(r, h, t, o, logs, started)
	}
	<-ctx.Done()
	t.Stop()
	sc, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	srv.Shutdown(sc)
	cancel()
	if tty {
		fmt.Println("\n Stopped.")
	}
}

// fetchParty gets the party config signed by the owner from the website, so a new host knows the party's
// own hosts and registrars without anyone sending it anything. Checked like any record: only the owner's
// signature counts.
func fetchParty(ctx context.Context, cfg *Config, r *Relay) {
	if cfg.PartyURL == "" {
		return
	}
	for ctx.Err() == nil {
		req, _ := http.NewRequestWithContext(ctx, "GET", cfg.PartyURL, nil)
		resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
		if err == nil {
			var e Event
			if json.NewDecoder(io.LimitReader(resp.Body, MaxEvent)).Decode(&e) == nil && e.ID != "" {
				if ok, why := r.Accept(&e, "website"); !ok && why != "" {
					logf("party config from the website: %s", why)
				}
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

func fatal(m string) {
	fmt.Fprintln(os.Stderr, "\n "+m)
	pauseIfDoubleClicked()
	os.Exit(1)
}
