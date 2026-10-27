#!/usr/bin/env python3
"""Assemble a Siegelings production walk package from chroma-keyed frame stills.

  python3 -I tools/sprites/assemble-production-walk.py \\
      --name pyleer-cluster \\
      --frames path/to/walk-00.jpg ... \\
      --out output/sprites/pyleer-cluster-production \\
      --fps 11

Expects a near-pure magenta (#FF00FF-ish) backdrop. Writes:
  frames/walk/transparent/NN.png
  atlas/<name>-walk.png + .webp
  previews/walk.gif + walk.mp4
  <name>-walk.meta.json
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image


def chroma_mask(rgb: np.ndarray, key=None, tol=48) -> np.ndarray:
    """True = keep (character). Backdrop is keyed from image corners when key is None.

    Generators rarely hit pure #FF00FF; sampling the border median catches the
    actual pink/magenta plate while leaving dark charcoal bodies intact.
    """
    if key is None:
        border = np.concatenate(
            [
                rgb[:6].reshape(-1, 3),
                rgb[-6:].reshape(-1, 3),
                rgb[:, :6].reshape(-1, 3),
                rgb[:, -6:].reshape(-1, 3),
            ]
        )
        key = np.median(border, axis=0)
    key = np.asarray(key, dtype=np.int16)
    d = np.abs(rgb.astype(np.int16) - key).sum(axis=2)
    # Hot pink / magenta plates: high R, high-ish B, low G — drop even when
    # the plate drifts a bit from the corner sample.
    hot = (rgb[:, :, 0] > 160) & (rgb[:, :, 2] > 100) & (rgb[:, :, 1] < 80)
    return (d >= tol) & ~hot


def largest_component(mask: np.ndarray) -> np.ndarray:
    """Keep the largest 4-connected True region (drops speckles)."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    img = Image.fromarray((mask.astype(np.uint8) * 255))
    n = 0
    best_id, best_a = 0, 0
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        if lab[y, x]:
            continue
        n += 1
        from PIL import ImageDraw

        ImageDraw.floodfill(img, (int(x), int(y)), n % 250 + 1)
        a = np.array(img)
        reg = a == (n % 250 + 1)
        # floodfill writes the fill value; re-read
        lab[reg] = n
        area = int(reg.sum())
        if area > best_a:
            best_a, best_id = area, n
        img.paste(0, mask=Image.fromarray((reg * 255).astype(np.uint8)))
    return lab == best_id if best_id else mask


