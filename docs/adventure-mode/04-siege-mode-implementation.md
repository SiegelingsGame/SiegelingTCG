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

## Known v1 limitations / next steps

- Runs are in-memory only (not yet persisted to Firestore) — a server restart drops an
  active run, exactly like base solo games. Firestore persistence (`AdventureRunStore`) is
  the natural next milestone.
- Map is a fixed linear sequence; branching DAG generation from the proposal is not yet in.
- No relics, events, recruitment, card rewards, meta-progression payouts, or seeded runs
  yet — these are the Phase 2–3 items from `03-technical-plan.md`, now easy to layer on top
  of the working combat core.
- Difficulty is a first tuning pass; numbers live in `SiegeContentService` for iteration.
