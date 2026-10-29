"""The built app (dist/app) as one inline chunk for the test pages: markup, styles and app.js, without the local adapter
(the tests supply window.claude from mock.js)."""
import pathlib, re

DIST = pathlib.Path(__file__).resolve().parent.parent / "dist/app"


def app_body():
    html = (DIST / "index.html").read_text(encoding="utf-8")
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    body = re.sub(r"<script[^>]*>.*?</script>\s*", "", body, flags=re.S)
    css = (DIST / "styles.css").read_text(encoding="utf-8")
    js = (DIST / "app.js").read_text(encoding="utf-8")
    return "<style>" + css + "</style>" + body + "<script>" + js + "</script>"
