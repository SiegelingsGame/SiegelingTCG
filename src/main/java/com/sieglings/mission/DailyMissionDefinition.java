package com.sieglings.mission;

public record DailyMissionDefinition(
        String id,
        DailyMissionType type,
        String title,
        String icon,
        boolean coinIcon,
        int target,
        int reward,
        boolean featured
) {
}
