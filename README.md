# Siegelings TCG

A tactical elemental card game by **PartyChatGaming** — a Spring Boot backend
serving a hand-written static frontend, deployed as Firebase Hosting + Cloud Run.

Live: <https://siegelingstcgtesting.web.app>

---

## Table of contents

- [Game modes](#game-modes)
- [Core rules (Battle Table)](#core-rules-battle-table)
- [Supporting features](#supporting-features)
- [Tech stack](#tech-stack)
- [Running locally](#running-locally)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Card data pipeline](#card-data-pipeline)
- [REST API surface](#rest-api-surface)
- [Routing and deployment](#routing-and-deployment)
- [Conventions](#conventions)
- [Further documentation](#further-documentation)

---

## Game modes

| Mode | Route | Page | Engine |
|---|---|---|---|
| **Arena / Battle Table** | `/play` | `play.html` | `com.sieglings.service.*` |
| **Siege / Adventure Expedition** | `/siege` | `adventure.html` | `com.sieglings.adventure.*` |
| **Siege Battlegrounds** | `/siege` (mode select) | `adventure.html` | `com.sieglings.adventure.*` |
| **My Keep** | `/keep` | `keep.html` | `com.sieglings.keep.*` |

An in-app mode picker (`js/play-mode-picker.js`) routes players between Arena,
Siege, Siege Battlegrounds, and My Keep.

### Arena / Battle Table (`/play`)

The core 1v1 TCG — solo against the AI (`AIService`) or live against another
player through polling-based multiplayer rooms (`MultiplayerService`). Each
player owns a 3x3 board half, plays from a 40-card deck, and defends 50 direct HP.
A guided tutorial (`js/arena-tutorial.js`, `js/coach.js`) walks new players
through their first match.

### Siege / Adventure Expedition (`/siege`)

A single-player, Slay-the-Spire-style roguelike. Pick a SiegeKnight plus a
starter Siegeling warband, then walk a branching SVG map made of battles, elites,
rest camps, cache digs, a broker, a smith, a caravan, random events, minigames
(line puzzle, matching, RPS) and a boss. Battles are AP-based: drag a card out of
the hand fan onto the battlefield, then End Turn. Runs award gold, cards, items,
sigils and veteran progress.

**All Siege rules are server-authoritative** (`SiegeService`, `SiegeCombatEngine`,
`SiegeContentService`, `SiegeController`). `adventure.js` only renders state and
plays back presentation events. Run state is addressed by an opaque token stored
in `localStorage.siegeToken`, with checkpointing (`SiegeCheckpointStore`) and
multiple save slots.

### Siege Battlegrounds

A tiered endless/challenge ladder layered on the Siege engine: tier unlocks,
run-scoped boons, a between-round shop, and a leaderboard
(`/api/siege/battlegrounds/**`).

### My Keep (`/keep`)

A persistent base-building and collection home. Build and upgrade structures,
collect timed resources, craft, assign Siegeling residents (including the Enclave
and Akhar's Front), run enclave tasks, handle keep events and repairs, read lore
and branching dialogue, and theme/decorate the keep. Served by `KeepService` with
designer-facing tuning through `KeepTuningController`.

---

## Core rules (Battle Table)

**Sieglings have no printed ATK/DEF.** A creature card carries Health, Speed,
notches, and abilities; all damage comes from abilities.

### Notches, links and energy

Every Siegling has **notches** — directional colored dots on the card perimeter.
When two adjacent cards' notches point at each other, they form a **reciprocal
link** and generate **elemental energy**. Board-edge cells can instead anchor to
perimeter **sockets** (left column LEFT, right column RIGHT, outer row TOP/BOTTOM).
Energy pays for spells, traps and battle abilities. Handled by `EnergyService`
(links, sockets, combos) and `PlacementService` (legal cells, foundation network).

### Turn loop

1. **DRAW**
2. **SETUP** — place at most 1 Siegling, cast spells/traps, claim surviving
   Sieglings for temporary energy
3. **BATTLE** — every Siegling acts in Speed order, spending per-ability energy costs
4. Next round

### Other rules

- Players have **50 direct HP**. A defeated Siegling deals rarity-based *bounty*
  damage to its owner.
- **Board cap** is 5 Sieglings per side. Evolutions are exempt from the cap and
  from the 1-placement-per-turn limit, and are placed onto their live precursor.
- **SiegeKnights** (trainers) grant a passive plus an active/ultimate.
- **Deck rules**: 40 cards, 20 Siegling / 10 spell / 10 trap, max 3 copies, and
  full evolution lines only (enforced by `CardDefinitionServiceTest`).

### Elemental weakness chart

```
Fire > Ice > Wind > Earth > Fire
Water    > Fire, Ice
Metal    > Earth, Wind
Electric > Wind, Fire
Poison   > Ice, Earth
Shadow > Psychic > Light > Undead > Shadow
```

Ongoing elemental status effects are applied by `ElementalAfflictionService`
(toggled with `app.battle.elemental-afflictions-enabled`).

---

## Supporting features

| Feature | Route(s) | Backend |
|---|---|---|
| Landing page (3D FBX legendary viewer) | `/`, `/landing` | static |
| Hub | `/home` | — |
| Card collection / binder | `/cards` | `CardDefinitionService` |
| Deck manager and deck builder | `/decks`, `/deck-builder` | `SavedDeckService`, `PresetDeckCatalogService` |
| Gacha packs and shop | `/shop` | `PackCatalogService`, `PackAvailabilityCatalogService`, `ShopPriceCatalogService` |
| Card crafting and holographics | `/cards` | `/api/cards/craft`, `/api/cards/holographic` |
| Accounts, sessions, profiles | `/login`, `/profile` | `AccountService`, `AuthController`, `ProfileSettingsService`, `PublicProfileService` |
| Social — friends, DMs, presence, lobbies | `/social`, `/lobbies` | `SocialController`, `FriendRequestService`, `SocialMessagingService`, `PresenceService`, `LobbyPersistenceService` |
| Progression, knight XP, titles | `/profile` | `PlayerProgressionService`, `PlayerTitleService` |
| Daily missions | `/home` | `DailyMissionService`, `com.sieglings.mission` |
| Achievements | `/achievements` | `AchievementEvaluationService` |
| Leaderboards | `/home` | `LeaderboardService` (nightly cron refresh) |
| Match history | `/profile` | `MatchHistoryService` |
| Help / rules reference | `/help` | static |
| Live card dashboard (designers) | `/card-dashboard.html` | `CardEditorController`, `CardOverrideEditorService` |
| Offline shell / PWA | `offline.html` | `sw.js` service worker |

The service worker (`static/sw.js`) is network-first for HTML navigations,
cache-first for images, and stale-while-revalidate for other static assets, so a
deploy is picked up on the next online visit rather than being pinned to a stale
cache. Bump `CACHE_VERSION` to sweep all caches.

---

## Tech stack

**Backend**

- Java 21, Spring Boot 3.2.5 (`spring-boot-starter-web`), Maven Wrapper (`./mvnw`)
- `spring-security-crypto` for password hashing
- Google Cloud Firestore (project `siegelingstcgtesting`, database `siegedb`) for
  accounts, decks, progression, missions, social data, lobbies, match history and
  live card overrides
- Google Cloud Storage for card art and loading art
- Match/game state is **in-memory** and keyed per session; nothing about a live
  match is persisted

**Frontend**

- Hand-written static HTML/CSS/JS — **no framework, no bundler** — in
  `src/main/resources/static/`, served both by Spring Boot and Firebase Hosting
- Service worker + offline page (installable as an iOS/Android web app)

**Other directories**

- `functions/` — Firebase Functions (Node 22, Express) that serve
  `/api/cards/editor/**` for the live dashboard
- `mobile/` — TypeScript **API/domain contract types only** (there is no mobile app)
- `scripts/`, `tools/` — code generators and asset build helpers
- `.deploy-hosting/`, `output/` — build/verification artifacts; never edit game
  code there

---

## Running locally

Prerequisites: **Java 21+** ([Temurin](https://adoptium.net/) recommended).
Maven is not required — the repo ships the wrapper.

```bash
# Mac/Linux
./mvnw spring-boot:run

# Windows
mvnw.cmd spring-boot:run
```

Then open <http://localhost:8080>.

Local overrides (Firestore credentials, demo user seeding, etc.) go in
`application-local.properties` — copy `application-local.properties.example`.
Without Firestore credentials the app still boots and the card catalogs fall back
to the classpath baseline, and multiplayer lobbies fall back to in-memory rooms —
but the user-data stores (accounts, saved decks, progression, match history,
social) throw rather than degrading, so anything behind a login needs real
credentials even locally.

Frontend-only iteration can skip Spring Boot entirely:

```bash
cd src/main/resources/static && python3 -m http.server 8000
```

API calls will 404, but layout, CSS and client JS can still be exercised.

---

## Testing

```bash
./mvnw -q -DskipTests compile              # fast Java compile check
./mvnw -q test                             # full JUnit suite
./mvnw -q -Dtest=EnergyServiceTest test    # focused service test
node --check src/main/resources/static/js/game.js   # JS syntax gate
```

- `src/test/java/com/sieglings/service/` — rules engine tests (placement, energy,
  battle, effects, tutorial parity, catalogs, progression, missions, social)
- `src/test/java/com/sieglings/adventure/` — Siege engine tests (~45 specs
  covering combat, rewards, leveling, checkpoints, battlegrounds, items, events)
- `src/test/java/com/sieglings/keep/` — Keep service and tuning tests
- `src/test/java/com/sieglings/staticassets/` — Java tests that assert on the
  shipped frontend JS
- `tests/` — Playwright/Node/Python browser checks, including
  `tests/mobile-overlap/` (a text/button overlap guard at four phone viewports
  against `static/mobile-overlap-fixture.html`)

UI work should be verified in headless Chromium at both a phone viewport
(390x844) and desktop (1920x1080), asserting the behavior actually changed.

---

## Project structure

```
SiegelingTCG/
├── pom.xml, mvnw, mvnw.cmd        Maven build + wrapper
├── firebase.json                  Hosting config, page routes, /api rewrites
├── project.toml, Dockerfile       Cloud Run build config
├── functions/                     Firebase Functions (card editor API)
├── mobile/                        TypeScript API/domain contract types
├── scripts/, tools/               Generators and asset build helpers
├── docs/adventure-mode/           Siege discovery/design/technical plans
├── tests/                         Playwright + Node/Python browser checks
└── src/
    ├── main/java/com/sieglings/
    │   ├── SieglingsTcgApplication.java
    │   ├── model/                 Cards, notches, abilities, GameState, enums
    │   ├── service/               Battle Table rules engine + catalogs + social
    │   │   ├── GameService        Turn/phase orchestration
    │   │   ├── PlacementService   Legal cells, foundation network
    │   │   ├── EnergyService      Links, sockets, combos
    │   │   ├── BattleService      Speed order, ability resolution
    │   │   ├── EffectService      Effect-key resolver
    │   │   └── AIService          Solo opponent
    │   ├── adventure/             Siege engine (SiegeService, SiegeCombatEngine,
    │   │                          SiegeContentService, SiegeController, tuning)
    │   ├── keep/                  My Keep service, catalogs, tuning
    │   ├── mission/               Daily mission catalog and reward tracks
    │   ├── controller/            REST controllers
    │   ├── persistence/           entity/ (POJOs) + firestore/ (stores)
    │   ├── config/                CORS, session cookie auth filter, demo seed
    │   ├── diagnostics/, util/
    │   └── ...
    └── main/resources/
        ├── application.properties
        ├── cards/                 siegling-overrides.json, moves-pool.json,
        │                          live-elements.json
        └── static/
            ├── index.html / landing.html   Landing (3D FBX viewer)
            ├── home.html                   Hub (cards, decks, shop, social,
            │                               profile, achievements, deck builder)
            ├── play.html                   Battle Table
            ├── adventure.html              Siege / Battlegrounds
            ├── keep.html                   My Keep
            ├── help.html, offline.html
            ├── card-dashboard.html         Live card/deck editor
            ├── *-fixture.html              Test fixtures (not player-facing)
            ├── sw.js                       Service worker
            ├── css/                        style, home, adventure, keep,
            │                               landing, help, holographic,
            │                               card-dashboard, coach
            └── js/
                ├── game.js                 Battle Table client (~15k lines)
                ├── action-queue.js         State/log diffing → animations
                ├── fx.js                   Projectiles and particles
                ├── adventure.js            Siege renderer (ES5-flavored)
                ├── home.js, landing.js, keep.js, help.js
                ├── card-dashboard.js + *-admin.js  Designer tools
                ├── arena-tutorial.js, siege-tutorial.js, coach.js
                └── config.js, firebase-init.js, sounds.js, sw-register.js
```

**Legacy traps:** `static/game.js` and `static/style.css` at the static *root*
(not under `js/` / `css/`) are dead legacy copies. The active bundles are
`static/js/game.js` and `static/css/style.css`.

---

## Card data pipeline

Precedence, highest wins:

```
Firestore live overrides (card dashboard)
  ← resources/cards/siegling-overrides.json  (hand tuning)
    ← ManualSieglingCatalog
      ← GeneratedCreatureCatalog / GeneratedSpellCatalog  (baseline)
```

The dashboard at `/card-dashboard.html` round-trips SIEGLING/SPELL/TRAP cards and
premade decks through `CardOverrideEditorService` into
`appConfig/cardOverrides` in the `siegedb` Firestore database. Its health check is
`GET /api/cards/editor` returning `source: FIRESTORE` and `liveEditingEnabled: true`
— a response of `CLASSPATH_RESOURCE` in production means a broken or stale deploy.

All effects — creature abilities, spells, traps, trainer actives — resolve through
string **effect keys** listed in `ABILITY_EFFECT_KEYS.md` and
`model/AbilityEffectKeys.java`. A new mechanic means a new key in `EffectService`
plus registry, docs and a test, after which it is usable from JSON overrides and
the dashboard. Card JSON shape is documented in `CARD_TUNING.md`.

---

## REST API surface

| Prefix | Controller | Covers |
|---|---|---|
| `/api/game/**` | `GameController` | new match, draw, place, cast, claim, trainer, battle, battle action, end turn, mulligan, forfeit, state, placements, options, catalog version |
| `/api/match/**` | `SocialController` / `MultiplayerService` | multiplayer rooms: create, join, status, forfeit, close |
| `/api/siege/**` | `SiegeController` | runs, nodes, battles, rewards, camp/broker/smith/caravan/cache, events, minigames, items, knights, veterans, battlegrounds, admin content editing |
| `/api/keep/**` | `KeepController`, `KeepTuningController` | build, collect, craft, residents, decorations, dialogue, lore, events, themes, tuning |
| `/api/auth/**` | `AuthController` | register, login, logout, me, reset password, delete account |
| `/api/cards/**` | `CardEditorController` | live editor read/write, editor auth, crafting, holographics |
| `/api/social/**` | `SocialController` | presence, direct messages, public profiles |
| `/api/player/**`, `/api/knights/**`, `/api/missions/**`, `/api/leaderboards`, `/api/shop/**`, `/api/art/**` | progression, missions, leaderboards, shop, art | |

Every Battle Table action POSTs and returns the **full serialized `GameState`**.
The client renders from that snapshot, and `action-queue.js` sequences animations
by diffing consecutive states *and parsing battle log strings* (e.g.
`"X deals N damage to Y"`, `[Turn N PHASE]` prefixes). Changing backend log wording
without grepping `action-queue.js` will silently break animations.

Multiplayer is **polling-based**, not WebSockets. `/api/game/new` can take 10–30s
cold because of Firestore catalog fetches; the frontend allows
`LOADOUT_ACTION_TIMEOUT_MS = 90000` for this — do not "fix" slow starts by
shrinking timeouts.

---

## Routing and deployment

Firebase Hosting serves the static frontend and rewrites API traffic:

- `/api/cards/editor/**` → Firebase Function `api` (us-central1)
- `/api/**` → Cloud Run service `sieglings-tcg-api` (us-central1)
- page routes (`/play`, `/siege`, `/keep`, `/home`, `/cards`, `/decks`, `/profile`,
  `/shop`, `/social`, `/achievements`, `/deck-builder`, `/help`, `/landing`, …) →
  their HTML file

**New pages must be added to `firebase.json` rewrites**, or they will 404 in
production while working locally.

### Automated deployment

Pushing to `main` deploys both frontend and backend via
`.github/workflows/deploy.yml`. It can also be run manually from the **Actions**
tab → **Deploy** → **Run workflow**.

Required GitHub secrets:

| Secret | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON for the Hosting deploy |
| `GCP_SA_KEY` | GCP service account JSON with Cloud Run Admin, Artifact Registry Writer and Service Account User roles |

### Manual deployment

```bash
# Backend (Cloud Run)
./mvnw -q -DskipTests package
gcloud run deploy sieglings-tcg-api \
  --source . \
  --region us-central1 \
  --project siegelingstcgtesting \
  --env-vars-file env.yaml

# Frontend (Firebase Hosting) — run from the repo root so firebase.json applies
firebase deploy --only hosting --project siegelingstcgtesting
```

Live URLs:

- <https://siegelingstcgtesting.web.app>
- <https://siegelingstcgtesting.firebaseapp.com>

---

## Conventions

1. **Cache-busting** — every CSS/JS include carries `?v=N`. After editing a static
   asset, bump its `?v=` in *every* HTML page that includes it (`game.js` is loaded
   by both `play.html` and `home.html`). Skipping this ships stale code to
   returning browsers.
2. **Mobile-first** — most players are on phones. Battle screens are
   single-viewport `100dvh` flex columns with `overflow: hidden`; the page never
   scrolls, only designated inner regions do. `touch-action: pan-x pan-y` on
   `html`/`body` deliberately blocks pinch/double-tap zoom (a stray zoom
   permanently clips the fixed layout) — do not remove it, and do not reintroduce
   `user-scalable=no`. The meta viewport stays
   `width=device-width, initial-scale=1, viewport-fit=cover`; use
   `env(safe-area-inset-*)` for notches.
3. **Adventure screen states** — `adventure.js` sets `document.body.dataset.screen`
   and `adventure.css` keys layout off `body[data-screen="battleScreen"]`. Battle
   and map screens are flex columns where exactly one child gets
   `flex: 1 1 auto; min-height: 0`; break that and the bottom HUD drifts.
4. **Element palette** — use the CSS variables in `style.css` `:root` (`--fire`,
   `--water`, … `--light`, `--neutral`). `adventure.css` and `card-dashboard.css`
   mirror the same hex values; never invent a second palette.
5. **Frontend/backend rule parity** — the frontend precomputes legal placements,
   energy and targeting highlights that the backend independently enforces. A rules
   change must land on both sides (e.g. `PlacementService` *and* the `game.js`
   placement preview) or the highlights will lie to the player.
6. **`progress.md`** — append a dated entry for every substantive change: one
   paragraph on what changed, one on how it was verified. Read its recent entries
   before starting large work.
7. **Comment style** — comments explain *why* and what the constraints are, not
   what the next line does. `adventure.js` is ES5-flavored (`var`, IIFE);
   `game.js` is mixed-modern. Match the file you are in.

---

## Further documentation

| File | Contents |
|---|---|
| `CLAUDE.md` | Agent-facing orientation and workflow rules |
| `progress.md` | Dated change log with verification evidence |
| `CLAUDE_HANDOFF.md` | Live environment URLs, Firestore config, deploy verification checklist |
| `ABILITY_EFFECT_KEYS.md` | Effect-key registry |
| `CARD_TUNING.md` | Card override JSON shape and tuning workflow |
| `FIREBASE_FUNCTIONS_MIGRATION.md` | Card editor API migration notes |
| `docs/adventure-mode/` | Siege mode discovery, design and technical plans |
| `.claude/skills/` | Task recipes: `ui-change`, `game-rules`, `card-tuning`, `siege-adventure`, `deploy-verify` |
