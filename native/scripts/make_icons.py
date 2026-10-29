#!/usr/bin/env python3
"""Generate Android/iOS launcher icons and splash screens from the web app icons.

Sources: app/icons/icon-512.png (rounded square, transparent corners) and
app/icons/maskable-512.png (full-bleed teal). Safe to re-run; it overwrites outputs.
"""
import os
import sys
from PIL import Image, ImageDraw

TEAL = (0x0F, 0x6E, 0x66)
HERE = os.path.dirname(os.path.abspath(__file__))
NATIVE = os.path.dirname(HERE)
REPO = os.path.dirname(NATIVE)
ICONS = os.path.join(REPO, "app", "icons")
RES = os.path.join(NATIVE, "android", "app", "src", "main", "res")
IOS = os.path.join(NATIVE, "ios", "App", "App", "Assets.xcassets")

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
SPLASH = {  # portrait sizes; landscape is the transpose
    "mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280),
    "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920),
}


def load(name):
    return Image.open(os.path.join(ICONS, name)).convert("RGBA")


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


def circle(img):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, img.size[0] - 1, img.size[1] - 1), fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def splash(maskable, w, h):
    canvas = Image.new("RGB", (w, h), TEAL)
    s = int(min(w, h) * 0.6)
    glyph = maskable.resize((s, s), Image.LANCZOS)
    canvas.paste(glyph, ((w - s) // 2, (h - s) // 2), glyph)
    return canvas


def main():
    icon, mask = load("icon-512.png"), load("maskable-512.png")

    if os.path.isdir(RES):
        for d, k in DENSITIES.items():
            legacy = round(48 * k)
            fg = round(108 * k)
            save(icon.resize((legacy, legacy), Image.LANCZOS),
                 f"{RES}/mipmap-{d}/ic_launcher.png")
            save(circle(mask.resize((legacy, legacy), Image.LANCZOS)),
                 f"{RES}/mipmap-{d}/ic_launcher_round.png")
            # Adaptive foreground: full-bleed maskable art; launcher masks to the
            # inner 72/108 of it, which keeps the glyph well inside the safe zone.
            save(mask.resize((fg, fg), Image.LANCZOS),
                 f"{RES}/mipmap-{d}/ic_launcher_foreground.png")
            pw, ph = SPLASH[d]
            save(splash(mask, pw, ph), f"{RES}/drawable-port-{d}/splash.png")
            save(splash(mask, ph, pw), f"{RES}/drawable-land-{d}/splash.png")
        save(splash(mask, 480, 320), f"{RES}/drawable/splash.png")
        # The template's vector placeholders are unused once the PNGs exist.
        for stale in ("drawable-v24/ic_launcher_foreground.xml",
                      "drawable/ic_launcher_background.xml"):
            p = os.path.join(RES, stale)
            if os.path.exists(p):
                os.remove(p)
        with open(f"{RES}/values/ic_launcher_background.xml", "w") as f:
            f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                    '    <color name="ic_launcher_background">#0F6E66</color>\n'
                    '</resources>\n')
        print("android icons and splash written")

    if os.path.isdir(IOS):
        save(mask.resize((1024, 1024), Image.LANCZOS).convert("RGB"),
             f"{IOS}/AppIcon.appiconset/AppIcon-512@2x.png")
        sp = splash(mask, 2732, 2732)
        for n in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
            save(sp, f"{IOS}/Splash.imageset/{n}")
        print("ios icon and splash written")


if __name__ == "__main__":
    sys.exit(main())
