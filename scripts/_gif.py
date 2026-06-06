#!/usr/bin/env python3
"""Assemble a frames JSON into a scaled-up GIF for preview.

Usage: _gif.py [frames.json] [out.gif]   (defaults: docs/ul-idle-frames.json → docs/ul-idle.gif)
"""
import json, os, sys
from PIL import Image

here = os.path.dirname(__file__)
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "../docs/ul-idle-frames.json")
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "../docs/ul-idle.gif")
data = json.load(open(src))
W, H, BG = data["w"], data["h"], data["bg"]
S = 16  # px per sprite-pixel
bg = tuple(int(BG[i:i+2], 16) for i in (1, 3, 5))

def hex2rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))

imgs, durs = [], []
for fr in data["frames"]:
    im = Image.new("RGB", (W * S, H * S), bg)
    px = im.load()
    for r, row in enumerate(fr["p"]):
        for c, col in enumerate(row):
            if not col:
                continue
            rgb = hex2rgb(col)
            for dy in range(S):
                for dx in range(S):
                    px[c * S + dx, r * S + dy] = rgb
    imgs.append(im); durs.append(fr["d"])

imgs[0].save(dst, save_all=True, append_images=imgs[1:], duration=durs, loop=0, disposal=2)
print("wrote", dst, len(imgs), "frames")
