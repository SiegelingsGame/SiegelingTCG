# Pyleer Cluster — production sprite package

Siegelings production workflow: **master → frames → atlas + metadata → preview/validate**.

All six poses share one cell (**418×518**) and drip-tip baseline so pose swaps do not jump.

## Master

- `master/user-master.jpg` — full-res artist source
- `master/user-master-game-scale.png` — nearest-neighbor scale used for frames
- `master/master-cropped.png` — keyed crop (puppet base)

## Animations

| Pose | Frames | FPS | Loop | Notes |
|---|---:|---:|---|---|
| idle | 7 | 7 | yes | gentle hover breathe |
| walk | 8 | 11 | yes | hover locomotion |
| attack | 8 | 12 | yes | coil → lunge right → impact → recover |
| cheer | 5 | 8 | yes | upward bounce |
| hurt | 4 | 10 | yes | recoil left |
| fainted | 5 | 8 | no | one-shot sink/slump, hold last (darkened) |

Deliverables per pose:

- `frames/<pose>/transparent/NN.png` (+ `NN-cell.png`)
- `atlas/pyleer-cluster-<pose>.png` (+ `.webp`)
- `pyleer-cluster-<pose>.meta.json`
- `previews/<pose>.{gif,mp4}` + `<pose>-contact.png`

Package rollup: `pyleer-cluster-package.meta.json`

## Method

Floating Siegeling → no fake legs. Frames are **master-puppeted**
(`tools/sprites/puppet-siegling-poses.py`: bob, shear lean, drip sway, squash,
brightness) so identity stays locked. Freehand AI redraws were rejected earlier
(volume jumps / near-static).

```bash
python3 tools/sprites/puppet-siegling-poses.py \
  --master output/sprites/pyleer-cluster-production/master/user-master-game-scale.png \
  --name pyleer-cluster \
  --out output/sprites/pyleer-cluster-production
```

Not yet registered in `siege-sprites.js` — approve the package before shipping
strips into `img/sprites/pyleer-cluster/`.
