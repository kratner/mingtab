"""Draws the MingTab toolbar icons: a terracotta tile with an open, bright doorway."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
TILE, HALL = (181, 69, 47, 255), (246, 238, 222, 255)

def draw(size: int) -> Image.Image:
    s = 8  # supersample, then downscale for smooth edges
    big = size * s
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.22, fill=TILE)
    # Doorway: arch-topped opening, wide enough to read at 16px.
    l, r, top, bottom = big * 0.28, big * 0.72, big * 0.24, big * 0.80
    w = r - l
    d.rectangle([l, top + w / 2, r, bottom], fill=HALL)
    d.pieslice([l, top, r, top + w], 180, 360, fill=HALL)
    return img.resize((size, size), Image.LANCZOS)

for n in (16, 32, 48, 128):
    draw(n).save(OUT / f"icon-{n}.png")
print("wrote", sorted(p.name for p in OUT.iterdir()))
