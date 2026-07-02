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

## Known limitations / next steps

- Runs are in-memory only (not yet persisted to Firestore) — a server restart drops an
  active run, exactly like base solo games. Firestore persistence (`AdventureRunStore`) is
  the natural next milestone.
- No relics, random events, merchants, seeded runs, or meta-progression payouts yet —
  Phase 2–3 items from `03-technical-plan.md`, layered on the working loop.
- Difficulty is a first tuning pass; numbers live in `SiegeContentService` for iteration
  (a naive greedy bot wins ≈25–30% of runs; thoughtful play should do noticeably better).
