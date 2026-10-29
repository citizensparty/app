#!/usr/bin/env python3
"""Check the Go host: who may write, that anyone can read, the member cap, and how hosts find and check each other.

Needs: pip install websockets, and Go (the test builds host/ first)
Run:   python3 tests/host.py      (prints PASS lines; exits non-zero on the first failure)
"""
import asyncio, json, pathlib, secrets, sys, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools")); sys.path.insert(0, str(ROOT / "tests"))
import schnorr, hostbin, stamps
from events import sign, KIND_DOC, KIND_AUTH
from websockets.asyncio.client import connect

OWNER, REG, ALICE, BOB, CAROL, HOSTB, FAKE = (secrets.token_bytes(32) for _ in range(7))
pk = lambda s: schnorr.pubkey_gen(s).hex()
A, B = "ws://127.0.0.1:17447", "ws://127.0.0.1:17448"
procs = []


def doc(secret, path, content, ms=None):
    c = path.split("/")[0]
    return sign(secret, KIND_DOC, [["d", path], ["c", c], ["ms", str(ms or int(time.time() * 1000) % 1000)]], json.dumps(content))


class Conn:
    def __init__(self, url):
        self.url = url

    async def __aenter__(self):
        self.ws = await connect(self.url)
        m = json.loads(await self.ws.recv())
        assert m[0] == "AUTH"
        self.challenge = m[1]
        return self

    async def __aexit__(self, *a):
        await self.ws.close()

    async def auth(self, secret):
        await self.ws.send(json.dumps(["AUTH", sign(secret, KIND_AUTH, [["relay", self.url], ["challenge", self.challenge]], "")]))
        while True:
            m = json.loads(await self.ws.recv())
            if m[0] == "OK":
                return m[2]

    async def pub(self, ev):
        await self.ws.send(json.dumps(["EVENT", ev]))
        while True:
            m = json.loads(await self.ws.recv())
            if m[0] == "OK" and m[1] == ev["id"]:
                return m[2], m[3]

    async def req(self, f):
        sid = secrets.token_hex(4)
        await self.ws.send(json.dumps(["REQ", sid, f]))
        out = []
        while True:
            m = json.loads(await self.ws.recv())
            if m[0] == "EVENT" and m[1] == sid:
                out.append(m[2])
            elif m[0] == "EOSE" and m[1] == sid:
                return out


def info(url):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url.replace("ws://", "http://"), headers={"Accept": "application/nostr+json"})).read())


async def read(url, f):
    async with Conn(url) as c:
        return await c.req(f)


