#!/usr/bin/env python3
"""Stage 2 of the Siegeling 3D model pipeline: input.png -> raw.glb on a hosted GPU.

  HF_TOKEN=hf_... python3 tools/models/generate.py draco [--backend hunyuan-shape]

Backends (public Hugging Face Spaces, run on their free ZeroGPU quota):
  hunyuan-shape  tencent/Hunyuan3D-2 shape only (default). About 7 s of GPU
                 per creature. Untextured, so rig with `--art` to project the
                 card art on. Best shapes for this roster's stylised art.
  hunyuan        Hunyuan3D-2 shape + texture. Broken on the Space as of
                 2026-11-17 ("texgen_worker is not defined"); kept for when
                 it returns.
  trellis        trellis-community/TRELLIS, textured. Returned flat cards for
                 Draco's pixel-art style; try it on painted art.

Anonymous runs from cloud IPs are refused ("ZeroGPU quota"); a free Hugging
Face account's read token in HF_TOKEN lifts that. Never commit the token.
This uploads the card art to the Space. Hunyuan3D-2 is under Tencent's
community licence (not valid in the EU, UK or South Korea); TRELLIS is MIT.
"""
import argparse
import json
import os
import shutil

from gradio_client import Client, handle_file

HERE = os.path.dirname(os.path.abspath(__file__))


def hunyuan(src, out, textured, token):
    cl = Client('tencent/Hunyuan3D-2', token=token, verbose=False)
    api = '/generation_all' if textured else '/shape_generation'
    r = cl.predict(caption='', image=handle_file(src), mv_image_front=None, mv_image_back=None,
                   mv_image_left=None, mv_image_right=None, steps=30, guidance_scale=5, seed=1234,
                   octree_resolution=256, check_box_rembg=False, num_chunks=8000, randomize_seed=False,
                   api_name=api)
    # shape: [file update, html, stats]; all: [file, textured file, html, stats]
    path = r[1] if textured else r[0]
    path = path['value'] if isinstance(path, dict) else path
    shutil.copy(path, out)
    stats = next((x for x in r if isinstance(x, dict) and 'number_of_faces' in x), {})
    return stats.get('number_of_faces')


def trellis(src, out, token):
    c = Client('trellis-community/TRELLIS', token=token, verbose=False)
    try:
        c.predict(api_name='/start_session')
    except Exception:  # older builds have no session endpoint
        pass
    pre = c.predict(image=handle_file(src), api_name='/preprocess_image')
    r = c.predict(image=handle_file(pre), multiimages=[], seed=1234, ss_guidance_strength=7.5,
                  ss_sampling_steps=12, slat_guidance_strength=3, slat_sampling_steps=12,
                  multiimage_algo='stochastic', mesh_simplify=0.95, texture_size=1024,
                  api_name='/generate_and_extract_glb')
    shutil.copy(r[1], out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id')
    ap.add_argument('--backend', default='hunyuan-shape', choices=['hunyuan-shape', 'hunyuan', 'trellis'])
    a = ap.parse_args()
    token = os.environ.get('HF_TOKEN')
    work = os.path.join(HERE, 'work', a.id)
    src = os.path.join(work, 'input.png')
    if not os.path.exists(src):
        raise SystemExit('missing %s: run prep_art.py --only %s' % (src, a.id))
    out = os.path.join(work, 'raw.glb')
    if a.backend == 'trellis':
        trellis(src, out, token)
        faces = None
    else:
        faces = hunyuan(src, out, a.backend == 'hunyuan', token)

    reg_path = os.path.join(HERE, 'registry.json')
    reg = json.load(open(reg_path, encoding='utf-8'))
    row = reg[a.id]
    row['status'] = 'generated'
    row['generator'] = a.backend
    row['textured'] = a.backend != 'hunyuan-shape'
    with open(reg_path, 'w', encoding='utf-8') as f:
        json.dump(reg, f, indent=2, sort_keys=True)
        f.write('\n')
    print('wrote %s (%s faces) via %s; check it before rigging' % (out, faces or '?', a.backend))


if __name__ == '__main__':
    main()
