#!/usr/bin/env python3
"""Check the signed vote record end to end, against the mock runtime.

Seeds sample votes (all signed and sealed), casts one real vote, confirms the check passes,
then tampers with the record and with the count and confirms both are caught.
Run after building:  python3 tools/build.py && python3 tests/record.py
Pass: "checks out" first, then problems listed after each tamper, and no page errors.
"""
import asyncio, json, pathlib
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"; OUT.mkdir(exist_ok=True)
ME = "u_test_owner"
store = {"members/" + ME: {"cell": "11-10", "town": "Burnaby", "joinedAt": 1, "introAt": 1, "cand": {}, "res": []},
         "config/settings": {"hours": 72, "minVoters": 5, "penalty": 72, "probation": 0}}
mock = (HERE / "mock.js").read_text().replace("const store={};", "const store=" + json.dumps(store) + ";").replace('id:async()=>"u_me"', 'id:async()=>"' + ME + '"')
from apppage import app_body
APP = app_body()
PAGE = OUT / "record.html"
PAGE.write_text('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><script>' + mock + '</script></head><body>' + APP + '</body></html>', encoding="utf-8")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(**p.devices['iPhone 13'])).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(PAGE.as_uri()); await pg.wait_for_timeout(500)
        ev = pg.evaluate; click = lambda sel: pg.eval_on_selector(sel, 'e=>e.click()')
        act = lambda a, v='', i='': ev(f"(()=>{{const b=document.createElement('button');b.dataset.act='{a}';b.dataset.v='{v}';b.dataset.id='{i}';document.body.appendChild(b);b.click();b.remove()}})()")
        status = lambda: ev("document.querySelector('.recst').innerText.split('\\n').slice(0,2).join(' ')")
        probs = lambda: ev("(document.querySelector('.recprob')||{innerText:''}).innerText")
        await act('tab', 'me'); await pg.wait_for_timeout(200)
        await click('[data-act=sim-add][data-v=mine]'); await pg.wait_for_timeout(400)
        await click('[data-act=seed]')
        for _ in range(90):
            await pg.wait_for_timeout(500)
            if await ev("[...document.querySelectorAll('.toast')].some(t=>t.textContent.includes('Sample votes sealed.'))"): break
        ids = await ev("Object.keys(__store).filter(k=>k.startsWith('items/')&&__store[k].kind==='principle'&&__store[k].closes>Date.now()&&__store[k].level==='cell').map(k=>k.slice(6))")
        mine = [i for i in ids if not await ev(f"((__store['turnout/{ME}']||{{}}).b||{{}})['{i}']")]
        if mine:
            await act('cast', 'y', mine[0]); await pg.wait_for_timeout(1500)
        await act('open-record'); await pg.wait_for_timeout(2500)
        print("clean record:", await status()); await pg.screenshot(path=str(OUT / 'record-clean.png'), full_page=True)
        await act('back'); await act('tab', 'me'); await pg.wait_for_timeout(200)
        await click('[data-act=tamper-rec]'); await pg.wait_for_timeout(300); await act('open-record'); await pg.wait_for_timeout(2500)
        print("after changing a block:", await status(), "|", (await probs()).replace("\n", " / ")[:300])
        await act('back'); await act('tab', 'me'); await pg.wait_for_timeout(200)
        await click('[data-act=rec-clear]'); await pg.wait_for_timeout(500)
        await click('[data-act=sim-vote]'); await pg.wait_for_timeout(3000)
        await click('[data-act=tamper-count]'); await pg.wait_for_timeout(300); await act('open-record'); await pg.wait_for_timeout(2500)
        print("after changing the count:", await status(), "|", (await probs()).replace("\n", " / ")[:300])
        print("page errors:", errs); await b.close()

asyncio.run(main())
