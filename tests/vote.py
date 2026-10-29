#!/usr/bin/env python3
"""A one-member grid (the beta waives the 20-member minimum): the member proposes a principle and votes Yes. The vote
closes early because everyone voted, and it's Passed, with the same word on the card and in Details, and 1 of 1 voted.
Against the mock runtime (tests/mock.js), on a phone in dark mode. Screenshots go to tests/out/vote-*.png.

Needs: pip install playwright && playwright install chromium
Run:   python3 tools/build.py && python3 tests/vote.py      (PASS lines; exits non-zero on the first failure)
"""
import asyncio, json, pathlib, sys, time
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"; OUT.mkdir(exist_ok=True)
sys.path.insert(0, str(HERE))
from apppage import app_body

ME = "u_me"
now = int(time.time() * 1000)
store = {"members/" + ME: {"cell": "11-10", "town": "Burnaby", "joinedAt": now - 60000, "introAt": now - 60000, "cand": {}, "res": []},
         "config/settings": {"hours": 72, "minVoters": 5, "penalty": 72, "probation": 0}}
mock = (HERE / "mock.js").read_text().replace("const store={};", "const store=" + json.dumps(store) + ";").replace("isOwner:async()=>true", "isOwner:async()=>false")
PAGE = OUT / "vote.html"
PAGE.write_text('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><script>'
                + mock + '</script></head><body>' + app_body() + '</body></html>', encoding="utf-8")
fails = []


