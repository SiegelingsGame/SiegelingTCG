# Ability Effect Keys

Use these effect keys in card definitions and in:

- `src/main/resources/cards/siegling-overrides.json`
- `src/main/resources/cards/moves-pool.json`

These are the effect keys the rules engine currently understands.

| Key | What it does | Typical target type |
| --- | --- | --- |
| `damage` | Deals damage to the resolved target or targets. | `SINGLE_ENEMY`, `ROW_ENEMIES`, `ALL_ENEMIES`, `ENEMY_PLAYER` |
| `player_damage` | Deals direct damage to a player target. | `ENEMY_PLAYER` |
| `draw` | Draws cards from the acting side's deck equal to the effect value. | `SELF` |
| `heal` | Restores health up to max Health. | `SINGLE_ALLY`, `ALL_ALLIES`, `ENEMY_PLAYER` |
| `shield` | Grants temporary Shield that absorbs damage before HP. | `SINGLE_ALLY`, `ALL_ALLIES`, `ROW_ALLIES`, `SELF`, `PASSIVE` |
| `freeze` | Applies the freeze status. | `SINGLE_ENEMY`, `ROW_ENEMIES` |
| `speed_zero` | Sets effective Speed to 0 for the turn. | `SINGLE_ENEMY`, `ROW_ENEMIES` |
| `slow` | Reduces the target's current Speed by the effect value for the turn. | `SINGLE_ENEMY`, `ROW_ENEMIES`, `ALL_ENEMIES` |
| `damage_boost` | Adds temporary attack damage. | `SINGLE_ALLY`, `ALL_ALLIES`, `ROW_ALLIES`, `PASSIVE` |
| `health_boost` | Adds temporary max Health and heals by the same amount. | `SINGLE_ALLY`, `ALL_ALLIES`, `ROW_ALLIES`, `PASSIVE` |
| `connected_allies_damage_boost` | Gives attack damage to every allied Siegling connected to the source card through active reciprocal links. The source card itself is not buffed. | `SELF` |
| `connected_allies_health_boost` | Gives max Health to every allied Siegling connected to the source card through active reciprocal links. The source card itself is not buffed. | `SELF` |
| `connected_allies_shield` | Gives Shield to every allied Siegling connected to the source card through active reciprocal links. The source card itself is not buffed. | `SELF` |
| `connected_allies_speed_boost` | Gives Speed to every allied Siegling connected to the source card through active reciprocal links. The source card itself is not buffed. | `SELF` |
| `connected_allies_slow` | Reduces Speed on every allied Siegling connected to the source card through active reciprocal links. The source card itself is not affected. | `SELF` |
| `speed_boost` | Adds temporary Speed. | `SINGLE_ALLY`, `ALL_ALLIES`, `ROW_ALLIES`, `PASSIVE` |
| `destroy` | Defeats the resolved target immediately. | `SINGLE_ENEMY` |
| `move_link` | On a Siegling (`SELF`), moves to an adjacent empty notch-projected cell only if the moved Siegling would still have an active reciprocal notch connection there; otherwise it returns `No Valid Notches`. On a **spell or trap** with `SINGLE_ENEMY`, the caster picks the enemy’s square **and** an empty destination square on that enemy board (no link required). | `SELF`, `SINGLE_ENEMY` (spells/traps) |

## Notes

- `connected_allies_damage_boost`, `connected_allies_health_boost`, `connected_allies_shield`, `connected_allies_speed_boost`, and `connected_allies_slow` are source-based, so they should be used on board creatures rather than trainers or generic spells.
- If you want a source creature to strengthen its linked network, these are the keys to use.
- Current connected-allies logic follows the same reciprocal notch-link rules the board uses for normal connections.
- `shield` is temporary soak (clears with other temp effects). Prefer it over `heal` / `health_boost` when the fantasy is absorb-and-flow rather than permanent sustain.
- `slow` is soft tempo control (partial Speed cut). Prefer `freeze` / `speed_zero` when the fantasy is hard lockdown.

## Elemental move identities

Shared pool in `moves-pool.json` (25 moves each: 10 STANDARD / 10 SPECIALITY / 5 UTILITY):

| Element | Identity | Specialty toolkit |
| --- | --- | --- |
| Fire | Damage | High burst `damage`, `damage_boost` |
| Earth | Sustain | `heal`, `health_boost`, connected health |
| Wind | Speed | `speed_boost`, `move_link`, `speed_zero` |
| Ice | Control | `freeze`, high-cost execute `damage` |
| Water | Flow | `draw`, `shield`, `slow`, mid-curve wave `damage` |
