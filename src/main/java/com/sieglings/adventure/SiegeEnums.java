package com.sieglings.adventure;

/**
 * Shared enums for the Siege roguelike mode. Kept as package-private top-level
 * types in one file to avoid sprawl; all Siege classes live in this package.
 */

/** Which team a combatant fights for. */
enum Side { PLAYER, ENEMY }

/**
 * What a card / enemy ability does when resolved. Each value is the Siege
 * translation of a battle-table effect key (see {@code AbilityEffectKeys} and
 * the Siege column in {@code ABILITY_EFFECT_KEYS.md}) — a card should do the
 * same thing here that its text promises on the board.
 */
enum Effect {
    DAMAGE,       // damage       — deal value damage (through shield first)
    HEAL,         // heal         — restore value HP up to max
    SHIELD,       // shield       — temporary shield HP, gone at the start of your next turn
    MAX_HP_BOOST, // health_boost — raise max HP for the battle and heal the same amount
    BUFF_ATK,     // damage_boost — grant target +value flat attack for the battle
    BUFF_SPD,     // speed_boost  — grant target +value speed for the battle
    SLOW,         // slow/speed_zero — apply the Slow status
    STUN,         // freeze       — the target skips its next action
    DRAW,         // draw         — pull value cards into the hand
    EXECUTE,      // destroy      — defeat the target outright (capped against elites/bosses)
    SWAP,         // move_link    — move to a new notch: swap positions with another Siegeling
    EVOLVE        // evolution card: transform the owner into its next stage (this battle)
}

/**
 * Elemental status effects. Elements have no rock-paper-scissors weakness
 * chart — they only carry these statuses, applied by chance written on cards.
 * Identity is shared with battle-table {@code ElementalAfflictionCatalog};
 * timing/numbers stay Siege-specific.
 */
enum StatusKind {
    BURN,    // Fire:   1 damage at the end of each round
    SLOW,    // Ice:    -2 Speed for 2 rounds
    STUN,    // Earth:  skip the next action
    SHOCK,   // Wind/Electric: party loses 1 AP next turn / enemy's next hit is weakened
    POISON,  // Poison: 1 damage at the end of each round (Burn-class DoT)
    // Catalog-mapped placeholders — applied/shown; full mechanics land with battle enablement.
    SOAK,
    RUST,
    CURSE,
    DAZE,
    BLIND,
    WITHER
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
