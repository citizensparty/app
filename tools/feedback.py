#!/usr/bin/env python3
"""Read the feedback people sent from the website and the app (stored privately in the citizensparty.ca D1 database).

  python3 tools/feedback.py            the newest 50 messages
  python3 tools/feedback.py 200        the newest 200
  python3 tools/feedback.py --sync     add new messages to feedback/feedback.csv and rebuild feedback/index.html
  python3 tools/feedback.py --page     rebuild feedback/index.html from the CSV only (no download)
  python3 tools/feedback.py --testers  sync, then print the Google Play tester sign-ups (citizensparty.ca/testers), comma-separated
Needs the one-time `npx wrangler login` in worker/ (the same as tools/deploy.py).

feedback/ is private and never committed (.gitignore). feedback.csv holds every message, from the form and from
anywhere else (added by hand: source, from, contact). topics.json names the issues; a message's `topics` column lists
their keys (";" between them). The page's top issues count feedback rows from other people (kind = feedback), not notes
or tests.
"""
import csv, html, json, os, pathlib, shutil, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "feedback"
CSV = DIR / "feedback.csv"
TOPICS = DIR / "topics.json"
PAGE = DIR / "index.html"
COLS = ["id", "date", "source", "from", "contact", "kind", "topics", "status", "message", "notes"]


def fetch(n):
    npx = shutil.which("npx") or os.path.expanduser("~/.local/opt/node/bin/npx")
    out = subprocess.run([npx, "wrangler", "d1", "execute", "citizens-hosts", "--remote", "--json", "--command",
                          "select id, at, msg, name, email, page from feedback order by at desc limit %d" % n],
                         cwd=ROOT / "worker", capture_output=True, text=True)
    if out.returncode:
        sys.exit(out.stderr or out.stdout)
    return list(reversed(json.loads(out.stdout)[0]["results"]))


def load():
    if not CSV.exists():
        return []
    with CSV.open(newline="") as f:
        return list(csv.DictReader(f))


def save(rows):
    DIR.mkdir(exist_ok=True)
    rows.sort(key=lambda r: r["date"], reverse=True)
    with CSV.open("w", newline="") as f:
        w = csv.DictWriter(f, COLS)
        w.writeheader()
        w.writerows({c: r.get(c, "") for c in COLS} for r in rows)


def sync():
    rows = load()
    have = {r["id"] for r in rows}
    new = 0
    for r in fetch(10000):
        rid = "form-%s" % r["id"]
        if rid in have:
            continue
        page = r.get("page") or ""
        rows.append({"id": rid, "date": time.strftime("%Y-%m-%d %H:%M", time.localtime(r["at"])),
                     "source": "Tester sign-up" if page == "testers" else "App (%s)" % page[4:] if page.startswith("app/") else "App" if page == "app" else "Website",
                     "from": r.get("name") or "", "contact": r.get("email") or "", "kind": "tester" if page == "testers" else "feedback",
                     "topics": "", "status": "New", "message": r["msg"], "notes": ""})
        new += 1
    save(rows)
    print("%d new, %d in all: %s" % (new, len(rows), CSV))


def page():
    rows = load()
    rows.sort(key=lambda r: r["date"], reverse=True)
    topics = json.loads(TOPICS.read_text()) if TOPICS.exists() else {}
    count = {}
    for r in rows:
        if r["kind"] != "feedback":
            continue
        for t in filter(None, (x.strip() for x in r["topics"].split(";"))):
            count.setdefault(t, set()).add(r["from"] or r["contact"] or r["id"])
    ranked = sorted((t for t in count if t in topics and topics[t].get("status") != "Closed"),
                    key=lambda t: (-len(count[t]), t))[:3]
    e = lambda s: html.escape(s or "")
    issues = "".join(
        '<li class="issue"><div class="ihead"><b>%s</b><span class="chip">%d %s</span><span class="chip st">%s</span></div>'
        '<p>%s</p></li>' % (e(topics[t]["title"]), len(count[t]), "person" if len(count[t]) == 1 else "people",
                            e(topics[t].get("status", "Open")), e(topics[t].get("summary", "")))
        for t in ranked) or '<li class="issue"><p>No issues yet.</p></li>'
    trs = "".join(
        '<tr class="k-%s"><td class="nw">%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td>'
        '<td class="msg">%s%s</td></tr>' % (
            e(r["kind"]), e(r["date"]), e(r["source"]), e(r["from"]),
            ('<a href="mailto:%s">%s</a>' % (e(r["contact"]), e(r["contact"])) if "@" in r["contact"] else e(r["contact"])),
            "<br>".join(e(topics.get(t, {}).get("title", t)) for t in filter(None, r["topics"].split(";"))),
            e(r["status"]) + ("" if r["kind"] == "feedback" else ' <span class="chip">%s</span>' % e(r["kind"])),
            e(r["message"]).replace("\n", "<br>"), '<div class="note">%s</div>' % e(r["notes"]) if r["notes"] else "")
        for r in rows)
    people = len({r["from"] or r["contact"] or r["id"] for r in rows if r["kind"] == "feedback"})
    PAGE.write_text(TEMPLATE.replace("__ISSUES__", issues).replace("__ROWS__", trs)
                    .replace("__SUMMARY__", "%d messages from %d people · updated %s" % (
                        sum(r["kind"] == "feedback" for r in rows), people, time.strftime("%b %-d, %Y %-I:%M %p"))))
    print("page: %s" % PAGE)


