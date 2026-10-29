#!/usr/bin/env python3
"""Screenshots of the app for the landing page (landing/shots/<name>-light.webp and -dark.webp), taken from the built app (dist/app) with the
test runtime (tests/mock.js): a grid with a few passed principles, an open vote, the Votes tab, the vote record.

Run: python3 tools/build.py && python3 tools/make_shots.py      (needs playwright, like the tests)
"""
import asyncio, json, pathlib, sys, time
from playwright.async_api import async_playwright
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))
from apppage import app_body

OUT = ROOT / "landing/shots"; OUT.mkdir(exist_ok=True)
now = int(time.time() * 1000)
store = {"members/u_me": {"cell": "11-10", "town": "Burnaby", "joinedAt": now - 864e5, "introAt": now - 864e5, "cand": {}, "res": []}}
mock = (ROOT / "tests/mock.js").read_text().replace("const store={};", "const store=" + json.dumps(store) + ";") \
    .replace("isOwner:async()=>true", "isOwner:async()=>false")
PAGE = ROOT / "tests/out/shots.html"; PAGE.parent.mkdir(exist_ok=True)
PAGE.write_text('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><script>'
                + mock + '</script></head><body>' + app_body() + '</body></html>', encoding="utf-8")

PASSED = ["Party finances are published every month.", "Members choose their own candidates.",
          "Elected members vote the way their grid decides."]
OPEN = "Every party meeting is streamed live."


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for scheme in ("light", "dark"):
            await shoot(b, scheme)
        await b.close()
    for f in OUT.glob("*.png"):
        Image.open(f).convert("RGB").save(f.with_suffix(".webp"), quality=82)
        f.unlink()
    print("shots in", OUT)


async def shoot(b, scheme):
    shot = lambda name: pg.screenshot(path=str(OUT / ("%s-%s.png" % (name, scheme))))
    ctx = await b.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=2, is_mobile=True,
                              has_touch=True, color_scheme=scheme, locale="en-CA")
    pg = await ctx.new_page()
    await pg.goto(PAGE.as_uri()); await pg.wait_for_timeout(600)
    tap = lambda sel: pg.tap(sel, force=True)

    async def hide_notices():
        for _ in range(6):
            if not await pg.locator(".nhide").count():
                break
            await tap(".nhide >> nth=0"); await pg.wait_for_timeout(250)

    async def propose(slot, text):
        await tap("[data-act=tab][data-v=plat]"); await pg.wait_for_timeout(300)
        if slot > 1:
            await tap("[data-act=amend]"); await pg.wait_for_timeout(300)
        await pg.click('[data-act=pe][data-v=gap][data-id="%d"]' % slot); await pg.wait_for_timeout(300)
        await pg.fill("#pl-in", text); await pg.dispatch_event("#pl-in", "input")
        await pg.wait_for_timeout(400); await tap("#pl-go"); await pg.wait_for_timeout(400)
        await tap(".prcpt1 [data-act=open-item]"); await pg.wait_for_timeout(300)
        iid = await pg.evaluate("t=>Object.keys(__store).filter(k=>k.startsWith('items/')).find(k=>JSON.stringify(__store[k]).includes(t))", text)
        await pg.evaluate("id=>{const b=document.createElement('button');b.dataset.act='istage';b.dataset.v=id;document.body.appendChild(b);b.click();b.remove()}", iid[6:])
        await pg.wait_for_timeout(400)

    await hide_notices()
    for i, t in enumerate(PASSED):
        await propose(i + 1, t)
        await tap(".ynb-y"); await pg.wait_for_timeout(150); await tap(".ynb-y"); await pg.wait_for_timeout(2500)
    # a lived-in grid: neighbors who joined after the votes above closed and before the open one
    await pg.evaluate("n=>{const t=Date.now();for(let i=0;i<n;i++)__store['members/u_n'+i]={cell:'11-10',town:'Burnaby',joinedAt:t,introAt:t,cand:{},res:[]};__notify()}", 146)
    await pg.wait_for_timeout(300)
    await propose(len(PASSED) + 1, OPEN)
    await hide_notices()
    await shot("vote")
    await tap("[data-act=tab][data-v=plat]"); await pg.wait_for_timeout(500)
    await hide_notices(); await pg.evaluate("scrollTo(0,0)")
    await shot("grid")
    await tap("[data-act=tab][data-v=search]"); await pg.wait_for_timeout(500)
    await hide_notices()
    await shot("votes")
    await pg.click("[data-act=open-record]"); await pg.wait_for_timeout(1500)
    await shot("record")
    await ctx.close()

asyncio.run(main())
