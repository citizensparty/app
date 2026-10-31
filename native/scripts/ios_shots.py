#!/usr/bin/env python3
"""Screenshots of the real iPhone app in Apple's iPhone simulator (on a Mac; run by .github/workflows/ios.yml).

  python3 native/scripts/ios_shots.py <App.app built for the simulator> <output dir>

1. The app as it ships: its first screen (talks to the live hosts, only reads).
2. The same app with sample data (tests/mock.js, the same scenes as tools/make_shots.py): a vote, the grid, Votes,
   the vote record, in light and dark. The page inside the app tells this script when a scene is ready
   (http://127.0.0.1:PORT/shot), and the script takes the picture with `simctl`.
Output: <out>/<n>-<scene>-<light|dark>.png at the phone's full resolution (App Store size for a 6.9-inch iPhone).
Needs dist/app (python3 tools/build.py).
"""
import http.server, json, pathlib, shutil, subprocess, sys, threading, time

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests"))
from apppage import app_body

APP_ID = "ca.citizensparty.app"
PORT = 8123
SRC, OUT = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)


def sh(*a, check=True):
    r = subprocess.run(a, capture_output=True, text=True)
    if check and r.returncode:
        raise SystemExit("failed: %s\n%s%s" % (" ".join(a), r.stdout, r.stderr))
    return r.stdout


def simctl(*a, check=True):
    return sh("xcrun", "simctl", *a, check=check)


# ----- the simulator: the biggest current iPhone, on the newest iOS -----
types = json.loads(simctl("list", "devicetypes", "-j"))["devicetypes"]
phone = [t for t in types if t["name"].startswith("iPhone") and "Pro Max" in t["name"]][-1]
rts = [r for r in json.loads(simctl("list", "runtimes", "-j"))["runtimes"] if r["platform"] == "iOS" and r["isAvailable"]]
rt = sorted(rts, key=lambda r: [int(x) for x in r["version"].split(".")])[-1]
print("simulator:", phone["name"], "iOS", rt["version"])
UDID = simctl("create", "shots", phone["identifier"], rt["identifier"]).strip()
simctl("boot", UDID)
simctl("bootstatus", UDID, "-b")
simctl("status_bar", UDID, "override", "--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active",
       "--wifiBars", "3", "--cellularMode", "active", "--cellularBars", "4", "--batteryState", "charged", "--batteryLevel", "100")

n = 0


def shot(name):
    global n
    n += 1
    simctl("io", UDID, "screenshot", str(OUT / ("%02d-%s.png" % (n, name))))
    print("shot", n, name, flush=True)


def run(app, scheme):
    simctl("ui", UDID, "appearance", scheme)
    simctl("terminate", UDID, APP_ID, check=False)
    simctl("install", UDID, str(app))
    simctl("launch", UDID, APP_ID)


# ----- 1. the app as it ships -----
run(SRC, "light")
time.sleep(25)  # it waits up to 12 s for the hosts before its first screen
shot("first-screen-light")
simctl("uninstall", UDID, APP_ID)

# ----- 2. sample data, driven from inside the page -----
now = int(time.time() * 1000)
store = {"members/u_me": {"cell": "11-10", "town": "Burnaby", "joinedAt": now - 864e5, "introAt": now - 864e5, "cand": {}, "res": []}}
mock = (ROOT / "tests/mock.js").read_text().replace("const store={};", "const store=" + json.dumps(store) + ";") \
    .replace("isOwner:async()=>true", "isOwner:async()=>false")
DRIVER = r"""
(function(){
const S="http://127.0.0.1:%d";
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const q=s=>document.querySelector(s);
const tap=async(s,ms)=>{const e=q(s);if(!e)throw new Error("missing "+s);e.click();await wait(ms||400)};
const shot=name=>fetch(S+"/shot?name="+encodeURIComponent(name)).catch(()=>{});
const log=m=>fetch(S+"/log?m="+encodeURIComponent(m)).catch(()=>{});
window.addEventListener("error",e=>log("page error: "+e.message));
async function hide(){for(let i=0;i<6&&q(".nhide");i++)await tap(".nhide",250)}
async function propose(slot,text){
  await tap("[data-act=tab][data-v=plat]",300);
  if(slot>1)await tap("[data-act=amend]",300);
  await tap('[data-act=pe][data-v=gap][data-id="'+slot+'"]',300);
  const i=q("#pl-in");i.value=text;i.dispatchEvent(new Event("input",{bubbles:true}));await wait(400);
  await tap("#pl-go");await tap(".prcpt1 [data-act=open-item]",300);
  const k=Object.keys(__store).filter(k=>k.startsWith("items/")).find(k=>JSON.stringify(__store[k]).includes(text));
  const b=document.createElement("button");b.dataset.act="istage";b.dataset.v=k.slice(6);document.body.appendChild(b);b.click();b.remove();
  await wait(400)}
async function main(){
  const scheme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
  await wait(1500);await hide();
  const passed=["Party finances are published every month.","Members choose their own candidates.","Elected members vote the way their grid decides."];
  for(let i=0;i<passed.length;i++){await propose(i+1,passed[i]);await tap(".ynb-y",150);await tap(".ynb-y",2500)}
  const t=Date.now();for(let i=0;i<146;i++)__store["members/u_n"+i]={cell:"11-10",town:"Burnaby",joinedAt:t,introAt:t,cand:{},res:[]};__notify();await wait(300);
  await propose(passed.length+1,"Every party meeting is streamed live.");
  await hide();scrollTo(0,0);await wait(500);await shot("vote-"+scheme);
  await tap("[data-act=tab][data-v=plat]",500);await hide();scrollTo(0,0);await wait(300);await shot("grid-"+scheme);
  await tap("[data-act=tab][data-v=search]",500);await hide();await wait(300);await shot("votes-"+scheme);
  await tap("[data-act=open-record]",1500);await shot("record-"+scheme);
  await fetch(S+"/done")}
main().catch(e=>log("driver: "+(e&&e.message||e)).then(()=>fetch(S+"/done")));
})();
""" % PORT
SAMPLE = OUT.parent / "App-sample.app"
shutil.rmtree(SAMPLE, ignore_errors=True)
shutil.copytree(SRC, SAMPLE, symlinks=True)
(SAMPLE / "public/index.html").write_text(
    '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><script>'
    + mock + '</script></head><body>' + app_body() + '<script>' + DRIVER + '</script></body></html>', encoding="utf-8")
# let this copy (never the shipped app) talk to this script on the Mac
sh("plutil", "-replace", "NSAppTransportSecurity", "-json", '{"NSAllowsLocalNetworking":true}', str(SAMPLE / "Info.plist"))

done = threading.Event()


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        u = urlparse(self.path); a = parse_qs(u.query)
        if u.path == "/shot":
            shot(a["name"][0])
        elif u.path == "/log":
            print("app:", a.get("m", [""])[0], flush=True)
        elif u.path == "/done":
            done.set()
        self.send_response(200); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(b"ok")

    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
for scheme in ("light", "dark"):
    done.clear()
    run(SAMPLE, scheme)
    if not done.wait(180):
        print("no answer from the app in 3 minutes; taking a picture of what it shows")
        shot("stuck-" + scheme)
    simctl("uninstall", UDID, APP_ID)
srv.shutdown()
simctl("delete", UDID, check=False)
print("screenshots in", OUT)
