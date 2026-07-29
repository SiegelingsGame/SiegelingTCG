package com.sieglings.mission;

/**
 * Account-wide "Knight Level", fed exclusively by claimed lifetime missions.
 *
 * <p>Every lifetime mission banks its points here permanently. Each level reached
 * pays out Siegecoins, Remnants, and card pulls; every fifth level is a milestone
 * that pays a larger card bundle. Players start at level 1 with zero points, so
 * level N is reached once the pool covers the cumulative cost of levels 2..N.
 */
public final class KnightLevelTrack {

    public static final int MAX_LEVEL = 30;

    /** Rewards paid out for reaching a given level. */
    public record LevelReward(int level, int gold, int remnants, int cardPulls) {}

    private KnightLevelTrack() {
    }

    /**
     * Points needed to advance from {@code level} to {@code level + 1}. Returns 0
     * at the cap so the frontend can render a "maxed" bar without dividing by zero.
     */
    public static int pointsToAdvance(int level) {
        if (level < 1 || level >= MAX_LEVEL) {
            return 0;
        }
        return 100 + (level - 1) * 50;
    }

    /** Cumulative points required before a player is at {@code level}. */
    public static int cumulativePoints(int level) {
        int capped = Math.max(1, Math.min(MAX_LEVEL, level));
        int total = 0;
        for (int step = 1; step < capped; step++) {
            total += pointsToAdvance(step);
        }
        return total;
    }

    public static int levelForPoints(int points) {
        int safe = Math.max(0, points);
        int level = 1;
        while (level < MAX_LEVEL && safe >= pointsToAdvance(level)) {
            safe -= pointsToAdvance(level);
            level++;
        }
        return level;
    }

    /** Points banked toward the next level (0 once the cap is reached). */
    public static int pointsIntoLevel(int points) {
        return Math.max(0, points) - cumulativePoints(levelForPoints(points));
    }

    public static LevelReward rewardForLevel(int level) {
        int capped = Math.max(1, Math.min(MAX_LEVEL, level));
        boolean milestone = capped % 5 == 0;
        return new LevelReward(
                capped,
                200 + capped * 50,
                75 + capped * 25,
                milestone ? 3 : 1
        );
    }
}
