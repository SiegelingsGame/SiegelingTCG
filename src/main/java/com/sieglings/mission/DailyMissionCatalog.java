package com.sieglings.mission;

import java.util.List;
import java.util.Optional;

/**
 * Static library of mission templates shown on the home hub and claimable for
 * Siegecoins. Missions span three scopes (see {@link MissionPeriod}): daily
 * objectives reset each day, weekly objectives reset each ISO week, and lifetime
 * milestones accumulate forever and pay out once.
 */
public final class DailyMissionCatalog {

    private static final List<DailyMissionDefinition> DAILY = List.of(
            new DailyMissionDefinition(
                    "pvp-wins-3",
                    DailyMissionType.PVP_WINS,
                    "Win 3 PVP Matches",
                    "X",
                    false,
                    3,
                    150,
                    true
            ),
            new DailyMissionDefinition(
                    "pack-opens-2",
                    DailyMissionType.PACK_OPENS,
                    "Open 2 Packs",
                    "P",
                    false,
                    2,
                    100,
                    true
            ),
            new DailyMissionDefinition(
                    "siegecoins-300",
                    DailyMissionType.SIEGECOINS_EARNED,
                    "Earn 300 Siegecoins",
                    "coin",
                    true,
                    300,
                    150,
                    true
            ),
            new DailyMissionDefinition(
                    "solo-wins-2",
                    DailyMissionType.SOLO_WINS,
                    "Win 2 Solo Matches",
                    "S",
                    false,
                    2,
                    120,
                    false
            ),
            new DailyMissionDefinition(
                    "spells-10",
                    DailyMissionType.SPELLS_CAST,
                    "Use 10 Strategies",
                    "M",
                    false,
                    10,
                    100,
                    false
            ),
            new DailyMissionDefinition(
                    "siegelings-15",
                    DailyMissionType.SIEGELINGS_DEFEATED,
                    "Defeat 15 Siegelings",
                    "G",
                    false,
                    15,
                    125,
                    false
            ),
            new DailyMissionDefinition(
                    "traps-5",
                    DailyMissionType.TRAPS_SPRUNG,
                    "Spring 5 Deceptions",
                    "T",
                    false,
                    5,
                    90,
                    false
            ),
            new DailyMissionDefinition(
                    "matches-5",
                    DailyMissionType.MATCHES_PLAYED,
                    "Play 5 Matches",
                    "A",
                    false,
                    5,
                    80,
                    false
            ),
            new DailyMissionDefinition(
                    "siege-run-1",
                    DailyMissionType.SIEGE_RUNS,
                    "Run 1 Siege Expedition",
                    "E",
                    false,
                    1,
                    110,
                    false
            )
    );

    private static final List<DailyMissionDefinition> WEEKLY = List.of(
            new DailyMissionDefinition(
                    "weekly-matches-25",
                    MissionPeriod.WEEKLY,
                    DailyMissionType.MATCHES_PLAYED,
                    "Play 25 Matches",
                    "A",
                    false,
                    25,
                    400,
                    true
            ),
            new DailyMissionDefinition(
                    "weekly-pvp-10",
                    MissionPeriod.WEEKLY,
                    DailyMissionType.PVP_WINS,
                    "Win 10 PVP Matches",
                    "X",
                    false,
                    10,
                    500,
                    true
            ),
            new DailyMissionDefinition(
                    "weekly-packs-10",
                    MissionPeriod.WEEKLY,
                    DailyMissionType.PACK_OPENS,
                    "Open 10 Packs",
                    "P",
                    false,
                    10,
                    350,
                    true
            ),
            new DailyMissionDefinition(
                    "weekly-siegecoins-2000",
                    MissionPeriod.WEEKLY,
                    DailyMissionType.SIEGECOINS_EARNED,
                    "Earn 2,000 Siegecoins",
                    "coin",
                    true,
                    2000,
                    450,
                    false
            ),
            new DailyMissionDefinition(
                    "weekly-siege-bosses-5",
                    MissionPeriod.WEEKLY,
                    DailyMissionType.SIEGE_BOSS_KILLS,
                    "Defeat 5 Siege Bosses",
                    "B",
                    false,
                    5,
                    550,
                    false
            ),
            new DailyMissionDefinition(
                    "weekly-siegelings-100",
                    MissionPeriod.WEEKLY,
                    DailyMissionType.SIEGELINGS_DEFEATED,
                    "Defeat 100 Siegelings",
                    "G",
                    false,
                    100,
                    400,
                    false
            )
    );

    private static final List<DailyMissionDefinition> LIFETIME = List.of(
            new DailyMissionDefinition(
                    "life-matches-100",
                    MissionPeriod.LIFETIME,
                    DailyMissionType.MATCHES_PLAYED,
                    "Play 100 Matches",
                    "A",
                    false,
                    100,
                    750,
                    true
            ),
            new DailyMissionDefinition(
                    "life-pvp-100",
                    MissionPeriod.LIFETIME,
                    DailyMissionType.PVP_WINS,
                    "Win 100 PVP Matches",
                    "X",
                    false,
                    100,
                    1500,
                    true
            ),
            new DailyMissionDefinition(
                    "life-packs-100",
                    MissionPeriod.LIFETIME,
                    DailyMissionType.PACK_OPENS,
                    "Open 100 Packs",
                    "P",
                    false,
                    100,
                    1000,
                    false
            ),
            new DailyMissionDefinition(
                    "life-siege-wins-25",
                    MissionPeriod.LIFETIME,
                    DailyMissionType.SIEGE_WINS,
                    "Complete 25 Siege Expeditions",
                    "E",
                    false,
                    25,
                    2000,
                    true
            ),
            new DailyMissionDefinition(
                    "life-siege-bosses-50",
                    MissionPeriod.LIFETIME,
                    DailyMissionType.SIEGE_BOSS_KILLS,
                    "Defeat 50 Siege Bosses",
                    "B",
                    false,
                    50,
                    1750,
                    false
            ),
            new DailyMissionDefinition(
                    "life-siegecoins-25000",
                    MissionPeriod.LIFETIME,
                    DailyMissionType.SIEGECOINS_EARNED,
                    "Earn 25,000 Siegecoins",
                    "coin",
                    true,
                    25000,
                    1250,
                    false
            )
    );

    private static final List<DailyMissionDefinition> ALL;

    static {
        java.util.List<DailyMissionDefinition> combined = new java.util.ArrayList<>();
        combined.addAll(DAILY);
        combined.addAll(WEEKLY);
        combined.addAll(LIFETIME);
        ALL = List.copyOf(combined);
    }

    private DailyMissionCatalog() {
    }

    /** Daily missions only (backwards-compatible with the original home hub feed). */
    public static List<DailyMissionDefinition> all() {
        return DAILY;
    }

    public static List<DailyMissionDefinition> daily() {
        return DAILY;
    }

    public static List<DailyMissionDefinition> weekly() {
        return WEEKLY;
    }

    public static List<DailyMissionDefinition> lifetime() {
        return LIFETIME;
    }

    public static List<DailyMissionDefinition> forPeriod(MissionPeriod period) {
        return switch (period) {
            case WEEKLY -> WEEKLY;
            case LIFETIME -> LIFETIME;
            default -> DAILY;
        };
    }

    public static List<DailyMissionDefinition> featured() {
        return DAILY.stream().filter(DailyMissionDefinition::featured).toList();
    }

    public static Optional<DailyMissionDefinition> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        return ALL.stream().filter(m -> m.id().equals(id)).findFirst();
    }
}
