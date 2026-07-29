package com.sieglings.mission;

import java.util.List;

/**
 * Point-chest ladder that sits above the daily and weekly mission lists.
 *
 * <p>Claiming a mission banks its {@link DailyMissionDefinition#points()} into the
 * period's point pool; crossing a chest threshold makes that chest claimable for
 * Siegecoins, Remnants, and — on the final chest of each ladder — a random card
 * pull. Daily point pools reset with the daily counters, weekly pools with the
 * weekly counters, so the ladder is a "how much did you do today/this week"
 * bonus rather than a second progression currency.
 */
public final class MissionRewardTrack {

    /** One rung of the ladder: unlocked once the period's point pool reaches {@code threshold}. */
    public record Chest(int threshold, int gold, int remnants, int cardPulls) {}

    private static final List<Chest> DAILY = List.of(
            new Chest(20, 100, 25, 0),
            new Chest(40, 150, 40, 0),
            new Chest(60, 220, 60, 0),
            new Chest(80, 300, 90, 0),
            new Chest(100, 450, 140, 1)
    );

    private static final List<Chest> WEEKLY = List.of(
            new Chest(200, 400, 100, 0),
            new Chest(400, 600, 160, 0),
            new Chest(600, 850, 230, 0),
            new Chest(800, 1100, 320, 0),
            new Chest(1000, 1600, 500, 1)
    );

    private MissionRewardTrack() {
    }

    /** Lifetime missions feed the Knight Level track instead of a chest ladder. */
    public static List<Chest> forPeriod(MissionPeriod period) {
        return switch (period) {
            case WEEKLY -> WEEKLY;
            case LIFETIME -> List.of();
            default -> DAILY;
        };
    }

    public static boolean hasTrack(MissionPeriod period) {
        return !forPeriod(period).isEmpty();
    }

    /** Points needed for the last chest — the ladder's full-bar value. */
    public static int maxPoints(MissionPeriod period) {
        List<Chest> chests = forPeriod(period);
        return chests.isEmpty() ? 0 : chests.get(chests.size() - 1).threshold();
    }

    public static Chest findChest(MissionPeriod period, int threshold) {
        return forPeriod(period).stream()
                .filter(chest -> chest.threshold() == threshold)
                .findFirst()
                .orElse(null);
    }
}
