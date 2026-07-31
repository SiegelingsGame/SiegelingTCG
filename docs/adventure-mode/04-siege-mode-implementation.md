# Siege Mode — Implemented v1 (Party + Action-Point Roguelike)

> This documents what was actually **built** under the existing "Siege" button, per the
> combat direction given after the discovery phase. The combat model here intentionally
> **differs** from the notch-board proposal in `02-design-proposal.md`: Siege is a
> party-based, action-point, initiative combat roguelike (closer to Chaos Zero Nightmare)
> rather than a run wrapper around the base Queen's-Blood board.

## Entry point

- The **Siege** button on `/play` now links to **`/siege`** (was a "coming soon" toast).
- `/siege` serves `adventure.html` (`WebConfig` view controller).
- Guests can play; a run is held in memory server-side and addressed by an opaque
  `token` stored in `localStorage` (`siegeToken`), mirroring the base solo-game pattern.

## Combat model (v1)

- **Warband** = 1 SiegeKnight + 3 Siegelings.
- **Deck** is built from the party's moves: each Siegeling's non-passive moves each become
  a card (2 copies), plus one card for the SiegeKnight's active ability. So a Sundile
  contributes a card per move, exactly as specified.
- **Card action value:** derived from the move's energy cost — 0–1 energy → 1 action,
  2–3 → 2 actions, 4+ → 3 actions.
- **Turns:** every combatant (your 3 Siegelings + each enemy) accrues initiative from its
  **speed** on a shared timeline and acts when it crosses the threshold — a unit twice as
  fast acts about twice as often, and each enemy runs on its own clock. When a Siegeling
  becomes ready, the **whole party takes one turn with a shared pool of 3 action points**;
  you play cards (each costs its action value), then the enemies act on their clocks.
- **Cards are tied to their Siegeling:** a card is only playable while its owning Siegeling
  is alive; that Siegeling is the attacker for damage/buff math. The knight card is led by
  the strongest living ally.
- **Enemies have no deck** — 1–3 abilities scaled by node rank/floor (basic foes 1, elites
  2, bosses 3), chosen by a simple AI (heal when badly hurt, else the strongest damaging
  option, focus-firing the lowest-HP Siegeling).
