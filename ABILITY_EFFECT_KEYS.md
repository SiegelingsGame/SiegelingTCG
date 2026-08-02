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
| `connected_allies_speed_boost` | Gives Speed to every allied Siegling connected to the source card through active reciprocal links. The source card itself is not buffed. | `SELF` |
| `speed_boost` | Adds temporary Speed. | `SINGLE_ALLY`, `ALL_ALLIES`, `ROW_ALLIES`, `PASSIVE` |
| `destroy` | Defeats the resolved target immediately. | `SINGLE_ENEMY` |
| `move_link` | On a Siegling (`SELF`), moves to an adjacent empty notch-projected cell only if the moved Siegling would still have an active reciprocal notch connection there; otherwise it returns `No Valid Notches`. On a **spell or trap** with `SINGLE_ENEMY`, the caster picks the enemy’s square **and** an empty destination square on that enemy board (no link required). | `SELF`, `SINGLE_ENEMY` (spells/traps) |

## Notes

- `chain_damage` is the offensive mirror of the `connected_allies_*` keys: those trace links out
  from the *source*, while chain damage traces links out from the *picked target*. It arcs one hop
  only — the target's neighbours, not their neighbours' neighbours — and never hits the same
  Siegling twice when several primary targets share a link. Elemental weakness (+1) is scored per
  victim against the source's element, so one arc can crit some links and not others. With an empty
  enemy board it falls back to face damage exactly like `damage`.
- Chain targeting is driven by the *effect*, not a target type: pick `SINGLE_ENEMY` and the player
  still selects one card. In the battle view, hovering or pressing a candidate lights its linked
  cells (`.board-cell.chain-target` in `style.css`) and fans targeting arrows to every victim, so
  the splash is visible before committing. When no target is supplied (AI turns), auto-target picks
  the enemy carrying the most links, ties going to the lowest current health.
- `connected_allies_damage_boost`, `connected_allies_health_boost`, and `connected_allies_speed_boost` are source-based, so they should be used on board creatures rather than trainers or generic spells.
- If you want a source creature to strengthen its linked network, these are the keys to use.
- Current connected-allies logic follows the same reciprocal notch-link rules the board uses for normal connections.
