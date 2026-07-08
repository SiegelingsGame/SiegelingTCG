package com.sieglings.adventure;

/**
 * One-stop tuning table for the Siege in-run leveling system. Every balance
 * number the leveling system reads lives here as a {@code static final} so a
 * designer can retune progression by editing a single file — the XP award
 * table, the cumulative level curve, and the per-level stat gains.
 *
 * <p>The class is a pure constant/formula holder: no state, no Spring wiring.
 * Both Siegelings and the SiegeKnight share the same {@link #levelForXp(int)}
 * curve; they differ only in their stat multipliers ({@link #hpMultiplier(int)}
 * versus {@link #knightHpMultiplier(int)}, and so on).
 */
final class SiegeTuning {

    private SiegeTuning() { }

    // ---- XP awards --------------------------------------------------------
    // Granted to every living party member (and the SiegeKnight) when the
    // matching event resolves. The killing-blow bonus goes only to the unit
    // that lands the kill.

    /** XP for winning a normal battle. */
    static final int XP_BATTLE_WON = 25;
    /** XP for winning an elite battle. */
    static final int XP_ELITE_WON = 50;
    /** XP for winning a boss battle. */
    static final int XP_BOSS_WON = 100;
    /** Bonus XP to the specific unit that lands a kill. */
    static final int XP_KILLING_BLOW = 10;
    /** XP for perfectly clearing a puzzle / minigame. */
    static final int XP_PUZZLE_PERFECT = 15;
    /** XP for resolving a map event with a good outcome. */
    static final int XP_EVENT_GOOD = 10;

    // ---- Level curve ------------------------------------------------------

    /** Highest attainable level. */
    static final int MAX_LEVEL = 10;

    /**
     * Cumulative XP required to reach each level, indexed by {@code level - 1}:
     * index 0 is level 1 (0 XP), index 9 is level 10 (2000 XP). Roughly 3–4
     * levels over a STANDARD run, more in ENDLESS.
     */
    static final int[] LEVEL_CURVE = {0, 50, 120, 220, 360, 550, 800, 1120, 1520, 2000};

    // ---- Per-level stat gains --------------------------------------------
    // Kept as integer percentages so scaling is done with exact integer math
    // (see scaledMaxHp / scaledMoveValue) — floating-point ceil would otherwise
    // overshoot on clean multiples (e.g. 100 * 1.12 → 112.0000001 → 113).

    /** Max-HP growth per level for a Siegeling (+6% of base per level). */
    static final int HP_PCT_PER_LEVEL = 6;
    /** Move card value growth per level for a Siegeling (+4% of base per level). */
    static final int MOVE_PCT_PER_LEVEL = 4;
    /** Max-HP growth per level for the SiegeKnight (+5% of base per level). */
    static final int KNIGHT_HP_PCT_PER_LEVEL = 5;

    /**
     * The level derived from a cumulative XP total, clamped to
     * {@link #MAX_LEVEL}. Level 1 is the floor (0 XP).
     */
    static int levelForXp(int xp) {
        int level = 1;
        for (int i = 0; i < LEVEL_CURVE.length; i++) {
            if (xp >= LEVEL_CURVE[i]) level = i + 1;
        }
        return level;
    }

    /** Cumulative XP needed to sit at the given level (clamped to 1..{@link #MAX_LEVEL}). */
    static int xpForLevel(int level) {
        int clamped = Math.max(1, Math.min(MAX_LEVEL, level));
        return LEVEL_CURVE[clamped - 1];
    }

    /**
     * XP still required to reach the next level from a cumulative XP total, or
     * {@code 0} once {@link #MAX_LEVEL} is reached.
     */
    static int xpToNext(int xp) {
        int level = levelForXp(xp);
        if (level >= MAX_LEVEL) return 0;
        return LEVEL_CURVE[level] - xp; // LEVEL_CURVE[level] is the level+1 threshold
    }

    /** Multiplier applied to a Siegeling's base max HP at the given level. */
    static double hpMultiplier(int level) {
        return percentAtLevel(HP_PCT_PER_LEVEL, level) / 100.0;
    }

    /** Multiplier applied to a Siegeling's move (damage/heal/shield) values at the given level. */
    static double moveValueMultiplier(int level) {
        return percentAtLevel(MOVE_PCT_PER_LEVEL, level) / 100.0;
    }

    /** A Siegeling's base max HP scaled to the given level (rounded up, exact integer math). */
    static int scaledMaxHp(int baseMaxHp, int level) {
        return ceilPercent(baseMaxHp, percentAtLevel(HP_PCT_PER_LEVEL, level));
    }

    /** The SiegeKnight's base max HP scaled to the given level (rounded up). */
    static int scaledKnightMaxHp(int baseMaxHp, int level) {
        return ceilPercent(baseMaxHp, percentAtLevel(KNIGHT_HP_PCT_PER_LEVEL, level));
    }

