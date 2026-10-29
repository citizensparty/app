#!/usr/bin/env python3
"""Build everything into dist/.

  dist/landing/   the public landing page (one file)
  dist/app/       the web app: index.html, styles.css, app.js, adapter-local.js, PWA files
  dist/site/      landing at the root plus the app under /app, ready to upload in one go
                  (also /downloads: the host program for Windows and Linux, and the Android APK if tools/build_native.sh made one)
  dist/host/      the host program, built from host/ with Go (skipped with --no-host, or if Go isn't installed)
  dist/registrar/ the registrar program (host/ with -tags registrar), for the party's own computers: never published

The party settings come from config/party.json (owners, hosts) and config/party.signed.json (see tools/party.py).
With no hosts listed, the app runs as a single-device demo.

Usage:  python3 tools/build.py [--party DIR] [--out DIR] [--no-host] [--directory URL] [--native]
        --native: the app for the installed (Capacitor) apps: the party's public key is built in, and it reads
                  the signed settings from the site when it starts (tools/build_native.sh uses this)
        --directory: the site with /hosts.json and /api/hosts (default https://citizensparty.ca)
        --party: folder with party.json / party.signed.json (default: config/); --out: output folder (default: dist/)
"""
import zipfile, hashlib, io, json, os, pathlib, re, shutil, subprocess, sys, tarfile, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = pathlib.Path(sys.argv[sys.argv.index("--out") + 1]).resolve() if "--out" in sys.argv else ROOT / "dist"
APP_FILES = ["index.html", "styles.css", "adapter-local.js", "adapter-nostr.js", "manifest.webmanifest"]
# the host program: (GOOS, GOARCH, download name)
HOST_TARGETS = [("windows", "amd64", "citizens-host-windows.zip"), ("linux", "amd64", "citizens-host-linux-x64.tar.gz"), ("linux", "arm64", "citizens-host-linux-arm64.tar.gz")]
PARTY = pathlib.Path(sys.argv[sys.argv.index("--party") + 1]) if "--party" in sys.argv else ROOT / "config"
DIRECTORY = sys.argv[sys.argv.index("--directory") + 1] if "--directory" in sys.argv else "https://citizensparty.ca"


def build_landing():
    src = (ROOT / "landing/index.src.html").read_text(encoding="utf-8")
    svg = (ROOT / "landing/map.svg").read_text(encoding="utf-8")
    party = json.loads((PARTY / "party.json").read_text()) if (PARTY / "party.json").exists() else {}
    hosts = json.dumps([{"url": h["url"], "name": h.get("name", "")} for h in party.get("hosts", [])]).replace("</", "<\\/")
    out = DIST / "landing"
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(src.replace("{{MAP}}", svg).replace("{{HOSTS}}", hosts), encoding="utf-8")
    print("built", out / "index.html")


def build_app():
    g = json.loads((ROOT / "app/geo/grid100.json").read_text(encoding="utf-8"))
    js = (ROOT / "app/app.js").read_text(encoding="utf-8")
    subs = {
        "__W__": str(g["W"]), "__H__": str(g["H"]), "__ROWS__": str(g["rows"]), "__COLS__": str(g["cols"]),
        "__OX__": f"{g['ox']:.3f}", "__OY__": f"{g['oy']:.3f}", "__K__": f"{g['K']:.5f}",
        "__PATH__": g["path"], "__LAND__": json.dumps(g["land"], separators=(",", ":")),
        "__PLACES__": (ROOT / "app/geo/places.json").read_text(encoding="utf-8"),
    }
    for k, v in subs.items():
        js = js.replace(k, v)
    out = DIST / "app"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / "app.js").write_text(js, encoding="utf-8")
    for f in APP_FILES:
        shutil.copy(ROOT / "app" / f, out / f)
    shutil.copytree(ROOT / "app/icons", out / "icons")
    shutil.copytree(ROOT / "app/vendor", out / "vendor")
    party = json.loads((PARTY / "party.json").read_text()) if (PARTY / "party.json").exists() else {}
    boot = {"owners": party.get("owners", []), "hosts": party.get("hosts", []), "directory": DIRECTORY}
    (out / "config.json").write_text(json.dumps(boot, separators=(",", ":")) + "\n", encoding="utf-8")  # read by the installed apps
    if "--native" in sys.argv:
        boot = {"owners": party.get("owners", []), "hosts": party.get("hosts", []), "directory": DIRECTORY, "remote": True}
    (out / "config.js").write_text("window.CP_BUILD=" + json.dumps(boot, separators=(",", ":")) + ";\n", encoding="utf-8")
    if "--native" in sys.argv:
        (out / "party.json").write_text("null\n")  # the installed app reads the signed settings from the site
    elif (PARTY / "party.signed.json").exists():
        shutil.copy(PARTY / "party.signed.json", out / "party.json")
    else:
        (out / "party.json").write_text("null\n")  # not signed yet: the app runs as a demo
    h = hashlib.sha256()
    for f in sorted(out.rglob("*")):
        if f.is_file():
            h.update(f.read_bytes())
    sw = (ROOT / "app/sw.js").read_text(encoding="utf-8").replace("__VERSION__", "citizens-" + h.hexdigest()[:12])
    (out / "sw.js").write_text(sw, encoding="utf-8")
    print("built", out)


