#!/usr/bin/env python3
"""End to end: the real app against two real hosts, with keys instead of logins.

  1. The owner restores the party key from 12 words and joins a grid.
  2. Alice creates a key, writes down her words, asks to join, and waits.
  3. The owner approves her from the Me page; Alice's app lets her in by itself.
  4. Alice's records reach both hosts; a host that loses everything is refilled by Alice's app.
  5. A third host, not in the party config, announces itself; Alice's app finds it in the record and uses it.
  6. Alice restores her key on a second device and goes straight in.

Needs: pip install playwright websockets && playwright install chromium
Run:   python3 tests/nostr.py      (prints PASS lines; exits non-zero on the first failure)
"""
import asyncio, json, os, pathlib, secrets, shutil, subprocess, sys, tempfile, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools")); sys.path.insert(0, str(ROOT / "tests"))
import schnorr, party, hostbin
from events import sign, KIND_DOC, KIND_AUTH
from websockets.asyncio.client import connect
from playwright.async_api import async_playwright

OUT = ROOT / "tests/out"; OUT.mkdir(exist_ok=True)
OWNER_WORDS = party.words_new()
OWNER = party.key_from_words(OWNER_WORDS)
HA, HB, HC = secrets.token_bytes(32), secrets.token_bytes(32), secrets.token_bytes(32)
PA, PB, PC, WEB = 17451, 17452, 17453, 18080
UA, UB, UC = f"ws://127.0.0.1:{PA}", f"ws://127.0.0.1:{PB}", f"ws://127.0.0.1:{PC}"
pk = lambda s: schnorr.pubkey_gen(s).hex()
procs = []


def check(cond, what):
    if not cond:
        print("FAIL", what); cleanup(); sys.exit(1)
    print("PASS", what)


def cleanup():
    for p in procs:
        p.terminate()


def relay(port, peer, secret, db):
    p = hostbin.start(port, pk(OWNER), peers=peer, secret=secret, db=db)
    procs.append(p)
    return p


async def read_all(url, as_secret, c=None):
    async with connect(url) as ws:
        ch = json.loads(await ws.recv())[1]
        await ws.send(json.dumps(["AUTH", sign(as_secret, KIND_AUTH, [["relay", url], ["challenge", ch]], "")]))
        await ws.recv()
        await ws.send(json.dumps(["REQ", "q", {"kinds": [KIND_DOC], **({"#c": [c]} if c else {})}]))
        out = []
        while True:
            m = json.loads(await ws.recv())
            if m[0] == "EVENT": out.append(m[2])
            if m[0] == "EOSE": return out


