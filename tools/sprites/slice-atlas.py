"""Cut a single labelled pose atlas (every pose a row or panel on one image,
blurred painted backdrop) into the frame strips Siege battle sprites play
(adventure.js ANIM_SPRITES). For one-sheet-per-pose art on a flat colour use
slice-sheets.py instead.

  python3 -I tools/sprites/slice-atlas.py LAYOUT.json OUT_DIR

LAYOUT.json:
  {"src": "atlas.png", "name": "floraknight", "scale": 1.0,
   "erase": [[x0,y0,x1,y1], ...],            # labels, panel rules
   "anchor": "face",                         # or "mass" for faceless art
   "poses": [{"pose": "idle", "box": [x0,y0,x1,y1], "frames": 7,
              "dropLoose": true,              # discard floating petals
              "dropDark": true,               # discard dim loose specks (cold embers)
              "assign": [[x0,y0,x1,y1,k]],    # every pixel in the box -> frame k
                                              # [..., k, "split"]: only pieces
                                              # walled off by outline from x1;
                                              # k = -1 discards the pixels
              "mirror": [k]}, ...]}           # flip frame k to face like the rest
  assign is for an effect drawn touching the next frame (a fire breath reaching
  the next pose): no automatic rule can tell whose it is, the layout can.

The backdrop is painted soft, the sprites are crisp pixel art, so background is
"smooth pixels reachable from the image edge". Every pose shares one cell with
the face centred and the row's ground line on one baseline, so poses swap
without the unit jumping. Prints the cell and fit for ANIM_SPRITES.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw

cfg = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
rgb = np.array(Image.open(cfg['src']).convert('RGB')).astype(np.int32)
H, W = rgb.shape[:2]

pad = np.pad(rgb, ((1, 1), (1, 1), (0, 0)), mode='edge')
grad = np.zeros((H, W), np.int32)
for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
    grad = np.maximum(grad, np.abs(rgb - pad[1 + dy:1 + dy + H, 1 + dx:1 + dx + W]).max(2))
# .copy(): PIL's floodfill silently does nothing on a fromarray() view.
m = Image.fromarray(((grad < cfg.get('smooth', 12)) * 255).astype(np.uint8)).copy()
for x in range(0, W, 5):
    for y in (0, H - 1):
        if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
for y in range(0, H, 5):
    for x in (0, W - 1):
        if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
# Panelled atlases fence each row in a closed border, so the backdrop inside
# a panel is unreachable from the image edge: seed from each pose box too.
for q in cfg['poses']:
    bx0, by0, bx1, by1 = q['box']
    for x in range(bx0, bx1, 5):
        for y in (by0, by1 - 1):
            if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
    for y in range(by0, by1, 5):
        for x in (bx0, bx1 - 1):
            if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
fg = np.array(m) != 128
for x0, y0, x1, y1 in cfg.get('erase', []):
    fg[y0:y1, x0:x1] = False


def components(mask):
    img = Image.fromarray(mask.astype(np.uint8)).copy()
    lab = np.zeros(mask.shape, np.int32)
    out, n = [], 1
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        if lab[y, x]: continue
        n += 1
        ImageDraw.floodfill(img, (int(x), int(y)), 2)
        reg = np.array(img) == 2
        lab[reg] = n
        img.paste(0, mask=Image.fromarray((reg * 255).astype(np.uint8)))
        yy, xx = np.nonzero(reg)
        out.append(dict(mask=reg, area=int(reg.sum()), x0=int(xx.min()), x1=int(xx.max()),
                        y0=int(yy.min()), y1=int(yy.max())))
    return out


R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
skin = (R > 175) & (G > 115) & (G < 200) & (B < 140) & (R - G > 25) & (G - B > 20)


def face_x(mask):
    ys, xs = np.nonzero(mask & skin)
    if len(xs) < 40: return None
    mx, my = np.median(xs), np.median(ys)
    near = (np.abs(xs - mx) < 45) & (np.abs(ys - my) < 45)
    return float(xs[near].mean())


MASS = cfg.get('anchor', 'face') == 'mass'


def mass_x(mask):
    # Median column of the body: the tail and the snout balance out, so the
    # torso stays put while the head bobs.
    return float(np.median(np.nonzero(mask)[1]))


poses = {}
for p in cfg['poses']:
    x0, y0, x1, y1 = p['box']
    band = np.zeros_like(fg); band[y0:y1, x0:x1] = fg[y0:y1, x0:x1]
    cs = components(band)
    # A big effect (a slash crescent) can outweigh a crouched body, so pieces
    # with a face rank first; size only decides among equals (faint frames
    # hide the face entirely).
    # "mass" sheets (a creature with no tan face, all orange fur and fire)
    # rank by size alone: the face test would also light up flames.
    for c in cs: c['face'] = MASS or int((c['mask'] & skin).sum()) >= 40
    bodies = sorted([c for c in cs if c['area'] > 4000],
                    key=lambda c: (not c['face'], -c['area']))[:p['frames']]
    # Neighbouring frames whose swords touch come out as one blob: split the
    # widest blob at its thinnest column until the frame count is reached.
    while len(bodies) < p['frames']:
        c = max(bodies, key=lambda c: c['x1'] - c['x0'])
        w = c['x1'] - c['x0']
        cols = c['mask'][:, c['x0']:c['x1'] + 1].sum(0)
        lo, hi = int(w * .3), int(w * .7)
        cut = c['x0'] + lo + int(np.argmin(cols[lo:hi]))
        left = c['mask'].copy(); left[:, cut:] = False
        right = c['mask'].copy(); right[:, :cut] = False
        bodies.remove(c)
        c['used'] = True
        for part in (left, right):
            yy, xx = np.nonzero(part)
            bodies.append(dict(mask=part, area=int(part.sum()), x0=int(xx.min()), x1=int(xx.max()),
                               y0=int(yy.min()), y1=int(yy.max())))
    bodies.sort(key=lambda c: c['x0'])
    for b in bodies: b['used'] = True
    frames = [dict(mask=b['mask'].copy(), body=b) for b in bodies]
    for c in cs:
        if c.get('used') or p.get('dropLoose') or c['area'] < 12: continue
        if p.get('dropDark') and c['area'] < 60 and rgb[c['mask']].max(1).mean() < 150: continue
        cx = (c['x0'] + c['x1']) / 2
        dist = [0 if b['x0'] <= cx <= b['x1'] else min(abs(cx - b['x0']), abs(cx - b['x1'])) for b in bodies]
        frames[int(np.argmin(dist))]['mask'] |= c['mask']
    for a in p.get('assign', []):
        x0a, y0a, x1a, y1a, k = a[:5]
        box = np.zeros_like(fg); box[y0a:y1a, x0a:x1a] = band[y0a:y1a, x0a:x1a]
        if a[5:] == ['split']:
            # A breath drawn up against the next pose's outline: a straight
            # cut slices one or the other. Outline pixels stay where they are;
            # the rest falls into pieces, and only those that do not reach the
            # box's right edge (the next pose's interior does) change hands.
            dark = rgb.max(2) < 110
            moved = np.zeros_like(fg)
            for c in components(box & ~dark):
                if c['x1'] < x1a - 1: moved |= c['mask']
            box = moved
        for f in frames:
            f['mask'] &= ~box
            f['body']['mask'] = f['body']['mask'] & ~box
        if k >= 0: frames[k]['mask'] |= box
    for k in p.get('mirror', []):
        frames[k]['mirror'] = True
    ground = float(np.median([b['y1'] for b in bodies]))
    for f in frames:
        fx = mass_x(f['body']['mask']) if MASS else face_x(f['body']['mask'])
        f['ax'] = fx if fx is not None else (f['body']['x0'] + f['body']['x1']) / 2
        f['ay'] = ground
    poses[p['pose']] = frames
    print(p['pose'], len(frames), 'frames, ground', ground, 'anchors', [round(f['ax']) for f in frames])

L = Rt = Up = Dn = 0
for frames in poses.values():
    for f in frames:
        ys, xs = np.nonzero(f['mask'])
        L = max(L, f['ax'] - xs.min()); Rt = max(Rt, xs.max() - f['ax'])
        Up = max(Up, f['ay'] - ys.min()); Dn = max(Dn, ys.max() - f['ay'])
half = int(np.ceil(max(L, Rt))) + 4
CW, CH = 2 * half, int(np.ceil(Up + Dn)) + 8
top = int(np.ceil(Up)) + 4
S = float(cfg.get('scale', 1.0))
cw, ch = round(CW * S), round(CH * S)
for name, frames in poses.items():
    strip = Image.new('RGBA', (CW * len(frames), CH), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        ys, xs = np.nonzero(f['mask'])
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        tile = Image.fromarray(np.dstack([rgb[by0:by1, bx0:bx1], f['mask'][by0:by1, bx0:bx1] * 255]).astype(np.uint8))
        x = i * CW + half + bx0 - f['ax']
        if f.get('mirror'):
            # Reflect about the anchor so the body stays on the cell's centre line.
            tile = tile.transpose(Image.FLIP_LEFT_RIGHT)
            x = i * CW + half - (bx1 - f['ax'])
        strip.alpha_composite(tile, (int(round(x)), int(round(top + by0 - f['ay']))))
    strip = strip.resize((cw * len(frames), ch), Image.LANCZOS)
    strip.save('%s/%s-%s.webp' % (OUT, cfg['name'], name), 'WEBP', quality=88, method=6)
idle = poses['idle'][0]['body']
fit = (idle['y1'] - idle['y0']) / CH
# base: share of the cell below the feet (petals lying on the ground), so the
# renderer can sink the cell and keep the feet on the art box's floor.
print('cell', cw, ch, 'fit (idle body / cell height)', round(fit, 3), 'base', round((CH - top) / CH, 3),
      'frames', {k: len(v) for k, v in poses.items()})
