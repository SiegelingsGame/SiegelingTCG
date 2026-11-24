# Campaign Mode: Rally of the Realms

Sellable single-player story: start as a **Squire**, pick one of four starters, travel the twelve elemental Lands in a **2.5D cutout overworld**, capture wild Siegelings in **Siege AP** fights, duel trainers and realm SiegeKnights on the **Arena Battle Table**, rally each kingdom, then face **Raidlord Akhar**.

## Fantasy

Raidlord Akhar threatens the Sanctuary Charter (Keep lore). You begin as Squire Bob’s peer — a Squire with one partner Siegeling — and earn your spurs by rallying every elemental realm to the final coalition.

## New game

| Element | Starter | Home Land | Evolution line |
|---|---|---|---|
| Fire | Sundile | Emberfall | Sundile → Raydile → Solgator |
| Earth | Cacty | Rootwild | Cacty → Jacked'ty → CactyJackedty |
| Ice | Fawny | Frostveil | Fawny → Chilldoe → Frostag |
| Wind | Breezee | Zephyr Reach | Breezee → Gagglestand → Hurricrane |

- Trainer identity: `squire-bob` (SiegeSquire).
- Roster seeds with the chosen starter; Arena preset opens at **N = 1**.
- First recommended Land matches the starter’s element.

## Dual combat

| Encounter | Engine | Notes |
|---|---|---|
| Wild / capture | `SiegeCombatEngine` via `/api/campaign/wild/**` | Recruit on win |
| Rival trainer / realm knight / Akhar | Battle Table via `GameService.newCampaignGame` → `/play?campaign=1` | Preset warbands |

## Arena skirmish rules

- Party size **N ∈ {1…5}**; both presets **pre-placed**.
- SETUP: Strategies (spells), Deceptions (traps), knight abilities.
- BATTLE: core Speed / energy / ability loop.
- **Primary win**: wipe the enemy warboard (all N destroyed).
- HP: **50** for official realm knights and Akhar; reduced (default 25) for road trainers.
- Deck for skirmishes: Strategies + Deceptions only (Siegelings start on the board).

## Zone loop

1. World map → enter Land (2.5D cutout scene on Land art).
2. Wild captures grow the roster / Arena preset.
3. Rival trainers (Arena, small N, reduced HP).
4. Realm SiegeKnight (Arena, N=5, 50 HP) → **Rally** that Land.
5. After enough rallies, **Akhar** unlocks (N=5, 50 HP, coalition modifiers).

## Presentation

Land backgrounds from `img/lands/{element}.webp`. Characters are OVERLAY cutouts / `SiegeSprites` paper standees (Keep / hub cutout pattern), Y-sorted for 2.5D depth. Not Swarm 3D.

## API (token `X-Campaign-Token`)

- `GET /api/campaign/options` — starters, resume token
- `POST /api/campaign/start` — `{ starterId }`
- `GET /api/campaign/run`
- `POST /api/campaign/enter-land` — `{ landId }`
- `POST /api/campaign/preset` — `{ cardIds: [] }`
- `POST /api/campaign/wild/start` | `play` | `end-turn` | `finish`
- `POST /api/campaign/arena/start` — `{ kind: rival|knight|akhar }` → `{ soloToken }`
- `POST /api/campaign/settle` — after Arena returns
- `POST /api/campaign/abandon`

## Content checklist

- [x] Four starters + Squire
- [x] Twelve Lands (SiegeLand ids)
- [x] Poison + Light SiegeKnights; activate POISON/LIGHT in live-elements
- [x] Raidlord Akhar finale + rally modifiers
- [x] Named realm NPCs: Lady Pyla (Fire), Ser Airek (Wind), Glacia (Ice) — Sanctuary walkabouts + home-realm duels
- [ ] Full rival trainer scripts per Land (starter set ships)
- [ ] Polished story VO / cutscenes
