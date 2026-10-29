"""The beta's daily limit on new 12 words (100 across BC), and the notices' arrows and header link.

One host. With room today, "I'm new here" gives new 12 words; once 100 people got in in the last 24 hours, a new
visitor gets "No spots left today" instead, and nothing is held for them. There's no waiting line after that: whoever
got words gets in. Also screenshots the notices (arrows to step through them) at phone and
desktop sizes.
"""
import asyncio, json, pathlib, secrets, subprocess, sys, tempfile, time
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools")); sys.path.insert(0, str(ROOT / "tests"))
import schnorr, party, hostbin
from events import sign, KIND_DOC
from websockets.asyncio.client import connect
from playwright.async_api import async_playwright

OUT = ROOT / "tests/out"; OUT.mkdir(exist_ok=True)
OWNER_WORDS = party.words_new(); OWNER = party.key_from_words(OWNER_WORDS)
HA = secrets.token_bytes(32); PA, WEB = 17481, 18081; UA = f"ws://127.0.0.1:{PA}"
pk = lambda s: schnorr.pubkey_gen(s).hex()
procs = []

def check(cond, what):
    print(("PASS " if cond else "FAIL ") + what)
    if not cond:
        [p.terminate() for p in procs]; sys.exit(1)

def doc(secret, path, content, at=None):
    return sign(secret, KIND_DOC, [["d", path], ["c", path.split("/")[0]], ["p", "1"], ["ms", "1"]], json.dumps(content), created_at=at)

async def pub(*evs):
    async with connect(UA) as ws:
        await ws.recv()
        for e in evs:
            await ws.send(json.dumps(["EVENT", e]))
            while json.loads(await ws.recv())[0] != "OK": pass