def bbox(mask: np.ndarray):
    ys, xs = np.nonzero(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def mass_center(mask: np.ndarray):
    ys, xs = np.nonzero(mask)
    return float(xs.mean()), float(ys.mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--frames", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=float, default=11)
    ap.add_argument("--cell", type=int, default=0, help="Force square cell; 0 = auto pad")
    ap.add_argument("--pad", type=int, default=24)
    args = ap.parse_args()

    out = Path(args.out)
    trans_dir = out / "frames" / "walk" / "transparent"
    atlas_dir = out / "atlas"
    prev_dir = out / "previews"
    for d in (trans_dir, atlas_dir, prev_dir):
        d.mkdir(parents=True, exist_ok=True)

    bodies = []
    for i, path in enumerate(args.frames):
        im = Image.open(path).convert("RGB")
        rgb = np.array(im)
        mask = chroma_mask(rgb)
        mask = largest_component(mask)
        # eat 1px magenta fringe
        pad = np.pad(mask, 1)
        nb = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
        near_key = np.abs(rgb.astype(np.int16) - np.array([255, 0, 255])).sum(2) < 90
        mask = mask & ~(near_key & ~nb)
        x0, y0, x1, y1 = bbox(mask)
        rgba = np.dstack([rgb, (mask * 255).astype(np.uint8)])
        crop = rgba[y0:y1, x0:x1]
        cx, cy = mass_center(mask)
        bodies.append(
            {
                "i": i,
                "rgba": crop,
                "bbox": (x0, y0, x1, y1),
                "src_size": im.size,
                "mass": (cx - x0, cy - y0),  # in crop space
                "foot_y": y1 - y0,  # drip tip relative
                "area": int(mask.sum()),
            }
        )
        Image.fromarray(crop).save(trans_dir / f"{i:02d}.png")

    # Shared cell: fit every crop with pad, anchor by mass center X and drip tip Y
    max_w = max(b["rgba"].shape[1] for b in bodies)
    max_h = max(b["rgba"].shape[0] for b in bodies)
    # room so mass centers share one column and drip tips share one baseline
    mass_x = [b["mass"][0] for b in bodies]
    tip_y = [b["foot_y"] for b in bodies]
    left_need = max(mass_x)
    right_need = max(b["rgba"].shape[1] - mx for b, mx in zip(bodies, mass_x))
    above_need = max(tip_y)
    below_need = max(b["rgba"].shape[0] - ty for b, ty in zip(bodies, tip_y))
    cell_w = int(math.ceil(left_need + right_need + 2 * args.pad))
    cell_h = int(math.ceil(above_need + below_need + 2 * args.pad))
    if args.cell:
        cell_w = cell_h = args.cell
    # Make even for video encoders
    cell_w += cell_w % 2
    cell_h += cell_h % 2
    anchor_x = int(round(left_need + args.pad))
    baseline = int(round(above_need + args.pad))

    cells = []
    for b in bodies:
        cell = np.zeros((cell_h, cell_w, 4), dtype=np.uint8)
        mx, _ = b["mass"]
        tip = b["foot_y"]
        x = int(round(anchor_x - mx))
        y = int(round(baseline - tip))
        h, w = b["rgba"].shape[:2]
        # clip if somehow overhangs
        x0, y0 = max(0, x), max(0, y)
        xs0, ys0 = max(0, -x), max(0, -y)
        x1, y1 = min(cell_w, x + w), min(cell_h, y + h)
        ww, hh = x1 - x0, y1 - y0
        cell[y0:y1, x0:x1] = b["rgba"][ys0 : ys0 + hh, xs0 : xs0 + ww]
        cells.append(cell)
        Image.fromarray(cell).save(trans_dir / f"{b['i']:02d}-cell.png")

    # Contact / distinctness metrics
    diffs = []
    for i in range(len(cells)):
        a = cells[i][:, :, 3] > 0
        b = cells[(i + 1) % len(cells)][:, :, 3] > 0
        xor = np.logical_xor(a, b).sum()
        union = np.logical_or(a, b).sum() or 1
        diffs.append(round(float(xor) / union, 4))

    strip = np.concatenate(cells, axis=1)
    atlas_png = atlas_dir / f"{args.name}-walk.png"
    atlas_webp = atlas_dir / f"{args.name}-walk.webp"
    Image.fromarray(strip).save(atlas_png)
    Image.fromarray(strip).save(atlas_webp, "WEBP", quality=95, method=6)

    # Previews
    frame_imgs = [Image.fromarray(c) for c in cells]
    # GIF wants paletted; paste on dark checker-free charcoal for readability
    gif_frames = []
    for c in cells:
        bg = Image.new("RGBA", (cell_w, cell_h), (24, 20, 32, 255))
        bg.alpha_composite(Image.fromarray(c))
        gif_frames.append(bg.convert("P", palette=Image.ADAPTIVE, colors=255))
    duration = int(round(1000 / args.fps))
    gif_path = prev_dir / "walk.gif"
    gif_frames[0].save(
        gif_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=duration,
        loop=0,
        disposal=2,
    )

    # MP4 via ffmpeg from PNG sequence
    seq_dir = prev_dir / "seq"
    seq_dir.mkdir(exist_ok=True)
    for i, c in enumerate(cells):
        bg = Image.new("RGBA", (cell_w, cell_h), (24, 20, 32, 255))
        bg.alpha_composite(Image.fromarray(c))
        bg.convert("RGB").save(seq_dir / f"f{i:02d}.png")
    mp4 = prev_dir / "walk.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(args.fps),
            "-i",
            str(seq_dir / "f%02d.png"),
            "-pix_fmt",
            "yuv420p",
            "-c:v",
            "libx264",
            "-crf",
            "18",
            str(mp4),
        ],
        check=True,
        capture_output=True,
    )

    # Contact sheet (one row)
    contact = Image.fromarray(strip)
    contact_path = prev_dir / "walk-contact.png"
    contact.save(contact_path)

    meta = {
        "name": args.name,
        "animation": "walk",
        "playback": {
            "fps": args.fps,
            "loop": True,
            "frameCount": len(cells),
            "notes": "Floating Siegeling: walk = hover locomotion (bob, lean, flame, drip).",
        },
        "cell": {"w": cell_w, "h": cell_h},
        "pivot": {
            "x": anchor_x,
            "y": baseline,
            "space": "cell",
            "meaning": "mass-center X, drip-tip baseline Y",
        },
        "atlas": {
            "png": str(atlas_png.relative_to(out)),
            "webp": str(atlas_webp.relative_to(out)),
            "layout": "horizontal-strip",
            "frameWidth": cell_w,
            "frameHeight": cell_h,
        },
        "frames": [
            {
                "index": b["i"],
                "file": f"frames/walk/transparent/{b['i']:02d}.png",
                "cellFile": f"frames/walk/transparent/{b['i']:02d}-cell.png",
                "sourceBBox": list(b["bbox"]),
                "areaPx": b["area"],
            }
            for b in bodies
        ],
        "validation": {
            "adjacentAlphaXorRatio": diffs,
            "minXorRatio": min(diffs),
            "meanXorRatio": round(sum(diffs) / len(diffs), 4),
            "passHint": "Values near 0 mean near-duplicate frames; aim > 0.05 for hover, > 0.12 for legged walks.",
        },
        "previews": {
            "gif": "previews/walk.gif",
            "mp4": "previews/walk.mp4",
            "contact": "previews/walk-contact.png",
        },
        "status": "walk-pending-approval",
        "remainingAnimations": ["idle", "attack", "cheer", "hurt", "fainted"],
    }
    meta_path = out / f"{args.name}-walk.meta.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps({"cell": [cell_w, cell_h], "diffs": diffs, "meta": str(meta_path)}, indent=2))


if __name__ == "__main__":
    main()
