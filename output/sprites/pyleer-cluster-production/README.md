# Pyleer Cluster — production sprite package (walk first)

Siegelings production workflow: **master → frames → atlas + metadata → preview/validate**.
Only the walk cycle is built so far; remaining poses wait on approval.

## Master

- `master/user-master.jpg` — full-res artist source
- `master/user-master-game-scale.png` — nearest-neighbor scale used for frames
- `master/master-cropped.png` — keyed crop (puppet base)

## Walk (8 frames @ 11 FPS, cell 386×486)

Floating Siegeling → **walk = hover locomotion** (bob, shear lean, drip sway).

| Deliverable | Path |
|---|---|
| Separate transparent frames | `frames/walk/transparent/00.png` … `07.png` |
| Shared-pivot cells | `frames/walk/transparent/00-cell.png` … |
| Packed atlas | `atlas/pyleer-cluster-walk.png` (+ `.webp`) |
| Timing / pivot metadata | `pyleer-cluster-walk.meta.json` |
| Loop previews | `previews/walk.gif`, `walk.mp4`, `walk-contact.png` |

### Method

Freehand AI redraws failed twice (volume jumps; then near-static). Shipped frames
are **master-puppeted** via `tools/sprites/puppet-hover-walk.py` so identity and
the loop stay locked — matching the note that AI stills alone do not guarantee
alignment.

## Remaining (held)

`idle` · `attack` · `cheer` · `hurt` · `fainted`

```bash
python3 tools/sprites/puppet-hover-walk.py \
  --master output/sprites/pyleer-cluster-production/master/user-master-game-scale.png \
  --name pyleer-cluster \
  --out output/sprites/pyleer-cluster-production \
  --fps 11 --bob 16
```
