#!/usr/bin/env python3
"""Stage 1 of the Siegeling 3D model pipeline: art -> image-to-3D inputs + registry.

Reads the creature records baked into the Swarm bundle (the only place that
already pairs each Siegeling with its cut-out art, `flying` flag and
`modelName`), then writes, per creature:

  tools/models/work/<id>/input.png   1024x1024 RGBA, subject centred with 12% margin
  tools/models/work/<id>/input-white.png   same on white (some generators ignore alpha)

and merges a row into tools/models/registry.json. Existing registry rows keep
their hand-edited fields (bodyPlan, status, notes), so re-running is safe.

Image-to-3D models (Hunyuan3D-2, TRELLIS, InstantMesh) all expect one centred
subject with breathing room; card art that touches the canvas edge produces
sliced-off tails and wings, hence the margin.

Usage:  python3 tools/models/prep_art.py [--only draco,dracoil]
"""
import argparse
import glob
import json
import os
import re

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SWARM = os.path.join(ROOT, 'src', 'main', 'resources', 'static', 'swarm')
OUT = os.path.join(ROOT, 'tools', 'models', 'work')
REGISTRY = os.path.join(ROOT, 'tools', 'models', 'registry.json')
SIZE = 1024
MARGIN = 0.12

# Body plans pick the rig template in blender/rig_animate.py. Only `winged`
# can be inferred (from `flying`); everything else starts as `quadruped`
# and is corrected by hand in registry.json before rigging.
BODY_PLANS = ('quadruped', 'biped', 'winged', 'serpent', 'floater', 'blob')


def creatures_from_bundle():
    bundles = glob.glob(os.path.join(SWARM, 'assets', 'index-*.js'))
    if not bundles:
        raise SystemExit('Swarm bundle not found under ' + SWARM)
    src = open(bundles[0], encoding='utf-8').read()
    out = {}
    # Records are flat JSON objects with one nested "tcg" object.
    for m in re.finditer(r'\{"id":"[a-z0-9_-]+"(?:[^{}]|\{[^{}]*\})*?"modelName":(?:[^{}]|\{[^{}]*\})*\}', src):
        text = m.group(0)
        try:
            rec = json.loads(text)
        except ValueError:
            # A few descriptions end in a JS-escaped quote (\\") that is not valid JSON.
            try:
                rec = json.loads(text.replace('\\\\"', '\\"'))
            except ValueError:
                print('warning: unparsable creature record near', text[:60])
                continue
        if rec.get('art') and rec.get('modelName'):
            out[rec['id']] = rec
    return out


def prep_image(art_path, dest_dir):
    im = Image.open(art_path).convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    inner = int(SIZE * (1 - 2 * MARGIN))
    scale = inner / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
    os.makedirs(dest_dir, exist_ok=True)
    canvas.save(os.path.join(dest_dir, 'input.png'))
    white = Image.new('RGBA', canvas.size, (255, 255, 255, 255))
    white.alpha_composite(canvas)
    white.convert('RGB').save(os.path.join(dest_dir, 'input-white.png'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='comma-separated creature ids')
    args = ap.parse_args()
    only = set(args.only.split(',')) if args.only else None

    registry = {}
    if os.path.exists(REGISTRY):
        registry = json.load(open(REGISTRY, encoding='utf-8'))

    found = creatures_from_bundle()
    done = 0
    for cid, rec in sorted(found.items()):
        if only and cid not in only:
            continue
        art = os.path.join(SWARM, rec['art'])
        if not os.path.exists(art):
            print('skip %s: missing %s' % (cid, rec['art']))
            continue
        prep_image(art, os.path.join(OUT, cid))
        row = registry.get(cid, {})
        row.setdefault('modelName', rec['modelName'])
        row.setdefault('bodyPlan', 'winged' if rec.get('flying') else 'quadruped')
        row.setdefault('status', 'prepped')  # prepped -> generated -> rigged -> shipped
        row.setdefault('notes', '')
        row['art'] = 'swarm/' + rec['art']
        row['flags'] = [f for f in ('flying', 'crawling') if rec.get(f)]
        row['element'] = rec.get('element')
        row['rarity'] = rec.get('rarity')
        row['evolvesFrom'] = rec.get('evolvesFrom')
        registry[cid] = row
        done += 1

    bad = {k: v['bodyPlan'] for k, v in registry.items() if v.get('bodyPlan') not in BODY_PLANS}
    if bad:
        print('warning: unknown bodyPlan values', bad)
    with open(REGISTRY, 'w', encoding='utf-8') as f:
        json.dump(registry, f, indent=2, sort_keys=True)
        f.write('\n')
    print('prepped %d creature(s); registry has %d rows' % (done, len(registry)))


if __name__ == '__main__':
    main()
