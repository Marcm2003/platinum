# Builds build/icon.ico from pixel-art drawings so every size Windows asks for is sharp.
#   python scripts/make-icons.py      (needs Pillow: pip install pillow)
#
# Windows picks 16/20/24 px for title bars and 32/40/48 px for the taskbar depending on display
# scaling; any size missing from the .ico gets resampled and turns blurry. So the small sizes are
# drawn pixel by pixel below, the mid sizes are exact integer multiples of them (nearest neighbour),
# and only 128/256 come from the detailed build/icon.png.

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PALETTE = {
    ".": (0, 0, 0, 0),
    "o": (91, 84, 70, 255),     # outline
    "b": (236, 229, 210, 255),  # beige case
    "h": (248, 244, 234, 255),  # top highlight
    "z": (185, 175, 147, 255),  # screen bezel
    "s": (38, 42, 51, 255),     # screen
    "w": (230, 233, 239, 255),  # the "P"
    "c": (127, 180, 255, 255),  # cursor
    "k": (109, 101, 83, 255),   # floppy slot
    "g": (179, 168, 139, 255),  # grille
    "f": (179, 168, 139, 255),  # foot
}


def mac(width, side, interior, foot):
    """A compact Mac: outline columns at `side`, rows of interior pixels, then the foot."""
    pad = "." * side
    inner = width - 2 * side
    rows = [pad + "o" * inner + pad]
    rows += [pad + "o" + r + "o" + pad for r in interior]
    rows += [pad + "o" * inner + pad]
    rows += [pad + "." + "f" * foot + "." * (inner - 1 - foot) + pad if foot < inner - 2 else pad + "." + "f" * (inner - 2) + "." + pad]
    for r in rows:
        assert len(r) == width, (width, r)
    return rows


ICON_16 = mac(16, 2, [
    "hhhhhhhhhh",
    "bssssssssb",
    "bsswwwsssb",
    "bsswswsssb",
    "bsswwwsssb",
    "bsswsssssb",
    "bsswsccssb",
    "bssssssssb",
    "bbbbbbbbbb",
    "bggbbkkkkb",
    "bbbbbbbbbb",
    "bggbbbbbbb",
], 10)

ICON_20 = mac(20, 3, [
    "hhhhhhhhhhhh",
    "bzzzzzzzzzzb",
    "bzsssssssszb",
    "bzsswwwssszb",
    "bzsswsswsszb",
    "bzsswsswsszb",
    "bzsswwwssszb",
    "bzsswsssss" + "zb",
    "bzsswssccszb",
    "bzsssssssszb",
    "bzzzzzzzzzzb",
    "bbbbbbbbbbbb",
    "bgggbbkkkkkb",
    "bbbbbbbbbbbb",
    "bgggbbbbbbbb",
], 12)

ICON_24 = mac(24, 4, [
    "hhhhhhhhhhhhhh",
    "bzzzzzzzzzzzzb",
    "bzsssssssssszb",
    "bzsswwwwsssszb",
    "bzsswwsswssszb",
    "bzsswwsswssszb",
    "bzsswwwwsssszb",
    "bzsswwsssssszb",
    "bzsswwsssssszb",
    "bzsswwssccsszb",
    "bzsssssssssszb",
    "bzzzzzzzzzzzzb",
    "bbbbbbbbbbbbbb",
    "bggggbbkkkkkkb",
    "bbbbbbbbbbbbbb",
    "bggggbbbbbbbbb",
    "bbbbbbbbbbbbbb",
    "bggggbbbbbbbbb",
], 14)


def render(rows, scale=1):
    h, w = len(rows), len(rows[0])
    img = Image.new("RGBA", (w, h))
    img.putdata([PALETTE[ch] for row in rows for ch in row])
    return img.resize((w * scale, h * scale), Image.NEAREST) if scale > 1 else img


def fit(img, size):
    """Centre a pixel-art image on a transparent square canvas of `size`."""
    canvas = Image.new("RGBA", (size, size))
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
    return canvas


def main():
    out = ROOT / "build"
    big = Image.open(out / "icon.png").convert("RGBA")
    tile = big.crop((100, 100, 924, 924))  # the rounded tile without the macOS margin
    frames = {
        16: fit(render(ICON_16), 16),
        20: fit(render(ICON_20), 20),
        24: fit(render(ICON_24), 24),
        32: fit(render(ICON_16, 2), 32),
        40: fit(render(ICON_20, 2), 40),
        48: fit(render(ICON_24, 2), 48),
        64: fit(render(ICON_16, 4), 64),
        128: tile.resize((128, 128), Image.LANCZOS),
        256: tile.resize((256, 256), Image.LANCZOS),
    }
    frames[256].save(out / "icon.ico", sizes=[(s, s) for s in frames], append_images=[frames[s] for s in frames if s != 256])
    print("wrote build/icon.ico with", ", ".join(str(s) for s in frames))


if __name__ == "__main__":
    main()
