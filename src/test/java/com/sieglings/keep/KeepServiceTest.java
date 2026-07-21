package com.sieglings.keep;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.PlayerProgressionService;
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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KeepServiceTest {
    private final Instant start = Instant.parse("2026-07-20T12:00:00Z");
    private MutableClock clock;
    private InMemoryKeepStore store;
    private KeepService service;
    private AccountUser user;
    private PlayerProgressionEntity progression;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(start);
        store = new InMemoryKeepStore();

        progression = new PlayerProgressionEntity();
        progression.setUserId("keeper@example.com");
        progression.setStarterPackId("pack_earth_starter");
        progression.setOwnedCards(Map.of("mossling", 1, "emberling", 2));

        SieglingCard mossling = card("mossling", "Mossling", Element.EARTH);
        SieglingCard emberling = card("emberling", "Emberling", Element.FIRE);
        PlayerProgressionEntity shared = progression;
        PlayerProgressionService progressionService = new PlayerProgressionService() {
            @Override public PlayerProgressionEntity getOrCreate(AccountUser ignored) { return shared; }
        };
        CardDefinitionService cards = new CardDefinitionService() {
            @Override public List<Card> getDeckBuilderCatalog() { return List.of(mossling, emberling); }
        };
        KeepLoreCatalog lore = new KeepLoreCatalog(new ObjectMapper());
        lore.load();
        service = new KeepService(store, progressionService, cards, lore);
        service.setClock(clock);

        user = new AccountUser();
        user.setId("keeper@example.com");
        user.setDisplayName("Ari");
    }

    @Test
    void newKeepStartsWithVisibleProductionResidentsAndCharterConversation() {
        Map<String, Object> snapshot = service.getSnapshot(user);

        assertEquals("Ari's Keep", snapshot.get("keepName"));
        assertEquals(1L, ((Number) snapshot.get("stateVersion")).longValue());
        assertEquals(KeepService.INITIAL_TIMBER, intAt(snapshot, "resources", "timber"));
        assertEquals(15, intAt(snapshot, "station", "available"));
        assertEquals(2, ((List<?>) snapshot.get("residents")).size());
        assertEquals(1, ((List<?>) snapshot.get("lore")).size());
        assertEquals(1, ((List<?>) snapshot.get("availableConversations")).size());
    }

    @Test
    void collectionUnlocksLoreAndAnInvitedAffinityResidentBoostsFutureProduction() {
        Map<String, Object> collected = service.collect(user, "collect-1", 1);
        assertEquals(95, intAt(collected, "resources", "timber"));
        assertTrue(loreIds(collected).contains("letter_forester_maren"));
        assertEquals(List.of("letter_forester_maren"), collected.get("newLoreUnlocks"));

        Map<String, Object> invited = service.inviteResident(user, "woodlot", "mossling", "resident-1", 2);
        assertEquals("mossling", valueAt(invited, "station", "residentId"));
        assertEquals(1.15, ((Number) valueAt(invited, "station", "ratePerMinute")).doubleValue(), 0.0001);

        clock.advance(Duration.ofMinutes(60));
        Map<String, Object> later = service.getSnapshot(user);
        assertEquals(69, intAt(later, "station", "available"));
    }

    @Test
    void subMinuteProductionCarriesAcrossAResidentChange() {
        service.collect(user, "collect-1", 1);
        clock.advance(Duration.ofSeconds(30));
        service.inviteResident(user, "woodlot", "mossling", "resident-1", 2);

        clock.advance(Duration.ofSeconds(30));
        Map<String, Object> snapshot = service.getSnapshot(user);

        assertEquals(1, intAt(snapshot, "station", "available"),
                "Changing residents must not discard the partial unit produced beforehand.");
    }

    @Test
    void aMutationThatObservesConstructionCompletionReportsTheLoreDrop() {
        service.collect(user, "collect-1", 1);
        service.startBuild(user, "restore_archive", "build-1", 2);
        clock.advance(Duration.ofSeconds(KeepService.ARCHIVE_RESTORE_SECONDS + 1));

        Map<String, Object> result = service.readLore(user, "charter_three_promises", "read-1", 3);

        assertEquals(List.of("chronicle_living_elements", "letter_pre_covenant_watch"), result.get("newLoreUnlocks"));
    }

    @Test
    void archiveConstructionCompletesOfflineAndDropsHistory() {
        service.collect(user, "collect-1", 1);
        Map<String, Object> started = service.startBuild(user, "restore_archive", "build-1", 2);
        assertEquals(35, intAt(started, "resources", "timber"));
        assertNotNull(started.get("activeConstruction"));

        clock.advance(Duration.ofSeconds(KeepService.ARCHIVE_RESTORE_SECONDS + 1));
        Map<String, Object> completed = service.getSnapshot(user);
        assertEquals(Boolean.TRUE, valueAt(completed, "visualState", "archiveRestored"));
        assertTrue(loreIds(completed).contains("chronicle_living_elements"));
        assertTrue(loreIds(completed).contains("letter_pre_covenant_watch"));
        assertEquals(2, ((List<?>) completed.get("availableConversations")).size(),
                "The steward remains available and the archive conversation unlocks after both recovered records.");
        assertTrue(((List<?>) completed.get("availableConversations")).stream()
                .map(Map.class::cast).anyMatch(item -> "archivist_living_elements".equals(item.get("id"))));
    }

    @Test
    void dialogueChoicePersistsRelationshipWithoutChangingEconomy() {
        int timberBefore = intAt(service.getSnapshot(user), "resources", "timber");
        Map<String, Object> result = service.chooseDialogue(user, "steward_first_promise", "partners", "talk-1", 1);

        assertEquals(timberBefore, intAt(result, "resources", "timber"));
        assertNotNull(result.get("dialogueResult"));
        assertTrue(((List<?>) result.get("choiceFlags")).contains("charter_stewardship"));
        assertEquals("Acquainted", ((Map<?, ?>) ((List<?>) result.get("relationships")).get(0)).get("stage"));
        assertTrue(((List<?>) result.get("availableConversations")).isEmpty());
    }

    @Test
    void keepActionsRecordLifetimeProgressionStats() {
        service.getSnapshot(user);
        assertTrue(progression.isKeepFounded(), "Loading the keep marks the sanctuary as founded.");

        service.collect(user, "collect-1", 1);
        assertEquals(15, progression.getKeepTimberCollected());
        service.collect(user, "collect-1", 1);
        assertEquals(15, progression.getKeepTimberCollected(),
                "A replayed request id must not double-count collected timber.");

        service.startBuild(user, "restore_archive", "build-1", 2);
        clock.advance(Duration.ofSeconds(KeepService.ARCHIVE_RESTORE_SECONDS + 1));
        service.getSnapshot(user);
        assertEquals(1, progression.getKeepProjectsCompleted());

        service.readLore(user, "charter_three_promises", "read-1", 4);
        assertEquals(1, progression.getKeepLoreRead());
        service.readLore(user, "charter_three_promises", "read-2", 5);
        assertEquals(1, progression.getKeepLoreRead(),
                "Re-reading an entry must not inflate the lifetime count.");

        service.chooseDialogue(user, "steward_first_promise", "partners", "talk-1", 6);
        assertEquals(1, progression.getKeepConversationsCompleted());
    }

    @Test
    void expansionStationsProduceCoinsAndRemnantsWithAwaySummary() {
        service.collect(user, "c1", -1);
        service.startBuild(user, "restore_archive", "b1", -1);
        clock.advance(Duration.ofSeconds(KeepService.ARCHIVE_RESTORE_SECONDS + 1));
        Map<String, Object> afterArchive = service.getSnapshot(user);
        assertEquals(40, progression.getGold(), "Completing the Archive pays a one-time Siegecoin reward.");
        assertEquals(5, progression.getRemnants());
        assertTrue(((List<?>) afterArchive.get("buildOptions")).stream().map(Map.class::cast)
                .anyMatch(option -> "build_garden".equals(option.get("id"))));

        IllegalArgumentException gated = assertThrows(IllegalArgumentException.class,
                () -> service.startBuild(user, "build_forge", "b2", -1));
        assertTrue(gated.getMessage().contains("Garden"), "The Forge is gated behind the Garden.");

        clock.advance(Duration.ofMinutes(60));
        service.collect(user, "c2", -1);
        service.startBuild(user, "build_garden", "b3", -1);
        clock.advance(Duration.ofSeconds(301));
        service.getSnapshot(user);
        assertEquals(90, progression.getGold(), "Completing the Garden pays its project reward.");

        clock.advance(Duration.ofMinutes(600));
        Map<String, Object> away = service.getSnapshot(user);
        Map<?, ?> awaySummary = (Map<?, ?>) away.get("awaySummary");
        assertNotNull(awaySummary, "Long absences produce a while-you-were-away summary.");
        List<Map> production = ((List<?>) awaySummary.get("production")).stream().map(Map.class::cast).toList();
        assertTrue(production.stream().anyMatch(row -> "COINS".equals(row.get("resource"))
                && ((Number) row.get("amount")).intValue() == 60), "Away production reports capped Garden coins.");

        Map<String, Object> collected = service.collect(user, "c3", -1);
        assertEquals(150, progression.getGold(), "Garden coins route to the player's Siegecoin balance.");
        Map<?, ?> coinsRow = ((List<?>) collected.get("collected")).stream().map(Map.class::cast)
                .filter(row -> "COINS".equals(row.get("resource"))).findFirst().orElseThrow();
        assertEquals(60, ((Number) coinsRow.get("amount")).intValue());
    }

    @Test
    void upgradesBoostCapacityAndRatesAndResidentsWorkOneStation() {
        service.getSnapshot(user);
        store.state.getStationLevels().put("warehouse", 1);
        store.state.getStationLevels().put("garden", 1);
        store.state.getStationLevels().put("cellar", 1);
        store.state.getStationLevels().put("generator", 1);

        Map<String, Object> snapshot = service.getSnapshot(user);
        assertEquals(600, intAt(snapshot, "resources", "timberCapacity"), "The Warehouse doubles timber storage.");
        Map<?, ?> garden = stationById(snapshot, "garden");
        assertEquals(90, ((Number) garden.get("storageCapacity")).intValue(), "The Frost Cellar preserves +50% storage.");
        assertEquals(0.11, ((Number) garden.get("ratePerMinute")).doubleValue(), 0.0001, "The Storm Generator quickens production.");

        service.inviteResident(user, "woodlot", "mossling", "r1", -1);
        Map<String, Object> moved = service.inviteResident(user, "garden", "mossling", "r2", -1);
        assertEquals("", valueAt(moved, "station", "residentId"), "Inviting to the Garden moves the resident off the Woodlot.");
        Map<?, ?> gardenAfter = stationById(moved, "garden");
        assertEquals("mossling", gardenAfter.get("residentId"));
        assertEquals(0.11 * 1.15, ((Number) gardenAfter.get("ratePerMinute")).doubleValue(), 0.0001,
                "An Earth resident thrives in the Garden.");
    }

    @Test
    void repeatedRequestIsIdempotent() {
        Map<String, Object> first = service.collect(user, "same-request", 1);
        Map<String, Object> repeated = service.collect(user, "same-request", 1);

        assertEquals(first.get("stateVersion"), repeated.get("stateVersion"));
        assertEquals(intAt(first, "resources", "timber"), intAt(repeated, "resources", "timber"));
        assertEquals(1, store.state.getWoodlotCollectCount());
    }

    private static Map<?, ?> stationById(Map<String, Object> snapshot, String id) {
        return ((List<?>) snapshot.get("stations")).stream().map(Map.class::cast)
                .filter(row -> id.equals(row.get("id"))).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static Object valueAt(Map<String, Object> source, String mapKey, String valueKey) {
        return ((Map<String, Object>) source.get(mapKey)).get(valueKey);
    }

    private static int intAt(Map<String, Object> source, String mapKey, String valueKey) {
        return ((Number) valueAt(source, mapKey, valueKey)).intValue();
    }

    @SuppressWarnings("unchecked")
    private static List<String> loreIds(Map<String, Object> snapshot) {
        return ((List<Map<String, Object>>) snapshot.get("lore")).stream().map(item -> String.valueOf(item.get("id"))).toList();
    }

    private static SieglingCard card(String id, String name, Element element) {
        return new SieglingCard(id, name, element, Rarity.COMMON, 8, 3, List.of(), Row.BACK);
    }

    private static class InMemoryKeepStore extends KeepStore {
        private KeepState state;
        @Override public Optional<KeepState> findByUserId(String userId) { return Optional.ofNullable(state); }
        @Override public KeepState save(KeepState value) { state = value; return value; }
        @Override public void deleteByUserId(String userId) { state = null; }
    }

    private static class MutableClock extends Clock {
        private Instant now;
        MutableClock(Instant now) { this.now = now; }
        void advance(Duration duration) { now = now.plus(duration); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
