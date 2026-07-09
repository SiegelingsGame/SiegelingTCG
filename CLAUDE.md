# Siegelings TCG — Agent Memory

Read this first. It tells you what the game is, where everything lives, and the
non-negotiable workflow rules. Deeper task recipes live in `.claude/skills/`
(`ui-change`, `game-rules`, `card-tuning`, `siege-adventure`, `deploy-verify`).

## What the game is

Siegelings TCG is a tactical elemental card game with two playable modes:

1. **Battle Table** (`/play` → `play.html`) — the core TCG. 1v1 (solo vs AI, or
   live multiplayer rooms). Each player builds a 3x3 board half. Creature cards
   ("Sieglings") carry **notches** — directional colored dots on the card
   perimeter. When two adjacent cards' notches point at each other (a
   *reciprocal link*), they connect and generate **elemental energy**; board-edge
   cells can instead anchor to perimeter **sockets** (left column LEFT, right
   column RIGHT, outer row TOP/BOTTOM). Energy pays for spells, traps, and
   battle abilities. Turn loop: DRAW → SETUP (place 1 Siegling max, cast
   spells/traps, claim surviving Sieglings for temp energy) → BATTLE (all
   Sieglings act in Speed order using per-ability energy-cost moves) → next
   round. Players have direct HP (50); defeated Sieglings deal rarity-based
   "bounty" damage to their owner. Sieglings have only Health, Speed, notches,
   and abilities — there is **no printed ATK/DEF stat**; damage comes from
   abilities. Evolution cards are placed onto their live precursor. SiegeKnights
   (trainers) give a passive plus an active/ultimate. Elemental weakness chart:
   Fire > Ice > Wind > Earth > Fire; Water > Fire/Ice; Metal > Earth/Wind;
   Electric > Wind/Fire; Poison > Ice/Earth; Shadow > Psychic > Light > Undead > Shadow.

2. **Siege / Adventure Expedition** (`/siege` → `adventure.html`) — a
   single-player roguelike (Slay-the-Spire style): pick a SiegeKnight + starter
   Siegeling warband, walk a branching SVG map (battles, elites, rest camps,
   cache digs, broker, smith, caravan, events, boss), fight AP-based card
   battles (drag a card from the hand fan onto the battlefield; End Turn), earn
   gold/cards/items. **All rules run server-side** in `com.sieglings.adventure`
   (`SiegeService`, `SiegeCombatEngine`, `SiegeController` → `/api/siege/**`);
   `adventure.js` only renders state and plays back presentation events. Run
   state is addressed by an opaque token in `localStorage.siegeToken`.

Supporting surfaces: landing (`/` → `index.html`, 3D FBX legendary viewer), hub
(`/home` → `home.html` — also serves `/cards`, `/decks`, `/profile`, `/shop`,
`/social`, `/achievements`, `/deck-builder` via rewrites; contains gacha packs,
binder, social lobbies, deck builder), and the **live card dashboard**
(`/card-dashboard.html`) where designers edit card/deck data persisted in
Firestore.

## Stack and deploy topology

- **Backend**: Spring Boot (Java 21), Maven wrapper (`./mvnw`). In-memory game
  state for matches; file-backed H2 + JPA for accounts/decks/history; Firestore
  (project `siegelingstcgtesting`, database `siegedb`, doc
  `appConfig/cardOverrides`) for live card/deck/trainer overrides.
- **Frontend**: hand-written static HTML/CSS/JS (no framework, no bundler) in
  `src/main/resources/static/`, served both by Spring Boot and Firebase Hosting.
- **Live**: Firebase Hosting (`https://siegelingstcgtesting.web.app`) rewrites
  `/api/**` to Cloud Run service `sieglings-tcg-api` (us-central1). Pushing to
  `main` auto-deploys both via `.github/workflows/deploy.yml`. Page routes are
  defined in `firebase.json` rewrites — add new pages there too.
- `mobile/` is TypeScript **API/domain contract types only** (no app);
  `functions/` is Firebase Functions; `.deploy-hosting/` and `output/` are
  build/verification artifacts — never edit game code there.

## File map (edit these, not lookalikes)

