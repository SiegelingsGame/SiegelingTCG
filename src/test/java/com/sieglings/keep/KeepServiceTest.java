package com.sieglings.keep;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.PlayerProgressionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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
        progression.setOwnedCards(Map.of("mossling", 1, "emberling", 2, "aurorix", 1));

        SieglingCard mossling = card("mossling", "Mossling", Element.EARTH);
        SieglingCard emberling = card("emberling", "Emberling", Element.FIRE);
        SieglingCard aurorix = card("aurorix", "Aurorix", Element.LIGHT, Rarity.LEGENDARY);
        PlayerProgressionEntity shared = progression;
        PlayerProgressionService progressionService = new PlayerProgressionService() {
            @Override public PlayerProgressionEntity getOrCreate(AccountUser ignored) { return shared; }
        };
        CardDefinitionService cards = new CardDefinitionService() {
            @Override public List<Card> getDeckBuilderCatalog() { return List.of(mossling, emberling, aurorix); }
        };
        KeepLoreCatalog lore = new KeepLoreCatalog(new ObjectMapper());
        lore.load();
        KeepEventCatalog events = new KeepEventCatalog(new ObjectMapper());
        events.load();
        service = new KeepService(store, progressionService, cards, lore, events);
        service.setClock(clock);
        service.setRandom(new Random(7));

        user = new AccountUser();
        user.setId("keeper@example.com");
        user.setDisplayName("Ari");
    }

    @Test
    void newKeepStartsWithVisibleProductionResidentsAndCharterConversation() {
        Map<String, Object> snapshot = service.getSnapshot(user);

        assertEquals("Ari's Keep", snapshot.get("keepName"));
        assertTrue(((Number) snapshot.get("stateVersion")).longValue() >= 1L);
        assertEquals(KeepService.INITIAL_TIMBER, intAt(snapshot, "resources", "timber"));
        assertEquals(15, intAt(snapshot, "station", "available"));
        assertEquals(0, intAt(snapshot, "siegelingSlots", "active"));
        assertEquals(1, intAt(snapshot, "siegelingSlots", "capacity"));
        assertEquals(1, intAt(snapshot, "siegelingSlots", "available"));
        assertEquals(1, ((Number) snapshot.get("constructionSlots")).intValue());
        assertEquals(3, ((List<?>) snapshot.get("residents")).size());
        assertEquals(1, ((List<?>) snapshot.get("lore")).size());
        assertTrue(conversationIds(snapshot).contains("steward_first_promise"));
        assertTrue(conversationIds(snapshot).stream().anyMatch(id ->
                        id.startsWith("visitor_") || id.startsWith("interaction_")),
                "A lore-tied road visitor or Interaction NPC should appear on the first sanctuary visit.");
    }

    @Test
    void adverseEventCatalogHasTwentyShortCoinOrTimedRepairs() {
        KeepEventCatalog catalog = new KeepEventCatalog(new ObjectMapper());
        catalog.load();

        assertEquals(20, catalog.allEvents().size());
        assertEquals(10, catalog.allEvents().stream()
                .filter(event -> KeepEventCatalog.TARGET_UPGRADE.equals(event.targetType())).count());
        assertEquals(10, catalog.allEvents().stream()
                .filter(event -> KeepEventCatalog.TARGET_DECORATION.equals(event.targetType())).count());
        assertTrue(catalog.allEvents().stream().allMatch(event -> event.repairSeconds() > 0
                && event.repairSeconds() < 600 && event.coinCost() > 0));
    }

    @Test
    void timedEventRepairPausesProductionThenRestoresTargetInUnderTenMinutes() {
        service.getSnapshot(user);
        store.state.setHallLevel(2);
        store.state.setWoodlotLevel(2);
        store.state.setActiveKeepEventId("woodlot_washout");
        store.state.setKeepEventOccurredAt(clock.instant());

        Map<String, Object> damaged = service.getSnapshot(user);
        assertEquals("woodlot_washout", valueAt(damaged, "activeKeepEvent", "id"));
        assertEquals(0.0, ((Number) valueAt(damaged, "station", "ratePerMinute")).doubleValue(), .0001);

        Map<String, Object> repairing = service.repairKeepEvent(user, "woodlot_washout", "TIME",
                "event-time-repair", ((Number) damaged.get("stateVersion")).longValue());
        assertEquals(true, valueAt(repairing, "activeKeepEvent", "repairInProgress"));
        assertEquals(300, intAt(repairing, "activeKeepEvent", "repairSeconds"));

        clock.advance(Duration.ofSeconds(301));
        Map<String, Object> restored = service.getSnapshot(user);
        assertNull(restored.get("activeKeepEvent"));
        assertEquals(2.0, ((Number) valueAt(restored, "station", "ratePerMinute")).doubleValue(), .0001);
    }

    @Test
    void eligibleKeepSometimesRollsAnAdverseEventAfterCooldown() {
        service.getSnapshot(user);
        store.state.setHallLevel(2);
        store.state.setWoodlotLevel(2);
        service.setRandom(new Random() {
            @Override public int nextInt(int bound) { return 0; }
        });
        clock.advance(Duration.ofMinutes(46));

        Map<String, Object> snapshot = service.getSnapshot(user);

        assertNotNull(snapshot.get("activeKeepEvent"));
        assertEquals(20, intAt(snapshot, "keepEvents", "catalogSize"));
        assertEquals(1, intAt(snapshot, "keepEvents", "occurredCount"));
    }

    @Test
    void siegecoinsResolveEventImmediatelyAtServerOwnedPrice() {
        progression.setGold(100);
        Map<String, Object> first = service.getSnapshot(user);
        store.state.setActiveKeepEventId("hall_rooffall");
        store.state.setKeepEventOccurredAt(clock.instant());

        Map<String, Object> repaired = service.repairKeepEvent(user, "hall_rooffall", "SIEGECOINS",
                "event-coin-repair", ((Number) first.get("stateVersion")).longValue());

        assertNull(repaired.get("activeKeepEvent"));
        assertEquals(28, progression.getGold());
        assertEquals(72, intAt(repaired, "keepEventRepair", "coinCost"));

        service.repairKeepEvent(user, "hall_rooffall", "SIEGECOINS",
                "event-coin-repair", ((Number) first.get("stateVersion")).longValue());
        assertEquals(28, progression.getGold(), "An idempotent replay must not charge the repair twice.");
    }

    @Test
    void twentyBadVoiceChoicesEachHaveAOneTimeInteractionConsequence() {
        KeepLoreCatalog catalog = new KeepLoreCatalog(new ObjectMapper());
        catalog.load();
        List<KeepLoreCatalog.Conversation> followups = catalog.allConversations().stream()
                .filter(catalog::isInteraction).filter(KeepLoreCatalog.Conversation::oneTime).toList();
        assertEquals(20, followups.size());
        assertTrue(followups.stream().allMatch(item -> item.requiresFlags().size() == 1
                && item.requiresFlags().get(0).startsWith("bad_choice_")));

        Map<String, Object> first = service.getSnapshot(user);
        if (!store.state.getActiveVisitorIds().contains("interaction_elara_yard_rounds")) {
            store.state.getActiveVisitorIds().add("interaction_elara_yard_rounds");
        }
        Map<String, Object> consequence = service.chooseDialogue(user, "interaction_elara_yard_rounds", "press_duty",
                "bad-choice", ((Number) first.get("stateVersion")).longValue());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) consequence.get("dialogueResult");
        assertEquals(true, result.get("badChoice"));
        assertEquals("followup_elara_wall", result.get("followupConversationId"));
        assertTrue(conversationIds(consequence).contains("followup_elara_wall"));

        Map<String, Object> resolved = service.chooseDialogue(user, "followup_elara_wall", "restore_rounds",
                "followup-choice", ((Number) consequence.get("stateVersion")).longValue());
        assertFalse(conversationIds(resolved).contains("followup_elara_wall"));
        assertTrue(store.state.getCompletedConversationIds().contains("followup_elara_wall"));
    }

    @Test
    void collectionUnlocksLoreAndAnInvitedAffinityResidentBoostsFutureProduction() {
        Map<String, Object> collected = service.collect(user, "collect-1", 1);
        assertEquals(95, intAt(collected, "resources", "timber"));
        assertTrue(loreIds(collected).contains("letter_forester_maren"));
        assertEquals(List.of("letter_forester_maren"), collected.get("newLoreUnlocks"));

        Map<String, Object> invited = service.inviteResident(user, "mossling", "resident-1", 2);
        assertEquals("mossling", valueAt(invited, "station", "residentId"));
        assertEquals(1, intAt(invited, "siegelingSlots", "active"));
        assertEquals(0, intAt(invited, "siegelingSlots", "available"));
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
        assertTrue(conversationIds(completed).contains("steward_first_promise"));
        assertTrue(conversationIds(completed).contains("archivist_living_elements"),
                "The archive conversation unlocks after both recovered records.");
    }

    @Test
    @SuppressWarnings("unchecked")
    void constructionTimeSaversSpendMaterialsByPercentageOrAccountCoinsToComplete() {
        progression.setGold(20);
        service.getSnapshot(user);
        store.state.getMaterialInventory().put("verdant_fiber", 7);
        store.state.getMaterialInventory().put("ember_ingot", 5);
        service.collect(user, "collect-for-build", store.state.getVersion());

        Map<String, Object> started = service.startBuild(user, "restore_archive", "build-speedup", store.state.getVersion());
        Map<String, Object> active = (Map<String, Object>) started.get("activeConstruction");
        long xpBeforeCompletion = ((Number) valueAt(started, "keeper", "totalXp")).longValue();
        Map<String, Object> offers = (Map<String, Object>) active.get("timeSavers");
        assertEquals(10, ((Number) offers.get("materialCost")).intValue());
        assertEquals(25, ((Number) offers.get("materialPercent")).intValue());
        assertEquals(Boolean.TRUE, offers.get("canUseMaterials"));
        assertEquals(1, ((Number) offers.get("coinCost")).intValue());

        Map<String, Object> spedUp = service.speedUpConstruction(user, "restore_archive", "materials",
                "materials-speedup", store.state.getVersion());
        Map<String, Object> materialResult = (Map<String, Object>) spedUp.get("timeSaverApplied");
        assertEquals(30, ((Number) materialResult.get("savedSeconds")).longValue());
        assertEquals(90, ((Number) materialResult.get("remainingSeconds")).longValue());
        assertEquals(2, materialAmount(spedUp, "ember_ingot") + materialAmount(spedUp, "verdant_fiber"));

        Map<String, Object> completed = service.speedUpConstruction(user, "restore_archive", "siegecoins",
                "coin-speedup", store.state.getVersion());
        assertEquals(Boolean.TRUE, valueAt(completed, "visualState", "archiveRestored"));
        assertTrue(((List<?>) completed.get("activeConstructions")).isEmpty());
        assertEquals(19, intAt(completed, "resources", "gold"));
        assertEquals(1, progression.getKeepProjectsCompleted());
        assertEquals(xpBeforeCompletion + 40, ((Number) valueAt(completed, "keeper", "totalXp")).longValue());
    }

    @Test
    void constructionCoinTimeSaverRejectsAnInsufficientAccountBalance() {
        progression.setGold(0);
        service.getSnapshot(user);
        service.collect(user, "collect-for-build", store.state.getVersion());
        service.startBuild(user, "restore_archive", "build-speedup", store.state.getVersion());

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.speedUpConstruction(user, "restore_archive", "siegecoins",
                        "coin-speedup", store.state.getVersion()));
        assertTrue(error.getMessage().contains("more Siegecoins"));
        assertFalse(store.state.getActiveConstructionId().isBlank());
    }

    @Test
    @SuppressWarnings("unchecked")
    void instantProjectPurchaseUsesOnlyAccountCoinsAndBypassesABusyCrew() {
        progression.setGold(5_000);
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setWoodlotLevel(2);
        store.state.setStorehouseLevel(1);
        store.state.setTimber(2_000);

        Map<String, Object> optionsSnapshot = service.getSnapshot(user);
        Map<String, Object> forgeOption = ((List<Map<String, Object>>) optionsSnapshot.get("buildOptions")).stream()
                .filter(item -> "build_forge".equals(item.get("id"))).findFirst().orElseThrow();
        int instantCost = ((Number) forgeOption.get("instantCoinCost")).intValue();
        assertTrue(instantCost >= 500, "Buying a whole building must cost significant Siegecoins.");
        assertEquals(Boolean.TRUE, forgeOption.get("canPurchase"));

        service.startBuild(user, "build_fridge", "busy-crew", store.state.getVersion());
        int timberAfterStartingCrew = store.state.getTimber();
        Map<String, Integer> materialsBefore = Map.copyOf(store.state.getMaterialInventory());
        Map<String, Object> purchased = service.purchaseBuild(user, "build_forge", "buy-forge", store.state.getVersion());

        assertEquals(1, ((Number) station(purchased, "forge").get("level")).intValue());
        assertEquals(1, ((List<?>) purchased.get("activeConstructions")).size(),
                "The unrelated Fridge crew remains active; instant purchase never consumes or clears a crew.");
        assertEquals("build_fridge", valueAt(purchased, "activeConstruction", "id"));
        assertEquals(timberAfterStartingCrew, store.state.getTimber());
        assertEquals(materialsBefore, store.state.getMaterialInventory());
        assertEquals(5_000 - instantCost, intAt(purchased, "resources", "gold"));
        assertEquals(1, progression.getKeepProjectsCompleted());
    }

    @Test
    @SuppressWarnings("unchecked")
    void instantUpgradePurchasePreservesProjectMaterialsAndRejectsInsufficientCoins() {
        progression.setGold(10_000);
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setWoodlotLevel(2);
        store.state.setStorehouseLevel(1);
        store.state.setBuildersYardLevel(1);
        store.state.getFacilityLevels().put("garden", 1);
        store.state.getFacilityLastAccruedAt().put("garden", clock.instant());
        store.state.setTimber(500);
        store.state.getMaterialInventory().put("ember_ingot", 40);
        store.state.getMaterialInventory().put("frost_crystal", 40);

        Map<String, Object> before = service.getSnapshot(user);
        Map<String, Object> option = ((List<Map<String, Object>>) before.get("buildOptions")).stream()
                .filter(item -> "garden_level_2".equals(item.get("id"))).findFirst().orElseThrow();
        int cost = ((Number) option.get("instantCoinCost")).intValue();
        int timberBefore = store.state.getTimber();
        Map<String, Integer> materialsBefore = Map.copyOf(store.state.getMaterialInventory());

        Map<String, Object> purchased = service.purchaseBuild(user, "garden_level_2", "buy-upgrade", store.state.getVersion());
        assertEquals(2, ((Number) station(purchased, "garden").get("level")).intValue());
        assertEquals(timberBefore, store.state.getTimber());
        assertEquals(materialsBefore, store.state.getMaterialInventory());
        assertEquals(10_000 - cost, intAt(purchased, "resources", "gold"));

        progression.setGold(0);
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.purchaseBuild(user, "build_forge", "buy-without-coins", store.state.getVersion()));
        assertTrue(error.getMessage().contains("more Siegecoins"));
        assertEquals(0, store.state.getFacilityLevels().getOrDefault("forge", 0));
    }

    @Test
    void dialogueChoicePersistsRelationshipWithoutChangingEconomy() {
        Map<String, Object> before = service.getSnapshot(user);
        int timberBefore = intAt(before, "resources", "timber");
        long version = ((Number) before.get("stateVersion")).longValue();
        Map<String, Object> result = service.chooseDialogue(user, "steward_first_promise", "partners", "talk-1", version);

        assertEquals(timberBefore, intAt(result, "resources", "timber"));
        assertNotNull(result.get("dialogueResult"));
        assertTrue(((List<?>) result.get("choiceFlags")).contains("charter_stewardship"));
        @SuppressWarnings("unchecked")
        Map<String, Object> bond = (Map<String, Object>) ((List<?>) result.get("relationships")).get(0);
        assertEquals("Acquainted", bond.get("stage"));
        assertEquals(2, ((Number) bond.get("trust")).intValue());
        assertEquals(7, ((Number) bond.get("trustMax")).intValue());
        assertFalse(conversationIds(result).contains("steward_first_promise"));
    }

    @Test
    void rngVisitorEventsCanTradeSpendAndAlterTimberOrMaterials() {
        service.getSnapshot(user);
        store.state.getUnlockedLoreIds().add("letter_forester_maren");
        store.state.getActiveVisitorIds().clear();
        store.state.getActiveVisitorIds().add("visitor_traveling_peddler");
        store.state.setLastVisitorRollAt(clock.instant());
        store.state.setTimber(120);
        store.state.getMaterialInventory().put("verdant_fiber", 5);

        service.setRandom(new Random(1));
        long version = store.state.getVersion();
        Map<String, Object> sold = service.chooseDialogue(user, "visitor_traveling_peddler", "sell_timber",
                "visitor-sell-1", version);

        @SuppressWarnings("unchecked")
        Map<String, Object> dialogue = (Map<String, Object>) sold.get("dialogueResult");
        assertEquals("VISITOR", dialogue.get("kind"));
        assertEquals(20, ((Number) dialogue.get("timberSpent")).intValue());
        assertTrue(intAt(sold, "resources", "timber") <= 100);
        assertNotNull(dialogue.get("summary"));
        assertFalse(conversationIds(sold).contains("visitor_traveling_peddler"),
                "Resolved visitors leave until their cooldown elapses.");
        assertTrue(store.state.getVisitorAvailableAt().containsKey("visitor_traveling_peddler"));
    }

    @Test
    void siegelingDailyLifeVisitorsRollRandomConversationOutcomes() {
        service.getSnapshot(user);
        store.state.getActiveVisitorIds().clear();
        store.state.getActiveVisitorIds().add("visitor_breakfast_kettle");
        store.state.setLastVisitorRollAt(clock.instant());
        store.state.setTimber(100);
        service.setRandom(new Random(3));

        Map<String, Object> result = service.chooseDialogue(user, "visitor_breakfast_kettle", "shared_table",
                "breakfast-1", store.state.getVersion());
        @SuppressWarnings("unchecked")
        Map<String, Object> dialogue = (Map<String, Object>) result.get("dialogueResult");
        assertEquals("INTERACTION", dialogue.get("kind"));
        assertEquals(10, ((Number) dialogue.get("timberSpent")).intValue());
        assertTrue(String.valueOf(dialogue.get("outcomeId")).length() > 0);
        assertNotNull(dialogue.get("relationshipDelta"));
        assertTrue(loreIds(result).contains("chronicle_shared_mornings")
                || intAt(result, "resources", "timber") < 100
                || materialAmount(result, "ember_ingot") > 0
                || materialAmount(result, "verdant_fiber") > 0);
    }

    @Test
    void interactionNpcRepeatAfterCooldownAndAffinityFollowsChoices() {
        service.getSnapshot(user);
        store.state.getActiveVisitorIds().clear();
        store.state.getActiveVisitorIds().add("interaction_elara_yard_rounds");
        store.state.setLastVisitorRollAt(clock.instant());

        Map<String, Object> warm = service.chooseDialogue(user, "interaction_elara_yard_rounds", "ask_first",
                "elara-warm-1", store.state.getVersion());
        @SuppressWarnings("unchecked")
        Map<String, Object> warmDialogue = (Map<String, Object>) warm.get("dialogueResult");
        assertEquals("INTERACTION", warmDialogue.get("kind"));
        assertEquals(2, ((Number) warmDialogue.get("relationshipDelta")).intValue());
        assertEquals(2, ((Number) warmDialogue.get("trust")).intValue());
        assertEquals("Acquainted", warmDialogue.get("stage"));
        assertFalse(conversationIds(warm).contains("interaction_elara_yard_rounds"));
        assertEquals(2, store.state.getNpcTrust().get("steward_elara").intValue());

        // Before cooldown elapses, Elara's interaction must not re-seat even if the roll window opens.
        store.state.setLastVisitorRollAt(null);
        Map<String, Object> stillCooling = service.getSnapshot(user);
        assertFalse(conversationIds(stillCooling).contains("interaction_elara_yard_rounds"));

        clock.advance(Duration.ofHours(6).plusMinutes(1));
        store.state.setLastVisitorRollAt(null);
        // Flood the candidate pool with ineligible noise by locking other encounters behind missing lore,
        // then verify the returning Interaction NPC is preferred once cooldown clears.
        store.state.getNpcTrust().put("steward_elara", 2);
        Map<String, Object> returned = service.getSnapshot(user);
        assertTrue(conversationIds(returned).contains("interaction_elara_yard_rounds")
                        || store.state.getActiveVisitorIds().contains("interaction_elara_yard_rounds"),
                "Interaction NPCs should return after their cooldown so affinity can keep moving.");

        store.state.getActiveVisitorIds().clear();
        store.state.getActiveVisitorIds().add("interaction_elara_yard_rounds");
        store.state.setLastVisitorRollAt(clock.instant());
        Map<String, Object> cold = service.chooseDialogue(user, "interaction_elara_yard_rounds", "press_duty",
                "elara-cold-1", store.state.getVersion());
        @SuppressWarnings("unchecked")
        Map<String, Object> coldDialogue = (Map<String, Object>) cold.get("dialogueResult");
        assertEquals(-2, ((Number) coldDialogue.get("relationshipDelta")).intValue());
        assertEquals(0, ((Number) coldDialogue.get("trust")).intValue());
        assertEquals("Distant", coldDialogue.get("stage"));
        assertEquals(0, store.state.getNpcTrust().get("steward_elara").intValue());
    }

    @Test
    void visitorTradeRejectsUnaffordableChoicesAndFixedTradesMoveMaterials() {
        service.getSnapshot(user);
        store.state.getUnlockedLoreIds().add("ledger_quartermaster_sera");
        store.state.setStorehouseLevel(1);
        store.state.getActiveVisitorIds().clear();
        store.state.getActiveVisitorIds().add("visitor_quartermaster_runner");
        store.state.setLastVisitorRollAt(clock.instant());
        store.state.getMaterialInventory().put("verdant_fiber", 1);
        store.state.getMaterialInventory().put("ember_ingot", 0);

        assertThrows(IllegalArgumentException.class,
                () -> service.chooseDialogue(user, "visitor_quartermaster_runner", "controlled_trade",
                        "visitor-trade-fail", store.state.getVersion()));

        store.state.getMaterialInventory().put("verdant_fiber", 6);
        Map<String, Object> traded = service.chooseDialogue(user, "visitor_quartermaster_runner", "controlled_trade",
                "visitor-trade-ok", store.state.getVersion());
        assertEquals(2, materialAmount(traded, "verdant_fiber"));
        assertEquals(3, materialAmount(traded, "ember_ingot"));
        assertTrue(loreIds(traded).contains("memorabilia_shared_crate_seal"));
    }

    @Test
    void keepActionsRecordLifetimeProgressionStats() {
        Map<String, Object> start = service.getSnapshot(user);
        assertTrue(progression.isKeepFounded(), "Loading the keep marks the sanctuary as founded.");
        long version = ((Number) start.get("stateVersion")).longValue();

        service.collect(user, "collect-1", version);
        assertEquals(15, progression.getKeepTimberCollected());
        service.collect(user, "collect-1", version);
        assertEquals(15, progression.getKeepTimberCollected(),
                "A replayed request id must not double-count collected timber.");
        version = store.state.getVersion();

        service.startBuild(user, "restore_archive", "build-1", version);
        clock.advance(Duration.ofSeconds(KeepService.ARCHIVE_RESTORE_SECONDS + 1));
        service.getSnapshot(user);
        assertEquals(1, progression.getKeepProjectsCompleted());
        version = store.state.getVersion();

        service.readLore(user, "charter_three_promises", "read-1", version);
        assertEquals(1, progression.getKeepLoreRead());
        version = store.state.getVersion();
        service.readLore(user, "charter_three_promises", "read-2", version);
        assertEquals(1, progression.getKeepLoreRead(),
                "Re-reading an entry must not inflate the lifetime count.");
        version = store.state.getVersion();

        service.chooseDialogue(user, "steward_first_promise", "partners", "talk-1", version);
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

        Map<String, Object> assigned = service.inviteResident(user, "garden", "mossling", "garden-resident",
                store.state.getVersion());
        assertEquals("mossling", station(assigned, "garden").get("residentId"));
        assertEquals(0.30, ((Number) station(assigned, "garden").get("ratePerMinute")).doubleValue(), 0.0001);
        assertEquals("", station(assigned, "forge").get("residentId"));
    }

    @Test
    void milestoneRewardsGrantCardGameCurrencyOnlyOnce() {
        service.getSnapshot(user);
        store.state.setEssenceCollectCount(1);
        long version = store.state.getVersion();

        Map<String, Object> claimed = service.claimReward(user, "first_harvest", "reward-1", version);
        assertEquals(100, intAt(claimed, "resources", "gold"));
        assertEquals(25, intAt(claimed, "resources", "remnants"));
        assertTrue(progression.getKeepRewardClaimIds().contains("first_harvest"));
        assertThrows(IllegalArgumentException.class,
                () -> service.claimReward(user, "first_harvest", "reward-2", store.state.getVersion()));
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

        long version = store.state.getVersion();
        Map<String, Object> decoration = service.craft(user, "living_trellis", "craft-decor", version);
        assertEquals(12, materialAmount(decoration, "verdant_fiber"));
        Map<String, Object> placed = service.placeDecoration(user, "garden", "living_trellis", true,
                "place-decor", store.state.getVersion());
        assertEquals("living_trellis", valueAt(placed, "placedDecorations", "garden"));

        Map<String, Object> tool = service.craft(user, "gardener_tools", "craft-tool", store.state.getVersion());
        assertEquals(0.30, ((Number) station(tool, "garden").get("ratePerMinute")).doubleValue(), 0.0001);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> recipes = (List<Map<String, Object>>) tool.get("recipes");
        assertTrue(recipes.stream().anyMatch(item -> "gardener_tools".equals(item.get("id"))
                && Boolean.TRUE.equals(item.get("crafted"))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void roomExpansionsCostMaterialsFromPartnerWorkshops() {
        service.getSnapshot(user);
        store.state.setWoodlotLevel(2);
        for (String id : List.of("garden", "forge", "fridge", "generator", "quarry", "kitchen")) {
            store.state.getFacilityLevels().put(id, 2);
            store.state.getFacilityLastAccruedAt().put(id, clock.instant());
        }
        Map<String, String> primaryByRoom = Map.of("woodlot", "verdant_fiber", "garden", "verdant_fiber",
                "forge", "ember_ingot", "fridge", "frost_crystal", "generator", "storm_cell",
                "quarry", "stone", "kitchen", "provisions");

        List<Map<String, Object>> recipes = (List<Map<String, Object>>) service.getSnapshot(user).get("recipes");
        int checked = 0;
        for (Map<String, Object> recipe : recipes) {
            String room = String.valueOf(recipe.get("roomId"));
            int tier = ((Number) recipe.get("tier")).intValue();
            if (!primaryByRoom.containsKey(room) || tier < 2) continue;
            List<Map<String, Object>> costs = (List<Map<String, Object>>) recipe.get("costs");
            List<String> materials = costs.stream().map(cost -> String.valueOf(cost.get("id"))).toList();
            assertTrue(materials.contains(primaryByRoom.get(room)),
                    recipe.get("id") + " should still cost its own workshop material");
            assertTrue(materials.size() >= 2,
                    recipe.get("id") + " should also cost a material from another building, got " + materials);
            if (tier >= 4) {
                assertEquals(3, materials.size(),
                        recipe.get("id") + " should draw on two partner workshops at tier " + tier);
            }
            assertEquals(materials.size(), Set.copyOf(materials).size(), recipe.get("id") + " lists a material twice");
            checked++;
        }
        assertEquals(63, checked, "every room expansion tier 2-6 should be covered");
    }

    @Test
    @SuppressWarnings("unchecked")
    void everyExpansionCarriesItsOwnDescription() {
        service.getSnapshot(user);
        store.state.setWoodlotLevel(2);
        for (String id : List.of("garden", "forge", "fridge", "generator", "quarry", "kitchen")) {
            store.state.getFacilityLevels().put(id, 2);
            store.state.getFacilityLastAccruedAt().put(id, clock.instant());
        }
        List<Map<String, Object>> recipes = (List<Map<String, Object>>) service.getSnapshot(user).get("recipes");
        List<String> descriptions = recipes.stream().map(recipe -> String.valueOf(recipe.get("description"))).toList();
        assertEquals(descriptions.size(), Set.copyOf(descriptions).size(),
                "shared boilerplate descriptions make every workshop read the same");
    }

    @Test
    void everyProductionRoomOffersFiveToolsAndSixDecorationsIncludingStorage() {
        service.getSnapshot(user);
        store.state.setWoodlotLevel(2);
        for (String id : List.of("garden", "forge", "fridge", "generator", "quarry", "kitchen")) {
            store.state.getFacilityLevels().put(id, 2);
            store.state.getFacilityLastAccruedAt().put(id, clock.instant());
        }
        for (String id : List.of("verdant_fiber", "ember_ingot", "frost_crystal", "storm_cell", "stone", "provisions")) {
            store.state.getMaterialInventory().put(id, 200);
        }

        Map<String, Object> snapshot = service.getSnapshot(user);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> recipes = (List<Map<String, Object>>) snapshot.get("recipes");
        for (String room : List.of("woodlot", "garden", "forge", "fridge", "generator", "quarry", "kitchen")) {
            assertEquals(5, recipes.stream().filter(item -> room.equals(item.get("roomId")) && "TOOL".equals(item.get("type"))).count());
            assertEquals(6, recipes.stream().filter(item -> room.equals(item.get("roomId")) && "DECORATION".equals(item.get("type"))).count());
        }

        assertThrows(IllegalArgumentException.class,
                () -> service.craft(user, "dewline_irrigator", "tool-out-of-order", store.state.getVersion()));
        service.craft(user, "gardener_tools", "tool-1", store.state.getVersion());
        Map<String, Object> twoTools = service.craft(user, "dewline_irrigator", "tool-2", store.state.getVersion());
        assertEquals(.70, ((Number) station(twoTools, "garden").get("ratePerMinute")).doubleValue(), .0001);

        service.craft(user, "living_trellis", "decor-1", store.state.getVersion());
        service.craft(user, "seed_banners", "decor-2", store.state.getVersion());
        service.placeDecoration(user, "garden", "living_trellis", true, "place-1", store.state.getVersion());
        Map<String, Object> placed = service.placeDecoration(user, "garden", "seed_banners", true,
                "place-2", store.state.getVersion());
        String placedIds = String.valueOf(valueAt(placed, "placedDecorations", "garden"));
        assertTrue(placedIds.contains("living_trellis"));
        assertTrue(placedIds.contains("seed_banners"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void keeperLevelStorageAnnexAndDisplayedFurnishingStackOnLocalCapacity() {
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setWoodlotLevel(2);
        store.state.setStorehouseLevel(1);
        store.state.setBuildersYardLevel(1);
        store.state.setKeeperXp(2_700); // Keeper Level 10 unlocks the first storage annex.
        store.state.setTimber(2_000);
        for (String id : List.of("verdant_fiber", "ember_ingot", "stone")) {
            store.state.getMaterialInventory().put(id, 200);
        }

        Map<String, Object> before = service.getSnapshot(user);
        assertEquals(540, intAt(before, "station", "storageCapacity"));
        List<Map<String, Object>> options = (List<Map<String, Object>>) before.get("buildOptions");
        Map<String, Object> annex = options.stream()
                .filter(item -> "woodlot_storage_annex".equals(item.get("id"))).findFirst().orElseThrow();
        assertEquals(10, ((Number) annex.get("requiredLevel")).intValue());
        assertEquals(Boolean.TRUE, annex.get("canStart"));

        service.startBuild(user, "woodlot_storage_annex", "storage-build", store.state.getVersion());
        clock.advance(Duration.ofSeconds(14_401));
        Map<String, Object> expanded = service.getSnapshot(user);
        assertEquals(810, intAt(expanded, "station", "storageCapacity"));
        assertEquals(50, intAt(expanded, "station", "storageBonusPercent"));
        assertEquals(1, store.state.getStorageUpgradeLevels().get("woodlot"));

        Map<String, Object> crafted = service.craft(user, "coppice_storewall", "storage-craft", store.state.getVersion());
        assertEquals("Woodlot storage +25% while displayed", recipe(crafted, "coppice_storewall").get("bonus"));
        Map<String, Object> placed = service.placeDecoration(user, "woodlot", "coppice_storewall", true,
                "storage-place", store.state.getVersion());
        assertEquals(945, intAt(placed, "station", "storageCapacity"));
        assertEquals(75, intAt(placed, "station", "storageBonusPercent"));
        assertThrows(IllegalArgumentException.class,
                () -> service.startBuild(user, "woodlot_storage_annex", "storage-again", store.state.getVersion()));

        Map<String, Object> keeper = (Map<String, Object>) placed.get("keeper");
        List<Map<String, Object>> levels = (List<Map<String, Object>>) keeper.get("levels");
        assertTrue(String.valueOf(levels.get(9).get("unlockLabel")).contains("Woodlot Storewall"));
    }

    @Test
    void enclaveBuildsOutsideQuarterHostsFiveResidentsAndIssuesMissions() {
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setTimber(500);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> options = (List<Map<String, Object>>) service.getSnapshot(user).get("buildOptions");
        assertTrue(options.stream().anyMatch(item -> "build_enclave".equals(item.get("id"))));

        service.startBuild(user, "build_enclave", "enclave-build", store.state.getVersion());
        clock.advance(Duration.ofSeconds(KeepService.ENCLAVE_BUILD_SECONDS + 1));
        Map<String, Object> built = service.getSnapshot(user);
        assertEquals(Boolean.TRUE, valueAt(built, "enclave", "built"));
        assertEquals(5, intAt(built, "enclave", "capacity"));

        store.state.setTimber(0);
        service.setEnclaveResident(user, 0, "mossling", "enclave-resident", store.state.getVersion());
        Map<String, Object> occupied = service.getSnapshot(user);
        assertEquals(1, intAt(occupied, "siegelingSlots", "active"));
        assertEquals(6, intAt(occupied, "siegelingSlots", "capacity"));
        assertEquals(5, intAt(occupied, "siegelingSlots", "available"));
        for (int index = 0; index < 3; index++) {
            clock.advance(Duration.ofMinutes(2));
            service.collect(user, "woodlot", "enclave-collect-" + index, store.state.getVersion());
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> enclave = (Map<String, Object>) service.getSnapshot(user).get("enclave");
        @SuppressWarnings("unchecked")
        Map<String, Object> slot = (Map<String, Object>) ((List<?>) enclave.get("slots")).get(0);
        @SuppressWarnings("unchecked")
        Map<String, Object> mission = (Map<String, Object>) slot.get("mission");
        assertEquals(Boolean.TRUE, mission.get("complete"));
        assertEquals(3, ((Number) mission.get("progress")).intValue());

        Map<String, Object> claimed = service.claimReward(user, String.valueOf(mission.get("id")),
                "enclave-reward", store.state.getVersion());
        assertEquals(90, ((Number) valueAt(claimed, "rewardClaimed", "gold")).intValue());
        assertEquals(20, ((Number) valueAt(claimed, "rewardClaimed", "remnants")).intValue());
    }

    @Test
    void hallUpgradesRaiseKeepRankExpandCapacityAndUnlockScenery() {
        Map<String, Object> start = service.getSnapshot(user);
        assertEquals(1, intAt(start, "keepRank", "level"));
        assertEquals("Ruined Camp", valueAt(start, "keepRank", "name"));
        assertThrows(IllegalArgumentException.class,
                () -> service.startBuild(user, "hall_level_2", "hall-fail", store.state.getVersion()),
                "The Timber Outpost gate requires the restored archive.");

        store.state.setArchiveLevel(1);
        store.state.setTimber(500);
        Map<String, Object> gated = service.getSnapshot(user);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> options = (List<Map<String, Object>>) gated.get("buildOptions");
        assertTrue(options.stream().anyMatch(item -> "hall_level_2".equals(item.get("id"))),
                "The next hall rank appears alongside the restoration chain once gated requirements are met.");

        service.startBuild(user, "hall_level_2", "hall-1", store.state.getVersion());
        clock.advance(Duration.ofSeconds(901));
        Map<String, Object> upgraded = service.getSnapshot(user);
        assertEquals(2, intAt(upgraded, "keepRank", "level"));
        assertEquals("Timber Outpost", valueAt(upgraded, "keepRank", "name"));
        assertEquals(2, intAt(upgraded, "visualState", "hallLevel"));
        assertEquals(KeepService.TIMBER_INVENTORY_CAPACITY + 50, intAt(upgraded, "resources", "timberCapacity"),
                "Each hall level adds timber capacity.");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> buildings = (List<Map<String, Object>>) upgraded.get("buildings");
        Map<String, Object> walls = buildings.stream().filter(item -> "walls".equals(item.get("id"))).findFirst().orElseThrow();
        assertEquals("FOUNDATIONS", walls.get("status"));

        store.state.setHallLevel(5);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> walled = (List<Map<String, Object>>) service.getSnapshot(user).get("buildings");
        assertEquals("COMPLETE", walled.stream().filter(item -> "walls".equals(item.get("id")))
                .findFirst().orElseThrow().get("status"));
        assertEquals("Walled Keep", valueAt(service.getSnapshot(user), "keepRank", "name"));
    }

    @Test
    void hallThemesArePersistedValidatedAndSerialized() {
        service.getSnapshot(user);
        assertThrows(IllegalArgumentException.class,
                () -> service.setHallTheme(user, "plaid", "theme-fail", store.state.getVersion()));

        Map<String, Object> ember = service.setHallTheme(user, "ember", "theme-1", store.state.getVersion());
        assertEquals("ember", valueAt(ember, "visualState", "hallTheme"));
        assertEquals("Ember Accord", valueAt(ember, "hallTheme", "name"));
        assertEquals("ember", store.state.getHallThemeId());

        Map<String, Object> reset = service.setHallTheme(user, "", "theme-2", store.state.getVersion());
        assertEquals("covenant", valueAt(reset, "visualState", "hallTheme"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> themes = (List<Map<String, Object>>) reset.get("hallThemes");
        assertEquals(8, themes.size());
        assertTrue(themes.stream().anyMatch(item -> "covenant".equals(item.get("id"))
                && Boolean.TRUE.equals(item.get("active"))));
    }

    @Test
    void favoriteSieglingGrantsRarityScaledKeepWideBoost() {
        service.getSnapshot(user);
        assertThrows(IllegalArgumentException.class,
                () -> service.setFavorite(user, "unknown_card", "fav-fail", store.state.getVersion()));

        Map<String, Object> common = service.setFavorite(user, "mossling", "fav-1", store.state.getVersion());
        assertEquals(1.05, ((Number) valueAt(common, "station", "ratePerMinute")).doubleValue(), 0.0001);
        assertEquals(5, intAt(common, "favorite", "bonusPercent"));

        Map<String, Object> legendary = service.setFavorite(user, "aurorix", "fav-2", store.state.getVersion());
        assertEquals(1.20, ((Number) valueAt(legendary, "station", "ratePerMinute")).doubleValue(), 0.0001);
        assertEquals(20, intAt(legendary, "favorite", "bonusPercent"));
        assertEquals("aurorix", store.state.getFavoriteResidentId());

        store.state.getFacilityLevels().put("garden", 1);
        store.state.getFacilityLastAccruedAt().put("garden", clock.instant());
        Map<String, Object> withGarden = service.getSnapshot(user);
        assertEquals(0.30, ((Number) station(withGarden, "garden").get("ratePerMinute")).doubleValue(), 0.0001,
                "The favorite boost applies to every facility, not just the woodlot.");

        Map<String, Object> cleared = service.setFavorite(user, "", "fav-3", store.state.getVersion());
        assertEquals(0, intAt(cleared, "favorite", "bonusPercent"));

        // The favor chooser previews each candidate before it is approved, so every resident
        // carries the bonus it would grant — not only whoever is honored right now.
        assertEquals(5, ((Number) residentPayload(cleared, "mossling").get("favoriteBonusPercent")).intValue());
        assertEquals(20, ((Number) residentPayload(cleared, "aurorix").get("favoriteBonusPercent")).intValue());
        store.state.getResidentRapport().put("mossling", 5);
        assertEquals(6, ((Number) residentPayload(service.getSnapshot(user), "mossling").get("favoriteBonusPercent")).intValue(),
                "A bonded Siegeling must preview the rapport-multiplied favor, matching the boost it applies.");
    }

    @Test
    void keeperLevelsIncreaseConstructionTeamsAndBuildersYardUnlocksAdvancedRecipes() {
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setWoodlotLevel(2);
        store.state.setStorehouseLevel(1);
        store.state.getFacilityLevels().put("garden", 1);
        store.state.getFacilityLastAccruedAt().put("garden", clock.instant());
        store.state.setTimber(2_000);
        store.state.getMaterialInventory().put("verdant_fiber", 40);
        store.state.getMaterialInventory().put("ember_ingot", 40);
        store.state.getMaterialInventory().put("frost_crystal", 40);
        store.state.getMaterialInventory().put("stone", 40);

        assertThrows(IllegalArgumentException.class,
                () -> service.startBuild(user, "garden_level_2", "adv-fail", store.state.getVersion()),
                "Level-2 expansions require the Builder's Yard.");

        service.startBuild(user, "build_forge", "build-1", store.state.getVersion());
        assertThrows(IllegalArgumentException.class,
                () -> service.startBuild(user, "build_fridge", "build-2", store.state.getVersion()),
                "Keeper Levels 1-4 coordinate one construction team.");

        store.state.setKeeperXp(700); // Keeper Level 5 unlocks team two.
        store.state.setBuildersYardLevel(1);
        Map<String, Object> second = service.startBuild(user, "build_fridge", "build-3", store.state.getVersion());
        assertEquals(2, ((List<?>) second.get("activeConstructions")).size());
        assertEquals(2, ((Number) second.get("constructionSlots")).intValue());

        store.state.setKeeperXp(2_700); // Keeper Level 10 unlocks team three.
        Map<String, Object> third = service.startBuild(user, "build_generator", "build-4", store.state.getVersion());
        assertEquals(3, ((List<?>) third.get("activeConstructions")).size());
        assertEquals(3, ((Number) third.get("constructionSlots")).intValue());
        assertThrows(IllegalArgumentException.class,
                () -> service.startBuild(user, "build_quarry", "build-5", store.state.getVersion()),
                "All level-provided teams are active.");

        clock.advance(Duration.ofSeconds(KeepService.GENERATOR_LEVEL_ONE_SECONDS + 1));
        Map<String, Object> completed = service.getSnapshot(user);
        assertEquals(1, ((Number) station(completed, "forge").get("level")).intValue());
        assertEquals(1, ((Number) station(completed, "fridge").get("level")).intValue());
        assertEquals(1, ((Number) station(completed, "generator").get("level")).intValue());
        assertEquals(3, progression.getKeepProjectsCompleted());

        Map<String, Object> advanced = service.startBuild(user, "garden_level_2", "adv-ok", store.state.getVersion());
        assertNotNull(advanced.get("activeConstruction"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void aProjectUnderConstructionLeavesTheOfferListSoAFreeTeamCanStartSomethingElse() {
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setWoodlotLevel(2);
        store.state.setStorehouseLevel(1);
        store.state.setKeeperXp(700); // Keeper Level 5 coordinates two teams.
        store.state.setTimber(2_000);

        Map<String, Object> started = service.startBuild(user, "build_generator", "busy-1", store.state.getVersion());
        List<Map<String, Object>> options = (List<Map<String, Object>>) started.get("buildOptions");
        assertTrue(options.stream().noneMatch(item -> "build_generator".equals(item.get("id"))),
                "A project a crew already holds must not be offered again — startBuild would reject it.");

        Map<String, Object> kitchen = options.stream()
                .filter(item -> "build_kitchen".equals(item.get("id"))).findFirst().orElseThrow();
        assertEquals(Boolean.TRUE, kitchen.get("canStart"), "The free second team can still take another project.");
        service.startBuild(user, "build_kitchen", "busy-2", store.state.getVersion());

        clock.advance(Duration.ofSeconds(KeepService.GENERATOR_LEVEL_ONE_SECONDS + 1));
        Map<String, Object> completed = service.getSnapshot(user);
        assertEquals(1, ((Number) station(completed, "generator").get("level")).intValue());
        List<Map<String, Object>> after = (List<Map<String, Object>>) completed.get("buildOptions");
        assertTrue(after.stream().noneMatch(item -> "build_generator".equals(item.get("id"))),
                "A finished facility leaves the level-1 offer list.");
    }

    @Test
    void quarryAndKitchenProduceStoneAndProvisions() {
        service.getSnapshot(user);
        store.state.setStorehouseLevel(1);
        store.state.getFacilityLevels().put("quarry", 1);
        store.state.getFacilityLevels().put("kitchen", 1);
        store.state.getFacilityLastAccruedAt().put("quarry", clock.instant());
        store.state.getFacilityLastAccruedAt().put("kitchen", clock.instant());
        clock.advance(Duration.ofMinutes(100));

        Map<String, Object> snapshot = service.getSnapshot(user);
        assertEquals(22, ((Number) station(snapshot, "quarry").get("available")).intValue());
        assertEquals(30, ((Number) station(snapshot, "kitchen").get("available")).intValue());

        Map<String, Object> collected = service.collect(user, "quarry", "collect-stone", store.state.getVersion());
        assertEquals(22, materialAmount(collected, "stone"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void collectAllGathersEveryReadyProductionPointInOneAction() {
        service.getSnapshot(user);
        store.state.setStorehouseLevel(1);
        store.state.setTimber(0);
        store.state.setWoodlotStored(0);
        store.state.setWoodlotLastAccruedAt(clock.instant());
        store.state.getFacilityLevels().put("quarry", 1);
        store.state.getFacilityLevels().put("kitchen", 1);
        store.state.getFacilityLastAccruedAt().put("quarry", clock.instant());
        store.state.getFacilityLastAccruedAt().put("kitchen", clock.instant());
        clock.advance(Duration.ofMinutes(100));

        Map<String, Object> before = service.getSnapshot(user);
        int timberReady = ((Number) station(before, "woodlot").get("available")).intValue();
        int stoneReady = ((Number) station(before, "quarry").get("available")).intValue();
        int provisionsReady = ((Number) station(before, "kitchen").get("available")).intValue();
        assertTrue(timberReady > 0 && stoneReady > 0 && provisionsReady > 0);

        Map<String, Object> collected = service.collect(user, "all", "collect-all-points", store.state.getVersion());
        Map<String, Object> summary = (Map<String, Object>) collected.get("collected");
        assertEquals("all", summary.get("stationId"));
        assertEquals(timberReady + stoneReady + provisionsReady, ((Number) summary.get("amount")).intValue());
        List<Map<String, Object>> grants = (List<Map<String, Object>>) summary.get("stations");
        assertEquals(3, grants.size());
        assertEquals(timberReady, intAt(collected, "resources", "timber"));
        assertEquals(stoneReady, materialAmount(collected, "stone"));
        assertEquals(provisionsReady, materialAmount(collected, "provisions"));
        assertEquals(0, ((Number) station(collected, "woodlot").get("available")).intValue());
        assertEquals(0, ((Number) station(collected, "quarry").get("available")).intValue());
        assertEquals(0, ((Number) station(collected, "kitchen").get("available")).intValue());

        assertThrows(IllegalArgumentException.class,
                () -> service.collect(user, "all", "collect-all-empty", store.state.getVersion()),
                "A second collect-all with empty stockpiles must refuse rather than no-op.");
    }

    @Test
    void weeklyOrderSpendsMaterialsOncePerWeekForBoostedIncome() {
        service.getSnapshot(user);
        assertThrows(IllegalArgumentException.class,
                () -> service.claimReward(user, "weekly_order", "order-locked", store.state.getVersion()),
                "Weekly orders unlock with the Garden Kitchen.");

        store.state.getFacilityLevels().put("kitchen", 1);
        store.state.getFacilityLastAccruedAt().put("kitchen", clock.instant());
        for (String materialId : List.of("verdant_fiber", "ember_ingot", "frost_crystal", "storm_cell", "stone", "provisions")) {
            store.state.getMaterialInventory().put(materialId, 60);
        }
        Map<String, Object> snapshot = service.getSnapshot(user);
        @SuppressWarnings("unchecked")
        Map<String, Object> order = (Map<String, Object>) snapshot.get("weeklyOrder");
        assertEquals(Boolean.TRUE, order.get("unlocked"));
        assertEquals(Boolean.TRUE, order.get("canClaim"));
        assertFalse(((List<?>) order.get("requirements")).isEmpty());

        int goldBefore = progression.getGold();
        Map<String, Object> claimed = service.claimReward(user, "weekly_order", "order-1", store.state.getVersion());
        assertTrue(progression.getGold() > goldBefore);
        @SuppressWarnings("unchecked")
        Map<String, Object> orderAfter = (Map<String, Object>) claimed.get("weeklyOrder");
        assertEquals(Boolean.TRUE, orderAfter.get("claimed"));
        assertTrue(((List<Map<String, Object>>) orderAfter.get("requirements")).stream()
                .allMatch(item -> ((Number) item.get("have")).intValue() < 60),
                "Claiming the order spends the required materials.");

        assertThrows(IllegalArgumentException.class,
                () -> service.claimReward(user, "weekly_order", "order-2", store.state.getVersion()),
                "The order can only be filled once per week.");
    }

    @Test
    @SuppressWarnings("unchecked")
    void weeklyOrderDoesNotCreditGoldWhenKeepSaveFails() {
        service.getSnapshot(user);
        store.state.getFacilityLevels().put("kitchen", 1);
        store.state.getFacilityLastAccruedAt().put("kitchen", clock.instant());
        for (String materialId : List.of("verdant_fiber", "ember_ingot", "frost_crystal", "storm_cell", "stone", "provisions")) {
            store.state.getMaterialInventory().put(materialId, 60);
        }
        Map<String, Object> snapshot = service.getSnapshot(user);
        Map<String, Object> order = (Map<String, Object>) snapshot.get("weeklyOrder");
        List<Map<String, Object>> requirements = (List<Map<String, Object>>) order.get("requirements");
        assertFalse(requirements.isEmpty());

        int goldBefore = progression.getGold();
        int remnantsBefore = progression.getRemnants();
        java.util.concurrent.atomic.AtomicInteger progressionSaves = new java.util.concurrent.atomic.AtomicInteger();
        service.setProgressionStore(new PlayerProgressionStore() {
            @Override public PlayerProgressionEntity save(PlayerProgressionEntity entity) {
                progressionSaves.incrementAndGet();
                return entity;
            }
        });
        store.failNextSave = true;

        assertThrows(IllegalStateException.class,
                () -> service.claimReward(user, "weekly_order", "order-fail", store.state.getVersion()));
        assertEquals(goldBefore, progression.getGold(),
                "Weekly-order Siegecoins must not mint before Keep persists the spent materials.");
        assertEquals(remnantsBefore, progression.getRemnants());
        assertTrue(progression.getKeepRewardClaimIds().stream().noneMatch(id -> id.startsWith("weekly_order:")),
                "The claim marker must not land without the Keep spend.");
        assertEquals(0, progressionSaves.get());

        // Simulate Cloud Run reload: Firestore still has the unspent materials and no claim.
        for (String materialId : List.of("verdant_fiber", "ember_ingot", "frost_crystal", "storm_cell", "stone", "provisions")) {
            store.state.getMaterialInventory().put(materialId, 60);
        }
        store.failNextSave = false;

        Map<String, Object> claimed = service.claimReward(user, "weekly_order", "order-retry", store.state.getVersion());
        assertTrue(progression.getGold() > goldBefore);
        assertEquals(1, progressionSaves.get());
        Map<String, Object> orderAfter = (Map<String, Object>) claimed.get("weeklyOrder");
        assertEquals(Boolean.TRUE, orderAfter.get("claimed"));
        assertTrue(((List<Map<String, Object>>) orderAfter.get("requirements")).stream()
                .allMatch(item -> ((Number) item.get("have")).intValue() < 60));
    }

    @Test
    @SuppressWarnings("unchecked")
    void keeperBlockExposesFreeTrackChaptersAndLevels() {
        Map<String, Object> keeper = (Map<String, Object>) service.getSnapshot(user).get("keeper");
        assertNotNull(keeper);
        assertEquals(KeepService.KEEPER_MAX_LEVEL, ((Number) keeper.get("maxLevel")).intValue());
        List<Map<String, Object>> chapters = (List<Map<String, Object>>) keeper.get("chapters");
        assertEquals(5, chapters.size());
        assertEquals("The Wounded Ground", chapters.get(0).get("title"));
        List<Map<String, Object>> levels = (List<Map<String, Object>>) keeper.get("levels");
        assertEquals(KeepService.KEEPER_MAX_LEVEL, levels.size());
        long previous = -1;
        for (Map<String, Object> level : levels) {
            long required = ((Number) level.get("requiredXp")).longValue();
            assertTrue(required > previous, "Keeper level XP thresholds must strictly increase.");
            previous = required;
        }
        assertEquals(16200L, previous, "reach(25) = 25*24*27 = 16200.");
    }

    @Test
    @SuppressWarnings("unchecked")
    void dailyVisitAwardsKeeperXpOncePerUtcDay() {
        Map<String, Object> first = service.getSnapshot(user);
        assertEquals(60, ((Number) first.get("keeperDailyXpAwarded")).intValue());
        Map<String, Object> keeper = (Map<String, Object>) first.get("keeper");
        // 52 one-time backfill (1 build level + 1 starting lore) + 60 daily visit.
        assertEquals(112L, ((Number) keeper.get("totalXp")).longValue());
        assertEquals(2, ((Number) keeper.get("level")).intValue());

        Map<String, Object> sameDay = service.getSnapshot(user);
        assertFalse(sameDay.containsKey("keeperDailyXpAwarded"), "Daily XP is granted only once per UTC day.");

        clock.advance(Duration.ofDays(1));
        assertEquals(60, ((Number) service.getSnapshot(user).get("keeperDailyXpAwarded")).intValue());
    }

    @Test
    @SuppressWarnings("unchecked")
    void collectingResourcesAwardsCappedResourceXpThatResetsDaily() {
        Map<String, Object> collected = service.collect(user, "collect-1", -1);
        assertEquals(10, ((Number) collected.get("keeperXpAwarded")).intValue());
        Map<String, Object> keeper = (Map<String, Object>) collected.get("keeper");
        assertEquals(10, ((Number) keeper.get("resourceXpToday")).intValue());

        clock.advance(Duration.ofDays(1));
        Map<String, Object> nextDay = (Map<String, Object>) service.getSnapshot(user).get("keeper");
        assertEquals(0, ((Number) nextDay.get("resourceXpToday")).intValue(), "The resource-XP cap resets each day.");
    }

    @Test
    void claimingAKeeperLevelRewardPaysOnceAndGuardsUnreachedLevels() {
        service.getSnapshot(user); // reaches Keeper Level 2
        long goldBefore = progression.getGold();

        Map<String, Object> claimed = service.claimReward(user, "keeper_level:1", "claim-1", -1);
        @SuppressWarnings("unchecked")
        Map<String, Object> reward = (Map<String, Object>) claimed.get("rewardClaimed");
        assertEquals(52, ((Number) reward.get("gold")).intValue());    // 40 + 12*1
        assertEquals(11, ((Number) reward.get("remnants")).intValue()); // 8 + 3*1
        assertEquals(goldBefore + 52, progression.getGold());

        assertThrows(IllegalArgumentException.class,
                () -> service.claimReward(user, "keeper_level:1", "claim-2", -1),
                "A Keeper Level reward can only be claimed once.");
        assertThrows(IllegalArgumentException.class,
                () -> service.claimReward(user, "keeper_level:6", "claim-3", -1),
                "An unreached Keeper Level cannot be claimed.");
    }

    @Test
    @SuppressWarnings("unchecked")
    void keeperLevelRewardsGrantDecorations() {
        service.getSnapshot(user);        // seed the day's daily XP
        store.state.setKeeperXp(500);     // Keeper Level 4
        Map<String, Object> keeper = (Map<String, Object>) service.getSnapshot(user).get("keeper");
        List<Map<String, Object>> levels = (List<Map<String, Object>>) keeper.get("levels");
        Map<String, Object> reward3 = (Map<String, Object>) levels.get(2).get("reward"); // level 3
        assertEquals("carved_waypost", reward3.get("decorationId"));
        assertEquals("Carved Covenant Waypost", reward3.get("decorationName"));

        Map<String, Object> claimed = service.claimReward(user, "keeper_level:3", "deco-1", -1);
        Map<String, Object> reward = (Map<String, Object>) claimed.get("rewardClaimed");
        assertEquals("Carved Covenant Waypost", reward.get("decorationName"));
        assertTrue(store.state.getCraftedItemCounts().getOrDefault("carved_waypost", 0) >= 1,
                "Claiming a decoration level grants the decoration as an owned, placeable item.");
    }

    @Test
    void claimedKeeperDecorationIsRepairedAfterSplitPersistenceFailure() {
        service.getSnapshot(user);
        progression.getKeepRewardClaimIds().add("keeper_level:3");
        store.state.getCraftedItemCounts().remove("carved_waypost");

        service.getSnapshot(user);

        assertEquals(1, store.state.getCraftedItemCounts().get("carved_waypost"),
                "A durable claim marker must restore a decoration lost when the Keep document failed to save.");
    }

    @Test
    @SuppressWarnings("unchecked")
    void keeperLevelGatesKeepRankUpgradesButNotTheRestorationChain() {
        Map<String, Object> snapshot = service.getSnapshot(user); // Keeper Level 2
        List<Map<String, Object>> options = (List<Map<String, Object>>) snapshot.get("buildOptions");
        // The prerequisite-sequenced chain stays open (level 1).
        Map<String, Object> archive = options.stream()
                .filter(item -> "restore_archive".equals(item.get("id"))).findFirst().orElseThrow();
        assertEquals(1, ((Number) archive.get("requiredLevel")).intValue());
        assertEquals(Boolean.TRUE, archive.get("levelMet"));

        // The next keep rank is what leveling unlocks: hall rank N asks for Keeper Level N.
        store.state.setArchiveLevel(1);
        store.state.setTimber(500);
        List<Map<String, Object>> gated = (List<Map<String, Object>>) service.getSnapshot(user).get("buildOptions");
        Map<String, Object> hall2 = gated.stream()
                .filter(item -> "hall_level_2".equals(item.get("id"))).findFirst().orElseThrow();
        assertEquals(2, ((Number) hall2.get("requiredLevel")).intValue());
        assertEquals(Boolean.TRUE, hall2.get("levelMet")); // Keeper Level 2 reached
    }

    @Test
    void enclaveOffersElementLadderPlusAPersonalTaskAndReportsWhoIsAlreadyAssigned() {
        buildEnclave();
        service.inviteResident(user, "woodlot", "emberling", "station-1", store.state.getVersion());
        service.setEnclaveResident(user, 0, "mossling", "enclave-0", store.state.getVersion());
        Map<String, Object> snapshot = service.setEnclaveResident(user, 1, "aurorix", "enclave-1", store.state.getVersion());

        List<Map<String, Object>> mossTasks = enclaveTasks(snapshot, 0);
        List<Map<String, Object>> auroraTasks = enclaveTasks(snapshot, 1);
        assertEquals(3, mossTasks.size(), "A resident offers two element tasks plus one personal task.");
        // Mossling is EARTH, Aurorix is LIGHT: the element rungs must differ.
        assertEquals(List.of("TIMBER_COLLECTION", "CONSTRUCTION"),
                mossTasks.subList(0, 2).stream().map(task -> String.valueOf(task.get("event"))).toList());
        assertEquals(List.of("DECORATION", "CONVERSATION"),
                auroraTasks.subList(0, 2).stream().map(task -> String.valueOf(task.get("event"))).toList());
        assertEquals("BOND", mossTasks.get(2).get("source"));
        assertNotEquals(mossTasks.get(2).get("name"), auroraTasks.get(2).get("name"),
                "The personal task is bound to the card id, so two residents must not share one.");
        assertTrue(String.valueOf(mossTasks.get(0).get("description")).contains("Mossling"),
                "Task copy names the Siegeling it belongs to.");

        // The Enclave picker needs to know who is free and who would be a reassignment.
        Map<String, Object> ember = residentPayload(snapshot, "emberling");
        assertEquals(Boolean.TRUE, valueAt(ember, "assignment", "assigned"));
        assertEquals("Restorative Woodlot", valueAt(ember, "assignment", "label"));
        Map<String, Object> moss = residentPayload(snapshot, "mossling");
        assertEquals("ENCLAVE", valueAt(moss, "assignment", "type"));
        assertEquals("Enclave space 1", valueAt(moss, "assignment", "label"));
    }

    @Test
    void bankingATaskPaysRapportRepeatablyAndRapportWidensEveryBuff() {
        buildEnclave();
        service.setEnclaveResident(user, 0, "mossling", "enclave-0", store.state.getVersion());
        service.inviteResident(user, "woodlot", "mossling", "station-1", store.state.getVersion());
        service.setFavorite(user, "mossling", "fav-1", store.state.getVersion());
        // Woodlot base 1.0 x (1 + 15% affinity) x (1 + 5% Common favorite) at rapport 0.
        assertEquals(1.15 * 1.05, woodlotRate(service.getSnapshot(user)), 0.0001);

        String taskId = "enclave_task:mossling:" + firstTaskId("mossling");
        for (int index = 0; index < 3; index++) {
            store.state.setTimber(0);
            clock.advance(Duration.ofMinutes(2));
            service.collect(user, "woodlot", "rapport-collect-" + index, store.state.getVersion());
        }
        Map<String, Object> claimed = service.claimReward(user, taskId, "rapport-claim-1", store.state.getVersion());
        assertEquals(2, ((Number) valueAt(claimed, "rewardClaimed", "rapportGained")).intValue());
        assertEquals(0, enclaveTasks(claimed, 0).get(0).get("progress"),
                "A banked task resets so the resident can offer it again.");
        assertEquals(1, ((Number) enclaveTasks(claimed, 0).get(0).get("completions")).intValue());

        assertEquals(2, ((Number) valueAt(residentPayload(claimed, "mossling"), "rapport", "points")).intValue());
        assertEquals(3, ((Number) valueAt(residentPayload(claimed, "mossling"), "rapport", "pointsToNextLevel")).intValue());

        // At the first threshold (5 points) rapport 1 multiplies every buff by 1.10.
        store.state.getResidentRapport().put("mossling", 5);
        Map<String, Object> bonded = service.getSnapshot(user);
        assertEquals(1, ((Number) valueAt(residentPayload(bonded, "mossling"), "rapport", "level")).intValue());
        assertEquals(10, ((Number) valueAt(residentPayload(bonded, "mossling"), "rapport", "buffPercent")).intValue());
        assertEquals(6, intAt(bonded, "favorite", "bonusPercent"), "5% Common favorite x 1.10 rounds to 6%.");
        assertEquals(1.165 * 1.055, woodlotRate(bonded), 0.0001);

        // Rarity disparity is preserved and grows: at the same rapport the Legendary favorite
        // gains 2 points where the Common one gained 1, so the gap widens rather than flattening.
        store.state.getResidentRapport().put("aurorix", 5);
        Map<String, Object> legendary = service.setFavorite(user, "aurorix", "fav-2", store.state.getVersion());
        assertEquals(22, intAt(legendary, "favorite", "bonusPercent"), "20% Legendary favorite x 1.10.");

        // The task repeats rather than locking behind the one-shot claim set.
        assertThrows(IllegalArgumentException.class,
                () -> service.claimReward(user, taskId, "rapport-claim-2", store.state.getVersion()));
        for (int index = 0; index < 3; index++) {
            store.state.setTimber(0);
            clock.advance(Duration.ofMinutes(2));
            service.collect(user, "woodlot", "rapport-recollect-" + index, store.state.getVersion());
        }
        Map<String, Object> again = service.claimReward(user, taskId, "rapport-claim-3", store.state.getVersion());
        assertEquals(2, ((Number) valueAt(again, "rewardClaimed", "rapportGained")).intValue());
        assertEquals(7, ((Number) valueAt(residentPayload(again, "mossling"), "rapport", "points")).intValue());
    }

    @Test
    void dashboardTuningOverridesWorkshopOutputBuffPercentagesAndTaskLadders() {
        service.setTuningService(tuningReturning(new KeepTuning(
                List.of(new KeepTuning.Building("garden", 0.5, 200)),
                List.of(new KeepTuning.Project("build_enclave", 10, 60L)),
                new KeepTuning.Buffs(40, 5, 30, 20, 10,
                        Map.of("COMMON", 25), 50, List.of(0, 2)),
                List.of(new KeepTuning.Recipe("living_trellis", "Retuned Trellis", "Garden decor",
                        Map.of("verdant_fiber", 3))),
                new KeepTuning.Tasks(Map.of("EARTH", List.of(new KeepTuning.Task(
                        "earth_custom", "CRAFTING", 1, "Retuned Task", "{name} wants a retuned task.",
                        7, 11, 13))), Map.of()))));

        store.state = null;
        service.getSnapshot(user);
        store.state.getFacilityLevels().put("garden", 1);
        store.state.getFacilityLastAccruedAt().put("garden", clock.instant());
        service.inviteResident(user, "garden", "mossling", "tuned-station", store.state.getVersion());
        // Garden: 0.5 base x level 1 x (1 + 40% Earth affinity) = 0.70 per minute.
        Map<String, Object> tuned = service.getSnapshot(user);
        assertEquals(0.70, ((Number) station(tuned, "garden").get("ratePerMinute")).doubleValue(), 0.0001);
        assertEquals(200, ((Number) station(tuned, "garden").get("storageCapacity")).intValue());
        assertEquals(25, intAt(service.setFavorite(user, "mossling", "tuned-fav", store.state.getVersion()),
                "favorite", "bonusPercent"));

        Map<String, Object> trellis = recipe(service.getSnapshot(user), "living_trellis");
        assertEquals("Retuned Trellis", trellis.get("name"));
        assertEquals("Garden decor", trellis.get("bonus"));

        store.state.setArchiveLevel(1);
        store.state.setTimber(500);
        service.startBuild(user, "build_enclave", "tuned-build", store.state.getVersion());
        clock.advance(Duration.ofSeconds(61));
        service.getSnapshot(user);
        Map<String, Object> seated = service.setEnclaveResident(user, 0, "mossling", "tuned-enclave", store.state.getVersion());
        List<Map<String, Object>> tasks = enclaveTasks(seated, 0);
        assertEquals("Retuned Task", tasks.get(0).get("name"));
        assertEquals("Mossling wants a retuned task.", tasks.get(0).get("description"));
        assertEquals(7, ((Number) tasks.get(0).get("rapport")).intValue());
        assertEquals(2, tasks.size(), "An element override plus the personal bond task.");
    }

    @Test
    void akharsFrontUnlocksRampartPostsAndBanksPassiveSiegecoins() {
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setWoodlotLevel(2);
        store.state.setStorehouseLevel(1);
        store.state.setEnclaveLevel(1);
        store.state.setHallLevel(3);
        store.state.getFacilityLevels().put("quarry", 1);
        store.state.getFacilityLastAccruedAt().put("quarry", clock.instant());
        store.state.getMaterialInventory().put("stone", 20);
        store.state.setTimber(500);

        store.state.setKeeperXp(1_350); // Keeper Level 7: the destination project is visible but still locked.
        Map<String, Object> levelSeven = service.getSnapshot(user);
        Map<String, Object> lockedFront = buildOption(levelSeven, "build_akhars_front");
        assertEquals(8, ((Number) lockedFront.get("requiredLevel")).intValue());
        assertEquals(Boolean.FALSE, lockedFront.get("levelMet"));
        Map<String, Object> keeper = (Map<String, Object>) levelSeven.get("keeper");
        List<Map<String, Object>> levels = (List<Map<String, Object>>) keeper.get("levels");
        assertEquals("Grand Keep · Project: Raise Akhar's Front", levels.get(7).get("unlockLabel"));
        assertThrows(IllegalArgumentException.class,
                () -> service.startBuild(user, "build_akhars_front", "front-too-soon", store.state.getVersion()));

        store.state.setKeeperXp(1_750); // Keeper Level 8 unlocks Akhar's Front.

        service.startBuild(user, "build_akhars_front", "front-build", store.state.getVersion());
        clock.advance(Duration.ofSeconds(KeepService.AKHARS_FRONT_BUILD_SECONDS + 1));
        Map<String, Object> built = service.getSnapshot(user);
        assertEquals(Boolean.TRUE, valueAt(built, "akharsFront", "built"));
        assertEquals(1, intAt(built, "akharsFront", "capacity"), "A new rampart opens exactly one post.");
        assertEquals("Timber Palisade", valueAt(built, "akharsFront", "wallName"));
        assertEquals(120, intAt(built, "akharsFront", "storageCapacity"));
        assertThrows(IllegalArgumentException.class,
                () -> service.setAkharsFrontResident(user, 1, "mossling", "front-slot-two", store.state.getVersion()),
                "Post two only exists after the walls are upgraded.");

        service.inviteResident(user, "quarry", "mossling", "front-worker", store.state.getVersion());
        assertEquals("mossling", station(service.getSnapshot(user), "quarry").get("residentId"));

        Map<String, Object> posted = service.setAkharsFrontResident(
                user, 0, "mossling", "front-post", store.state.getVersion());
        assertEquals(1, intAt(posted, "akharsFront", "residentCount"));
        assertEquals(1.0, ((Number) valueAt(posted, "akharsFront", "passiveRatePerMinute")).doubleValue(), .0001);
        assertEquals(4.0, ((Number) valueAt(posted, "akharsFront", "combatRatePerMinute")).doubleValue(), .0001);
        assertEquals(5.0, ((Number) valueAt(posted, "akharsFront", "ratePerMinute")).doubleValue(), .0001);
        assertEquals(1, intAt(posted, "akharsFront", "coinsPerDefeat"));
        assertEquals("", station(posted, "quarry").get("residentId"),
                "Posting a Keep worker on the wall must vacate its building.");
        assertNull(station(posted, "quarry").get("resident"));
        assertEquals(1, intAt(posted, "siegelingSlots", "active"),
                "A reassignment is one occupied role, not two active slots.");
        Map<String, Object> assignment = (Map<String, Object>) residentPayload(posted, "mossling").get("assignment");
        assertEquals("FRONT", assignment.get("type"));
        assertEquals("Akhar's Front post 1", assignment.get("label"));

        clock.advance(Duration.ofMinutes(10));
        Map<String, Object> accrued = service.getSnapshot(user);
        assertEquals(50, intAt(accrued, "akharsFront", "available"));
        int goldBefore = progression.getGold();
        Map<String, Object> collected = service.collect(
                user, "akhars_front", "front-collect", store.state.getVersion());
        assertEquals(goldBefore + 50, progression.getGold());
        assertEquals(0, intAt(collected, "akharsFront", "available"));
        assertEquals("SIEGECOINS", valueAt(collected, "collected", "resource"));

        Map<String, Object> returned = service.inviteResident(
                user, "quarry", "mossling", "front-return-worker", store.state.getVersion());
        assertEquals(0, intAt(returned, "akharsFront", "residentCount"));
        assertEquals("mossling", station(returned, "quarry").get("residentId"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void rampartUpgradesOpenOnePostPerTierUpToFour() {
        service.getSnapshot(user);
        // A Keep far enough along to own the Front at all: the early build ladder is done.
        store.state.setArchiveLevel(1);
        store.state.setWoodlotLevel(2);
        store.state.setStorehouseLevel(1);
        store.state.setEnclaveLevel(1);
        store.state.getFacilityLevels().put("quarry", 1);
        store.state.getFacilityLastAccruedAt().put("quarry", clock.instant());
        store.state.setAkharsFrontLevel(1);
        store.state.setAkharsFrontLastAccruedAt(clock.instant());
        store.state.setBuildersYardLevel(1);
        store.state.setHallLevel(5);
        store.state.setTimber(5_000);
        store.state.getMaterialInventory().put("stone", 200);
        store.state.getMaterialInventory().put("ember_ingot", 100);
        store.state.getMaterialInventory().put("frost_crystal", 100);

        Map<String, Object> tierOne = service.getSnapshot(user);
        assertEquals(1, ((List<Map<String, Object>>) valueAt(tierOne, "akharsFront", "slots")).size());
        Map<String, Object> upgrade = (Map<String, Object>) valueAt(tierOne, "akharsFront", "upgrade");
        assertEquals("akhars_front_level_2", upgrade.get("id"));
        assertEquals("Stone Rampart", upgrade.get("wallName"));
        assertEquals(Boolean.TRUE, upgrade.get("gateMet"));

        for (int level = 2; level <= KeepService.AKHARS_FRONT_MAX_LEVEL; level++) {
            String projectId = "akhars_front_level_" + level;
            buildOption(service.getSnapshot(user), projectId); // offered before it is started
            service.startBuild(user, projectId, "rampart-" + level, store.state.getVersion());
            clock.advance(Duration.ofDays(2));
            Map<String, Object> raised = service.getSnapshot(user);
            assertEquals(level, intAt(raised, "akharsFront", "level"));
            assertEquals(level, intAt(raised, "akharsFront", "capacity"));
            assertEquals(level, ((List<Map<String, Object>>) valueAt(raised, "akharsFront", "slots")).size());
        }

        Map<String, Object> bastion = service.getSnapshot(user);
        assertEquals("Bastion Battlements", valueAt(bastion, "akharsFront", "wallName"));
        assertEquals(35, intAt(bastion, "akharsFront", "wallBonusPercent"));
        assertEquals(480, intAt(bastion, "akharsFront", "storageCapacity"));
        assertNull(valueAt(bastion, "akharsFront", "upgrade"), "The fourth tier is the last one.");
        assertThrows(NoSuchElementException.class, () -> buildOption(bastion, "akhars_front_level_5"));

        // A fully raised wall pays its defender the tier bonus on both income components.
        service.inviteResident(user, "woodlot", "mossling", "front-hire", store.state.getVersion());
        Map<String, Object> posted = service.setAkharsFrontResident(
                user, 3, "mossling", "front-post-four", store.state.getVersion());
        assertEquals(1, intAt(posted, "akharsFront", "residentCount"));
        assertEquals(1.35, ((Number) valueAt(posted, "akharsFront", "passiveRatePerMinute")).doubleValue(), .0001);
        assertEquals(5.4, ((Number) valueAt(posted, "akharsFront", "combatRatePerMinute")).doubleValue(), .0001);
        assertEquals("Akhar's Front post 4",
                ((Map<String, Object>) residentPayload(posted, "mossling").get("assignment")).get("label"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void rampartUpgradesStayGatedUntilTheKeepCanSupportThem() {
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setWoodlotLevel(2);
        store.state.setStorehouseLevel(1);
        store.state.setEnclaveLevel(1);
        store.state.getFacilityLevels().put("quarry", 1);
        store.state.getFacilityLastAccruedAt().put("quarry", clock.instant());
        store.state.setAkharsFrontLevel(1);
        store.state.setAkharsFrontLastAccruedAt(clock.instant());
        store.state.setTimber(5_000);
        store.state.getMaterialInventory().put("stone", 200);
        store.state.getMaterialInventory().put("ember_ingot", 100);

        Map<String, Object> noYard = service.getSnapshot(user);
        assertEquals(Boolean.FALSE, ((Map<String, Object>) valueAt(noYard, "akharsFront", "upgrade")).get("gateMet"));
        assertThrows(NoSuchElementException.class, () -> buildOption(noYard, "akhars_front_level_2"));
        assertThrows(IllegalArgumentException.class,
                () -> service.startBuild(user, "akhars_front_level_2", "rampart-early", store.state.getVersion()));

        store.state.setBuildersYardLevel(1);
        service.startBuild(user, "akhars_front_level_2", "rampart-two", store.state.getVersion());
        clock.advance(Duration.ofDays(2));
        assertEquals(2, intAt(service.getSnapshot(user), "akharsFront", "level"));

        // Tier three additionally needs a Stonehold keep, so it stays previewed but unbuildable.
        Map<String, Object> gated = service.getSnapshot(user);
        Map<String, Object> upgrade = (Map<String, Object>) valueAt(gated, "akharsFront", "upgrade");
        assertEquals("akhars_front_level_3", upgrade.get("id"));
        assertEquals(Boolean.FALSE, upgrade.get("gateMet"));
        assertEquals("Needs the Builder's Yard and a Stonehold keep.", upgrade.get("requirement"));
        assertThrows(IllegalArgumentException.class,
                () -> service.startBuild(user, "akhars_front_level_3", "rampart-three-early", store.state.getVersion()));
    }

    @Test
    @SuppressWarnings("unchecked")
    void legacyThreePostRampartsKeepTheirDefendersAtTheMatchingTier() {
        service.getSnapshot(user);
        // A pre-upgrade Keep document: level 1, but three fixed posts, the third occupied.
        store.state.setAkharsFrontLevel(1);
        store.state.setAkharsFrontLastAccruedAt(clock.instant());
        store.state.setAkharsFrontResidentIds(List.of("", "", "mossling"));

        Map<String, Object> migrated = service.getSnapshot(user);
        assertEquals(3, intAt(migrated, "akharsFront", "level"), "Three posts means the walls were tier three.");
        assertEquals(3, intAt(migrated, "akharsFront", "capacity"));
        List<Map<String, Object>> slots = (List<Map<String, Object>>) valueAt(migrated, "akharsFront", "slots");
        assertEquals("mossling", slots.get(2).get("residentId"), "The posted defender must survive the migration.");
        assertEquals(1, intAt(migrated, "akharsFront", "residentCount"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void raiderShadesComeFromRealSiegelingArtAndAreRandomised() {
        Map<String, Object> pool = (Map<String, Object>) service.getSnapshot(user).get("akharsFront");
        assertEquals(List.of(), pool.get("raiders"),
                "Cards without uploaded art cannot be shaded, so the pool stays empty.");

        // A catalog wide enough that a 12-card pool is a real sample rather than everything.
        List<Card> catalog = new ArrayList<>();
        for (int index = 0; index < 30; index++) {
            SieglingCard card = card("shade_" + index, "Siegeling " + index, Element.SHADOW);
            card.setCardArtUrl("/img/cards/shade_" + index + ".png");
            catalog.add(card);
        }
        SieglingCard artless = card("artless", "Artless", Element.EARTH);
        catalog.add(artless);
        KeepService shaded = new KeepService(new InMemoryKeepStore(),
                new PlayerProgressionService() {
                    @Override public PlayerProgressionEntity getOrCreate(AccountUser ignored) { return progression; }
                },
                new CardDefinitionService() {
                    @Override public List<Card> getDeckBuilderCatalog() { return catalog; }
                },
                loreCatalog(), eventCatalog());
        shaded.setClock(clock);
        shaded.setRandom(new Random(11));

        List<Map<String, Object>> raiders =
                (List<Map<String, Object>>) ((Map<String, Object>) shaded.getSnapshot(user).get("akharsFront")).get("raiders");
        assertEquals(12, raiders.size(), "The pool is capped so a huge catalog does not bloat the snapshot.");
        assertTrue(raiders.stream().noneMatch(raider -> "artless".equals(raider.get("id"))),
                "A card with no art cannot be recoloured into a raider.");
        for (Map<String, Object> raider : raiders) {
            assertTrue(String.valueOf(raider.get("artUrl")).startsWith("/img/cards/"),
                    "Raiders carry real card art, not a generated ghost.");
            assertTrue(String.valueOf(raider.get("name")).startsWith("Shade of "),
                    "A raider is named as the corrupted form of the Siegeling it is drawn from.");
            assertEquals("SHADOW", raider.get("element"));
        }
        assertEquals(raiders.size(), raiders.stream().map(raider -> raider.get("id")).distinct().count(),
                "One pool must never offer the same Siegeling twice.");

        // Two different seeds must not produce the same twelve, or "randomised" is a lie.
        shaded.setRandom(new Random(4));
        List<Map<String, Object>> reroll =
                (List<Map<String, Object>>) ((Map<String, Object>) shaded.getSnapshot(user).get("akharsFront")).get("raiders");
        assertNotEquals(raiders.stream().map(raider -> raider.get("id")).toList(),
                reroll.stream().map(raider -> raider.get("id")).toList());
    }

    @Test
    void akharsFrontCollectDoesNotCreditGoldWhenKeepSaveFails() {
        service.getSnapshot(user);
        store.state.setAkharsFrontLevel(1);
        store.state.setAkharsFrontLastAccruedAt(clock.instant());
        store.state.setAkharsFrontStoredGold(25);
        progression.setGold(100);

        java.util.concurrent.atomic.AtomicInteger progressionSaves = new java.util.concurrent.atomic.AtomicInteger();
        service.setProgressionStore(new PlayerProgressionStore() {
            @Override public PlayerProgressionEntity save(PlayerProgressionEntity entity) {
                progressionSaves.incrementAndGet();
                return entity;
            }
        });
        store.failNextSave = true;

        assertThrows(IllegalStateException.class,
                () -> service.collect(user, "akhars_front", "front-collect-fail", store.state.getVersion()));
        assertEquals(100, progression.getGold(), "Gold must not mint before the Keep bank is persisted.");
        assertEquals(0, progressionSaves.get(), "Progression must not save when Keep persistence fails.");

        // Simulate Cloud Run reload: Keep document still has the uncleared bank.
        store.state.setAkharsFrontStoredGold(25);
        store.failNextSave = false;

        Map<String, Object> collected = service.collect(
                user, "akhars_front", "front-collect-retry", store.state.getVersion());
        assertEquals(125, progression.getGold());
        assertEquals(1, progressionSaves.get());
        assertEquals(0, intAt(collected, "akharsFront", "available"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void instantPurchaseDoesNotChargeGoldWhenKeepSaveFails() {
        progression.setGold(5_000);
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setWoodlotLevel(2);
        store.state.setStorehouseLevel(1);
        store.state.setTimber(2_000);

        Map<String, Object> optionsSnapshot = service.getSnapshot(user);
        Map<String, Object> forgeOption = ((List<Map<String, Object>>) optionsSnapshot.get("buildOptions")).stream()
                .filter(item -> "build_forge".equals(item.get("id"))).findFirst().orElseThrow();
        int instantCost = ((Number) forgeOption.get("instantCoinCost")).intValue();

        java.util.concurrent.atomic.AtomicInteger progressionSaves = new java.util.concurrent.atomic.AtomicInteger();
        service.setProgressionStore(new PlayerProgressionStore() {
            @Override public PlayerProgressionEntity save(PlayerProgressionEntity entity) {
                progressionSaves.incrementAndGet();
                return entity;
            }
        });
        store.failNextSave = true;

        assertThrows(IllegalStateException.class,
                () -> service.purchaseBuild(user, "build_forge", "buy-forge-fail", store.state.getVersion()));
        assertEquals(5_000, progression.getGold(), "Siegecoins must not charge before Keep persists the building.");
        assertEquals(0, progressionSaves.get());

        // Simulate Firestore reload of the pre-purchase Keep document.
        store.state.getFacilityLevels().remove("forge");
        store.state.getFacilityLastAccruedAt().remove("forge");
        store.state.getFacilityStored().remove("forge");
        store.failNextSave = false;

        Map<String, Object> purchased = service.purchaseBuild(user, "build_forge", "buy-forge-retry", store.state.getVersion());
        assertEquals(1, ((Number) station(purchased, "forge").get("level")).intValue());
        assertEquals(5_000 - instantCost, progression.getGold());
        assertEquals(1, progressionSaves.get());
    }

    private void buildEnclave() {
        service.getSnapshot(user);
        store.state.setArchiveLevel(1);
        store.state.setTimber(500);
        service.startBuild(user, "build_enclave", "enclave-build", store.state.getVersion());
        clock.advance(Duration.ofSeconds(KeepService.ENCLAVE_BUILD_SECONDS + 1));
        service.getSnapshot(user);
    }

    private String firstTaskId(String residentId) {
        Map<String, Object> task = enclaveTasks(service.getSnapshot(user), 0).get(0);
        return String.valueOf(task.get("taskId"));
    }

    private static double woodlotRate(Map<String, Object> snapshot) {
        return ((Number) valueAt(snapshot, "station", "ratePerMinute")).doubleValue();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> enclaveTasks(Map<String, Object> snapshot, int slot) {
        Map<String, Object> enclave = (Map<String, Object>) snapshot.get("enclave");
        Map<String, Object> entry = (Map<String, Object>) ((List<?>) enclave.get("slots")).get(slot);
        return (List<Map<String, Object>>) entry.get("tasks");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> residentPayload(Map<String, Object> snapshot, String residentId) {
        return ((List<Map<String, Object>>) snapshot.get("residents")).stream()
                .filter(item -> residentId.equals(item.get("id"))).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> recipe(Map<String, Object> snapshot, String id) {
        return ((List<Map<String, Object>>) snapshot.get("recipes")).stream()
                .filter(item -> id.equals(item.get("id"))).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> buildOption(Map<String, Object> snapshot, String id) {
        return ((List<Map<String, Object>>) snapshot.get("buildOptions")).stream()
                .filter(item -> id.equals(item.get("id"))).findFirst().orElseThrow();
    }

    /** A tuning source that always returns one fixed document, standing in for Firestore. */
    private static KeepTuningService tuningReturning(KeepTuning tuning) {
        return new KeepTuningService(new ObjectMapper(), null, "appConfig", "keepTuning") {
            @Override public KeepTuning current() { return tuning; }
        };
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

    @SuppressWarnings("unchecked")
    private static List<String> conversationIds(Map<String, Object> snapshot) {
        return ((List<Map<String, Object>>) snapshot.get("availableConversations")).stream()
                .map(item -> String.valueOf(item.get("id"))).toList();
    }

    private static KeepLoreCatalog loreCatalog() {
        KeepLoreCatalog lore = new KeepLoreCatalog(new ObjectMapper());
        lore.load();
        return lore;
    }

    private static KeepEventCatalog eventCatalog() {
        KeepEventCatalog events = new KeepEventCatalog(new ObjectMapper());
        events.load();
        return events;
    }

    private static SieglingCard card(String id, String name, Element element) {
        return card(id, name, element, Rarity.COMMON);
    }

    private static SieglingCard card(String id, String name, Element element, Rarity rarity) {
        return new SieglingCard(id, name, element, rarity, 8, 3, List.of(), Row.BACK);
    }

    private static class InMemoryKeepStore extends KeepStore {
        private KeepState state;
        private boolean failNextSave;
        @Override public Optional<KeepState> findByUserId(String userId) { return Optional.ofNullable(state); }
        @Override public KeepState save(KeepState value) {
            if (failNextSave) {
                failNextSave = false;
                throw new IllegalStateException("Keep persistence failed.");
            }
            state = value;
            return value;
        }
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
