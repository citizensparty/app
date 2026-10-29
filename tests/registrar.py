#!/usr/bin/env python3
"""Check the registrar program (host/registrar.go, built with -tags registrar): it connects out to a host, and once
the owner lists its key it approves join requests by itself (beta), publishes its stamping key and blind-stamps
members' voting keys. The host itself has no registrar in it.

Needs: pip install websockets, and Go (the test builds host/ first)
Run:   python3 tests/registrar.py      (prints PASS lines; exits non-zero on the first failure)
"""
import asyncio, json, pathlib, secrets, sys, tempfile, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools")); sys.path.insert(0, str(ROOT / "tests"))
import schnorr, hostbin, stamps
from events import sign, KIND_DOC
from websockets.asyncio.client import connect

OWNER, REG, ALICE, VOTE, BOB, VOTE2, CAROL, DAVE, EVE = (secrets.token_bytes(32) for _ in range(9))
DATA = tempfile.mkdtemp()
pk = lambda s: schnorr.pubkey_gen(s).hex()
URL = "ws://127.0.0.1:17461"
GRID = "11-10"
procs = []


def doc(secret, path, content):
    return sign(secret, KIND_DOC, [["d", path], ["c", path.split("/")[0]], ["ms", str(int(time.time() * 1000) % 1000)]], json.dumps(content))


async def pub(ev):
    async with connect(URL) as ws:
        await ws.recv()
        await ws.send(json.dumps(["EVENT", ev]))
        while True:
            m = json.loads(await ws.recv())
            if m[0] == "OK" and m[1] == ev["id"]:
                return m[2], m[3]


async def get(d):
    async with connect(URL) as ws:
        await ws.recv()
        await ws.send(json.dumps(["REQ", "q", {"kinds": [KIND_DOC], "#d": [d]}]))
        out = []
        while True:
            m = json.loads(await ws.recv())
            if m[0] == "EVENT":
                out.append(m[2])
            elif m[0] == "EOSE":
                return out


async def until(d, timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        got = await get(d)
        if got:
            return got[0]
        await asyncio.sleep(0.5)
    return None


def check(cond, what):
    if not cond:
        print("FAIL", what)
        for p in procs:
            p.terminate()
        sys.exit(1)
    print("PASS", what)


def quarter():
    t = time.gmtime()
    return "%dQ%d" % (t.tm_year, (t.tm_mon - 1) // 3 + 1)


async def main():
    hostbin.build()
    procs.append(hostbin.start(17461, pk(OWNER)))
    await asyncio.sleep(0.8)
    info = json.loads(urllib.request.urlopen(urllib.request.Request(URL.replace("ws://", "http://"), headers={"Accept": "application/nostr+json"})).read())
    check("registrar" not in info, "the host has no registrar in it")
    procs.append(hostbin.start_registrar(URL, pk(OWNER), REG, DATA))
    ok, _ = await pub(doc(ALICE, "join/" + pk(ALICE), {"cell": GRID, "town": "Burnaby"}))
    check(ok, "Alice asks to join")
    await asyncio.sleep(16)
    check(not await get("reg/" + pk(ALICE)), "an unlisted registrar key approves nobody")
    ok, _ = await pub(doc(OWNER, "party/config", {"hosts": [], "registrars": [pk(REG)]}))
    check(ok, "the owner lists the registrar's key")
    r = await until("reg/" + pk(ALICE))
    check(r and r["pubkey"] == pk(REG) and json.loads(r["content"]).get("ok"), "the registrar approves Alice by itself (beta)")
    ok, msg = await pub(doc(ALICE, "members/" + pk(ALICE), {"cell": GRID, "town": "Burnaby", "joinedAt": int(time.time() * 1000)}))
    check(ok, "Alice can now write her member record (%s)" % msg)
    Q = quarter()
    kd = await until("stampkeys/" + pk(REG) + "_" + Q)
    check(kd is not None, "the registrar publishes its stamping key for " + Q)
    n = int(json.loads(kd["content"])["n"], 16)
    m = stamps.stamp_msg(Q, GRID, pk(VOTE))
    blinded, rr = stamps.blind(n, GRID, m)
    ok, _ = await pub(doc(ALICE, "stampreq/" + pk(ALICE) + "_" + Q, {"reg": pk(REG), "grid": GRID, "b": "%x" % blinded}))
    check(ok, "Alice sends her sealed envelope to the registrar")
    so = await until("stampok/" + pk(ALICE) + "_" + Q)
    check(so is not None and so["pubkey"] == pk(REG), "the registrar stamps it")
    sig = stamps.unblind(n, int(json.loads(so["content"])["sig"], 16), rr)
    check(stamps.verify(n, GRID, m, sig), "the stamp is valid for Alice's voting key")
    ok, msg = await pub(doc(VOTE, "stamps/" + pk(VOTE), {"period": Q, "grid": GRID, "reg": pk(REG), "sig": "%x" % sig}))
    check(ok, "the voting key publishes its stamp (%s)" % msg)
    ok, msg = await pub(doc(VOTE, "ballots/" + pk(VOTE) + "_item1", {"v": "y", "t": int(time.time() * 1000)}))
    check(ok, "and its ballot is accepted (%s)" % msg)
    # restarted (or moved next to a 0.3 host's data folder): same registrar key and stamping key, nothing to re-list
    procs.pop().terminate()
    procs.append(hostbin.start_registrar(URL, pk(OWNER), REG, DATA))
    ok, _ = await pub(doc(BOB, "join/" + pk(BOB), {"cell": GRID, "town": "Burnaby"}))
    r = await until("reg/" + pk(BOB))
    check(r and r["pubkey"] == pk(REG), "after a restart, the registrar approves Bob")
    await pub(doc(BOB, "members/" + pk(BOB), {"cell": GRID, "town": "Burnaby", "joinedAt": int(time.time() * 1000)}))
    m2 = stamps.stamp_msg(Q, GRID, pk(VOTE2))
    blinded, rr = stamps.blind(n, GRID, m2)
    await pub(doc(BOB, "stampreq/" + pk(BOB) + "_" + Q, {"reg": pk(REG), "grid": GRID, "b": "%x" % blinded}))
    so = await until("stampok/" + pk(BOB) + "_" + Q)
    check(so is not None and stamps.verify(n, GRID, m2, stamps.unblind(n, int(json.loads(so["content"])["sig"], 16), rr)), "and stamps with the same stamping key")
    # no waiting line: everyone who asks gets in (the beta's daily limit is on handing out new 12 words, in the app)
    await pub(doc(CAROL, "join/" + pk(CAROL), {"cell": GRID, "town": "Burnaby"}))
    await pub(doc(DAVE, "join/" + pk(DAVE), {"cell": "1D", "town": "Victoria"}))
    check(bool(await until("reg/" + pk(CAROL))) and bool(await until("reg/" + pk(DAVE))), "more members asking to join are all approved, with no daily limit")
    for p in procs:
        p.terminate()


asyncio.run(main())
