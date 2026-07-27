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
import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
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
        service = new KeepService(store, progressionService, cards, lore);
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

    private static SieglingCard card(String id, String name, Element element) {
        return card(id, name, element, Rarity.COMMON);
    }

    private static SieglingCard card(String id, String name, Element element, Rarity rarity) {
        return new SieglingCard(id, name, element, rarity, 8, 3, List.of(), Row.BACK);
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
