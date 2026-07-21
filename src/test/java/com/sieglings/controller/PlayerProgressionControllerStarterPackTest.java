package com.sieglings.controller;

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
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.service.AccountService;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.PackCatalogService;
import com.sieglings.service.PlayerProgressionService;
import com.sieglings.service.PlayerTitleCatalogService;
import com.sieglings.service.ProfileSettingsService;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PlayerProgressionControllerStarterPackTest {

    @Test
    void starterPackSucceedsWhenFirstCatalogSieglingIsNotOwned() throws Exception {
        AccountUser user = testUser();
        RecordingProfileSettingsService profileSettings = new RecordingProfileSettingsService();
        PlayerProgressionController controller = createController(
                user,
                new EarthStarterPackCatalogService(),
                new EarthCatalogWithUnownedLeadSiegling(),
                profileSettings
        );

        Map<String, Object> response = controller.starterPack("Bearer token", Map.of("packId", "pack_earth"));

        assertFalse(response.containsKey("error"), () -> String.valueOf(response.get("error")));
        assertTrue(response.containsKey("progression"));
        @SuppressWarnings("unchecked")
        Map<String, Object> progression = (Map<String, Object>) response.get("progression");
        assertEquals(true, progression.get("starterChosen"));
        assertEquals("pack_earth", progression.get("starterPackId"));
        assertEquals("applehead", profileSettings.lastFavoriteSieglingId);
        assertFalse("mossy".equals(profileSettings.lastFavoriteSieglingId),
                "Must not pick an unowned first-catalog Siegeling as the starter favorite.");
    }

    @Test
    void starterPackStillReturnsProgressionWhenProfileDefaultsFail() throws Exception {
        AccountUser user = testUser();
        ProfileSettingsService throwingSettings = new ProfileSettingsService() {
            @Override
            public ProfileSettingsEntity save(AccountUser accountUser, Map<String, Object> req) {
                throw new IllegalArgumentException("Choose a Siegeling you own.");
            }

            @Override
            public ProfileSettingsEntity getOrCreate(AccountUser accountUser) {
                ProfileSettingsEntity settings = new ProfileSettingsEntity();
                settings.setUserId(accountUser.getId());
                settings.setFavoriteElement("EARTH");
                return settings;
            }

            @Override
            public Map<String, Object> serialize(ProfileSettingsEntity settings, AccountUser accountUser) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("favoriteElement", settings.getFavoriteElement());
                return out;
            }
        };
        PlayerProgressionController controller = createController(
                user,
                new EarthStarterPackCatalogService(),
                new EarthCatalogWithUnownedLeadSiegling(),
                throwingSettings
        );

        Map<String, Object> response = controller.starterPack("Bearer token", Map.of("packId", "pack_earth"));

        assertFalse(response.containsKey("error"), () -> String.valueOf(response.get("error")));
        assertTrue(response.containsKey("progression"));
        @SuppressWarnings("unchecked")
        Map<String, Object> progression = (Map<String, Object>) response.get("progression");
        assertEquals(true, progression.get("starterChosen"));
    }

    private PlayerProgressionController createController(AccountUser user,
                                                         PackCatalogService packs,
                                                         CardDefinitionService cards,
                                                         ProfileSettingsService profileSettings) throws Exception {
        PlayerProgressionService progressionService = new PlayerProgressionService();
        setField(progressionService, "store", new InMemoryProgressionStore());
        setField(progressionService, "packCatalogService", packs);
        setField(progressionService, "cardDefinitionService", cards);

        PlayerProgressionController controller = new PlayerProgressionController();
        setField(controller, "accountService", new AccountService() {
            @Override
            public AccountUser requireUser(String authorizationHeader) {
                return user;
            }
        });
        setField(controller, "progressionService", progressionService);
        setField(controller, "packCatalogService", packs);
        setField(controller, "cardDefinitionService", cards);
        setField(controller, "profileSettingsService", profileSettings);
        setField(controller, "playerTitleCatalogService", new PlayerTitleCatalogService() {
            @Override
            public List<Map<String, Object>> serializeCatalog() {
                return List.of();
            }
        });
        return controller;
    }

    private static AccountUser testUser() {
        AccountUser user = new AccountUser();
        user.setId("new-player@example.com");
        user.setEmail("new-player@example.com");
        user.setDisplayName("New Player");
        return user;
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static class InMemoryProgressionStore extends com.sieglings.persistence.firestore.PlayerProgressionStore {
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

    private static class EarthStarterPackCatalogService extends PackCatalogService {
        @Override
        public Optional<PackDefinition> findPack(String packId) {
            if (!"pack_earth".equals(packId)) {
                return Optional.empty();
            }
            return Optional.of(new PackDefinition(
                    "pack_earth", "Earth Starter Pack", "", true, 100, List.of(Element.EARTH), true
            ));
        }

        @Override
        public PackOpenResult openPack(String packId, boolean starterOnly) {
            return new PackOpenResult(
                    findPack(packId).orElseThrow(),
                    List.of(
                            new SieglingCard("applehead", "Applehead", Element.EARTH, Rarity.COMMON, 6, 2, List.of(), Row.FRONT),
                            new SieglingCard("sleaf", "Sleaf", Element.EARTH, Rarity.COMMON, 5, 3, List.of(), Row.FRONT),
                            new SieglingCard("cacty", "Cacty", Element.EARTH, Rarity.UNCOMMON, 7, 2, List.of(), Row.FRONT),
                            new SpellCard("rootguard", "Root Guard", Element.EARTH, Rarity.COMMON, 1,
                                    Ability.damage("Root", "", TargetType.SINGLE_ENEMY, null, 1, 1)),
                            new TrapCard("stonebite", "Stone Bite", Element.EARTH, Rarity.COMMON, Element.EARTH, 2,
                                    Ability.damage("Bite", "", TargetType.SINGLE_ENEMY, null, 1, 1))
                    )
            );
        }

        @Override
        public List<Map<String, Object>> serializePacks() {
            return List.of();
        }

        @Override
        public List<Map<String, Object>> serializeDailyOffers() {
            return List.of();
        }
    }

    private static class EarthCatalogWithUnownedLeadSiegling extends CardDefinitionService {
        @Override
        public int getDeckBuilderMaxCopies() {
            return 3;
        }

        @Override
        public List<Card> getDeckBuilderCatalog() {
            // Lead with Mossy so a naive "first Earth Siegeling" pick is unowned.
            return List.of(
                    new SieglingCard("mossy", "Mossy", Element.EARTH, Rarity.COMMON, 8, 1, List.of(), Row.FRONT),
                    new SieglingCard("applehead", "Applehead", Element.EARTH, Rarity.COMMON, 6, 2, List.of(), Row.FRONT),
                    new SieglingCard("sleaf", "Sleaf", Element.EARTH, Rarity.COMMON, 5, 3, List.of(), Row.FRONT),
                    new SieglingCard("cacty", "Cacty", Element.EARTH, Rarity.UNCOMMON, 7, 2, List.of(), Row.FRONT),
                    new SpellCard("rootguard", "Root Guard", Element.EARTH, Rarity.COMMON, 1,
                            Ability.damage("Root", "", TargetType.SINGLE_ENEMY, null, 1, 1)),
                    new TrapCard("stonebite", "Stone Bite", Element.EARTH, Rarity.COMMON, Element.EARTH, 2,
                            Ability.damage("Bite", "", TargetType.SINGLE_ENEMY, null, 1, 1))
            );
        }

        @Override
        public TrainerCard getTrainer(Element element) {
            return new TrainerCard(
                    "earth-knight",
                    "Stone Warden",
                    Element.EARTH,
                    Rarity.RARE,
                    Ability.passive("Rooted", "", "hp_boost", 1),
                    Ability.damage("Quake", "", TargetType.SINGLE_ENEMY, null, 1, 2),
                    false
            );
        }
    }

    private static class RecordingProfileSettingsService extends ProfileSettingsService {
        private String lastFavoriteSieglingId = "";

        @Override
        public ProfileSettingsEntity save(AccountUser user, Map<String, Object> req) {
            Object favorite = req.get("favoriteSieglingId");
            lastFavoriteSieglingId = favorite == null ? "" : String.valueOf(favorite);
            if ("mossy".equals(lastFavoriteSieglingId)) {
                throw new IllegalArgumentException("Choose a Siegeling you own.");
            }
            ProfileSettingsEntity settings = new ProfileSettingsEntity();
            settings.setUserId(user.getId());
            settings.setFavoriteElement(String.valueOf(req.getOrDefault("favoriteElement", "EARTH")));
            settings.setFavoriteSiegling(lastFavoriteSieglingId);
            return settings;
        }

        @Override
        public Map<String, Object> serialize(ProfileSettingsEntity settings, AccountUser user) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("favoriteSieglingId", settings.getFavoriteSiegling());
            out.put("favoriteElement", settings.getFavoriteElement());
            return out;
        }
    }
}
