# Siegelings Roguelike Adventure Mode — Phase 1: Architecture Discovery Report

> Deliverables 1, 2, 5 (partial): Architecture discovery report, existing systems audit, reusable systems.
> Companion documents: `02-design-proposal.md` (Phase 2 design), `03-technical-plan.md` (architecture proposal, milestones, risks).
> **No implementation code has been written.** This report is the discovery output for review/approval.

---

## 1. Project Overview

| Layer | Technology | Location |
|---|---|---|
| Backend | Spring Boot 3 (Java 21), Maven wrapper | `src/main/java/com/sieglings` |
| Web frontend | Static HTML/CSS/vanilla JS (no framework, no bundler) | `src/main/resources/static` |
| Mobile contracts | TypeScript type/contract package + Vite React shell | `mobile/src`, `mobile/web-app` |
| User data persistence | Firestore (project `siegelingstcgtesting`, db `siegedb`) via per-domain stores | `src/main/java/com/sieglings/persistence/firestore` |
| Legacy/local persistence | File-backed H2 + JPA (`jdbc:h2:file:./data/sieglings`) | documented in `mobile/src/persistence.ts` |
| Live game-content config | Firestore `appConfig` collection (docs: `cardOverrides`, `liveElements`, `trainerCards`, `presetDecks`) | `CardOverrideStorageService`, `LiveElementCatalogService`, etc. |
| Hosting | Firebase Hosting (frontend) + Cloud Run (API), `/api/**` rewritten to Cloud Run | `firebase.json`, `.github/workflows/deploy.yml` |
| Cloud functions | Firebase functions folder (migration in progress per `FIREBASE_FUNCTIONS_MIGRATION.md`) | `functions/` |

The game is **server-authoritative**: all rules run in Java services; the JS clients render state
returned by REST endpoints and submit actions. This is the single most important architectural fact
for Adventure Mode — *run logic must live on the backend*, with the frontend as a renderer, exactly
like the existing match flow.

### Package layout (backend)

```
com.sieglings
├── SieglingsTcgApplication.java
├── config/          SessionCookieAuthFilter, SessionCookieService, WebConfig, DemoUserSeedConfig
├── controller/      GameController, PlayerProgressionController, AuthController, SocialController,
│                    DailyMissionController, LeaderboardController, CardEditorController, ArtGalleryController
├── service/         GameService, BattleService, EffectService, EnergyService, PlacementService,
│                    AIService, CardDefinitionService, PackCatalogService, PlayerProgressionService,
│                    DailyMissionService, AchievementEvaluationService, LeaderboardService,
│                    MultiplayerService, MatchHistoryService, SavedDeckService, MovesPoolService,
│                    catalog services (Generated*, Manual*, Preset*, Trainer*, LiveElement*), …
├── model/           GameState, Player, Board, BoardSpace, Card, SieglingCard, SpellCard, TrapCard,
│                    TrainerCard, CardInstance, Ability, AbilityEffectKeys, Move, Notch, Effect
├── model/enums/     Phase, Element, Rarity, Row, StatusEffect, TargetType, CardType, Reaction,
│                    NotchDirection, MoveCategory
├── mission/         DailyMissionCatalog, DailyMissionType, DailyMissionDefinition
├── persistence/
│   ├── entity/      PlayerProgressionEntity, AccountUser, AuthSession, SavedDeckEntity,
│   │                MatchHistoryEntity, DailyMissionProgressEntity, Lobby/Social entities
│   └── firestore/   FirestoreUserDataClient + one Store class per entity
└── util/            FirestorePayloadSanitizer
```

### Frontend layout

```
static/
├── landing.html + js/landing.js           marketing/auth entry
├── home.html    + js/home.js  (~8.9k LOC) hub SPA: 9 hidden <section> panels toggled by nav
├── play.html    + js/game.js  (~15k LOC)  match client SPA: overlays for every match stage
├── index.html                              legacy prototype entry (serves game.js too)
├── js/  action-queue.js (playback animation queue), fx.js (canvas particle FX),
│        sounds.js (procedural WebAudio), achievements.js, catalog-sync.js,
│        loading-gate.js, config.js, firebase-init.js, home.js, landing.js
├── css/ style.css (match), home.css (hub), landing.css, holographic.css
└── img/ elements/ frames/ knights/ decks/ packs/ legendary/ notches/ ui/ art/loading/
```

---

## 2. System-by-System Audit