| Area | Files |
|---|---|
| Battle Table UI | `static/play.html`, `static/js/game.js` (~15k lines), `static/css/style.css` (~14k lines) |
| Battle playback/FX | `static/js/action-queue.js` (queues server log/state diffs into animations), `static/js/fx.js` (projectiles/particles) |
| Hub UI | `static/home.html`, `static/js/home.js`, `static/css/home.css` |
| Landing | `static/index.html`, `static/js/landing.js`, `static/css/landing.css`, `static/js/legendary-viewport.js` |
| Adventure UI | `static/adventure.html`, `static/js/adventure.js`, `static/css/adventure.css` |
| Card dashboard | `static/card-dashboard.html`, `static/js/card-dashboard.js`, `static/css/card-dashboard.css` |
| TCG rules engine | `src/main/java/com/sieglings/service/`: `GameService` (orchestration/phases), `PlacementService` (legal cells, foundation network), `EnergyService` (links/sockets/combos), `BattleService` (speed order, abilities), `EffectService` (effect-key resolver), `AIService` |
| Adventure engine | `src/main/java/com/sieglings/adventure/` |
| Card data | `GeneratedCreatureCatalog` / `GeneratedSpellCatalog` (baseline) ← `ManualSieglingCatalog` + `resources/cards/siegling-overrides.json` (hand tuning) ← Firestore live overrides (dashboard). Also `resources/cards/moves-pool.json`, `live-elements.json` |
| REST API | `controller/GameController` (`/api/game/**`), `SocialController`, `AuthController`, plus progression/missions/leaderboards/shop; adventure has `SiegeController` |
| Tests | `src/test/java/com/sieglings/service/*Test.java` (JUnit); `tests/mobile-overlap/` (Playwright layout guard, uses `static/mobile-overlap-fixture.html`) |

**Legacy traps**: `static/game.js` and `static/style.css` at the static *root*
(not under `js/`/`css/`) are dead legacy copies. The active bundles are
`static/js/game.js` and `static/css/style.css`.

## Non-negotiable conventions

1. **Cache-busting**: every CSS/JS include uses `?v=N`. After editing any
   static asset, bump its `?v=` in **every HTML page that includes it** (e.g.
   `game.js` is loaded by both `play.html` and `home.html`). Skipping this
   ships stale code to returning browsers.
2. **Mobile-first**: most players are on phones (iOS Safari web app). Battle
   screens are single-viewport `100dvh` flex columns with `overflow:hidden` —
   the page never scrolls; only designated inner regions do.
   `touch-action: pan-x pan-y` on `html`/`body` (style.css + adventure.css)
   deliberately blocks pinch/double-tap zoom, because a stray zoom permanently
   clips the fixed layout. Do not remove it; do not reintroduce `user-scalable=no`
   (accessibility) — the meta viewport stays `width=device-width, initial-scale=1,
   viewport-fit=cover`. Use `env(safe-area-inset-*)` for notches.
3. **Adventure screen states**: `adventure.js` sets `document.body.dataset.screen`;
   `adventure.css` keys layout off `body[data-screen="battleScreen"]` etc.
   Battle/map screens are flex columns where exactly one child gets
   `flex:1 1 auto; min-height:0` — keep that invariant or the bottom HUD drifts.
4. **Element palette**: use the CSS variables in `style.css` `:root` (`--fire`,
   `--water`, … `--light`, `--neutral`). Never invent a second palette;
   `adventure.css`/`card-dashboard.css` mirror the same hex values.
5. **Ability effect keys**: all effects (creature abilities, spells, traps,
   trainer actives) resolve through string keys documented in
   `ABILITY_EFFECT_KEYS.md` and `model/AbilityEffectKeys.java`. New mechanics =
   new key in `EffectService` + registry + docs + test, then usable from JSON
   overrides and the dashboard.
6. **progress.md**: append a dated entry for every substantive change — one
   paragraph of what changed and one of how it was verified. That file is the
   project's institutional memory; read its recent entries before large work.
7. **Frontend/backend rule parity**: the frontend precomputes legal placements,
   energy, and targeting highlights that the backend independently enforces.
   Any rules change must land on **both** sides (e.g. `PlacementService` +
   `game.js` placement preview) or highlights will lie to the player.
