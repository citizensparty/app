#!/usr/bin/env python3
"""Live check of a host's Tor address, over the real Tor network (needs the internet; about a minute).

The host starts Tor by itself (downloading it the first time, into tests/out/tor/), gets a .onion address and
announces it. Then a separate Tor client on this computer, standing in for a member's phone, sends a record to
that address. Also checks that the status page can't be read through Tor.

Run: python3 tests/tor.py
"""
import asyncio, json, os, pathlib, secrets, shutil, socket, subprocess, sys, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools")); sys.path.insert(0, str(ROOT / "tests"))
import schnorr, hostbin
from events import sign, KIND_DOC
from websockets.asyncio.client import connect

OUT = ROOT / "tests/out/tor"
PORT, SOCKS = 17471, 17472
OWNER, ALICE = secrets.token_bytes(32), secrets.token_bytes(32)
pk = lambda s: schnorr.pubkey_gen(s).hex()
procs = []


def check(cond, what):
    print(("PASS " if cond else "FAIL ") + what)
    if not cond:
        cleanup(); sys.exit(1)


def cleanup():
    for p in procs:
        p.terminate()


def socks_open(host, port):
    """A TCP connection through Tor's SOCKS port; the address is looked up inside Tor (SOCKS5, by name)."""
    s = socket.create_connection(("127.0.0.1", SOCKS), timeout=90)
    s.sendall(b"\x05\x01\x00"); assert s.recv(2) == b"\x05\x00"
    h = host.encode()
    s.sendall(b"\x05\x01\x00\x03" + bytes([len(h)]) + h + port.to_bytes(2, "big"))
    r = s.recv(10)
    if len(r) < 2 or r[1] != 0:
        raise OSError("Tor couldn't connect (%s)" % r[1:2].hex())
    return s


def http_get(host, path):
    s = socks_open(host, 80)
    s.sendall(("GET %s HTTP/1.1\r\nHost: %s\r\nAccept: application/nostr+json\r\nConnection: close\r\n\r\n" % (path, host)).encode())
    out = b""
    while True:
        b = s.recv(65536)
        if not b: break
        out += b
    s.close()
    return out.split(b"\r\n\r\n", 1)[-1].decode(errors="replace")


async def main():
    hostbin.build()
    data = OUT / "host"
    if data.exists():  # keep Tor itself between runs, start the record afresh
        for f in data.iterdir():
            if f.name != "tor-bin": shutil.rmtree(f) if f.is_dir() else f.unlink()
    data.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, PORT=str(PORT), DATA_DIR=str(data), OWNER_PUBKEYS=pk(OWNER), PEERS="", RELAY_URL=f"ws://127.0.0.1:{PORT}",
               TUNNEL="off", TOR="auto", PARTY_URL="off", STATUS="off", ALLOW_LOCAL_HOSTS="1", DIRECTORY="off")
    log = open(OUT / "host.log", "w")
    procs.append(subprocess.Popen([str(hostbin.BIN)], env=env, stdout=log, stderr=subprocess.STDOUT))
    t0 = time.time(); onion = ""
    while time.time() - t0 < 300 and not onion:
        await asyncio.sleep(2)
        try:
            onion = json.load(urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{PORT}/", headers={"Accept": "application/nostr+json"}), timeout=5)).get("onion", "")
        except Exception:
            pass
    check(onion.startswith("ws://") and onion.endswith(".onion"), "the host starts Tor and gets a Tor address in %ds (%s)" % (time.time() - t0, onion))
    name = onion[5:]
    ann = None
    async with connect(f"ws://127.0.0.1:{PORT}") as ws:
        await ws.recv()
        await ws.send(json.dumps(["REQ", "h", {"kinds": [KIND_DOC], "#c": ["hosts"]}]))
        while True:
            m = json.loads(await ws.recv())
            if m[0] == "EVENT": ann = json.loads(m[2]["content"])
            if m[0] == "EOSE": break
    check(ann and ann.get("onion") == onion, "...and announces it in the record, next to its usual address")

    # a Tor client on this computer stands in for a member's phone
    tor = data / "tor-bin" / "tor"
    cdir = OUT / "client"; shutil.rmtree(cdir, ignore_errors=True); cdir.mkdir()
    procs.append(subprocess.Popen([str(tor), "SocksPort", str(SOCKS), "DataDirectory", str(cdir), "Log", "notice file " + str(cdir / "log")],
                                  env=dict(os.environ, LD_LIBRARY_PATH=str(tor.parent)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    t0 = time.time()
    while time.time() - t0 < 120 and "Bootstrapped 100%" not in ((cdir / "log").read_text() if (cdir / "log").exists() else ""):
        await asyncio.sleep(1)
    check(True, "a separate Tor client is ready in %ds" % (time.time() - t0))
    info = None
    for _ in range(10):  # a brand-new Tor address can take a minute to be findable
        try:
            info = json.loads(http_get(name, "/")); break
        except Exception:
            await asyncio.sleep(6)
    check(info and info.get("pubkey") and info.get("onion") == onion, "the host's info page answers through Tor")
    check("Public key" not in http_get(name, "/status"), "the status page can't be read through Tor")

    t0 = time.time()
    sock = socks_open(name, 80)
    ev = sign(ALICE, KIND_DOC, [["d", "join/" + pk(ALICE)], ["c", "join"], ["ms", "1"]], json.dumps({"cell": "1A", "town": "Test"}))
    async with connect("ws://" + name, sock=sock, open_timeout=90) as ws:
        await ws.send(json.dumps(["EVENT", ev]))
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), 90))
            if m[0] == "OK": break
    check(m[2], "a record sent to the Tor address is accepted (%s) in %.1fs" % (m[3] or "ok", time.time() - t0))
    t0 = time.time()
    sock = socks_open(name, 80)
    async with connect("ws://" + name, sock=sock, open_timeout=90) as ws:
        await ws.send(json.dumps(["EVENT", ev]))
        m = json.loads(await asyncio.wait_for(ws.recv(), 90))
        while m[0] != "OK": m = json.loads(await asyncio.wait_for(ws.recv(), 90))
    check(True, "a second send, once Tor is warm, takes %.1fs" % (time.time() - t0))
    cleanup()


asyncio.run(main())