def check(cond, what):
    print("PASS" if cond else "FAIL", what)
    if not cond:
        fails.append(what)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(**p.devices["iPhone 13"], color_scheme="dark", locale="en-CA")  # "8:56 p.m.", like the user's phone
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(PAGE.as_uri()); await pg.wait_for_timeout(600)
        tap = lambda sel: pg.tap(sel, force=True)
        await tap("[data-act=tab][data-v=plat]"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=str(OUT / "vote-1-grid.png"))
        await tap('[data-act=pe][data-v=gap][data-id="1"]'); await pg.wait_for_timeout(200)
        await pg.fill("#pl-in", "Every grid keeps its own record."); await pg.dispatch_event("#pl-in", "input")
        await pg.wait_for_timeout(500); await tap("#pl-go"); await pg.wait_for_timeout(400)
        iid = await pg.evaluate("Object.keys(__store).find(k=>k.startsWith('items/'))")
        check(bool(iid), "slot 1 is tappable without Amend mode, and the proposal is saved")
        iid = iid[6:]
        check("p.m.." not in await pg.inner_text("#app") and "a.m.." not in await pg.inner_text("#app"), "no double period after the time")
        await tap(".prcpt1 [data-act=open-item]"); await pg.wait_for_timeout(300)  # "View its vote" on the receipt
        await pg.evaluate("id=>{const b=document.createElement('button');b.dataset.act='istage';b.dataset.v=id;document.body.appendChild(b);b.click();b.remove()}", iid)
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=str(OUT / "vote-2-open.png"), full_page=True)
        check("1 supporter" in await pg.inner_text("#app"), "a 1-member grid needs 1 supporter")
        await tap(".ynb-y"); await pg.wait_for_timeout(150)
        check((await pg.inner_text(".ynb-y")).strip().endswith("Yes") and "Tap again to confirm" in await pg.inner_text("#app"), "first tap: the label stays Yes, with \"Tap again to confirm\" below")
        await pg.screenshot(path=str(OUT / "vote-3-confirm.png"))
        await tap(".ynb-y"); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=str(OUT / "vote-4-closed.png"), full_page=True)
        txt = await pg.inner_text("#app")
        chip = await pg.evaluate("(document.querySelector('.vc1 .chip')||{}).textContent||''")
        check(chip == "Passed", "the vote closes early as Passed (chip: %r)" % chip)
        rows = await pg.evaluate("[...document.querySelectorAll('.wc .kv')].map(r=>r.innerText.replace(/\\s+/g,' '))")
        check(any(r.startswith("Passed") for r in rows) and not any(r.startswith(("Rejected", "Expired")) for r in rows), "Details says Passed too %s" % rows[:4])
        check("1 of 1 voted" in txt, "1 of 1 voted")
        check("Gathering support" not in txt and "Needs 1 supporter" not in txt, "a closed vote doesn't show the supporter box")
        check("You voted Yes" in txt, "the card says You voted Yes")
        # F3: after voting, Back goes to where you were before the vote page, never back to the ballot
        await pg.go_back(); await pg.wait_for_timeout(400)
        check(await pg.locator("h1.gtitle").count() == 1 and await pg.locator(".ynb").count() == 0, "after voting, Back returns to the grid page, not the ballot")
        check(await pg.locator(".prcpt1").count() == 0 and await pg.locator(".blurred").count() == 0 and "Done amending" not in await pg.inner_text("#app"), "...a clean grid: no receipt banner, nothing blurred, not in Amend mode")
        # no ✕ or ✎ on empty slots
        await tap("[data-act=amend]"); await pg.wait_for_timeout(300)
        n = await pg.evaluate("document.querySelectorAll('.plist .prow:not(.pempty)').length")
        tools = await pg.evaluate("[document.querySelectorAll('.pico[data-v=del]').length,document.querySelectorAll('.pico[data-v=edit]').length]")
        check(tools == [n, n] and await pg.evaluate("[...document.querySelectorAll('.pempty')].every(r=>!r.querySelector('.pico'))"), "✕ and ✎ only on slots that hold a principle (%s for %d)" % (tools, n))
        await tap("[data-act=amend]"); await pg.wait_for_timeout(200)
        # F3: a jump to another bottom tab is one step back too
        await tap(".stat[data-act=grid-votes]"); await pg.wait_for_timeout(300)
        on_votes = "Every vote, in every grid" in await pg.inner_text("#app")
        await pg.go_back(); await pg.wait_for_timeout(400)
        check(on_votes and await pg.locator("h1.gtitle").count() == 1, "Open votes jumps to the Votes tab, and Back returns to the grid page")
        # B1: the phone's Back button steps back inside the app
        await tap("[data-act=tab][data-v=plat]"); await pg.wait_for_timeout(300)
        await tap('.pills [data-act=car][data-id="3"]'); await pg.wait_for_timeout(700)
        await tap("[data-act=open-member]"); await pg.wait_for_timeout(300)
        check(await pg.locator(".pills[data-car=mem]").count() == 1, "a member's page opens from the Members tab")
        await pg.go_back(); await pg.wait_for_timeout(500)
        pressed = await pg.evaluate("[...document.querySelectorAll('.pills[data-car=plat] button')].map(b=>b.getAttribute('aria-pressed'))")
        check(pressed[0] == "false" and pressed[3] == "true" and await pg.locator(".pills[data-car=mem]").count() == 0, "Back returns to the grid page with the Members tab still open %s" % pressed)
        await pg.go_back(); await pg.wait_for_timeout(500)
        pressed = await pg.evaluate("[...document.querySelectorAll('.pills[data-car=plat] button')].map(b=>b.getAttribute('aria-pressed'))")
        check(pressed[0] == "true" and pressed[3] == "false", "Back again returns to the Principles tab %s" % pressed)
        # F4: the tab bar sticks, and a short tab never leaves blank space below it
        sticky = await pg.evaluate("getComputedStyle(document.querySelector('.pills[data-car=plat]')).position")
        await tap('.pills [data-act=car][data-id="3"]'); await pg.wait_for_timeout(700)
        gap = await pg.evaluate("(()=>{const c=document.getElementById('car-plat'),p=c.children[3],h=document.querySelector('.hdr').offsetHeight,t=document.getElementById('tabs');const room=innerHeight-h-c.previousElementSibling.offsetHeight-(t&&!t.hidden?t.offsetHeight:0)-8;return c.offsetHeight-Math.max(p.offsetHeight,room)})()")
        check(sticky == "sticky" and abs(gap) <= 1, "the tab bar is sticky and the Members tab takes its own height (off by %spx)" % gap)
        # feedback from the app: Settings → Send feedback (no server here, so it says it didn't send, and keeps the text)
        await tap("[data-act=tab][data-v=me]"); await pg.wait_for_timeout(300)
        await pg.eval_on_selector('.pills[data-car=mem] [data-act=car][data-id="2"]', 'e=>e.click()'); await pg.wait_for_timeout(500)
        await pg.eval_on_selector("[data-act=feedback]", "e=>e.click()"); await pg.wait_for_timeout(300)
        await pg.fill("#fb-msg", "A test message."); await tap("#fb-go"); await pg.wait_for_timeout(1200)
        check("didn't send" in await pg.inner_text("#fb-st") and await pg.input_value("#fb-msg") == "A test message.", "the app's feedback screen sends, and says so when it can't")
        # moving grids: a warning with Why?, and (beta: the wait is waived) the member votes in the new grid the same quarter
        await pg.go_back(); await pg.wait_for_timeout(400)
        await pg.eval_on_selector("[data-act=move-form]", "e=>e.click()"); await pg.wait_for_timeout(400)
        check("locks your account for 72 hours" in await pg.inner_text("#app") and await pg.locator(".lockwarn [data-act=why-lock]").count() == 1, "Change my grid warns that moving locks the account for 72 hours, with Why?")
        await pg.eval_on_selector(".lockwarn [data-act=why-lock]", "e=>e.click()"); await pg.wait_for_timeout(200)
        check("move in just to vote" in await pg.inner_text(".qbox"), "Why? explains it stops people moving in to vote on proposals they like")
        await pg.eval_on_selector(".qbox [data-ask]", "e=>e.click()"); await pg.wait_for_timeout(200)
        before = await pg.evaluate("window.__store['members/'+window.claude.__me].cell") if await pg.evaluate("!!window.claude.__me") else None
        await pg.fill("#gp-q", "Prince George"); await pg.dispatch_event("#gp-q", "input"); await pg.wait_for_timeout(300)
        await pg.eval_on_selector("[data-act=mv-pick]", "e=>e.click()"); await pg.wait_for_timeout(200)
        await pg.eval_on_selector(".qbox [data-ask=go]", "e=>e.click()"); await pg.wait_for_timeout(800)
        await tap("[data-act=tab][data-v=plat]"); await pg.wait_for_timeout(400)
        check("Prince George" in await pg.inner_text("h1.gtitle") or "Prince George" in await pg.inner_text(".gsum"), "the member moved to the Prince George area")
        await tap('[data-act=pe][data-v=gap][data-id="1"]'); await pg.wait_for_timeout(200)
        await pg.fill("#pl-in", "Votes follow the voter."); await pg.dispatch_event("#pl-in", "input")
        await pg.wait_for_timeout(500); await tap("#pl-go"); await pg.wait_for_timeout(400)
        await tap(".prcpt1 [data-act=open-item]"); await pg.wait_for_timeout(300)
        iid2 = await pg.evaluate("Object.keys(__store).filter(k=>k.startsWith('items/')).map(k=>k.slice(6)).find(k=>__store['items/'+k].text==='Votes follow the voter.')")
        await pg.evaluate("id=>{const b=document.createElement('button');b.dataset.act='istage';b.dataset.v=id;document.body.appendChild(b);b.click();b.remove()}", iid2)
        await pg.wait_for_timeout(300); await tap(".ynb-y"); await pg.wait_for_timeout(150); await tap(".ynb-y"); await pg.wait_for_timeout(2500)
        chip = await pg.evaluate("(document.querySelector('.vc1 .chip')||{}).textContent||''")
        check(chip == "Passed" and "1 of 1 voted" in await pg.inner_text("#app"), "after moving, the same quarter, the member's vote counts in the new grid (%s)" % chip)
        # ignoring a member: their proposals are hidden while they gather support, with Why?
        await pg.evaluate("""id=>{const me=__store['members/u_me'];__store['members/sim-ign1']={cell:me.cell,town:'Prince George',joinedAt:Date.now()-864e5,cand:{},res:[],sim:true};
          const it=JSON.parse(JSON.stringify(__store['items/'+id]));Object.assign(it,{by:'sim-ign1',text:'Spam spam spam.',at:Date.now(),closes:Date.now()+72*3600e3});__store['items/sim-ign1-x1']=it;__notify()}""", iid2)
        await pg.wait_for_timeout(500)
        click = "a=>{const b=document.createElement('button');b.dataset.act=a[0];b.dataset.v=a[1];document.body.appendChild(b);b.click();b.remove()}"
        await pg.evaluate(click, ["open-member", "sim-ign1"]); await pg.wait_for_timeout(400)
        check(await pg.locator(".ignrow [data-act=ign]").count() == 1 and await pg.locator(".ignrow [data-act=why-ign]").count() == 1, "another member's page has Ignore this member, with Why?")
        await pg.eval_on_selector(".ignrow [data-act=why-ign]", "e=>e.click()"); await pg.wait_for_timeout(200)
        check("nobody should have" in await pg.inner_text(".qbox"), "Why? explains members ignore instead of anyone blocking")
        await pg.eval_on_selector(".qbox [data-ask]", "e=>e.click()"); await pg.wait_for_timeout(200)
        await tap("[data-act=tab][data-v=search]"); await pg.wait_for_timeout(400)
        check("Spam spam spam." in await pg.inner_text("#app"), "before ignoring, their proposal is on the Votes tab")
        await pg.evaluate(click, ["ign", "sim-ign1"]); await pg.wait_for_timeout(400)
        txt = await pg.inner_text("#app")
        check("Spam spam spam." not in txt and "from members you ignore" in txt, "after ignoring, it's hidden, with a note to show it again")
        await pg.screenshot(path=str(OUT / "vote-ignore.png"))
        await pg.eval_on_selector("[data-act=show-ign]", "e=>e.click()"); await pg.wait_for_timeout(300)
        check("Spam spam spam." in await pg.inner_text("#app"), "Show them brings it back")
        check(not errs, "no page errors %s" % errs)
        await b.close()
    if fails:
        sys.exit(1)

asyncio.run(main())
