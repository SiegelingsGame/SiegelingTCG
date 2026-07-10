# Siege landscape round 8 — horizontal map + facing-columns battle

Owner-approved concept (reference: diamond-node roguelike map progressing
left→right): in phone landscape, the Siege map should read LEFT → RIGHT
(start left, boss right) and the battle should face the player's team on
the LEFT against enemies on the RIGHT, instead of the current vertical
arrangements. Portrait and desktop keep today's behavior exactly.

Branch `claude/mobile-landscape-view-kw4pq5` (continue from origin/main if
the tip is merged). Read `CLAUDE.md`, `.claude/skills/siege-adventure/SKILL.md`,
`.claude/skills/ui-change/SKILL.md`, and the prior round's plan
`docs/handoff/2026-07-10-siege-landscape-plan.md` (its layout/verification
recipes still apply). Files: `static/js/adventure.js` (ES5 — var/IIFE),
`static/css/adventure.css` (the round-7 phone-landscape block at the end is
your styling home: `@media (orientation: landscape) and (max-width: 979px)
and (max-height: 600px)`), `static/adventure.html` (pin bump only).

## Task A — map flows left → right in phone landscape

Code anchors (adventure.js `renderMap()`, ~line 1289):
- Server nodes carry abstract `row` (depth, 0 = start) and `col` (lane).
- `pos(n)` currently maps depth to Y (row 0 at the BOTTOM, boss on top) and
  centers lanes horizontally; `width`/`height` come from `MAP.pad/colGap/rowGap`.
- Edges are cubic beziers bending through `midY`; the auto-scroll at ~1403
  sets `scroll.scrollTop` to keep the current node in view.

Change (client-only; guard with a helper like
`function isPhoneLandscape(){ return matchMedia('(orientation: landscape) and (max-width: 979px) and (max-height: 600px)').matches; }`):
- In landscape, transpose the layout: depth → X (row 0 at the LEFT, boss at
  the far RIGHT), lanes spread across Y and centered vertically; swap the
  svg width/height accordingly (width from rows·rowGap, height from
  maxCount·colGap). Keep `MAP.r`, tints, glyphs, labels (labels stay below
  nodes — verify they don't collide with edges; nudge `label y` if needed).
- Edge beziers bend through `midX` instead of `midY`.
- Auto-scroll targets `scroll.scrollLeft` (keep ~60% lead). `#mapScroll`
  needs `overflow-x: auto; overflow-y: hidden` in the landscape block
  (portrait keeps vertical scrolling).
- Re-render on orientation change: renderMap runs on state changes; also
  hook a (debounced) resize/orientationchange listener that re-calls
  renderMap() when the layout mode flips while on mapScreen — otherwise a
  rotation strands the old orientation's geometry.
- Cleared/current/reachable styling, ✓ markers, and click-to-travel are
  position-agnostic — keep them working.

## Task B — battle: allies LEFT column vs foes RIGHT column

Code anchors: `.battle-stage` contains `.foe-line` (DOM first) and
`.ally-line`, each a horizontal flex row of `.sprite` units. Round 7 made
the stage the grid's main area (~200-260px tall at phone landscape).

Change (CSS-first, inside the round-7 landscape block):
- `.battle-stage` becomes a row: `display: flex; flex-direction: row;` with
  `.ally-line` visually on the LEFT and `.foe-line` on the RIGHT (DOM has
  foe first — use `flex-direction: row-reverse` or `order`), a clear gap
  between the two sides (this center gap is also the natural home for the
  clash/impact FX that currently plays between the stacked lines).
- Each line becomes a vertical **formation that wraps inward in ranks**:
  `flex-direction: column; flex-wrap: wrap;` sized so ~3 sprites fit per
  rank at readable size (~64-76px sprites at 390-440px heights); a 5-6 unit
  warband forms 2 ranks rather than shrinking to unreadability. Allies'
  ranks grow rightward (toward center), foes' leftward (toward center) —
  wrap direction/align so the front rank of each side faces the middle.
- Sprite-anchored floaters (damage numbers, buffs, enemy-intent chips,
  status icons) anchor to sprite elements — verify they render sanely in
  columns (not clipped by the stage edges; adjust offsets in the landscape
  block if a chip overflows the top of a column).
- Selection/targeting highlight, drag-over feedback, and `elementFromPoint`
  drops are layout-independent — but VERIFY with a real targeted play (a
  damage card requiring an enemy target if the starter deck has one, else
  any playable card) and confirm the intended unit was hit via the ledger
  or HP change.
- Portrait battle (stacked foe-over-ally) unchanged.

## Verification (extends round 7's recipe — reuse it)

Real server-authoritative run at 956x440 and 844x390 (hasTouch/isMobile):
- Map: assert boss/deepest node X > start node X (left→right), lanes within
  viewport height (no vertical scroll), `#mapScroll` scrolls horizontally,
  auto-scroll positions the current node in view after a travel, node click
  still travels. Screenshot.
- Battle: assert every `.ally-line .sprite` centerX < every `.foe-line
  .sprite` centerX, both sides fully inside the stage box, ≥3 sprites per
  side handled (the starter warband may be small — if so, additionally
  assert the wrap geometry by checking computed flex properties), then a
  REAL drag-play accepted by the server (hand/AP change) and End Turn.
  Screenshot including a moment with damage floaters if achievable.
- Rotation: start on map at 956x440, resize viewport to 390x844, assert the
  map re-renders vertically (boss Y < start Y), resize back, assert
  horizontal again.
- Regression: portrait 390x844 map+battle geometry unchanged; desktop
  1920x1080 unchanged. No page errors anywhere.
- Screenshots to `output/r8-verify/` — do NOT commit them.

## Conventions (same as always)

`node --check` adventure.js; CSS brace balance; bump `adventure.css?v=`
AND `adventure.js?v=` pins in adventure.html (grep for other includers
first); dated progress.md entry after the "Original prompt:" line; commit
with the standard trailers
(`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` /
`Claude-Session: https://claude.ai/code/session_017CiFKtoBm4aesSswi451qk`);
push `git push -u origin claude/mobile-landscape-view-kw4pq5`; open a
NON-draft PR to main via `mcp__github__create_pull_request` (owner
SiegelingsGame, repo SiegelingTCG) with measured evidence; DO NOT merge.
If capacity runs out: commit+push what's done and append `## Remaining`
here with exact next steps.
