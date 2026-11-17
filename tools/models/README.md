# Siegeling 3D models: card art → rigged, animated GLB

The pipeline turns a Siegeling's 2D art into a 3D model that moves. The source
is a 2026-11-16 post listing open-source AI 3D tools: image-to-3D (Hunyuan3D-2,
TRELLIS, InstantMesh), retopology (MeshAnything), Blender driven by Claude
through Blender MCP, Gaussian-splat viewing (SuperSplat), and three.js.

The first consumer is **Swarm** (`/swarm`). Its bundle already has the hook:
it fetches `/swarm/models/manifest.json` (shipped as `{}`), loads a GLB for any
creature listed there and falls back to the procedural stand-in otherwise. The
same GLBs can later go into the Collection card sheet, Siege and the Battle
Table.

```
 swarm/art/<id>.webp ─▶ 1 prep_art.py ─▶ work/<id>/input.png
                                              │
                        2 image→3D (GPU) ◀────┘   Hunyuan3D-2 (default) / TRELLIS
                                │
                         work/<id>/raw.glb
                                │
                        3 blender/rig_animate.py  (headless; fix-ups via Blender MCP)
                                │
                         work/<id>/rigged.glb
                                │
                        4 check_model.mjs  ◀── gate, run inside 5
                        5 ship_model.mjs   ─▶ swarm/models/<id>.glb + manifest.json
```

## What the game expects (from the Swarm loader)

| Rule | Why |
|---|---|
| `manifest.json` maps the lowercased `modelName` (or `id`) to a file name | This is the loader's lookup key |
| Clip names matching `/idle\|stand\|breath/` and `/walk\|run\|move\|locomotion/` | Swarm plays these two. With no walk clip the model glides; with no idle it idles on clip 0 |
| Also `attack`, `hurt`, `cheer`, `fainted` | Same poses as the 2D Siege sprites (`img/sprites/<id>/`), for the TCG views |
| Any scale or origin is fine | Swarm scales the longest side to `modelDisplaySize × modelScaleMultiplier` and puts the feet on the ground |
| Faces glTF +Z | Fix a wrong facing per creature with `modelRotationY` / `modelStandUpAngles` in the creature data instead of re-exporting |
| ≤ 1.5 MB, ≤ 10k triangles, textures ≤ 1024 px, meshopt | Mobile budget. The loader has the meshopt decoder |
| Silver/Gold/Legend variants | No extra work: the loader tints the emissive colour |

## Stages

**1. Prep:** `python3 tools/models/prep_art.py [--only draco,dracoil]`
Reads the creature records from the Swarm bundle (94 Siegelings) and writes
`work/<id>/input.png`: 1024², subject centred with a 12% margin so wings and
tails are not cut off, plus a copy on white. It also seeds `registry.json`. In
each row, set `bodyPlan` (`quadruped`, `biped`, `winged`, `serpent`, `floater`,
`blob`) before rigging. Only `winged` is inferred, from `flying`; everything
else defaults to `quadruped`. Re-running keeps your edits.

**2. Image→3D:** needs a GPU (~16 GB for Hunyuan3D-2 shape + texture). Pick one route:
- *Own machine or a rented GPU:* `Hunyuan3D-2` → `python minimal_demo.py`-style
  `Hunyuan3DDiTFlowMatchingPipeline` + `Hunyuan3DPaintPipeline` on
  `work/<id>/input.png`. Save the output as `work/<id>/raw.glb`.
- *Hosted:* the public Space `tencent/Hunyuan3D-2` (`/generation_all`, via
  `gradio_client`) or a paid API. This uploads your card art to a third party,
  so it is opt-in.
- *Better inputs:* the `Hunyuan3D-2mv` multi-view pipeline accepts front, back,
  left and right images. The Siege sprite sheets have a side view; drawing a
  back view gives the cleanest bodies.
- *TRELLIS* is the fallback for creatures Hunyuan mangles, such as thin limbs
  or fins. *InstantMesh* is faster but gives lower-quality textures.
- *MeshAnything* gives artist-style low-poly topology (≤800 faces). Use it for
  untextured distant LODs, not hero models: it drops the texture.

Hand-check every result before rigging, looking for extra limbs, a fused jaw
or a flat back.

**3. Rig + animate:**
```
blender -b -P tools/models/blender/rig_animate.py -- \
  --in tools/models/work/draco/raw.glb --out tools/models/work/draco/rigged.glb \
  --plan quadruped [--front -Y] [--tris 6000]
```
The script:
1. Merges and cleans the mesh, then decimates it to the triangle budget.
2. Places a template skeleton for the body plan from the mesh's bounding box.
3. Skins it with bone-heat weights, falling back to envelopes when heat fails
   on a non-manifold AI mesh.
4. Keys the six clips and exports one glTF animation per clip.

`--front` turns the raw mesh to face forward when the generator faced it
elsewhere.

For the hand pass, open the same file in Blender with the
[Blender MCP](https://github.com/ahujasid/blender-mcp) add-on connected to
Claude on your machine. Ask Claude for things like "the left wing doesn't
move — reweight it to wing_L" or "make Draco's attack a tail whip". Then
re-export using the `export()` settings in the script, which keep each clip as
its own action.

**4–5. Gate and ship:**
```
cd tools/models && npm install          # once
node ship_model.mjs draco work/draco/rigged.glb [--dest <dir>]
node check_model.mjs some.glb           # gate alone
node selftest.mjs                       # proves 4–5 with a synthetic rigged GLB
```
`ship_model.mjs` runs gltf-transform `optimize` (meshopt, WebP textures at
1024, no second simplify pass on the skinned mesh). It then runs the gate,
copies the model into `swarm/models/` and updates `manifest.json`. Finally it
marks the creature `shipped` in `registry.json`.

> **Swarm is a prebuilt bundle.** `npm run build:tcg` in `SiegelingsRBX/web`
> replaces `static/swarm/`. Ship models into that repo's public `models/`
> folder too (`--dest`), or a rebuild loses them.

## Order of work

1. **Pilot:** Draco and Dracoil, one evolution line, quadruped and winged.
   Run every stage by hand and tune `rig_animate.py`'s clip table against
   Draco's 2D sprite strips.
2. **Starters and pack spawns:** the creatures players see most in Swarm.
3. **Batch:** script stages 2–5 over `registry.json` rows where `status` is
   `prepped`. Keep the hand-check after stage 2 and a 10-second look at each
   shipped model in `/swarm`.
4. **TCG reuse:** load the same GLBs in the Collection card sheet's 3D tab
   (three.js or `<model-viewer>`), behind the 2D art.

## Status

- Stages 1, 4 and 5 are verified. Prep ran on all 94 creatures. `selftest.mjs`
  passes. The shipped self-test GLB is read and requested by the real Swarm
  bundle (`[models] 1 real creature model(s) available`) with no fallback to
  the stand-in.
- Stage 3 is written but has **not been run yet**. Blender was not installed in
  the session that wrote it, so expect a tuning pass on the pilot.
- Stage 2 needs a GPU or a hosted service and is not automated here.
