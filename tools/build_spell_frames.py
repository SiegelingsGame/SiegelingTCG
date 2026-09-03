"""Turn a hand-drawn spell/trap template render into a game-ready frame PNG.

The source renders arrive as ~1254x1254 RGB images with the card floating on a
near-white page. The shipped frames are 639x919 RGBA with the art window, the
oval energy socket cut-out's surround, and everything outside the rounded card
silhouette punched transparent, because play.html paints card art *under* the
frame (see `.hand-card.spell-trap-frame::after` in style.css).

Alignment is driven off the white art window rather than the card silhouette:
the CSS percentages for the title, art window, panel, and cost chip are all
measured against it, and it is the one landmark every template renders
identically. The target coordinates below were fitted against the shipped
frame-spell-neutral.png (mean per-pixel delta 3.5/765 when the fit is replayed
on its own source), so re-running this on that source reproduces it.

Usage: python tools/build_spell_frames.py <source.png> <element>
"""

import sys
from collections import deque

import numpy as np
from PIL import Image

TARGET_W, TARGET_H = 639, 919

# Where the source's white art window must land in the 639x919 canvas.
ART_X0, ART_X1 = 56.364, 580.269
ART_Y0, ART_Y1 = 53.633, 627.899

FRAME_DIR = "src/main/resources/static/img/frames"
# The metal template (the original hand-drawn grey render) is the geometry
# reference: neutral was re-skinned to the black render and no longer holds the
# fitted mask this script was calibrated against.
REFERENCE_ALPHA = f"{FRAME_DIR}/frame-spell-metal.png"


def find_art_window(path):
    """Bounds of the card's white art window in source pixels."""
    im = np.array(Image.open(path).convert("RGB")).astype(int)
    height, width, _ = im.shape
    white = im.min(axis=2) > 238
    # 38% down the page is inside the art window on every template: below the
    # oval socket, above the info panel.
    y = int(height * 0.38)
    row = white[y]
    x0 = x1 = width // 2
    while x0 > 0 and row[x0 - 1]:
        x0 -= 1
    while x1 < width - 1 and row[x1 + 1]:
        x1 += 1
    # Sample the vertical run left of the oval so it does not clip the scan.
    col = white[:, int(x0 + (x1 - x0) * 0.15)]
    y0 = y1 = y
    while y0 > 0 and col[y0 - 1]:
        y0 -= 1
    while y1 < height - 1 and col[y1 + 1]:
        y1 += 1
    return x0, x1, y0, y1


def align(path):
    x0, x1, y0, y1 = find_art_window(path)
    scale_x = (ART_X1 - ART_X0) / (x1 - x0)
    scale_y = (ART_Y1 - ART_Y0) / (y1 - y0)
    left = x0 - ART_X0 / scale_x
    top = y0 - ART_Y0 / scale_y
    box = (left, top, left + TARGET_W / scale_x, top + TARGET_H / scale_y)
    return Image.open(path).convert("RGB").resize((TARGET_W, TARGET_H), Image.LANCZOS, box=box)


def page_background_mask(rgb):
    """Flood the near-white page in from the canvas edges.

    Filling rather than thresholding keeps the white art window opaque here —
    the card's outline seals it off from the page — so the art punch stays the
    reference mask's job.
    """
    page = rgb[2, 2].astype(int)
    close = (np.abs(rgb.astype(int) - page).sum(axis=2) < 60)
    mask = np.zeros(close.shape, dtype=bool)
    queue = deque()
    h, w = close.shape
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not mask[y, x]:
                mask[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not mask[y, x]:
                mask[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not mask[ny, nx]:
                mask[ny, nx] = True
                queue.append((ny, nx))
    return mask


def art_window_mask():
    """The reference frame's art punch, minus its own silhouette cut-out."""
    ref = np.array(Image.open(REFERENCE_ALPHA))[..., 3]
    transparent = ref < 128
    # The silhouette cut-out touches the canvas edge; the art window does not.
    edge = np.zeros_like(transparent)
    edge[0, :] = edge[-1, :] = True
    edge[:, 0] = edge[:, -1] = True
    outside = np.zeros_like(transparent)
    queue = deque()
    h, w = transparent.shape
    for y, x in zip(*np.where(transparent & edge)):
        outside[y, x] = True
        queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and transparent[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                queue.append((ny, nx))
    return transparent & ~outside


def build(source, element):
    aligned = align(source)
    rgb = np.array(aligned)
    alpha = np.full(rgb.shape[:2], 255, dtype=np.uint8)
    alpha[page_background_mask(rgb)] = 0
    alpha[art_window_mask()] = 0
    out = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    png = f"{FRAME_DIR}/frame-spell-{element}.png"
    out.save(png)
    # Lossy webp twin, matching the other frames: the CSS only ever loads the
    # PNG, so this is the size-conscious copy for anything that prefers webp.
    out.save(f"{FRAME_DIR}/frame-spell-{element}.webp", quality=90, method=6)
    print(f"wrote {png} (+ .webp)")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
