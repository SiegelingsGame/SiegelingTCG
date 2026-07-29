package com.sieglings.mission;

/**
 * @param reward Siegecoins paid directly when the mission is claimed.
 * @param points Banked into the period's reward track on claim — daily/weekly
 *               points fill the {@link MissionRewardTrack} chest ladder, lifetime
 *               points feed the account-wide {@link KnightLevelTrack}.
 */
public record DailyMissionDefinition(
        String id,
        MissionPeriod period,
        DailyMissionType type,
        String title,
        String icon,
        boolean coinIcon,
        int target,
        int reward,
        int points,
        boolean featured
) {
    /** Convenience constructor for daily missions (the original shape). */
    public DailyMissionDefinition(
            String id,
            DailyMissionType type,
            String title,
            String icon,
            boolean coinIcon,
            int target,
            int reward,
            int points,
            boolean featured
    ) {
        this(id, MissionPeriod.DAILY, type, title, icon, coinIcon, target, reward, points, featured);
    }
}
