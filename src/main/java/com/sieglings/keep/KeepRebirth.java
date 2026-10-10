package com.sieglings.keep;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Keep rebirth: once the Covenant Hall reaches the Grand Keep, the keeper may let the
 * sanctuary return to the earth and rebuild it. Buildings, stock and stored production
 * reset; what the keeper has learned does not — Siegeling rapport, lore and voices,
 * Keeper level and owned decorations all carry over.
 *
 * <p>Each rebirth stacks permanent bonuses (production, storage, build speed, a larger
 * starting stockpile) and also scales build costs up, so a reborn Keep rebuilds faster
 * but every cycle still asks for more than the last. Production outpaces cost at every
 * count (+25% vs +15% per rebirth), so a rebirth is always a net gain.
 *
 * <p>All numbers are pure functions of the rebirth count, so the simulation, the
 * snapshot and the preview of the next rebirth can never disagree.
 */
final class KeepRebirth {

    /** The Hall level a Keep must reach before it can be reborn (the Grand Keep). */
    static final int REQUIRED_HALL_LEVEL = KeepService.HALL_MAX_LEVEL;
    /** Bounds the stacking so late counts cannot run away; the bonuses stop growing here. */
    static final int MAX_REBIRTHS = 10;

    static final int PRODUCTION_PERCENT_PER_REBIRTH = 25;
    static final int STORAGE_PERCENT_PER_REBIRTH = 20;
    static final int BUILD_SPEED_PERCENT_PER_REBIRTH = 10;
    /** Builds never take less than this share of their shipped time. */
    static final int MIN_BUILD_TIME_PERCENT = 40;
    static final int COST_PERCENT_PER_REBIRTH = 15;
    static final int STARTING_TIMBER_PER_REBIRTH = 120;

    static final int REWARD_COINS_PER_REBIRTH = 400;
    static final int REWARD_REMNANTS_PER_REBIRTH = 100;

    /** Ranks a reborn Keep wears beside its Hall rank. Index is the rebirth count. */
    private static final String[] TITLES = {
            "", "Reborn", "Twice-Risen", "Thrice-Risen", "Evergreen", "Ageless",
            "Undying", "Eternal", "Mythic", "Legendary", "Covenant Eternal"
    };

    private KeepRebirth() { }

    static int clamp(int rebirths) {
        return Math.max(0, Math.min(MAX_REBIRTHS, rebirths));
    }

    static double productionMultiplier(int rebirths) {
        return 1 + clamp(rebirths) * PRODUCTION_PERCENT_PER_REBIRTH / 100.0;
    }

    static double storageMultiplier(int rebirths) {
        return 1 + clamp(rebirths) * STORAGE_PERCENT_PER_REBIRTH / 100.0;
    }

    static double buildTimeMultiplier(int rebirths) {
        int percent = Math.max(MIN_BUILD_TIME_PERCENT, 100 - clamp(rebirths) * BUILD_SPEED_PERCENT_PER_REBIRTH);
        return percent / 100.0;
    }

    static double costMultiplier(int rebirths) {
        return 1 + clamp(rebirths) * COST_PERCENT_PER_REBIRTH / 100.0;
    }

    static int startingTimber(int rebirths) {
        return KeepService.INITIAL_TIMBER + clamp(rebirths) * STARTING_TIMBER_PER_REBIRTH;
    }

    static int scaleCost(int amount, int rebirths) {
        return amount <= 0 ? amount : (int) Math.round(amount * costMultiplier(rebirths));
    }

    static long scaleDuration(long seconds, int rebirths) {
        return Math.max(1, Math.round(seconds * buildTimeMultiplier(rebirths)));
    }

    /** Coins paid for reaching the given rebirth (the 1st pays 400, the 2nd 800, ...). */
    static int rewardCoins(int newCount) {
        return clamp(newCount) * REWARD_COINS_PER_REBIRTH;
    }

    static int rewardRemnants(int newCount) {
        return clamp(newCount) * REWARD_REMNANTS_PER_REBIRTH;
    }

    static String title(int rebirths) {
        return TITLES[clamp(rebirths)];
    }

    /** The bonuses a Keep holds at the given count, as the client renders them. */
    static Map<String, Object> bonuses(int rebirths) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("productionPercent", (int) Math.round((productionMultiplier(rebirths) - 1) * 100));
        out.put("storagePercent", (int) Math.round((storageMultiplier(rebirths) - 1) * 100));
        out.put("buildSpeedPercent", (int) Math.round((1 - buildTimeMultiplier(rebirths)) * 100));
        out.put("costPercent", (int) Math.round((costMultiplier(rebirths) - 1) * 100));
        out.put("startingTimber", startingTimber(rebirths));
        return out;
    }
}