- **Effects:** damage (through shield first), heal, shield, +attack, +speed, and slow
  (delays the target's next turn). Element weakness gives ±30% damage using the game's
  weakness chart.

## Run structure

- Team-select screen → a fixed 7-node expedition:
  `Skirmish → Skirmish → Cache → Elite → Rest → Skirmish → Siegelord (boss)`.
- Party HP **persists between battles**; Rest heals 40%, Cache grants +4 max HP, a win
  grants a small heal. Losing a battle ends the run; defeating the Siegelord wins it.
- Difficulty is data-tuned in `SiegeContentService` (HP/damage multipliers, ability counts,
  enemy scaling by floor). A thoughtful human should win a meaningful fraction of runs; a
  naive "hit the first card" strategy usually dies at the elite/boss.

## Code map (all under `com.sieglings.adventure`, isolated from base gameplay)

| File | Role |
|---|---|
| `SiegeController` | REST under `/api/siege/**` (roster, run/new, state, node/enter, battle/play, battle/end-turn, continue) |
| `SiegeService` | Session store + orchestration + JSON serialization |
| `SiegeCombatEngine` | Initiative timeline, 3-action player turns, card resolution, enemy AI |
| `SiegeContentService` | Roster from the card catalog, move→card mapping, enemy/map generation, weakness chart |
| `SiegeRun` / `SiegeBattle` / `Combatant` / `SiegeCard` / `SiegeNode` / `AbilitySpec` / `SiegeEnums` | State + value types |
| `static/adventure.html`, `js/adventure.js`, `css/adventure.css` | Team select, map, battle UI (hand, action points, initiative order, targeting), results |

## Reused existing systems

- `CardDefinitionService.getDeckBuilderCatalog()` / `getTrainerOptions()` for the roster.
- `MovesPoolService.getMove()` for move definitions (source of card abilities).
- The same `Element` set / weakness relationships used elsewhere in the game.

Combat runs entirely in a new module with **one touch** to shared code (the `/siege`
route in `WebConfig` and the Siege button link in `play.html`) — standard Battle mode is
untouched, so Siege can be removed by reverting this package and those two lines.

## v2 — Adventure vertical slice (branching map, rewards, battle stage)

The second milestone upgraded the mode into the full prototype loop:

- **Branching DAG map** (Slay-the-Spire style): 8 rows, 2–4 nodes per row,
  non-crossing forward edges, guaranteed rest row before the Siegelord. Travel is
  by node choice (`/api/siege/node/enter` takes a `nodeId`, validated against the
  current node's edges). Rendered client-side as a scrollable SVG with walked /
  open path highlighting.
- **Post-battle rewards** (`/api/siege/reward/choose`): every non-boss battle win
  offers a choice — two new cards (drawn from the full moves pool, bound to a
  living Siegeling), plus an upgrade of an existing deck card; elite wins offer a
  **recruit** (a new Siegeling joins the warband, up to 4) instead of the upgrade.
  Skipping is allowed.
- **Battle stage presentation**: the overlay card-art cutouts now stand on a
  perspective battlefield as character sprites (idle bob, hit shake, floating
  damage/heal numbers, defeat pose), with name-plates carrying HP/shield/buff.
  The hand is a fanned card arc at the bottom of the screen.

## v3 — Battle rules spec (rounds, statuses, the Knight, telegraphs)

The third milestone replaced the ATB timeline with the designed battle rules and
made enemy turns watchable:

- **Team Speed rounds**: each round sums the Speeds of the living active
  Siegelings vs the enemy team; the faster side acts first (recomputed every
  round, ties are a coin flip). The round/speed readout sits above the stage.
- **Elements = status effects only** (the weakness chart is gone; damage is
  exactly the number written on the card, plus explicit attack buffs):
  Fire → **Burn** (1 damage end of each round), Ice → **Slow** (−2 Speed for
  2 rounds), Earth → **Stun** (skip next action), Sky (Wind/Electric) →
  **Shock** (−1 AP next turn / weakened enemy blow). Application chances are
  written on each card (20–40% by AP cost); enemies apply theirs at 20%.
- **5 shared AP per turn**; 0-AP cards exist. **Hand**: opening 6 with
  guarantees (1 Knight card + 1 card from each active Siegeling), draw 1 per
  turn, max 8, unplayed cards persist; internal decks are permanent (discard
  reshuffles back in).
- **The SiegeKnight fights**: a 40-HP unit behind the line. A Siegeling KO
  wounds it for 5; with no Siegelings left enemies strike it directly; the
  battle is lost when the Knight falls. **Knight Ultimate** (not a card, 0 AP,
  20 Charge): +1 Charge per turn, +1 per Knight card played, +1 per unused AP;
  fires a heavy elemental sweep with a guaranteed status.
- **Positions & telegraphs**: Siegelings stand on numbered notches. Enemies
  pre-declare next round's ability *and targeted notch* (intent chips over each
  enemy; red target rings on threatened notches; sweep warnings). The blow
  resolves against whoever stands there — `move_link` ("move to a new notch")
  cards swap two Siegelings, so tanks can eat telegraphed hits (a vacated notch
  makes the attack whiff).
- **Watchable battles**: the server streams presentation events (card plays,
  enemy actions, hits, statuses, KOs, burns, charge gains, round banners) that
  the client plays back sequentially — element-colored projectiles with impact
  bursts, action banners, shake/glow reactions — before rendering final state.
- **Art fix**: battle/setup/reward art was double-encoded by `encodeURI`
  (Firebase Storage URLs contain `%2F`), breaking every sprite in production;
  URLs are now HTML/CSS-escaped only, with an elemental-silhouette `onerror`
  fallback. Enemy names are themed to their element so silhouettes match.

Not yet implemented from the battle spec: evolution cards / stages and
per-Siegeling (stage 3) Ultimates — the Siege roster is currently flat, so
these need stage data on `SieglingCard` first. Deck size is party-driven
(roguelike deck-building) rather than the fixed 24 of the PvP spec.

## v4 — Living expedition (camps, brokers, caches, evolution, paged setup)

- **Gold economy**: battle wins pay gold (deeper floors and elites pay more);
  caches pay it out; camp traders and brokers charge it. Shown as 🪙 chips on
  the map, camp, and cache screens.
- **Interactive Rest Camps** (CZN-style stops): entering a Rest node sets up
  camp — a campfire scene with the party's cutouts. Resting (40% heal, knight
  included) is always free; a **wandering trader** (65%) sells two move cards,
  hot stew (25% heal), and a card upgrade; a **Siegeling broker** (45%) offers
  a recruit for hire. Each option once per stop; "Break Camp" moves on.
  Endpoints: `camp/choose`, `camp/leave`.
