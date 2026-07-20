package com.sieglings.mission;

public record DailyMissionDefinition(
        String id,
        MissionPeriod period,
        DailyMissionType type,
        String title,
        String icon,
        boolean coinIcon,
        int target,
        int reward,
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
            boolean featured
    ) {
        this(id, MissionPeriod.DAILY, type, title, icon, coinIcon, target, reward, featured);
    }
}
