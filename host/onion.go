package main

// A Tor address (".onion") for this host, so members' apps can send ballots through Tor: the ballot never
// leaves the Tor network, so neither this host nor Cloudflare learns who sent it.
//   TOR=auto (default): run Tor next to the host and announce its .onion address as well as the usual one.
//   TOR=off           : no Tor address.
// Tor is found next to this program, in its data folder, or on the PATH; otherwise it's downloaded once from
// the Tor Project (Windows and Linux x64; on other Linux computers, install it: sudo apt install tor). The
// download is checked against the fingerprint below before it's used.
//
// Tor traffic reaches the host on a second local port that never shows the status page: everything through
// Tor comes from 127.0.0.1, so the status page's "only this computer" check can't tell it apart.

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
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

const torVersion = "15.0.26" // the Tor Project's "expert bundle" (Tor Browser's release numbers)

var torBundles = map[string]string{ // GOOS/GOARCH -> bundle name and its SHA-256 (sha256sums-signed-build.txt)
	"linux/amd64":   "linux-x86_64 19cf18726eecb362e0f21d27afa9ea9efe5da928bfdfbb1ceb5fe54519e87f4a",
	"linux/386":     "linux-i686 e3195aa30946de60b1a31ef584f2e8bc2623a99815f4a102a89257a01bef9a77",
	"windows/amd64": "windows-x86_64 c1988c701de2f24f7d098d1d6d7f507b58f27740d097f29c246e0524d639b252",
	"windows/386":   "windows-i686 55a1e4c9b6df47c6e5fde1b3d755c858374d6cc0809c1dd1533a8622bb52de96",
}

var onionName = regexp.MustCompile(`^[a-z2-7]{56}\.onion$`)

type Onion struct {
	cfg   *Config
	hosts *Hosts
	port  int // the local port Tor traffic arrives on

	mu    sync.Mutex
	state string
	addr  string
}

func (o *Onion) State() string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.state
}

func (o *Onion) set(s string) {
	o.mu.Lock()
	o.state = s
	o.mu.Unlock()
}

func torName() string {
	if runtime.GOOS == "windows" {
		return "tor.exe"
	}
	return "tor"
}

