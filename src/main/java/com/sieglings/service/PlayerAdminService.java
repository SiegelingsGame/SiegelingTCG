package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Dashboard admin for registered player accounts: list accounts, load progression,
 * and apply manual balance / collection edits. Mutations require an editor session
 * (enforced by {@link com.sieglings.controller.PlayerAdminController}).
 */
@Service
public class PlayerAdminService {

    private final AccountUserStore userStore;
    private final PlayerProgressionStore progressionStore;
    private final PlayerProgressionService progressionService;

    public PlayerAdminService(AccountUserStore userStore,
                              PlayerProgressionStore progressionStore,
                              PlayerProgressionService progressionService) {
        this.userStore = userStore;
        this.progressionStore = progressionStore;
        this.progressionService = progressionService;
    }

    public Map<String, Object> listPlayers() {
        List<Map<String, Object>> players = new ArrayList<>();
        for (AccountUser user : userStore.findAll()) {
            PlayerProgressionEntity progression = progressionStore.findByUserId(user.getId()).orElse(null);
            players.add(summary(user, progression));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("players", players);
        out.put("count", players.size());
        return out;
    }

    public Map<String, Object> getPlayer(String userId) {
        AccountUser user = requireUser(userId);
        PlayerProgressionEntity progression = progressionService.getOrCreate(user);
        return detail(user, progression);
    }

    /**
     * Applies an editor patch. Supported keys: {@code displayName} on the account;
     * currency, tutorials, starter pack, owned cards, trainer maps, unlock lists,
     * finish lists, and cosmetics on progression. Omitted keys are left unchanged.
     */
    public Map<String, Object> updatePlayer(String userId, Map<String, Object> body) {
        if (body == null) {
            throw new IllegalArgumentException("Request body is required.");
        }
        AccountUser user = requireUser(userId);
        if (body.containsKey("displayName")) {
            String displayName = stringValue(body.get("displayName"));
            if (displayName == null || displayName.isBlank()) {
                throw new IllegalArgumentException("Display name cannot be empty.");
            }
            if (displayName.length() > 40) {
                throw new IllegalArgumentException("Display name must be 40 characters or fewer.");
            }
            user.setDisplayName(displayName.trim());
            userStore.save(user);
        }

        PlayerProgressionEntity progression = progressionService.getOrCreate(user);
        boolean touchedProgression = applyProgressionPatch(progression, body);
        if (touchedProgression) {
            progression.setUpdatedAt(Instant.now());
            progressionStore.save(progression);
        }
        return detail(user, progressionService.getOrCreate(user));
    }

    private boolean applyProgressionPatch(PlayerProgressionEntity progression, Map<String, Object> body) {
        boolean changed = false;
        if (body.containsKey("gold")) {
            progression.setGold(Math.max(0, intValue(body.get("gold"), "gold")));
            changed = true;
        }
        if (body.containsKey("remnants")) {
            progression.setRemnants(Math.max(0, intValue(body.get("remnants"), "remnants")));
            changed = true;
        }
        if (body.containsKey("warmarks")) {
            progression.setWarmarks(Math.max(0, intValue(body.get("warmarks"), "warmarks")));
            changed = true;
        }
        if (body.containsKey("battlegroundsTier")) {
            progression.setBattlegroundsTier(Math.max(0, intValue(body.get("battlegroundsTier"), "battlegroundsTier")));
            changed = true;
        }
        if (body.containsKey("tutorialCompleted")) {
            progression.setTutorialCompleted(booleanValue(body.get("tutorialCompleted")));
            changed = true;
        }
        if (body.containsKey("siegeTutorialCompleted")) {
            progression.setSiegeTutorialCompleted(booleanValue(body.get("siegeTutorialCompleted")));
            changed = true;
        }
        if (body.containsKey("starterPackId")) {
            String starter = stringValue(body.get("starterPackId"));
            progression.setStarterPackId(starter == null || starter.isBlank() ? null : starter.trim());
            changed = true;
        }
        if (body.containsKey("ownedCards")) {
            progression.setOwnedCards(parseOwnedCards(body.get("ownedCards")));
            changed = true;
        }
        if (body.containsKey("trainerLevels")) {
            progression.setTrainerLevels(parseIntMap(body.get("trainerLevels"), "trainerLevels"));
            changed = true;
        }
        if (body.containsKey("trainerPoints")) {
            progression.setTrainerPoints(parseIntMap(body.get("trainerPoints"), "trainerPoints"));
            changed = true;
        }
        if (body.containsKey("purchasedDeckIds")) {
            progression.setPurchasedDeckIds(parseIdList(body.get("purchasedDeckIds")));
            changed = true;
        }
        if (body.containsKey("purchasedTitleIds")) {
            progression.setPurchasedTitleIds(parseIdList(body.get("purchasedTitleIds")));
            changed = true;
        }
        if (body.containsKey("purchasedBattlefieldSkinIds")) {
            progression.setPurchasedBattlefieldSkinIds(parseIdList(body.get("purchasedBattlefieldSkinIds")));
            changed = true;
        }
        if (body.containsKey("equippedBattlefieldSkinId")) {
            progression.setEquippedBattlefieldSkinId(stringValue(body.get("equippedBattlefieldSkinId")));
            changed = true;
        }
        if (body.containsKey("battlegroundsUnlocks")) {
            progression.setBattlegroundsUnlocks(parseIdList(body.get("battlegroundsUnlocks")));
            changed = true;
        }
        if (body.containsKey("siegeUnlockedKnights")) {
            progression.setSiegeUnlockedKnights(parseIdList(body.get("siegeUnlockedKnights")));
            changed = true;
        }
        if (body.containsKey("siegeUnlockedSieglings")) {
            progression.setSiegeUnlockedSieglings(parseIdList(body.get("siegeUnlockedSieglings")));
            changed = true;
        }
        if (body.containsKey("holographicCardIds")) {
            progression.setHolographicCardIds(parseIdList(body.get("holographicCardIds")));
            changed = true;
        }
        if (body.containsKey("holoArtCardIds")) {
            progression.setHoloArtCardIds(parseIdList(body.get("holoArtCardIds")));
            changed = true;
        }
        if (body.containsKey("plainHoloCardIds")) {
            progression.setPlainHoloCardIds(parseIdList(body.get("plainHoloCardIds")));
            changed = true;
        }
        if (body.containsKey("goldCardIds")) {
            progression.setGoldCardIds(parseIdList(body.get("goldCardIds")));
            changed = true;
        }
        if (body.containsKey("holoGoldCardIds")) {
            progression.setHoloGoldCardIds(parseIdList(body.get("holoGoldCardIds")));
            changed = true;
        }
        if (body.containsKey("soloWinStreak")) {
            progression.setSoloWinStreak(Math.max(0, intValue(body.get("soloWinStreak"), "soloWinStreak")));
            changed = true;
        }
        if (body.containsKey("onlineWinStreak")) {
            progression.setOnlineWinStreak(Math.max(0, intValue(body.get("onlineWinStreak"), "onlineWinStreak")));
            changed = true;
        }
        if (body.containsKey("craftCount")) {
            progression.setCraftCount(Math.max(0, intValue(body.get("craftCount"), "craftCount")));
            changed = true;
        }
        return changed;
    }

    private AccountUser requireUser(String userId) {
        String id = userId == null ? "" : userId.trim().toLowerCase(Locale.ROOT);
        if (id.isBlank()) {
            throw new IllegalArgumentException("Player id is required.");
        }
        return userStore.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("No registered account for " + id + "."));
    }

