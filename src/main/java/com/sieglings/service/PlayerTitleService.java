package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.persistence.firestore.ProfileSettingsStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class PlayerTitleService {

    @Autowired
    private PlayerTitleCatalogService titleCatalogService;

    // @Lazy breaks the startup bean cycle PlayerProgressionService →
    // PlayerTitleService → AchievementEvaluationService → SavedDeckService →
    // PlayerProgressionService. Achievement state is only consulted at request
    // time (resolving title-unlock status), so a lazy proxy here is safe and
    // lets the application context refresh.
    @Autowired
    @Lazy
    private AchievementEvaluationService achievementEvaluationService;

    @Autowired
    private ProfileSettingsStore profileSettingsStore;

    public List<Map<String, Object>> serializeTitlesForUser(AccountUser user, PlayerProgressionEntity progression) {
        ProfileSettingsEntity settings = loadSettings(user);
        List<String> unlockedIds = resolveUnlockedTitleIds(user, progression, settings);
        List<Map<String, Object>> out = new ArrayList<>();
        for (PlayerTitleCatalogService.TitleDefinition def : titleCatalogService.listDefinitions()) {
            out.add(titleCatalogService.serializeDefinition(def, unlockedIds.contains(def.id())));
        }
        return out;
    }

    public List<String> resolveUnlockedTitleIds(AccountUser user,
                                                PlayerProgressionEntity progression,
                                                ProfileSettingsEntity settings) {
        List<String> unlocked = new ArrayList<>();
        if (progression.getPurchasedTitleIds() != null) {
            for (String titleId : progression.getPurchasedTitleIds()) {
                if (titleId != null && !titleId.isBlank()) {
                    unlocked.add(titleId.trim().toLowerCase(Locale.ROOT));
                }
            }
        }
        String starterElement = starterElementFromPack(progression.getStarterPackId());
        for (PlayerTitleCatalogService.TitleDefinition def : titleCatalogService.listDefinitions()) {
            if (unlocked.contains(def.id())) {
                continue;
            }
            if (isDefinitionUnlocked(user, def, progression, settings, starterElement)) {
                unlocked.add(def.id());
            }
        }
        return unlocked;
    }

    public boolean isTitleUnlocked(AccountUser user, PlayerProgressionEntity progression, String titleId) {
        ProfileSettingsEntity settings = loadSettings(user);
        String normalized = normalizeTitleId(titleId);
        if (progression.getPurchasedTitleIds().contains(normalized)) {
            return true;
        }
        return titleCatalogService.findById(normalized)
                .map(def -> isDefinitionUnlocked(
                        user,
                        def,
                        progression,
                        settings,
                        starterElementFromPack(progression.getStarterPackId())))
                .orElse(false);
    }

    public Optional<PlayerTitleCatalogService.TitleDefinition> findDefinition(String titleId) {
        return titleCatalogService.findById(normalizeTitleId(titleId));
    }

    public String labelFor(String titleId) {
        if (titleId == null || titleId.isBlank()) {
            return "";
        }
        Optional<PlayerTitleCatalogService.TitleDefinition> def = titleCatalogService.findById(titleId);
        if (def.isPresent()) {
            return def.get().label();
        }
        return titleId.trim();
    }

    public PlayerProgressionEntity applyTitlePurchase(AccountUser user, PlayerProgressionEntity progression, String titleId) {
        if (progression.getStarterPackId() == null || progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Choose a starter pack before buying titles.");
        }
        PlayerTitleCatalogService.TitleDefinition def = titleCatalogService.findById(titleId)
                .orElseThrow(() -> new IllegalArgumentException("Title not found."));
        if (def.source() != PlayerTitleCatalogService.Source.SHOP) {
            throw new IllegalArgumentException("That title cannot be purchased.");
        }
        String normalized = def.id();
        if (isTitleUnlocked(user, progression, normalized)) {
            return progression;
        }
        if (progression.getGold() < def.shopPrice()) {
            throw new IllegalArgumentException("Not enough Siegecoins for that title.");
        }
        progression.setGold(progression.getGold() - def.shopPrice());
        List<String> purchased = new ArrayList<>(progression.getPurchasedTitleIds());
        if (!purchased.contains(normalized)) {
            purchased.add(normalized);
        }
        progression.setPurchasedTitleIds(purchased);
        return progression;
    }

    private boolean isDefinitionUnlocked(AccountUser user,
                                         PlayerTitleCatalogService.TitleDefinition def,
                                         PlayerProgressionEntity progression,
                                         ProfileSettingsEntity settings,
                                         String starterElement) {
        return switch (def.source()) {
            case SHOP -> progression.getPurchasedTitleIds().contains(def.id());
            case STARTER -> starterElement != null
                    && def.starterElement() != null
                    && starterElement.equalsIgnoreCase(def.starterElement());
            case KNIGHT -> def.knightId() != null
                    && progression.getTrainerLevels().containsKey(def.knightId());
            case ACHIEVEMENT -> def.achievementId() != null
                    && achievementEvaluationService.isUnlocked(user, def.achievementId(), progression, settings);
        };
    }

    private ProfileSettingsEntity loadSettings(AccountUser user) {
        if (user == null || user.getId() == null || user.getId().isBlank()) {
            return null;
        }
        return profileSettingsStore.findByUserId(user.getId()).orElse(null);
    }

    private String starterElementFromPack(String packId) {
        if (packId == null || packId.isBlank() || !packId.startsWith("pack_")) {
            return null;
        }
        String element = packId.substring("pack_".length()).split("_")[0].toUpperCase(Locale.ROOT);
        if ("WATER".equals(element)) {
            return "ICE";
        }
        return element.isBlank() ? null : element;
    }

    public String normalizeTitleId(String titleId) {
        return titleId == null ? "" : titleId.trim().toLowerCase(Locale.ROOT);
    }

    /** Resolve a legacy free-text title to a catalog id when possible. */
    public String migrateLegacyTitleId(String rawTitle, String favoriteElement) {
        String trimmed = rawTitle == null ? "" : rawTitle.trim();
        if (trimmed.isBlank()) {
            return defaultStarterTitleId(favoriteElement);
        }
        if (titleCatalogService.findById(trimmed).isPresent()) {
            return normalizeTitleId(trimmed);
        }
        for (PlayerTitleCatalogService.TitleDefinition def : titleCatalogService.listDefinitions()) {
            if (def.label().equalsIgnoreCase(trimmed)) {
                return def.id();
            }
        }
        String normalizedLabel = trimmed.toLowerCase(Locale.ROOT);
        if (normalizedLabel.contains("blazing")) {
            return "title_starter_fire";
        }
        if (normalizedLabel.contains("mossgold")) {
            return "title_starter_earth";
        }
        if (normalizedLabel.contains("gale")) {
            return "title_starter_wind";
        }
        if (normalizedLabel.contains("frost")) {
            return "title_starter_ice";
        }
        return defaultStarterTitleId(favoriteElement);
    }

    public String defaultStarterTitleId(String favoriteElement) {
        String element = favoriteElement == null ? "FIRE" : favoriteElement.trim().toUpperCase(Locale.ROOT);
        return switch (element) {
            case "EARTH" -> "title_starter_earth";
            case "WIND" -> "title_starter_wind";
            case "ICE", "WATER" -> "title_starter_ice";
            default -> "title_starter_fire";
        };
    }
}
