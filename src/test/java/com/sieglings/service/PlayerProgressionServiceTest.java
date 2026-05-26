package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
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
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PlayerProgressionServiceTest {

    @Test
    void starterPackCanOnlyBeChosenOnceAndGrantsFiveCards() throws Exception {
        FakeProgressionStore store = new FakeProgressionStore();
        PlayerProgressionService service = createService(store, new FakePackCatalogService(), new FakeCardDefinitionService());
        AccountUser user = user();

        PlayerProgressionEntity progression = service.chooseStarterPack(user, "pack_fire");

        assertEquals("pack_fire", progression.getStarterPackId());
        assertEquals(5, progression.getOwnedCards().values().stream().mapToInt(Integer::intValue).sum());
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
        assertEquals(2, store.saved.getSoloWinStreak());
        assertEquals(0, store.saved.getOnlineWinStreak());
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

        @Override
        public Optional<PlayerProgressionEntity> findByUserId(String userId) {
            return saved == null ? Optional.empty() : Optional.of(saved);
        }

        @Override
        public PlayerProgressionEntity save(PlayerProgressionEntity progression) {
            saved = progression;
            return progression;
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
    }
}
