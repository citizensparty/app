#!/usr/bin/env python3
"""Walk the whole tutorial on a phone (390x844, dark and light) and a desktop viewport, against the mock runtime.

Needs: pip install playwright && playwright install chromium
Run after building:  python3 tools/build.py && python3 tests/tour.py
Pass: each run ends with "Joined Kamloops area" and an empty problem list.
Screenshots of every step go to tests/out/ (tour-<mode>-NN-name.png).
"""
import asyncio, pathlib
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"; OUT.mkdir(exist_ok=True)
from apppage import app_body
APP = app_body()
PAGE = OUT / "tour.html"
PAGE.write_text('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><script>'
                + (HERE / "mock.js").read_text() + '</script></head><body>' + APP + '</body></html>', encoding="utf-8")


async def run(p, mode, scheme):
    b = await p.chromium.launch()
    opts = dict(p.devices['iPhone 13']) if mode == 'ph' else {'viewport': {'width': 900, 'height': 900}}
    opts['color_scheme'] = scheme
    ctx = await b.new_context(**opts)
    pg = await ctx.new_page(); errs = []; probs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(PAGE.as_uri()); await pg.wait_for_timeout(400)
    T0 = (pg.tap if mode == 'ph' else pg.click); W = pg.wait_for_timeout
    T = lambda sel: T0(sel, force=True)  # pulsing targets never sit still
    tag = mode + ('' if scheme == 'dark' else '-light')
    n = [0]

    async def shot(name):
        n[0] += 1
        await pg.screenshot(path=str(OUT / f'tour-{tag}-{n[0]:02d}-{name}.png'))

    foot = lambda: pg.evaluate("(document.querySelector('.tfoot > .btn')||{}).textContent||''")

    async def no_foot(where):
        f = await foot()
        if f: probs.append(f'{where}: bottom button "{f}" before the task is done')

    async def fits(where):  # the page ends at the content: no empty area to scroll into
        over = await pg.evaluate("document.documentElement.scrollHeight-innerHeight")
        if over > 1: probs.append(f'{where}: scrolls {over}px')

    async def no_scroll_past(where):  # whatever scrolls, it ends at the pinned button
        gap = await pg.evaluate("(()=>{const f=document.querySelector('.tut');if(!f)return 0;return document.documentElement.scrollHeight-(f.getBoundingClientRect().bottom+scrollY)})()")
        if gap > 1: probs.append(f'{where}: {gap}px of empty page below the button')

    await shot('welcome'); await fits('welcome')
    await T('[data-act=tour-start]'); await W(300); await shot('pick-grid'); await no_foot('pick a grid')
    pos = await pg.evaluate("(()=>{const v=document.querySelector('rect.pulse');const r=v.getBBox();const svg=v.ownerSVGElement;const pt=svg.createSVGPoint();pt.x=r.x+r.width/2;pt.y=r.y+r.height/2;const q=pt.matrixTransform(svg.getScreenCTM());return [q.x,q.y]})()")
    await pg.mouse.click(*pos); await W(150); await shot('grid-picked')
    if await foot() != 'Continue': probs.append('pick a grid: no Continue after picking')
    await T('[data-v=grid-go]'); await W(150); await shot('practice-grid'); await T('[data-act=tour-next]'); await W(250)
    await shot('first-principle'); await no_foot('first principle')
    await T('.prow.first'); await W(250); await shot('first-typing')
    await pg.fill('#tx-in', 'We should maximize the number of citizens who own land outright.'); await pg.dispatch_event('#tx-in', 'input')
    await T('#tx-go'); await W(150); await shot('first-proposed'); await no_foot('after proposing')
    await T('.tbody [data-v=tovotes]'); await W(150); await shot('vote'); await no_foot('vote')
    await T('.ynb-y'); await W(80)
    if not await pg.is_visible('.ynhint') or (await pg.inner_text('.ynb-y')).strip() != 'Yes': probs.append('vote: first tap does not ask to confirm under the buttons')
    await shot('vote-confirm'); await T('.ynb-y'); await W(150); await shot('waiting')
    if await pg.locator('#sc-prog').count() != 1: probs.append('waiting: no progress line')
    await T('.tfoot > .btn'); await W(8600); await shot('result'); await no_foot('result')
    await T('[data-v=breakdown]'); await W(200); await shot('every-vote'); await no_foot('every vote')
    await T('summary[data-v=myrcpt]'); await W(150); await shot('receipt')
    if 'matches every copy' not in await pg.inner_text('.lrow.me'): probs.append('every vote: no receipt')
    await T('[data-act=tour-next]'); await W(250)
    await shot('insert'); await no_foot('insert')
    await T('[data-act=tx][data-v=amend]'); await W(100); await no_foot('insert, amending')
    await pg.eval_on_selector('.pins[data-id="3"]', 'e=>e.click()'); await W(600); await T('#pl-go'); await W(100); await shot('insert-proposed')
    await T('[data-v=tovote]'); await W(150); await shot('insert-change'); await T('[data-v=ballot]'); await W(100)
    await T('.ynb-y'); await T('.ynb-y'); await W(100); await shot('insert-voted'); await no_scroll_past('insert voted')
    await T('[data-act=tour-next]'); await W(200); await shot('reword')
    await pg.eval_on_selector('[data-act=tx][data-v=edit][data-id="5"]', 'e=>e.click()'); await pg.fill('#pl-in', 'Taxes should be low.'); await pg.dispatch_event('#pl-in', 'input'); await W(600)
    await T('#pl-go'); await T('[data-v=tovote]'); await W(100); await T('[data-v=ballot]'); await W(80); await T('.ynb-y'); await T('.ynb-y'); await W(80); await shot('reword-voted')
    await T('[data-act=tour-next]'); await W(200); await shot('remove')
    await pg.eval_on_selector('[data-act=tx][data-v=del][data-id="7"]', 'e=>e.click()'); await pg.eval_on_selector('[data-v=remove-go]', 'e=>e.click()')
    await T('[data-v=tovote]'); await W(100); await T('[data-v=ballot]'); await W(80); await T('.ynb-y'); await T('.ynb-y'); await W(80); await shot('remove-voted')
    await T('[data-act=tour-next]'); await W(250); await shot('move')
    await pg.hover('.prow[data-n="2"]'); bb = await pg.locator('[data-grip="2"]').bounding_box(); r5 = await pg.locator('.prow[data-n="5"]').bounding_box()
    await pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); await pg.mouse.down()
    for i in range(1, 11):
        await pg.mouse.move(bb['x'] + 5, bb['y'] + (r5['y'] + r5['height'] * 0.8 - bb['y']) * i / 10); await W(20)
    await pg.mouse.up(); await W(150); await T('[data-v=move-go]'); await T('[data-v=tovote]'); await W(100); await T('[data-v=ballot]'); await W(80); await T('.ynb-y'); await T('.ynb-y'); await W(80); await shot('move-voted')
    await T('[data-act=tour-next]'); await W(250); await shot('history'); await no_foot('history')
    await T('[data-act=tx][data-v=hist]'); await W(150); await shot('versions')
    await T('.vnav [data-v^=v] >> nth=1'); await W(700); await shot('older'); await no_foot('older')
    await T('[data-v=hvote]'); await W(150); await shot('history-vote')
    if await foot() != 'Next: Find your grid': probs.append('history: no Next after seeing the vote')
    await T('[data-act=tour-next]'); await W(250); await shot('find-grid'); await no_foot('find your grid')
    await pg.fill('#addr-q', '123 Main St, Kamloops'); await pg.dispatch_event('#addr-q', 'input'); await W(150); await shot('grid-found')
    j = await foot()
    if j != 'Join Kamloops area': probs.append(f'find your grid: button is "{j}"')
    await T('.tfoot > .btn'); await W(400); await shot('joined')
    who = await pg.evaluate("(document.querySelector('.gtitle')||{}).textContent||''")
    if 'Kamloops area' not in who: probs.append('after joining: not on the Kamloops grid page')
    if 'normally wait another' not in await pg.inner_text('#app'): probs.append('after joining: no new-member notice')
    print(tag, 'Joined ' + who.replace('▾', '').strip(), probs, errs); await b.close()


async def main():
    async with async_playwright() as p:
        await run(p, 'ph', 'dark'); await run(p, 'ph', 'light'); await run(p, 'dt', 'light')

asyncio.run(main())
