package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PlayerProgressionServiceTest {

    @Test
    void bulkPackCostAppliesFivePercentDiscountForMultiBuys() {
        // Single pulls pay full price; bulk pulls get 5% off the gross.
        assertEquals(100, PlayerProgressionService.bulkPackCost(100, 1));
        assertEquals(950, PlayerProgressionService.bulkPackCost(100, 10));
        assertEquals(1140, PlayerProgressionService.bulkPackCost(120, 10));
        assertEquals(11400, PlayerProgressionService.bulkPackCost(1200, 10));
    }

    @Test
    void repeatedPackOpenRequestDoesNotChargeAgain() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setGold(500);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.openPacks(user(), "pack_fire", 1, "pack-request-1");
        int savesAfterFirstRequest = store.saveCount;
        service.openPacks(user(), "pack_fire", 1, "pack-request-1");

        assertEquals(400, store.saved.getGold());
        assertEquals(1, store.saved.getPackHistory().size());
        assertEquals("pack-request-1", store.saved.getPackHistory().get(0).get("requestId"));
        assertEquals(savesAfterFirstRequest, store.saveCount);
    }

    @Test
    void repeatedBulkPackOpenRequestDoesNotChargeAgain() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setGold(2000);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.openPacks(user(), "pack_fire", 10, "bulk-pack-request-1");
        int savesAfterFirstRequest = store.saveCount;
        service.openPacks(user(), "pack_fire", 10, "bulk-pack-request-1");

        assertEquals(1050, store.saved.getGold());
        assertEquals(1, store.saved.getPackHistory().size());
        assertEquals("bulk-pack-request-1", store.saved.getPackHistory().get(0).get("requestId"));
        assertEquals(savesAfterFirstRequest, store.saveCount);
    }

    @Test
    void repeatedPackOpenRequestDoesNotChargeAgainAfterHistoryEviction() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setGold(3000);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.openPacks(user(), "pack_fire", 1, "timed-out-request");
        for (int i = 0; i < 20; i++) {
            service.openPacks(user(), "pack_fire", 1, "later-request-" + i);
        }
        int goldAfterLaterRequests = store.saved.getGold();
        int savesBeforeRetry = store.saveCount;

        service.openPacks(user(), "pack_fire", 1, "timed-out-request");

        assertEquals(20, store.saved.getPackHistory().size());
        assertEquals(goldAfterLaterRequests, store.saved.getGold());
        assertTrue(store.saved.getCompletedPackOpenRequestIds().contains("timed-out-request"));
        assertEquals(savesBeforeRetry, store.saveCount);
    }

    @Test
    void getOrCreateDoesNotOverwriteExistingProgressionOnRead() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity existing = new PlayerProgressionEntity();
        existing.setUserId("player@example.com");
        existing.setGold(250);
        store.saved = existing;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        PlayerProgressionEntity progression = service.getOrCreate(user());

        assertSame(existing, progression);
        assertEquals(0, store.saveCount);
        assertEquals(250, progression.getGold());
    }

    @Test
    void starterPackCanOnlyBeChosenOnceAndGrantsFiveCards() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());
        AccountUser user = user();

        PlayerProgressionEntity progression = service.chooseStarterPack(user, "pack_fire");
        int savesAfterFirstChoice = store.saveCount;

        assertEquals("pack_fire", progression.getStarterPackId());
        assertEquals(5, progression.getOwnedCards().values().stream().mapToInt(Integer::intValue).sum());
        assertEquals(PlayerProgressionService.PACK_OPEN_REMNANTS, progression.getRemnants());
        PlayerProgressionEntity retry = service.chooseStarterPack(user, "pack_fire");
        assertSame(progression, retry);
        assertEquals(savesAfterFirstChoice, store.saveCount);
        assertEquals(5, progression.getOwnedCards().values().stream().mapToInt(Integer::intValue).sum());
        assertThrows(IllegalArgumentException.class, () -> service.chooseStarterPack(user, "pack_water"));
    }

    @Test
    void matchRewardsAreGrantedOnce() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());
        MatchHistoryEntity history = new MatchHistoryEntity();
        history.setId("match-1");
        history.setUserId("player@example.com");
        history.setResult("WIN");
        history.setMatchType("SOLO");

        service.awardMatchGold(history);
        service.awardMatchGold(history);

        assertEquals(PlayerProgressionService.STARTING_GOLD + PlayerProgressionService.SOLO_WIN_GOLD + PlayerProgressionService.WIN_STREAK_GOLD, store.saved.getGold());
        assertEquals(PlayerProgressionService.SOLO_WIN_REMNANTS, store.saved.getRemnants());
        assertEquals(1, store.saved.getRewardedMatchIds().size());
        assertEquals(1, store.saved.getSoloWinStreak());
    }

    @Test
    void onlineAndSoloWinRewardsScaleWithActiveStreak() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.awardMatchGold(history("solo-1", "SOLO", "WIN"));
        service.awardMatchGold(history("solo-2", "SOLO", "WIN"));
        service.awardMatchGold(history("pvp-1", "ONLINE", "WIN"));
        service.awardMatchGold(history("pvp-2", "ONLINE", "LOSS"));

        int expected = PlayerProgressionService.STARTING_GOLD
                + 12
                + 14
                + 7;
        assertEquals(expected, store.saved.getGold());
        assertEquals(PlayerProgressionService.SOLO_WIN_REMNANTS * 2 + PlayerProgressionService.ONLINE_WIN_REMNANTS, store.saved.getRemnants());
        assertEquals(2, store.saved.getSoloWinStreak());
        assertEquals(0, store.saved.getOnlineWinStreak());
    }

    @Test
    void playerCanSpendRemnantsForHolographicFinishOnOwnedCard() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setRemnants(2500);
        progression.getOwnedCards().put("draco", 1);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.purchaseHolographicFinish(user(), "draco");

        assertEquals(500, store.saved.getRemnants());
        assertTrue(store.saved.getHolographicCardIds().contains("draco"));
    }

    @Test
    void holographicFinishRequiresOwnership() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setRemnants(1000);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        assertThrows(IllegalArgumentException.class, () -> service.purchaseHolographicFinish(user(), "draco"));
    }

    @Test
    void remnantsCraftSpecificCardsAtHighRarityCost() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setRemnants(2500);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.craftCard(user(), "dracoil");

        assertEquals(500, store.saved.getRemnants());
        assertEquals(1, store.saved.getOwnedCards().get("dracoil"));
    }

    @Test
    void dailyOfferPurchasesGrantOneCopyAndCanOnlyBeBoughtOnce() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setGold(500);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.purchaseDailyOffer(user(), "daily-test-draco");
        service.purchaseDailyOffer(user(), "daily-test-draco");

        assertEquals(440, store.saved.getGold());
        assertEquals(1, store.saved.getOwnedCards().get("draco"));
        assertEquals(1, store.saved.getPurchasedDailyOfferIds().size());
    }

    @Test
    void duplicatePullsAtCopyCapConvertToRemnantsWithoutIncreasingOwned() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setGold(500);
        LinkedHashMap<String, Integer> owned = new LinkedHashMap<>();
        owned.put("draco", 3);
        progression.setOwnedCards(owned);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new DuplicateDracoPackCatalogService(), new FakeCardDefinitionService());

        service.openPack(user(), "pack_fire");

        assertEquals(3, store.saved.getOwnedCards().get("draco"));
        assertTrue(store.saved.getRemnants() > PlayerProgressionService.PACK_OPEN_REMNANTS);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> latestCards = (List<Map<String, Object>>) store.saved.getPackHistory().get(0).get("cards");
        Map<String, Object> latestCard = latestCards.get(0);
        assertEquals(true, latestCard.get("duplicateAtCap"));
        assertTrue(((Number) latestCard.get("remnantsAwarded")).intValue() > 0);
    }

    @Test
    void customDeckValidationRequiresThirtyOwnedCopiesAndCapsCopiesAtThree() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setGold(500);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        assertThrows(IllegalArgumentException.class, () -> service.validateCustomDeckOwnership(user(), List.of("draco")));

        LinkedHashMap<String, Integer> owned = new LinkedHashMap<>();
        owned.put("draco", 30);
        progression.setOwnedCards(owned);
        assertThrows(IllegalArgumentException.class, () -> service.validateCustomDeckOwnership(user(), List.of("draco", "draco", "draco", "draco")));

        service.validateCustomDeckOwnership(user(), List.of("draco", "draco", "draco"));
        assertTrue(service.serialize(progression).containsKey("customDeckUnlocked"));
    }

    @Test
    void guestWinnerSeesPotentialRewardPreview() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        Map<String, Object> rewards = service.describeEarnedRewards(null, "SOLO", "WIN");

        assertEquals(PlayerProgressionService.SOLO_WIN_GOLD, rewards.get("goldEarned"));
        assertEquals(PlayerProgressionService.SOLO_WIN_REMNANTS, rewards.get("remnantsEarned"));
        assertEquals(0, rewards.get("streakBonus"));
        assertEquals(Boolean.TRUE, rewards.get("guestPreview"));
        assertEquals(Boolean.FALSE, rewards.get("rewardsClaimed"));
        // Nothing should be persisted for a guest.
        assertEquals(0, store.saveCount);
    }

    @Test
    void lossEarnsNothingAndIsNotAPreview() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        Map<String, Object> rewards = service.describeEarnedRewards(user(), "SOLO", "LOSS");

        assertEquals(0, rewards.get("goldEarned"));
        assertEquals(0, rewards.get("remnantsEarned"));
        assertEquals(0, rewards.get("streakBonus"));
        assertEquals(Boolean.FALSE, rewards.get("guestPreview"));
        assertEquals(Boolean.FALSE, rewards.get("rewardsClaimed"));
    }

    @Test
    void loggedInWinnerSeesClaimedRewardsReflectingTheirStreak() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        // awardMatchGold has already run for this match in production, leaving the
        // streak at 2; the end-screen description should reflect that streak.
        progression.setSoloWinStreak(2);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        Map<String, Object> rewards = service.describeEarnedRewards(user(), "SOLO", "WIN");

        int expectedBonus = PlayerProgressionService.WIN_STREAK_GOLD * 2;
        assertEquals(PlayerProgressionService.SOLO_WIN_GOLD + expectedBonus, rewards.get("goldEarned"));
        assertEquals(PlayerProgressionService.SOLO_WIN_REMNANTS, rewards.get("remnantsEarned"));
        assertEquals(expectedBonus, rewards.get("streakBonus"));
        assertEquals(Boolean.TRUE, rewards.get("rewardsClaimed"));
        assertEquals(Boolean.FALSE, rewards.get("guestPreview"));
    }

    @Test
    void mainFourDecksAreFreeAndEverythingElseStaysLocked() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        // No starter chosen yet: Fire / Ice / Earth / Wind only, including the
        // multi-element deck built purely from them.
        assertEquals(
                List.of("deck_fire", "deck_ice", "deck_earth", "deck_wind", "deck_fire_earth"),
                service.unlockedPremadeDeckIds(progression)
        );
    }

    @Test
    void starterPackElementUnlocksThatElementsDeck() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_water");
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        List<String> unlocked = service.unlockedPremadeDeckIds(progression);
        assertTrue(unlocked.contains("deck_water"), "Water starter unlocks the Water deck.");
        assertTrue(unlocked.contains("deck_water_wind"), "Water + Wind is all free elements for this player.");
        assertTrue(!unlocked.contains("deck_shadow"), "Shadow still has to be bought.");
    }

    @Test
    void lockedPremadeDeckCostsFiveHundredCoinsOnce() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setGold(500);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.purchaseDeck(user(), "deck_water");
        assertEquals(0, store.saved.getGold());
        assertEquals(List.of("deck_water"), store.saved.getPurchasedDeckIds());

        // Re-buying is a no-op rather than a second charge.
        service.purchaseDeck(user(), "deck_water");
        assertEquals(0, store.saved.getGold());
        assertEquals(1, store.saved.getPurchasedDeckIds().size());
    }

    @Test
    void shopWritePathsShareTheProgressionLockWithPackOpens() throws Exception {
        // PlayerProgressionStore.save is a full-document Firestore set. Pack opens
        // already serialize on a per-user stripe; deck unlock / craft / title paths
        // must use the same lock or a concurrent pack open can overwrite them (and
        // vice versa), dropping cards or purchasedDeckIds.
        String source = java.nio.file.Files.readString(
                java.nio.file.Path.of("src/main/java/com/sieglings/service/PlayerProgressionService.java"));
        assertTrue(source.contains("progressionWriteLocks"), "Per-user progression write stripes must exist.");
        for (String signature : java.util.List.of(
                "public PlayerProgressionEntity chooseStarterPack(",
                "public PlayerProgressionEntity completeTutorial(",
                "public PlayerProgressionEntity openPack(AccountUser user, String packId, String requestId)",
                "public PlayerProgressionEntity openPacks(AccountUser user, String packId, int count, String requestId)",
                "public PlayerProgressionEntity purchaseDeck(",
                "public PlayerProgressionEntity purchaseDailyOffer(",
                "public PlayerProgressionEntity purchaseHolographicFinish(",
                "public PlayerProgressionEntity craftCard(",
                "public PlayerProgressionEntity purchaseTitle(",
                "public PlayerProgressionEntity buyTrainerXp(",
                "public void awardMatchGold(")) {
            int idx = source.indexOf(signature);
            assertTrue(idx >= 0, "Could not find " + signature);
            String window = source.substring(idx, Math.min(source.length(), idx + 280));
            assertTrue(
                    window.contains("synchronized (progressionWriteLock"),
                    signature + " must enter synchronized (progressionWriteLock(...)) before mutating progression."
            );
        }
    }

    @Test
    void freeDeckPurchaseNeverChargesAndShortCoinsAreRejected() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setGold(499);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.purchaseDeck(user(), "deck_fire");
        assertEquals(499, store.saved.getGold());
        assertTrue(store.saved.getPurchasedDeckIds().isEmpty(), "Free decks are never recorded as purchases.");

        assertThrows(IllegalArgumentException.class, () -> service.purchaseDeck(user(), "deck_shadow"));
        assertEquals(499, store.saved.getGold());
    }

    private PlayerProgressionService createService(PlayerProgressionStore store,
                                                   PackCatalogService packCatalogService,
                                                   CardDefinitionService cardDefinitionService) throws Exception {
        PlayerProgressionService service = new PlayerProgressionService();
        setField(service, "store", store);
        setField(service, "packCatalogService", packCatalogService);
        setField(service, "cardDefinitionService", cardDefinitionService);
        return service;
    }

    private void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private AccountUser user() {
        AccountUser user = new AccountUser();
        user.setId("player@example.com");
        user.setEmail("player@example.com");
        user.setDisplayName("Player");
        return user;
    }

    private MatchHistoryEntity history(String id, String matchType, String result) {
        MatchHistoryEntity history = new MatchHistoryEntity();
        history.setId(id);
        history.setUserId("player@example.com");
        history.setMatchType(matchType);
        history.setResult(result);
        return history;
    }

    private static class FakeProgressionStore extends PlayerProgressionStore {
        private PlayerProgressionEntity saved;
        private int saveCount;

        @Override
        public Optional<PlayerProgressionEntity> findByUserId(String userId) {
            return saved == null ? Optional.empty() : Optional.of(saved);
        }

        @Override
        public PlayerProgressionEntity save(PlayerProgressionEntity progression) {
            saveCount++;
            saved = progression;
            return progression;
        }
    }

    private static class DuplicateDracoPackCatalogService extends PackCatalogService {
        @Override
        public PackOpenResult openPack(String packId, boolean starterOnly) {
            Card draco = new SieglingCard("draco", "Draco", Element.FIRE, Rarity.COMMON, 7, 3, List.of(), Row.FRONT);
            return new PackOpenResult(
                    new PackDefinition("pack_fire", "Fire Pack", "", true, 100, List.of(Element.FIRE), true),
                    List.of(draco, draco, draco, draco, draco)
            );
        }
    }

    private static class FakePackCatalogService extends PackCatalogService {
        @Override
        public Optional<PackDefinition> findPack(String packId) {
            if (!"pack_fire".equals(packId)) {
                return Optional.empty();
            }
            return Optional.of(new PackDefinition("pack_fire", "Fire Pack", "", true, 100, List.of(Element.FIRE), true));
        }

        @Override
        public PackOpenResult openPack(String packId, boolean starterOnly) {
            return new PackOpenResult(
                    new PackDefinition("pack_fire", "Fire Pack", "", true, 100, List.of(Element.FIRE), true),
                    List.of(
                            new SieglingCard("draco", "Draco", Element.FIRE, Rarity.COMMON, 7, 3, List.of(), Row.FRONT),
                            new SieglingCard("dracoil", "Dracoil", Element.FIRE, Rarity.RARE, 8, 3, List.of(), Row.FRONT),
                            new SieglingCard("pylook", "Pylook", Element.FIRE, Rarity.COMMON, 5, 4, List.of(), Row.FRONT),
                            new SpellCard("spark", "Spark", Element.FIRE, Rarity.COMMON, 1, Ability.damage("Spark", "", TargetType.SINGLE_ENEMY, null, 1, 1)),
                            new TrapCard("flaretrap", "Flare Trap", Element.FIRE, Rarity.COMMON, Element.FIRE, 2, Ability.damage("Flare", "", TargetType.SINGLE_ENEMY, null, 1, 1))
                    )
            );
        }

        @Override
        public Optional<DailyCardOffer> findDailyOffer(String offerId) {
            if (!"daily-test-draco".equals(offerId)) {
                return Optional.empty();
            }
            return Optional.of(new DailyCardOffer(
                    "daily-test-draco",
                    "2026-05-25",
                    1,
                    60,
                    new SieglingCard("draco", "Draco", Element.FIRE, Rarity.COMMON, 7, 3, List.of(), Row.FRONT)
            ));
        }
    }

    private static class FakeCardDefinitionService extends CardDefinitionService {
        private static final List<DeckOption> DECKS = List.of(
                new DeckOption("deck_fire", "Blazing Core", "", List.of(Element.FIRE), "trainer02"),
                new DeckOption("deck_ice", "Frostmarch", "", List.of(Element.ICE), "trainer09"),
                new DeckOption("deck_earth", "Stone Garden", "", List.of(Element.EARTH), "trainer05"),
                new DeckOption("deck_wind", "Gale Talons", "", List.of(Element.WIND), "trainer06"),
                new DeckOption("deck_water", "Aquatic Overflow", "", List.of(Element.WATER), "trainer04"),
                new DeckOption("deck_shadow", "Night Bloom", "", List.of(Element.SHADOW), "trainer07"),
                new DeckOption("deck_fire_earth", "Ashen Roots", "", List.of(Element.FIRE, Element.EARTH), "trainer05"),
                new DeckOption("deck_water_wind", "Stormtide", "", List.of(Element.WATER, Element.WIND), "trainer06")
        );

        @Override
        public List<DeckOption> getDeckOptions() {
            return DECKS;
        }

        @Override
        public Optional<DeckOption> getDeckOption(String deckId) {
            return DECKS.stream().filter(deck -> deck.id().equals(deckId)).findFirst();
        }

        @Override
        public int getDeckBuilderMaxCopies() {
            return 3;
        }

        @Override
        public List<Card> getDeckBuilderCatalog() {
            return List.of(
                    new SieglingCard("draco", "Draco", Element.FIRE, Rarity.COMMON, 7, 3, List.of(), Row.FRONT),
                    new SieglingCard("dracoil", "Dracoil", Element.FIRE, Rarity.RARE, 8, 3, List.of(), Row.FRONT)
            );
        }

        @Override
        public TrainerCard getTrainer(Element element) {
            return fireKnight();
        }

        @Override
        public Optional<TrainerCard> getActiveTrainerById(String trainerId) {
            if ("trainer01".equalsIgnoreCase(trainerId)) {
                return Optional.of(fireKnight());
            }
            return Optional.empty();
        }
    }

    private static TrainerCard fireKnight() {
        return new TrainerCard(
                "trainer01",
                "Flame Tactician",
                Element.FIRE,
                Rarity.RARE,
                Ability.passive("Battle Focus", "All Fire allies gain +1 attack damage", "damage_boost", 1),
                Ability.damage("Kindle Shot", "Deal 2 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 2),
                false
        );
    }

    private static TrainerCard waterKnight() {
        return new TrainerCard(
                "trainer02",
                "Tide Strategist",
                Element.WATER,
                Rarity.RARE,
                Ability.passive("Flow Guard", "All Water allies gain +1 HP", "hp_boost", 1),
                Ability.damage("Splash Lance", "Deal 2 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 2),
                false
        );
    }

    @Test
    void starterPackGrantsMatchingSiegeKnightAtLevelOne() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        PlayerProgressionEntity progression = service.chooseStarterPack(user(), "pack_fire");

        assertEquals(1, progression.getTrainerLevels().get("trainer01"));
        assertTrue(service.ownsTrainer(user(), "trainer01"));
        assertEquals(1, service.getTrainerLevel(user(), "trainer01"));
    }

    @Test
    void getOrCreateRetroactivelyGrantsStarterKnightForExistingPlayers() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity existing = new PlayerProgressionEntity();
        existing.setUserId("player@example.com");
        existing.setStarterPackId("pack_fire");
        store.saved = existing;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        PlayerProgressionEntity progression = service.getOrCreate(user());

        assertEquals(1, progression.getTrainerLevels().get("trainer01"));
    }

    @Test
    void siegeKnightPackDropAddsKnightToOwnership() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setGold(5000);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new TrainerDropPackCatalogService(), new FakeCardDefinitionService());

        service.openPack(user(), "pack_siegeknight");

        assertEquals(1, store.saved.getTrainerLevels().get("trainer01"));
        assertEquals(1, store.saved.getTrainerLevels().get("trainer02"));
        @SuppressWarnings("unchecked")
        Map<String, Object> trainerEntry = (Map<String, Object>) store.saved.getPackHistory().get(0).get("trainer");
        assertEquals(true, trainerEntry.get("newlyOwned"));
        assertEquals("trainer02", trainerEntry.get("id"));
    }

    @Test
    void duplicateSiegeKnightPullsCombineIntoHigherLevels() {
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        PlayerProgressionService service = new PlayerProgressionService();
        TrainerCard knight = fireKnight();

        PlayerProgressionService.TrainerGrantOutcome first = service.grantTrainer(progression, knight);
        assertEquals(1, first.level());
        assertTrue(first.newlyOwned());

        // Level 1 -> 2 needs 1 point.
        PlayerProgressionService.TrainerGrantOutcome second = service.grantTrainer(progression, knight);
        assertEquals(2, second.level());
        assertTrue(second.leveledUp());

        // Level 2 -> 3 needs 2 points (two more duplicates).
        service.grantTrainer(progression, knight);
        PlayerProgressionService.TrainerGrantOutcome fourth = service.grantTrainer(progression, knight);
        assertEquals(3, fourth.level());
    }

    @Test
    void trainerAbilityBonusScalesWithLevel() {
        assertEquals(0, PlayerProgressionService.trainerAbilityBonus(1));
        assertEquals(3, PlayerProgressionService.trainerAbilityBonus(4));
    }

    @Test
    void buyTrainerXpSpendsLevelScaledCoinsAndGrantsProgress() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setGold(500);
        LinkedHashMap<String, Integer> levels = new LinkedHashMap<>();
        levels.put("trainer01", 2);
        progression.setTrainerLevels(levels);
        LinkedHashMap<String, Integer> points = new LinkedHashMap<>();
        points.put("trainer01", 0);
        progression.setTrainerPoints(points);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.buyTrainerXp(user(), "trainer01");

        assertEquals(400, store.saved.getGold());
        assertEquals(1, store.saved.getTrainerPoints().get("trainer01"));
        assertEquals(2, store.saved.getTrainerLevels().get("trainer01"));
    }

    @Test
    void buyTrainerXpLevelsUpWhenThresholdReached() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setGold(500);
        LinkedHashMap<String, Integer> levels = new LinkedHashMap<>();
        levels.put("trainer01", 1);
        progression.setTrainerLevels(levels);
        LinkedHashMap<String, Integer> points = new LinkedHashMap<>();
        points.put("trainer01", 0);
        progression.setTrainerPoints(points);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        service.buyTrainerXp(user(), "trainer01");

        assertEquals(450, store.saved.getGold());
        assertEquals(2, store.saved.getTrainerLevels().get("trainer01"));
        assertEquals(0, store.saved.getTrainerPoints().get("trainer01"));
    }

    @Test
    void buyTrainerXpRejectsUnownedKnight() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId("player@example.com");
        progression.setStarterPackId("pack_fire");
        progression.setGold(500);
        LinkedHashMap<String, Integer> levels = new LinkedHashMap<>();
        levels.put("trainer01", 1);
        progression.setTrainerLevels(levels);
        store.saved = progression;
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());

        assertThrows(IllegalArgumentException.class, () -> service.buyTrainerXp(user(), "trainer02"));
    }

    private static class TrainerDropPackCatalogService extends PackCatalogService {
        @Override
        public PackOpenResult openPack(String packId, boolean starterOnly) {
            return new PackOpenResult(
                    new PackDefinition("pack_siegeknight", "SiegeKnight Cache", "", true, 1200, List.of(Element.FIRE), false),
                    List.of(
                            new SieglingCard("draco", "Draco", Element.FIRE, Rarity.COMMON, 7, 3, List.of(), Row.FRONT),
                            new SieglingCard("dracoil", "Dracoil", Element.FIRE, Rarity.RARE, 8, 3, List.of(), Row.FRONT),
                            new SieglingCard("pylook", "Pylook", Element.FIRE, Rarity.COMMON, 5, 4, List.of(), Row.FRONT),
                            new SpellCard("spark", "Spark", Element.FIRE, Rarity.COMMON, 1, Ability.damage("Spark", "", TargetType.SINGLE_ENEMY, null, 1, 1)),
                            new TrapCard("flaretrap", "Flare Trap", Element.FIRE, Rarity.COMMON, Element.FIRE, 2, Ability.damage("Flare", "", TargetType.SINGLE_ENEMY, null, 1, 1))
                    ),
                    waterKnight()
            );
        }
    }
}