Legend — **Reuse**: usable as-is · **Extend**: needs additive changes · **Untouched**: do not modify.

### 2.1 State management

**What exists.** `GameState` is a plain mutable POJO holding both players, two 3×3
`CardInstance[][]` boards, phase, turn/round counters, battle queue + cursor, mulligan flags, and a
text `gameLog`. Solo matches live in `GameService.soloGames` — an in-memory
`ConcurrentHashMap<token, SoloSession>` with a 6-hour TTL; the client stores the opaque token
(localStorage) and echoes it on every call. Multiplayer rooms live in `MultiplayerService` the same
way. **GameState is never persisted** — a server restart drops all live matches.

- **Reuse:** the token-scoped in-memory session pattern is exactly right for "the battle currently
  being played" inside a run.
- **Extend:** Adventure needs a second, *durable* layer above it: the run state (map, position,
  deck, relics, HP) must be persisted to Firestore between nodes so a run survives restarts/devices.
- **Untouched:** `GameState` internals, phase machine, battle queue.

### 2.2 Scene / screen management

**What exists.** Navigation is multi-page: `landing.html` → `home.html` (hub) → `play.html`
(match). Inside each page, screens are `<section>`/overlay `<div>`s toggled with a `hidden` class;
`play.html` runs a welcome overlay → 4-step loadout wizard (`setup → deck → knight → review`) →
coin-flip overlay → match → `gameOverOverlay`. There is no router; state drives visibility.
`mobile/src/gameFlow.ts` documents the canonical client flow.

- **Reuse:** overlay pattern, loadout wizard structure (perfect template for run setup), phase
  banners, toasts, `loading-gate.js` art loading screens.
- **Extend:** one new hub section (`adventureSection`) and one new page or major overlay for the
  run map; `play.html` needs a "launched from adventure" entry mode (query param / session token).

### 2.3 Save system

**What exists.** Session-cookie auth (`SessionCookieAuthFilter` → `AuthSessionStore`). Each user
domain has a Firestore store class wrapping `FirestoreUserDataClient` (which owns collection names
and credentials): `PlayerProgressionStore`, `SavedDeckStore`, `MatchHistoryStore`,
`DailyMissionProgressStore`, `ProfileSettingsStore`, plus social stores. Entities are plain POJOs
serialized to Firestore maps; stores do `findByUserId`/`save` and defensive copying.

- **Reuse:** the whole store pattern; auth filter; idempotency style (`rewardedMatchIds`,
  `completedPackOpenRequestIds` guards against double-grants).
- **Extend:** add `AdventureRunStore` (active run doc per user) + adventure meta fields (see §4).
- **Untouched:** existing stores and collections.

### 2.4 Battle system

**What exists.** `GameService` orchestrates the round loop:
`MULLIGAN → [DRAW → SETUP] ×2 players → BATTLE → next round`, ending when a player's health
(start 50) reaches 0. `BattleService` builds a speed-ordered queue of all board Sieglings,
auto-resolves AI actors, and pauses (`pendingBattleInstanceId`) for human actors to pick an ability
+ target. Defeated Sieglings deal rarity-based "bounty" damage to their owner's player HP.
`EffectService` resolves ~18 data-keyed ability effects (`AbilityEffectKeys`); `EnergyService`
computes energy from notch links + perimeter sockets; `PlacementService` enforces the notch-adjacency
placement grammar; `MovesPoolService` loads moves from `resources/cards/moves-pool.json`.

- **Reuse:** *the entire battle engine, unmodified*. An adventure battle is just a solo `GameState`.
- **Extend:** `GameService.StartOptions` needs adventure-specific inputs: explicit enemy deck/trainer
  (instead of random), starting-HP overrides, run-modifier hooks (relics), and a seeded RNG.
- **Untouched:** combat resolution, placement, energy math.

### 2.5 Card / deck / Siegeling systems

**What exists.** `Card` hierarchy: `SieglingCard` (element, stats, notches, moves, evolution lines
via `evolvesFromId`), `SpellCard`, `TrapCard`, `TrainerCard` ("SiegeKnight": passive + active
ability, tier, level 1–5 with ability-value bonuses). `CardDefinitionService` composes the catalog
from generated per-element catalogs (10+ elements; `Element` enum has 13 incl. POISON/LIGHT/NEUTRAL),
`ManualSieglingCatalog`, and **live Firestore overrides** (card dashboard editor at
`card-dashboard.html` writes `appConfig/cardOverrides`). Preset decks come from
`PresetDeckCatalogService` (Firestore `presetDecks`), trainers from `TrainerCatalogService`.
Custom decks are validated against collection ownership (`min size`, `max 3 copies`, own ≥30 cards).

