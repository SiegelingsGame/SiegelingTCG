# Ability Effect Keys

Use these effect keys in card definitions and in:

- `src/main/resources/cards/siegling-overrides.json`

These are the effect keys the rules engine currently understands.

| Key | What it does | Typical target type |
| --- | --- | --- |
| `damage` | Deals damage to the resolved target or targets. | `SINGLE_ENEMY`, `ROW_ENEMIES`, `ALL_ENEMIES`, `ENEMY_PLAYER` |
| `chain_damage` | Deals damage to the resolved target **and** to every Siegling that shares an active reciprocal notch link with it (one hop, on the target's own board). | `SINGLE_ENEMY`, `ROW_SELECT_ENEMIES`, `ALL_ENEMIES` |
| `player_damage` | Deals direct damage to a player target. | `ENEMY_PLAYER` |
| `heal` | Restores health up to max Health. | `SINGLE_ALLY`, `ALL_ALLIES`, `ENEMY_PLAYER` |
| `freeze` | Applies the freeze status. | `SINGLE_ENEMY`, `ROW_ENEMIES` |
| `speed_zero` | Sets effective Speed to 0 for the turn. | `SINGLE_ENEMY`, `ROW_ENEMIES` |
| `damage_boost` | Adds temporary attack damage. | `SINGLE_ALLY`, `ALL_ALLIES`, `ROW_ALLIES`, `PASSIVE` |
| `health_boost` | Adds temporary max Health and heals by the same amount. | `SINGLE_ALLY`, `ALL_ALLIES`, `ROW_ALLIES`, `PASSIVE` |
| `connected_allies_damage_boost` | Gives attack damage to every allied Siegling connected to the source card through active reciprocal links. The source card itself is not buffed. | `SELF` |
| `connected_allies_health_boost` | Gives max Health to every allied Siegling connected to the source card through active reciprocal links. The source card itself is not buffed. | `SELF` |
| `connected_allies_heal` | Restores current Health (up to max) on every allied Siegling connected to the source card through active reciprocal links. Does **not** raise max Health. The source card itself is not healed. | `SELF` |
| `connected_allies_speed_boost` | Gives Speed to every allied Siegling connected to the source card through active reciprocal links. The source card itself is not buffed. | `SELF` |
| `speed_boost` | Adds temporary Speed. | `SINGLE_ALLY`, `ALL_ALLIES`, `ROW_ALLIES`, `PASSIVE` |
| `energy_boost` | Generates elemental energy with **no notch link and no socket**. The energy type is the ability's `targetElement`; leave it unset and the card generates its own element. | `PASSIVE` (continuous), `SELF` (one-shot action) |
| `destroy` | Defeats the resolved target immediately. | `SINGLE_ENEMY` |
| `move_link` | On a Siegling (`SELF`), moves to an adjacent empty notch-projected cell only if the moved Siegling would still have an active reciprocal notch connection there; otherwise it returns `No Valid Notches`. On a **spell or trap** with `SINGLE_ENEMY`, the caster picks the enemy’s square **and** an empty destination square on that enemy board (no link required). | `SELF`, `SINGLE_ENEMY` (spells/traps) |

## Notes

- `chain_damage` is the offensive mirror of the `connected_allies_*` keys: those trace links out
  from the *source*, while chain damage traces links out from the *picked target*. It arcs one hop
  only — the target's neighbours, not their neighbours' neighbours — and never hits the same
  Siegling twice when several primary targets share a link. Elemental weakness (+1) and afflictions
  (Blind/Soak/Rust/inflict) are scored per victim against the source's element. With an empty
  enemy board it falls back to face damage exactly like `damage`.
- Chain targeting is driven by the *effect*, not a target type: pick `SINGLE_ENEMY` and the player
  still selects one card. In the battle view, hovering or pressing a candidate lights its linked
  cells (`.board-cell.chain-target` in `style.css`) and fans targeting arrows to every victim.
  When no target is supplied (AI turns), auto-target picks the enemy carrying the most links, ties
  going to the lowest current health. In Siege (no notch board) it resolves as single-target `DAMAGE`.
- `energy_boost` is the one energy source that ignores the board's wiring. Written **passive**
  (`passive: true`, usually `PASSIVE` target) it is recomputed by `EnergyService` on every energy
  pass: the owner's pool carries `effectValue` extra energy of the chosen type for as long as the
  card is alive on the board, and it vanishes when the card leaves. Because the engine keeps it
  applied, `BattleService` never offers it as a battle action. Written **non-passive** it resolves
  once through `EffectService` and banks the energy as a temporary adjustment, cleared at that
  side's next Draw exactly like a claim — usable on Siegling moves, spells, traps, and trainer
  actives. A SiegeKnight's passive can carry it too, granting to that side every turn.
  Elements with no pool (Poison, Light, Neutral) generate nothing; picking one is treated as a
  design error rather than silently falling back.
- `connected_allies_damage_boost`, `connected_allies_health_boost`, `connected_allies_heal`, and `connected_allies_speed_boost` are source-based, so they should be used on board creatures rather than trainers or generic spells.
- Prefer `connected_allies_heal` when the intent is to restore missing HP; `connected_allies_health_boost` permanently raises max Health (and current HP by the same amount).
- If you want a source creature to strengthen its linked network, these are the keys to use.
- Current connected-allies logic follows the same reciprocal notch-link rules the board uses for normal connections.

## What each key does in Siege / Adventure mode

Siege runs the same cards through a different engine, so every key above also
has a Siege translation. A card should do the thing its text promises in both
modes; the mapping lives in `SiegeContentService.effectFor` /
`targetFor`, and `SiegeCardEffectParityTest` pins it.

| Key | Siege effect | Siege targeting |
| --- | --- | --- |
| `damage` | `DAMAGE` — value + 2, plus the caster's attack buff. | as written |
| `chain_damage` | `DAMAGE` — Siege has no notch links, so it lands as a normal attack. | as written |
| `player_damage` | `DAMAGE` — there is no opposing player, so it lands on the enemy line. | `ALL_ENEMIES` |
| `draw` | `DRAW` — pulls that many cards (max 3) into the hand. | `SELF` |
| `energy_boost` | `GAIN_AP` — Siege has no elemental pools, so the energy becomes AP for the current turn (max 2). Passive versions never become Siege cards at all. | `SELF` |
| `heal` / `connected_allies_heal` | `HEAL` — value + 3. | as written / `ALLY_ALL` for connected-allies |
| `shield` | `SHIELD` — value + 3, **lapses when the shielded side opens its next turn** (the board clears shields at the end of the battle phase). | as written |
| `health_boost` | `MAX_HP_BOOST` — raises max HP for the battle and heals the same amount, then drops when the battle ends. | as written |
| `damage_boost` | `BUFF_ATK` — only the Siegelings the card named. | as written |
| `speed_boost` | `BUFF_SPD` | as written |
| `freeze` | `STUN` — skips the target's next action, matching "skips its turn" on the board. | as written |
| `speed_zero` / `slow` | `SLOW` — the Slow status (Speed loss for 2 rounds). | as written |
| `destroy` | `EXECUTE` — defeats the target outright; against an **elite or Siegelord** it deals 25% of max HP instead, and always costs at least 3 AP. | forced to `ENEMY_SINGLE` |
| `move_link` | `SWAP` — trades notches with the chosen ally. | `ALLY_SINGLE` |
| `connected_allies_*` | the matching effect above, applied to the **whole warband** — Siege has no board links, so the warband is the linked network. | `ALLY_ALL` |

Targeting rules that hold regardless of the key:

- Row/sweep board targets (`ROW_ENEMIES`, `ROW_SELECT_ENEMIES`, `ROW_ALLIES`, …)
  collapse to `ALL_ENEMIES` / `ALLY_ALL`; Siege has no rows.
- A card is always pointed at the side its effect belongs to. A damaging effect
  can never resolve on your own warband, and a healing/shielding/buffing effect
  can never resolve on the enemy line — including when an unregistered key falls
  back to `DAMAGE`. (This is what made a `draw` card land as damage on its own
  caster before the fallback was constrained.)
- An unregistered key is matched by substring (`*_damage_boost`, `*draw*`,
  `*shield*`, …) before falling back to `DAMAGE`, so a key authored in the live
  dashboard behaves sensibly in Siege before it is added to the registry.
