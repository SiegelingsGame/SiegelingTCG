package com.sieglings.chronicles;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards the difficulty curve with bare companions (no bond, mastery, technique or
 * gear): a starter can clear its first patrol, under-levelled companies can't walk
 * through dungeons, and the right company at the right level can.
 */
class ChroniclesBalanceTest {
    private final ChroniclesService service = new ChroniclesService(new ChroniclesStore(), null);

    @Test
    void everyStarterUsuallyClearsTheFirstPatrol() {
        for (String starter : ChroniclesContent.STARTERS) {
            int pct = completionRate("mossroot_patrol", 1, starter);
            assertTrue(pct >= 45, starter + " cleared the first patrol only " + pct + "% of the time");
        }
        assertTrue(completionRate("mossroot_patrol", 3, "sundile") >= 85);
    }

    @Test
    void dungeonsRejectUnderLevelledCompaniesAndRewardPreparedOnes() {
        assertTrue(completionRate("cinder_hollow", 10, "cacty", "fawny", "pursula") <= 10);
        assertTrue(completionRate("cinder_hollow", 18, "jackedty", "chilldoe", "purseus") >= 40);
        assertTrue(completionRate("old_rootcrypt", 25, "jackedty", "chilldoe", "raydile") >= 80);
    }

    @Test
    void sameSeedReplaysTheSameExpedition() {
        ChroniclesState state = state(4, "cacty", "fawny");
        ChroniclesContent.Route route = ChroniclesContent.ROUTES.get("mossroot_hunt");
        var a = ChroniclesCombat.simulate(service.buildInput(state, route, state.companions, null, Map.of("herb_tonic", 2), 99));
        var b = ChroniclesCombat.simulate(service.buildInput(state, route, state.companions, null, Map.of("herb_tonic", 2), 99));
        assertEquals(a.outcome, b.outcome);
        assertEquals(a.timeline.size(), b.timeline.size());
        for (int i = 0; i < a.timeline.size(); i++) assertEquals(a.timeline.get(i).text, b.timeline.get(i).text);
        assertEquals(a.loot, b.loot);
    }

    private int completionRate(String routeId, int level, String... species) {
        ChroniclesState state = state(level, species);
        ChroniclesContent.Route route = ChroniclesContent.ROUTES.get(routeId);
        int complete = 0;
        for (int seed = 0; seed < 200; seed++) {
            var result = ChroniclesCombat.simulate(service.buildInput(state, route, state.companions, null,
                    Map.of("herb_tonic", 3), seed));
            if ("complete".equals(result.outcome)) complete++;
        }
        return complete / 2;
    }

    private static ChroniclesState state(int level, String... species) {
        ChroniclesState state = new ChroniclesState();
        state.userId = "balance";
        List<String> ids = new ArrayList<>();
        int n = 1;
        for (String sp : species) {
            ChroniclesState.Companion c = new ChroniclesState.Companion();
            c.id = "c" + n++;
            c.speciesId = sp;
            c.nickname = sp;
            c.level = level;
            state.companions.add(c);
            ids.add(c.id);
        }
        state.party = ids;
        return state;
    }
}