PAGE_CSS = """
.page section{padding:48px 0}
.olist{margin:0;padding-left:1.3em;display:flex;flex-direction:column;gap:12px;color:var(--ink2);max-width:46em}
.olist b{color:var(--ink)}
.page code{font-size:.9em;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:1px 6px;overflow-wrap:anywhere}
.page a:not(.btn){color:var(--accent)}
.dl{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start}
.dlc{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:14px;align-items:flex-start;min-width:0}
.dlc>*{max-width:100%}
.dlc h3{font-size:22px;font-weight:800}
.mute{color:var(--ink2)}.small{font-size:14px}
.meta{display:flex;flex-direction:column;gap:4px;width:100%}
.cmd{display:flex;align-items:center;gap:6px;width:100%;min-width:0;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:4px 4px 4px 12px}
.cmd code,.page .cmd code{flex:1;min-width:0;white-space:pre;overflow-x:auto;background:none;border:0;padding:8px 0;font-size:14px;overflow-wrap:normal}
.copy{flex:none;font:700 13px var(--body);color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:7px 10px;cursor:pointer}
.copy:hover{border-color:var(--ink2)}
.sha{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink2)}
.sha code{font-size:12.5px}
.cmds{display:flex;flex-direction:column;gap:8px;width:100%}
.keys{display:flex;flex-direction:column;gap:12px;max-width:46em}
.keybox{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.keybox .small{overflow-wrap:anywhere}
.hostlist{display:flex;flex-direction:column;gap:8px;max-width:46em;margin-bottom:20px}
.hostrow{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-width:0}
.hostrow code{flex:1;min-width:0;overflow-x:auto;white-space:pre;background:none;border:0}
.dot{width:10px;height:10px;border-radius:50%;background:var(--mute);flex:none}
.dot.on{background:#1F9D55}.dot.off{background:#C0392B}
.keep{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.keep>div{display:flex;flex-direction:column;gap:10px;min-width:0}
.dl.two{grid-template-columns:repeat(2,1fr)}
@media (max-width:860px){.dl,.dl.two,.keep{grid-template-columns:1fr}}
"""

# per page: title, description, address (for the preview tags), and which nav item it is
PAGES = {
    "host": ("Run a host · Citizens Party", "Keep a copy of the record on your own computer.", "https://citizensparty.ca/host", 'href="host.html"'),
    "constitution": ("Constitution · Citizens Party", "How our rules work, who holds what power, the risks, and the backup plan.", "https://citizensparty.ca/constitution", None),
    "download": ("Get the app · Citizens Party", "Join your grid and vote from your phone.", "https://citizensparty.ca/download", 'class="btn pri sm" href="download.html"'),
}

