#!/usr/bin/env python3
"""Assemble docs/ul-idle-frames.json into a scaled-up GIF for preview."""
import json, os
from PIL import Image

here = os.path.dirname(__file__)
data = json.load(open(os.path.join(here, "../docs/ul-idle-frames.json")))
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

out = os.path.join(here, "../docs/ul-idle.gif")
imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=durs, loop=0, disposal=2)
print("wrote", out, len(imgs), "frames")
