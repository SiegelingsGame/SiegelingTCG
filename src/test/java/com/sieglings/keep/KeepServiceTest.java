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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
        assertEquals(3, ((List<?>) snapshot.get("residents")).size());
        assertEquals(1, ((List<?>) snapshot.get("lore")).size());
        assertTrue(conversationIds(snapshot).contains("steward_first_promise"));
        assertTrue(conversationIds(snapshot).stream().anyMatch(id -> id.startsWith("visitor_")),
                "A lore-tied road visitor should appear on the first sanctuary visit.");
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
        assertEquals("VISITOR", dialogue.get("kind"));
        assertEquals(10, ((Number) dialogue.get("timberSpent")).intValue());
        assertTrue(String.valueOf(dialogue.get("outcomeId")).length() > 0);
        assertTrue(loreIds(result).contains("chronicle_shared_mornings")
                || intAt(result, "resources", "timber") < 100
                || materialAmount(result, "ember_ingot") > 0
                || materialAmount(result, "verdant_fiber") > 0);
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
        assertEquals(15, ((Number) station(returned, "garden").get("available")).intValue());×Ş:¶‰ËkºwµçU¹±…Ù•	Õ¥±‘Í=ÕÑÍ¥‘•EÕ…ÉÑ•É!½ÍÑÍ¥Ù•I•Í¥‘•¹ÑÍ¹‘%ÍÍÕ•Í5¥ÍÍ¥½¹Ì ¤ì(€€€€€€€Í•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•ÑÉ¡¥Ù•1•Ù•° Ä¤ì(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•ÑQ¥µ‰•È ÔÀÀ¤ì(€€€€€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤(€€€€€€€1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø½ÁÑ¥½¹Ì€ô€¡1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø¤Í•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤¹•Ğ ‰‰Õ¥±‘=ÁÑ¥½¹Ìˆ¤ì(€€€€€€€…ÍÍ•ÉÑQÉÕ”¡½ÁÑ¥½¹Ì¹ÍÑÉ•…´ ¤¹…¹å5…Ñ ¡¥Ñ•´€´ø€‰‰Õ¥±‘}•¹±…Ù”ˆ¹•ÅÕ…±Ì¡¥Ñ•´¹•Ğ ‰¥ˆ¤¤¤¤ì((€€€€€€€Í•ÉÙ¥”¹ÍÑ…ÉÑ	Õ¥±¡ÕÍ•È°€‰‰Õ¥±‘}•¹±…Ù”ˆ°€‰•¹±…Ù”µ‰Õ¥±ˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì(€€€€€€€±½¬¹…‘Ù…¹”¡ÕÉ…Ñ¥½¸¹½™M•½¹‘Ì¡-••ÁM•ÉÙ¥”¹91Y}	U%1}M=9L€¬€Ä¤¤ì(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø‰Õ¥±Ğ€ôÍ•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì¡	½½±•…¸¹QIU°Ù…±Õ•Ğ¡‰Õ¥±Ğ°€‰•¹±…Ù”ˆ°€‰‰Õ¥±Ğˆ¤¤ì(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì Ô°¥¹ÑĞ¡‰Õ¥±Ğ°€‰•¹±…Ù”ˆ°€‰…Á…¥Ñäˆ¤¤ì((€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•ÑQ¥µ‰•È À¤ì(€€€€€€€Í•ÉÙ¥”¹Í•Ñ¹±…Ù•I•Í¥‘•¹Ğ¡ÕÍ•È°€À°€‰µ½ÍÍ±¥¹œˆ°€‰•¹±…Ù”µÉ•Í¥‘•¹Ğˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì(€€€€€€€™½È€¡¥¹Ğ¥¹‘•à€ô€Àì¥¹‘•à€ğ€Ìì¥¹‘•à¬¬¤ì(€€€€€€€€€€€±½¬¹…‘Ù…¹”¡ÕÉ…Ñ¥½¸¹½™5¥¹ÕÑ•Ì È¤¤ì(€€€€€€€€€€€Í•ÉÙ¥”¹½±±•Ğ¡ÕÍ•È°€‰İ½½‘±½Ğˆ°€‰•¹±…Ù”µ½±±•Ğ´ˆ€¬¥¹‘•à°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì(€€€€€€€ô(€€€€€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø•¹±…Ù”€ô€¡5…ÀñMÑÉ¥¹œ°=‰©•Ğø¤Í•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤¹•Ğ ‰•¹±…Ù”ˆ¤ì(€€€€€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍ±½Ğ€ô€¡5…ÀñMÑÉ¥¹œ°=‰©•Ğø¤€ ¡1¥ÍĞğüø¤•¹±…Ù”¹•Ğ ‰Í±½ÑÌˆ¤¤¹•Ğ À¤ì(€€€€€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğøµ¥ÍÍ¥½¸€ô€¡5…ÀñMÑÉ¥¹œ°=‰©•Ğø¤Í±½Ğ¹•Ğ ‰µ¥ÍÍ¥½¸ˆ¤ì(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì¡	½½±•…¸¹QIU°µ¥ÍÍ¥½¸¹•Ğ ‰½µÁ±•Ñ”ˆ¤¤ì(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì Ì°€ ¡9Õµ‰•È¤µ¥ÍÍ¥½¸¹•Ğ ‰ÁÉ½É•ÍÌˆ¤¤¹¥¹ÑY…±Õ” ¤¤ì((€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø±…¥µ•€ôÍ•ÉÙ¥”¹±…¥µI•İ…É¡ÕÍ•È°MÑÉ¥¹œ¹Ù…±Õ•=˜¡µ¥ÍÍ¥½¸¹•Ğ ‰¥ˆ¤¤°(€€€€€€€€€€€€€€€€‰•¹±…Ù”µÉ•İ…Éˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì äÀ°€ ¡9Õµ‰•È¤Ù…±Õ•Ğ¡±…¥µ•°€‰É•İ…É‘±…¥µ•ˆ°€‰½±ˆ¤¤¹¥¹ÑY…±Õ” ¤¤ì(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ÈÀ°€ ¡9Õµ‰•È¤Ù…±Õ•Ğ¡±…¥µ•°€‰É•İ…É‘±…¥µ•ˆ°€‰É•µ¹…¹ÑÌˆ¤¤¹¥¹ÑY…±Õ” ¤¤ì(€€€ô(4(€€€Q•ÍĞ4(€€€Ù½¥¡…±±UÁÉ…‘•ÍI…¥Í•-••ÁI…¹­áÁ…¹‘…Á…¥Ñå¹‘U¹±½­M•¹•Éä ¤ì4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍÑ…ÉĞ€ôÍ•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì Ä°¥¹ÑĞ¡ÍÑ…ÉĞ°€‰­••ÁI…¹¬ˆ°€‰±•Ù•°ˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ‰IÕ¥¹•…µÀˆ°Ù…±Õ•Ğ¡ÍÑ…ÉĞ°€‰­••ÁI…¹¬ˆ°€‰¹…µ”ˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑQ¡É½İÌ¡%±±•…±ÉÕµ•¹Ñá•ÁÑ¥½¸¹±…ÍÌ°4(€€€€€€€€€€€€€€€€ ¤€´øÍ•ÉÙ¥”¹ÍÑ…ÉÑ	Õ¥±¡ÕÍ•È°€‰¡…±±}±•Ù•±|Èˆ°€‰¡…±°µ™…¥°ˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤°4(€€€€€€€€€€€€€€€€‰Q¡”Q¥µ‰•È=ÕÑÁ½ÍĞ…Ñ”É•ÅÕ¥É•ÌÑ¡”É•ÍÑ½É•…É¡¥Ù”¸ˆ¤ì4(4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•ÑÉ¡¥Ù•1•Ù•° Ä¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•ÑQ¥µ‰•È ÔÀÀ¤ì4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø…Ñ•€ôÍ•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€€€€€1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø½ÁÑ¥½¹Ì€ô€¡1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø¤…Ñ•¹•Ğ ‰‰Õ¥±‘=ÁÑ¥½¹Ìˆ¤ì4(€€€€€€€…ÍÍ•ÉÑQÉÕ”¡½ÁÑ¥½¹Ì¹ÍÑÉ•…´ ¤¹…¹å5…Ñ ¡¥Ñ•´€´ø€‰¡…±±}±•Ù•±|Èˆ¹•ÅÕ…±Ì¡¥Ñ•´¹•Ğ ‰¥ˆ¤¤¤°4(€€€€€€€€€€€€€€€€‰Q¡”¹•áĞ¡…±°É…¹¬…ÁÁ•…ÉÌ…±½¹Í¥‘”Ñ¡”É•ÍÑ½É…Ñ¥½¸¡…¥¸½¹”…Ñ•É•ÅÕ¥É•µ•¹ÑÌ…É”µ•Ğ¸ˆ¤ì4(4(€€€€€€€Í•ÉÙ¥”¹ÍÑ…ÉÑ	Õ¥±¡ÕÍ•È°€‰¡…±±}±•Ù•±|Èˆ°€‰¡…±°´Äˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€±½¬¹…‘Ù…¹”¡ÕÉ…Ñ¥½¸¹½™M•½¹‘Ì äÀÄ¤¤ì4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•ĞøÕÁÉ…‘•€ôÍ•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì È°¥¹ÑĞ¡ÕÁÉ…‘•°€‰­••ÁI…¹¬ˆ°€‰±•Ù•°ˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ‰Q¥µ‰•È=ÕÑÁ½ÍĞˆ°Ù…±Õ•Ğ¡ÕÁÉ…‘•°€‰­••ÁI…¹¬ˆ°€‰¹…µ”ˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì È°¥¹ÑĞ¡ÕÁÉ…‘•°€‰Ù¥ÍÕ…±MÑ…Ñ”ˆ°€‰¡…±±1•Ù•°ˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì¡-••ÁM•ÉÙ¥”¹Q%5	I}%9Y9Q=Ie}A%Qd€¬€ÔÀ°¥¹ÑĞ¡ÕÁÉ…‘•°€‰É•Í½ÕÉ•Ìˆ°€‰Ñ¥µ‰•É…Á…¥Ñäˆ¤°4(€€€€€€€€€€€€€€€€‰… ¡…±°±•Ù•°…‘‘ÌÑ¥µ‰•È…Á…¥Ñä¸ˆ¤ì4(4(€€€€€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€€€€€1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø‰Õ¥±‘¥¹Ì€ô€¡1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø¤ÕÁÉ…‘•¹•Ğ ‰‰Õ¥±‘¥¹Ìˆ¤ì4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğøİ…±±Ì€ô‰Õ¥±‘¥¹Ì¹ÍÑÉ•…´ ¤¹™¥±Ñ•È¡¥Ñ•´€´ø€‰İ…±±Ìˆ¹•ÅÕ…±Ì¡¥Ñ•´¹•Ğ ‰¥ˆ¤¤¤¹™¥¹‘¥ÉÍĞ ¤¹½É±Í•Q¡É½Ü ¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ‰=U9Q%=9Lˆ°İ…±±Ì¹•Ğ ‰ÍÑ…ÑÕÌˆ¤¤ì4(4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•Ñ!…±±1•Ù•° Ô¤ì4(€€€€€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€€€€€1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøøİ…±±•€ô€¡1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø¤Í•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤¹•Ğ ‰‰Õ¥±‘¥¹Ìˆ¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ‰=5A1Qˆ°İ…±±•¹ÍÑÉ•…´ ¤¹™¥±Ñ•È¡¥Ñ•´€´ø€‰İ…±±Ìˆ¹•ÅÕ…±Ì¡¥Ñ•´¹•Ğ ‰¥ˆ¤¤¤4(€€€€€€€€€€€€€€€€¹™¥¹‘¥ÉÍĞ ¤¹½É±Í•Q¡É½Ü ¤¹•Ğ ‰ÍÑ…ÑÕÌˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ‰]…±±•-••Àˆ°Ù…±Õ•Ğ¡Í•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤°€‰­••ÁI…¹¬ˆ°€‰¹…µ”ˆ¤¤ì4(€€€ô4(4(€€€Q•ÍĞ4(€€€Ù½¥¡…±±Q¡•µ•ÍÉ•A•ÉÍ¥ÍÑ•‘Y…±¥‘…Ñ•‘¹‘M•É¥…±¥é• ¤ì4(€€€€€€€Í•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€…ÍÍ•ÉÑQ¡É½İÌ¡%±±•…±ÉÕµ•¹Ñá•ÁÑ¥½¸¹±…ÍÌ°4(€€€€€€€€€€€€€€€€ ¤€´øÍ•ÉÙ¥”¹Í•Ñ!…±±Q¡•µ”¡ÕÍ•È°€‰Á±…¥ˆ°€‰Ñ¡•µ”µ™…¥°ˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤¤ì4(4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø•µ‰•È€ôÍ•ÉÙ¥”¹Í•Ñ!…±±Q¡•µ”¡ÕÍ•È°€‰•µ‰•Èˆ°€‰Ñ¡•µ”´Äˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ‰•µ‰•Èˆ°Ù…±Õ•Ğ¡•µ‰•È°€‰Ù¥ÍÕ…±MÑ…Ñ”ˆ°€‰¡…±±Q¡•µ”ˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ‰µ‰•È½Éˆ°Ù…±Õ•Ğ¡•µ‰•È°€‰¡…±±Q¡•µ”ˆ°€‰¹…µ”ˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ‰•µ‰•Èˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ!…±±Q¡•µ•% ¤¤ì4(4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•ĞøÉ•Í•Ğ€ôÍ•ÉÙ¥”¹Í•Ñ!…±±Q¡•µ”¡ÕÍ•È°€ˆˆ°€‰Ñ¡•µ”´Èˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ‰½Ù•¹…¹Ğˆ°Ù…±Õ•Ğ¡É•Í•Ğ°€‰Ù¥ÍÕ…±MÑ…Ñ”ˆ°€‰¡…±±Q¡•µ”ˆ¤¤ì4(€€€€€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€€€€€1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•ĞøøÑ¡•µ•Ì€ô€¡1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø¤É•Í•Ğ¹•Ğ ‰¡…±±Q¡•µ•Ìˆ¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì à°Ñ¡•µ•Ì¹Í¥é” ¤¤ì4(€€€€€€€…ÍÍ•ÉÑQÉÕ”¡Ñ¡•µ•Ì¹ÍÑÉ•…´ ¤¹…¹å5…Ñ ¡¥Ñ•´€´ø€‰½Ù•¹…¹Ğˆ¹•ÅÕ…±Ì¡¥Ñ•´¹•Ğ ‰¥ˆ¤¤4(€€€€€€€€€€€€€€€€˜˜	½½±•…¸¹QIU¹•ÅÕ…±Ì¡¥Ñ•´¹•Ğ ‰…Ñ¥Ù”ˆ¤¤¤¤ì4(€€€ô4(4(€€€Q•ÍĞ4(€€€Ù½¥™…Ù½É¥Ñ•M¥•±¥¹É…¹ÑÍI…É¥ÑåM…±•‘-••Á]¥‘•	½½ÍĞ ¤ì4(€€€€€€€Í•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€…ÍÍ•ÉÑQ¡É½İÌ¡%±±•…±ÉÕµ•¹Ñá•ÁÑ¥½¸¹±…ÍÌ°4(€€€€€€€€€€€€€€€€ ¤€´øÍ•ÉÙ¥”¹Í•Ñ…Ù½É¥Ñ”¡ÕÍ•È°€‰Õ¹­¹½İ¹}…Éˆ°€‰™…Øµ™…¥°ˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤¤ì4(4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø½µµ½¸€ôÍ•ÉÙ¥”¹Í•Ñ…Ù½É¥Ñ”¡ÕÍ•È°€‰µ½ÍÍ±¥¹œˆ°€‰™…Ø´Äˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì Ä¸ÀÔ°€ ¡9Õµ‰•È¤Ù…±Õ•Ğ¡½µµ½¸°€‰ÍÑ…Ñ¥½¸ˆ°€‰É…Ñ•A•É5¥¹ÕÑ”ˆ¤¤¹‘½Õ‰±•Y…±Õ” ¤°€À¸ÀÀÀÄ¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì Ô°¥¹ÑĞ¡½µµ½¸°€‰™…Ù½É¥Ñ”ˆ°€‰‰½¹ÕÍA•É•¹Ğˆ¤¤ì4(4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø±••¹‘…Éä€ôÍ•ÉÙ¥”¹Í•Ñ…Ù½É¥Ñ”¡ÕÍ•È°€‰…ÕÉ½É¥àˆ°€‰™…Ø´Èˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì Ä¸ÈÀ°€ ¡9Õµ‰•È¤Ù…±Õ•Ğ¡±••¹‘…Éä°€‰ÍÑ…Ñ¥½¸ˆ°€‰É…Ñ•A•É5¥¹ÕÑ”ˆ¤¤¹‘½Õ‰±•Y…±Õ” ¤°€À¸ÀÀÀÄ¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ÈÀ°¥¹ÑĞ¡±••¹‘…Éä°€‰™…Ù½É¥Ñ”ˆ°€‰‰½¹ÕÍA•É•¹Ğˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ‰…ÕÉ½É¥àˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…Ù½É¥Ñ•I•Í¥‘•¹Ñ% ¤¤ì4(4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…¥±¥Ñå1•Ù•±Ì ¤¹ÁÕĞ ‰…É‘•¸ˆ°€Ä¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…¥±¥Ñå1…ÍÑÉÕ•‘Ğ ¤¹ÁÕĞ ‰…É‘•¸ˆ°±½¬¹¥¹ÍÑ…¹Ğ ¤¤ì4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğøİ¥Ñ¡…É‘•¸€ôÍ•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì À¸ÌÀ°€ ¡9Õµ‰•È¤ÍÑ…Ñ¥½¸¡İ¥Ñ¡…É‘•¸°€‰…É‘•¸ˆ¤¹•Ğ ‰É…Ñ•A•É5¥¹ÕÑ”ˆ¤¤¹‘½Õ‰±•Y…±Õ” ¤°€À¸ÀÀÀÄ°4(€€€€€€€€€€€€€€€€‰Q¡”™…Ù½É¥Ñ”‰½½ÍĞ…ÁÁ±¥•ÌÑ¼•Ù•Éä™…¥±¥Ñä°¹½Ğ©ÕÍĞÑ¡”İ½½‘±½Ğ¸ˆ¤ì4(4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø±•…É•€ôÍ•ÉÙ¥”¹Í•Ñ…Ù½É¥Ñ”¡ÕÍ•È°€ˆˆ°€‰™…Ø´Ìˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì À°¥¹ÑĞ¡±•…É•°€‰™…Ù½É¥Ñ”ˆ°€‰‰½¹ÕÍA•É•¹Ğˆ¤¤ì4(€€€ô4(4(€€€Q•ÍĞ4(€€€Ù½¥‰Õ¥±‘•ÉÍe…É‘U¹±½­ÍM•½¹‘É•İ¹‘‘Ù…¹•‘I•¥Á•Ì ¤ì4(€€€€€€€Í•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•ÑÉ¡¥Ù•1•Ù•° Ä¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•Ñ]½½‘±½Ñ1•Ù•° È¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•ÑMÑ½É•¡½ÕÍ•1•Ù•° Ä¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…¥±¥Ñå1•Ù•±Ì ¤¹ÁÕĞ ‰…É‘•¸ˆ°€Ä¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…¥±¥Ñå1…ÍÑÉÕ•‘Ğ ¤¹ÁÕĞ ‰…É‘•¸ˆ°±½¬¹¥¹ÍÑ…¹Ğ ¤¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•ÑQ¥µ‰•È É|ÀÀÀ¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ5…Ñ•É¥…±%¹Ù•¹Ñ½Éä ¤¹ÁÕĞ ‰Ù•É‘…¹Ñ}™¥‰•Èˆ°€ĞÀ¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ5…Ñ•É¥…±%¹Ù•¹Ñ½Éä ¤¹ÁÕĞ ‰•µ‰•É}¥¹½Ğˆ°€ĞÀ¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ5…Ñ•É¥…±%¹Ù•¹Ñ½Éä ¤¹ÁÕĞ ‰™É½ÍÑ}ÉåÍÑ…°ˆ°€ĞÀ¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ5…Ñ•É¥…±%¹Ù•¹Ñ½Éä ¤¹ÁÕĞ ‰ÍÑ½¹”ˆ°€ĞÀ¤ì4(4(€€€€€€€…ÍÍ•ÉÑQ¡É½İÌ¡%±±•…±ÉÕµ•¹Ñá•ÁÑ¥½¸¹±…ÍÌ°4(€€€€€€€€€€€€€€€€ ¤€´øÍ•ÉÙ¥”¹ÍÑ…ÉÑ	Õ¥±¡ÕÍ•È°€‰…É‘•¹}±•Ù•±|Èˆ°€‰…‘Øµ™…¥°ˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤°4(€€€€€€€€€€€€€€€€‰1•Ù•°´È•áÁ…¹Í¥½¹ÌÉ•ÅÕ¥É”Ñ¡”	Õ¥±‘•ÈÌe…É¸ˆ¤ì4(4(€€€€€€€Í•ÉÙ¥”¹ÍÑ…ÉÑ	Õ¥±¡ÕÍ•È°€‰‰Õ¥±‘}™½É”ˆ°€‰‰Õ¥±´Äˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€…ÍÍ•ÉÑQ¡É½İÌ¡%±±•…±ÉÕµ•¹Ñá•ÁÑ¥½¸¹±…ÍÌ°4(€€€€€€€€€€€€€€€€ ¤€´øÍ•ÉÙ¥”¹ÍÑ…ÉÑ	Õ¥±¡ÕÍ•È°€‰‰Õ¥±‘}™É¥‘”ˆ°€‰‰Õ¥±´Èˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤°4(€€€€€€€€€€€€€€€€‰]¥Ñ¡½ÕĞÑ¡”å…É½¹±ä½¹”É•Üİ½É­Ì…Ğ„Ñ¥µ”¸ˆ¤ì4(4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•Ñ	Õ¥±‘•ÉÍe…É‘1•Ù•° Ä¤ì4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍ•½¹€ôÍ•ÉÙ¥”¹ÍÑ…ÉÑ	Õ¥±¡ÕÍ•È°€‰‰Õ¥±‘}™É¥‘”ˆ°€‰‰Õ¥±´Ìˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì È°€ ¡1¥ÍĞğüø¤Í•½¹¹•Ğ ‰…Ñ¥Ù•½¹ÍÑÉÕÑ¥½¹Ìˆ¤¤¹Í¥é” ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì È°€ ¡9Õµ‰•È¤Í•½¹¹•Ğ ‰½¹ÍÑÉÕÑ¥½¹M±½ÑÌˆ¤¤¹¥¹ÑY…±Õ” ¤¤ì4(4(€€€€€€€±½¬¹…‘Ù…¹”¡ÕÉ…Ñ¥½¸¹½™M•½¹‘Ì¡-••ÁM•ÉÙ¥”¹I%}1Y1}=9}M=9L€¬€Ä¤¤ì4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø½µÁ±•Ñ•€ôÍ•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì Ä°€ ¡9Õµ‰•È¤ÍÑ…Ñ¥½¸¡½µÁ±•Ñ•°€‰™½É”ˆ¤¹•Ğ ‰±•Ù•°ˆ¤¤¹¥¹ÑY…±Õ” ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì Ä°€ ¡9Õµ‰•È¤ÍÑ…Ñ¥½¸¡½µÁ±•Ñ•°€‰™É¥‘”ˆ¤¹•Ğ ‰±•Ù•°ˆ¤¤¹¥¹ÑY…±Õ” ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì È°ÁÉ½É•ÍÍ¥½¸¹•Ñ-••ÁAÉ½©•ÑÍ½µÁ±•Ñ• ¤¤ì4(4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø…‘Ù…¹•€ôÍ•ÉÙ¥”¹ÍÑ…ÉÑ	Õ¥±¡ÕÍ•È°€‰…É‘•¹}±•Ù•±|Èˆ°€‰…‘Øµ½¬ˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€…ÍÍ•ÉÑ9½Ñ9Õ±°¡…‘Ù…¹•¹•Ğ ‰…Ñ¥Ù•½¹ÍÑÉÕÑ¥½¸ˆ¤¤ì4(€€€ô4(4(€€€Q•ÍĞ4(€€€Ù½¥ÅÕ…ÉÉå¹‘-¥Ñ¡•¹AÉ½‘Õ•MÑ½¹•¹‘AÉ½Ù¥Í¥½¹Ì ¤ì4(€€€€€€€Í•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹Í•ÑMÑ½É•¡½ÕÍ•1•Ù•° Ä¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…¥±¥Ñå1•Ù•±Ì ¤¹ÁÕĞ ‰ÅÕ…ÉÉäˆ°€Ä¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…¥±¥Ñå1•Ù•±Ì ¤¹ÁÕĞ ‰­¥Ñ¡•¸ˆ°€Ä¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…¥±¥Ñå1…ÍÑÉÕ•‘Ğ ¤¹ÁÕĞ ‰ÅÕ…ÉÉäˆ°±½¬¹¥¹ÍÑ…¹Ğ ¤¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…¥±¥Ñå1…ÍÑÉÕ•‘Ğ ¤¹ÁÕĞ ‰­¥Ñ¡•¸ˆ°±½¬¹¥¹ÍÑ…¹Ğ ¤¤ì4(€€€€€€€±½¬¹…‘Ù…¹”¡ÕÉ…Ñ¥½¸¹½™5¥¹ÕÑ•Ì ÄÀÀ¤¤ì4(4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍ¹…ÁÍ¡½Ğ€ôÍ•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ÈÈ°€ ¡9Õµ‰•È¤ÍÑ…Ñ¥½¸¡Í¹…ÁÍ¡½Ğ°€‰ÅÕ…ÉÉäˆ¤¹•Ğ ‰…Ù…¥±…‰±”ˆ¤¤¹¥¹ÑY…±Õ” ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ÌÀ°€ ¡9Õµ‰•È¤ÍÑ…Ñ¥½¸¡Í¹…ÁÍ¡½Ğ°€‰­¥Ñ¡•¸ˆ¤¹•Ğ ‰…Ù…¥±…‰±”ˆ¤¤¹¥¹ÑY…±Õ” ¤¤ì4(4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø½±±•Ñ•€ôÍ•ÉÙ¥”¹½±±•Ğ¡ÕÍ•È°€‰ÅÕ…ÉÉäˆ°€‰½±±•ĞµÍÑ½¹”ˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì ÈÈ°µ…Ñ•É¥…±µ½Õ¹Ğ¡½±±•Ñ•°€‰ÍÑ½¹”ˆ¤¤ì4(€€€ô4(4(€€€Q•ÍĞ4(€€€Ù½¥İ••­±å=É‘•ÉMÁ•¹‘Í5…Ñ•É¥…±Í=¹•A•É]••­½É	½½ÍÑ•‘%¹½µ” ¤ì4(€€€€€€€Í•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€…ÍÍ•ÉÑQ¡É½İÌ¡%±±•…±ÉÕµ•¹Ñá•ÁÑ¥½¸¹±…ÍÌ°4(€€€€€€€€€€€€€€€€ ¤€´øÍ•ÉÙ¥”¹±…¥µI•İ…É¡ÕÍ•È°€‰İ••­±å}½É‘•Èˆ°€‰½É‘•Èµ±½­•ˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤°4(€€€€€€€€€€€€€€€€‰]••­±ä½É‘•ÉÌÕ¹±½¬İ¥Ñ Ñ¡”…É‘•¸-¥Ñ¡•¸¸ˆ¤ì4(4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…¥±¥Ñå1•Ù•±Ì ¤¹ÁÕĞ ‰­¥Ñ¡•¸ˆ°€Ä¤ì4(€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ…¥±¥Ñå1…ÍÑÉÕ•‘Ğ ¤¹ÁÕĞ ‰­¥Ñ¡•¸ˆ°±½¬¹¥¹ÍÑ…¹Ğ ¤¤ì4(€€€€€€€™½È€¡MÑÉ¥¹œµ…Ñ•É¥…±%€è1¥ÍĞ¹½˜ ‰Ù•É‘…¹Ñ}™¥‰•Èˆ°€‰•µ‰•É}¥¹½Ğˆ°€‰™É½ÍÑ}ÉåÍÑ…°ˆ°€‰ÍÑ½Éµ}•±°ˆ°€‰ÍÑ½¹”ˆ°€‰ÁÉ½Ù¥Í¥½¹Ìˆ¤¤ì4(€€€€€€€€€€€ÍÑ½É”¹ÍÑ…Ñ”¹•Ñ5…Ñ•É¥…±%¹Ù•¹Ñ½Éä ¤¹ÁÕĞ¡µ…Ñ•É¥…±%°€ØÀ¤ì4(€€€€€€€ô4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍ¹…ÁÍ¡½Ğ€ôÍ•ÉÙ¥”¹•ÑM¹…ÁÍ¡½Ğ¡ÕÍ•È¤ì4(€€€€€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø½É‘•È€ô€¡5…ÀñMÑÉ¥¹œ°=‰©•Ğø¤Í¹…ÁÍ¡½Ğ¹•Ğ ‰İ••­±å=É‘•Èˆ¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì¡	½½±•…¸¹QIU°½É‘•È¹•Ğ ‰Õ¹±½­•ˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì¡	½½±•…¸¹QIU°½É‘•È¹•Ğ ‰…¹±…¥´ˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑ…±Í”  ¡1¥ÍĞğüø¤½É‘•È¹•Ğ ‰É•ÅÕ¥É•µ•¹ÑÌˆ¤¤¹¥ÍµÁÑä ¤¤ì4(4(€€€€€€€¥¹Ğ½±‘	•™½É”€ôÁÉ½É•ÍÍ¥½¸¹•Ñ½± ¤ì4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø±…¥µ•€ôÍ•ÉÙ¥”¹±…¥µI•İ…É¡ÕÍ•È°€‰İ••­±å}½É‘•Èˆ°€‰½É‘•È´Äˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤ì4(€€€€€€€…ÍÍ•ÉÑQÉÕ”¡ÁÉ½É•ÍÍ¥½¸¹•Ñ½± ¤€ø½±‘	•™½É”¤ì4(€€€€€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•Ğø½É‘•É™Ñ•È€ô€¡5…ÀñMÑÉ¥¹œ°=‰©•Ğø¤±…¥µ•¹•Ğ ‰İ••­±å=É‘•Èˆ¤ì4(€€€€€€€…ÍÍ•ÉÑÅÕ…±Ì¡	½½±•…¸¹QIU°½É‘•É™Ñ•È¹•Ğ ‰±…¥µ•ˆ¤¤ì4(€€€€€€€…ÍÍ•ÉÑQÉÕ”  ¡1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø¤½É‘•É™Ñ•È¹•Ğ ‰É•ÅÕ¥É•µ•¹ÑÌˆ¤¤¹ÍÑÉ•…´ ¤4(€€€€€€€€€€€€€€€€¹…±±5…Ñ ¡¥Ñ•´€´ø€ ¡9Õµ‰•È¤¥Ñ•´¹•Ğ ‰¡…Ù”ˆ¤¤¹¥¹ÑY…±Õ” ¤€ğ€ØÀ¤°4(€€€€€€€€€€€€€€€€‰±…¥µ¥¹œÑ¡”½É‘•ÈÍÁ•¹‘ÌÑ¡”É•ÅÕ¥É•µ…Ñ•É¥…±Ì¸ˆ¤ì4(4(€€€€€€€…ÍÍ•ÉÑQ¡É½İÌ¡%±±•…±ÉÕµ•¹Ñá•ÁÑ¥½¸¹±…ÍÌ°4(€€€€€€€€€€€€€€€€ ¤€´øÍ•ÉÙ¥”¹±…¥µI•İ…É¡ÕÍ•È°€‰İ••­±å}½É‘•Èˆ°€‰½É‘•È´Èˆ°ÍÑ½É”¹ÍÑ…Ñ”¹•ÑY•ÉÍ¥½¸ ¤¤°4(€€€€€€€€€€€€€€€€‰Q¡”½É‘•È…¸½¹±ä‰”™¥±±•½¹”Á•Èİ••¬¸ˆ¤ì4(€€€ô4(4(€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€ÁÉ¥Ù…Ñ”ÍÑ…Ñ¥Œ=‰©•ĞÙ…±Õ•Ğ¡5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍ½ÕÉ”°MÑÉ¥¹œµ…Á-•ä°MÑÉ¥¹œÙ…±Õ•-•ä¤ì4(€€€€€€€É•ÑÕÉ¸€ ¡5…ÀñMÑÉ¥¹œ°=‰©•Ğø¤Í½ÕÉ”¹•Ğ¡µ…Á-•ä¤¤¹•Ğ¡Ù…±Õ•-•ä¤ì4(€€€ô4(4(€€€ÁÉ¥Ù…Ñ”ÍÑ…Ñ¥Œ¥¹Ğ¥¹ÑĞ¡5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍ½ÕÉ”°MÑÉ¥¹œµ…Á-•ä°MÑÉ¥¹œÙ…±Õ•-•ä¤ì4(€€€€€€€É•ÑÕÉ¸€ ¡9Õµ‰•È¤Ù…±Õ•Ğ¡Í½ÕÉ”°µ…Á-•ä°Ù…±Õ•-•ä¤¤¹¥¹ÑY…±Õ” ¤ì4(€€€ô4(4(€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€ÁÉ¥Ù…Ñ”ÍÑ…Ñ¥Œ5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍÑ…Ñ¥½¸¡5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍ¹…ÁÍ¡½Ğ°MÑÉ¥¹œ¥¤ì4(€€€€€€€É•ÑÕÉ¸€ ¡1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø¤Í¹…ÁÍ¡½Ğ¹•Ğ ‰ÍÑ…Ñ¥½¹Ìˆ¤¤¹ÍÑÉ•…´ ¤4(€€€€€€€€€€€€€€€€¹™¥±Ñ•È¡¥Ñ•´€´ø¥¹•ÅÕ…±Ì¡¥Ñ•´¹•Ğ ‰¥ˆ¤¤¤4(€€€€€€€€€€€€€€€€¹™¥¹‘¥ÉÍĞ ¤¹½É±Í•Q¡É½Ü ¤ì4(€€€ô4(4(€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€ÁÉ¥Ù…Ñ”ÍÑ…Ñ¥Œ¥¹Ğµ…Ñ•É¥…±µ½Õ¹Ğ¡5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍ¹…ÁÍ¡½Ğ°MÑÉ¥¹œ¥¤ì4(€€€€€€€5…ÀñMÑÉ¥¹œ°=‰©•ĞøÉ•Í½ÕÉ•Ì€ô€¡5…ÀñMÑÉ¥¹œ°=‰©•Ğø¤Í¹…ÁÍ¡½Ğ¹•Ğ ‰É•Í½ÕÉ•Ìˆ¤ì4(€€€€€€€É•ÑÕÉ¸€ ¡1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø¤É•Í½ÕÉ•Ì¹•Ğ ‰µ…Ñ•É¥…±Ìˆ¤¤¹ÍÑÉ•…´ ¤4(€€€€€€€€€€€€€€€€¹™¥±Ñ•È¡¥Ñ•´€´ø¥¹•ÅÕ…±Ì¡¥Ñ•´¹•Ğ ‰¥ˆ¤¤¤4(€€€€€€€€€€€€€€€€¹µ…À¡¥Ñ•´€´ø€ ¡9Õµ‰•È¤¥Ñ•´¹•Ğ ‰…µ½Õ¹Ğˆ¤¤¹¥¹ÑY…±Õ” ¤¤4(€€€€€€€€€€€€€€€€¹™¥¹‘¥ÉÍĞ ¤¹½É±Í•Q¡É½Ü ¤ì4(€€€ô4(4(€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€ÁÉ¥Ù…Ñ”ÍÑ…Ñ¥Œ1¥ÍĞñMÑÉ¥¹œø±½É•%‘Ì¡5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍ¹…ÁÍ¡½Ğ¤ì4(€€€€€€€É•ÑÕÉ¸€ ¡1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø¤Í¹…ÁÍ¡½Ğ¹•Ğ ‰±½É”ˆ¤¤¹ÍÑÉ•…´ ¤¹µ…À¡¥Ñ•´€´øMÑÉ¥¹œ¹Ù…±Õ•=˜¡¥Ñ•´¹•Ğ ‰¥ˆ¤¤¤¹Ñ½1¥ÍĞ ¤ì4(€€€ô4(4(€€€MÕÁÁÉ•ÍÍ]…É¹¥¹Ì ‰Õ¹¡•­•ˆ¤4(€€€ÁÉ¥Ù…Ñ”ÍÑ…Ñ¥Œ1¥ÍĞñMÑÉ¥¹œø½¹Ù•ÉÍ…Ñ¥½¹%‘Ì¡5…ÀñMÑÉ¥¹œ°=‰©•ĞøÍ¹…ÁÍ¡½Ğ¤ì4(€€€€€€€É•ÑÕÉ¸€ ¡1¥ÍĞñ5…ÀñMÑÉ¥¹œ°=‰©•Ğøø¤Í¹…ÁÍ¡½Ğ¹•Ğ ‰…Ù…¥±…‰±•½¹Ù•ÉÍ…Ñ¥½¹Ìˆ¤¤¹ÍÑÉ•…´ ¤4(€€€€€€€€€€€€€€€€¹µ…À¡¥Ñ•´€´øMÑÉ¥¹œ¹Ù…±Õ•=˜¡¥Ñ•´¹•Ğ ‰¥ˆ¤¤¤¹Ñ½1¥ÍĞ ¤ì4(€€€ô4(4(€€€ÁÉ¥Ù…Ñ”ÍÑ…Ñ¥ŒM¥•±¥¹…É…É¡MÑÉ¥¹œ¥°MÑÉ¥¹œ¹…µ”°±•µ•¹Ğ•±•µ•¹Ğ¤ì4(€€€€€€€É•ÑÕÉ¸…É¡¥°¹…µ”°•±•µ•¹Ğ°I…É¥Ñä¹=55=8¤ì4(€€€ô4(4(€€€ÁÉ¥Ù…Ñ”ÍÑ…Ñ¥ŒM¥•±¥¹…É…É¡MÑÉ¥¹œ¥°MÑÉ¥¹œ¹…µ”°±•µ•¹Ğ•±•µ•¹Ğ°I…É¥ÑäÉ…É¥Ñä¤ì4(€€€€€€€É•ÑÕÉ¸¹•ÜM¥•±¥¹…É¡¥°¹…µ”°•±•µ•¹Ğ°É…É¥Ñä°€à°€Ì°1¥ÍĞ¹½˜ ¤°I½Ü¹	,¤ì4(€€€ô4(4(€€€ÁÉ¥Ù…Ñ”ÍÑ…Ñ¥Œ±…ÍÌ%¹5•µ½Éå-••ÁMÑ½É”•áÑ•¹‘Ì-••ÁMÑ½É”ì4(€€€€€€€ÁÉ¥Ù…Ñ”-••ÁMÑ…Ñ”ÍÑ…Ñ”ì4(€€€€€€€=Ù•ÉÉ¥‘”ÁÕ‰±¥Œ=ÁÑ¥½¹…°ñ-••ÁMÑ…Ñ”ø™¥¹‘	åUÍ•É%¡MÑÉ¥¹œÕÍ•É%¤ìÉ•ÑÕÉ¸=ÁÑ¥½¹…°¹½™9Õ±±…‰±”¡ÍÑ…Ñ”¤ìô4(€€€€€€€=Ù•ÉÉ¥‘”ÁÕ‰±¥Œ-••ÁMÑ…Ñ”Í…Ù”¡-••ÁMÑ…Ñ”Ù…±Õ”¤ìÍÑ…Ñ”€ôÙ…±Õ”ìÉ•ÑÕÉ¸Ù…±Õ”ìô4(€€€€€€€=Ù•ÉÉ¥‘”ÁÕ‰±¥ŒÙ½¥‘•±•Ñ•	åUÍ•É%¡MÑÉ¥¹œÕÍ•É%¤ìÍÑ…Ñ”€ô¹Õ±°ìô4(€€€ô4(4(€€€ÁÉ¥Ù…Ñ”ÍÑ…Ñ¥Œ±…ÍÌ5ÕÑ…‰±•±½¬•áÑ•¹‘Ì±½¬ì4(€€€€€€€ÁÉ¥Ù…Ñ”%¹ÍÑ…¹Ğ¹½Üì4(€€€€€€€5ÕÑ…‰±•±½¬¡%¹ÍÑ…¹Ğ¹½Ü¤ìÑ¡¥Ì¹¹½Ü€ô¹½Üìô4(€€€€€€€Ù½¥…‘Ù…¹”¡ÕÉ…Ñ¥½¸‘ÕÉ…Ñ¥½¸¤ì¹½Ü€ô¹½Ü¹Á±ÕÌ¡‘ÕÉ…Ñ¥½¸¤ìô4(€€€€€€€=Ù•ÉÉ¥‘”ÁÕ‰±¥Œi½¹•%•Ñi½¹” ¤ìÉ•ÑÕÉ¸i½¹•=™™Í•Ğ¹UQìô4(€€€€€€€=Ù•ÉÉ¥‘”ÁÕ‰±¥Œ±½¬İ¥Ñ¡i½¹”¡i½¹•%é½¹”¤ìÉ•ÑÕÉ¸Ñ¡¥Ììô4(€€€€€€€=Ù•ÉÉ¥‘”ÁÕ‰±¥Œ%¹ÍÑ…¹Ğ¥¹ÍÑ…¹Ğ ¤ìÉ•ÑÕÉ¸¹½Üìô4(€€€ô4)ô4(