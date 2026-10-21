"""Cut a single labelled pose atlas (every pose a row or panel on one image,
blurred painted backdrop) into the frame strips Siege battle sprites play
(adventure.js ANIM_SPRITES). For one-sheet-per-pose art on a flat colour use
slice-sheets.py instead.

  python3 -I tools/sprites/slice-atlas.py LAYOUT.json OUT_DIR

LAYOUT.json:
  {"src": "atlas.png", "name": "floraknight", "scale": 1.0,
   "erase": [[x0,y0,x1,y1], ...],            # labels, panel rules
   "anchor": "face",                         # or "mass" for faceless art
   "pockets": true,                          # clear enclosed backdrop patches
   "key": [[x0,y0,x1,y1,tol(,[r,g,b])], ...],# drop backdrop-coloured pixels
   "poses": [{"pose": "idle", "box": [x0,y0,x1,y1], "frames": 7,
              "dropLoose": true,              # discard floating petals
              "dropDark": true,               # discard dim loose specks (cold embers)
              "assign": [[x0,y0,x1,y1,k]],    # every pixel in the box -> frame k
                                              # [..., k, "split"]: only pieces
                                              # walled off by outline from x1;
                                              # k = -1 discards the pixels;
                                              # [..., k, "divide"]: like split,
                                              # and pieces reaching x1 go to k+1
              "mirror": [k],                  # flip frame k to face like the rest
              "seeded": true,                 # grow frames from their bodies
              "seeds": [[x,y], ...],          #   optional explicit body points
              "ax": {"k": x},                 # pin frame k's anchor column
              "dropSlivers": true,            # drop loose <=3px-tall slivers
              "keep": [k, ...]}, ...]}        # ship only these frames (drop
                                              # poses drawn overlapping)
  seeded is for limbs that touch the next pose: each frame floods outward from
  a point inside its own body through non-outline pixels, so touching limbs
  part along their own outlines; leftover outline and specks join the nearest.
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
for kq in cfg.get('key', []):
    # Textured ground (grass) under a creature's feet is too busy to read as
    # smooth backdrop, so it clings to the art. Inside the strip, pixels close
    # to the backdrop colour around them go; the art's own colours do not. A
    # painted shadow under the wings is darker than the open backdrop, so a
    # key can name its colour outright.
    x0, y0, x1, y1, tol = kq[:5]
    near = ~fg[y0:y1, x0:x1]
    if len(kq) > 5:
        ref = np.array(kq[5])
    elif near.sum() < 50:
        continue
    else:
        ref = np.median(rgb[y0:y1, x0:x1][near], axis=0)
    close = np.abs(rgb[y0:y1, x0:x1] - ref).max(2) < tol
    fg[y0:y1, x0:x1] &= ~close
if cfg.get('pockets'):
    # Backdrop seen through a gap the art closes on every side (between a big
    # creature's arms and legs) is unreachable from the edge. It is smooth and
    # coloured like the backdrop in the same rows; a flat fill of the art (a
    # pot) is smooth too but a different colour, so colour decides.
    smooth_in = (np.array(m) == 255) & fg
    sm_img = Image.fromarray(smooth_in.astype(np.uint8)).copy()
    seen = np.zeros_like(fg)
    ys_, xs_ = np.nonzero(smooth_in)
    for y, x in zip(ys_[::5], xs_[::5]):
        if seen[y, x]: continue
        ImageDraw.floodfill(sm_img, (int(x), int(y)), 2)
        reg = np.array(sm_img) == 2
        sm_img.paste(0, mask=Image.fromarray((reg * 255).astype(np.uint8)))
        seen |= reg
        if reg.sum() < 80: continue
        ry, rx = np.nonzero(reg)
        y0_, y1_ = max(0, ry.min() - 30), ry.max() + 30
        x0_, x1_ = max(0, rx.min() - 80), rx.max() + 80
        near = ~fg[y0_:y1_, x0_:x1_]
        if near.sum() < 50: continue
        local = np.median(rgb[y0_:y1_, x0_:x1_][near], axis=0)
        if np.abs(rgb[reg].mean(0) - local).max() < 40: fg[reg] = False


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


def grow(lab, passable, steps):
    # Multi-source flood: every labelled pixel claims its unlabelled passable
    # 4-neighbours each step; the first label to arrive keeps a pixel.
    for _ in range(steps):
        moved = False
        for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            src = np.roll(np.roll(lab, dy, 0), dx, 1)
            take = (lab == 0) & passable & (src > 0)
            if take.any():
                lab[take] = src[take]; moved = True
        if not moved: break
    return lab


def seed_split(band, frames, p):
    # A race through the art: each frame grows from a point inside its body,
    # one pixel per step through any foreground pixel, and a pixel belongs to
    # whichever frame reaches it first. Limbs that touch the next pose part
    # where the two fronts meet, near the contact, not along a straight cut.
    bx0, by0, bx1, by1 = p['box']
    sl = (slice(by0, by1), slice(bx0, bx1))
    B = band[sl]
    lab = np.zeros(B.shape, np.int32)
    seeds = p.get('seeds')
    yy, xx = np.nonzero(B)
    for i, f in enumerate(frames):
        if seeds:
            sx, sy = seeds[i][0] - bx0, seeds[i][1] - by0
        else:
            ys, xs = np.nonzero(f['body']['mask'][sl])
            sx, sy = np.median(xs), np.median(ys)
        j = np.argmin((xx - sx) ** 2 + (yy - sy) ** 2)
        lab[yy[j], xx[j]] = i + 1
    lab = grow(lab, B, 3000)
    out = []
    for i, f in enumerate(frames):
        mask = np.zeros_like(band); mask[sl] = lab == i + 1
        ys, xs = np.nonzero(mask)
        out.append(dict(mask=mask, body=dict(mask=mask.copy(), x0=int(xs.min()), x1=int(xs.max()),
                                             y0=int(ys.min()), y1=int(ys.max()))))
    if not p.get('dropLoose'):
        # Pieces no front reached (sparks, stars) join the nearest frame.
        for c in components(B & (lab == 0)):
            if c['area'] < 12: continue
            # A loose sliver at most 3px tall is what is left of a panel or
            # label edge, never art: sparks and stars are taller than wide.
            if p.get('dropSlivers') and c['y1'] - c['y0'] <= 3 and c['x1'] - c['x0'] >= 6: continue
            cx = (c['x0'] + c['x1']) / 2 + bx0
            k = int(np.argmin([abs(cx - (o['body']['x0'] + o['body']['x1']) / 2) for o in out]))
            m2 = np.zeros_like(band); m2[sl] = c['mask']; out[k]['mask'] |= m2
    return out


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
        bodies = [b for b in bodies if b is not c]
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
    if p.get('seeded'):
        frames = seed_split(band, frames, p)
    for a in p.get('assign', []):
        x0a, y0a, x1a, y1a, k = a[:5]
        box = np.zeros_like(fg); box[y0a:y1a, x0a:x1a] = band[y0a:y1a, x0a:x1a]
        nxt = None
        if a[5:] in (['split'], ['divide']):
            # A breath drawn up against the next pose's outline: a straight
            # cut slices one or the other. Outline pixels stay where they are;
            # the rest falls into pieces, and only those that do not reach the
            # box's right edge (the next pose's interior does) change hands.
            dark = rgb.max(2) < 110
            moved = np.zeros_like(fg)
            nxt = np.zeros_like(fg)
            for c in components(box & ~dark):
                if c['x1'] < x1a - 1: moved |= c['mask']
                else: nxt |= c['mask']
            box = moved
            # divide: the pieces that run on past x1 are the next pose's, even
            # where the automatic frame cut had left part of them with this one.
            if a[5] != 'divide': nxt = None
        for f in frames:
            f['mask'] &= ~box
            f['body']['mask'] = f['body']['mask'] & ~box
        if k >= 0: frames[k]['mask'] |= box
        if nxt is not None:
            for f in frames: f['mask'] &= ~nxt
            frames[k + 1]['mask'] |= nxt
    for f in frames:
        # Hard boxes can hand a frame its whole cell, leaving the race's body
        # empty: anchor on the frame's own pixels then.
        if not f['body']['mask'].any():
            f['body'] = dict(f['body'], mask=f['mask'].copy())
    for k in p.get('mirror', []):
        frames[k]['mirror'] = True
    ground = float(np.median([b['y1'] for b in bodies]))
    for f in frames:
        fx = mass_x(f['body']['mask']) if MASS else face_x(f['body']['mask'])
        f['ax'] = fx if fx is not None else (f['body']['x0'] + f['body']['x1']) / 2
        f['ay'] = ground
    for k, x in p.get('ax', {}).items():
        frames[int(k)]['ax'] = float(x)
    if p.get('keep'):
        frames = [frames[k] for k in p['keep']]
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