- **Reuse:** everything — the catalog is already data-driven and live-editable, which is the ideal
  substrate for adventure content (enemy decks, reward pools) to also be data-driven.
- **Extend:** none required for core; evolution cards (`isEvolutionCard`, `evolvesFromId`) give a
  free hook for Evolution Shrine nodes.
- **Untouched:** catalog composition and override plumbing.

### 2.6 Ability system

**What exists.** `Ability` is data (name, effect type key, value, target type, element costs);
`AbilityEffectKeys` defines 18 string keys resolved in `EffectService`. Status effects: `FREEZE`,
`SPEED_ZERO`, `HEALTH_BOOST` (shield), `DAMAGE_BOOST`, `SPEED_BOOST`. Trainer passives are
recomputed each state change (`recalculateTrainerPassiveStatBuffs`) — a proven pattern for
"continuous aura" effects.

- **Reuse:** effect-key resolution; the trainer-passive recompute pattern is the blueprint for the
  **relic system** (relics = run-scoped passives recomputed the same way).
- **Extend:** a handful of new effect keys if relic designs need them (e.g. cost reduction).

### 2.7 Currency systems

**What exists.** Two persistent currencies on `PlayerProgressionEntity`: **Siegecoins** (`gold`) —
earned from wins (10 solo / 5 online + 2×streak), tutorial (250), missions; spent on packs, premade
decks, daily offers, knight XP, titles. **Remnants** — earned from pack opens (40), duplicates-at-cap,
wins (20/30); spent on crafting (500–8000 by rarity) and holographic finishes (4× craft).

- **Reuse:** both as *meta* rewards paid out at run end.
- **Extend:** Adventure needs a third, **run-scoped** currency (proposal: **Supplies**) that lives
  inside the run document and is discarded when the run ends — it must not touch
  `PlayerProgressionEntity` (see design doc §5).
- **Untouched:** gold/remnant grant paths.

### 2.8 Reward systems

**What exists.** Match rewards are granted server-side and idempotently (`awardMatchGold` guarded by
`rewardedMatchIds`); the game-over payload (`endScreen`) carries `goldEarned/remnantsEarned/
streakBonus/guestPreview` for the UI. Pack opening (`PackCatalogService.openPack`) returns cards +
holo drops + occasional bonus trainer, recorded in `packHistory` and revealed by the shop UI —
a complete, polished **card-reveal ceremony** that Adventure card rewards can reuse. Daily missions
(8 counter types), achievements/titles (`AchievementEvaluationService`, `achievement-titles.json`),
and cron-refreshed leaderboards (`LeaderboardService`, `app.leaderboard.refresh-cron`) round out the
meta loop.

- **Reuse:** idempotent grant pattern, endScreen contract, pack-reveal UI, mission/achievement hooks.
- **Extend:** new mission types (e.g. `ADVENTURE_NODES_CLEARED`), achievement conditions, a
  leaderboard board for seeded runs.

### 2.9 AI / enemy generation

**What exists.** Solo enemies are generated by `GameService.resolveSoloEnemyLoadout`: pick a random
preset deck ≠ player's deck, pick a random trainer matching its elements. `AIService.executeAITurn`
is a single-difficulty heuristic (place best Sieglings, cast affordable spells, spring traps);
`BattleService.pickAiAbility` picks battle actions. There is **no difficulty scaling, no scripted
encounters, no seeded RNG** (all `new Random()`/`SecureRandom`, unseeded).

- **Reuse:** AIService as the baseline difficulty.
- **Extend:** encounter definitions (fixed decks + modifiers per node), difficulty knobs
  (AI aggression tiers, stat/energy handicaps), and **seedable randomness** end-to-end. This is the
  largest genuine gap discovered (see risks in `03-technical-plan.md`).

### 2.10 UI framework, navigation, asset loading, serialization

- **UI:** hand-rolled DOM + CSS; `action-queue.js` sequences server-diff playback (projectiles, HP
  holds, move animation); `fx.js` renders element-themed particles; `sounds.js` synthesizes audio —
  all reusable for map/reward feedback with zero new dependencies.
- **Asset loading:** static files with `?v=N` cache-busting; loading screens use uploadable art
  (`ArtGalleryController` + `LoadingArtStorageService`, `img/art/loading`). A service worker
  (`sw.js`) provides offline shell.
