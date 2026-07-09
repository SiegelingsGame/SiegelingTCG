# Siege Leveling + Battlegrounds (Extraction Mode) — Design Plan

Status: IMPLEMENTED (all four phases, 2026-07-08). Companion work also landed:
cache/event puzzle minigames, stage-2/3 drop sprite sizing fix, dashboard Shop
pricing. Remaining seam: the Battlegrounds leaderboard is personal-best only —
a global cross-user ranking still needs a dedicated aggregate store.

The loop mirrors CZN's Chaos → Zero Point: level a team in **Siege**, extract
it, then take the leveled team into **Battlegrounds** for greater rewards.

---

## 1. Current state (what this builds on)

- A Siege run (`SiegeRun`) = SiegeKnight + 3 Siegelings, deck built from their
  moves. Party HP persists across battles; runs are in-memory keyed by token
  with Firestore checkpoints (`SiegeCheckpointStore`, `siegeCheckpoints`).
- Runs end `WON`/`LOST` (`RunStatus`), grant one-time `endRewards`. Modes:
  `STANDARD` (3 bosses) and `ENDLESS` (score loops).
- Combatants (`Combatant`) have maxHp/speed/attackBuff but **no level or XP**.
- Recruits join mid-run (`joinStagedRecruit`); decks get modified by
  reward picks, smith upgrades, and items — this "modified deck" is exactly
  what extraction should preserve.

## 2. Leveling system (in-run)

Every party Siegeling and the SiegeKnight gains XP during a run. All numbers
live in one tuning class (`SiegeTuning`) so they can be balanced later.

**XP awards** (per living party member at time of award):
| Source | XP |
|---|---|
| Battle won (normal) | 25 |
| Elite won | 50 |
| Boss won | 100 |
| Killing blow bonus (that unit) | +10 |
| Puzzle/minigame perfect clear | 15 |
| Event good outcome | 10 |

**Level curve** (cumulative XP, cap 10): 0, 50, 120, 220, 360, 550, 800,
1120, 1520, 2000. Roughly 3–4 levels over a STANDARD run, more in ENDLESS.

**Per-level gains** (applied to base stats, so runs get easier as you level):
- +6% max HP per level (rounded up, heals the gained HP on level-up)
- +4% to that Siegeling's move card damage/heal/shield values per level
- +1 Speed at levels 3, 6, 9
- Knight: +5% HP per level, +1 knight-passive value every 2 levels

**Model changes**: `Combatant` gains `level`, `xp`; serialization in
`SiegeService.unitToMap` adds `level`, `xp`, `xpToNext`. Checkpoint
snapshot/restore includes both.

**UI**: level badge on the unit chip, thin XP bar under HP, "LEVEL UP!"
toast between battles listing the stat gains.

## 3. Extraction (persisting a leveled team)

- **STANDARD win** → team auto-extracts (beating the 3rd boss = extraction).
- **ENDLESS** → after each boss (loop boundary) the player chooses **Extract**
  (ends the run, banks the team, end-rewards get a ×loop multiplier) or
  **Push On** (keep looping; a later loss extracts nothing).
- **Loss** → nothing extracts. The stakes are the point of the mode.

**Storage**: new Firestore collection `siegeVeteranTeams` (per user, keep the
10 most recent; new extractions evict the oldest). A team snapshot stores:
knight (id, level, xp, passive value), each member (sourceCardId, name,
element, level, xp, final maxHp/speed, equipped itemId), the run's
`deckTemplates` (the modified deck), and provenance (mode, loops, score,
extractedAt). New `SiegeVeteranStore` follows the `SiegeCheckpointStore`
fail-soft pattern.

**API**: `GET /api/siege/veterans` (roster), `POST /api/siege/extract`
(endless loop-boundary extraction), and the win path extracts automatically.

## 4. Battlegrounds (secondary mode, greater rewards)

- **Entry**: requires ≥3 veterans. Player picks any **3 veterans** (mixable
  across extracted teams) + a veteran knight. They enter at their extracted
  level with their modified deck (merged from the source teams' templates).
- **Run shape**: same map engine, new `RunMode.BATTLEGROUNDS`. Difficulty
  scales off the picked team: enemies +8% HP and +5% damage per average
  veteran level; +50% elite density; free recruit drops disabled (replaced
  with consumable/gold drops) — your extracted team is the team.
- **Boons** (the "amps/boons" analog): at run start pick 1 of 3 run-wide
  boons (e.g. +2 AP first round of each battle; moves cost −1 on bosses;
  revive first fallen ally once per battle at 30% HP). Higher tiers add a
  second boon pick after the first boss.
- **Rewards**: gold ×2.5, end-reward score ×3, guaranteed stage-2+ reveal at
  each boss, exclusive **Warmarks** currency for a Battlegrounds-only shop
  (cosmetic frames, loading art, unique sigil items), leaderboard.
- **Tiers I–V**: clearing a tier unlocks the next; each tier raises both the
  difficulty scalar and reward multipliers.
- **Stakes on loss** (recommended: B):
  - A. Hardcore — veterans consumed on loss (true extraction stakes)
  - B. **Fatigue — veterans survive but are locked for 24h on loss**
  - C. No stakes — rewards-only downside
- Veterans keep leveling in Battlegrounds; a Battlegrounds win re-extracts
  the team at its new levels (cap still 10; XP continues to bank).

## 5. Implementation phases (each ~1 agent-sized PR)

1. **In-run leveling**: `Combatant` level/xp + `SiegeTuning` + XP awards in
   `SiegeCombatEngine`/`SiegeService` + checkpoint round-trip + UI badge/bar.
2. **Extraction**: `SiegeVeteranStore`, auto-extract on STANDARD win,
   loop-boundary extract prompt in ENDLESS, `GET /api/siege/veterans`.
3. **Battlegrounds core**: mode flag, veteran-pick lobby UI, difficulty
   scaling, recruit-drop replacement, reward multipliers.
4. **Boons, Warmarks shop, tiers, fatigue lockout, leaderboard.**

Phases 1–2 ship value alone (leveling makes runs easier; extraction banks
teams even before the mode that consumes them exists).
