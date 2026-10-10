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
        assertTrue(events.contains("New profession unlocked: Smelting."), events.toString());
        assertTrue(skill(snap, "smelting").get("unlocked").equals(true));
        assertTrue(skill(snap, "smithing").get("unlocked").equals(false), "Smithing now follows Smelting 10");
        assertTrue(skill(snap, "fishing").get("unlocked").equals(false));
        assertEquals(List.of("Carpentry 3"), skill(snap, "fishing").get("unlockText"));

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

    // ── Phase 1: the full profession web ─────────────────────────────────────

    @Test
    void allTwentyOneProfessionsExistAndAKnightWhoTrainedSmithingKeepsIt() {
        assertEquals(21, ChroniclesContent.SKILLS.size());
        service.start(user, "cacty", "Ari", null);
        store.state.skillXp.put("smithing", 500L);
        Map<String, Object> snap = service.getSnapshot(user);
        assertEquals(true, skill(snap, "smithing").get("unlocked"), "practised before the split: grandfathered");
        assertEquals(false, skill(snap, "smelting").get("unlocked"));
    }

    @Test
    void lockedProfessionsEarnNothingAndGiveNoEffect() {
        service.start(user, "sundile", "Ari", null);
        String id = store.state.companions.get(0).id;
        store.state.inventory.put("grilled_minnow", 2);
        service.feed(user, id, "grilled_minnow", null, -1);
        assertNull(store.state.skillXp.get("bonding"), "Bonding is locked until Taming 3");
        assertNull(store.state.skillXp.get("husbandry"));
        assertEquals(120, store.state.companions.get(0).bond, "no Bonding bonus while locked");

        store.state.skillXp.put("taming", ChroniclesContent.xpForLevel(3));
        service.feed(user, id, "grilled_minnow", null, -1);
        assertTrue(store.state.skillXp.get("bonding") > 0, "bond earned now trains Bonding");
        assertEquals(120 + 121, store.state.companions.get(0).bond, "Bonding 1 adds 1%");
    }

    @Test
    void studyingAnEssenceTeachesItsAffinity() {
        service.start(user, "cacty", "Ari", null);
        store.state.rankXp = ChroniclesContent.xpForLevel(5);
        store.state.inventory.put("essence_fire", 3);
        service.setActivity(user, "craft", "study_fire", null, -1);
        clock.advance(Duration.ofSeconds(60));
        service.getSnapshot(user);
        assertNull(store.state.inventory.get("essence_fire"), "three sessions used three essences");
        assertNull(store.state.activity, "studying stops when the essences run out");
        assertEquals(30L, (long) store.state.skillXp.get("elemental_studies"));
        assertEquals(24L, (long) store.state.affinityXp.get("FIRE"), "8 per session; studies bonus was 0 at the start");
    }

    @Test
    void aCarriedRuneIsSpentAndStrengthensItsElement() {
        service.start(user, "sundile", "Ari", null);
        ChroniclesState state = store.state;
        state.inventory.put("rune_embers", 2);
        ChroniclesContent.Route route = ChroniclesContent.ROUTES.get("mossroot_patrol");
        var plain = service.buildInput(state, route, state.companions, null, Map.of(), 1);
        var runed = service.buildInput(state, route, state.companions, null, Map.of("rune_embers", 1), 1);
        assertTrue(runed.party().get(0).atk > plain.party().get(0).atk * 1.11, "Rune of Embers: Fire +12% attack");
        assertFalse(runed.supplies().containsKey("rune_embers"), "runes are not potions");

        assertThrows(IllegalArgumentException.class,
                () -> service.launch(user, "mossroot_patrol", Map.of("rune_embers", 2), null, -1));
        service.launch(user, "mossroot_patrol", Map.of("rune_embers", 1), null, -1);
        assertEquals(1, store.state.inventory.get("rune_embers"));
        clock.advance(Duration.ofMinutes(20));
        service.collect(user, null, -1);
        assertEquals(1, store.state.inventory.get("rune_embers"), "a carried rune does not come home");
    }

    @Test
    void expeditionProfessionsShapeTheRoad() {
        service.start(user, "cacty", "Ari", null);
        ChroniclesState state = store.state;
        ChroniclesContent.Route hollow = ChroniclesContent.ROUTES.get("cinder_hollow");
        long base = service.buildInput(state, hollow, state.companions, null, Map.of(), 3).durationMs();
        state.skillXp.put("pathfinding", ChroniclesContent.xpForLevel(50));
        long faster = service.buildInput(state, hollow, state.companions, null, Map.of(), 3).durationMs();
        assertEquals(Math.round(60 * 60_000L * 0.80), faster, "Pathfinding 50 cuts 20%");
        assertTrue(faster < base);

        state.rankXp = ChroniclesContent.xpForLevel(3);
        state.skillXp.put("survival", ChroniclesContent.xpForLevel(40));
        assertEquals(0.40, service.buildInput(state, hollow, state.companions, null, Map.of(), 3).knight().survivalCut(), 1e-9);

        ChroniclesContent.Route crypt = ChroniclesContent.ROUTES.get("old_rootcrypt");
        state.companions.get(0).level = 25;
        var lost = ChroniclesCombat.simulate(service.buildInput(state, crypt, state.companions, null, Map.of(), 9));
        assertEquals(crypt.encounters() + 1, lost.encountersTotal, "no woodcraft or map: the company gets lost");
        state.skillXp.put("cartography", ChroniclesContent.xpForLevel(10));
        var mapped = ChroniclesCombat.simulate(service.buildInput(state, crypt, state.companions, null, Map.of(), 9));
        assertEquals(crypt.encounters(), mapped.encountersTotal, "Cartography 10 keeps the road");
    }

    @Test
    void crossClassTechniquesNeedClassTactics() {
        service.start(user, "sundile", "Ari", null);
        ChroniclesState state = store.state;
        ChroniclesState.Companion support = addCompanion(state, "emberfox", 1);
        state.masteryXp.put("Guardian", ChroniclesContent.xpForLevel(20));
        state.masteryXp.put("Support", ChroniclesContent.xpForLevel(20));
        state.skillXp.put("command", ChroniclesContent.xpForLevel(5));
        List<ChroniclesState.Companion> both = List.of(state.companions.get(0), support);
        state.party = List.of(state.companions.get(0).id, support.id);
        ChroniclesContent.Route route = ChroniclesContent.ROUTES.get("mossroot_patrol");
        assertFalse(service.buildInput(state, route, both, null, Map.of(), 1).fieldNotes().stream()
                .anyMatch(n -> n.contains("Sanctuary Formation")));
        state.skillXp.put("class_tactics", ChroniclesContent.xpForLevel(10));
        assertTrue(service.buildInput(state, route, both, null, Map.of(), 1).fieldNotes().stream()
                .anyMatch(n -> n.contains("Sanctuary Formation")));
    }

    @Test
    void husbandryRaisesTheDailyTreatCap() {
        assertEquals(5, ChroniclesContent.treatCap(1));
        assertEquals(6, ChroniclesContent.treatCap(10));
        assertEquals(8, ChroniclesContent.treatCap(60));
    }

    // ── Phase 2: affinity milestones and combinations ───────────────────────

    @Test
    void resonanceCarriesTheTechniqueToTheWholeCompany() {
        service.start(user, "sundile", "Ari", null);
        ChroniclesState state = store.state;
        ChroniclesState.Companion cacty = addCompanion(state, "cacty", 1);
        state.skillXp.put("command", ChroniclesContent.xpForLevel(3));
        state.party = List.of(state.companions.get(0).id, cacty.id);
        List<ChroniclesState.Companion> both = List.of(state.companions.get(0), cacty);
        ChroniclesContent.Route route = ChroniclesContent.ROUTES.get("mossroot_patrol");
        state.tactics.techniqueId = "tech_fire";
        state.affinityXp.put("FIRE", ChroniclesContent.xpForLevel(10));
        double familiar = service.buildInput(state, route, both, null, Map.of(), 1).party().get(1).atk;
        state.affinityXp.put("FIRE", ChroniclesContent.xpForLevel(50));
        var resonant = service.buildInput(state, route, both, null, Map.of(), 1);
        assertEquals(familiar * (1 + 0.225 / (1 + 0.0)), resonant.party().get(1).atk, familiar * 0.01,
                "Kindled Strikes now lifts the Earth ally too, at 1.5x");
        assertTrue(resonant.fieldNotes().stream().anyMatch(n -> n.contains("Resonance")));
    }

    @Test
    void attunementSoftensItsLandsAndHelpsTaming() {
        service.start(user, "cacty", "Ari", null);
        ChroniclesState state = store.state;
        ChroniclesContent.Route hollow = ChroniclesContent.ROUTES.get("cinder_hollow");
        var plain = service.buildInput(state, hollow, state.companions, null, Map.of(), 2).knight();
        state.affinityXp.put("FIRE", ChroniclesContent.xpForLevel(25));
        var attuned = service.buildInput(state, hollow, state.companions, null, Map.of(), 2).knight();
        assertEquals(0.5, attuned.survivalCut(), 1e-9);
        assertEquals(plain.lootBonus() + 0.25, attuned.lootBonus(), 1e-9);

        ChroniclesState.Sighting s = new ChroniclesState.Sighting();
        s.speciesId = "pylook"; s.level = 1; s.behavior = "gentle";
        double before = service.tameChance(state, s, "patient", null);
        state.affinityXp.put("FIRE", ChroniclesContent.xpForLevel(24));
        assertEquals(before - 0.05, service.tameChance(state, s, "patient", null), 1e-9);
    }

    @Test
    void convergenceCombosNeedBothElementsMasteredAndFielded() {
        service.start(user, "sundile", "Ari", null);
        ChroniclesState state = store.state;
        assertThrows(IllegalArgumentException.class,
                () -> service.setTactics(user, null, null, null, null, "steam_veil", null, -1));
        store.state.affinityXp.put("FIRE", ChroniclesContent.xpForLevel(75));
        store.state.affinityXp.put("WATER", ChroniclesContent.xpForLevel(75));
        service.setTactics(user, null, null, null, null, "steam_veil", null, -1);
        assertEquals("steam_veil", store.state.tactics.comboId);

        ChroniclesState st = store.state;
        ChroniclesContent.Route route = ChroniclesContent.ROUTES.get("mossroot_patrol");
        var alone = service.buildInput(st, route, st.companions, null, Map.of(), 1);
        assertEquals(ChroniclesContent.Arcana.NONE, alone.arcana(), "no Water Siegeling fielded");
        ChroniclesState.Companion water = addCompanion(st, "spoutyl", 1);
        st.skillXp.put("command", ChroniclesContent.xpForLevel(3));
        st.party = List.of(st.companions.get(0).id, water.id);
        var both = service.buildInput(st, route, List.of(st.companions.get(0), water), null, Map.of(), 1);
        assertEquals(0.15, both.arcana().allyDamageCut(), 1e-9);
    }

    @Test
    void combosMakeHardRoadsEasier() {
        ChroniclesState state = new ChroniclesState();
        ChroniclesContent.Route route = ChroniclesContent.ROUTES.get("cinder_hollow");
        for (String sp : List.of("jackedty", "chilldoe", "purseus")) addCompanion(state, sp, 17);
        state.party = state.companions.stream().map(c -> c.id).toList();
        int plain = 0, veiled = 0, bloom = 0;
        for (int seed = 0; seed < 120; seed++) {
            var in = service.buildInput(state, route, state.companions, null, Map.of(), seed);
            if ("complete".equals(ChroniclesCombat.simulate(in).outcome)) plain++;
            if ("complete".equals(ChroniclesCombat.simulate(withArcana(in, ChroniclesContent.COMBOS.get("steam_veil").arcana())).outcome)) veiled++;
            if ("complete".equals(ChroniclesCombat.simulate(withArcana(in, ChroniclesContent.COMBOS.get("toxic_bloom").arcana())).outcome)) bloom++;
        }
        assertTrue(veiled > plain, "Steam Veil " + veiled + " vs " + plain);
        assertTrue(bloom > plain, "Toxic Bloom " + bloom + " vs " + plain);
    }

    @Test
    void anAscendantSignatureFiresOnceInTheBossFight() {
        ChroniclesState state = new ChroniclesState();
        ChroniclesContent.Route route = ChroniclesContent.ROUTES.get("cinder_hollow");
        for (String sp : List.of("raydile", "chilldoe", "purseus")) addCompanion(state, sp, 18);
        state.party = state.companions.stream().map(c -> c.id).toList();
        state.affinityXp.put("FIRE", ChroniclesContent.xpForLevel(100));
        state.tactics.techniqueId = "tech_fire";
        var result = ChroniclesCombat.simulate(service.buildInput(state, route, state.companions, null, Map.of(), 5));
        long fired = result.timeline.stream().filter(e -> e.text.contains("Infernal Surge!")).count();
        assertEquals(1, fired, "fires once, in the first elite or boss battle");
    }

    private static ChroniclesCombat.Input withArcana(ChroniclesCombat.Input in, ChroniclesContent.Arcana arcana) {
        return new ChroniclesCombat.Input(in.route(), in.party(), in.reserve(), in.knight(), in.trigger(), in.retreatAt(),
                in.potionAt(), in.supplies(), in.fieldMods(), in.fieldNotes(), in.seed(), in.enemies(), in.durationMs(),
                arcana, in.signature(), in.twists());
    }

    // ── Phase 3: the home base ───────────────────────────────────────────────

    @Test
    void buildingsNeedRankAndMaterialsFromSeveralProfessions() {
        service.start(user, "cacty", "Ari", null);
        assertThrows(IllegalArgumentException.class, () -> service.build(user, "sanctuary", null, -1), "rank 1 is too low");
        store.state.rankXp = ChroniclesContent.xpForLevel(2);
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.build(user, "sanctuary", null, -1));
        assertTrue(ex.getMessage().startsWith("Needs "), ex.getMessage());
        store.state.inventory.putAll(Map.of("pine_plank", 8, "linen", 4, "sunleaf", 12));
        Map<String, Object> snap = service.build(user, "sanctuary", null, -1);
        assertEquals(1, store.state.buildings.get("sanctuary"));
        assertNull(store.state.inventory.get("pine_plank"));
        assertEquals(15, snap.get("rosterCap"));
        assertThrows(IllegalArgumentException.class, () -> service.build(user, "sanctuary", null, -1), "level 2 needs rank 6");
    }

    @Test
    void theGardenGrowsWhileAwayUpToTheOfflineCap() {
        service.start(user, "cacty", "Ari", null);
        service.getSnapshot(user);
        store.state.buildings.put("garden", 1);
        clock.advance(Duration.ofHours(10));
        service.getSnapshot(user);
        assertEquals(60, store.state.inventory.get("sunleaf"));
        assertEquals(40, store.state.inventory.get("flax"));
        assertNotNull(store.state.away, "a ten-hour absence shows the harvest");
        clock.advance(Duration.ofHours(40));
        service.getSnapshot(user);
        assertEquals(60 + 72, store.state.inventory.get("sunleaf"), "only 12 hours count without a Library");
    }

    @Test
    void theSanctuaryBondsRestingSiegelingsOnly() {
        service.start(user, "cacty", "Ari", null);
        ChroniclesState.Companion helper = addCompanion(store.state, "fawny", 2);
        store.state.helperId = helper.id;
        service.getSnapshot(user);
        store.state.buildings.put("sanctuary", 2);
        clock.advance(Duration.ofHours(5));
        service.getSnapshot(user);
        assertEquals(60, store.state.companions.get(0).bond, "12 bond an hour for 5 hours");
        assertEquals(0, store.state.companions.get(1).bond, "the helper is working, not resting");
    }

    @Test
    void theLibraryStretchesIdleProgressToADay() {
        service.start(user, "cacty", "Ari", null);
        store.state.buildings.put("library", 5);
        service.setActivity(user, "gather", "mine_copper", null, -1);
        clock.advance(Duration.ofHours(30));
        Map<String, Object> snap = service.getSnapshot(user);
        assertEquals((int) (24L * 3600 / 8), store.state.inventory.get("copper_ore"));
        assertEquals(24.0, ((Number) map(snap, "activity").get("offlineCapHours")).doubleValue(), 1e-9);
    }

    @Test
    void theStableAndForgeImproveLogistics() {
        service.start(user, "cacty", "Ari", null);
        store.state.inventory.put("herb_tonic", 30);
        assertThrows(IllegalArgumentException.class,
                () -> service.launch(user, "mossroot_patrol", Map.of("herb_tonic", 21), null, -1));
        store.state.buildings.put("stable", 1);
        store.state.buildings.put("forge", 1);
        ChroniclesState.ActivityRun run = new ChroniclesState.ActivityRun();
        run.kind = "craft";
        run.id = "smelt_copper";
        assertEquals(9400, service.actionMs(store.state, run), "Forge 1: 6% faster");
        service.launch(user, "mossroot_patrol", Map.of("herb_tonic", 24), null, -1);
        assertEquals(6, store.state.inventory.get("herb_tonic"));
    }

    @Test
    void warRoomLoadoutsSaveAndRestoreAPlan() {
        service.start(user, "cacty", "Ari", null);
        assertThrows(IllegalArgumentException.class, () -> service.saveLoadout(user, 0, "Hunt", null, -1));
        store.state.buildings.put("war_room", 2);
        ChroniclesState.Companion fawny = addCompanion(store.state, "fawny", 3);
        store.state.skillXp.put("command", ChroniclesContent.xpForLevel(3));
        String cacty = store.state.companions.get(0).id;
        service.setParty(user, List.of(cacty, fawny.id), "", null, -1);
        service.setTactics(user, 35, 50, "BOSS", null, null, -1);
        service.saveLoadout(user, 1, "Boss Hunt", null, -1);

        service.setParty(user, List.of(fawny.id), "", null, -1);
        service.setTactics(user, 10, 20, "READY", null, null, -1);
        Map<String, Object> snap = service.applyLoadout(user, 1, null, -1);
        assertEquals(List.of(cacty, fawny.id), store.state.party);
        assertEquals(35, store.state.tactics.retreatAt);
        assertEquals("BOSS", store.state.tactics.trigger);
        List<Map<String, Object>> loadouts = list(map(snap, "base"), "loadouts");
        assertEquals(2, loadouts.size());
        assertEquals("Boss Hunt", loadouts.get(1).get("name"));

        store.state.companions.removeIf(c -> c.id.equals(fawny.id));
        service.applyLoadout(user, 1, null, -1);
        assertEquals(List.of(cacty, ""), store.state.party, "a Siegeling no longer here leaves its slot empty");
    }

    // ── Phase 4: the wider world ─────────────────────────────────────────────

    @Test
    void landsWithoutSiegelingsStaySealed() {
        service.start(user, "cacty", "Ari", null);
        store.state.rankXp = ChroniclesContent.xpForLevel(60);
        Map<String, Object> snap = service.getSnapshot(user);
        List<Object> ids = list(snap, "routes").stream().map(r -> r.get("id")).toList();
        assertFalse(ids.contains("sunspire_hunt"), "no Light Siegelings in the catalog yet");
        assertFalse(ids.contains("blight_hunt"), "no Poison Siegelings in the catalog yet");
        assertEquals(2, snap.get("sealedRoutes"));
        assertThrows(IllegalArgumentException.class, () -> service.launch(user, "sunspire_hunt", Map.of(), null, -1));
    }

    @Test
    void cartographyRevealsHiddenRoutes() {
        service.start(user, "cacty", "Ari", null);
        store.state.rankXp = ChroniclesContent.xpForLevel(10);
        List<Object> before = list(service.getSnapshot(user), "routes").stream().map(r -> r.get("id")).toList();
        assertFalse(before.contains("sunken_mossway"));
        assertThrows(IllegalArgumentException.class, () -> service.launch(user, "sunken_mossway", Map.of(), null, -1));
        store.state.skillXp.put("pathfinding", ChroniclesContent.xpForLevel(5));
        store.state.skillXp.put("cartography", ChroniclesContent.xpForLevel(10));
        List<Object> after = list(service.getSnapshot(user), "routes").stream().map(r -> r.get("id")).toList();
        assertTrue(after.contains("sunken_mossway"));
        service.launch(user, "sunken_mossway", Map.of(), null, -1);
        assertEquals("sunken_mossway", store.state.expedition.routeId);
    }

    @Test
    void frontierRoutesNeedSurvival() {
        service.start(user, "cacty", "Ari", null);
        store.state.rankXp = ChroniclesContent.xpForLevel(14);
        Map<String, Object> snap = service.getSnapshot(user);
        Map<String, Object> tide = list(snap, "routes").stream().filter(r -> "tidewater_patrol".equals(r.get("id")))
                .findFirst().orElseThrow();
        assertEquals(false, tide.get("unlocked"));
        assertEquals(2, tide.get("tier"));
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.launch(user, "tidewater_patrol", Map.of(), null, -1));
        assertTrue(ex.getMessage().contains("Survival 10"), ex.getMessage());
        store.state.skillXp.put("survival", ChroniclesContent.xpForLevel(10));
        service.launch(user, "tidewater_patrol", Map.of(), null, -1);
        assertNotNull(store.state.expedition);
    }

    @Test
    void wardingGearHalvesItsHazard() {
        ChroniclesState state = new ChroniclesState();
        addCompanion(state, "cacty", 20);
        state.party = List.of(state.companions.get(0).id);
        ChroniclesContent.Route route = ChroniclesContent.ROUTES.get("tidewater_patrol");
        var bare = ChroniclesCombat.simulate(service.buildInput(state, route, state.companions, null, Map.of(), 4));
        state.armorId = "tidewarden_cloak";
        var cloaked = ChroniclesCombat.simulate(service.buildInput(state, route, state.companions, null, Map.of(), 4));
        String first = bare.timeline.stream().filter(e -> "hazard".equals(e.kind)).findFirst().orElseThrow().text;
        String warded = cloaked.timeline.stream().filter(e -> "hazard".equals(e.kind)).findFirst().orElseThrow().text;
        assertTrue(first.contains("(4% health)"), first);
        assertTrue(warded.contains("(2% health)"), warded);
    }

    @Test
    void twistsAreWardedByTheRightElementOrRelic() {
        ChroniclesState state = new ChroniclesState();
        addCompanion(state, "frostag", 30);
        state.party = List.of(state.companions.get(0).id);
        ChroniclesContent.Route crypts = ChroniclesContent.ROUTES.get("ashen_hunt");
        var plain = service.buildInput(state, crypts, state.companions, null, Map.of(), 1);
        assertEquals(java.util.Set.of("risen"), plain.twists());
        state.relicId = "grave_ward";
        var relic = service.buildInput(state, crypts, state.companions, null, Map.of(), 1);
        assertTrue(relic.twists().isEmpty());
        assertTrue(relic.fieldNotes().stream().anyMatch(n -> n.contains("Restless Dead is warded off")));
        state.relicId = "";
        ChroniclesState.Companion fire = addCompanion(state, "pyleer", 30);
        state.party = List.of(state.companions.get(0).id, fire.id);
        var element = service.buildInput(state, crypts, List.of(state.companions.get(0), fire), null, Map.of(), 1);
        assertTrue(element.twists().isEmpty(), "a Fire Siegeling burns the dead down");
    }

    @Test
    void laterTiersFieldTheirOwnElementsAndAutoBossesResolve() {
        ChroniclesContent.Route odyssey = ChroniclesContent.ROUTES.get("frontier_odyssey");
        var pool = service.enemyPool(odyssey, false);
        assertTrue(pool.stream().allMatch(c -> c.element() == com.sieglings.model.enums.Element.WATER
                || c.element() == com.sieglings.model.enums.Element.ELECTRIC));
        assertTrue(pool.stream().anyMatch(c -> c.element() == com.sieglings.model.enums.Element.ELECTRIC));
        assertTrue(service.enemyPool(ChroniclesContent.ROUTES.get("abyssal_hollow"), true).stream()
                .allMatch(c -> c.stage() == 1), "taming only ever finds base forms");
        for (ChroniclesContent.Route r : ChroniclesContent.ROUTES.values()) {
            if (r.bossId() != null && !service.routeSealed(r)) assertNotNull(service.bossOf(r), r.id());
        }
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

        @Override
        public Optional<ChroniclesState> findByUserId(String userId) {
            if (state == null) return Optional.empty();
            try {
                ChroniclesState copy = JSON.readValue(JSON.writeValueAsString(state), ChroniclesState.class);
                copy.userId = userId;
                state = copy;
                return Optional.of(copy);
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
        }

        @Override
        public ChroniclesState save(ChroniclesState value) {
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
