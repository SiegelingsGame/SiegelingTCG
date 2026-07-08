package com.sieglings.adventure;

/**
 * Shared enums for the Siege roguelike mode. Kept as package-private top-level
 * types in one file to avoid sprawl; all Siege classes live in this package.
 */

/** Which team a combatant fights for. */
enum Side { PLAYER, ENEMY }

/** What a card / enemy ability does when resolved. */
enum Effect {
    DAMAGE,     // deal value damage (through shield first)
    HEAL,       // restore value HP up to max
    SHIELD,     // grant value temporary shield HP
    BUFF_ATK,   // grant target +value flat attack for the battle
    BUFF_SPD,   // grant target +value speed for the battle
    SLOW,       // apply the Slow status (freeze / speed_zero flavored)
    SWAP,       // move to a new notch: swap positions with another Siegeling
    EVOLVE      // evolution card: transform the owner into its next stage (this battle)
}

/**
 * Elemental status effects. Elements have no rock-paper-scissors weakness
 * chart — they only carry these statuses, applied by chance written on cards.
 */
enum StatusKind {
    BURN,   // Fire:  1 damage at the end of each round
    SLOW,   // Ice:   -2 Speed for 2 rounds
    STUN,   // Earth: skip the next action
    SHOCK   // Sky:   party loses 1 AP next turn / enemy's next hit is weakened
}

/** Who a card / enemy ability can be aimed at. */
enum TargetKind {
    ENEMY_SINGLE,
    ALL_ENEMIES,
    ALLY_SINGLE,
    ALLY_ALL,
    SELF
}

/** Map node categories for a Siege run. */
enum NodeType { BATTLE, ELITE, REST, TREASURE, BROKER, SMITH, CARAVAN, EVENT, BOSS }

/**
 * A SiegeKnight's run-long leadership passive — every knight grants a different
 * one instead of the same +shield. SHIELD/ATTACK/SPEED apply at the start of
 * each battle; HEALTH raises every Siegeling's max HP for the whole run; LOOT
 * boosts gold earned from spoils and caches.
 */
enum KnightPassive { SHIELD, ATTACK, SPEED, HEALTH, LOOT, MARSHAL }

/**
 * How a run plays out: a fixed 3-boss expedition, score-chasing endless loops, or
 * BATTLEGROUNDS — the secondary "extraction" mode fought with a squad of banked
 * veterans for greater rewards (higher difficulty, gold/score multipliers).
 */
enum RunMode { STANDARD, ENDLESS, BATTLEGROUNDS }

/** Battle turn phase driving what the client may submit. */
enum BattlePhase { PLAYER_INPUT, ENEMY_RESOLVING, WON, LOST }

/** Overall run lifecycle state. */
enum RunStatus { ACTIVE, WON, LOST }
