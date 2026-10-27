#!/usr/bin/env python3
"""Build an 8-frame hover-walk cycle by puppeting a locked Siegeling master.

For floating characters (no legs), walk = bob + lean + drip sway. Prefer this
over freehand AI redraws when identity lock and a seamless loop matter more
than hand-authored limb extremes.

  python3 tools/sprites/puppet-hover-walk.py \\
      --master path/to/master.png \\
      --name pyleer-cluster \\
      --out output/sprites/pyleer-cluster-production \\
      --fps 11

Writes the same production package shape as assemble-production-walk.py:
separate transparent frames, aligned cells, atlas PNG/WebP, meta JSON,
GIF/MP4/contact previews.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def largest_component(mask: np.ndarray) -> np.ndarray:
    lab = np.zeros(mask.shape, np.int32)
    img = Image.fromarray((mask.astype(np.uint8) * 255))
    best_id = best_a = n = 0
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        if lab[y, x]:
            continue
        n += 1
        ImageDraw.floodfill(img, (int(x), int(y)), (n % 250) + 1)
        a = np.array(img)
        reg = a == ((n % 250) + 1)
        lab[reg] = n
        area = int(reg.sum())
        if area > best_a:
            best_a, best_id = area, n
        img.paste(0, mask=Image.fromarray((reg * 255).astype(np.uint8)))
    return lab == best_id if best_id else mask


def key_master(path: Path) -> Image.Image:
    rgb = np.array(Image.open(path).convert("RGB"))
    border = np.concatenate(
        [
            rgb[:8].reshape(-1, 3),
            rgb[-8:].reshape(-1, 3),
            rgb[:, :8].reshape(-1, 3),
            rgb[:, -8:].reshape(-1, 3),
        ]
    )
    key = np.median(border, 0)
    d = np.abs(rgb.astype(np.int16) - key.astype(np.int16)).sum(2)
    white = (rgb[:, :, 0] > 240) & (rgb[:, :, 1] > 240) & (rgb[:, :, 2] > 240)
    hot = (rgb[:, :, 0] > 160) & (rgb[:, :, 2] > 100) & (rgb[:, :, 1] < 80)
    mask = largest_component((d >= 28) & ~white & ~hot)
    ys, xs = np.nonzero(mask)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.dstack([rgb, (mask * 255).astype(np.uint8)])[y0:y1, x0:x1]
    return Image.fromarray(rgba)


def shear_lean(arr: np.ndarray, lean_px: int, pivot_y: float) -> np.ndarray:
    h, w = arr.shape[:2]
    out = np.zeros_like(arr)
    for y in range(h):
        t = (y - pivot_y) / max(1.0, h * 0.5)
        shift = int(round(lean_px * t))
        row = arr[y]
        if shift >= 0:
            out[y, shift:] = row[: w - shift] if shift else row
        else:
            s = -shift
            out[y, : w - s] = row[s:]
    return out


def drip_sway(arr: np.ndarray, sway_px: int) -> np.ndarray:
    h, w = arr.shape[:2]
    split = int(h * 0.62)
    out = arr.copy()
    lower = arr[split:]
    lh, lw = lower.shape[:2]
    swayed = np.zeros_like(lower)
    for row in range(lh):
        t = row / max(1, lh - 1)
        shift = int(round(sway_px * t))
        if shift >= 0:
            swayed[row, shift:] = lower[row, : lw - shift] if shift else lower[row]
        else:
            s = -shift
            swayed[row, : lw - s] = lower[row, s:]
    out[split:] = swayed
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=float, default=11)
    ap.add_argument("--frames", type=int, default=8)
    ap.add_argument("--bob", type=int, default=24)
    args = ap.parse_args()

    out = Path(args.out)
    trans = out / "frames" / "walk" / "transparent"
    atlas = out / "atlas"
    prev = out / "previews"
    master_dir = out / "master"
    for d in (trans, atlas, prev, master_dir):
        d.mkdir(parents=True, exist_ok=True)

    base = key_master(Path(args.master))
    base.save(master_dir / "master-cropped.png")
    bw, bh = base.size
    arr0 = np.array(base)
    m0 = arr0[:, :, 3] > 0
    yy, xx = np.nonzero(m0)
    mass_x, mass_y = float(xx.mean()), float(yy.mean())
    tip_y = float(yy.max())

    pad = 36
    cell_w = bw + pad * 2 + 48
    cell_h = bh + pad * 2 + args.bob * 2 + 16
    cell_w += cell_w % 2
    cell_h += cell_h % 2
    anchor_x = cell_w // 2
    baseline = cell_h - pad - 8

    n = args.frames
    frames, poses = [], []
    for i in range(n):
        t = 2 * math.pi * i / n
        bob_y = int(round(args.bob * math.sin(t)))
        lean_px = int(round(10 * math.sin(t - math.pi / 2)))
        drip = int(round(8 * math.sin(t + math.pi)))
        squash = 1.0 - 0.03 * math.cos(t)
        h2 = max(1, int(round(bh * squash)))
        scaled = base.resize((bw, h2), Image.Resampling.NEAREST)
        a = np.array(scaled)
        m2 = a[:, :, 3] > 0
        yy, xx = np.nonzero(m2)
        mx2, my2 = float(xx.mean()), float(yy.mean())
        a = shear_lean(a, lean_px, my2)
        a = drip_sway(a, drip)
        m3 = a[:, :, 3] > 0
        yy, xx = np.nonzero(m3)
        mx3, tip3 = float(xx.mean()), float(yy.max())
        cell = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
        x = int(round(anchor_x - mx3))
        y = int(round(baseline - tip3 - bob_y))
        cell.alpha_composite(Image.fromarray(a), (x, y))
        frames.append(cell)
        poses.append(
            {
                "i": i,
                "bob_y": bob_y,
                "lean_px": lean_px,
                "drip_px": drip,
                "squash": round(squash, 4),
            }
        )

    diffs = []
    for i in range(n):
        a = np.array(frames[i])[:, :, 3] > 0
        b = np.array(frames[(i + 1) % n])[:, :, 3] > 0
        diffs.append(
            round(
                float(np.logical_xor(a, b).sum())
                / max(1, np.logical_or(a, b).sum()),
                4,
            )
        )

    for i, f in enumerate(frames):
        f.save(trans / f"{i:02d}-cell.png")
        a = np.array(f)
        m = a[:, :, 3] > 0
        ys, xs = np.nonzero(m)
        Image.fromarray(a[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]).save(
            trans / f"{i:02d}.png"
        )

    strip = Image.new("RGBA", (cell_w * n, cell_h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.paste(f, (i * cell_w, 0), f)
    strip.save(atlas / f"{args.name}-walk.png")
    strip.save(atlas / f"{args.name}-walk.webp", "WEBP", quality=95, method=6)

    seq = prev / "seq"
    seq.mkdir(exist_ok=True)
    gif_frames = []
    for i, f in enumerate(frames):
        bg = Image.new("RGBA", (cell_w, cell_h), (24, 20, 32, 255))
        bg.alpha_composite(f)
        bg.convert("RGB").save(seq / f"f{i:02d}.png")
        gif_frames.append(bg.convert("P", palette=Image.ADAPTIVE, colors=255))
    duration = int(round(1000 / args.fps))
    gif_frames[0].save(
        prev / "walk.gif",
        save_all=True,
        append_images=gif_frames[1:],
        duration=duration,
        loop=0,
        disposal=2,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(args.fps),
            "-i",
            str(seq / "f%02d.png"),
            "-pix_fmt",
            "yuv420p",
            "-c:v",
            "libx264",
            "-crf",
            "18",
            str(prev / "walk.mp4"),
        ],
        check=True,
        capture_output=True,
    )
    strip.save(prev / "walk-contact.png")

    meta = {
        "name": args.name,
        "animation": "walk",
        "method": "master-puppet-pixel-safe",
        "playback": {
            "fps": args.fps,
            "loop": True,
            "frameCount": n,
            "notes": "Hover locomotion from locked master: integer bob, shear lean, drip sway, nearest squash.",
        },
        "cell": {"w": cell_w, "h": cell_h},
        "pivot": {
            "x": anchor_x,
            "y": baseline,
            "space": "cell",
            "meaning": "mass-center X, drip-tip baseline Y",
        },
        "atlas": {
            "png": f"atlas/{args.name}-walk.png",
            "webp": f"atlas/{args.name}-walk.webp",
            "layout": "horizontal-strip",
            "frameWidth": cell_w,
            "frameHeight": cell_h,
        },
        "poses": poses,
        "validation": {
            "adjacentAlphaXorRatio": diffs,
            "minXorRatio": min(diffs),
            "meanXorRatio": round(sum(diffs) / len(diffs), 4),
        },
        "previews": {
            "gif": "previews/walk.gif",
            "mp4": "previews/walk.mp4",
            "contact": "previews/walk-contact.png",
        },
        "status": "walk-pending-approval",
        "remainingAnimations": ["idle", "attack", "cheer", "hurt", "fainted"],
    }
    (out / f"{args.name}-walk.meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps({"cell": [cell_w, cell_h], "diffs": diffs, "out": str(out)}, indent=2))


if __name__ == "__main__":
    main()
