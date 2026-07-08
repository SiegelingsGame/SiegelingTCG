---
name: game-rules
description: Workflow for changing Siegelings TCG battle-table rules — placement, energy/links, combat, effects, phases, AI. Covers the Java service seams, the frontend-parity requirement, action-queue log coupling, and which tests to write/run. Use for any gameplay-logic change in the core TCG (not Siege adventure mode).
---

# TCG rules engine change workflow

## 1. Pick the seam

All rules live in `src/main/java/com/sieglings/service/`:

- `GameService` — turn/phase orchestration, mulligan, claims, round lifecycle,
  temp-effect cleanup timing. Entry for "when does X happen".
- `PlacementService` — legal placement (reciprocal notch anchors to any
  friendly card + perimeter sockets on edge cells), evolution targeting,
  foundation-network membership (`getFoundationSieglings`).
- `EnergyService` — energy from reciprocal same-element links, perimeter
  sockets (left col LEFT, right col RIGHT, outer row TOP/BOTTOM — diagonals
  never make socket energy), mixed-element **combo points**. Recalculates from
  the connected foundation network only, so broken links drop energy.
- `BattleService` — speed-order action queue, per-ability energy costs,
  weakness bonus (+1, Siegling-sourced damage only), pass/act flow,
  battle-action pause flags for paced client playback.
- `EffectService` — resolves ability **effect keys** (see
  `ABILITY_EFFECT_KEYS.md`). New mechanic = new key here + in
  `model/AbilityEffectKeys.java` + docs + test.
- `AIService` — solo opponent decisions.
- `GameState.removeDeadSieglings()` — bounty damage on defeat (rarity 5/6/7/8/10).

Controller layer (`GameController`) is thin: POST endpoints mutating the
in-memory `GameState` and returning the full serialized snapshot.

## 2. The two parity traps

**Frontend parity**: `js/game.js` independently precomputes placement
highlights, energy previews, targeting legality, and ability cost gating. If
you change a rule server-side, find and update the mirrored client logic (grep
`game.js` for related terms: `socket`, `anchor`, `reciprocal`, `requiredEnergy`,
`legal`), then bump `game.js?v=` in `play.html` + `home.html`. A backend-only
change makes the UI highlight moves the server rejects.

**Log-string coupling**: `js/action-queue.js` parses battle-log wording to
drive animations — phrases like `deals N damage to`, `was destroyed`,
`evolves`, `claims X and gains`, `[Turn N PHASE]` prefixes. If you add or
reword log lines, grep `action-queue.js` for the old phrasing and extend its
parser, or playback animations will misfire (wrong toasts, phantom destroys).

## 3. Data-driven vs code change

Prefer data when possible: card stats/notches/costs/abilities live in override
JSON (`resources/cards/siegling-overrides.json`) and Firestore — see the
`card-tuning` skill. Write Java only for new *mechanics* (new effect key,
placement rule, phase behavior).

## 4. Tests

Every rules change gets a focused JUnit test in
`src/test/java/com/sieglings/service/`. Existing suites show the fixture
patterns (building boards by hand, placing instances, asserting energy/legality):
`EnergyServiceTest`, `PlacementServiceTest`, `BattleServiceTest`,
`EffectServiceTest`, `GameServiceTest`, `CardDefinitionServiceTest` (deck
construction invariants: 40 cards, 20/10/10, ≤3 copies, whole evolution lines).

```bash
./mvnw -q -DskipTests compile        # fast gate
./mvnw -q -Dtest=PlacementServiceTest test
./mvnw -q test                       # full suite before finishing
```

## 5. End-to-end check when behavior is visible

If the change affects what a player sees (placement highlights, battle order,
damage numbers), boot the app and drive it:

```bash
./mvnw spring-boot:run    # http://localhost:8080; /api/game/new is slow cold (10–30s)
```

Start a solo match via the API (`POST /api/game/new`, `/api/game/mulligan`,
`/api/game/draw` …) or headless Chromium (global playwright,
`executablePath: '/opt/pw-browsers/chromium'`), and assert the new rule in the
returned state JSON or the DOM. Past `progress.md` entries document this
pattern extensively — deterministic checks inject a known state rather than
relying on random hands.

## 6. Log it

Append a dated `progress.md` entry: rule change, files touched, tests added,
verification evidence.
