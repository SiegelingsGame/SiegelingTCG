# Round 5 plan — landscape hub HUD/text + binder card text fit

Owner feedback (July 9, 2026, screenshots IMG_4624/4625/4626). Work continues the
phone-landscape overhaul shipped in PRs #417–#422 on branch
`claude/mobile-landscape-view-kw4pq5` (restart it from `origin/main` if it was
merged — see CLAUDE.md git rules). Read `CLAUDE.md` and `.claude/skills/ui-change/SKILL.md`
before starting. Every item below must be verified in headless Chromium against a
live local Spring Boot app (`./mvnw spring-boot:run`, port 8080; Playwright via
`require('/opt/node22/lib/node_modules/playwright')` with
`executablePath: '/opt/pw-browsers/chromium'`; never `playwright install`).
Test viewports: 956x440 and 844x390 (phone landscape), 390x844 (portrait
regression), 1920x1080 (desktop regression).

## Task A — /play entry (welcome) screen unusable in phone landscape

Symptom (IMG_4624): on `play.html`'s welcome overlay (`.welcome-overlay` >
`.play-entry-shell`), the hero copy ("Choose your mode…") wraps one word per
line in a ~180px column, most of the screen is empty, and the Battle/Siege
buttons are clipped at the bottom.

- Relevant CSS: `static/css/style.css` — `.play-entry-shell` (~line 16930),
  `.play-entry-hero`, `.play-entry-actions`, `.play-entry-grid`, `.welcome-shell`,
  plus whatever media query around ~17170 reflows them. The phone-landscape
  block is `@media (orientation: landscape) and (max-width: 979px)` (~line 14020+).
- Fix: in phone landscape give the entry screen a sane layout — hero headline +
  copy spanning a wide column (readable measure, not a sliver), the three mode
  buttons (Battle / Siege / Browse Social Lobbies) visible without clipping
  (row or column on the right), the auth/history sidebar below or beside, and
  the shell scrollable (`max-height: calc(100dvh - nav)`, `overflow-y: auto`)
  so nothing is unreachable. Do not break portrait or desktop.
- Assert: at 956x440 the `h2` width > 400px, `.play-mode-btn` (Battle) fully
  within viewport, no horizontal document scroll.

## Task B — Cards binder (/cards via home.html): filter buttons unreachable in landscape

Symptom (IMG_4625): binder shows "No owned cards match these filters" and the
owner cannot find the filter buttons at all in landscape.

- Markup: `static/home.html` — `#filterTray` (`.filter-panel.hud-tray.is-closed`,
  contains `#elementFilters`, `#typeFilters`, `#rarityFilters`,
  `#energyCostFilters`, `#finishFilters`, `#showUnownedToggle`) and the
  `#filterTrayBtn` "Filters" button (class `ghost-btn hud-tool hidden`).
  Logic in `static/js/home.js` (grep `filterTray`).
- Diagnose why the tray/button is invisible or off-screen at 956x440 and
  844x390 (likely portrait-only media queries in `static/css/home.css`, or the
  tray positioned off the short viewport). The chevron visible mid-right edge
  in the screenshot may be the collapsed tray handle rendering clipped.
- Fix: make the Filters button visible in landscape and the tray open as a
  usable panel (e.g. right-side sheet at `max-height: 100dvh`, internally
  scrollable) — all chip groups + "Show unowned" reachable. Keep portrait and
  desktop behavior unchanged.
- Assert: at 956x440, `#filterTrayBtn` (or an always-visible equivalent) has a
  nonzero on-screen rect; after clicking it `#showUnownedToggle` is visible and
  clickable; clicking "Show unowned" populates the binder grid.

## Task C — Binder card description text must fit the card

Symptom (IMG_4626): full-card binder tiles clip long flavor/description text
past the text panel (e.g. Falcoat's "…talons are already at your throat" runs
off the card bottom).

- The binder full cards render in `static/js/home.js` (binder grid) with
  frame/art helpers from `static/js/card-binder-visual.js` (shared with
  play.html). Find the description/flavor element (likely inside the framed
  card's body panel).
- Fix: after rendering the binder grid, run a text-fit pass per card: if the
  description's `scrollHeight` exceeds its box, step the font-size down (e.g.
  1.0 → 0.62em in ~4 steps, tightening `line-height` slightly) until it fits;
  keep wrapping (`overflow-wrap: break-word`). Precedent to copy:
  `scheduleMulliganTextFit` in `static/js/game.js` (mulligan cards) — same
  approach, batch via `requestAnimationFrame`, re-run on resize and after
  re-render/filter changes. Prefer implementing the fitter where the binder
  renders (home.js) or in card-binder-visual.js if the panel is built there —
  card-binder-visual.js is shared by play.html + home.html, so a shared fitter
  helps both.
- Assert: after "Show unowned" populates the grid at 956x440 AND at desktop
  1920x1080, for every visible `.card` description element,
  `scrollHeight <= clientHeight + 1` (no clipped text), including the known-long
  flavor cards (Falcoat).

## Conventions (non-negotiable — from CLAUDE.md)

1. Bump `?v=N` for every edited static asset in EVERY page that includes it:
   `home.css` (home.html), `home.js` (home.html), `style.css`
   (play.html + home.html + card-dashboard.html; currently v192),
   `card-binder-visual.js` (play.html + home.html; currently v6).
2. `node --check` each edited JS file; CSS brace-balance sanity
   (`python3 -c "s=open(f).read(); assert s.count('{')==s.count('}')"`).
3. Append a dated `progress.md` entry (what changed + how verified), matching
   existing entry style at the top of the file.
4. Commit to `claude/mobile-landscape-view-kw4pq5` with a descriptive message
   ending in the Co-Authored-By/Claude-Session trailer used by prior commits
   on the branch; push with `git push -u origin claude/mobile-landscape-view-kw4pq5`.
5. Open a PR to `main` (not draft) describing changes + verification; do NOT
   merge it — the session owner merges (merge = production deploy).
6. Statics are served from `target/classes` when Spring Boot is running — after
   editing, `cp -r src/main/resources/static/. target/classes/static/` (no
   restart needed for statics).

## State if continuing mid-task

- If this file exists on the branch but no round-5 code commit does, start at
  Task A. Screenshots/verification harnesses from earlier rounds live in the
  session scratchpad (gone if the container recycled) — the recipes above are
  self-contained; rebuild small Playwright scripts as needed (boot flow: /play →
  set `#playerNameInput` → click `button.play-mode-btn` → `setLoadoutStep('deck')`
  → click first `#deckOptions .deck-card` → `setLoadoutStep('knight')` → click
  first `#trainerOptions .knight-card` → click `#btnStartLoadout` until match
  starts → keep mulligan). For hub pages just `goto /cards` — guest state works;
  use "Show unowned" for catalog cards.
