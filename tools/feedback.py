#!/usr/bin/env python3
"""Read the feedback people sent from the website and the app (stored privately in the citizensparty.ca D1 database).

  python3 tools/feedback.py            the newest 50 messages
  python3 tools/feedback.py 200        the newest 200
Needs the one-time `npx wrangler login` in worker/ (the same as tools/deploy.py).
"""
import json, os, pathlib, shutil, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
n = int(sys.argv[1]) if len(sys.argv) > 1 else 50
npx = shutil.which("npx") or os.path.expanduser("~/.local/opt/node/bin/npx")
out = subprocess.run([npx, "wrangler", "d1", "execute", "citizens-hosts", "--remote", "--json", "--command",
                      "select id, at, msg, name, email, page from feedback order by at desc limit %d" % n],
                     cwd=ROOT / "worker", capture_output=True, text=True)
if out.returncode:
    sys.exit(out.stderr or out.stdout)
rows = json.loads(out.stdout)[0]["results"]
if not rows:
    print("No feedback yet.")
for r in reversed(rows):
    who = " · ".join(x for x in (r.get("name"), r.get("email")) if x) or "anonymous"
    print("#%s  %s  %s  (%s)\n%s\n" % (r["id"], time.strftime("%b %-d, %-I:%M %p", time.localtime(r["at"])), who, r.get("page") or "", r["msg"]))
