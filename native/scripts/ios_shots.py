#!/usr/bin/env python3
"""Screenshots of the real iPhone app in Apple's iPhone simulator (on a Mac; run by .github/workflows/ios.yml).

  python3 native/scripts/ios_shots.py <App.app built for the simulator> <output dir>

1. The app as it ships: its first screen (talks to the live hosts, only reads).
2. The same app with sample data (native/scripts/sample_shots.py): the grid, a proposed change, a vote's results,
   Votes, the vote record, in light and dark. The page inside the app tells this script when a scene is ready
   (http://127.0.0.1:PORT/shot), and the script takes the picture with `simctl`.
Output: <out>/<n>-<scene>-<light|dark>.png (1 to 5 in App Store order) at the phone's full resolution (App Store size for a 6.9-inch iPhone).
Needs dist/app (python3 tools/build.py).
"""
import http.server, json, pathlib, shutil, subprocess, sys, threading, time

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests"))
sys.path.insert(0, str(ROOT / "native/scripts"))
from sample_shots import PORT, sample_html

APP_ID = "ca.citizensparty.app"
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
import re
phone = max((t for t in types if re.fullmatch(r"iPhone \d+ Pro Max", t["name"])), key=lambda t: int(t["name"].split()[1]))
rts = [r for r in json.loads(simctl("list", "runtimes", "-j"))["runtimes"] if r["platform"] == "iOS" and r["isAvailable"]]
rt = sorted(rts, key=lambda r: [int(x) for x in r["version"].split(".")])[-1]
print("simulator:", phone["name"], "iOS", rt["version"])
UDID = simctl("create", "shots", phone["identifier"], rt["identifier"]).strip()
simctl("boot", UDID)
simctl("bootstatus", UDID, "-b")
simctl("status_bar", UDID, "override", "--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active",
       "--wifiBars", "3", "--cellularMode", "active", "--cellularBars", "4", "--batteryState", "charged", "--batteryLevel", "100")

def shot(name):
    simctl("io", UDID, "screenshot", str(OUT / (name + ".png")))
    print("shot", name, flush=True)


def run(app, scheme):
    simctl("ui", UDID, "appearance", scheme)
    simctl("terminate", UDID, APP_ID, check=False)
    simctl("install", UDID, str(app))
    simctl("launch", UDID, APP_ID)


# ----- 1. the app as it ships -----
run(SRC, "light")
time.sleep(25)  # it waits up to 12 s for the hosts before its first screen
shot("9-first-screen-light")  # the welcome screen: not for the store listing
simctl("uninstall", UDID, APP_ID)

# ----- 2. sample data, driven from inside the page (native/scripts/sample_shots.py) -----
SAMPLE = OUT.parent / "App-sample.app"
shutil.rmtree(SAMPLE, ignore_errors=True)
shutil.copytree(SRC, SAMPLE, symlinks=True)
(SAMPLE / "public/index.html").write_text(sample_html(), encoding="utf-8")
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
    if not done.wait(900):
        print("no answer from the app in 15 minutes; taking a picture of what it shows")
        shot("stuck-" + scheme)
    simctl("uninstall", UDID, APP_ID)
srv.shutdown()
simctl("delete", UDID, check=False)
print("screenshots in", OUT)