- **Cache dig minigame** (press your luck): a starting find, then each "Dig
  Deeper" risks collapse (15% → 35% → 55% → 75%): a bust buries the unbanked
  gold. Digs can also find tonics (+3 max HP, kept on bust) and buried move
  cards. "Bank the Loot" seals the cache. Endpoints: `cache/dig`, `cache/take`.
- **Automatic evolution**: team select offers **stage-1 Siegelings only**
  (evolution cards are filtered out and tagged "EVO ↑"). Every second battle a
  Siegeling survives, it evolves into its next catalog stage — same deck cards,
  new art/element/stats, an evolution heal surge, and the new stage's moves
  join the deck.
- **Unique knight abilities**: each SiegeKnight's deck card is built from its
  dashboard active ability (effect/value/target), now with its element's status
  rider; the setup page shows the ability name, numbers, and description.
- **Paged team select**: step 1 pick a SiegeKnight → approve; step 2 pick the
  warband → begin, with step chips and slide-in transitions.
- **Unit inspection**: ⓘ on setup cards and tapping party chips opens a modal
  listing the unit's cards/abilities (cost, effect, status chance, description).
- **Speed race track**: the battle header shows both teams racing along lanes —
  each living unit an element marker at its cumulative Speed, the leading side
  carrying the 🏁 — replacing the plain speed chips.
- **Mobile fit**: the battle screen (knight plate, track, stage, log, HUD,
  hand) and the map (compact scrollable party strip + gold + DAG) each fit a
  single phone screen; enemy intent telegraphs moved inside nameplates so they
  can no longer clip off the stage.

## v5 — Varied knight leadership passives

Previously every SiegeKnight granted the same battle-start +4 shield. Each
knight now leads with **one of five distinct passives**, chosen deterministically
from a stable hash of its id so the roster spreads across all kinds:

| Passive | Name | Effect |
|---|---|---|
| SHIELD | Bulwark | party begins each battle with +4 shield |
| ATTACK | Warlord | party begins each battle with +2 attack |
| SPEED | Vanguard | party begins each battle with +2 speed |
| HEALTH | Warden | every Siegeling has +8 max HP all expedition |
| LOOT | Quartermaster | +40% gold from spoils and caches |

SHIELD/ATTACK/SPEED are applied in `SiegeCombatEngine.startBattle` (after the
per-battle reset); HEALTH is baked into each member's max HP at join time
(party build, recruits, and brokers all route through `applyJoinBonus`); LOOT
runs through a central `earnGold` helper on battle-win and cache-bank payouts.
The setup screen shows a colored passive chip (🛡 Bulwark / ⚔ Warlord /
⚡ Vanguard / ❤ Warden / 🪙 Quartermaster) alongside the description.

Verified with the bot: all five kinds present across the roster; SHIELD/ATTACK/
SPEED confirmed on the party's opening battle state; HEALTH confirmed on party
max HP before any battle; LOOT confirmed by extra gold banked from a cache.

## v6 — In-battle evolution cards (replaces auto-evolution)

Evolution now follows the battle rules spec instead of firing automatically on
win counts:

- **Evolution requires playing the Evolution card.** Each battle, every party
  member with a next catalog stage gets one Evolution card shuffled into the
  battle deck (drawn like any other card, gold-glowing in the hand).
- **Costs**: stage 2 evolution = 2 AP; stage 3 evolution = 3 AP.
- **Playing it** transforms the owner mid-battle: new name/element/art, bigger
  HP pool with a heal surge, shield and attack buffs carry over, statuses are
  cleansed, and the new stage's moves are shuffled into the deck. The card is
  consumed (it never reshuffles).
- **Chained unlock**: evolving to stage 2 immediately shuffles the stage-3
  Evolution card (3 AP) into the deck, if that stage exists.
- **Permanent for the remainder of the battle**: when the battle ends the
  member reverts to its base form, carrying the damage it took home (a death
  while evolved is still a death). The next battle deals a fresh Evolution card.
- Team select still offers stage-1 Siegelings only; the "EVO ↑" tag now means
  "its Evolution card joins your battle deck."

