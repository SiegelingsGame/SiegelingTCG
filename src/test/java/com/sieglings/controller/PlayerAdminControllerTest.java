package com.sieglings.controller;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.PlayerAdminService;
import com.sieglings.service.PlayerProgressionService;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Dashboard Players admin: list/detail/update behind editor auth, with in-memory
 * stores so Firestore is not required for the contract checks.
 */
class PlayerAdminControllerTest {

    private final Map<String, AccountUser> users = new ConcurrentHashMap<>();
    private final Map<String, PlayerProgressionEntity> progressions = new ConcurrentHashMap<>();
    private final AtomicReference<String> lastSavedUserId = new AtomicReference<>();

    @Test
    void listAndDetailRequireEditorAuth() {
        seedPlayer("aria@example.com", "Aria", 250, Map.of("siegling_ember", 2));

        PlayerAdminController locked = controller(false);
        assertThrows(IllegalArgumentException.class, () -> locked.listPlayers("bad"));
        assertThrows(IllegalArgumentException.class, () -> locked.getPlayer("bad", "aria@example.com"));

        Map<String, Object> listed = controller(true).listPlayers("good");
        assertEquals(1, listed.get("count"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> players = (List<Map<String, Object>>) listed.get("players");
        assertEquals("aria@example.com", players.get(0).get("id"));
        assertEquals(250, players.get(0).get("gold"));
        assertEquals(2, players.get(0).get("ownedCardCount"));

        Map<String, Object> detail = controller(true).getPlayer("good", "aria@example.com");
        @SuppressWarnings("unchecked")
        Map<String, Object> account = (Map<String, Object>) detail.get("account");
        @SuppressWarnings("unchecked")
        Map<String, Object> progression = (Map<String, Object>) detail.get("progression");
        assertEquals("Aria", account.get("displayName"));
        assertEquals(250, progression.get("gold"));
        assertEquals(2, ((Map<?, ?>) progression.get("ownedCards")).get("siegling_ember"));
    }

    @Test
    void updatePatchesBalanceCollectionAndDisplayName() {
        seedPlayer("bo@example.com", "Bo", 100, Map.of("siegling_ember", 1));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("displayName", "Bo Updated");
        body.put("gold", 999);
        body.put("remnants", 40);
        body.put("ownedCards", "siegling_ember 3\nsiegling_frost 1");
        body.put("purchasedDeckIds", "deck_fire, deck_ice");
        body.put("tutorialCompleted", true);

        Map<String, Object> saved = controller(true).updatePlayer("good", "bo@example.com", body);
        assertEquals("bo@example.com", lastSavedUserId.get());

        @SuppressWarnings("unchecked")
        Map<String, Object> account = (Map<String, Object>) saved.get("account");
        @SuppressWarnings("unchecked")
        Map<String, Object> progression = (Map<String, Object>) saved.get("progression");
        assertEquals("Bo Updated", account.get("displayName"));
        assertEquals(999, progression.get("gold"));
        assertEquals(40, progression.get("remnants"));
        assertEquals(true, progression.get("tutorialCompleted"));
        assertEquals(3, ((Map<?, ?>) progression.get("ownedCards")).get("siegling_ember"));
        assertEquals(1, ((Map<?, ?>) progression.get("ownedCards")).get("siegling_frost"));
        assertTrue(((List<?>) progression.get("purchasedDeckIds")).contains("deck_fire"));
        assertEquals("Bo Updated", users.get("bo@example.com").getDisplayName());
        assertEquals(999, progressions.get("bo@example.com").getGold());
    }

    @Test
    void unknownPlayerAndEmptyDisplayNameAreRejected() {
        seedPlayer("cy@example.com", "Cy", 10, Map.of());
        PlayerAdminController controller = controller(true);
        assertThrows(IllegalArgumentException.class, () -> controller.getPlayer("good", "missing@example.com"));
        assertThrows(IllegalArgumentException.class,
                () -> controller.updatePlayer("good", "cy@example.com", Map.of("displayName", "  ")));
    }

    private void seedPlayer(String email, String displayName, int gold, Map<String, Integer> owned) {
        AccountUser user = new AccountUser();
        user.setId(email);
        user.setEmail(email);
        user.setDisplayName(displayName);
        user.setPasswordHash("hash");
        user.setCreatedAt(Instant.parse("2026-01-15T12:00:00Z"));
        users.put(email, user);

        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId(email);
        progression.setGold(gold);
        progression.setOwnedCards(new LinkedHashMap<>(owned));
        progressions.put(email, progression);
    }

    private PlayerAdminController controller(boolean signedIn) {
        AccountUserStore userStore = new AccountUserStore() {
            @Override
            public Optional<AccountUser> findById(String id) {
                return Optional.ofNullable(users.get(id == null ? null : id.trim().toLowerCase()));
            }

            @Override
            public List<AccountUser> findAll() {
                return users.values().stream().toList();
            }

            @Override
            public AccountUser save(AccountUser user) {
                users.put(user.getId(), user);
                return user;
            }
        };

        PlayerProgressionStore progressionStore = new PlayerProgressionStore() {
            @Override
            public Optional<PlayerProgressionEntity> findByUserId(String userId) {
                return Optional.ofNullable(progressions.get(userId));
            }

            @Override
            public PlayerProgressionEntity save(PlayerProgressionEntity progression) {
                progressions.put(progression.getUserId(), progression);
                lastSavedUserId.set(progression.getUserId());
                return progression;
            }
        };

        PlayerProgressionService progressionService = new PlayerProgressionService() {
            @Override
            public PlayerProgressionEntity getOrCreate(AccountUser user) {
                return progressions.computeIfAbsent(user.getId(), id -> {
                    PlayerProgressionEntity created = new PlayerProgressionEntity();
                    created.setUserId(id);
                    created.setGold(PlayerProgressionService.STARTING_GOLD);
                    return created;
                });
            }

            @Override
            public Map<String, Object> serialize(PlayerProgressionEntity progression, AccountUser user) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("gold", progression.getGold());
                out.put("remnants", progression.getRemnants());
                out.put("ownedCards", progression.getOwnedCards());
                out.put("tutorialCompleted", progression.isTutorialCompleted());
                out.put("siegeTutorialCompleted", progression.isSiegeTutorialCompleted());
                out.put("purchasedDeckIds", progression.getPurchasedDeckIds());
                out.put("starterPackId", progression.getStarterPackId());
                out.put("ownedTotal", progression.getOwnedCards().values().stream()
                        .filter(v -> v != null && v > 0).mapToInt(Integer::intValue).sum());
                out.put("uniqueOwned", progression.getOwnedCards().values().stream()
                        .filter(v -> v != null && v > 0).count());
                return out;
            }
        };

        PlayerAdminService service = new PlayerAdminService(userStore, progressionStore, progressionService);
        CardEditorAuthService auth = new CardEditorAuthService(null, "admins", "sessions", 30) {
            @Override
            public EditorIdentity requireEditor(String token) {
                if (!signedIn) {
                    throw new IllegalArgumentException("Sign in to publish live card data.");
                }
                return new EditorIdentity("editor@example.com", "Editor");
            }
        };
        return new PlayerAdminController(service, auth);
    }
}