PAGE_JS = """<script>
(function(){
  var nav=document.getElementById("nav");
  function onScroll(){nav.classList.toggle("scrolled",window.scrollY>4)}
  window.addEventListener("scroll",onScroll,{passive:true});onScroll();
  try{document.getElementById("yr").textContent=new Date().getFullYear()}catch(e){}
  document.addEventListener("click",function(e){var b=e.target.closest(".copy");if(!b)return;
    var t=b.getAttribute("data-copy")||"";
    function done(){var o=b.textContent;b.textContent="Copied";setTimeout(function(){b.textContent=o},1500)}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){fallback()})}else fallback();
    function fallback(){var a=document.createElement("textarea");a.value=t;a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();try{document.execCommand("copy");done()}catch(x){}a.remove()}
  });
  // the party's own hosts: online or not, checked from this browser
  var rows=document.querySelectorAll(".hostrow[data-url]");if(!rows.length)return;
  fetch("hosts.json",{cache:"no-cache"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null}).then(function(d){
    var seen={};((d&&d.hosts)||[]).forEach(function(h){seen[h.url]=h.lastOk});
    [].forEach.call(rows,function(row){var u=row.getAttribute("data-url"),dot=row.querySelector(".dot"),st=row.querySelector(".st");
      var c=new AbortController(),t=setTimeout(function(){c.abort()},5000);
      fetch(u.replace(/^ws/,"http"),{headers:{Accept:"application/nostr+json"},signal:c.signal}).then(function(r){return r.json()}).then(function(){clearTimeout(t);dot.className="dot on";st.textContent="online"}).catch(function(){
        dot.className="dot off";st.textContent=seen[u]?"offline · last seen "+new Date(seen[u]*1000).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"offline"})});
  });
})();
</script>"""


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def cmd(text):
    """A one-line command box with a Copy button."""
    return '<div class="cmd"><code>' + esc(text) + '</code><button class="copy" type="button" data-copy="' + esc(text) + '">Copy</button></div>'


