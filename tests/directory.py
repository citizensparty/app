#!/usr/bin/env python3
"""The host directory (worker/, run locally with wrangler dev): hosts with no seeds find each other through
citizensparty.ca/hosts.json, the directory checks them, and the app finds hosts through it.

  1. Host A starts with nobody to copy from, announces itself and registers.
  2. Host B finds A in the directory, copies from it, then registers too.
  3. Forged, mismatched and unreachable registrations are refused.
  4. The app, with no hosts in the party config, finds both hosts through the directory.
  5. B goes away; after three failed checks the directory stops listing it.
  6. B restarts at a new address: listed again without waiting out the 6 hours.

Needs: Node (~/.local/opt/node), Go, pip install playwright websockets.  Run: python3 tests/directory.py
"""
import urllib.error, asyncio, json, os, pathlib, secrets, signal, subprocess, sys, tempfile, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools")); sys.path.insert(0, str(ROOT / "tests"))
import schnorr, party, hostbin
from events import sign, KIND_DOC
from playwright.async_api import async_playwright

NODE = os.path.expanduser("~/.local/opt/node/bin")
WEB = 8798
SITE = f"http://127.0.0.1:{WEB}"
OWNER_WORDS = party.words_new(); OWNER = party.key_from_words(OWNER_WORDS)
HA, HB = secrets.token_bytes(32), secrets.token_bytes(32)
PA, PB = 17471, 17472
UA, UB = f"ws://127.0.0.1:{PA}", f"ws://127.0.0.1:{PB}"
pk = lambda s: schnorr.pubkey_gen(s).hex()
procs = []


def check(cond, what):
    if not cond:
        print("FAIL", what); stop(); sys.exit(1)
    print("PASS", what)


def stop():
    for p in procs:
        try:
            if getattr(p, "group", False): os.killpg(p.pid, signal.SIGTERM)  # wrangler and its workerd children
            else: p.terminate()
        except Exception: pass


def get(path):
    return json.loads(urllib.request.urlopen(SITE + path, timeout=10).read())


