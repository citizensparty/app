#!/usr/bin/env python3
"""The app with sample data, for store screenshots: the page and the script inside it that sets up each scene.

Used by ios_shots.py (inside Apple's iPhone simulator). Run it on its own to try the scenes in Chromium at the
6.9-inch iPhone size (440 x 956 points, 3x):

  python3 tools/build.py && python3 native/scripts/sample_shots.py <output dir>

Scenes, in App Store order: 1 the grid (about 18,000 members), 2 a proposed change (what the grid's principles would
look like), 3 that vote after voting (15,000 ballots over two days), 4 the Votes tab (1,013 votes across BC), 5 the vote record.
The page tells whoever is watching when a scene is ready: GET http://127.0.0.1:PORT/shot?name=<scene>-<scheme>,
then /done (and /log?m=… for problems).
"""
import json, pathlib, re, sys, time

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests"))
from apppage import app_body

PORT = 8123

DRIVER = r"""
(function(){
const S_="http://127.0.0.1:%d",CELLS=__CELLS__;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const q=s=>document.querySelector(s);
const tap=async(s,ms)=>{const e=q(s);if(!e)throw new Error("missing "+s);e.click();await wait(ms||400)};
const act=async(a,v,ms)=>{const b=document.createElement("button");b.dataset.act=a;b.dataset.v=v;document.body.appendChild(b);b.click();b.remove();await wait(ms||500)};
const shot=name=>fetch(S_+"/shot?name="+encodeURIComponent(name)).catch(()=>{});
const log=m=>fetch(S_+"/log?m="+encodeURIComponent(m)).catch(()=>{});
window.addEventListener("error",e=>log("page error: "+e.message));
async function hide(){for(let i=0;i<6&&q(".nhide");i++)await tap(".nhide",250)}
const itemWith=t=>{const k=Object.keys(__store).filter(k=>k.startsWith("items/")).find(k=>__store[k].text===t);return k&&k.slice(6)};
async function propose(slot,text){
  await tap(".tabs-in [data-act=tab][data-v=plat]",300);
  if(slot>1)await tap("[data-act=amend]",300);
  await tap('[data-act=pe][data-v=gap][data-id="'+slot+'"]',300);
  const i=q("#pl-in");i.value=text;i.dispatchEvent(new Event("input",{bubbles:true}));await wait(400);
  await tap("#pl-go");await tap(".prcpt1 [data-act=open-item]",300);
  await act("istage",itemWith(text),400)}
async function top(){await hide();scrollTo(0,0);await wait(400)}
async function main(){
  const scheme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
  const real=Date.now.bind(Date);let ahead=0;Date.now=()=>real()+ahead;  // the sample's clock can move forward
  const H=3600e3,rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
  await wait(1500);await hide();
  // three principles this grid passed while it was small
  const passed=["Governments must run balanced budgets.","Small businesses should be supported.","Public schools are funded and managed by municipalities."];
  for(let i=0;i<passed.length;i++){await propose(i+1,passed[i]);await tap(".ynb-y",150);await tap(".ynb-y",500);
    const id=itemWith(passed[i]);for(let w=0;w<60&&!__store["ends/"+id];w++)await wait(250);if(!__store["ends/"+id])log("no early close for "+id);await wait(300)}
  await wait(5000);  // the "Vote sent" toast fades
  // the record now, while every vote in it is sealed (the neighbors' ballots below would wait 5 minutes to be sealed)
  await tap(".tabs-in [data-act=tab][data-v=search]",600);await tap("[data-act=open-record]",1500);scrollTo(0,0);await wait(300);await shot("5-record-"+scheme);
  // two days later: the neighbors joined (most of them vote), and members all over BC propose things
  const joined=Date.now()+H;ahead=50*H;const T=Date.now();
  const per=d=>{d=new Date(d);return d.getUTCFullYear()+"Q"+(Math.floor(d.getUTCMonth()/3)+1)};
  const NV=15000,NM=18412,voters=[];
  for(let i=0;i<NM;i++){const id=(i<NV?"sim-v":"u_n")+i;if(i<NV)voters.push(id);__store["members/"+id]={cell:"11-10",town:"Burnaby",joinedAt:joined,introAt:joined,cand:{},res:[],sim:i<NV||undefined}}
  const ideas=["Every home has fast internet.","Seniors ride transit for free.","Housing near transit can be built without rezoning.","Doctors can work in any BC town.","Rural roads are kept open all year.","Mines must pay to clean up after they close.","Every child gets a free school lunch.","Wildfire crews are hired all year round.","Ferries are run as part of the highway.","Farmland stays farmland.","Rent goes up no more than inflation.","Daycare costs no more than $10 a day.","Clinics stay open evenings and weekends.","Old-growth forests are protected.","Tuition is free at trades schools.","Towns decide where new housing goes.","Hospital wait times are posted online.","Bridges are tolled only to pay for themselves.","Gas taxes go only to roads and transit.","Mental health care is free.","Water belongs to the people of BC.","Local police answer to the town council.","Every bill says what it costs.","Ballots are counted by hand.","Members of the legislature post every expense.","Dental care is covered for children.","Speed cameras fund road safety only.","Public land can't be sold without a vote.","Small towns get a doctor before big ones get a second.","Fishing licences go to people who live here."];
  const cells=CELLS.filter(c=>c!=="11-10");let made=0;
  const item=(open)=>{const c=pick(cells),a="sim-a"+made,at=open?T-rnd(1,66)*H:T-rnd(4,80)*24*H;made++;
    __store["members/"+a]={cell:c,town:"",joinedAt:at-90*24*H,introAt:at-90*24*H,cand:{},res:[],sim:true};
    __store["items/"+a.replace(/[^0-9a-z]/gi,"")+"-"+Math.random().toString(36).slice(2,12)]={level:"cell",cell:c,by:a,at,closes:at+72*H,kind:"principle",text:pick(ideas),replaces:null,slot:null,pos:1}};
  for(let i=0;i<159;i++)item(true);for(let i=0;i<850;i++)item(false);
  __notify();await wait(2000);
  await tap(".tabs-in [data-act=tab][data-v=plat]",800);await top();await shot("1-grid-"+scheme);
  // a neighbor proposes making principle 2 concrete: the first page of its vote shows what would change
  const p2=itemWith(passed[1]),at=T-40*H,nid="ubill-"+Math.random().toString(36).slice(2,12);
  __store["members/u_bill"]={cell:"11-10",town:"Burnaby",joinedAt:joined,introAt:joined,cand:{},res:[]};
  __store["items/"+nid]={level:"cell",cell:"11-10",by:"u_bill",at,closes:at+72*H,kind:"principle",text:"Small businesses making less than one million are tax exempt.",replaces:p2,slot:null};__notify();await wait(800);
  await act("open-item",nid,800);await top();await shot("2-change-"+scheme);
  // the vote so far: a slow start with the two sides even, then a rush as Yes pulls ahead, then the pace slows
  const D=T-at-H,q=per(at),us=[];for(let i=0;i<NV;i++)us.push(Math.random()*0.995);us.sort((a,b)=>a-b);
  voters.forEach((id,i)=>{const u=us[i],tt=Math.round(at+0.3*D*Math.pow(-Math.log(1-u),1/1.6)),share=Math.max(0,Math.min(1,(i/NV-0.1)/0.15)),yes=0.49+0.12*share;
    const k=id+"-"+q;__store["stamps/"+k]={period:q,grid:"11-10",sim:true};__store["ballots/"+k+"_"+nid]={v:Math.random()<yes?"y":"n",t:tt};__store["turnout/"+id]={b:{[nid]:1}}});
  __notify();await wait(1500);
  await act("istage",nid,800);await tap(".ynb-y",150);await tap(".ynb-y",3000);await wait(4000);await top();await shot("3-results-"+scheme);
  await tap(".tabs-in [data-act=tab][data-v=search]",1200);await top();await shot("4-votes-"+scheme);
  await fetch(S_+"/done")}
main().catch(e=>log("driver: "+(e&&e.message||e)).then(()=>fetch(S_+"/done")));
})();
""" % PORT