def sha256(f):
    h = hashlib.sha256()
    with open(f, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def host_version():
    m = re.search(r'version\s*=\s*"([^"]+)"', (ROOT / "host/config.go").read_text())
    return m.group(1) if m else "?"


def build_pages(out):
    """Extra landing pages (landing/*.body.html) wrapped in the landing page's head, header and footer."""
    sys.path.insert(0, str(ROOT / "tools"))
    from party import npub
    src = (ROOT / "landing/index.src.html").read_text(encoding="utf-8")
    head = src[:src.index("<main")].replace("</style>", PAGE_CSS + "</style>", 1).replace('<body>', '<body class="page">', 1)
    for a in ("#how", "#rules", "#vote", "#faq"):
        head = head.replace('href="' + a + '"', 'href="./' + a + '"')
    head = head.replace('href="#top"', 'href="./"')
    foot = src[src.index("<footer"):]
    foot = foot[:foot.index("<script>")] + PAGE_JS + "\n</body>\n</html>\n"
    party = json.loads((PARTY / "party.json").read_text()) if (PARTY / "party.json").exists() else {}
    owners = party.get("owners", [])
    hosts = party.get("hosts", [])
    dl = out / "downloads"
    sums = {f.name: sha256(f) for f in sorted(dl.iterdir()) if f.is_file() and f.name != "SHA256SUMS.txt"}
    (dl / "SHA256SUMS.txt").write_text("".join(h + "  " + n + "\n" for n, h in sums.items()))

    def dlbtn(name, label, version, cls="pri"):
        f = dl / name
        if not f.exists():
            return '<p class="mute small">Not built yet.</p>'
        h = sums[name]
        when = time.strftime("%b %-d, %Y", time.localtime(f.stat().st_mtime))
        return ('<a class="btn ' + cls + '" href="downloads/' + name + '">' + label + '</a><div class="meta">'
                + '<span class="mute small">' + name + ', ' + str(round(f.stat().st_size / 1e6, 1)) + ' MB · v' + version + ' · ' + when + '</span>'
                + '<span class="sha">SHA-256 <code title="' + h + '">' + h[:12] + '…' + h[-6:] + '</code><button class="copy" type="button" data-copy="' + h + '">Copy</button></span></div>')

    hv = host_version()
    fills = {
        "{{HOSTWIN}}": dlbtn("citizens-host-windows.zip", "Download for Windows", hv),
        "{{HOSTLINUX}}": dlbtn("citizens-host-linux-x64.tar.gz", "Download for Linux", hv) + dlbtn("citizens-host-linux-arm64.tar.gz", "Raspberry Pi (64-bit)", hv, "ghost"),
        "{{SUMS}}": '<a href="downloads/SHA256SUMS.txt">SHA256SUMS.txt</a>',
        "{{COMPOSE}}": '<a class="btn pri" href="downloads/docker-compose.yml" download>Download docker-compose.yml</a>',
        "{{CMD_INSTALL}}": cmd("curl -fsSL https://citizensparty.ca/install.sh | sudo sh"),
        "{{CMD_READFIRST}}": '<div class="cmds">' + cmd("curl -fsSL https://citizensparty.ca/install.sh -o install.sh") + cmd("less install.sh") + cmd("sudo sh install.sh") + '</div>',
        "{{CMD_TAR}}": cmd("tar xzf citizens-host-linux-*.tar.gz"),
        "{{CMD_RUN}}": cmd("./citizens-host/citizens-host"),
        "{{CMD_STATUS}}": cmd("citizens-host status"),
        "{{CMD_STARTUP}}": cmd("shell:startup"),
        "{{CMD_COMPOSE}}": cmd("docker compose up -d"),
        "{{CMD_COMPOSE_STATUS}}": cmd("docker compose exec host citizens-host status"),
        "{{CMD_COMPOSE_UPDATE}}": cmd("docker compose build --pull --no-cache && docker compose up -d"),
    }
    builtin = ""
    if hosts:
        builtin = ('<div class="sechd"><div class="k">Built in</div><h2>The party\'s own hosts</h2><p>Your host starts by copying from these, then finds the rest of the network by itself.</p></div><div class="hostlist">'
                   + "".join('<div class="hostrow" data-url="' + esc(h["url"]) + '"><span class="dot"></span><code>' + esc(h["url"]) + '</code><span class="st mute small">checking…</span></div>' for h in hosts) + '</div>')
    key = ""
    if owners:
        key = ('<div class="keybox"><div><b>Party key.</b> <span class="mute">Your host uses this to check that records really come from the party.</span></div>'
               + "".join(cmd(k) for k in owners) + '<span class="mute small">The same key as written in the app: ' + ", ".join(npub(k) for k in owners) + '</span></div>')
    fills["{{PARTY}}"] = (builtin + '<div class="keys">' + key + '</div>') if (builtin or key) else ""
    apks = sorted(dl.glob("citizensparty-*.apk"))
    fills["{{APK}}"] = (dlbtn(apks[-1].name, "Download for Android", re.search(r"citizensparty-(.+)\.apk", apks[-1].name).group(1))
                        if apks else '<p class="mute small">The Android app isn\'t ready yet.</p>')
    for body in sorted((ROOT / "landing").glob("*.body.html")):
        name = body.name.replace(".body.html", "")
        b = body.read_text(encoding="utf-8")
        title, desc, url, navsel = PAGES.get(name, ("Citizens Party", "", "https://citizensparty.ca/" + name, None))
        h = re.sub(r"<title>.*?</title>", "<title>" + esc(title) + "</title>", head, count=1)
        for prop, val in (("og:title", title), ("og:description", desc), ("og:url", url)):
            h = re.sub(r'<meta property="' + prop + '" content="[^"]*">', '<meta property="' + prop + '" content="' + esc(desc if prop == "og:description" else val).replace("'", "&#39;") + '">', h)
        h = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="' + esc(desc) + '">', h)
        h = h.replace('<link rel="canonical" href="https://citizensparty.ca/">', '<link rel="canonical" href="' + url + '">')
        if navsel:
            h = h.replace("<a " + navsel + ">", "<a " + navsel + ' aria-current="page">', 1)
        for k, v in fills.items():
            b = b.replace(k, v)
        (out / (name + ".html")).write_text(h + b + "\n" + foot, encoding="utf-8")


def find_go():
    for g in (shutil.which("go"), os.path.expanduser("~/.local/opt/go/bin/go")):
        if g and os.path.exists(g):
            return g
    return None


def build_host():
    """Build the host for Windows and Linux, with the party's key and hosts built in (no settings needed)."""
    out = DIST / "host"
    go = find_go()
    if "--no-host" in sys.argv or not go:
        if not go:
            print("skipped the host program: Go isn't installed (see host/README.md)")
        return
    out.mkdir(parents=True, exist_ok=True)
    party = json.loads((PARTY / "party.json").read_text()) if (PARTY / "party.json").exists() else {}
    owners = ",".join(party.get("owners", []))
    seeds = ",".join(h["url"] for h in party.get("hosts", []))
    flags = "-s -w -X main.defaultOwners=" + owners + " -X main.defaultSeeds=" + seeds
    env = dict(os.environ, CGO_ENABLED="0", GOTOOLCHAIN="local")
    env.setdefault("GOPATH", os.path.expanduser("~/.local/opt/gopath"))
    readme = (ROOT / "host/README.md").read_bytes()
    for goos, arch, name in HOST_TARGETS:
        exe = out / (goos + "-" + arch + ("/citizens-host.exe" if goos == "windows" else "/citizens-host"))
        exe.parent.mkdir(exist_ok=True)
        subprocess.run([go, "build", "-trimpath", "-ldflags", flags, "-o", str(exe), "."], cwd=ROOT / "host", env=dict(env, GOOS=goos, GOARCH=arch), check=True)
        if name.endswith(".zip"):  # Chrome is much gentler with a .zip than a bare .exe
            with zipfile.ZipFile(out / name, "w", zipfile.ZIP_DEFLATED) as z:
                z.write(exe, "citizens-host/citizens-host.exe")
                z.writestr("citizens-host/README.md", readme)
        else:  # a .tar.gz keeps the "can run" permission that a plain download loses
            with tarfile.open(out / name, "w:gz") as t:
                t.add(exe, "citizens-host/citizens-host")
                info = tarfile.TarInfo("citizens-host/README.md"); info.size = len(readme); info.mode = 0o644; info.mtime = int(time.time())
                t.addfile(info, io.BytesIO(readme))
    print("built", out)
    # the registrar: for the party's own computers only, so it goes in dist/registrar/, never on the site
    reg = DIST / "registrar"
    for goos, arch, _ in HOST_TARGETS:
        exe = reg / (goos + "-" + arch) / ("citizens-registrar.exe" if goos == "windows" else "citizens-registrar")
        exe.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([go, "build", "-trimpath", "-tags", "registrar", "-ldflags", flags, "-o", str(exe), "."], cwd=ROOT / "host", env=dict(env, GOOS=goos, GOARCH=arch), check=True)
    # one file to copy to a Linux server: both Linux builds plus the installer (tools/install-registrar.sh)
    with tarfile.open(reg / "citizens-registrar-linux.tar.gz", "w:gz") as t:
        for arch in ("amd64", "arm64"):
            t.add(reg / ("linux-" + arch) / "citizens-registrar", "citizens-registrar/linux-" + arch + "/citizens-registrar")
        t.add(ROOT / "tools/install-registrar.sh", "citizens-registrar/install.sh")
    print("built", reg, "(not published)")


def build_site():
    out = DIST / "site"
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(DIST / "landing", out)
    shutil.copytree(DIST / "app", out / "app")
    dl = out / "downloads"
    dl.mkdir()
    for _, _, name in HOST_TARGETS:
        if (DIST / "host" / name).exists():
            shutil.copy(DIST / "host" / name, dl / name)
    apks = [a for a in sorted((DIST / "downloads").glob("citizensparty-*.apk"), key=lambda a: [int(x) for x in re.findall(r"\d+", a.name)])
            if not a.name.endswith("-debug.apk")] if (DIST / "downloads").exists() else []
    if apks:
        shutil.copy(apks[-1], dl / apks[-1].name)  # only the newest Android app
    # the installed apps fetch these from another origin (https://localhost), so they need CORS
    (out / "_headers").write_text("/app/config.json\n  Access-Control-Allow-Origin: *\n/app/party.json\n  Access-Control-Allow-Origin: *\n")
    shutil.copy(ROOT / "landing/install.sh", out / "install.sh")  # curl -fsSL https://citizensparty.ca/install.sh | sudo sh
    shutil.copy(ROOT / "host/docker-compose.download.yml", dl / "docker-compose.yml")  # the Docker card on the host page
    try:  # the social-media preview image, kept in sync with the map when Playwright is installed
        sys.path.insert(0, str(ROOT / "tools"))
        import make_og
        make_og.make()
    except Exception as e:
        print("using the committed landing/og.png (" + e.__class__.__name__ + ")")
    shutil.copy(ROOT / "landing/og.png", out / "og.png")
    build_pages(out)
    print("built", out)


if __name__ == "__main__":
    build_landing()
    build_app()
    build_host()
    build_site()
