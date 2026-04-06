# Ability Effect Keys

Use these effect keys in card definitions and in:

- `src/main/resources/cards/siegling-overrides.json`

These are the effect keys the rules engine currently understands.

| Key | What it does | Typical target type |
| --- | --- | --- |
| `damage` | Deals damage to the resolved target or targets. | `SINGLE_ENEMY`, `ROW_ENEMIES`, `ALL_ENEMIES`, `ENEMY_PLAYER` |
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
| `move_link` | On a Siegling (`SELF`), moves along reciprocal links to an adjacent empty cell. On a **spell or trap** with `SINGLE_ENEMY`, the caster picks the enemy’s square **and** an empty destination square on that enemy board (no link required). | `SELF`, `SINGLE_ENEMY` (spells/traps) |

## Notes

- `connected_allies_damage_boost`, `connected_allies_health_boost`, and `connected_allies_speed_boost` are source-based, so they should be used on board creatures rather than trainers or generic spells.
- If you want a source creature to strengthen its linked network, these are the keys to use.
- Current connected-allies logic follows the same reciprocal notch-link rules the board uses for normal connections.
