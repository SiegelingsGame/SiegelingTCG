package com.sieglings.mission;

import java.util.List;
import java.util.Optional;

/**
 * Static library of daily mission templates shown on the home hub and claimable for Siegecoins.
 */
public final class DailyMissionCatalog {

    private static final List<DailyMissionDefinition> MISSIONS = List.of(
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
                    "Cast 10 Spells",
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
                    "Spring 5 Traps",
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
            )
    );

    private DailyMissionCatalog() {
    }

    public static List<DailyMissionDefinition> all() {
        return MISSIONS;
    }

    public static List<DailyMissionDefinition> featured() {
        return MISSIONS.stream().filter(DailyMissionDefinition::featured).toList();
    }

    public static Optional<DailyMissionDefinition> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        return MISSIONS.stream().filter(m -> m.id().equals(id)).findFirst();
    }
}