- **Serialization:** controllers hand-build `Map<String,Object>` DTOs (e.g.
  `PlayerProgressionService.serialize`); Firestore stores map POJOs ↔ documents with sanitization
  (`FirestorePayloadSanitizer`). Adventure should follow the same style, not introduce a new one.

---

## 3. Existing Battle Flow (documented end-to-end)

1. **How battles begin.** Client POSTs `/api/game/new` with `StartOptions` (deckId or custom card
   list, trainerId, loadout label; trainer level is injected server-side from progression).
   `GameService.newSoloGame` builds a `GameState`, issues a solo token, and returns both.
2. **How teams are generated.** `resolveLoadout` builds the player deck via
   `CardDefinitionService` (preset by id, or validated custom list) and resolves the SiegeKnight
   (requested → deck-recommended → element fallback), applying the knight's level bonus to ability
   values.
3. **How enemies are created.** `resolveSoloEnemyLoadout` — random preset deck excluding the
   player's, random element-matching trainer. Purely random; no curation.
4. **How decks are loaded / cards drawn.** Both decks are shuffled (`Collections.shuffle`,
   unseeded), opening draws are biased (`biasOpeningDraw` seeds 2 basic Sieglings + 1 cheap support
   into the top), 5 cards dealt, one optional mulligan per side (AI auto-resolves). Each turn's DRAW
   phase draws 1 card via `Player.drawCard()`.
5. **How Siegelings are spawned.** SETUP phase placements through `PlacementService` (first card
   back row; then notch-adjacency; per-turn action budget = 1 + energy captured at setup start;
   evolution placements stack onto the base card after it has survived a battle phase).
6. **How battle resolves.** After both setup turns, `BattleService.initializeBattle` sorts all
   board Sieglings by effective speed into `battleQueue`; `advanceBattle` walks it, pausing per
   action for playback (`battleActionPausePending`) and for human input
   (`pendingBattleInstanceId`); `/api/game/battle/action` submits the choice.
7. **How victory/defeat is handled.** `checkWinCondition` fires whenever HP can change; on game
   over `MatchHistoryService.recordCompletedGame` writes a `MatchHistoryEntity`, which triggers
   `PlayerProgressionService.awardMatchGold` (gold + remnants + streak, idempotent) and daily-mission
   recording. The client renders `gameOverOverlay` from the `endScreen` payload. Defeat = same path
   with zero rewards and streak reset. Forfeit is explicit (`/api/game/forfeit`, `endReason=FORFEIT`).
8. **How rewards are granted.** Only currency + mission/achievement/leaderboard side effects —
   **no card rewards from battles today** (cards come from shop packs/crafting). Adventure's
   card-reward nodes are new behavior, but the pack-grant machinery (`grantCardsWithCap`,
   duplicate→remnants) already implements the hard parts.

---

## 4. Existing Save Data & Where Adventure Data Should Live

**Current save structure** (Firestore, keyed by userId):

| Store / doc | Contents |
|---|---|
| `PlayerProgressionStore` | gold, remnants, `ownedCards{id→count}`, `trainerLevels/Points`, starterPackId, tutorialCompleted, rewardedMatchIds, purchasedDeckIds/DailyOfferIds/TitleIds, packHistory, solo/online win streaks, craftCount, holographicCardIds |
| `SavedDeckStore` | named custom deck lists |
| `MatchHistoryStore` | per-match records (type, result, stats) |
| `DailyMissionProgressStore` | per-day counters for 8 `DailyMissionType`s |
| `ProfileSettingsStore` | persistent settings/profile |
| `AccountUserStore` / `AuthSessionStore` | account + session cookie auth |
| Social stores | friends, DMs, presence, lobbies |
| `appConfig/*` docs | live card/element/trainer/deck catalogs (content, not user data) |

**Recommendation.**

1. **`adventureRuns` collection** (new store: `AdventureRunStore`) — one *active run document* per
   user: seed, difficulty, map graph, current node, run deck, roster, SiegeKnight, relics, supplies,
   run HP, event flags, floor, RNG stream cursors. Deleted/archived on run end. Keeping it separate
   means Adventure Mode can be disabled without touching any existing document shape.
2. **Adventure meta-progression** — either new fields on `PlayerProgressionEntity`
   (`adventureUnlocks`, `bestAscension`, `adventureStats`) or, cleaner, a sibling
   `adventureProfiles` collection. Recommend the **separate collection** for the same isolation
   reason; only *currency payouts* at run end touch `PlayerProgressionEntity`, through the existing
   idempotent grant path.
