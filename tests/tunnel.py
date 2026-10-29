"""Live test (needs the internet, ~3 min): a host whose quick tunnel dies quietly restarts it by itself.

Starts a host with a real Cloudflare quick tunnel (no directory, no Tor), freezes cloudflared (SIGSTOP, so the
process is alive but the address stops answering, like a VPN switching on), then checks the host notices, starts a
new tunnel and its new address answers with its own key.
"""
import json, os, pathlib, re, signal, subprocess, sys, tempfile, time, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "tools"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import schnorr, hostbin, secrets

def check(cond, what):
    print(("PASS " if cond else "FAIL ") + what)
    if not cond:
        stop(); sys.exit(1)

def answers(wss, pub):
    try:
        r = urllib.request.urlopen(urllib.request.Request(wss.replace("wss://", "https://"), headers={"Accept": "application/nostr+json"}), timeout=15)
        return json.loads(r.read()).get("pubkey") == pub
    except Exception:
        return False

def until(fn, timeout):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = fn()
        if v:
            return v
        time.sleep(2)
    return None

hostbin.build()
data = tempfile.mkdtemp()
secret = secrets.token_bytes(32); pub = schnorr.pubkey_gen(secret).hex()
owner = schnorr.pubkey_gen(secrets.token_bytes(32)).hex()
logp = pathlib.Path(data) / "out.log"
env = dict(os.environ, PORT="17901", DB_PATH=data + "/db.sqlite", DATA_DIR=data, OWNER_PUBKEYS=owner, HOST_SECRET=secret.hex(),
           TUNNEL="auto", PARTY_URL="off", STATUS="off", DIRECTORY="off", TOR="off", TUNNEL_CHECK_EVERY="20s")
p = subprocess.Popen([str(hostbin.BIN)], env=env, stdout=open(logp, "w"), stderr=subprocess.STDOUT)
def stop():
    p.terminate()
addrs = lambda: re.findall(r"this host's address: (wss://\S+)", logp.read_text())

a1 = until(lambda: addrs() and addrs()[0], 90)
check(bool(a1), "the host gets a quick tunnel address (%s)" % a1)
check(bool(until(lambda: answers(a1, pub), 90)), "...and it answers with the host's key")
kids = subprocess.run(["pgrep", "-P", str(p.pid)], capture_output=True, text=True).stdout.split()
check(bool(kids), "cloudflared is running (%s)" % kids)
for k in kids:
    os.kill(int(k), signal.SIGSTOP)
check(bool(until(lambda: not answers(a1, pub), 60)), "frozen tunnel: the address stops answering")
a2 = until(lambda: len(addrs()) > 1 and addrs()[-1], 240)
check(bool(a2) and a2 != a1 and "restarting it" in logp.read_text(), "the host notices and starts a new tunnel (%s)" % a2)
check(bool(until(lambda: answers(a2, pub), 90)), "...and the new address answers with the host's key")
stop()
