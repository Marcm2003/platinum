# Turns the PGM frames from firmware/tools/oled-preview into OLED-looking PNGs and an animated GIF.
#   python scripts/oled-frames.py <framesdir> <outdir> 72x40 [128x64 ...]
# Called by scripts/oled-preview.mjs. Needs Pillow.

import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ON = (200, 232, 255)   # the slightly blue white of these OLEDs
OFF = (14, 16, 20)
GLASS = (6, 7, 9)


def oled(pgm: Path, cell: int) -> Image.Image:
    src = Image.open(pgm).convert("L")
    w, h = src.size
    pad = cell * 3
    img = Image.new("RGB", (w * cell + pad * 2, h * cell + pad * 2), GLASS)
    d = ImageDraw.Draw(img)
    px = src.load()
    for y in range(h):
        for x in range(w):
            x0, y0 = pad + x * cell, pad + y * cell
            d.rectangle([x0, y0, x0 + cell - 2, y0 + cell - 2], fill=ON if px[x, y] else OFF)
    glow = img.filter(ImageFilter.GaussianBlur(cell * 0.6))
    return Image.blend(img, Image.eval(glow, lambda v: min(255, v * 2)), 0.18)


def main():
    frames_dir, out_dir, sizes = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]
    out_dir.mkdir(parents=True, exist_ok=True)
    for size in sizes:
        d = frames_dir / size
        cell = 7 if size == "72x40" else 4
        for still in sorted(d.glob("*.pgm")):
            if still.stem.startswith("anim_"):
                continue
            oled(still, cell).save(out_dir / f"{size}-{still.stem}.png")
        anim = [oled(p, cell).convert("P", palette=Image.ADAPTIVE, colors=32) for p in sorted(d.glob("anim_*.pgm"))]
        if anim:
            anim[0].save(out_dir / f"{size}-tour.gif", save_all=True, append_images=anim[1:], duration=100, loop=0, optimize=True)
        print(f"{size}: {len(list(d.glob('*.pgm'))) - len(anim)} stills, {len(anim)}-frame GIF")


if __name__ == "__main__":
    main()
