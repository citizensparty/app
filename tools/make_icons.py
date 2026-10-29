#!/usr/bin/env python3
"""Draw the app icons (the four-square grid mark) into app/icons/. Needs Pillow. Run once; the PNGs are committed."""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "app/icons"
TEAL, WHITE = (15, 110, 102, 255), (255, 255, 255)


def draw(size, maskable):
    s = 4  # supersample
    W = size * s
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, W, W], fill=TEAL)
        u = W / 32 * 0.7; o = W / 2 - 16 * u  # mark inside the 70% safe zone
    else:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=W * 8 / 32, fill=TEAL)
        u = W / 32; o = 0
    for x, y, a in ((7, 7, 255), (17, 7, 140), (7, 17, 140), (17, 17, 255)):
        sq = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        ImageDraw.Draw(sq).rounded_rectangle([o + x * u, o + y * u, o + (x + 8) * u, o + (y + 8) * u], radius=1.5 * u, fill=WHITE + (a,))
        im = Image.alpha_composite(im, sq)
    return im.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
for n in (192, 512):
    draw(n, False).save(OUT / f"icon-{n}.png")
draw(512, True).save(OUT / "maskable-512.png")
draw(180, True).convert("RGB").save(OUT / "apple-touch-icon.png")
print("icons ->", OUT)