def post(ev):
    req = urllib.request.Request(SITE + "/api/hosts", data=json.dumps(ev).encode(), headers={"Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=20); return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def listed():
    return {h["pubkey"] for h in get("/hosts.json")["hosts"]}


async def until(fn, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = fn()
            if asyncio.iscoroutine(r): r = await r
            if r: return True
        except Exception: pass
        await asyncio.sleep(0.5)
    return False


def announce(secret, url):
    return sign(secret, KIND_DOC, [["d", "hosts/" + pk(secret)], ["c", "hosts"], ["ms", "1"]], json.dumps({"url": url, "name": "test"}))


async def main():
    hostbin.build()
    tmp = pathlib.Path(tempfile.mkdtemp())
    (tmp / "party").mkdir()
    cfg = {"owners": [pk(OWNER)], "registrars": [], "hosts": []}   # no seed hosts at all
    (tmp / "party/party.json").write_text(json.dumps(cfg))
    (tmp / "party/party.signed.json").write_text(json.dumps(party.signed_event(cfg, OWNER)))
    subprocess.run([sys.executable, str(ROOT / "tools/build.py"), "--party", str(tmp / "party"), "--out", str(tmp / "dist"), "--no-host", "--directory", SITE], check=True, stdout=subprocess.DEVNULL)
    w = (ROOT / "worker/wrangler.toml").read_text()
    w = w.replace('main = "src/index.js"', f'main = "{ROOT}/worker/src/index.js"').replace('directory = "../dist/site"', f'directory = "{tmp}/dist/site"')
    w = w.replace('routes = [{ pattern = "citizensparty.ca", custom_domain = true }]\n', "").replace('HOST_CAP = "10000"', 'HOST_CAP = "10000"\nALLOW_LOCAL = "1"\nCACHE_S = "0"\nRECHECK_AFTER = "0"')
    (tmp / "wrangler.toml").write_text(w)
    env = dict(os.environ, PATH=NODE + ":" + os.environ["PATH"], WRANGLER_SEND_METRICS="false", CI="1")
    wr = lambda *a: [NODE + "/npx", "wrangler", *a, "-c", str(tmp / "wrangler.toml"), "--persist-to", str(tmp / "state")]
    subprocess.run(wr("d1", "execute", "citizens-hosts", "--local", "--file", str(ROOT / "worker/schema.sql")), cwd=ROOT / "worker", env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    dev = subprocess.Popen(wr("dev", "--port", str(WEB), "--ip", "127.0.0.1", "--test-scheduled"), cwd=ROOT / "worker", env=env,
                           stdout=open(hostbin.OUT / "wrangler.log", "w"), stderr=subprocess.STDOUT, start_new_session=True)
    dev.group = True
    procs.append(dev)
    check(await until(lambda: get("/hosts.json")["hosts"] == [], 60), "the directory is up and empty")

    procs.append(hostbin.start(PA, pk(OWNER), secret=HA, directory=SITE))
    check(await until(lambda: pk(HA) in listed()), "host A, with nobody to copy from, registers in the directory")
    import websockets
    async with websockets.connect(UA) as ws:  # the party config, so the app and hosts know the owner
        await ws.recv(); await ws.send(json.dumps(["EVENT", json.loads((tmp / "party/party.signed.json").read_text())])); await ws.recv()

    procs.append(hostbin.start(PB, pk(OWNER), secret=HB, directory=SITE))
    check(await until(lambda: pk(HB) in listed(), 60), "host B finds A in the directory, copies from it, and registers")
    count = lambda: json.loads(urllib.request.urlopen(urllib.request.Request(UB.replace("ws", "http"), headers={"Accept": "application/nostr+json"})).read())["checkpoint"]["count"]
    check(await until(lambda: count() >= 3, 10), "host B holds A's records (%d)" % count())

    ev = announce(HB, UB); ev["content"] = ev["content"].replace("test", "forged")
    code, r = post(ev); check(code == 400, "a forged registration is refused (%s)" % r["why"])
    code, r = post(announce(secrets.token_bytes(32), UA)); check(code in (409, 422), "someone else's address is refused (%s)" % r["why"])
    code, r = post(announce(secrets.token_bytes(32), "ws://127.0.0.1:17999")); check(code == 422, "an unreachable host is refused (%s)" % r["why"])
    code, r = post(announce(secrets.token_bytes(32), "wss://10.0.0.1")); check(code == 400, "a bare IP address is refused (%s)" % r["why"])

    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(SITE + "/app/")
        await pg.click("[data-cpa=have]"); await pg.fill("#cp-w", OWNER_WORDS); await pg.click("[data-cpa=ok]")
        await pg.wait_for_selector("[data-act=intro-done]", timeout=15000)
        ok = False
        for _ in range(40):
            hs = await pg.evaluate("window.CPAccount?window.CPAccount.hosts():[]")
            if {h["url"] for h in hs if h["online"]} >= {UA, UB}: ok = True; break
            await asyncio.sleep(0.5)
        check(ok, "the app, with no hosts in the party config, finds both hosts through the directory")
        lp = await br.new_page(); await lp.goto(SITE + "/"); await lp.wait_for_timeout(2500)
        check((await lp.inner_text("#st-hosts")).strip() == "2", "the landing page shows 2 hosts running")
        # feedback: the landing page's form saves it privately; a bot filling the hidden field is dropped; 5 an hour per sender
        await lp.fill("#fb-msg", "Please add a dark mode toggle."); await lp.fill("#fb-email", "friend@example.com")
        await lp.click("#fb-go"); await lp.wait_for_timeout(1500)
        check("Thanks" in await lp.inner_text("#fb-st"), "the landing page's feedback form sends (%s)" % await lp.inner_text("#fb-st"))
        rows = json.loads(subprocess.run(wr("d1", "execute", "citizens-hosts", "--local", "--json", "--command", "select msg,email,page from feedback"), cwd=ROOT / "worker", env=env, capture_output=True, text=True).stdout)[0]["results"]
        check(any(r["msg"] == "Please add a dark mode toggle." and r["email"] == "friend@example.com" and r["page"] == "landing" for r in rows), "...and it's stored")
        fpost = lambda d: (lambda r: (r.status, json.loads(r.read())))(urllib.request.urlopen(urllib.request.Request(SITE + "/api/feedback", data=json.dumps(d).encode(), headers={"Content-Type": "application/json"}, method="POST")))
        def fpost2(d):
            try: return fpost(d)
            except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
        code, r = fpost2({"message": "spam spam", "website": "http://spam"}); n1 = len(json.loads(subprocess.run(wr("d1", "execute", "citizens-hosts", "--local", "--json", "--command", "select id from feedback"), cwd=ROOT / "worker", env=env, capture_output=True, text=True).stdout)[0]["results"])
        check(code == 200 and n1 == len(rows), "a bot that fills the hidden field is thanked and dropped")
        codes = [fpost2({"message": "test %d" % i})[0] for i in range(6)]
        check(codes[:4] == [200] * 4 and codes[-1] == 429, "at most 5 messages an hour from one sender (%s)" % codes)
        check(not errs, "no page errors %s" % errs)

        procs[2].terminate(); procs[2].wait()
        for _ in range(3):
            urllib.request.urlopen(SITE + "/__scheduled?cron=*/30+*+*+*+*", timeout=30).read(); time.sleep(1.2)
        check(await until(lambda: pk(HB) not in listed(), 20), "after three failed checks, the directory stops listing host B")
        check(pk(HA) in listed(), "...and still lists host A")
        # 6. B comes back at a new address (a quick tunnel's address changes on restart): listed again, no 6-hour wait
        NB = PB + 7
        procs.append(hostbin.start(NB, pk(OWNER), secret=HB, directory=SITE))
        newurl = lambda: [h["url"] for h in get("/hosts.json")["hosts"] if h["pubkey"] == pk(HB)]
        check(await until(lambda: newurl() == ["ws://127.0.0.1:%d" % NB], 150), "host B, back at a new address, is listed again right away")
        # 7. A restarts at a new address too, while the app stays open: the app finds both again and its writes go out
        NA = PA + 7
        procs[1].terminate(); procs[1].wait()
        procs.append(hostbin.start(NA, pk(OWNER), secret=HA, directory=SITE))
        await until(lambda: [h["url"] for h in get("/hosts.json")["hosts"] if h["pubkey"] == pk(HA)] == ["ws://127.0.0.1:%d" % NA], 150)
        ok = False
        for _ in range(120):
            hs = await pg.evaluate("window.CPAccount.hosts()")
            if {h["url"] for h in hs if h["online"]} >= {"ws://127.0.0.1:%d" % NA, "ws://127.0.0.1:%d" % NB}: ok = True; break
            await asyncio.sleep(0.5)
        check(ok, "after both hosts restart at new addresses, the open app finds them again by itself")
        await pg.evaluate("window.claude.use('db').then(db=>db.doc('members/'+window.CPAccount.me()).set({cell:'11-10',town:'Reconnectville',joinedAt:Date.now()}))")
        async def on_new_a():
            async with websockets.connect("ws://127.0.0.1:%d" % NA) as ws:
                await ws.recv(); await ws.send(json.dumps(["REQ", "q", {"kinds": [30078], "#d": ["members/" + pk(OWNER)]}]))
                while True:
                    m = json.loads(await ws.recv())
                    if m[0] == "EVENT" and "Reconnectville" in m[2]["content"]: return True
                    if m[0] == "EOSE": return False
        check(await until(on_new_a, 20), "...and its writes reach them")
        check(not errs, "no page errors %s" % errs)
        await br.close()
    stop()


try:
    asyncio.run(main())
finally:
    stop()
