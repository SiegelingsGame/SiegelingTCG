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

        Map<String, Object> invited = service.inviteResident(user, "mossling", "resident-1", 2);
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
        service.inviteResident(user, "mossling", "resident-1", 2);

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
    void repeatedRequestIsIdempotent() {
        Map<String, Object> first = service.collect(user, "same-request", 1);
        Map<String, Object> repeated = service.collect(user, "same-request", 1);

        assertEquals(first.get("stateVersion"), repeated.get("stateVersion"));
        assertEquals(intAt(first, "resources", "timber"), intAt(repeated, "resources", "timber"));
        assertEquals(1, store.state.getWoodlotCollectCount());
    }

    @Test
    void storehouseExpandsInventoryAndEveryStationStorage() {
        service.getSnapshot(user);
        store.state.setStorehouseLevel(1);
        store.state.getFacilityLevels().put("garden", 1);
        store.state.getFacilityLastAccruedAt().put("garden", clock.instant());

        Map<String, Object> snapshot = service.getSnapshot(user);
        assertEquals(600, intAt(snapshot, "resources", "timberCapacity"));
        assertEquals(200, intAt(snapshot, "resources", "materialCapacity"));
        assertEquals(180, intAt(snapshot, "station", "storageCapacity"));
        assertEquals(135, ((Number) station(snapshot, "garden").get("storageCapacity")).intValue());
    }

    @Test
    void elementalFacilitiesProduceOfflineAndUseIndependentResidentSlots() {
        service.getSnapshot(user);
        store.state.getFacilityLevels().put("garden", 1);
        store.state.getFacilityLevels().put("forge", 1);
        store.state.getFacilityLastAccruedAt().put("garden", clock.instant());
        store.state.getFacilityLastAccruedAt().put("forge", clock.instant());
        clock.advance(Duration.ofMinutes(60));

        Map<String, Object> returned = service.getSnapshot(user);
        assertEquals(15, ((Number) station(returned, "garden").get("available")).intValue());
        assertEquals(12, ((Number) station(returned, "forge").get("available")).intValue());
        assertNotNull(returned.get("offlineReport"));

        long version = ((Number) returned.get("stateVersion")).longValue();
        Map<String, Object> assigned = service.inviteResident(user, "garden", "mossling", "garden-resident", version);
        assertEquals("mossling", station(assigned, "garden").get("residentId"));
        assertEquals(0.30, ((Number) station(assigned, "garden").get("ratePerMinute")).doubleValue(), 0.0001);
        assertEquals("", station(assigned, "forge").get("residentId"));
    }

    @Test
    void milestoneRewardsGrantCardGameCurrencyOnlyOnce() {
        service.getSnapshot(user);
        store.state.setEssenceCollectCount(1);

        Map<String, Object> claimed = service.claimReward(user, "first_harvest", "reward-1", 1);
        assertEquals(100, intAt(claimed, "resources", "gold"));
        assertEquals(25, intAt(claimed, "resources", "remnants"));
        assertTrue(progression.getKeepRewardClaimIds().contains("first_harvest"));
        assertThrows(IllegalArgumentException.class,
                () -> service.claimReward(user, "first_harvest", "reward-2", 2));
        assertEquals(100, progression.getGold());
        assertEquals(25, progression.getRemnants());
    }

    @Test
    void playersChooseWorkshopOrderThenCraftToolsAndPlaceDecorations() {
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setWoodlotLevel(2);
        store.state.setStorehouseLevel(1);
        store.state.setTimber(1_000);

        Map<String, Object> choices = service.getSnapshot(user);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> options = (List<Map<String, Object>>) choices.get("buildOptions");
        assertTrue(options.stream().map(item -> String.valueOf(item.get("id"))).toList()
                .containsAll(List.of("build_garden", "build_forge", "build_fridge", "build_generator")));

        store.state.getFacilityLevels().put("garden", 1);
        store.state.getFacilityLevels().put("forge", 1);
        store.state.getFacilityLastAccruedAt().put("garden", clock.instant());
        store.state.getFacilityLastAccruedAt().put("forge", clock.instant());
        store.state.getMaterialInventory().put("verdant_fiber", 20);
        store.state.getMaterialInventory().put("ember_ingot", 10);

        Map<String, Object> decoration = service.craft(user, "living_trellis", "craft-decor", 1);
        assertEquals(12, materialAmount(decoration, "verdant_fiber"));
        Map<String, Object> placed = service.placeDecoration(user, "garden", "living_trellis", true,
                "place-decor", 2);
        assertEquals("living_trellis", valueAt(placed, "placedDecorations", "garden"));

        Map<String, Object> tool = service.craft(user, "gardener_tools", "craft-tool", 3);
        assertEquals(0.30, ((Number) station(tool, "garden").get("ratePerMinute")).doubleValue(), 0.0001);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> recipes = (List<Map<String, Object>>) tool.get("recipes");
        assertTrue(recipes.stream().anyMatch(item -> "gardener_tools".equals(item.get("id"))
                && Boolean.TRUE.equals(item.get("crafted"))));
    }

    @SuppressWarnings("unchecked")
    private static Object valueAt(Map<String, Object> source, String mapKey, String valueKey) {
        return ((Map<String, Object>) source.get(mapKey)).get(valueKey);
    }

    private static int intAt(Map<String, Object> source, String mapKey, String valueKey) {
        return ((Number) valueAt(source, mapKey, valueKey)).intValue();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> station(Map<String, Object> snapshot, String id) {
        return ((List<Map<String, Object>>) snapshot.get("stations")).stream()
                .filter(item -> id.equals(item.get("id")))
                .findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static int materialAmount(Map<String, Object> snapshot, String id) {
        Map<String, Object> resources = (Map<String, Object>) snapshot.get("resources");
        return ((List<Map<String, Object>>) resources.get("materials")).stream()
                .filter(item -> id.equals(item.get("id")))
                .map(item -> ((Number) item.get("amount")).intValue())
                .findFirst().orElseThrow();
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