def sample_html():
    """The app page with sample data and the scene script (the member: a Burnaby resident, not the owner)."""
    now = int(time.time() * 1000)
    store = {"members/u_me": {"cell": "11-10", "town": "Burnaby", "joinedAt": now - 864e5, "introAt": now - 864e5, "cand": {}, "res": []}}
    mock = (ROOT / "tests/mock.js").read_text().replace("const store={};", "const store=" + json.dumps(store) + ";") \
        .replace("isOwner:async()=>true", "isOwner:async()=>false") \
        .replace('{name:i==="u_me"?"Sam":""}', '{name:i==="u_me"?"Sam":i==="u_bill"?"Bill Murtry":""}')
    land = json.loads(re.search(r"land:(\[\[.*?\]\])", (ROOT / "dist/app/app.js").read_text()).group(1))
    driver = DRIVER.replace("__CELLS__", json.dumps(["%d-%d" % (r, c) for r, c in land]))
    return ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><script>'
            + mock + '</script></head><body>' + app_body() + '<script>' + driver + '</script></body></html>')


if __name__ == "__main__":
    import asyncio
    from playwright.async_api import async_playwright
    out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    page_file = out / "sample.html"; page_file.write_text(sample_html(), encoding="utf-8")

    async def run():
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for scheme in ("light", "dark"):
                ctx = await b.new_context(viewport={"width": 440, "height": 956}, device_scale_factor=3, is_mobile=True,
                                          has_touch=True, color_scheme=scheme, locale="en-CA")
                pg = await ctx.new_page(); done = asyncio.Event()

                async def handle(route):
                    from urllib.parse import urlparse, parse_qs
                    u = urlparse(route.request.url); a = parse_qs(u.query)
                    if u.path == "/shot":
                        await pg.screenshot(path=str(out / (a["name"][0] + ".png"))); print("shot", a["name"][0], flush=True)
                    elif u.path == "/log":
                        print("app:", a.get("m", [""])[0], flush=True)
                    elif u.path == "/done":
                        done.set()
                    await route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"}, body="ok")
                await pg.route("http://127.0.0.1:%d/**" % PORT, handle)
                await pg.goto(page_file.as_uri())
                await asyncio.wait_for(done.wait(), 180)
                await ctx.close()
            await b.close()
    asyncio.run(run())
