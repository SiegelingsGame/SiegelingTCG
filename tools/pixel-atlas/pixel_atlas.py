#!/usr/bin/env python3
"""Curate and pack sprites from the Pixel Art Atlas dataset (CC0, 16x16 RGBA).

Dataset: https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m
Extract pixel-art-16x16-1.4m.zip somewhere outside the repo (it is ~800 MB
unpacked) and pass that directory as --data. Nothing here runs at build or
deploy time: the game ships only the generated js/pixel-icons.js.

  sheet  contact sheets of the first N sprites per subject, to pick from by eye
         (captions are approximate, so every pick has to be looked at)
  build  pack the rows named in picks.json into static/js/pixel-icons.js

Run with `python3 -I` so nothing in the dataset directory can shadow a module.
"""
import argparse
import base64
import io
import json
import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT_JS = os.path.join(REPO, 'src/main/resources/static/js/pixel-icons.js')
PICKS = os.path.join(HERE, 'picks.json')


def load(data):
    tokens = np.load(os.path.join(data, 'tokens.npy'), mmap_mode='r', allow_pickle=False)
    palette = np.load(os.path.join(data, 'palette.npy'), allow_pickle=False)
    with open(os.path.join(data, 'objects.json'), encoding='utf-8') as f:
        subjects = json.load(f)
    return tokens, palette, subjects


def sprite(tokens, palette, row):
    px = np.asarray(tokens[row]).reshape(16, 16)
    rgba = np.dstack((palette[px], (px != 0).astype('uint8') * 255)).astype('uint8')
    return Image.fromarray(rgba, 'RGBA')


def indexed_sprite(tokens, palette, row):
    """Palette PNG with only the colours this sprite uses: about half the bytes of RGBA."""
    px = np.asarray(tokens[row]).reshape(16, 16)
    used = [0] + sorted(set(px.flatten().tolist()) - {0})
    remap = {v: i for i, v in enumerate(used)}
    img = Image.fromarray(np.vectorize(remap.get)(px).astype('uint8'), 'P')
    img.putpalette([int(c) for v in used for c in palette[v]])
    return img


def cmd_sheet(args):
    tokens, palette, subjects = load(args.data)
    wanted = [s.strip() for s in args.subjects.split(',') if s.strip()]
    rows = {s: [] for s in wanted}
    for i, s in enumerate(subjects):
        if s in rows and len(rows[s]) < args.offset + args.count:
            rows[s].append(i)
    scale, pad, label = args.scale, 6, 190
    cell = 16 * scale + pad
    os.makedirs(args.out, exist_ok=True)
    index = {}
    for page in range(0, len(wanted), args.per_page):
        chunk = wanted[page:page + args.per_page]
        img = Image.new('RGBA', (label + cell * args.count, 14 + cell * len(chunk)), (26, 24, 34, 255))
        draw = ImageDraw.Draw(img)
        for c in range(args.count):
            draw.text((label + c * cell + cell // 2 - 4, 2), str(c), fill=(255, 220, 120, 255))
        for r, s in enumerate(chunk):
            picks = rows[s][args.offset:]
            index[s] = picks
            draw.text((4, 14 + r * cell + cell // 2 - 6), s[:30], fill=(235, 235, 235, 255))
            for c, row in enumerate(picks):
                sp = sprite(tokens, palette, row).resize((16 * scale, 16 * scale), Image.NEAREST)
                img.alpha_composite(sp, (label + c * cell, 14 + r * cell))
        img.save(os.path.join(args.out, 'sheet-%02d.png' % (page // args.per_page)))
    with open(os.path.join(args.out, 'index.json'), 'w') as f:
        json.dump(index, f)
    print('wrote', (len(wanted) + args.per_page - 1) // args.per_page, 'sheets to', args.out)


def cmd_build(args):
    tokens, palette, subjects = load(args.data)
    with open(PICKS, encoding='utf-8') as f:
        picks = json.load(f)
    icons = {}
    for key in sorted(picks['icons']):
        p = picks['icons'][key]
        if subjects[p['row']] != p['subject']:
            raise SystemExit('%s: row %d is "%s", picks.json says "%s" (dataset changed?)'
                             % (key, p['row'], subjects[p['row']], p['subject']))
        buf = io.BytesIO()
        indexed_sprite(tokens, palette, p['row']).save(buf, 'PNG', optimize=True, transparency=0)
        icons[key] = base64.b64encode(buf.getvalue()).decode('ascii')
    with open(os.path.join(HERE, 'pixel-icons.template.js'), encoding='utf-8') as f:
        tpl = f.read()
    body = tpl.replace('/*__ICONS__*/{}', json.dumps(icons, indent=0, separators=(',', ':'), ensure_ascii=False))

    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write(body)
    print('packed', len(icons), 'icons ->', os.path.relpath(OUT_JS, REPO), '(%d bytes)' % len(body))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--data', required=True, help='directory holding tokens.npy, palette.npy, objects.json')
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('sheet')
    s.add_argument('--subjects', required=True, help='comma-separated dataset subject labels')
    s.add_argument('--out', required=True)
    s.add_argument('--count', type=int, default=14)
    s.add_argument('--offset', type=int, default=0)
    s.add_argument('--scale', type=int, default=4)
    s.add_argument('--per-page', type=int, default=12)
    s.set_defaults(fn=cmd_sheet)
    b = sub.add_parser('build')
    b.set_defaults(fn=cmd_build)
    args = ap.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