async def main():
    hostbin.build()
    tmp = pathlib.Path(tempfile.mkdtemp()); (tmp / "party").mkdir()
    cfg = {"owners": [pk(OWNER)], "registrars": [], "hosts": [{"url": UA, "pubkey": pk(HA), "name": "Host A"}]}
    (tmp / "party/party.json").write_text(json.dumps(cfg))
    (tmp / "party/party.signed.json").write_text(json.dumps(party.signed_event(cfg, OWNER)))
    subprocess.run([sys.executable, str(ROOT / "tools/build.py"), "--party", str(tmp / "party"), "--out", str(tmp / "dist"), "--no-host", "--directory", "http://127.0.0.1:9"], check=True, stdout=subprocess.DEVNULL)
    procs.append(subprocess.Popen([sys.executable, "-m", "http.server", "-d", str(tmp / "dist/site"), str(WEB), "--bind", "127.0.0.1"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    procs.append(hostbin.start(PA, pk(OWNER), secret=HA, db=str(tmp / "a.db")))
    await asyncio.sleep(1)
    await pub(json.loads((tmp / "party/party.signed.json").read_text()))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        async def device(w, h):
            ctx = await b.new_context(viewport={"width": w, "height": h}, service_workers="block", color_scheme="dark")
            pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.goto(f"http://127.0.0.1:{WEB}/app/"); return pg
        async def join(pg, town):
            await pg.wait_for_selector("[data-act=intro-done]", timeout=15000); await pg.click("[data-act=intro-done]")
            await pg.fill("#addr-q", "100 Main St, " + town); await pg.dispatch_event("#addr-q", "input"); await pg.click("[data-act=join]")
        # the owner joins Abbotsford: the notices sit on top of the grid page, with arrows to step through them
        opg = await device(390, 844)
        await opg.click("[data-cpa=have]"); await opg.fill("#cp-w", OWNER_WORDS); await opg.dispatch_event("#cp-w", "input"); await opg.click("[data-cpa=ok]")
        await join(opg, "Abbotsford"); await opg.wait_for_selector(".ncard", timeout=15000); await opg.wait_for_timeout(1500)
        first = await opg.evaluate("[...document.querySelectorAll('#app main > *')].findIndex(e=>e.classList.contains('ncard'))")
        check(first == 0, "the notices are the first thing on the grid page")
        await opg.screenshot(path=str(OUT / "line-notices-phone.png"))
        n0 = await opg.inner_text(".npos")
        await opg.click(".narr[data-v='1']"); await opg.wait_for_timeout(800)
        n1 = await opg.inner_text(".npos")
        check(n0.startswith("1/") and n1.startswith("2/"), "the › arrow steps to the next notice (%s, then %s)" % (n0, n1))
        await opg.screenshot(path=str(OUT / "line-notices-phone-2.png"))
        dpg = opg; await dpg.set_viewport_size({"width": 1280, "height": 800}); await dpg.wait_for_timeout(800)
        await dpg.click(".narr[data-v='1']"); await dpg.wait_for_timeout(800)
        await dpg.screenshot(path=str(OUT / "line-notices-desktop.png"))
        for tab in ("vote", "search"):
            await dpg.click("[data-act=tab][data-v=%s]" % tab); await dpg.wait_for_timeout(600)
            first = await dpg.evaluate("[...document.querySelectorAll('#app main > *')].findIndex(e=>e.classList.contains('ncard'))")
            check(first == 0, "on the %s tab too, the notices come before the page title" % tab)
            await dpg.screenshot(path=str(OUT / ("line-%s-desktop.png" % tab)))
            await dpg.emulate_media(color_scheme="light"); await dpg.wait_for_timeout(200)
            await dpg.screenshot(path=str(OUT / ("line-%s-desktop-light.png" % tab))); await dpg.emulate_media(color_scheme="dark")
        box = await dpg.eval_on_selector(".brandbtn", "e=>{const r=e.getBoundingClientRect(),h=document.querySelector('.hdr').getBoundingClientRect();return [r.height,h.height]}")
        check(box[0] >= box[1] - 18, "the Citizens Party button fills the header's height (%d of %d px)" % tuple(box))
        await dpg.click(".brandbtn"); await dpg.wait_for_timeout(500)
        check(await dpg.locator(".ghead").count() == 1, "the Citizens Party name at the top goes back to your grid")
        await dpg.set_viewport_size({"width": 390, "height": 844})
        cell = await opg.evaluate("window.claude.use('db').then(db=>db.doc('members/'+window.CPAccount.me()).get()).then(s=>s.data().cell)")
        # with room today, "I'm new here" gives new 12 words
        npg = await device(390, 844)
        await npg.click("[data-cpa=new]"); await npg.wait_for_selector(".cp-words li", timeout=15000)
        check(True, "with room today, \"I'm new here\" gives new 12 words")
        # 100 people got their keys and got in today (the beta's daily limit)
        await pub(*[doc(OWNER, "reg/" + pk(secrets.token_bytes(32)), {"ok": True, "cell": "1D", "at": int(time.time() * 1000)}) for _ in range(100)])
        # once the day is full, a new visitor isn't given 12 words; nothing is held for them
        gpg = await device(390, 844)
        await gpg.click("[data-cpa=new]")
        await gpg.wait_for_selector("text=No spots left today", timeout=15000)
        check(await gpg.locator(".cp-words").count() == 0, "once 100 got in today, a new visitor sees No spots left today, and no 12 words")
        await gpg.screenshot(path=str(OUT / "gate-phone.png"))
        await gpg.set_viewport_size({"width": 1280, "height": 800}); await gpg.wait_for_timeout(300)
        await gpg.screenshot(path=str(OUT / "gate-desktop.png"))
        await gpg.click("[data-cpa=back]"); await gpg.wait_for_timeout(300)
        check(await gpg.locator("[data-cpa=have]").count() == 1, "Back returns to the welcome screen, where restoring 12 words still works")
        check(not errs, "no page errors %s" % errs)
    [p.terminate() for p in procs]

try:
    asyncio.run(main())
finally:
    [p.terminate() for p in procs]
