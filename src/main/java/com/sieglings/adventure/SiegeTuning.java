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

    // ---- Level-up rewards -------------------------------------------------

    /**
     * Flat max HP a Siegeling gains per level, on top of the percentage curve
     * above. Flat so a level still feels like something on a small starter.
     * Part of the derived curve rather than folded into base HP on the way past,
     * so every route to level N — XP in a run, a checkpoint reload, a
     * Battlegrounds squad rebuilt from extracted veterans — lands on the same
     * max HP.
     */
    static final int LEVELUP_BONUS_HP = 5;

    /** Extra magnitude an amplified move gains (damage, heal, shield, buff). */
    static final int AMP_VALUE_BONUS = 4;
    /** AP an amplified move costs less; never below 0. */
    static final int AMP_COST_REDUCTION = 1;
    /** Healing a swap move's HEAL rider restores to both units it moved. */
    static final int AMP_SWAP_HEAL = 6;
    /** Shield a swap move's SHIELD rider grants to both units it moved. */
    static final int AMP_SWAP_SHIELD = 5;
    /** Attack a swap move's ATTACK rider adds to both units it moved. */
    static final int AMP_SWAP_ATTACK = 2;

    // ---- Buff durations ---------------------------------------------------

    /**
     * Rounds a card-granted attack buff lasts. Stat buffs used to run for the
     * whole battle, so a repeatable buff card compounded every turn and every
     * later attack cashed the whole stack — an upgraded booster was worth more
     * than any damage card by round three. A short window keeps the buff a
     * setup play (buff, then swing) instead of a permanent stat purchase.
     */
    static final int BUFF_ATK_ROUNDS = 2;
    /** Rounds a card-granted speed buff lasts; same reasoning as {@link #BUFF_ATK_ROUNDS}. */
    static final int BUFF_SPD_ROUNDS = 2;
    /** Rounds the buff half of a once-per-battle Knight ultimate lasts — longer, since it costs the ultimate. */
    static final int ULTIMATE_BUFF_ROUNDS = 3;
    /** Rounds a swap move's ATTACK amp rider lasts; it rides a positioning move, so it matches a card buff. */
    static final int RIDER_BUFF_ROUNDS = 2;
    /** Rounds a mercenary's signature Boon buff lasts — one round longer than a stock card buff. */
    static final int BOON_BUFF_ROUNDS = 3;

    /**
     * Default duration for a buff granted by an ability that does not state one.
     * Non-buff effects get 0: they have nothing to expire.
     *
     * <p>Battle-long buffs still exist, but they are loadout, not plays — the
     * Knight's ATTACK/SPEED leadership passive and carried items grant theirs at
     * battle start and are applied through the untimed buff path instead.
     */
    static int defaultBuffRounds(Effect effect) {
        if (effect == null) return 0;
        return switch (effect) {
            case BUFF_ATK -> BUFF_ATK_ROUNDS;
            case BUFF_SPD -> BUFF_SPD_ROUNDS;
            default -> 0;
        };
    }

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
        int clamped = Math.max(1, Math.min(MAX_LEVEL, level));
        return ceilPercent(baseMaxHp, percentAtLevel(HP_PCT_PER_LEVEL, level))
                + LEVELUP_BONUS_HP * (clamped - 1);
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

    // ---- Account SiegeKnight level / rarity crossover ---------------------
    // A knight levelled in the collection (PlayerProgressionService trainer
    // levels, 1..TRAINER_MAX_LEVEL) marches into Siege at that rank: the same
    // card is stronger here once it has been levelled there. Rarity rides
    // along so a Legendary leads harder than a Common at the same level.

    /** Highest account (collection) knight level the crossover scales against. */
    static final int ACCOUNT_MAX_LEVEL = 5;
    /** Percent added to Siege leadership power per account level above 1. */
    static final int ACCOUNT_PCT_PER_LEVEL = 15;
    /** Percent added per rarity step above Common. */
    static final int RARITY_PCT_PER_STEP = 10;
    /** Percent added per in-run knight level above 1. */
    static final int RUN_PCT_PER_LEVEL = 5;

    static int clampAccountLevel(int level) {
        return Math.max(1, Math.min(ACCOUNT_MAX_LEVEL, level));
    }

    /** 0 for Common … 4 for Legendary; unknown rarity reads as Common. */
    static int rarityStep(com.sieglings.model.enums.Rarity rarity) {
        if (rarity == null) return 0;
        return switch (rarity) {
            case COMMON -> 0;
            case UNCOMMON -> 1;
            case RARE -> 2;
            case EPIC -> 3;
            case LEGENDARY -> 4;
        };
    }

    /**
     * Multiplier on a knight's Siege leadership power (passive magnitude and
     * Ultimate strength) from its collection level, its rarity, and the level it
     * has reached inside the current run. 1.0 for a Common at account level 1.
     */
    static double knightPowerScale(int accountLevel, com.sieglings.model.enums.Rarity rarity, int runLevel) {
        int pct = ACCOUNT_PCT_PER_LEVEL * (clampAccountLevel(accountLevel) - 1)
                + RARITY_PCT_PER_STEP * rarityStep(rarity)
                + RUN_PCT_PER_LEVEL * (clampLevel(runLevel) - 1);
        return 1.0 + pct / 100.0;
    }

    /** Scales a base magnitude by {@link #knightPowerScale}, never below the base. */
    static int scalePower(int base, int accountLevel, com.sieglings.model.enums.Rarity rarity, int runLevel) {
        return Math.max(base, (int) Math.round(base * knightPowerScale(accountLevel, rarity, runLevel)));
    }

    // ---- Battlegrounds (secondary "extraction" mode) ----------------------
    // Phase 3 core. Phase 4 will parameterize the tier scalar (I–V) so the same
    // formulas below drive every tier — the {@code tierScalar} argument is the
    // seam left for that. STANDARD/ENDLESS never read any of these constants.

    /** Minimum banked veteran Siegelings required to open the Battlegrounds lobby. */
    static final int BG_MIN_VETERANS = 3;
    // ---- Opening fight ----------------------------------------------------
    // The run's first battle is a fixed yardstick rather than a scaled encounter:
    // every warband meets the same foe, so a Marshal's pair and a lone Siegeling
    // start from an identical difficulty. Every later fight goes back through the
    // usual party-size/floor scaling in SiegeContentService#generateEnemies, which
    // is anchored on these numbers. Values sit mid-band of what a solo warband
    // used to roll at floor 1, so the opening feels unchanged for a solo start.
    //
    // The opener is a pair because every Siege encounter is now a squad of 2–3
    // (SiegeContentService#generateEnemies) and the first fight should teach the
    // real shape of a battle. Its difficulty is unchanged: the per-foe numbers are
    // the old single foe's split across two bodies and then raised ~15% for the
    // focus-fire decay a squad pays (see the budget note in generateEnemies), so
    // 2x17 HP / 2x3 damage lands on the same yardstick as one 30 HP / 5 damage foe.

    /** Foes in the opening fight. */
    static final int OPENING_FIGHT_FOES = 2;
    /** Max HP of each opening-fight foe. */
    static final int OPENING_FIGHT_HP = 17;
    /** Damage of the opening foe's single attack. */
    static final int OPENING_FIGHT_DAMAGE = 3;
    /** Speed of each opening-fight foe (decides who acts first). */
    static final int OPENING_FIGHT_SPEED = 8;

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

    // ---- Phase 4: tiers I–V, Warmarks, fatigue ----------------------------
    // Tier N (1-based) raises both the difficulty scalar (fed into
    // bgEnemyHpScalar/bgEnemyDamageScalar) and the reward multipliers. Clearing a
    // tier for the first time unlocks the next and awards bonus Warmarks. Tiers at
    // or above BG_SECOND_BOON_MIN_TIER grant a second boon pick after the first boss.

    /** Highest Battlegrounds tier (tiers are 1..{@code BG_MAX_TIER}, shown as I–V). */
    static final int BG_MAX_TIER = 5;
    /** Lowest tier that grants a second boon pick after the first boss. */
    static final int BG_SECOND_BOON_MIN_TIER = 3;

    /** Difficulty/reward tier scalar per tier (index {@code tier-1}); tier I is the base 1.0. */
    static final double[] BG_TIER_SCALARS = {1.0, 1.25, 1.55, 1.9, 2.3};
    /** Reward (gold/warmarks/score) multiplier per tier (index {@code tier-1}). */
    static final double[] BG_TIER_REWARD_MULT = {1.0, 1.3, 1.7, 2.2, 2.8};

    /** Warmarks awarded per boss killed in Battlegrounds (before the tier reward multiplier). */
    static final int BG_WARMARKS_PER_BOSS = 15;
    /** Warmarks awarded on a Battlegrounds win (before the tier reward multiplier). */
    static final int BG_WARMARKS_WIN = 25;
    /** Bonus Warmarks the first time a tier is cleared (before the tier reward multiplier). */
    static final int BG_WARMARKS_FIRST_CLEAR = 40;

    /** Fatigue lockout applied to a squad's veteran teams when a Battlegrounds run is LOST (24h). */
    static final long BG_FATIGUE_LOCKOUT_MS = 24L * 60 * 60 * 1000;

    /** Clamps a tier to 1..{@link #BG_MAX_TIER}. */
    static int clampTier(int tier) {
        return Math.max(1, Math.min(BG_MAX_TIER, tier));
    }

    /** The difficulty/reward scalar for a tier (fed into {@link #bgEnemyHpScalar}). */
    static double bgTierScalar(int tier) {
        return BG_TIER_SCALARS[clampTier(tier) - 1];
    }

    /** The gold/warmarks/score reward multiplier for a tier. */
    static double bgTierRewardMult(int tier) {
        return BG_TIER_REWARD_MULT[clampTier(tier) - 1];
    }

    /** Whether a tier grants the second boon pick (tiers III+). */
    static boolean enablesSecondBoon(int tier) {
        return clampTier(tier) >= BG_SECOND_BOON_MIN_TIER;
    }

    /** A base Warmark award scaled by the tier reward multiplier (rounded, min 0). */
    static int bgWarmarks(int base, int tier) {
        return (int) Math.round(Math.max(0, base) * bgTierRewardMult(tier));
    }

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

    /** A gold award scaled by the Battlegrounds ×2.5 bonus and the tier reward multiplier. */
    static int bgGold(int base, int tier) {
        return (int) Math.round(Math.max(0, base) * BG_GOLD_MULT * bgTierRewardMult(tier));
    }

    /** An end-of-run score scaled by the Battlegrounds ×3 bonus (rounded). */
    static long bgScore(long score) {
        return Math.round(Math.max(0L, score) * BG_SCORE_MULT);
    }

    /** An end-of-run score scaled by the Battlegrounds ×3 bonus and the tier reward multiplier. */
    static long bgScore(long score, int tier) {
        return Math.round(Math.max(0L, score) * BG_SCORE_MULT * bgTierRewardMult(tier));
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
