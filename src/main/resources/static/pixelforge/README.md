# PixelForge

A procedural pixel-art generator for **character attack effects and cutscenes**, shared by
Siegelings TCG, ANIME VS+ and Generations. It follows Pixel Composer's model
(generate → colorize → filter → compose → export) but every effect is a small JSON *spec*,
so the same file renders the same pixels in the browser editor, in Node build scripts, and
later in Godot.

The same folder is checked into all three repos (see [Keeping the copies in sync](#keeping-the-copies-in-sync)):

| Repo | Folder | Open the editor |
|---|---|---|
| SiegelingTCG | `src/main/resources/static/pixelforge/` | `/pixelforge/` on Firebase Hosting or `./mvnw spring-boot:run` |
| AnimeVsPlus2 | `pixelforge/` | `pixelforge/index.html` (also linked from FX Lab) |
| GenerationsRPG | `pixelforge/` | `pixelforge/index.html` |

## Files

| File | What it is |
|---|---|
| `core.js` | The renderer. Pure (no DOM, canvas or `Math.random`), runs in browsers and Node. Layer types, colour ramps, post passes, sprite-sheet packing, Aseprite JSON, GIF encoder. |
| `presets.js` | 35 ready-made specs: slashes, element attacks for all 12 elements, impacts, projectiles, auras, status loops, and 5 cutscenes. |
| `index.html`, `editor.js`, `editor.css` | The editor: preset gallery, layer stack, inspector with keyframes, live preview, and exports. |
| `player.js` | Runtime for games: load a baked sheet (or bake a preset live) and play it on an overlay canvas or in your own render loop. |
| `cli.js` | Bake presets/specs to PNG sheets + JSON (+ GIF, per-frame PNGs) from Node. No dependencies. |
| `test.js` | `node pixelforge/test.js`: determinism, every preset/layer renders, exporters are well-formed. |

## Editor

- **Presets**: click one to load it. The project chips filter the gallery.
- **Layers** draw top to bottom: ↑/↓ reorder, ● hide, ⧉ duplicate, ✕ delete. `start`/`end`
  (0–1) set when the layer is on within the clip.
- **Inspector**: every number has a slider. Press **~** to keyframe it. Keyframes are
  `time:value` pairs over the layer's window (for example `0:0, 0.3:24, 1:28`) with an easing.
- **Ramp → all** copies the selected layer's colour ramp to the other element-coloured layers.
- **Export**: sheet PNG + JSON, GIF, a ZIP of frames, the spec, or a share link (the spec is
  stored in the URL hash).
- **Generate set .zip** renders the current clip in all 15 element ramps, or as 8 seed variations.
  You get a sheet, JSON, a preview GIF and a spec for each, plus an `index.json`.
- Keys: Space plays/pauses, ←/→ step through frames.

## Spec format

```jsonc
{
  "w": 64, "h": 64,          // canvas in art pixels (cutscenes: 160x90, scale x4/x8 at runtime)
  "frames": 14, "fps": 16,
  "loop": false,             // loops sample t in [0,1) so the last frame flows into the first
  "seed": 7,                 // all randomness comes from here
  "pivot": [32, 34],         // contact point; the player puts this on the target's x/y
  "shake": {"keys": [[0,0],[0.6,4],[1,0]]},   // optional camera shake (art pixels)
  "layers": [ { "type": "slash", "ramp": "fire", "progress": {"from":0,"to":1.7,"ease":"outCubic"} } ],
  "post":   [ { "type": "outline", "color": "#120a1a" } ]
}
```

A numeric param can be a number, `{from, to, ease, start, end}`, or `{keys: [[t, v], ...], ease}`.
Params you leave out use the defaults (see `PixelForge.schema(type)`).

**Field layers** draw an intensity map. The map is then coloured by `ramp` (a named ramp, or
an array of hex colours from dark to bright) with ordered `dither`. Pixels below `cut` stay
transparent. `blend` can be `normal`, `add`, `erase` (cut holes) or `behind`.

| Layer | Use |
|---|---|
| `particles` | sparks, embers, droplets, confetti (dot / square / streak / spark, gravity, drag, swirl) |
| `ring` | shockwaves, ground rings, frost rings, noise breakup |
| `slash` | sword and claw crescents, with sweep progress and trail |
| `beam` | lasers, water jets, breath attacks |
| `bolt` | lightning with branches (redrawn every N frames) |
| `orb` | projectiles along a straight line or an arc, with a tail |
| `rays` | starbursts and crit flashes |
| `circle` | magic circles: rings, runes and star polygons, rotating and squashed for perspective |
| `flame` | `flame`, `smoke` or `pillar` noise columns |
| `cloud` | explosion and poison puffs that dissolve |
| `shards` | ice, glass and rock debris |
| `vortex` | black holes, portals, psychic swirls |
| `tornado` | swaying funnels |
| `spikes` | ground eruptions in a staggered row |
| `speedlines` | radial, horizontal or vertical anime lines |
| `cutin` | diagonal cut-in banner with stripes |
| `figure` | procedural silhouette (stand, lunge, cast, leap, guard, kneel) with a sword, staff or spear |

**Direct layers** paint colour themselves: `bg` (banded or radial gradient), `letterbox`,
`flash` (dithered), `invert` (two-tone impact frame), `text` (built-in 3×5 pixel font, typewriter
`reveal`, `wave`), `image` (your own character sprite: PNG URL or embedded data URL, with
`slide`/`bob`/`whiten`/`silhouette`), and `effect` (embeds another preset, so a cutscene can
reuse attack effects).

**Post passes** (run on the whole frame): `outline`, `glow` (stepped-alpha halo), `palette`
(snap to `pico8` / `db16` / `sieglings` or your own list; use one palette on every effect so they read
as one set), `alphaSteps`.

The element ramps (`fire`, `ice`, `water`, `electric`, `wind`, `earth`, `poison`, `shadow`,
`light`, `psychic`, `metal`, `undead`, `arcane`, `blood`, `heal`, …) use the same hues as the
SiegelingTCG `--element` CSS variables.

## CLI

```bash
node pixelforge/cli.js --list
node pixelforge/cli.js fire-slash explosion --out assets/fx          # sheet PNG + JSON + index.json
node pixelforge/cli.js --all --for generations --gif --out build/fx  # GIF previews too
node pixelforge/cli.js --spec my-move.pf.json --out assets/fx        # spec saved from the editor
node pixelforge/cli.js --category cutscene --frames-dir --sheet-scale 4 --out out/cutscenes
node pixelforge/cli.js --contact out/contact.png                     # one-image overview of every preset
```

## Using effects in a game

```html
<script src="pixelforge/player.js"></script>
<script>
  // Baked sheet (from the CLI or the editor):
  PixelForgePlayer.load('assets/fx/fire-slash.json').then(function (clip) {
    PixelForgePlayer.spawn(clip, targetX, targetY, { scale: 3, onHit: showDamage, onDone: next });
  });
  // Or bake at runtime (also load core.js + presets.js):
  var clip = PixelForgePlayer.bake('lightning-strike');
  // Own render loop (canvas games): draw a frame with the pivot at x/y.
  PixelForgePlayer.drawFrame(ctx, clip, frame, x, y, 3);
</script>
```

`onHit` fires on the impact frame (`pf.hit`, the brightest frame). Use it to sync damage
numbers, screen shake and hit-stop.

- **Siegelings TCG** (`fx.js`): call `spawn` at the target cell's screen centre in `impactAt` /
  `attackCell`, with the preset named after the card element.
- **ANIME VS+**: the sheet JSON's `pf` block uses the same fields as an `AVFX` record
  (`fw, fh, cols, n, fps, loop, px, py, hit`). Bake into `assets/fx/` and add the entries to `js/fx_data.js`.
- **Generations**: `fx-layer.js` already draws a canvas overlay. Call `drawFrame` from its loop,
  and use the `cutscene-*` presets for event and lineage beats.
- **Godot**: import the PNG sheet as `SpriteFrames` (hframes = `cols`, fps from the JSON),
  set the sprite offset from `px/py`, and emit a signal on frame `hit`. `core.js` is pure and
  seeded, so it can be ported to GDScript and checked against these outputs.

## Keeping the copies in sync

Edit the folder in any one repo, then copy it to the others:

```bash
./pixelforge/sync.sh ../SiegelingTCG/src/main/resources/static/pixelforge ../GenerationsRPG/pixelforge
```

The script refuses to copy over a target that has local edits newer than the source.
Bump `VERSION` in `core.js` and the `?v=` query strings in `index.html` when you change a file.
