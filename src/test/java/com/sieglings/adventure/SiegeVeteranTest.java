package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Coverage for Siege team extraction (Phase 2) that does not touch Firestore:
 * an in-memory {@link SiegeVeteranStore} subclass overrides the persistence I/O,
 * so the tests exercise the real eviction / ordering logic plus the pure snapshot
 * (party → members/deck) and flatten (teams → veteran Siegelings) helpers.
 */
class SiegeVeteranTest {

    private static final String USER = "player@example.com";

    /** A store backed by a plain in-memory map instead of Firestore. */
    private static final class InMemoryVeteranStore extends SiegeVeteranStore {
        private final Map<String, List<Map<String, Object>>> data = new HashMap<>();

        @Override
        protected List<Map<String, Object>> loadRaw(String userId) {
            List<Map<String, Object>> teams = data.get(userId);
            return teams == null ? new ArrayList<>() : new ArrayList<>(teams);
        }

        @Override
        protected void persistRaw(String userId, List<Map<String, Object>> teams) {
            data.put(userId, new ArrayList<>(teams));
        }
    }

    // ---- store: eviction + ordering --------------------------------------

    @Test
    void savingTeamsKeepsAtMostTenAndEvictsOldest() {
        InMemoryVeteranStore store = new InMemoryVeteranStore();
        for (int i = 0; i < 12; i++) {
            store.saveTeam(USER, teamSnapshot("team-" + i));
        }
        List<Map<String, Object>> teams = store.listTeams(USER);
        assertEquals(SiegeVeteranStore.MAX_TEAMS, teams.size());
        // Newest first: team-11 leads, and the two oldest (team-0, team-1) are gone.
        assertEquals("team-11", teams.get(0).get("teamId"));
        assertEquals("team-2", teams.get(teams.size() - 1).get("teamId"));
    }

    @Test
    void listTeamsReturnsNewestFirst() {
        InMemoryVeteranStore store = new InMemoryVeteranStore();
        store.saveTeam(USER, teamSnapshot("alpha"));
        store.saveTeam(USER, teamSnapshot("beta"));
        store.saveTeam(USER, teamSnapshot("gamma"));
        List<Map<String, Object>> teams = store.listTeams(USER);
        assertEquals(List.of("gamma", "beta", "alpha"),
                teams.stream().map(t -> t.get("teamId")).toList());
    }

    @Test
    void guestSavesAndListsAreNoOps() {
        InMemoryVeteranStore store = new InMemoryVeteranStore();
        assertTrue(store.saveTeam(null, teamSnapshot("x")).isEmpty());
        assertTrue(store.listTeams(null).isEmpty());
        assertTrue(store.listTeams("  ").isEmpty());
    }

    @Test
    void getTeamFindsByTeamId() {
        InMemoryVeteranStore store = new InMemoryVeteranStore();
        store.saveTeam(USER, teamSnapshot("one"));
        store.saveTeam(USER, teamSnapshot("two"));
        assertEquals("two", store.getTeam(USER, "two").orElseThrow().get("teamId"));
        assertTrue(store.getTeam(USER, "missing").isEmpty());
    }

    // ---- snapshot helpers: level/xp/deck ---------------------------------

    @Test
    void builtSnapshotFromPartyCarriesLevelXpAndDeck() {
        Combatant ember = siegeling("s1", "Ember", Element.FIRE);
        ember.addXp(120); // → level 3
        Combatant tide = siegeling("s2", "Tide", Element.WATER);
        tide.addXp(50);  // → level 2

        List<Map<String, Object>> members = SiegeVeteranStore.membersOf(List.of(ember, tide));
        assertEquals(2, members.size());
        assertEquals(3, members.get(0).get("level"));
        assertEquals(120, members.get(0).get("xp"));
        assertEquals("Ember", members.get(0).get("name"));
        assertEquals("FIRE", members.get(0).get("element"));
        assertNotNull(members.get(0).get("maxHp"));
        assertEquals(2, members.get(1).get("level"));

        SiegeCard card = new SiegeCard("c1", "s1",
                new AbilitySpec("m1", "Ember Strike", Element.FIRE, Effect.DAMAGE, 8,
                        TargetKind.ENEMY_SINGLE, 1, "Deal 8"));
        List<Map<String, Object>> deck = SiegeVeteranStore.deckOf(List.of(card));
        assertEquals(1, deck.size());
        assertEquals("s1", deck.get(0).get("owner"));
        @SuppressWarnings("unchecked")
        Map<String, Object> spec = (Map<String, Object>) deck.get(0).get("spec");
        assertEquals("Ember Strike", spec.get("name"));
        assertEquals("DAMAGE", spec.get("effect"));
        assertEquals(8, spec.get("value"));
    }

    // ---- flatten: teams → veteran Siegelings -----------------------------

    @Test
    void flattenedVeteranListCountsEveryMemberAcrossTeams() {
        Map<String, Object> teamA = new LinkedHashMap<>();
        teamA.put("teamId", "A");
        teamA.put("members", SiegeVeteranStore.membersOf(List.of(
                siegeling("a1", "Ash", Element.FIRE),
                siegeling("a2", "Brook", Element.WATER),
                siegeling("a3", "Cliff", Element.EARTH))));
        Map<String, Object> teamB = new LinkedHashMap<>();
        teamB.put("teamId", "B");
        teamB.put("members", SiegeVeteranStore.membersOf(List.of(
                siegeling("b1", "Dusk", Element.SHADOW),
                siegeling("b2", "Gale", Element.WIND))));

        List<Map<String, Object>> veterans = SiegeVeteranStore.flattenVeterans(List.of(teamA, teamB));
        assertEquals(5, veterans.size());
        // Each flattened veteran carries the display fields a lobby needs.
        assertEquals("Ash", veterans.get(0).get("name"));
        assertEquals("A", veterans.get(0).get("teamId"));
        assertEquals("B", veterans.get(veterans.size() - 1).get("teamId"));
        assertTrue(veterans.stream().allMatch(v -> v.containsKey("level") && v.containsKey("element")));
    }

    // ---- helpers ---------------------------------------------------------

    private static Combatant siegeling(String id, String name, Element element) {
        Combatant c = new Combatant(id, name, element, Side.PLAYER, 30, 6, null);
        c.setSourceCardId(id);
        return c;
    }

    private static Map<String, Object> teamSnapshot(String teamId) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("teamId", teamId);
        t.put("members", new ArrayList<>());
        return t;
    }
}
