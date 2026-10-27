#!/usr/bin/env python3
"""Puppet all six Siegelings production poses from one locked master.

Shared cell + drip-tip baseline across every pose so swaps do not jump.
Floating masters use hover/lunge/recoil/slump motion (no fake legs).

  python3 tools/sprites/puppet-siegling-poses.py \\
      --master path/to/master.png \\
      --name pyleer-cluster \\
      --out output/sprites/pyleer-cluster-production

Pose specs (starting values from the production brief):
  idle 7 @ 7fps loop | walk 8 @ 11fps loop | attack 8 @ 12fps loop
  cheer 5 @ 8fps loop | hurt 4 @ 10fps loop | fainted 5 one-shot hold-last
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

# (frames, fps, loop, hold_last, notes)
POSE_SPEC = {
    "idle": (7, 7.0, True, False, "Gentle hover breathe: small bob + drip sway."),
    "walk": (8, 11.0, True, False, "Hover locomotion: bob, lean, drip counter-sway."),
    "attack": (8, 12.0, True, False, "Coil → lunge right → impact squash → recover."),
    "cheer": (5, 8.0, True, False, "Upward celebratory bounce with stretch."),
    "hurt": (4, 10.0, True, False, "Recoil left, squash, brief settle."),
    "fainted": (5, 8.0, False, True, "One-shot sink/slump; hold last frame."),
}


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
    return Image.fromarray(np.dstack([rgb, (mask * 255).astype(np.uint8)])[y0:y1, x0:x1])


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


def pose_params(pose: str, i: int, n: int):
    """Return bob_y, lean_px, drip_px, squash, shift_x, bright for frame i."""
    # progress 0..1 across the clip
    u = i / max(1, n - 1)
    t = 2 * math.pi * i / n  # cyclic

    if pose == "idle":
        return (
            int(round(6 * math.sin(t))),
            int(round(3 * math.sin(t * 0.5))),
            int(round(4 * math.sin(t + math.pi / 3))),
            1.0 - 0.015 * math.cos(t),
            0,
            1.0,
        )
    if pose == "walk":
        return (
            int(round(16 * math.sin(t))),
            int(round(10 * math.sin(t - math.pi / 2))),
            int(round(8 * math.sin(t + math.pi))),
            1.0 - 0.03 * math.cos(t),
            0,
            1.0,
        )
    if pose == "attack":
        # key beats: settle, coil, launch, impact, after, recover…
        keys = [
            # bob, lean, drip, squash, shift_x, bright
            (0, 0, 0, 1.00, 0, 1.00),  # settle
            (4, -12, 6, 0.92, -10, 0.95),  # coil back
            (8, -6, 4, 0.96, -4, 1.05),  # wind
            (2, 14, -8, 1.06, 22, 1.15),  # lunge
            (-6, 18, -10, 0.88, 28, 1.25),  # impact squash
            (2, 8, -4, 1.04, 14, 1.08),  # rebound
            (4, 2, 0, 1.00, 4, 1.02),  # recover
            (0, 0, 0, 1.00, 0, 1.00),  # settle
        ]
        return keys[min(i, len(keys) - 1)]
    if pose == "cheer":
        keys = [
            (0, 0, 0, 1.00, 0, 1.00),
            (14, -4, -4, 1.06, 0, 1.08),
            (22, 0, -6, 1.10, 0, 1.12),
            (12, 4, -2, 1.04, 0, 1.06),
            (0, 0, 0, 1.00, 0, 1.00),
        ]
        return keys[min(i, len(keys) - 1)]
    if pose == "hurt":
        keys = [
            (0, 0, 0, 1.00, 0, 1.00),
            (-4, -16, 8, 0.90, -14, 1.15),  # flash recoil
            (-2, -10, 10, 0.94, -8, 0.92),  # sunk
            (0, -2, 2, 1.00, -2, 1.00),  # settle
        ]
        return keys[min(i, len(keys) - 1)]
    if pose == "fainted":
        # sink and slump; last frames darkened so the hold reads defeated
        keys = [
            (0, 0, 0, 1.00, 0, 1.00),
            (-8, 6, 6, 0.94, 2, 0.90),
            (-18, 12, 12, 0.88, 4, 0.72),
            (-28, 16, 18, 0.82, 6, 0.55),
            (-34, 18, 22, 0.78, 6, 0.42),  # hold — greyed/sunk
        ]
        return keys[min(i, len(keys) - 1)]
    raise ValueError(pose)


def render_frame(base: Image.Image, params, cell_w, cell_h, anchor_x, baseline):
    bob_y, lean_px, drip_px, squash, shift_x, bright = params
    bw, bh = base.size
    h2 = max(1, int(round(bh * squash)))
    w2 = max(1, int(round(bw * (2.0 - squash)))) if squash < 1.0 else bw
    # attack/hurt impact: widen when squashed short
    if squash < 0.95:
        w2 = max(1, int(round(bw * (1.0 + (1.0 - squash) * 1.4))))
    elif squash > 1.04:
        w2 = max(1, int(round(bw * (1.0 - (squash - 1.0) * 0.5))))
    else:
        w2 = bw
    scaled = base.resize((w2, h2), Image.Resampling.NEAREST)
    if abs(bright - 1.0) > 0.01:
        rgb = scaled.convert("RGB")
        a = scaled.split()[-1]
        rgb = ImageEnhance.Brightness(rgb).enhance(bright)
        scaled = Image.merge("RGBA", (*rgb.split(), a))
    a = np.array(scaled)
    m2 = a[:, :, 3] > 0
    yy, xx = np.nonzero(m2)
    if len(xx) == 0:
        return Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0)), {}
    mx2, my2 = float(xx.mean()), float(yy.mean())
    a = shear_lean(a, lean_px, my2)
    a = drip_sway(a, drip_px)
    m3 = a[:, :, 3] > 0
    yy, xx = np.nonzero(m3)
    mx3, tip3 = float(xx.mean()), float(yy.max())
    cell = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
    x = int(round(anchor_x - mx3 + shift_x))
    y = int(round(baseline - tip3 - bob_y))
    # clip paste origin
    cell.alpha_composite(Image.fromarray(a), (x, y))
    return cell, {
        "bob_y": bob_y,
        "lean_px": lean_px,
        "drip_px": drip_px,
        "squash": round(squash, 4),
        "shift_x": shift_x,
        "bright": round(bright, 3),
    }


def alpha_diffs(frames):
    diffs = []
    n = len(frames)
    for i in range(n):
        a = np.array(frames[i])[:, :, 3] > 0
        b = np.array(frames[(i + 1) % n])[:, :, 3] > 0
        diffs.append(
            round(
                float(np.logical_xor(a, b).sum()) / max(1, np.logical_or(a, b).sum()),
                4,
            )
        )
    return diffs


def write_pose(out: Path, name: str, pose: str, frames, cell_w, cell_h, anchor_x, baseline, poses, spec):
    n, fps, loop, hold_last, notes = spec
    trans = out / "frames" / pose / "transparent"
    atlas = out / "atlas"
    prev = out / "previews"
    for d in (trans, atlas, prev):
        d.mkdir(parents=True, exist_ok=True)

    for i, f in enumerate(frames):
        f.save(trans / f"{i:02d}-cell.png")
        a = np.array(f)
        m = a[:, :, 3] > 0
        ys, xs = np.nonzero(m)
        if len(xs):
            Image.fromarray(a[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]).save(
                trans / f"{i:02d}.png"
            )
        else:
            Image.new("RGBA", (1, 1), (0, 0, 0, 0)).save(trans / f"{i:02d}.png")

    strip = Image.new("RGBA", (cell_w * n, cell_h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.paste(f, (i * cell_w, 0), f)
    strip.save(atlas / f"{name}-{pose}.png")
    strip.save(atlas / f"{name}-{pose}.webp", "WEBP", quality=95, method=6)

    seq = prev / f"seq-{pose}"
    seq.mkdir(exist_ok=True)
    gif_frames = []
    # fainted: hold last frame for readability in the preview loop
    preview = list(frames)
    if hold_last:
        preview = list(frames) + [frames[-1]] * 6
    for i, f in enumerate(preview):
        bg = Image.new("RGBA", (cell_w, cell_h), (24, 20, 32, 255))
        bg.alpha_composite(f)
        if i < n:
            bg.convert("RGB").save(seq / f"f{i:02d}.png")
        gif_frames.append(bg.convert("P", palette=Image.ADAPTIVE, colors=255))
    duration = int(round(1000 / fps))
    gif_frames[0].save(
        prev / f"{pose}.gif",
        save_all=True,
        append_images=gif_frames[1:],
        duration=duration,
        loop=0 if loop or hold_last else 1,
        disposal=2,
    )
    # mp4 from the first n authored frames (plus holds for fainted)
    mp4_n = len(preview)
    for i, f in enumerate(preview):
        bg = Image.new("RGBA", (cell_w, cell_h), (24, 20, 32, 255))
        bg.alpha_composite(f)
        bg.convert("RGB").save(seq / f"m{i:02d}.png")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(fps),
            "-i",
            str(seq / "m%02d.png"),
            "-pix_fmt",
            "yuv420p",
            "-c:v",
            "libx264",
            "-crf",
            "18",
            str(prev / f"{pose}.mp4"),
        ],
        check=True,
        capture_output=True,
    )
    strip.save(prev / f"{pose}-contact.png")

    diffs = alpha_diffs(frames)
    meta = {
        "name": name,
        "animation": pose,
        "method": "master-puppet-pixel-safe",
        "playback": {
            "fps": fps,
            "loop": loop,
            "holdLastFrame": hold_last,
            "frameCount": n,
            "notes": notes,
        },
        "cell": {"w": cell_w, "h": cell_h},
        "pivot": {
            "x": anchor_x,
            "y": baseline,
            "space": "cell",
            "meaning": "mass-center X, drip-tip baseline Y",
        },
        "atlas": {
            "png": f"atlas/{name}-{pose}.png",
            "webp": f"atlas/{name}-{pose}.webp",
            "layout": "horizontal-strip",
            "frameWidth": cell_w,
            "frameHeight": cell_h,
        },
        "poses": [{"i": i, **poses[i]} for i in range(n)],
        "validation": {
            "adjacentAlphaXorRatio": diffs,
            "minXorRatio": min(diffs),
            "meanXorRatio": round(sum(diffs) / len(diffs), 4),
        },
        "previews": {
            "gif": f"previews/{pose}.gif",
            "mp4": f"previews/{pose}.mp4",
            "contact": f"previews/{pose}-contact.png",
        },
    }
    (out / f"{name}-{pose}.meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument(
        "--only",
        default="",
        help="Comma list of poses (default: all six)",
    )
    args = ap.parse_args()
    out = Path(args.out)
    master_dir = out / "master"
    master_dir.mkdir(parents=True, exist_ok=True)

    base = key_master(Path(args.master))
    base.save(master_dir / "master-cropped.png")
    bw, bh = base.size

    # Shared cell sized for the most extreme attack lunge / fainted sink.
    pad = 36
    cell_w = bw + pad * 2 + 80  # room for ±28px shift
    cell_h = bh + pad * 2 + 80  # room for bob + sink
    cell_w += cell_w % 2
    cell_h += cell_h % 2
    anchor_x = cell_w // 2
    baseline = cell_h - pad - 8

    only = [p.strip() for p in args.only.split(",") if p.strip()] or list(POSE_SPEC)
    package = {
        "name": args.name,
        "method": "master-puppet-pixel-safe",
        "cell": {"w": cell_w, "h": cell_h},
        "pivot": {"x": anchor_x, "y": baseline},
        "animations": {},
        "siegeSpritesHint": {
            "w": cell_w,
            "h": cell_h,
            "frames": {},
            "note": "fit/base still need measuring against idle body once registered in siege-sprites.js",
        },
    }

    for pose in only:
        if pose not in POSE_SPEC:
            raise SystemExit(f"unknown pose {pose}")
        n, fps, loop, hold_last, notes = POSE_SPEC[pose]
        frames, pose_rows = [], []
        for i in range(n):
            params = pose_params(pose, i, n)
            cell, row = render_frame(base, params, cell_w, cell_h, anchor_x, baseline)
            frames.append(cell)
            pose_rows.append(row)
        meta = write_pose(
            out,
            args.name,
            pose,
            frames,
            cell_w,
            cell_h,
            anchor_x,
            baseline,
            pose_rows,
            POSE_SPEC[pose],
        )
        package["animations"][pose] = {
            "frames": n,
            "fps": fps,
            "loop": loop,
            "holdLastFrame": hold_last,
            "meta": f"{args.name}-{pose}.meta.json",
            "meanXorRatio": meta["validation"]["meanXorRatio"],
        }
        package["siegeSpritesHint"]["frames"][pose] = n
        print(pose, "frames", n, "xor", meta["validation"]["meanXorRatio"])

    (out / f"{args.name}-package.meta.json").write_text(json.dumps(package, indent=2) + "\n")
    print(json.dumps({"cell": [cell_w, cell_h], "poses": only}, indent=2))


if __name__ == "__main__":
    main()
