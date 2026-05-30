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

        assertEquals("pack_fire", progression.getStarterPackId());
        assertEquals(5, progression.getOwnedCards().values().stream().mapToInt(Integer::intValue).sum());
        assertEquals(PlayerProgressionService.PACK_OPEN_REMNANTS, progression.getRemnants());
        assertThrows(IllegalArgumentException.class, () -> service.chooseStarterPack(user, "pack_fire"));
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