async def until(fn, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if await fn():
            return True
        await asyncio.sleep(0.3)
    return False


def check(cond, what):
    if not cond:
        print("FAIL", what); stop(); sys.exit(1)
    print("PASS", what)


def stop():
    for p in procs:
        p.terminate()


async def main():
    hostbin.build()
    procs.append(hostbin.start(17447, pk(OWNER), check_every=2))
    await asyncio.sleep(0.8)
    async with Conn(A) as c:
        ok, msg = await c.pub(doc(ALICE, "members/" + pk(ALICE), {"cell": "13K"}))
        check(not ok and "approved" in msg, "an unapproved key can't write member records")
        ok, _ = await c.pub(doc(ALICE, "join/" + pk(ALICE), {"cell": "13K", "town": "Abbotsford"}))
        check(ok, "anyone can ask to join")
        ok, _ = await c.pub(doc(ALICE, "join/" + pk(BOB), {"cell": "1D"}))
        check(not ok, "you can't file a join request for someone else")
        ok, _ = await c.pub(doc(ALICE, "reg/" + pk(ALICE), {"ok": True}))
        check(not ok, "you can't approve yourself")
        ok, msg = await c.pub(sign(ALICE, KIND_DOC, [["d", "join/" + pk(ALICE)], ["c", "join"], ["p", "2"], ["ms", "1"]], json.dumps({"cell": "13K"})))
        check(not ok and "version 2" in msg, "a record for another version of the protocol is refused (%s)" % msg)
        ok, _ = await c.pub(sign(ALICE, KIND_DOC, [["d", "join/" + pk(ALICE)], ["c", "join"], ["p", "1"], ["ms", "2"]], json.dumps({"cell": "13K", "town": "Abbotsford"})))
        check(ok, "...and one labeled version 1 is taken")
        cfg = {"hosts": [], "registrars": [pk(REG)], "memberCap": 2}
        ok, _ = await c.pub(doc(OWNER, "party/config", cfg))
        check(ok, "the owner publishes the party config")
        ok, _ = await c.pub(doc(REG, "reg/" + pk(ALICE), {"ok": True, "cell": "13K"}))
        check(ok, "a listed registrar approves Alice")
        ok, _ = await c.pub(doc(REG, "reg/" + pk(BOB), {"ok": True, "cell": "1D"}))
        check(ok, "...and Bob")
        ok, msg = await c.pub(doc(REG, "reg/" + pk(CAROL), {"ok": True, "cell": "1D"}))
        check(not ok and "full" in msg, "...but not Carol: the party is at its member cap (2)")
        ok, _ = await c.pub(doc(ALICE, "members/" + pk(ALICE), {"cell": "13K"}))
        check(ok, "an approved member writes her own record")
        ok, _ = await c.pub(doc(ALICE, "members/" + pk(BOB), {"cell": "13K"}))
        check(not ok, "...but not someone else's")
        P1 = "items/" + pk(ALICE)[:16] + "-p1"
        ok, _ = await c.pub(doc(ALICE, P1, {"text": "Taxes should be low."}))
        check(ok, "a member proposes an item")
        ok, msg = await c.pub(doc(BOB, P1, {"text": "Taxes should be high."}))
        check(not ok, "...and nobody else can write it (%s)" % msg)
        ok, msg = await c.pub(doc(BOB, "items/p2", {"text": "Not mine."}))
        check(not ok, "a proposal's id must start with its author's key")
        ok, _ = await c.pub(doc(BOB, "ends/" + P1[6:], {"closes": 1, "full": True}))
        check(ok, "any member may record how a vote ended (each app checks it)")
        ok, _ = await c.pub(doc(ALICE, "ends/" + P1[6:], {"closes": 2, "voided": True}))
        got = await c.req({"kinds": [KIND_DOC], "#d": ["ends/" + P1[6:]]})
        check(len(got) == 1 and got[0]["pubkey"] == pk(BOB), "...but only once: the first one stays")
        ok, _ = await c.pub(doc(ALICE, "config/settings", {"hours": 1}))
        check(not ok, "only the owner changes settings")
        ok, _ = await c.pub(doc(ALICE, "chain/00000001", {"n": 1, "votes": [{"v": "y"}, {"v": "n"}]}))
        check(ok, "a member seals a page of 2 votes into the record")
        ok, _ = await c.pub(doc(ALICE, "turnout/" + pk(ALICE), {"b": {"p1": 1}}))
        check(ok, "a member records that she took part (not how she voted)")
        ok, msg = await c.pub(doc(OWNER, "turnout/" + pk(ALICE), {"b": {}}))
        check(not ok, "the party key can't change who took part (%s)" % msg)
        ok, msg = await c.pub(doc(ALICE, "votes/" + pk(ALICE), {"b": {"p1": "y"}}))
        check(not ok, "the old open votes records are gone (%s)" % msg)
        ok, msg = await c.pub(doc(OWNER, "members/" + pk(ALICE), {"cell": "1D", "keys": {}}))
        check(not ok, "...or her member record and keys")
        ok, msg = await c.pub(doc(OWNER, "members/sim-test1", {"cell": "13K", "sim": True}))
        check(not ok, "the party key can't add fake test members (%s)" % msg)
        ok, msg = await c.pub(doc(OWNER, "config/settings", {"hours": 1}))
        check(not ok, "nobody, not even the party key, can change the vote rules (%s)" % msg)
        later = doc(BOB, "chain/00000001", {"n": 1, "votes": []})
        ok, _ = await c.pub(later)
        back = doc(BOB, "chain/00000001", {"n": 1, "votes": []}); back["created_at"] -= 86400 * 30
        from events import serialize
        import hashlib
        back["id"] = hashlib.sha256(serialize(back).encode()).hexdigest(); back["sig"] = schnorr.sign(BOB, bytes.fromhex(back["id"]), secrets.token_bytes(32)).hex()
        await c.pub(back)
        got = await c.req({"kinds": [KIND_DOC], "#d": ["chain/00000001"]})
        check(len(got) == 1 and got[0]["pubkey"] == pk(ALICE), "a page of the record can't be replaced, not even by a backdated copy")
        # secret ballots: a registrar blind-stamps Alice's voting key; the key then votes with no link to Alice
        Q, GRID = "2026Q4", "13K"
        K = stamps.keygen(1024)
        ok, msg = await c.pub(doc(ALICE, "stampkeys/" + pk(ALICE) + "_" + Q, {"n": "%x" % K["n"]}))
        check(not ok, "only a registrar publishes a stamping key")
        ok, _ = await c.pub(doc(REG, "stampkeys/" + pk(REG) + "_" + Q, {"n": "%x" % K["n"], "period": Q}))
        check(ok, "a registrar publishes its stamping key for the quarter")
        VOTE = secrets.token_bytes(32)
        msg_ = stamps.stamp_msg(Q, GRID, pk(VOTE))
        blinded, r = stamps.blind(K["n"], GRID, msg_)
        ok, _ = await c.pub(doc(ALICE, "stampreq/" + pk(ALICE) + "_" + Q, {"reg": pk(REG), "grid": GRID, "b": "%x" % blinded}))
        check(ok, "Alice sends a sealed envelope to be stamped")
        ok, _ = await c.pub(doc(REG, "stampok/" + pk(ALICE) + "_" + Q, {"sig": "%x" % stamps.sign_blinded(K, GRID, blinded)}))
        check(ok, "the registrar stamps it without seeing inside")
        got = await c.req({"kinds": [KIND_DOC], "#d": ["stampok/" + pk(ALICE) + "_" + Q]})
        sig = stamps.unblind(K["n"], int(json.loads(got[0]["content"])["sig"], 16), r)
        check(stamps.verify(K["n"], GRID, msg_, sig), "Alice's app takes the stamp out of the envelope: it's valid for her voting key")
        ok, msg = await c.pub(doc(VOTE, "ballots/" + pk(VOTE) + "_" + P1[6:], {"v": "y"}))
        check(not ok, "a voting key can't vote before its stamp is in (%s)" % msg)
        ok, msg = await c.pub(doc(VOTE, "stamps/" + pk(VOTE), {"period": Q, "grid": "1D", "reg": pk(REG), "sig": "%x" % sig}))
        check(not ok, "a stamp only works for the grid it was made for")
        ok, msg = await c.pub(doc(VOTE, "stamps/" + pk(VOTE), {"period": Q, "grid": GRID, "reg": pk(REG), "sig": "%x" % sig}))
        check(ok, "the voting key publishes its stamp; the host checks it (%s)" % msg)
        ok, _ = await c.pub(doc(VOTE, "ballots/" + pk(VOTE) + "_" + P1[6:], {"v": "y", "t": 1}))
        check(ok, "the voting key casts a ballot")
        await c.pub(doc(VOTE, "ballots/" + pk(VOTE) + "_" + P1[6:], {"v": "n", "t": 2}, ms=999))
        got = await c.req({"kinds": [KIND_DOC], "#d": ["ballots/" + pk(VOTE) + "_" + P1[6:]]})
        check(len(got) == 1 and '"y"' in got[0]["content"], "the first ballot is final: a second one is ignored")
        OTHER = secrets.token_bytes(32)
        ok, _ = await c.pub(doc(OTHER, "stamps/" + pk(OTHER), {"period": Q, "grid": GRID, "reg": pk(REG), "sig": "%x" % sig}))
        check(not ok, "a stamp can't be reused by another key")
        ok, _ = await c.pub(doc(OTHER, "ballots/" + pk(OTHER) + "_" + P1[6:], {"v": "n"}))
        check(not ok, "a key with no stamp can't vote")
        ok, _ = await c.pub(doc(REG, "stampok/" + pk(ALICE) + "_" + Q, {"sig": "1"}))
        got = await c.req({"kinds": [KIND_DOC], "#d": ["stampok/" + pk(ALICE) + "_" + Q]})
        check(len(got) == 1 and got[0]["content"] != json.dumps({"sig": "1"}), "one stamp per member per quarter: the first stays")
    got = await read(A, {"kinds": [KIND_DOC], "#c": ["items"]})
    check(len(got) == 1, "anyone can read the record, without signing in")
    got = await read(A, {"kinds": [KIND_DOC], "#c": ["join"]})
    check(len(got) == 1, "join requests are public too")
    async with Conn(A) as c:
        check(await c.auth(ALICE), "Alice signs in with her key (it only counts her as online)")
        P1 = "items/" + pk(ALICE)[:16] + "-p1"
        await c.pub(doc(ALICE, P1, {"text": "Taxes should be fair."}, ms=999))
        got = await c.req({"kinds": [KIND_DOC], "#d": [P1]})
        check(len(got) == 1 and "low" in got[0]["content"], "a proposal can't be reworded, not even by its author")
        await c.pub(doc(ALICE, "members/" + pk(ALICE), {"cell": "13K", "town": "Kamloops"}, ms=999))
        got = await c.req({"kinds": [KIND_DOC], "#d": ["members/" + pk(ALICE)]})
        check(len(got) == 1 and "Kamloops" in got[0]["content"], "a newer version of your own record replaces the old one")
        fake = dict(got[0]); fake["content"] = json.dumps({"text": "forged"})
        ok, msg = await c.pub(fake)
        check(not ok and "signature" in msg, "a changed record is rejected")
        ok, msg = await c.pub(doc(ALICE, "hosts/" + pk(BOB), {"url": "wss://example.org"}))
        check(not ok, "a host can only announce itself")
        i = info(A)
        check(i["stats"]["online"] == 1 and i["stats"]["members"] == 3, "the host reports members (%d) and who's online (%d)" % (i["stats"]["members"], i["stats"]["online"]))
    await asyncio.sleep(2.5)  # the fingerprint is refreshed at most every 2 seconds
    n_a = info(A)["checkpoint"]["count"]
    check(info(A)["stats"]["votes"] == 2, "the host reports the votes on the record (%s)" % info(A)["stats"].get("votes"))

    # a second host: copies everything, then announces itself; host A checks it before listing it
    procs.append(hostbin.start(17448, pk(OWNER), peers=A, secret=HOSTB, check_every=2))
    ok = await until(lambda: _has_host(A, pk(HOSTB)))
    check(ok, "a new host copies the record, announces itself, and host A lists it after checking it")
    ok = await until(lambda: _count_at_least(B, n_a))
    check(ok, "the new host holds everything host A has (%d of %d)" % (info(B)["checkpoint"]["count"], n_a))
    check(info(A)["network"]["hosts"] == 2, "host A reports 2 hosts in the network: itself and the new one")
    async with Conn(A) as c:
        ok, msg = await c.pub(doc(FAKE, "hosts/" + pk(FAKE), {"url": "ws://127.0.0.1:17999"}))
        check(ok and "pending" in msg, "an announcement from an unknown host waits for a check")
        ok, _ = await c.pub(doc(FAKE, "hosts/" + pk(FAKE), {"url": B}))
    await asyncio.sleep(3)
    check(not await _has_host(A, pk(FAKE)), "a host that isn't there, or claims another host's address, isn't listed")
    async with Conn(A) as c:
        ok, msg = await c.pub(doc(FAKE, "hosts/" + pk(FAKE), {"url": "https://example.org"}))
        check(not ok, "a host address must be wss://")
        ok, msg = await c.pub(doc(FAKE, "hosts/" + pk(FAKE), {"url": "ws://127.0.0.1:17998", "onion": "ws://example.onion"}))
        check(not ok and "Tor address" in msg, "a host's Tor address must be a real-looking .onion address (%s)" % msg)

    # host B goes away: host A drops it after 3 failed checks
    procs[1].terminate(); procs[1].wait()
    ok = await until(lambda: _gone(A, pk(HOSTB)), 30)
    check(ok, "a host that stops answering is dropped from the list")
    i = info(A)
    check(not i["limitation"]["auth_required"] and i["checkpoint"]["count"] == n_a, "the host publishes its checkpoint (%d, expected %d)" % (i["checkpoint"]["count"], n_a))
    stop()


async def _has_host(url, key):
    return any(e["pubkey"] == key for e in await read(url, {"kinds": [KIND_DOC], "#c": ["hosts"]}))


async def _count_at_least(url, n):
    return info(url)["checkpoint"]["count"] >= n


async def _gone(url, key):
    return not await _has_host(url, key)


try:
    asyncio.run(main())
finally:
    stop()
