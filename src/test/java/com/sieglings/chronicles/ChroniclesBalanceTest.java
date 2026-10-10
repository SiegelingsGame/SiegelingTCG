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
    void laterTiersStayChallengingForTheirIntendedCompanies() {
        assertTrue(completionRate("tidewater_patrol", 18, "jackedty", "chilldoe", "raydile") >= 70,
                "a Tier II patrol suits evolved Siegelings at 18");
        int grotto = completionRate("sunken_grotto", 24, "jackedty", "chilldoe", "raydile");
        assertTrue(grotto >= 15 && grotto <= 80, "Sunken Grotto is a real fight: " + grotto);
        int umbral = completionRate("umbral_hunt", 30, "cactyjackedty", "frostag", "hydroxyl");
        assertTrue(umbral >= 25 && umbral <= 90, "Tier III hunt: " + umbral);
        assertTrue(completionRate("trial_ancient_eclipse", 50, "cactyjackedty", "frostag", "hurricrane") <= 45,
                "the hardest legendary trial is never routine");
    }

    @Test
    void wardingATwistMakesItsRegionEasier() {
        ChroniclesState state = state(36, "cactyjackedty", "frostag", "hydroxyl");
        ChroniclesContent.Route vault = ChroniclesContent.ROUTES.get("lich_vault");
        int plain = 0, warded = 0;
        for (int seed = 0; seed < 150; seed++) {
            state.relicId = "";
            if ("complete".equals(ChroniclesCombat.simulate(service.buildInput(state, vault, state.companions, null,
                    Map.of("herb_tonic", 4), seed)).outcome)) plain++;
            state.relicId = "grave_ward";
            if ("complete".equals(ChroniclesCombat.simulate(service.buildInput(state, vault, state.companions, null,
                    Map.of("herb_tonic", 4), seed)).outcome)) warded++;
        }
        assertTrue(warded > plain, "Grave Ward keeps the dead down: " + warded + " vs " + plain);
    }

    @Test
    void legendaryBondTrialsAreFairButNeverAFormality() {
        int hardest = 100;
        for (String[] c : new String[][]{{"raydile", "25"}, {"jackedty", "25"}, {"frostag", "50"},
                {"solgator", "50"}, {"hurricrane", "50"}, {"pyleer", "50"}, {"jawbite", "50"}}) {
            ChroniclesState state = state(Integer.parseInt(c[1]), c[0]);
            ChroniclesState.Companion hero = state.companions.get(0);
            hero.bond = ChroniclesContent.bondForLevel(100);
            for (String cls : ChroniclesContent.CLASSES) state.masteryXp.put(cls, ChroniclesContent.xpForLevel(40));
            int passed = 0;
            for (int seed = 0; seed < 150; seed++) {
                var res = ChroniclesCombat.simulate(service.buildInput(state, service.trialRoute(hero), List.of(hero), null,
                        Map.of(), seed));
                if ("complete".equals(res.outcome) && res.encountersWon == res.encountersTotal) passed++;
            }
            int pct = passed * 100 / 150;
            assertTrue(pct >= 25, c[0] + " at Bond 100 should have a real chance: " + pct + "%");
            hardest = Math.min(hardest, pct);
        }
        assertTrue(hardest <= 70, "some trials must stay a real test");
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
        if (level >= 18) seasoned(state, level);
        ChroniclesContent.Route route = ChroniclesContent.ROUTES.get(routeId);
        int complete = 0;
        for (int seed = 0; seed < 200; seed++) {
            var result = ChroniclesCombat.simulate(service.buildInput(state, route, state.companions, null,
                    Map.of("herb_tonic", 3), seed));
            if ("complete".equals(result.outcome)) complete++;
        }
        return complete / 2;
    }

    /** A company that has adventured to reach these levels: Bond 25 and mastery at half its level. */
    private static void seasoned(ChroniclesState state, int level) {
        for (ChroniclesState.Companion c : state.companions) c.bond = ChroniclesContent.bondForLevel(25);
        for (String cls : ChroniclesContent.CLASSES) state.masteryXp.put(cls, ChroniclesContent.xpForLevel(level / 2));
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
