package com.sieglings.keep;

import java.util.LinkedHashMap;
import java.util.List;
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
 * <p>Every rebirth has its own requirement ({@link #requirement}): progress checks that
 * reach deeper into the tech tree each time (the Enclave, then every workshop, then
 * level-2 workshops, Akhar's Front tiers, storage annexes and Keeper levels) plus a
 * resource bill that climbs through the refined tiers in {@link KeepEconomy}. The bill
 * is spent when the Keep is reborn.
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

    /**
     * What one rebirth asks for. Check ids are evaluated by KeepService:
     * {@code hall:N}, {@code enclave}, {@code builders_yard}, {@code workshops_built:N},
     * {@code storehouse:N}, {@code workshops_l2:N}, {@code akhars_front:N},
     * {@code annexes:N} and {@code keeper_level:N}. Costs are keyed by resource id
     * ("timber", a raw material or a refined material).
     */
    record Requirement(List<String> checks, Map<String, Integer> costs) { }

    private static final List<Requirement> LADDER = List.of(
            req(List.of("hall:8", "enclave", "builders_yard"),
                    "timber", 400, "stone", 30, "living_mortar", 2),
            req(List.of("hall:8", "workshops_built:6", "storehouse:2"),
                    "timber", 600, "living_mortar", 3, "tempered_glass", 3, "charged_alloy", 2),
            req(List.of("hall:8", "workshops_l2:3", "akhars_front:1"),
                    "timber", 800, "hearth_ration", 3, "covenant_keystone", 1),
            req(List.of("hall:8", "workshops_l2:6", "akhars_front:2"),
                    "timber", 1000, "covenant_keystone", 2, "aether_core", 1),
            req(List.of("hall:8", "akhars_front:3", "annexes:3"),
                    "timber", 1200, "covenant_keystone", 2, "aether_core", 2, "heartwood_relic", 1),
            req(List.of("hall:8", "akhars_front:4", "annexes:5"),
                    "timber", 1200, "aether_core", 2, "heartwood_relic", 2),
            req(List.of("hall:8", "annexes:7", "keeper_level:15"),
                    "timber", 1400, "covenant_keystone", 3, "heartwood_relic", 3),
            req(List.of("hall:8", "annexes:7", "keeper_level:20"),
                    "timber", 1400, "aether_core", 3, "heartwood_relic", 4),
            req(List.of("hall:8", "annexes:7", "keeper_level:23"),
                    "timber", 1600, "covenant_keystone", 4, "aether_core", 3, "heartwood_relic", 5),
            req(List.of("hall:8", "annexes:7", "keeper_level:25"),
                    "timber", 1800, "covenant_keystone", 4, "aether_core", 4, "heartwood_relic", 6));

    private static Requirement req(List<String> checks, Object... costs) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < costs.length; i += 2) out.put((String) costs[i], (Integer) costs[i + 1]);
        return new Requirement(List.copyOf(checks), out);
    }

    /** The requirement for reaching the given rebirth (1-based), or null past the cap. */
    static Requirement requirement(int targetCount) {
        return targetCount < 1 || targetCount > LADDER.size() ? null : LADDER.get(targetCount - 1);
    }

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
