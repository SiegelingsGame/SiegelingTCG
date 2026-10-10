package com.sieglings.chronicles;

import com.sieglings.persistence.entity.AccountUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChroniclesServiceTest {
    private final Instant start = Instant.parse("2026-10-10T12:00:00Z");
    private MutableClock clock;
    private InMemoryStore store;
    private ChroniclesService service;
    private AccountUser user;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(start);
        store = new InMemoryStore();
        service = new ChroniclesService(store, null);
        service.setClock(clock);
        user = new AccountUser();
        user.setId("knight@example.com");
        user.setDisplayName("Ari");
    }

    @Test
    void introOffersTheFourRbxStartersAndStartingSwearsInTheKnight() {
        Map<String, Object> intro = service.getSnapshot(user);
        assertEquals(false, intro.get("started"));
        List<Map<String, Object>> starters = list(intro, "starters");
        assertEquals(List.of("cacty", "pursula", "sundile", "fawny"),
                starters.stream().map(s -> s.get("speciesId")).toList());
        assertEquals("Guardian", starters.get(2).get("class"));
        assertEquals("Cinder Aegis", starters.get(2).get("bondTechnique"));

        assertThrows(IllegalArgumentException.class, () -> service.start(user, "solgator", "Ari", "r0"));
        Map<String, Object> snap = service.start(user, "sundile", "Ari", "r1");
        assertEquals(true, snap.get("started"));
        ChroniclesState state = store.state;
        assertEquals(1, state.companions.size());
        assertEquals("sundile", state.companions.get(0).speciesId);
        assertEquals(List.of(state.companions.get(0).id), state.party);
        assertEquals("squires_sword", state.weaponId);
        assertEquals(3, state.inventory.get("herb_tonic"));
        // A second start is a no-op rather than a reset.
        service.start(user, "cacty", "Other", "r2");
        assertEquals("sundile", store.state.companions.get(0).speciesId);
    }

    @Test
    void gatheringAccruesWhileAwayUpToTheTwelveHourCap() {
        service.start(user, "cacty", "Ari", null);
        service.setActivity(user, "gather", "mine_copper", null, -1);
        clock.advance(Duration.ofSeconds(8 * 10 + 5));
        service.getSnapshot(user);
        assertEquals(10, store.state.inventory.get("copper_ore"));
        assertEquals(5000, store.state.activity.remainderMs);
        assertEquals(60, store.state.skillXp.get("mining"));
        assertNull(store.state.away, "a short gap is not an absence worth a report");

        clock.advance(Duration.ofHours(30));
        Map<String, Object> snap = service.getSnapshot(user);
        long capActions = ChroniclesContent.OFFLINE_CAP_MS / 8000;
        assertEquals(10 + capActions, (long) store.state.inventory.get("copper_ore"));
        Map<String, Object> away = map(snap, "away");
        assertEquals(true, away.get("capped"));
        service.acknowledgeAway(user, null, -1);
        assertNull(store.state.away);
    }

    @Test
    void professionsUnlockEachOtherThroughTheWeb() {
        service.start(user, "cacty", "Ari", null);
        assertThrows(IllegalArgumentException.class, () -> service.setActivity(user, "gather", "fish_river", null, -1));
        assertThrows(IllegalArgumentException.class, () -> service.setActivity(user, "craft", "smelt_copper", null, -1));

        service.setActivity(user, "gather", "mine_copper", null, -1);
        clock.advance(Duration.ofHours(1));
        Map<String, Object> snap = service.getSnapshot(user);
        @SuppressWarnings("unchecked")
        List<String> events = (List<String>) snap.get("events");
        assertTrue(events.contains("New profession unlocked: Smithing."), events.toString());
        assertTrue(skill(snap, "smithing").get("unlocked").equals(true));
        assertTrue(skill(snap, "fishing").get("unlocked").equals(false));
        assertEquals(List.of("Woodcutting 5"), skill(snap, "fishing").get("unlockText"));

        service.setActivity(user, "craft", "smelt_copper", null, -1);
        assertEquals("craft", store.state.activity.kind);
    }

    @Test
    void idleCraftingConsumesMaterialsAndStopsWhenTheyRunOut() {
        service.start(user, "cacty", "Ari", null);
        store.state.skillXp.put("mining", ChroniclesContent.xpForLevel(5));
        store.state.inventory.put("copper_ore", 7);
        service.setActivity(user, "craft", "smelt_copper", null, -1);
        clock.advance(Duration.ofMinutes(10));
        Map<String, Object> snap = service.getSnapshot(user);
        assertEquals(3, store.state.inventory.get("copper_bar"));
        assertEquals(1, store.state.inventory.get("copper_ore"));
        assertNull(store.state.activity);
        assertTrue(String.valueOf(map(snap, "away").get("stoppedReason")).contains("Copper Bar"));
    }

    @Test
    void forgingGearChecksLevelsAndCanBeEquipped() {
        service.start(user, "cacty", "Ari", null);
        store.state.skillXp.put("mining", ChroniclesContent.xpForLevel(5));
        store.state.inventory.put("copper_bar", 6);
        store.state.inventory.put("pine_log", 6);
        assertThrows(IllegalArgumentException.class, () -> service.craft(user, "forge_copper_sword", 1, null, -1));
        store.state.skillXp.put("smithing", ChroniclesContent.xpForLevel(3));
        service.craft(user, "forge_copper_spear", 1, null, -1);
        assertEquals(1, store.state.inventory.get("copper_spear"));
        assertThrows(IllegalArgumentException.class, () -> service.craft(user, "forge_copper_spear", 1, null, -1));
        service.equip(user, "copper_spear", null, -1);
        assertEquals("copper_spear", store.state.weaponId);
        Map<String, Object> snap = service.getSnapshot(user);
        assertEquals("ALLY_LOW", map(snap, "tactics").get("trigger"));

        // Embersteel Lance needs Fire Affinity and Guardian Mastery on top of Smithing.
        store.state.skillXp.put("smithing", ChroniclesContent.xpForLevel(30));
        store.state.inventory.putAll(Map.of("iron_bar", 6, "ember_shard", 4, "heartwood", 2));
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.craft(user, "forge_embersteel_lance", 1, null, -1));
        assertTrue(ex.getMessage().contains("Fire Affinity 20"), ex.getMessage());
    }

    @Test
    void expeditionRevealsItsTimelineAsTimePassesAndPaysOutOnReturn() {
        service.start(user, "pursula", "Ari", null);
        Map<String, Object> launched = service.launch(user, "mossroot_patrol", Map.of("herb_tonic", 2), null, -1);
        assertEquals(1, store.state.inventory.get("herb_tonic"));
        Map<String, Object> expedition = map(launched, "expedition");
        assertEquals(false, expedition.get("done"));
        assertEquals("", expedition.get("outcome"));
        int early = list(expedition, "timeline").size();
        assertThrows(IllegalArgumentException.class, () -> service.collect(user, null, -1));
        assertThrows(IllegalArgumentException.class, () -> service.setParty(user, List.of(), "", null, -1));

        clock.advance(Duration.ofMinutes(16));
        Map<String, Object> home = service.getSnapshot(user);
        Map<String, Object> done = map(home, "expedition");
        assertEquals(true, done.get("done"));
        assertTrue(list(done, "timeline").size() > early);

        Map<String, Object> collected = service.collect(user, null, -1);
        Map<String, Object> report = map(collected, "report");
        assertNotNull(report.get("outcome"));
        assertNull(store.state.expedition);
        ChroniclesState state = store.state;
        if ("complete".equals(report.get("outcome"))) {
            assertTrue(state.affinityXp.getOrDefault("WIND", 0L) > 0, "Pursula's element should gain affinity");
            assertTrue(state.masteryXp.getOrDefault("Bruiser", 0L) > 0, "Pursula's class should gain mastery");
            assertTrue(state.affinityXp.getOrDefault("EARTH", 0L) > 0, "the route's element is studied too");
            assertTrue(state.companions.get(0).bond > 0);
            assertTrue(state.skillXp.getOrDefault("command", 0L) > 0);
            assertEquals(1, state.expeditionsCompleted);
        }
        assertTrue(state.rankXp > 0);
    }

    @Test
    void companySizeGrowsWithCommand() {
        service.start(user, "cacty", "Ari", null);
        ChroniclesState state = store.state;
        ChroniclesState.Companion second = addCompanion(state, "fawny", 3);
        assertThrows(IllegalArgumentException.class,
                () -> service.setParty(user, List.of(state.companions.get(0).id, second.id), "", null, -1));
        store.state.skillXp.put("command", ChroniclesContent.xpForLevel(3));
        service.setParty(user, List.of(store.state.companions.get(0).id, second.id), "", null, -1);
        assertEquals(2, store.state.party.size());
        assertThrows(IllegalArgumentException.class,
                () -> service.setParty(user, List.of(second.id, second.id), "", null, -1));
    }

    @Test
    void synergiesUseTheRbxNames() {
        var synergies = ChroniclesService.activeSynergies(Map.of("FIRE", 2), Map.of("Guardian", 3));
        assertEquals(List.of("Ember", "Bastion"), synergies.stream().map(ChroniclesContent.Synergy::label).toList());
    }

    @Test
    void tamingResolvesOnceAndCreatesAnIndividualSiegeling() {
        service.start(user, "cacty", "Ari", null);
        ChroniclesState.Sighting sighting = new ChroniclesState.Sighting();
        sighting.id = "s1";
        sighting.speciesId = "applehead";
        sighting.level = 2;
        sighting.behavior = "gentle";
        sighting.expiresAt = clock.millis() + 60_000;
        // A seed whose first roll is low enough to succeed at any reasonable odds.
        sighting.seed = findSeed(0.05);
        store.state.sightings.add(sighting);
        Map<String, Object> snap = service.getSnapshot(user);
        Map<String, Object> odds = map(list(snap, "sightings").get(0), "odds");
        assertNotNull(odds.get("patient"));
        assertNull(odds.get("partner"), "no Earth partner at Bond 10 yet");

        Map<String, Object> result = service.tame(user, "s1", "patient", null, null, -1);
        assertEquals("tamed", map(result, "taming").get("result"));
        assertEquals(2, store.state.companions.size());
        ChroniclesState.Companion tamed = store.state.companions.get(1);
        assertEquals("applehead", tamed.speciesId);
        assertEquals(2, tamed.level);
        assertEquals(0, tamed.bond);
        assertTrue(store.state.sightings.isEmpty());
        assertTrue(store.state.skillXp.get("taming") > 0);
        assertThrows(IllegalArgumentException.class, () -> service.tame(user, "s1", "patient", null, null, -1));
    }

    @Test
    void lureApproachNeedsAndSpendsALure() {
        service.start(user, "cacty", "Ari", null);
        ChroniclesState.Sighting sighting = new ChroniclesState.Sighting();
        sighting.id = "s1";
        sighting.speciesId = "sleaf";
        sighting.behavior = "skittish";
        sighting.expiresAt = clock.millis() + 60_000;
        store.state.sightings.add(sighting);
        double patient = service.tameChance(store.state, sighting, "patient", null);
        double lure = service.tameChance(store.state, sighting, "lure", "wild_bait");
        assertTrue(lure > patient, "a lure is the answer to a skittish Siegeling");
        service.tame(user, "s1", "lure", "wild_bait", null, -1);
        assertNull(store.state.inventory.get("wild_bait"));
    }

    @Test
    void evolutionKeepsTheIndividualAndCanChangeClass() {
        service.start(user, "cacty", "Ari", null);
        ChroniclesState.Companion cacty = store.state.companions.get(0);
        cacty.bond = 5000;
        cacty.nickname = "Cacty";
        assertThrows(IllegalArgumentException.class, () -> service.evolve(user, cacty.id, null, -1));
        store.state.companions.get(0).level = 10;
        assertThrows(IllegalArgumentException.class, () -> service.evolve(user, cacty.id, null, -1));
        store.state.inventory.put("essence_earth", 6);
        service.evolve(user, cacty.id, null, -1);
        ChroniclesState.Companion evolved = store.state.companions.get(0);
        assertEquals(cacty.id, evolved.id);
        assertEquals("jackedty", evolved.speciesId);
        assertEquals("Jacked'ty", evolved.nickname);
        assertEquals(5000, evolved.bond);
        assertNull(store.state.inventory.get("essence_earth"));
        assertEquals(25, ChroniclesContent.levelCap(2, true));
    }

    @Test
    void favouriteFoodDoublesBondAndTreatsAreCappedDaily() {
        service.start(user, "sundile", "Ari", null);
        String id = store.state.companions.get(0).id;
        store.state.inventory.put("grilled_minnow", 10);
        service.feed(user, id, "grilled_minnow", null, -1);
        assertEquals(120, store.state.companions.get(0).bond, "Fire loves grilled minnow");
        for (int i = 0; i < 4; i++) service.feed(user, id, "grilled_minnow", null, -1);
        assertThrows(IllegalArgumentException.class, () -> service.feed(user, id, "grilled_minnow", null, -1));
        clock.advance(Duration.ofDays(1));
        service.feed(user, id, "grilled_minnow", null, -1);
        assertEquals(720, store.state.companions.get(0).bond);
    }

    @Test
    void anElementMatchedHelperSpeedsWorkAndGrowsItsBond() {
        service.start(user, "cacty", "Ari", null);
        String id = store.state.companions.get(0).id;
        service.setHelper(user, id, null, -1);
        service.setActivity(user, "gather", "mine_copper", null, -1);
        assertEquals(6000, service.actionMs(store.state, store.state.activity));
        clock.advance(Duration.ofMinutes(10));
        service.getSnapshot(user);
        assertEquals(100, store.state.inventory.get("copper_ore"));
        assertTrue(store.state.companions.get(0).bond > 0);
        assertTrue(store.state.affinityXp.getOrDefault("EARTH", 0L) > 0);

        service.launch(user, "mossroot_patrol", Map.of(), null, -1);
        assertEquals("", store.state.helperId, "a Siegeling can't gather and march at once");
    }

    @Test
    void staleVersionsAreRejectedAndRequestIdsAreIdempotent() {
        service.start(user, "cacty", "Ari", null);
        long version = store.state.version;
        store.state.inventory.put("copper_bar", 20);
        store.state.skillXp.put("mining", ChroniclesContent.xpForLevel(5));
        store.state.skillXp.put("smithing", ChroniclesContent.xpForLevel(1));
        store.state.inventory.put("copper_ore", 4);
        service.craft(user, "smelt_copper", 1, "req-1", version);
        int bars = store.state.inventory.get("copper_bar");
        service.craft(user, "smelt_copper", 1, "req-1", version);
        assertEquals(bars, store.state.inventory.get("copper_bar"));
        assertThrows(ChroniclesService.StaleStateException.class,
                () -> service.craft(user, "smelt_copper", 1, "req-2", version));
    }

    @Test
    void aCommitThatLandsAfterTheReadIsNotOverwritten() {
        service.start(user, "cacty", "Ari", null);
        String id = store.state.companions.get(0).id;
        store.conflictOnNextSave = true;
        assertThrows(ChroniclesService.StaleStateException.class,
                () -> service.setHelper(user, id, "race-1", -1));
        assertEquals("", store.state.helperId, "the losing write must not replace the chronicle");
        assertFalse(store.conflictOnNextSave);

        service.setActivity(user, "gather", "mine_copper", null, -1);
        clock.advance(Duration.ofSeconds(80));
        store.conflictOnNextSave = true;
        Map<String, Object> snap = service.getSnapshot(user);
        assertEquals(true, snap.get("started"));
        assertEquals(10, store.state.inventory.get("copper_ore"),
                "a conflicting poll retries the settle instead of dropping it or blanking the page");
        assertFalse(store.conflictOnNextSave);
    }

    @Test
    void routesOpenWithRank() {
        service.start(user, "cacty", "Ari", null);
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.launch(user, "cinder_hollow", Map.of(), null, -1));
        assertTrue(ex.getMessage().contains("Rank 7"));
        Map<String, Object> snap = service.getSnapshot(user);
        Map<String, Object> patrol = list(snap, "routes").get(0);
        assertEquals(true, patrol.get("unlocked"));
        assertFalse(store.state.companions.isEmpty());
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private ChroniclesState.Companion addCompanion(ChroniclesState state, String species, int level) {
        ChroniclesState.Companion c = new ChroniclesState.Companion();
        c.id = "c" + (state.nextCompanionNo++);
        c.speciesId = species;
        c.nickname = species;
        c.level = level;
        state.companions.add(c);
        return c;
    }

    private static long findSeed(double below) {
        for (long seed = 0; seed < 100_000; seed++) {
            if (new java.util.Random(seed ^ 0x5eed).nextDouble() < below) return seed;
        }
        throw new IllegalStateException();
    }

    private static Map<String, Object> skill(Map<String, Object> snap, String id) {
        return list(snap, "skills").stream().filter(s -> id.equals(s.get("id"))).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> map, String key) {
        return (List<Map<String, Object>>) map.get(key);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Map<String, Object> map, String key) {
        return (Map<String, Object>) map.get(key);
    }

    /** Round-trips through JSON like Firestore does, so the stored shape is exercised. */
    private static final class InMemoryStore extends ChroniclesStore {
        ChroniclesState state;
        /** The next save loses a race: the stored version moves before the compare. */
        boolean conflictOnNextSave;

        @Override
        public Optional<ChroniclesState> findByUserId(String userId) {
            if (state == null) return Optional.empty();
            try {
                ChroniclesState copy = JSON.readValue(JSON.writeValueAsString(state), ChroniclesState.class);
                copy.userId = userId;
                return Optional.of(copy);
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
        }

        @Override
        public ChroniclesState save(ChroniclesState value, long expectedVersion) {
            if (conflictOnNextSave) {
                conflictOnNextSave = false;
                if (state != null) state.version = expectedVersion + 1;
            }
            long current = state == null ? ChroniclesStore.ABSENT_VERSION : state.version;
            if (current != expectedVersion) {
                throw new ChroniclesService.StaleStateException(
                        "Your chronicle changed on another device. Refreshing.");
            }
            state = value;
            return value;
        }
    }

    private static final class MutableClock extends Clock {
        private Instant now;
        MutableClock(Instant now) { this.now = now; }
        void advance(Duration d) { now = now.plus(d); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
        @Override public long millis() { return now.toEpochMilli(); }
    }
}
