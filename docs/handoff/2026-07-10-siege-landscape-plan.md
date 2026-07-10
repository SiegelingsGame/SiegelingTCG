# Siege / Adventure landscape plan (round 7)

Owner goal (July 10, 2026, screenshots IMG_4646/4647): **the full Siege
experience — map and battle — must be playable in phone landscape with no
visual or feature lapse.** Today the battle screen renders as a portrait
column: knight panel + speed bar + ledger + hint stack on top, the hand fan
is half below the fold, and the battlefield (drop target!) isn't visible —
you cannot actually play. The map screen clips the party cards and resource
row at the bottom.

Work on branch `claude/mobile-landscape-view-kw4pq5` (continue from
origin/main if the branch tip is already merged). Read `CLAUDE.md`,
`.claude/skills/siege-adventure/SKILL.md`, and
`.claude/skills/ui-change/SKILL.md` first. Files: `static/adventure.html`,
`static/js/adventure.js` (ES5 style — var, IIFE; match it),
`static/css/adventure.css`. All Siege rules run server-side
(`/api/siege/**`); adventure.js renders state — layout work is CSS-first,
JS only where DOM order/reparenting is unavoidable.

## Architecture invariants (from CLAUDE.md / skill)

- `adventure.js` sets `document.body.dataset.screen`; adventure.css keys
  layout off `body[data-screen="battleScreen"]`, `"mapScreen"`, etc.
- Battle/map screens are `100dvh` flex columns with `overflow: hidden`;
  exactly ONE child per screen gets `flex: 1 1 auto; min-height: 0` (the
  scroll/canvas region) — keep that invariant or the bottom HUD drifts.
- `touch-action: pan-x pan-y` on html/body stays. Safe-areas via
  `env(safe-area-inset-*)`. Use the shared element palette variables.

## Target layout — battle screen, phone landscape
(`@media (orientation: landscape) and (max-width: 979px) and (max-height: 600px)` —
mirror the battle-table breakpoint so devices behave consistently)

- **Left rail (~200-230px)**: knight panel (name, HP bar, energy, Revive
  Card / Healing Potion item buttons) stacked above the round/speed strip
  (compact) and the ledger toggle. Internally scrollable if needed.
- **Center (flex 1)**: the battlefield rows (enemy line + ally line) fill
  the height — this is the drag target and MUST be fully visible; the
  turn banner / hint line compact at its top or bottom edge.
- **Bottom of center (or right rail — pick what fits the DOM with least
  surgery)**: the hand fan flattens into a compact horizontal strip
  (~110-130px tall cards, horizontal scroll if overflowing) so every card
  is visible and draggable onto the battlefield above. End Turn button
  always on-screen.
- Drag-to-play must work on touch: if the hand strip scrolls horizontally,
  give hand cards `touch-action: pan-x` so vertical/diagonal drags toward
  the battlefield reach the JS pointer handlers (see the battle-table
  precedent in style.css — `pan-y` for a vertical list; here the strip is
  horizontal so it's `pan-x`). Verify with a real drag in Playwright.
- Beware `position: fixed` inside transformed/filtered ancestors on iOS —
  prefer normal flow/absolute within the screen container, or reparent to
  body via JS as game.js `syncLandscapeAuxHud` does.

## Target layout — map screen, phone landscape

- Map canvas (the SVG branching map) takes the center as the single
  `flex: 1 1 auto; min-height: 0` region, scrollable as designed.
- Party cards (Lv1 Squire Bob, Applehead, …) move from the clipped bottom
  strip to a compact right rail (or a slim horizontal strip that fits
  INSIDE the viewport) — every warband member visible or reachable by
  internal scroll, never clipped by the viewport.
- Resource row (silver, deck count, saved, Items button) and the
  "Choose where to begin" hint stay visible — compact them into the top
  bar row or a slim strip; the Items button must stay tappable.

## Other screens — no feature lapse

Sweep every `data-screen` state at 956x440 (start/knight select, warband
pick, camp, cache, broker, smith, caravan, event, rewards, game over). For
each: content must be reachable (internal scroll fine), primary action
buttons on-screen. Most just need their scroll region + max-height bounded
to `100dvh`. Screenshot each into `output/r7-verify/` (do NOT commit
screenshots).

## Verification recipe (live local app)

- `./mvnw -q -DskipTests compile` if target/classes missing, then
  `(./mvnw -q spring-boot:run > /tmp/sb.log 2>&1 &)`; poll
  `http://localhost:8080/adventure.html` for 200. After static edits:
  `cp -r src/main/resources/static/. target/classes/static/` (no restart).
- Playwright global: `require('/opt/node22/lib/node_modules/playwright')`,
  chromium at `executablePath: '/opt/pw-browsers/chromium'`. NEVER
  `playwright install`.
- Drive the real flow at 956x440 (hasTouch, isMobile): goto
  `http://localhost:8080/siege` → walk the intro (pick SiegeKnight +
  starter warband; inspect adventure.js for the button selectors) → map
  screen: assert party cards + Items + map nodes all within viewport /
  internally scrollable; click a Skirmish node → battle screen: assert
  battlefield rows fully visible, every hand card reachable, then perform
  a REAL drag of a playable (AP-affordable) card onto the battlefield and
  assert the server accepted it (AP or hand count changed), then End Turn.
  Repeat the geometry assertions at 844x390. Regression: portrait 390x844
  and desktop 1920x1080 must be unchanged (screenshot + basic geometry).
- localStorage key `siegeToken` addresses the run — clear it between
  scenarios for a fresh run.

## Conventions (non-negotiable)

1. Bump `?v=` pins for adventure.css / adventure.js in `adventure.html`
   (check for other pages including them first: `grep -rn "adventure.css?v=\|adventure.js?v=" src/main/resources/static/*.html`).
2. `node --check` edited JS; CSS brace-balance check.
3. Dated `progress.md` entry (changes + verification evidence) right after
   the "Original prompt:" line.
4. Commit with trailer lines:
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
   `Claude-Session: https://claude.ai/code/session_017CiFKtoBm4aesSswi451qk`;
   push `git push -u origin claude/mobile-landscape-view-kw4pq5`; open a
   NON-draft PR to main (GitHub MCP `mcp__github__create_pull_request`,
   owner SiegelingsGame, repo SiegelingTCG) with verification evidence.
   **Do NOT merge the PR** — the session owner merges (merge = deploy).
5. If you run out of capacity, commit+push what's done and append a
   "## Remaining" section to this file with exact next steps.