8. **Comment style**: comments explain *why*/constraints, not what the next
   line does. JS is ES5-flavored in `adventure.js` (`var`, IIFE) and mixed-modern
   in `game.js` — match the file you're in.

## Build, test, verify (this Linux environment)

```bash
./mvnw -q -DskipTests compile          # fast compile check for Java changes
./mvnw -q test                         # full JUnit suite
./mvnw -q -Dtest=EnergyServiceTest test  # focused service test
node --check src/main/resources/static/js/game.js   # JS syntax gate
./mvnw spring-boot:run                 # full app on http://localhost:8080
```

- Java 21 and Node 22 are preinstalled. Playwright is **globally** installed —
  `require('/opt/node22/lib/node_modules/playwright')` with
  `executablePath: '/opt/pw-browsers/chromium'`. Never run `playwright install`.
- For frontend-only checks you can skip Spring Boot: serve statics with
  `python3 -m http.server <port>` from `src/main/resources/static` (API calls
  will 404 but layout/CSS/JS can be exercised, and screens can be verified by
  injecting mock state — see the many harnesses referenced in `progress.md`).
- Standard verification bar (mirror `progress.md` entries): JS `node --check`,
  Maven compile/tests for touched services, and a focused headless-Chromium
  check at a phone viewport (390x844) plus desktop (1920x1080) for UI work,
  asserting the actual behavior changed — not just that the page loads.
- Layout guard: `tests/mobile-overlap/` (Playwright spec) checks text/button
  overlap at 4 phone viewports against `mobile-overlap-fixture.html`. If you
  change shared tile/button CSS, run it or replicate its assertions.

## Architecture notes that save you hours

- **Match flow (Battle Table)**: every action is a POST under `/api/game/**`
  returning the full serialized `GameState`. The client renders from that state
  snapshot; `action-queue.js` diffs consecutive states **and parses battle log
  strings** (e.g. `"X deals N damage to Y"`, `"Player claims X…"`,
  `[Turn N PHASE]` prefixes) to sequence animations. If you change backend log
  wording, grep `action-queue.js` for the phrase you're changing.
- **Multiplayer** is polling-based rooms (`MultiplayerService`, `/api/match/*`),
  not WebSockets. Lobby persistence falls back to in-memory when Firestore
  creds are absent (local dev).
- **Startup latency**: `/api/game/new` can take 10–30s cold because of
  Firestore catalog fetches; frontend uses `LOADOUT_ACTION_TIMEOUT_MS = 90000`.
  Don't "fix" slow starts by shrinking timeouts.
- **Card data precedence** (highest wins): Firestore dashboard overrides →
  `siegling-overrides.json` → generated catalogs. The dashboard round-trips
  SIEGLING/SPELL/TRAP cards *and* premade decks through
  `CardOverrideEditorService`. Old Firestore rows may omit `type` — id-prefix
  inference in `ManualSieglingCatalog.definitionType` handles that; keep it
  working.
- **Deck rules**: preset decks are 40 cards, 20/10/10 Siegling/spell/trap, max
  3 copies, full evolution lines only (`CardDefinitionServiceTest` enforces).
- **Board cap**: 5 Sieglings per side; evolutions are exempt from the cap and
  from the 1-placement-per-turn limit.
- The live editor API health check is `GET /api/cards/editor` returning
  `source: FIRESTORE`, `liveEditingEnabled: true` — `CLASSPATH_RESOURCE` on
  prod means a broken/stale deploy (see `CLAUDE_HANDOFF.md` recovery steps).

## Where to look for history/design intent

- `progress.md` — dated change log with verification evidence (newest near top).
- `CLAUDE_HANDOFF.md` — live-environment URLs, Firestore config, deploy
  verification checklist (its Windows paths/tooling are the owner's machine,
  not this environment).
- `docs/adventure-mode/` — Siege mode discovery/design/technical plans.
- `CARD_TUNING.md`, `ABILITY_EFFECT_KEYS.md` — card override JSON shape and
  effect-key registry.