    private Map<String, Object> summary(AccountUser user, PlayerProgressionEntity progression) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", user.getId());
        row.put("email", user.getEmail());
        row.put("displayName", user.getDisplayName());
        row.put("createdAt", user.getCreatedAt() == null ? null : user.getCreatedAt().toString());
        row.put("gold", progression == null ? 0 : progression.getGold());
        row.put("remnants", progression == null ? 0 : progression.getRemnants());
        row.put("warmarks", progression == null ? 0 : progression.getWarmarks());
        row.put("ownedCardCount", progression == null ? 0 : ownedCopyCount(progression));
        row.put("uniqueOwned", progression == null ? 0 : uniqueOwned(progression));
        row.put("starterChosen", progression != null
                && progression.getStarterPackId() != null
                && !progression.getStarterPackId().isBlank());
        return row;
    }

    private Map<String, Object> detail(AccountUser user, PlayerProgressionEntity progression) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("account", Map.of(
                "id", user.getId(),
                "email", Objects.toString(user.getEmail(), ""),
                "displayName", Objects.toString(user.getDisplayName(), ""),
                "createdAt", user.getCreatedAt() == null ? "" : user.getCreatedAt().toString(),
                "friendCount", user.getFriendEmails() == null ? 0 : user.getFriendEmails().size()
        ));
        // Reuse the player-facing serialize for catalog-aware fields, then layer the
        // raw editable maps the dashboard form needs (trainer levels, finish lists, etc.).
        Map<String, Object> progressionView = new LinkedHashMap<>(progressionService.serialize(progression, user));
        progressionView.put("warmarks", progression.getWarmarks());
        progressionView.put("battlegroundsTier", progression.getBattlegroundsTier());
        progressionView.put("battlegroundsUnlocks", progression.getBattlegroundsUnlocks());
        progressionView.put("trainerLevels", progression.getTrainerLevels());
        progressionView.put("trainerPoints", progression.getTrainerPoints());
        progressionView.put("siegeUnlockedKnights", progression.getSiegeUnlockedKnights());
        progressionView.put("siegeUnlockedSieglings", progression.getSiegeUnlockedSieglings());
        progressionView.put("holographicCardIds", progression.getHolographicCardIds());
        progressionView.put("holoArtCardIds", progression.getHoloArtCardIds());
        progressionView.put("plainHoloCardIds", progression.getPlainHoloCardIds());
        progressionView.put("goldCardIds", progression.getGoldCardIds());
        progressionView.put("holoGoldCardIds", progression.getHoloGoldCardIds());
        progressionView.put("updatedAt", progression.getUpdatedAt() == null ? null : progression.getUpdatedAt().toString());
        out.put("progression", progressionView);
        return out;
    }

    private static int ownedCopyCount(PlayerProgressionEntity progression) {
        int total = 0;
        for (Integer count : progression.getOwnedCards().values()) {
            if (count != null && count > 0) {
                total += count;
            }
        }
        return total;
    }

    private static int uniqueOwned(PlayerProgressionEntity progression) {
        int total = 0;
        for (Integer count : progression.getOwnedCards().values()) {
            if (count != null && count > 0) {
                total += 1;
            }
        }
        return total;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Integer> parseOwnedCards(Object raw) {
        if (raw == null) {
            return new LinkedHashMap<>();
        }
        if (raw instanceof Map<?, ?> map) {
            return parseIntMap(map, "ownedCards");
        }
        if (raw instanceof String text) {
            Map<String, Integer> out = new LinkedHashMap<>();
            for (String line : text.split("[,\\n]+")) {
                String trimmed = line.trim();
                if (trimmed.isEmpty()) {
                    continue;
                }
                String[] parts = trimmed.split("[\\s:=]+");
                if (parts.length < 2) {
                    throw new IllegalArgumentException(
                            "Owned cards must be lines of \"cardId count\" (got: " + trimmed + ").");
                }
                String cardId = parts[0].trim();
                int count;
                try {
                    count = Integer.parseInt(parts[1].trim());
                } catch (NumberFormatException ex) {
                    throw new IllegalArgumentException("Owned card count must be a whole number for " + cardId + ".");
                }
                if (!cardId.isBlank() && count > 0) {
                    out.put(cardId, count);
                }
            }
            return out;
        }
        throw new IllegalArgumentException("ownedCards must be an object or text map.");
    }

    private static Map<String, Integer> parseIntMap(Object raw, String field) {
        if (raw == null) {
            return new LinkedHashMap<>();
        }
        if (!(raw instanceof Map<?, ?> map)) {
            throw new IllegalArgumentException(field + " must be an object of id → number.");
        }
        Map<String, Integer> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getKey() == null) {
                continue;
            }
            String key = String.valueOf(entry.getKey()).trim();
            if (key.isBlank()) {
                continue;
            }
            out.put(key, Math.max(0, intValue(entry.getValue(), field + "." + key)));
        }
        return out;
    }

    private static List<String> parseIdList(Object raw) {
        if (raw == null) {
            return new ArrayList<>();
        }
        List<String> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                String id = stringValue(item);
                if (id != null && !id.isBlank() && !out.contains(id.trim())) {
                    out.add(id.trim());
                }
            }
            return out;
        }
        if (raw instanceof String text) {
            for (String chunk : text.split("[,\\n]+")) {
                String id = chunk.trim();
                if (!id.isBlank() && !out.contains(id)) {
                    out.add(id);
                }
            }
            return out;
        }
        throw new IllegalArgumentException("Expected a list or comma/newline-separated ids.");
    }

    private static int intValue(Object raw, String field) {
        if (raw instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(raw).trim());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException(field + " must be a whole number.");
        }
    }

    private static boolean booleanValue(Object raw) {
        if (raw instanceof Boolean bool) {
            return bool;
        }
        String text = String.valueOf(raw).trim().toLowerCase(Locale.ROOT);
        if ("true".equals(text) || "1".equals(text) || "yes".equals(text)) {
            return true;
        }
        if ("false".equals(text) || "0".equals(text) || "no".equals(text)) {
            return false;
        }
        throw new IllegalArgumentException("Expected a boolean value.");
    }

    private static String stringValue(Object raw) {
        return raw == null ? null : String.valueOf(raw);
    }
}