func (o *Onion) find() string {
	for _, p := range []string{filepath.Join(exeDir(), "tor", torName()), filepath.Join(exeDir(), torName()), filepath.Join(o.cfg.DataDir, "tor-bin", torName())} {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	if p, err := exec.LookPath("tor"); err == nil {
		return p
	}
	return ""
}

func (o *Onion) download(ctx context.Context) (string, error) {
	b, ok := torBundles[runtime.GOOS+"/"+runtime.GOARCH]
	if !ok {
		return "", fmt.Errorf("install Tor on this computer (Linux: sudo apt install tor), then restart the host")
	}
	name, want, _ := strings.Cut(b, " ")
	o.set("downloading Tor (one time)…")
	url := "https://archive.torproject.org/tor-package-archive/torbrowser/" + torVersion + "/tor-expert-bundle-" + name + "-" + torVersion + ".tar.gz"
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	resp, err := (&http.Client{Timeout: 15 * time.Minute}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("download failed: %s", resp.Status)
	}
	f, err := os.CreateTemp(o.cfg.DataDir, "tor-*.tar.gz")
	if err != nil {
		return "", err
	}
	defer os.Remove(f.Name())
	h := sha256.New()
	_, err = io.Copy(io.MultiWriter(f, h), resp.Body)
	if err != nil {
		f.Close()
		return "", err
	}
	if hex.EncodeToString(h.Sum(nil)) != want {
		f.Close()
		return "", fmt.Errorf("the Tor download didn't match its fingerprint, so it wasn't used")
	}
	f.Seek(0, 0)
	defer f.Close()
	dir := filepath.Join(o.cfg.DataDir, "tor-bin")
	tmp := dir + ".new"
	os.RemoveAll(tmp)
	if err := os.MkdirAll(tmp, 0o755); err != nil {
		return "", err
	}
	gz, err := gzip.NewReader(f)
	if err != nil {
		return "", err
	}
	tr := tar.NewReader(gz)
	for {
		hd, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		// only Tor itself and its libraries, straight from the bundle's tor/ folder
		rest, ok := strings.CutPrefix(hd.Name, "tor/")
		if !ok || rest == "" || strings.Contains(rest, "/") || hd.Typeflag != tar.TypeReg {
			continue
		}
		out, err := os.OpenFile(filepath.Join(tmp, rest), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			return "", err
		}
		_, err = io.Copy(out, tr)
		out.Close()
		if err != nil {
			return "", err
		}
	}
	os.RemoveAll(dir)
	if err := os.Rename(tmp, dir); err != nil {
		return "", err
	}
	return filepath.Join(dir, torName()), nil
}

// torrcValue quotes a path for Tor's settings file.
func torrcValue(s string) string {
	return `"` + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`) + `"`
}

func (o *Onion) Run(ctx context.Context) {
	if o.cfg.Tor == "off" {
		o.set("off")
		return
	}
	exe := o.find()
	if exe == "" {
		var err error
		if exe, err = o.download(ctx); err != nil {
			o.set("not running: " + err.Error())
			logf("tor: %v", err)
			return
		}
	}
	dir := filepath.Join(o.cfg.DataDir, "tor")
	hs := filepath.Join(dir, "onion")
	os.MkdirAll(hs, 0o700)
	os.Chmod(dir, 0o700)
	os.Chmod(hs, 0o700)
	torrc := filepath.Join(dir, "torrc")
	conf := strings.Join([]string{
		"DataDirectory " + torrcValue(dir),
		"SocksPort 0",
		"HiddenServiceDir " + torrcValue(hs),
		fmt.Sprintf("HiddenServicePort 80 127.0.0.1:%d", o.port),
		"Log notice stdout",
		"",
	}, "\n")
	if err := os.WriteFile(torrc, []byte(conf), 0o600); err != nil {
		o.set("not running: " + err.Error())
		return
	}
	wait := 5 * time.Second
	for ctx.Err() == nil {
		started := time.Now()
		o.runOnce(ctx, exe, torrc, hs)
		if ctx.Err() != nil {
			return
		}
		if time.Since(started) > 5*time.Minute {
			wait = 5 * time.Second
		}
		o.set(fmt.Sprintf("Tor stopped; restarting in %s", wait))
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
		wait = min(wait*2, 2*time.Minute)
	}
}

func (o *Onion) runOnce(ctx context.Context, exe, torrc, hs string) {
	cmd := exec.CommandContext(ctx, exe, "-f", torrc, "--defaults-torrc", torrc+"-defaults", "--ignore-missing-torrc")
	cmd.Env = os.Environ()
	if runtime.GOOS == "linux" { // the downloaded Tor keeps its libraries next to it
		cmd.Env = append(cmd.Env, "LD_LIBRARY_PATH="+filepath.Dir(exe))
	}
	hideWindow(cmd)
	out, _ := cmd.StdoutPipe()
	cmd.Stderr = cmd.Stdout
	logFile, _ := os.OpenFile(filepath.Join(o.cfg.DataDir, "tor.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if logFile != nil {
		defer logFile.Close()
	}
	if err := cmd.Start(); err != nil {
		o.set("couldn't start Tor: " + err.Error())
		return
	}
	o.set("starting Tor…")
	sc := bufio.NewScanner(out)
	for sc.Scan() {
		line := sc.Text()
		if logFile != nil {
			fmt.Fprintln(logFile, line)
		}
		if i := strings.Index(line, "Bootstrapped "); i >= 0 {
			if strings.Contains(line, "Bootstrapped 100%") {
				b, _ := os.ReadFile(filepath.Join(hs, "hostname"))
				name := strings.TrimSpace(string(b))
				if !onionName.MatchString(name) {
					o.set("Tor is running, but its address is missing")
					continue
				}
				o.mu.Lock()
				o.addr = name
				o.state = "on: " + name
				o.mu.Unlock()
				o.hosts.SetOnion("ws://" + name)
			} else {
				pct, _, _ := strings.Cut(line[i+len("Bootstrapped "):], " ")
				o.set("starting Tor… " + pct)
			}
		}
	}
	cmd.Wait()
}