    /** A Siegeling's move value scaled to the given level (rounded up). */
    static int scaledMoveValue(int baseValue, int level) {
        return ceilPercent(baseValue, percentAtLevel(MOVE_PCT_PER_LEVEL, level));
    }

    /** Flat Speed bonus a Siegeling has accrued by the given level (+1 at levels 3, 6 and 9). */
    static int speedBonus(int level) {
        int lvl = clampLevel(level);
        int bonus = 0;
        if (lvl >= 3) bonus++;
        if (lvl >= 6) bonus++;
        if (lvl >= 9) bonus++;
        return bonus;
    }

    /** Multiplier applied to the SiegeKnight's base max HP at the given level. */
    static double knightHpMultiplier(int level) {
        return percentAtLevel(KNIGHT_HP_PCT_PER_LEVEL, level) / 100.0;
    }

    /** Flat bonus added to the Knight's battle-start leadership passive (+1 every 2 levels). */
    static int knightPassiveBonus(int level) {
        return (clampLevel(level) - 1) / 2;
    }

    // ---- Battlegrounds (secondary "extraction" mode) ----------------------
    // Phase 3 core. Phase 4 will parameterize the tier scalar (I–V) so the same
    // formulas below drive every tier — the {@code tierScalar} argument is the
    // seam left for that. STANDARD/ENDLESS never read any of these constants.

    /** Minimum banked veteran Siegelings required to open the Battlegrounds lobby. */
    static final int BG_MIN_VETERANS = 3;
    /** How many veterans (and one veteran knight) a Battlegrounds squad fields. */
    static final int BG_SQUAD_SIZE = 3;

    /** Enemy max-HP growth per point of average veteran level (+8% each). */
    static final int BG_ENEMY_HP_PCT_PER_LEVEL = 8;
    /** Enemy damage growth per point of average veteran level (+5% each). */
    static final int BG_ENEMY_DMG_PCT_PER_LEVEL = 5;
    /** Elite-node density multiplier for Battlegrounds maps (+50% elites). */
    static final double BG_ELITE_DENSITY_MULT = 1.5;

    /** Gold earned in Battlegrounds is multiplied by this. */
    static final double BG_GOLD_MULT = 2.5;
    /** End-of-run score in Battlegrounds is multiplied by this. */
    static final double BG_SCORE_MULT = 3.0;

    /**
     * Difficulty/reward tier scalar. Phase 3 pins every Battlegrounds run to the
     * base tier ({@code 1.0}); Phase 4 raises it per tier (I–V) to scale both the
     * enemy strength ({@link #bgEnemyHpScalar}/{@link #bgEnemyDamageScalar}) and,
     * later, the reward multipliers off a single knob.
     */
    static final double BG_BASE_TIER_SCALAR = 1.0;

    /** Base gold granted in place of a disabled free recruit drop (before the BG ×2.5). */
    static final int BG_RECRUIT_GOLD = 40;

    /**
     * Enemy max-HP scalar for a Battlegrounds fight: {@code +8%} per average
     * veteran level, then multiplied by the tier scalar seam. {@code 1.0} at
     * average level 0 / base tier.
     */
    static double bgEnemyHpScalar(int averageVeteranLevel, double tierScalar) {
        double base = 1.0 + BG_ENEMY_HP_PCT_PER_LEVEL / 100.0 * Math.max(0, averageVeteranLevel);
        return base * Math.max(1.0, tierScalar);
    }

    /**
     * Enemy damage scalar for a Battlegrounds fight: {@code +5%} per average
     * veteran level, then multiplied by the tier scalar seam.
     */
    static double bgEnemyDamageScalar(int averageVeteranLevel, double tierScalar) {
        double base = 1.0 + BG_ENEMY_DMG_PCT_PER_LEVEL / 100.0 * Math.max(0, averageVeteranLevel);
        return base * Math.max(1.0, tierScalar);
    }

    /** A gold award scaled by the Battlegrounds ×2.5 bonus (rounded). */
    static int bgGold(int base) {
        return (int) Math.round(Math.max(0, base) * BG_GOLD_MULT);
    }

    /** An end-of-run score scaled by the Battlegrounds ×3 bonus (rounded). */
    static long bgScore(long score) {
        return Math.round(Math.max(0L, score) * BG_SCORE_MULT);
    }

    /** Percentage-of-base a stat sits at for the given level (100 at level 1). */
    private static int percentAtLevel(int pctPerLevel, int level) {
        return 100 + pctPerLevel * (clampLevel(level) - 1);
    }

    /** {@code ceil(base * percent / 100)} using exact integer math. */
    private static int ceilPercent(int base, int percent) {
        long numerator = (long) base * percent;
        return (int) ((numerator + 99) / 100);
    }

    private static int clampLevel(int level) {
        return Math.max(1, Math.min(MAX_LEVEL, level));
    }
}
