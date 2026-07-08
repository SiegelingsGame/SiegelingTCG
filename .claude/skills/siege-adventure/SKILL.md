---
name: siege-adventure
description: Workflow for Siege / Adventure Expedition mode (the single-player roguelike at /siege) — server-authoritative architecture, screen/state conventions in adventure.js and adventure.css, combat engine seams, and content (nodes, items, events, rewards). Use for any adventure-mode change.
---

# Siege adventure mode workflow

## Architecture in one paragraph

Siege is fully **server-authoritative**: every rule lives in
`src/main/java/com/sieglings/adventure/` and the client
(`static/adventure.html` + `js/adventure.js` + `css/adventure.css`) only
renders state and submits actions to `/api/siege/**` (`SiegeController`). The
run is addressed by an opaque token in `localStorage.siegeToken`; auth rides
along via `localStorage.sieglingsAuthToken`. The server streams *presentation
events* that the client plays back (projectiles, action moments, telegraphed
enemy notch targets). Design intent and system maps are in
`docs/adventure-mode/` (discovery report, design proposal, technical plan).

## Server seams

- `SiegeService` — run lifecycle: setup (knight → warband), map generation
  (SVG DAG of `SiegeNode`s: BATTLE/ELITE/REST/TREASURE/BROKER/SMITH/CARAVAN/
  EVENT/BOSS), node resolution, gold/economy, rewards, checkpointing
  (`SiegeCheckpointStore`).
- `SiegeCombatEngine` — round-based AP combat: team Speed decides initiative
  (rendered as a race track), cards cost AP, statuses BURN/SLOW/STUN/SHOCK,
  knight passives (Bulwark/Warlord/Vanguard/Warden/Quartermaster/Marshal) and
  ultimates.
- `SiegeContentService` — content catalogs: cards (`SiegeCard`), items
  (`SiegeItem`), camp options, reward options, enemies.
- Admin JS pages exist for content: `js/siege-class-admin.js`,
  `siege-event-admin.js`, `siege-item-admin.js`.

This mode intentionally does **not** reuse the TCG board engine — do not try
to route Siege combat through `BattleService`/`EffectService`.

## Client conventions (adventure.js / adventure.css)

- One HTML page, many `<section class="siege-screen">`s toggled with `.hidden`;
  `adventure.js` sets `document.body.dataset.screen`, and `adventure.css` keys
  full-viewport layouts off `body[data-screen="battleScreen"]` /
  `"mapScreen"` (those two are `100dvh`, `overflow:hidden`, flex-column with
  `.battle-stage` / `.map-scroll` as the single `flex:1 1 auto; min-height:0`
  child — preserve that or the bottom HUD/hand fan drifts offscreen).
- `adventure.js` is a single ES5 IIFE (`var`, function statements, `$()` helper,
  `el()` DOM builder). Match the style; there is no build step.
- Battle UI parts: `#speedTrack` (initiative), `#battleStage` (foe/ally lines,
  action banner), `#battleLog` ticker (tap opens `#ledgerPanel` turn ledger),
  `#battleHint`, `#handRow` hand fan (drag a card onto the battlefield to play),
  `#battleHud` (AP dots, deck counts, ultimate, End Turn).
- Element colors/icons are mirrored constants at the top of `adventure.js`
  (`EL_COLOR`, `EL_ICON`) — keep them in sync with `style.css` palette.
- Cache-bust after edits: `adventure.css?v=N` and `adventure.js?v=N` in
  `adventure.html`.

## Verification

- Java: focused tests if present, plus `./mvnw -q -DskipTests compile` and the
  full suite; drive `/api/siege/**` with curl against a local
  `./mvnw spring-boot:run` for rule changes.
- Client: `node --check js/adventure.js`, then headless Chromium at 390x844
  (Siege is phone-first). Static-only serving shows the loading screen erroring
  on `/api/siege/**` — for real flows run Spring Boot, or inject mock state.
- Log changes in `progress.md`.