## v7 — Thumb HUD, evolution gauge, fresh hands, ledger, brokers, checkpoints

- **HUD at the bottom**: the battle controls (AP pips, deck counts, Ultimate,
  End Turn) sit below the hand, pinned to the bottom edge on mobile
  (safe-area aware) — right under the thumbs.
- **Evolution gauge**: each Siegeling must spend **5 AP of its own moves**
  before its Evolution card unlocks (`SiegeBattle.EVOLVE_GAUGE`). Gold gauge
  bars live on the nameplate and on the locked Evolution card itself; a
  "gauge full" flash fires the moment it's ready. The gauge resets per stage.
- **Fresh hand every turn**: at end of turn the whole hand is discarded (cards
  visibly fly off); at the start of every turn a full 6-card hand is dealt
  (staggered deal-in animation). When the deck runs dry the discard folds back
  in and shuffles — shown as swirling card-backs with a ♻ banner. Enemy
  stats were tuned up to match the stronger card economy.
- **Unused AP → Ultimate, visibly**: leftover AP pips fly from the HUD into
  the Knight's charge bar at end of turn (`apCharge` event).
- **Expandable turn ledger**: the log strip is now a button; tapping opens a
  bottom-sheet ledger of every action grouped by round — actor, the card
  behind it (🃏 chip), its AP cost, and what it did. Server keeps a structured
  `turnLog` alongside the prose log.
- **Tap any unit for details**: tapping a sprite with no card selected opens
  the detail popup — allies show their cards, gauge, and what they evolve
  into; **enemies show their full ability specs** and current intent.
