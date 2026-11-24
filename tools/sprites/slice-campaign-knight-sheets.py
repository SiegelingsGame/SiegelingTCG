"""Slice owner-supplied 8-dir campaign knight sheets into Bob-compatible frames.

Each walk sheet is 2048x768 (8x3 cells of 256px): columns DOWN … DOWN-LEFT,
rows idle / walk-a / walk-b. Outputs 160x200 WebP frames with a shared 128px
figure height and foot baseline at y=195, matching img/sprites/squire-bob/.

Usage:
  python3 tools/sprites/slice-campaign-knight-sheets.py ATTACHMENT_DIR OUT_ROOT

ATTACHMENT_DIR holds the six JPEGs (concept + walk per knight). OUT_ROOT receives
img/sprites/{pyla,ser-airek,glacia}/ plus optional QA contact sheets under QA/.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

DIRS = ['down', 'down-right', 'right', 'up-right', 'up', 'up-left', 'left', 'down-left']
POSES = ['idle', 'walk-a', 'walk-b']
# Floor oval + bottom grid sit below the boots on every supplied sheet.
FOOT_CLIP = 228

# (walk_sheet, concept_sheet, out_folder)
KNIGHTS = [
    ('pyla-walk.jpg', 'pyla-concept.jpg', 'pyla'),
    ('airek-walk.jpg', 'airek-concept.jpg', 'ser-airek'),
    ('glacia-walk.jpg', 'glacia-concept.jpg', 'glacia'),
]


def components(mask: np.ndarray):
    work = Image.fromarray(mask.astype(np.uint8)).copy()
    for y, x in zip(*np.nonzero(mask)):
        if work.getpixel((int(x), int(y))) != 1:
            continue
        ImageDraw.floodfill(work, (int(x), int(y)), 2)
        region = np.array(work) == 2
        work.paste(0, mask=Image.fromarray((region * 255).astype(np.uint8)))
        yield region


def extract_cell(sheet_rgb: np.ndarray, row: int, col: int) -> dict:
    cell = sheet_rgb[row * 256:(row + 1) * 256, col * 256:(col + 1) * 256].copy()
    h, w = cell.shape[:2]
    rgb = cell.astype(np.int16)
    dark = rgb.max(2) < 55
    walk = (rgb.min(2) > 190) & ((rgb.max(2) - rgb.min(2)) < 45)
    walk[:48] = True
    walk[:, :3] = True
    walk[:, w - 3:] = True
    walk[h - 3:, :] = True
    flood = Image.fromarray(walk.astype(np.uint8)).copy()
    for x in range(w):
        for y in (0, h - 1):
            if flood.getpixel((x, y)) == 1:
                ImageDraw.floodfill(flood, (x, y), 2)
    for y in range(h):
        for x in (0, w - 1):
            if flood.getpixel((x, y)) == 1:
                ImageDraw.floodfill(flood, (x, y), 2)
    alpha = np.array(flood) != 2
    alpha[:52] = False
    alpha[:, :2] = False
    alpha[:, w - 2:] = False
    alpha[FOOT_CLIP:, :] = False

    kept = np.zeros_like(alpha)
    for region in components(alpha):
        if region.sum() < 800:
            continue
        if (region & dark).sum() < 120:
            continue
        kept |= region
    if not kept.any():
        raise RuntimeError(f'empty cell r{row}c{col}')
    best = None
    best_n = 0
    for region in components(kept):
        n = region.sum()
        if n > best_n:
            best, best_n = region, n
    alpha = best
    ys, xs = np.nonzero(alpha)
    y0b, y1b = int(ys.min()), int(ys.max()) + 1
    x0b, x1b = int(xs.min()), int(xs.max()) + 1
    band = alpha[y0b + int((y1b - y0b) * 0.18): y0b + int((y1b - y0b) * 0.42)]
    ax = float(np.median(np.nonzero(band)[1])) if band.any() else (x0b + x1b) / 2
    rgba = np.dstack([cell, (alpha * 255).astype(np.uint8)])
    return {'image': Image.fromarray(rgba), 'bounds': (x0b, y0b, x1b, y1b), 'ax': ax}


def export_knight(walk_path: Path, concept_path: Path, out_dir: Path, qa_dir: Path | None) -> None:
    sheet = np.array(Image.open(walk_path).convert('RGB'))
    out_dir.mkdir(parents=True, exist_ok=True)
    Image.open(walk_path).convert('RGB').save(out_dir / 'overworld-sheet.webp', quality=90, method=6)

    frames = []
    keys = []
    heights = []
    for r, pose in enumerate(POSES):
        for c, direction in enumerate(DIRS):
            frame = extract_cell(sheet, r, c)
            frames.append(frame)
            keys.append(f'{direction}-{pose}')
            heights.append(frame['bounds'][3] - frame['bounds'][1])

    med = float(np.median(heights))
    scale = 128.0 / med
    contact = Image.new('RGBA', (160 * 8, 200 * 3), (236, 236, 242, 255))
    for i, (frame, key) in enumerate(zip(frames, keys)):
        x0, y0, x1, y1 = frame['bounds']
        tile = frame['image'].crop((x0, y0, x1, y1))
        sw = max(1, round(tile.width * scale))
        sh = max(1, round(tile.height * scale))
        tile = tile.resize((sw, sh), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (160, 200), (0, 0, 0, 0))
        ax_s = (frame['ax'] - x0) * scale
        px = int(round(80 - ax_s))
        canvas.alpha_composite(tile, (px, 195 - sh + 1))
        arr = np.array(canvas)
        ys = np.where(arr[:, :, 3] > 10)[0]
        if len(ys):
            top, bot = int(ys.min()), int(ys.max())
            fig = canvas.crop((0, top, 160, bot + 1)).resize((160, 128), Image.Resampling.LANCZOS)
            canvas = Image.new('RGBA', (160, 200), (0, 0, 0, 0))
            canvas.alpha_composite(fig, (0, 195 - 128 + 1))
        canvas.save(out_dir / f'{key}.webp', quality=90, method=6)
        contact.alpha_composite(canvas, ((i % 8) * 160, (i // 8) * 200))

    if concept_path.exists():
        concept = Image.open(concept_path).convert('RGBA')
        concept.save(out_dir / 'concept-sheet.webp', quality=90, method=6)
        w, h = concept.size
        hero = concept.crop((0, int(h * 0.06), int(w * 0.52), int(h * 0.92)))
        portrait = hero.crop((0, 0, hero.width, int(hero.height * 0.62)))
        portrait.thumbnail((256, 256), Image.Resampling.LANCZOS)
        pad = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
        pad.alpha_composite(portrait, ((256 - portrait.width) // 2, (256 - portrait.height) // 2))
        pad.save(out_dir / 'portrait.webp', quality=90, method=6)

    if qa_dir is not None:
        qa_dir.mkdir(parents=True, exist_ok=True)
        contact.save(qa_dir / f'{out_dir.name}-contact.webp', quality=90)


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    source = Path(sys.argv[1])
    out_root = Path(sys.argv[2])
    qa = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    for walk_name, concept_name, folder in KNIGHTS:
        export_knight(source / walk_name, source / concept_name, out_root / folder, qa)
        print(folder, 'ready', flush=True)


if __name__ == '__main__':
    main()
