#!/usr/bin/env python3
"""Make the social-media preview image (1200x630) at landing/og.png from the landing page's own map and colors.

  python3 tools/make_og.py      (needs: pip install playwright && playwright install chromium)

tools/build.py runs this when Playwright is installed, so the image stays in sync with the map;
otherwise it ships the committed landing/og.png.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "landing/og.png"


def template():
    src = (ROOT / "landing/index.src.html").read_text(encoding="utf-8")
    css = src[src.index("<style>") + 7:src.index("</style>")]
    tokens = re.search(r":root\{.*?\n\}", css, re.S).group(0)  # the light theme's colors and fonts
    rules = "\n".join(l for l in css.splitlines() if l.startswith(".map"))
    svg = (ROOT / "landing/map.svg").read_text(encoding="utf-8")
    mark = re.search(r'<svg class="mark".*?</svg>', src, re.S).group(0)
    head = src[:src.index("<style>")]
    fonts = re.search(r'<link href="https://fonts.googleapis.com/css2[^>]*>', head).group(0)
    return f"""<!doctype html><html><head><meta charset="utf-8">{fonts}<style>{tokens}{rules}
html,body{{margin:0;width:1200px;height:630px;background:var(--bg);color:var(--ink);font-family:var(--body);overflow:hidden}}
.og{{display:grid;grid-template-columns:560px 1fr;align-items:center;height:630px;padding:0 56px 0 72px;box-sizing:border-box;gap:24px}}
.brand{{display:flex;align-items:center;gap:16px;font:800 34px var(--display)}}
.brand .mark{{width:52px;height:52px}}
h1{{font:800 66px/1.04 var(--display);letter-spacing:-.015em;margin:36px 0 0}}
h1 em{{font-style:normal;color:var(--accent)}}
p{{font-size:26px;color:var(--ink2);margin:26px 0 0}}
.map{{width:100%;height:auto}}
</style></head><body><div class="og"><div>
<div class="brand">{mark}Citizens Party</div>
<h1>A party run by its members.</h1>
<p>British Columbia · citizensparty.ca</p>
</div><div>{svg}</div></div>
<script>
var cells=[].slice.call(document.querySelectorAll(".cellr")),seed=7;
function rnd(){{seed=(seed*16807)%2147483647;return seed/2147483647}}
cells.map(function(c){{return [rnd(),c]}}).sort(function(a,b){{return a[0]-b[0]}}).slice(0,Math.round(cells.length*.42))
  .forEach(function(x,i){{x[1].style.transition="none";x[1].classList.add(i%3?"lit2":"lit")}});
</script></body></html>"""


def make():
    from playwright.sync_api import sync_playwright
    html = ROOT / "dist/og-template.html"
    html.parent.mkdir(exist_ok=True)
    html.write_text(template(), encoding="utf-8")
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 630}, color_scheme="light")
        pg.goto(html.as_uri())
        pg.wait_for_load_state("networkidle")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT))
        b.close()
    print("made", OUT.relative_to(ROOT))


if __name__ == "__main__":
    try:
        make()
    except ImportError:
        sys.exit("Needs Playwright: pip install playwright && playwright install chromium")