TEMPLATE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Feedback Log</title>
<style>
:root{--bg:#F4F7F6;--surface:#fff;--ink:#12201E;--mute:#5E6E6B;--line:#DCE4E2;--accent:#0F6E66;--soft:#E3F0EE;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0E1513;--surface:#16201E;--ink:#E6EEEC;--mute:#93A39F;--line:#26332F;--accent:#4FB8AC;--soft:#1B2C29;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 "Atkinson Hyperlegible",system-ui,sans-serif;padding:24px max(16px,env(safe-area-inset-left)) 48px}
main{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
h1{font:800 26px/1.15 Archivo,system-ui,sans-serif;margin:0}h2{font:700 17px/1.2 Archivo,system-ui,sans-serif;margin:0 0 10px;color:var(--accent)}
.sub{color:var(--mute);margin:4px 0 0}
.issues{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.issue{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.issue p{margin:6px 0 0;color:var(--mute)}.ihead{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.ihead b{flex:1 1 100%}
.chip{font-size:12px;padding:1px 8px;border-radius:99px;background:var(--soft);color:var(--accent);border:1px solid var(--line);white-space:nowrap}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
input{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);flex:1 1 220px}
a{color:var(--accent)}
.wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;min-width:900px}
th,td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid var(--line)}
th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--mute);position:sticky;top:0;background:var(--surface)}
td.msg{min-width:340px}.nw{white-space:nowrap}.note{margin-top:6px;color:var(--mute);font-size:13.5px}
tr.k-note,tr.k-test{color:var(--mute)}
</style></head><body><main>
<header><h1>Citizens Party feedback</h1><p class="sub">Private, on this computer only. __SUMMARY__ · <a href="feedback.csv">feedback.csv</a></p></header>
<section><h2>Top issues</h2><ul class="issues">__ISSUES__</ul></section>
<section><h2>All feedback</h2><div class="bar"><input id="q" placeholder="Search messages, names, emails…" autocomplete="off"></div></section>
<div class="wrap"><table><thead><tr><th>Date</th><th>Source</th><th>From</th><th>Email / contact</th><th>Topics</th><th>Status</th><th>Message</th></tr></thead>
<tbody id="rows">__ROWS__</tbody></table></div>
</main><script>
document.getElementById("q").addEventListener("input",e=>{const q=e.target.value.toLowerCase();
for(const tr of document.querySelectorAll("#rows tr"))tr.hidden=q&&!tr.textContent.toLowerCase().includes(q)})
</script></body></html>
"""

if __name__ == "__main__":
    a = sys.argv[1] if len(sys.argv) > 1 else ""
    if a == "--sync":
        sync()
        page()
    elif a == "--testers":
        sync()
        page()
        ts = sorted({r["contact"].strip().lower() for r in load() if r["kind"] == "tester" and "@" in r["contact"]})
        print("%d testers:\n%s" % (len(ts), ", ".join(ts)))
    elif a == "--page":
        page()
    else:
        for r in fetch(int(a) if a else 50):
            who = " · ".join(x for x in (r.get("name"), r.get("email")) if x) or "anonymous"
            print("#%s  %s  %s  (%s)\n%s\n" % (r["id"], time.strftime("%b %-d, %-I:%M %p", time.localtime(r["at"])), who,
                                             r.get("page") or "", r["msg"]))
