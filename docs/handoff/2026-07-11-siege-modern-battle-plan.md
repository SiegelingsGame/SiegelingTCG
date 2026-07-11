# Siege round 9 — modern full-screen battle (phone landscape first)

Owner goal (July 11, screenshots IMG_4657 current / IMG_4658+4659 reference):
modernize the Siege battle so it looks like a contemporary card battler —
**one full-bleed arena with the UI floating as overlays on top**, instead of
boxed panel sections. Landscape leads; portrait must not regress and gets
the hand-clip bugfix. Reference behaviors, in priority order:

0. **BUG (both orientations): the hand cards are clipped at the bottom** —
   in the current landscape build the card fan renders half-hidden behind
   the AP/HUD row (see IMG_4657); the owner reports portrait clips too.
   Whatever else ships, cards must be fully visible and readable.
1. **Full-screen arena**: the battle stage becomes the whole screen (edge
   to edge, no bordered .battle-stage box, no stacked section rows). All
   chrome floats over it.
2. **Facing sides with real separation**: allies anchored FAR LEFT, enemies
   FAR RIGHT, generous empty center (the round-8 facing columns exist —
   push them to the screen edges; the current gap is too tight).
3. **Overlay chrome** (mirror the reference layout):
   - Top-left: compact knight/life HUD (name, HP bar, energy) + the
     round/speed strip condensed under it; item buttons (Revive/Potion) as
     small chips near it.
   - Left edge, mid-low: the AP pips as a compact vertical or horizontal
     floating bar.
   - Bottom-center: the hand as an overlaid fan/strip (cards fully visible,
     slight arc like the reference if cheap; horizontal scroll if needed).
   - Bottom-right: End Turn as a prominent circular/pill confirm button
     (the reference's big check button).
   - Small floating chips for deck/hand/discard counts; ledger toggle
     top-right near Abandon Run.
   - The turn banner / hint line floats top-center over the arena, not in
     a boxed row.
4. **Drag focus** (reference IMG_4659): while dragging a targeted card,
   (a) dim the arena (a translucent scrim under the overlays), (b) the
   currently hovered legal target gets a lock-on treatment (ring/halo +
   slight scale), and if cheap (c) draw a curved trajectory line from the
   dragged card to the hovered target via an absolutely-positioned SVG
   overlay. Class-driven: adventure.js's drag handler already tracks the
   hovered drop target (elementFromPoint) — add/remove body- or
   stage-level classes (e.g. `drag-active`, `drop-hover` on the target)
   and implement the visuals in CSS; the SVG arc needs a small JS hook on
   the same pointermove path (throttle via rAF). ES5 style.

## Constraints and cautions

- Server-authoritative: presentation only. Do not touch com.sieglings.
- Keep EVERY feature reachable: items, ledger, Abandon Run, hint text,
  enemy intent chips, speed strip, deck/discard info, End Turn.
- `body[data-screen="battleScreen"]` scoping. The full-bleed arena should
  be achieved by restyling the existing DOM (the stage already exists) —
  avoid reparenting unless truly necessary; if a floating element mispaints
  on iOS inside filtered/overflow ancestors, remember the round-6 lesson:
  reparent to <body> in JS (see game.js syncLandscapeAuxHud) rather than
  fighting containing blocks.
- Portrait: fix the hand clip (item 0) and leave the rest of portrait's
  layout as-is this round.
- Landscape scope: the existing `@media (orientation: landscape) and
  (max-width: 979px) and (max-height: 600px)` block in adventure.css.
- Sprites: with the stage full-bleed, sprites can grow (~90-110px) —
  keep name/HP plates readable; enemy intent chips must stay attached.
- touch-action: hand strip cards need `touch-action: none` or `pan-x`
  consistent with the current working drag (do not break what round 7
  verified); the scrim/overlay layers must be `pointer-events: none` so
  drops still land via elementFromPoint.

## Verification (extend the round-7/8 recipe; real run, live local app)

At 956x440 and 844x390 (hasTouch/isMobile), driving a real run:
- Hand: every card's full rect inside the viewport (no clipping) — assert
  per-card `bottom <= vh` and readable size; ALSO at portrait 390x844
  (this is the bug fix — assert there too).
- Arena: stage box spans ≥95% of viewport width and height behind the
  overlays (full-bleed); allies' max centerX in the left third, enemies'
  min centerX in the right third (real separation).
- Overlays: knight HUD top-left quadrant; AP pips on-screen left side;
  End Turn bottom-right quadrant, ≥40px tall; deck/discard chips visible;
  ledger opens; items clickable.
- Drag focus: start a real drag over a legal target — assert the scrim/
  focus class engages, the hovered target carries the lock-on class, and
  (if built) the arc svg exists during drag and is gone after drop; then
  the drop is ACCEPTED by the server (hand/AP change). End Turn works.
- Regression: portrait map/battle geometry (aside from the hand fix) and
  desktop 1920x1080 unchanged; no page errors.
- Screenshots to output/r9-verify/ (never commit them): landscape battle
  resting, mid-drag focus, after play; portrait battle showing unclipped
  hand.

## Ship conventions (same as every round)

node --check adventure.js; CSS brace balance; bump adventure.css AND
adventure.js pins in adventure.html; dated progress.md entry after the
"Original prompt:" line; commit with trailers
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` /
`Claude-Session: https://claude.ai/code/session_017CiFKtoBm4aesSswi451qk`;
push to `claude/mobile-landscape-view-kw4pq5`; NON-draft PR to main via
mcp__github__create_pull_request (SiegelingsGame/SiegelingTCG) with the
measured evidence; DO NOT merge. If capacity runs out: commit+push and
append `## Remaining` here with exact next steps.