- **Broker map nodes** (🐾): a dedicated stop distinct from camps, guaranteed
  once per map plus random spawns. The stall offers three Siegelings — hire
  into an open slot (40g) or **swap** one of yours out (20g; the released
  member's cards leave the deck). Card-transform animation when a Siegeling's
  hand upgrades after evolving.
- **Checkpoints**: run state persists to Firestore (`siegeCheckpoints`,
  `SiegeCheckpointStore`) at every safe map state — never mid-battle. Coming
  back later (even across a server restart/deploy) resumes from the map at the
  last checkpoint; the map shows a 💾 chip when saved. Fail-soft when
  Firestore is unavailable (runs stay in-memory as before).

## Known limitations / next steps

- Runs are in-memory only (not yet persisted to Firestore) — a server restart drops an
  active run, exactly like base solo games. Firestore persistence (`AdventureRunStore`) is
  the natural next milestone.
- No relics, random events, merchants, seeded runs, or meta-progression payouts yet —
  Phase 2–3 items from `03-technical-plan.md`, layered on the working loop.
- Difficulty is a first tuning pass; numbers live in `SiegeContentService` for iteration
  (a naive greedy bot wins ≈25–30% of runs; thoughtful play should do noticeably better).

## v8 — Warband growth, mercenaries, 3-boss campaign, endless mode

- **Solo start + wild recruits**: runs begin as SiegeKnight + 1 Siegeling; after each
  battle win a wild Siegeling joins (1% stage 3, 5% stage 2, else stage 1) until the
  warband holds 3. Difficulty scales with living party size (a lone Siegeling faces
  ~2/3-strength foes).
- **3-boss campaign**: the map is 3× longer (24 rows) — three chained 8-row regions,
  each funneling through an unskippable boss row: a **Squire**, a rogue **SiegeKnight**,
  then the **Siegelord**. Mid-boss wins pay big gold, heal 25%, and open the next region.
- **Mercenary brokers**: broker stalls now RENT elite mercenaries (evolved forms,
  +35% HP, +3 speed) for 55g — they fight your NEXT battle with two extra Boon cards
  (Warcry: party +3 attack · Bulwark: party 8 shield) plus their upgraded moves, then
  depart. Permanent recruiting still happens at camps and elite rewards.
- **Camp revives**: fallen Siegelings can be revived at Rest Camps — 50% HP for 35g or
  100% for 70g.
- **Fixed opening fight**: the run's first battle is a fixed yardstick, not a scaled
  encounter — one foe at `SiegeTuning.OPENING_FIGHT_*` (30 HP, 5 damage, speed 8, one
  attack), identical for every warband and party size. Only element and name vary.
  Every fight after it goes back through `generateEnemies` and scales off warband size
  and depth as before. Battlegrounds opts out (its enemies scale to veteran squads).
- **Knight roguelike classes**: the **Marshal** class musters its extra Siegeling at
  warband assembly — the player picks **2 starters instead of 1** (the roster row
  carries `startingParty`, and `newRun` enforces it server-side).
  Classes (Bulwark/Warlord/Vanguard/Warden/Quartermaster/Marshal) are
  assignable per knight from the card dashboard ("Siege Roguelike Classes" panel,
  editor-authenticated, `/api/siege/classes`); unassigned knights keep their hash default.
  Assignments are in-memory (reset on redeploy) — persistence is a follow-up.
- **Cache variety**: caches now roll one of three mini-games — the press-your-luck Dig,
  **Three Chests** (pick one: gold / +5 max HP / party heal / trap), or the **Wheel of
  Spoils** (stake 15g for x0–x3).
- **Endless mode**: winning a standard run lets you save the team to one of three slots
  (client-side); saved teams launch **Endless runs** — when the Siegelord falls the map
  grows another region and difficulty loops upward. Score accrues from kills, depth,
  gold and bosses; a death screen shows the final score.
- **End-of-run rewards**: every run ends with a Spoils of War payout — **Siegecoins,
  Remnants, and (on wins) a random collection card** — granted to the logged-in
  account via the existing progression store (guests see a sign-in preview).

Verified end-to-end via `/api/siege/**`: solo start → win → auto-recruit; chest cache;
merc rental → fought as 4th ally → departed after victory; endless run creation;
end-reward preview on defeat; classes endpoint listing all six classes.

## v9 — Items, Smith, Caravan, Events, broker rework, path variety

- **Brokers sell Siegelings again**: when the warband has room (<3), brokers offer
  Siegelings to **add** to an open slot or **swap** in for a member (the released
  member's gear returns to your inventory), alongside one mercenary rental. At 3
  Siegelings the stall is **mercenary-rental only**, as specified. (Note: solo start +
  a wild recruit after every battle win fills the team to 3 quickly, so in practice the
  first broker is often already merc-only — lower the recruit rate or allow swap-at-full
  if the sell window should be wider.)
- **Path variety per boss region**: Squire segment now opens with **3–5** main paths,
  the rogue-SiegeKnight segment **2–4**, the Siegelord segment **2–3** (verified live).
- **Smith node**: pay to **chisel** a deck card into a stronger version, or **scrap** a
  card to thin the deck.
- **Item system**: each Siegeling carries **one item** (VITALITY raises max HP while
  equipped; ATTACK/SPEED/SHIELD apply at battle start). A **🎒 inventory** panel on the
  map equips/unequips items; items drop from events, caches and the **Merchant Caravan**
  (a shop of items + a card + healing). Items are **created from the card dashboard**
  ("Siege Items" panel, editor-auth `GET/POST /api/siege/items`); 8 built-ins ship by
  default. Item definitions are in-memory for now (reset on redeploy).
- **Event nodes** (data-driven `EventDef`): a random narrative stop with 2–3 choices and
  outcomes (gold, heal, item, recruit, ambush battle, blessing). Seeded set: Weary
  Traveler, Bandit Toll, Mysterious Stranger, Lost Siegeling, Abandoned Camp, Monster
  Tracks, Treasure Map, Wandering Oracle. More can be added as pure data.
- **Ambush** battle modifier: enemies start with extra shield/attack/speed and strike
  first; used by several event outcomes (Bandit Toll fight, Monster Tracks, trapped camp).

**Deferred (data-extendable follow-ups):** the fuller node catalogs from the design
brief — Black Market / Auction House shops, the Upgrade shrines (Trainer, Evolution
Shrine, Skill Dojo, Elemental Shrine, Fusion Forge, Memory Crystal), the dedicated
Gambling nodes (Fortune Wheel, Dice Dealer, Slot Machine…), Story nodes, and Route
Manipulation (Scout Tower, Teleport Gate, Bridge Builder, Collapse, Compass). The Event
framework and item/shop plumbing added here are the substrate these slot into as data.

Verified live via `/api/siege/**`: per-segment opener counts (3–5 / 2–4 / 2–3), all new
node types generating, Smith chisel, Caravan, Event choices + event-triggered ambush
battles, item equip raising max HP (VITALITY), and broker merc-only gating at a full team.