3. **Run content definitions** (node tables, encounter decks, relics, events) — classpath JSON under
   `resources/adventure/` first, with the option to later mirror the `appConfig` Firestore-override
   pattern so designers can live-tune like they already do for cards.

---

## 5. UI Audit — screen inventory & reuse map

| Screen | Where | Reuse for Adventure |
|---|---|---|
| Main menu / hub | `home.html` `homeSection` + nav | Add "Adventure" nav entry + `adventureSection` (run status / continue / new run) |
| Deck builder | `deckBuilderSection` (+ builder mode in play.html loadout) | Read-only variant = run deck viewer; filter grid = card-choice UI |
| Collection / binder | `cardsSection`, `card-binder-visual.js` | Card grids for draft/reward/remove/duplicate pickers |
| Shop | `shopSection` (packs, daily offers, `packResult` reveal) | Merchant node UI; pack-reveal ceremony for card rewards |
| Battle | `play.html` arena + HUD + battle panels | Unchanged; needs adventure entry/exit wiring only |
| Loadout wizard | `loadoutOverlay` steps setup/deck/knight/review | Template for run setup (starter/difficulty/seed) |
| Victory/defeat | `gameOverOverlay` (result, stats, rewards) | Extend with "Continue run" CTA + node-reward summary |
| Settings | `optionsModal` (home) + options button | Untouched |
| Achievements/Profile | `achievementsSection`, `profileSection` | Surface run stats/unlocks |
| Reward toasts/FX | toasts, `fx.js`, `sounds.js`, phase banners | Node-clear and relic-pickup feedback |
| Loading screens | `loadingArtScreen` + uploadable art | Biome transition screens |

**Missing entirely (net-new UI):** node-map screen (graph render + travel), event dialog
(narrative + choices), relic tray/inventory, rest-camp screen, run-summary screen.

---

## 6. Asset Audit

| Asset class | Exists? | Location / note |
|---|---|---|
| Element icons + colors | ✅ | `img/elements`, `Element.color()` — node types can color-code by element |
| Card frames / backs | ✅ | `img/frames`, `img/decks`, `img/packs` |
| SiegeKnight full cards | ✅ | `img/knights` |
| Pack art + reveal FX | ✅ | `img/packs`, shop reveal, `holographic.css` |
| Loading/backdrop art | ✅ | `img/art/loading` (admin-uploadable via `/api/art/loading`) |
| Particle/impact FX | ✅ | `fx.js` (element-themed projectiles, orbs, bolts) |
| Sounds | ✅ | `sounds.js` procedural synth (no audio files) |
| Popup/modal system | ✅ | Consistent overlay+modal CSS across both pages |
| Battle transitions | ✅ | `phaseTransitionBanner`, coin-flip overlay, action-queue playback |
| **Map/node icons** | ❌ | Net-new (can bootstrap with inline SVG + element palette, like existing nav icons) |
| **Biome backgrounds** | ❌ | Net-new (loading-art upload pipeline can serve as delivery mechanism) |
| **Relic icons** | ❌ | Net-new |
| **Event illustrations** | ❌ | Net-new (text-first events can ship without art) |

---

## 7. Key Findings Summary

1. **The battle engine needs zero changes to be an adventure encounter** — solo matches are already
   isolated, token-scoped `GameState`s with an AI side whose deck/trainer are injectable at start.
   The only seam to open is `StartOptions` (explicit enemy loadout + modifiers + seed).
2. **All persistence and reward plumbing already has the right shape**: per-domain Firestore stores,
   idempotent grants, serialized DTO maps. Adventure adds stores, it doesn't reshape anything.
3. **Content is already data-driven and live-editable** (Firestore `appConfig` overrides + card
   dashboard). Adventure content (nodes/encounters/relics/events) should follow that precedent.
4. **The biggest genuine gaps** are: (a) no seeded/deterministic RNG anywhere, (b) no run-scoped
   state layer, (c) no map/graph UI, (d) single-difficulty AI. These are exactly the four systems
   the technical plan builds first.
5. **Frontend risk concentration**: `game.js` (~15k lines) and `home.js` (~8.9k lines) are large
   single-file scripts. Adventure UI should be a *new* `adventure.js` (own page section/screen)
   that talks to the same config/auth helpers, not more code inside those files.