async def wait_for(fn, what, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if await fn():
                print("PASS", what)
                return True
        except Exception:
            pass
        await asyncio.sleep(0.3)
    check(False, what)


async def new_device(b):
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
    pg = await ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(f"http://127.0.0.1:{WEB}/app/")
    return ctx, pg, errs


async def join_grid(pg, town):
    await pg.wait_for_selector("[data-act=intro-done]", timeout=10000)
    await pg.click("[data-act=intro-done]")
    await pg.fill("#addr-q", "100 Main St, " + town); await pg.dispatch_event("#addr-q", "input")
    await pg.click("[data-act=join]")


async def main():
    hostbin.build()
    tmp = pathlib.Path(tempfile.mkdtemp())
    # party settings for this test: the owner, two hosts
    (tmp / "party").mkdir()
    cfg = {"owners": [pk(OWNER)], "registrars": [], "publicRead": False,
           "hosts": [{"url": UA, "pubkey": pk(HA), "name": "Host A"}, {"url": UB, "pubkey": pk(HB), "name": "Host B"}]}
    (tmp / "party/party.json").write_text(json.dumps(cfg))
    (tmp / "party/party.signed.json").write_text(json.dumps(party.signed_event(cfg, OWNER)))
    subprocess.run([sys.executable, str(ROOT / "tools/build.py"), "--party", str(tmp / "party"), "--out", str(tmp / "dist"), "--no-host", "--directory", "http://127.0.0.1:9"], check=True, stdout=subprocess.DEVNULL)
    procs.append(subprocess.Popen([sys.executable, "-m", "http.server", "-d", str(tmp / "dist/site"), str(WEB), "--bind", "127.0.0.1"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    relay(PA, UB, HA, str(tmp / "a.db")); relay(PB, UA, HB, str(tmp / "b.db"))
    await asyncio.sleep(1)
    # the hosts learn the party config (normally: tools/party.py publish)
    async with connect(UA) as ws:
        await ws.recv(); await ws.send(json.dumps(["EVENT", json.loads((tmp / "party/party.signed.json").read_text())])); await ws.recv()

    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 1. owner
        octx, opg, oerr = await new_device(b)
        await opg.click("[data-cpa=have]")
        # the 12 words come from a fixed list: suggestions as you type, Tab fills one in, unknown words show at once
        await opg.click("#cp-w"); await opg.keyboard.type("aban")
        check("abandon" in await opg.inner_text("#cp-sug"), "typing \"aban\" suggests \"abandon\"")
        await opg.keyboard.press("Tab")
        check(await opg.input_value("#cp-w") == "abandon ", "Tab fills the word in")
        await opg.keyboard.type("xyzq "); await opg.wait_for_timeout(100)
        check("Not on the list" in await opg.inner_text("#cp-st"), "a word that isn't on the list shows at once")
        wrong = await opg.evaluate("w=>['zoo','zone','zero','abandon','ability','able'].map(x=>w+' '+x).find(x=>!CPNostr.validateWords(x))", " ".join(OWNER_WORDS.split()[:11]))
        await opg.fill("#cp-w", wrong); await opg.dispatch_event("#cp-w", "input")
        check("don't match" in await opg.inner_text("#cp-st"), "12 words that don't match say so before Continue")
        await opg.fill("#cp-w", OWNER_WORDS); await opg.dispatch_event("#cp-w", "input")
        check("check out" in await opg.inner_text("#cp-st"), "the right 12 words check out")
        await opg.click("[data-cpa=ok]")
        await join_grid(opg, "Abbotsford")
        me = await opg.evaluate("window.CPAccount&&window.CPAccount.me()")
        check(me == pk(OWNER), "the owner's 12 words give the owner's key in the app")
        await wait_for(lambda: _has(UA, OWNER, "members", me), "the owner's member record reaches host A")

        # 2. Alice
        actx, apg, aerr = await new_device(b)
        await apg.click("[data-cpa=new]"); await apg.wait_for_selector(".cp-words li", timeout=15000)
        words = await apg.eval_on_selector_all(".cp-words li", "els=>els.map(e=>e.textContent)")
        check(len(words) == 12, "Alice gets 12 words")
        await apg.screenshot(path=str(OUT / "nostr-01-words.png"))
        check(await apg.is_disabled("[data-cpa=next]"), "Alice can't go on until she ticks \"I saved my 12 words\"")
        await apg.context.grant_permissions(["clipboard-read", "clipboard-write"])
        await apg.click("[data-cpa=copy]")
        check(await apg.evaluate("navigator.clipboard.readText()") == " ".join(words), "\"Copy the words\" copies all 12, in order")
        await apg.check("#cp-wrote"); await apg.click("[data-cpa=next]")
        await join_grid(apg, "Kamloops")
        await apg.wait_for_selector("text=Almost there", timeout=10000)
        await apg.screenshot(path=str(OUT / "nostr-02-waiting.png"))
        alice = await apg.evaluate("window.CPAccount.me()")
        check(True, "Alice asks to join and sees the waiting screen")
        await wait_for(lambda: _has(UB, OWNER, "join", alice), "Alice's join request reaches host B")
        check(not await _has(UA, OWNER, "members", alice), "Alice has no member record before approval")

        # 3. owner approves from the Me page
        await opg.reload(); await opg.wait_for_timeout(1500)
        await opg.click("[data-act=tab][data-v=me]")
        await opg.wait_for_selector("[data-cpa-open=approve]")
        await opg.screenshot(path=str(OUT / "nostr-03-me.png"), full_page=True)
        # the phone keeps only the member's own records (an app is not a host)
        await opg.click('.pills[data-car=mem] [data-act=car][data-id="2"]'); await opg.wait_for_timeout(600)
        await opg.eval_on_selector('[data-cpa-open=hosts]','e=>e.scrollIntoView({block:"center"})'); await opg.wait_for_timeout(300); await opg.screenshot(path=str(OUT / "nostr-03b-settings.png"))
        check(await opg.locator("#cp-keep-in").count() == 0, "there's no switch to keep a full copy on the phone")
        # the account screens: Done and the phone's Back both return to the same Settings tab
        on_settings = lambda: opg.evaluate("[...document.querySelectorAll('.pills[data-car=mem] button')].map(b=>b.getAttribute('aria-pressed')).join()")
        await opg.click("[data-cpa-open=hosts]"); await opg.wait_for_timeout(300)
        await opg.click("#cp-ov [data-cpa=close]"); await opg.wait_for_timeout(400)
        check(await opg.locator("#cp-ov").count() == 0 and await on_settings() == "false,false,true", "Done on the Hosts screen returns to the Settings tab")
        await opg.click("[data-cpa-open=words]"); await opg.wait_for_timeout(300)
        await opg.go_back(); await opg.wait_for_timeout(400)
        check(await opg.locator("#cp-ov").count() == 0 and await on_settings() == "false,false,true", "Back on the 12 words screen returns to the Settings tab")
        kept = await opg.evaluate("new Promise(r=>{const q=indexedDB.open('citizens-copy');q.onsuccess=()=>{try{const g=q.result.transaction('ev').objectStore('ev').getAll();g.onsuccess=()=>{q.result.close();r(g.result.map(e=>[e.pubkey,(e.tags.find(t=>t[0]==='c')||[])[1],(e.tags.find(t=>t[0]==='d')||[])[1]]))}}catch(e){q.result.close();r([])}}})")
        me_o = pk(OWNER)
        others = [k for k in kept if k[0] != me_o and k[1] not in ("party", "hosts") and k[2] != "reg/" + me_o]
        check(kept and not others, "the phone keeps only the member's own records, the party settings and the host list (%d kept, %d others)" % (len(kept), len(others)))
        await opg.click("[data-cpa-open=hosts]"); await opg.wait_for_timeout(300)
        opg.once("dialog", lambda d: asyncio.ensure_future(d.accept("127.0.0.1:9/")))
        check("Party website" in await opg.inner_text("#cp-ov"), "the Hosts screen shows the party website")
        await opg.click("[data-cpa=site]"); await opg.wait_for_load_state(); await opg.wait_for_timeout(1500)
        check(await opg.evaluate("localStorage.getItem('citizens-site')") == "https://127.0.0.1:9", "a member can point the app at a new party website")
        await opg.evaluate("localStorage.removeItem('citizens-site')"); await opg.reload(); await opg.wait_for_timeout(1500)
        await opg.click("[data-act=tab][data-v=me]"); await opg.wait_for_selector("[data-cpa-open=approve]")
        await wait_for(lambda: _text_has(opg, "[data-cpa-open=approve]", "(1)"), "the owner sees 1 join request")
        await opg.click("[data-cpa-open=approve]")
        await opg.screenshot(path=str(OUT / "nostr-04-requests.png"))
        check("Kamloops" in await opg.inner_text(".cp-in"), "the request shows Alice's town")
        await opg.click(f'[data-cpa=ok][data-pk="{alice}"]')
        await wait_for(lambda: _has(UA, OWNER, "members", alice), "after approval, Alice's app files her member record by itself", 20)
        await apg.wait_for_selector("text=Almost there", state="detached", timeout=15000)
        await apg.wait_for_timeout(1500)
        await apg.screenshot(path=str(OUT / "nostr-05-in.png"))
        check(await apg.evaluate("!document.getElementById('cp-ov')"), "Alice is in")

        # F1: a reload never asks a member for their address again, even while the hosts are still answering
        await apg.reload()
        seen_find = False
        for _ in range(60):
            await apg.wait_for_timeout(100)
            if "Find your grid" in (await apg.evaluate("(document.getElementById('app')||{}).innerText||''")): seen_find = True
        check(not seen_find and await apg.locator("h1.gtitle").count() == 1, "after a reload Alice lands on her grid page, never on Find your grid")

        # F2: a proposal shows at once everywhere, and tapping Done doesn't drop it
        await apg.click("[data-act=tab][data-v=plat]"); await apg.wait_for_timeout(300)
        await apg.click('[data-act=pe][data-v=gap][data-id="1"]'); await apg.wait_for_timeout(600)
        await apg.fill("#pl-in", "Every grid keeps its own record."); await apg.dispatch_event("#pl-in", "input")
        await apg.click("#pl-go"); await apg.wait_for_timeout(500)
        await apg.click("[data-act=pe][data-v=finish]"); await apg.wait_for_timeout(500)
        await wait_for(lambda: _item_on(UA, "Every grid keeps its own record."), "the new proposal reaches host A", 20)
        txt = await apg.inner_text("#app")
        check(await apg.locator('.stat[data-act=grid-votes] b').inner_text() == "1", "after Done, the grid page counts it in Open votes")
        await apg.click("[data-act=tab][data-v=search]"); await apg.wait_for_timeout(400)
        check("Every grid keeps its own record." in await apg.inner_text("#app"), "...it's in Votes")
        await apg.click("[data-act=tab][data-v=vote]"); await apg.wait_for_timeout(400)
        check("Your proposal is gathering support" in await apg.inner_text("#app"), "...and in Notifications")
        await apg.click("[data-act=tab][data-v=me]"); await apg.wait_for_timeout(400)
        check("PROPOSALS 1" in (await apg.inner_text(".pills[data-car=mem]")).upper().replace("\n", " "), "...and on her Proposals tab")

        # filling in Find your grid again (older apps made people do it) never resets the date you joined
        before = await apg.evaluate("window.claude.use('db').then(db=>db.doc('members/'+window.CPAccount.me()).get()).then(s=>s.data().joinedAt)")
        await apg.evaluate("window.claude.use('db').then(db=>db.doc('members/'+window.CPAccount.me()).get().then(s=>db.doc('members/'+window.CPAccount.me()).set(Object.assign({},s.data(),{joinedAt:Date.now()}))))")
        await apg.wait_for_timeout(800)
        after = await apg.evaluate("window.claude.use('db').then(db=>db.doc('members/'+window.CPAccount.me()).get()).then(s=>s.data().joinedAt)")
        check(after <= before, "rejoining the same grid keeps the date Alice joined (%s, was %s)" % (after, before))
        # F1: approved while the app was closed: the next open files the member record and lands on the grid page
        bctx, bpg, berr = await new_device(b)
        await bpg.click("[data-cpa=new]"); await bpg.wait_for_selector(".cp-words li", timeout=15000); await bpg.check("#cp-wrote"); await bpg.click("[data-cpa=next]")
        await join_grid(bpg, "Kamloops"); await bpg.wait_for_selector("text=Almost there", timeout=10000)
        bob = await bpg.evaluate("window.CPAccount.me()")
        await wait_for(lambda: _has(UA, OWNER, "join", bob), "Bob's join request reaches host A")
        await bpg.close()
        async with connect(UA) as ws:
            await ws.recv(); await ws.send(json.dumps(["EVENT", sign(OWNER, KIND_DOC, [["d", "reg/" + bob], ["c", "reg"], ["ms", "1"]], json.dumps({"ok": True, "cell": "10-12", "at": int(time.time() * 1000)}))])); await ws.recv()
        bpg = await bctx.new_page(); await bpg.goto(f"http://127.0.0.1:{WEB}/app/")
        await wait_for(lambda: _has(UA, OWNER, "members", bob), "Bob, approved while his app was closed, gets his member record when he opens it", 25)
        await bpg.wait_for_selector("h1.gtitle", timeout=15000)
        check("Find your grid" not in await bpg.inner_text("#app"), "...and lands on his grid page, not Find your grid")

        # 4. records on both hosts; repair
        await apg.evaluate("window.claude.use('db').then(db=>db.doc('items/'+window.CPAccount.me().slice(0,16)+'-t'+Date.now()).set({kind:'note',text:'hello from Alice',at:Date.now()}))")
        await wait_for(_both_have_item, "Alice's new record is on both hosts")
        its = [e for e in await read_all(UA, OWNER, "items") if e["pubkey"] == alice]
        check(its and all(["p", "1"] in e["tags"] for e in its), "the app labels its records with protocol version 1")
        await apg.evaluate("window.claude.use('db').then(db=>db.doc('turnout/'+window.CPAccount.me()).set({b:{t1:1}}))")
        err = await opg.evaluate("window.claude.use('db').then(db=>db.doc('turnout/%s').set({b:{}})).then(()=>'',e=>String(e.message||e))" % alice)
        check("your own record" in err, "the owner's app can't change Alice's record of taking part (%s)" % err)
        await opg.wait_for_timeout(1500)
        v = await opg.evaluate("window.claude.use('db').then(db=>db.doc('turnout/%s').get()).then(s=>s.data())" % alice)
        check(v == {"b": {"t1": 1}}, "...and everyone still sees Alice's own record (%s)" % v)
        ok = await opg.evaluate("window.claude.use('db').then(db=>db.doc('members/sim-e2e').set({cell:'1D',sim:true})).then(()=>true,()=>false)")
        check(not ok, "the owner's app can't add fake test members")
        await opg.evaluate("(()=>{const o=document.getElementById('cp-ov');if(o)o.remove();const b=document.createElement('button');b.dataset.act='tab';b.dataset.v='me';document.body.appendChild(b);b.click();b.remove()})()"); await opg.wait_for_timeout(500)
        await opg.eval_on_selector('.pills[data-car=mem] [data-act=car][data-id="2"]', "e=>e.click()"); await opg.wait_for_timeout(600)
        check("Owner test tools" not in await opg.inner_text("body") and await opg.locator("[data-act=end-now]").count() == 0, "the real app shows no owner test tools")

        # secret ballots: the owner's app (a registrar) blind-stamps Alice's voting key by itself; she votes with it
        Q = await apg.evaluate("window.claude.use('voter').then(v=>v.periodOf(Date.now()))")
        await wait_for(lambda: _has(UA, OWNER, "stampkeys", pk(OWNER)), "the owner's app makes and publishes its stamping key for the quarter", 120)
        await wait_for(lambda: _has(UA, OWNER, "stampreq", alice), "Alice's app sends a sealed envelope to be stamped", 30)
        await wait_for(lambda: _has(UA, OWNER, "stampok", pk(OWNER)), "the owner's app stamps it without seeing inside", 60)
        await wait_for(lambda: apg.evaluate("window.claude.use('voter').then(v=>v.hasStamp('%s'))" % Q), "Alice's app takes the stamp out, and it checks out", 30)
        vpk = await apg.evaluate("window.claude.use('voter').then(v=>v.key('%s'))" % Q)
        check(vpk and vpk != alice, "Alice's voting key is not her member key")
        await apg.evaluate("window.claude.use('voter').then(v=>v.cast('e2e-item','y','%s'))" % Q)
        await wait_for(lambda: _has(UA, OWNER, "ballots", vpk), "Alice's ballot is on host A, signed by her voting key (the host checked its stamp)", 20)
        await wait_for(lambda: _has(UB, OWNER, "ballots", vpk), "...and on host B", 20)
        bal = [e for e in await read_all(UA, OWNER, "ballots") if e["pubkey"] == vpk]
        stp = [e for e in await read_all(UA, OWNER, "stamps") if e["pubkey"] == vpk]
        req = [e for e in await read_all(UA, OWNER, "stampreq") if e["pubkey"] == alice]
        check(bal and stp and req and alice not in json.dumps(bal + stp) and vpk not in json.dumps(req), "nothing on the record links the ballot to Alice")
        check(json.loads(stp[0]["content"]).get("grid") == "BC" and json.loads(bal[0]["content"]).get("g"), "the stamp isn't tied to a grid; the ballot names the voter's grid (%s)" % json.loads(bal[0]["content"]).get("g"))
        err = await apg.evaluate("window.claude.use('voter').then(v=>v.cast('e2e-item','n','%s')).then(()=>'',e=>String(e.message||e))" % Q)
        check("already voted" in err, "she can't vote twice (%s)" % err)

        # a regular browser can't hide where a vote comes from: a red warning that can't be hidden, on the notices and ballots
        await apg.click("[data-act=tab][data-v=plat]"); await apg.wait_for_timeout(600)
        pw = apg.locator(".npanel.n-block:has-text(\"maximum secrecy\")")
        check(await pw.count() == 1 and await pw.locator(".nhide").count() == 0, "in a regular browser, a red warning says votes can be traced, with no Hide")
        await apg.click("[data-act=tab][data-v=search]"); await apg.wait_for_timeout(600)
        await apg.click(".vrow:has-text('Every grid keeps its own record.')"); await apg.wait_for_timeout(500)
        if await apg.locator("[data-act=istage]").count(): await apg.click("[data-act=istage]"); await apg.wait_for_timeout(500)
        first = await apg.evaluate("[...document.querySelectorAll('#app main > *')].findIndex(e=>e.classList.contains('ncard'))")
        check(first == 0 and "maximum secrecy" in await apg.inner_text(".ncard"), "...and at the top of every vote page")
        await apg.screenshot(path=str(OUT / "nostr-privwarn.png"))

        # Tor (the installed Android app): ballots go through Tor; the rest doesn't. A stand-in for TorPlugin.java
        tctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block", color_scheme="dark")
        await tctx.add_init_script(FAKE_TOR)
        tpg = await tctx.new_page(); terr = []
        tpg.on("pageerror", lambda e: terr.append(str(e)))
        await tpg.goto(f"http://127.0.0.1:{WEB}/app/")
        await tpg.click("[data-cpa=have]"); await tpg.fill("#cp-w", " ".join(words)); await tpg.click("[data-cpa=ok]")
        await wait_for(lambda: tpg.evaluate("window.claude.use('voter').then(v=>v.hasStamp('%s'))" % Q), "Alice's phone with Tor gets her stamp back from the record", 30)
        check(await tpg.evaluate("window.claude.use('voter').then(v=>v.route()+'/'+v.native)") == "tor/true", "the app knows it can send ballots through Tor")
        r = await tpg.evaluate("window.claude.use('voter').then(v=>v.cast('e2e-tor1','y','%s'))" % Q)
        check(r.get("sent"), "a ballot sent through Tor reaches a host (%s)" % r)
        await wait_for(lambda: _has_doc(UA, OWNER, "ballots/%s_e2e-tor1" % vpk), "...it's on host A")
        sent = await tpg.evaluate("window.__torSent")
        check(any(x["d"] == "ballots/%s_e2e-tor1" % vpk for x in sent), "...and it went through Tor")
        check(all(x["d"].split("/")[0] in ("ballots", "stamps") for x in sent), "only ballots and stamps go through Tor (%s)" % sorted({x["d"].split("/")[0] for x in sent}))
        await tpg.evaluate("window.__torState='starting'")  # a network that blocks Tor
        r = await tpg.evaluate("window.claude.use('voter').then(v=>v.cast('e2e-tor2','n','%s',1500))" % Q)
        check(r.get("torFailed") and not r.get("sent"), "when Tor won't open, the ballot waits and the app can ask the member (%s)" % r)
        await tpg.wait_for_timeout(1500)
        check(not await _has_doc(UA, OWNER, "ballots/%s_e2e-tor2" % vpk), "...it isn't sent the normal way by itself")
        r = await tpg.evaluate("window.claude.use('voter').then(v=>v.sendPlain('e2e-tor2'))")
        check(r.get("sent"), "\"Send it the normal way\" sends it (%s)" % r)
        await wait_for(lambda: _has_doc(UA, OWNER, "ballots/%s_e2e-tor2" % vpk), "...and it's on host A")
        check(not any(x["d"].endswith("_e2e-tor2") for x in await tpg.evaluate("window.__torSent")), "...not through Tor")

        # the vote overlay: the page behind it is frozen (no re-render, no scrolling, Back ignored) until a host confirms;
        # after 15 s it steps aside and the card says "Sending privately…" until it arrives
        await tpg.evaluate("window.__torState='on';window.__torDelay=21000")
        await tpg.click("[data-act=tab][data-v=search]"); await tpg.wait_for_timeout(600)
        await tpg.click(".vrow:has-text('Every grid keeps its own record.')"); await tpg.wait_for_timeout(500)
        await tpg.click("[data-act=istage]"); await tpg.wait_for_timeout(500)
        check("maximum secrecy" not in await tpg.inner_text("body"), "the app, which sends ballots through Tor, shows no such warning")
        await tpg.click(".ynb-y"); await tpg.wait_for_timeout(200); await tpg.click(".ynb-y"); await tpg.wait_for_timeout(700)
        await tpg.evaluate("document.getElementById('app').insertAdjacentHTML('beforeend','<i id=\"frz\"></i>')")
        await tpg.screenshot(path=str(OUT / "nostr-vote-overlay.png"))
        check(await tpg.locator(".qbg.lockbg").count() == 1 and await tpg.evaluate("document.body.classList.contains('locked')&&getComputedStyle(document.body).overflow==='hidden'"), "while a vote is sent, the overlay is up and the page can't scroll")
        await tpg.go_back(); await tpg.wait_for_timeout(2500)
        check(await tpg.locator("#frz").count() == 1 and await tpg.locator(".ynb").count() == 2 and await tpg.locator(".qbg.lockbg").count() == 1, "...the page behind it doesn't re-render, and Back does nothing")
        await tpg.wait_for_timeout(13500)
        check(await tpg.locator(".qbg.lockbg").count() == 0 and "Sending privately" in await tpg.inner_text("#app") and not await tpg.evaluate("document.body.classList.contains('locked')"), "after 15 s the overlay steps aside and the card says Sending privately…")
        await tpg.screenshot(path=str(OUT / "nostr-vote-sending.png"))
        await wait_for(lambda: tpg.evaluate("!!document.querySelector('.sendst.ok')"), "...then ✓ Sent when it arrives", 20)
        await tpg.evaluate("window.__torDelay=0")
        aerr += terr
        a_n = len(await read_all(UA, OWNER))
        procs[1].terminate(); procs[1].wait()  # host A goes down and loses its disk
        os.remove(tmp / "a.db")
        procs[1] = relay(PA, "", HA, str(tmp / "a.db"))
        await asyncio.sleep(1)
        async with connect(UA) as ws:  # it gets the party config back from the owner's tool
            await ws.recv(); await ws.send(json.dumps(["EVENT", json.loads((tmp / "party/party.signed.json").read_text())])); await ws.recv()
        await wait_for(lambda: _at_least(UA, a_n - 1), "a host that lost everything is refilled from the other host (apps only resend their own records)", 90)
        st = await apg.evaluate("window.CPAccount.hosts()")
        check(all(h["online"] for h in st), "Alice's app is connected to both hosts")

        # 5. a host nobody listed: it announces itself, the others check it, Alice's app finds it
        relay(PC, UA, HC, str(tmp / "c.db"))
        await wait_for(lambda: _has(UA, OWNER, "hosts", pk(HC)), "a new host announces itself and host A lists it after checking it", 30)
        await apg.reload()
        await wait_for(lambda: _app_uses(apg, UC), "Alice's app finds the new host in the record and connects to it", 20)

        # 6. second device
        dctx, dpg, derr = await new_device(b)
        await dpg.click("[data-cpa=have]"); await dpg.fill("#cp-w", " ".join(words)); await dpg.click("[data-cpa=ok]")
        await dpg.wait_for_timeout(2500)
        check(await dpg.evaluate("window.CPAccount.me()") == alice, "Alice's words open her account on a second device")
        check("Almost there" not in await dpg.inner_text("body"), "...and she doesn't have to be approved again")

        # 7. nobody can clear the record: a party config asking hosts to clear everything (the old "clearedAt") changes
        # nothing, and a proposal dated before the record starts (RecordStart, fixed in the programs) is refused
        n_items = len(await read_all(UA, OWNER, "items"))
        check(n_items > 0, "hosts hold proposals before the test (%d)" % n_items)
        cfg2 = dict(cfg); await asyncio.sleep(1.1)
        ev2 = sign(OWNER, KIND_DOC, [["d", "party/config"], ["c", "party"], ["ms", "1"]],
                   json.dumps({"hosts": cfg2.get("hosts", []), "registrars": cfg2.get("registrars", []), "at": int(time.time()), "clearedAt": int(time.time())}))
        for u in (UA, UB, UC):
            async with connect(u) as ws:
                await ws.recv(); await ws.send(json.dumps(["EVENT", ev2])); await ws.recv()
        await asyncio.sleep(3)
        check(all([len(await read_all(u, OWNER, "items")) >= n_items for u in (UA, UB)]), "a party config asking to clear the record removes nothing from the hosts")
        await apg.reload(); await apg.wait_for_timeout(4000)
        await apg.click("[data-act=tab][data-v=search]"); await apg.wait_for_timeout(500)
        check("Every grid keeps its own record." in await apg.inner_text("#app"), "...and Alice's app still shows her proposal")
        old = sign(OWNER, KIND_DOC, [["d", "items/" + pk(OWNER)[:16] + "-old1"], ["c", "items"], ["ms", "1"]], json.dumps({"kind": "principle", "text": "From the test phase."}), created_at=1793066261 - 10)
        async with connect(UA) as ws:
            await ws.recv(); await ws.send(json.dumps(["EVENT", old]))
            r = json.loads(await ws.recv())
            while r[0] != "OK": r = json.loads(await ws.recv())
        check(r[2] is False and "before the record starts" in r[3], "a proposal dated before the record starts is refused (%s)" % r[3])
        print("page errors:", oerr + aerr + derr)
        check(not (oerr + aerr + derr), "no page errors")
        await b.close()
    cleanup()


# Stands in for the native Tor plugin (native/android TorPlugin.java): same calls, but a plain WebSocket.
FAKE_TOR = """
window.__torSent=[];window.__torState='on';
window.Capacitor={isNativePlatform:()=>true,Plugins:{CitizensTor:{
  start:async()=>({state:window.__torState}),status:async()=>({state:window.__torState}),
  send:({url,msg,id,timeout})=>new Promise(res0=>setTimeout(()=>res0(null),window.__torDelay||0)).then(()=>new Promise(res=>{if(window.__torState!=='on')return res({ok:false,message:'tor: not ready'});
    const e=JSON.parse(msg)[1];window.__torSent.push({url,d:(e.tags.find(t=>t[0]==='d')||[])[1]});
    const ws=new WebSocket(url);let done=false;const end=(ok,m)=>{if(done)return;done=true;try{ws.close()}catch(x){}res({ok,message:m||''})};
    ws.onopen=()=>ws.send(msg);ws.onmessage=m=>{const a=JSON.parse(m.data);if(a[0]==='OK'&&a[1]===id)end(!!a[2],a[3])};
    ws.onerror=()=>end(false,'unreachable');setTimeout(()=>end(false,'timeout'),timeout||10000)}))}}};
"""


async def _has_doc(url, as_secret, d):
    return any(dict((t[0], t[1]) for t in e["tags"] if len(t) > 1).get("d") == d for e in await read_all(url, as_secret, d.split("/")[0]))


async def _item_on(url, text):
    return any(text in e["content"] for e in await read_all(url, OWNER, "items"))


async def _has(url, as_secret, c, author):
    return any(e["pubkey"] == author for e in await read_all(url, as_secret, c))


async def _both_have_item():
    a = await read_all(UA, OWNER, "items"); b = await read_all(UB, OWNER, "items")
    return any("hello from Alice" in e["content"] for e in a) and any("hello from Alice" in e["content"] for e in b)


async def _app_uses(pg, url):
    return any(h["url"] == url and h["online"] for h in await pg.evaluate("window.CPAccount.hosts()"))


async def _text_has(pg, sel, t):
    return t in await pg.inner_text(sel)


async def _at_least(url, n):
    return len(await read_all(url, OWNER)) >= n


try:
    asyncio.run(main())
finally:
    cleanup()
