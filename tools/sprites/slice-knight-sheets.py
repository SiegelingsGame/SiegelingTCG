"""Extract the owner's two-row, six-frame Dominion knight sheets without redrawing.

Usage: python tools/sprites/slice-knight-sheets.py ATTACHMENT_DIR OUTPUT_DIR [QA_DIR]
Requires Pillow and NumPy. Labels/borders are excluded by the measured row boxes.
Each knight shares one scale and foot baseline across idle/walk, in 256x384 cells.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SHEETS = {
    'fire': (1, [(119, 10, 1272, 204), (119, 224, 1272, 412)]),
    'metal': (2, [(12, 33, 1270, 296), (12, 353, 1270, 602)]),
    'ice': (3, [(12, 35, 1270, 333), (12, 394, 1270, 670)]),
    'psychic': (4, [(12, 35, 1270, 296), (12, 356, 1270, 601)]),
    'shadow': (5, [(12, 34, 1270, 296), (12, 355, 1270, 601)]),
    'light': (6, [(12, 34, 1270, 296), (12, 355, 1270, 601)]),
    'wind': (7, [(12, 35, 1270, 300), (12, 360, 1270, 600)]),
    'earth': (8, [(12, 34, 1270, 296), (12, 355, 1270, 601)]),
    'water': (9, [(12, 36, 1270, 301), (12, 356, 1270, 601)]),
    'electric': (10, [(12, 21, 1270, 382), (12, 467, 1270, 799)]),
}


def components(mask):
    work = Image.fromarray(mask.astype(np.uint8)).copy()
    for y, x in zip(*np.nonzero(mask)):
        if work.getpixel((int(x), int(y))) != 1:
            continue
        ImageDraw.floodfill(work, (int(x), int(y)), 2)
        region = np.array(work) == 2
        work.paste(0, mask=Image.fromarray((region * 255).astype(np.uint8)))
        yield region


def extract_row(image, box, element, pose):
    rgb = np.array(image.crop(box).convert('RGB')).astype(np.int16)
    # Background is dark and nearly flat; flood only matching edge-connected pixels
    # so dark armour/hair enclosed by the character stays intact.
    border = np.concatenate((rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]))
    dark = border[border.max(1) < 65]
    bg = np.median(dark, axis=0)
    distance = np.abs(rgb - bg).max(2)
    pad = np.pad(rgb, ((1, 1), (1, 1), (0, 0)), mode='edge')
    gradient = np.zeros(distance.shape)
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        gradient = np.maximum(gradient, np.abs(rgb - pad[1 + dy:1 + dy + rgb.shape[0], 1 + dx:1 + dx + rgb.shape[1]]).max(2))
    chroma = rgb.max(2) - rgb.min(2)
    candidate = ((distance < 10) | ((distance < 25) & (chroma < 12)) | ((distance < 20) & (gradient < 5))) & (rgb.max(2) < 55)
    flood = Image.fromarray(candidate.astype(np.uint8)).copy()
    h, w = candidate.shape
    for x in range(w):
        for y in (0, h - 1):
            if flood.getpixel((x, y)) == 1:
                ImageDraw.floodfill(flood, (x, y), 2)
    for y in range(h):
        for x in (0, w - 1):
            if flood.getpixel((x, y)) == 1:
                ImageDraw.floodfill(flood, (x, y), 2)
    alpha = np.array(flood) != 2
    for region in components(np.array(flood) == 1):
        if region.sum() > 200 and distance[region].mean() < 15 and chroma[region].mean() < 10:
            alpha[region] = False
    # The title's underline enters the first cell on some sheets.
    label_bottom = {'ice': 40, 'electric': 58, 'earth': 44, 'wind': 40}.get(element, 36) if pose == 'idle' else {'ice': 404, 'electric': 478}.get(element, 361)
    label_right = 140 if element == 'electric' and pose == 'idle' else 175
    if element != 'fire' and label_bottom > box[1]:
        alpha[:label_bottom - box[1], :label_right - box[0]] = False
    if element == 'fire':
        # Fire alone has a vertical rule between every pose; their positions are
        # slightly uneven. A rule runs almost the full row height.
        near_rule = np.zeros(w, dtype=bool)
        for i in range(1, 6):
            center = round(w * i / 6)
            near_rule[max(0, center - 18):center + 19] = True
        rules = np.where((alpha.sum(0) > h * .9) & near_rule)[0]
        for rule in rules:
            alpha[:, max(0, rule - 2):rule + 3] = False
    # JPEG compression leaves isolated dark flecks beside bright outlines.
    for region in components(alpha):
        yy, xx = np.nonzero(region)
        label_fragment = xx.max() < 20 and yy.max() < 25 and region.sum() < 150
        if label_fragment or region.sum() < 12 or (region.sum() < 100 and rgb[region].max(1).mean() < 80):
            alpha[region] = False
    fill = alpha.sum(0)
    cuts = [np.zeros(h, dtype=int)]
    for i in range(1, 6):
        center = round(w * i / 6)
        lo, hi = center - 24, center + 25
        costs = fill[lo:hi] + np.abs(np.arange(lo, hi) - center) * .03
        guide = np.full(h, lo + np.argmin(costs), dtype=float)
        if element == 'electric':
            # The idle spear reaches into the next column above that knight's
            # shoulder. Follow the dark gap around it rather than slicing it off.
            if pose == 'idle':
                seams = [[305, 290, 248, 236, 238], [506, 493, 460, 439, 443],
                         [705, 695, 666, 651, 655], [908, 900, 866, 860, 866],
                         [1110, 1103, 1070, 1068, 1072]]
                guide = np.interp(np.arange(h), [0, 80, 160, 220, h - 1], np.array(seams[i - 1]) - box[0])
            else:
                guide = center + np.linspace(20, 12, h)
        cols = np.arange(max(1, int(guide.min()) - 35), min(w - 1, int(guide.max()) + 36))
        cost = alpha[:, cols] * (3 + rgb[:, cols].max(2) / 20) + np.abs(cols[None, :] - guide[:, None]) * .008
        if element == 'electric' and pose == 'idle':
            cost += (np.abs(cols[None, :] - guide[:, None]) > 10) * 1e6
        back = np.zeros(cost.shape, dtype=np.int16)
        dp = cost[0].copy()
        for y in range(1, h):
            options = np.stack([np.pad(dp, (2, 2), constant_values=1e9)[2 + dx:2 + dx + len(cols)] + abs(dx) * .15 for dx in (-2, -1, 0, 1, 2)])
            choice = options.argmin(0)
            back[y] = choice - 2
            dp = cost[y] + options[choice, np.arange(len(cols))]
        seam = np.zeros(h, dtype=int)
        k = int(dp.argmin())
        for y in range(h - 1, -1, -1):
            seam[y] = cols[k]
            k += int(back[y, k])
        cuts.append(seam)
    cuts.append(np.full(h, w, dtype=int))
    frames = []
    for left, right in zip(cuts, cuts[1:]):
        a = alpha & (np.arange(w)[None, :] >= left[:, None]) & (np.arange(w)[None, :] < right[:, None])
        if element == 'electric' and pose == 'idle':
            for region in components(a):
                if region.sum() < 600 and np.nonzero(region)[0].mean() > h * .5:
                    a[region] = False
        ys, xs = np.nonzero(a)
        assert len(xs) > 3000, 'Empty or incomplete knight frame'
        rgba = np.dstack((rgb, a * 255)).astype(np.uint8)
        # Use the upper torso centre; wide weapons and trailing capes must not drag
        # the animation's anchor sideways between frames.
        top, bottom = int(ys.min()), int(ys.max())
        band = a[top + round((bottom - top) * .20):top + round((bottom - top) * .52)]
        ax = float(np.median(np.nonzero(band)[1]))
        frames.append({'image': Image.fromarray(rgba), 'ax': ax, 'base': bottom,
                       'bounds': (int(xs.min()), top, int(xs.max()) + 1, bottom + 1)})
    return frames


def main():
    source, output = map(Path, sys.argv[1:3])
    qa = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    output.mkdir(parents=True, exist_ok=True)
    if qa:
        qa.mkdir(parents=True, exist_ok=True)
    summary = {}
    for element, (number, boxes) in SHEETS.items():
        if len(sys.argv) > 4 and element not in sys.argv[4:]:
            continue
        image = Image.open(source / f'{number}-Photo-{number}.jpg')
        poses = {pose: extract_row(image, box, element, pose) for pose, box in zip(('idle', 'walk'), boxes)}
        # These source cells are clipped by the sheet's title/outer edge. Repeat
        # an intact supplied pose instead of drawing missing hair or a weapon.
        if element == 'wind':
            poses['idle'][0] = poses['idle'][1]
        if element == 'electric':
            poses['idle'][5] = poses['idle'][1]
        frames = sum(poses.values(), [])
        # Capes trail mostly to one side. Centre the shared motion envelope, not
        # the torso, to avoid shrinking every pose around that empty half-cell.
        left = min(f['bounds'][0] - f['ax'] for f in frames)
        right = max(f['bounds'][2] - f['ax'] for f in frames)
        offset = (left + right) / 2
        for frame in {id(f): f for f in frames}.values():
            frame['ax'] += offset
        extent = max(max(f['ax'] - f['bounds'][0], f['bounds'][2] - f['ax']) for f in frames)
        height = max(f['base'] - f['bounds'][1] + 1 for f in frames)
        scale = min(118 / extent, 360 / height)
        for pose, row in poses.items():
            strip = Image.new('RGBA', (256 * 6, 384))
            for i, frame in enumerate(row):
                x0, y0, x1, y1 = frame['bounds']
                tile = frame['image'].crop((x0, y0, x1, y1))
                tile = tile.resize((round(tile.width * scale), round(tile.height * scale)), Image.Resampling.NEAREST)
                x = round(i * 256 + 128 + (x0 - frame['ax']) * scale)
                y = 376 - tile.height
                strip.alpha_composite(tile, (x, y))
            strip.save(output / f'knight-{element}-{pose}.webp', quality=90, method=6)
            if qa:
                check = Image.new('RGBA', strip.size, '#c2c9cb')
                check.alpha_composite(strip)
                check.convert('RGB').save(qa / f'{element}-{pose}.jpg', quality=92)
        summary[element] = {'source': f'{number}-Photo-{number}.jpg', 'cell': [256, 384], 'frames': 6, 'poses': ['idle', 'walk'],
                            'idleSourceFrames': [1, 1, 2, 3, 4, 5] if element == 'wind' else [0, 1, 2, 3, 4, 1] if element == 'electric' else list(range(6))}
        print(element, 'ready', flush=True)
    (output / 'manifest.json').write_text(json.dumps(summary, indent=2) + '\n')


if __name__ == '__main__':
    main()
