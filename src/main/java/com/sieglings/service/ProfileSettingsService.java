package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.enums.CardType;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.ProfileSettingsStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
public class ProfileSettingsService {
    private static final Set<String> AVATAR_MODES = Set.of("INITIAL", "ELEMENT");

    @Autowired
    private ProfileSettingsStore settingsStore;

    @Autowired
    private AccountUserStore userStore;

    @Autowired
    private PlayerTitleService playerTitleService;

    @Autowired
    private PlayerProgressionService playerProgressionService;

    @Autowired
    private CardDefinitionService cardDefinitionService;

    public ProfileSettingsEntity getOrCreate(AccountUser user) {
        return settingsStore.findByUserId(user.getId()).orElseGet(() -> defaultsFor(user));
    }

    /** Returns serialized settings only when the player has saved profile prefs in Firestore. */
    public Optional<Map<String, Object>> findSerializedIfPresent(AccountUser user) {
        return settingsStore.findByUserId(user.getId()).map(settings -> serialize(settings, user));
    }

    public ProfileSettingsEntity save(AccountUser user, Map<String, Object> req) {
        ProfileSettingsEntity settings = getOrCreate(user);
        PlayerProgressionEntity progression = playerProgressionService.getOrCreate(user);
        if (req.get("displayName") instanceof String displayName && !displayName.isBlank()) {
            String trimmed = trim(displayName, 20);
            settings.setDisplayName(trimmed);
            user.setDisplayName(trimmed);
            userStore.save(user);
        }
        if (req.get("avatarMode") instanceof String avatarMode) {
            String normalized = avatarMode.trim().toUpperCase(Locale.ROOT);
            settings.setAvatarMode(AVATAR_MODES.contains(normalized) ? normalized : "INITIAL");
        }
        if (req.get("avatar") instanceof String avatar) {
            settings.setAvatar(trimAvatar(avatar, settings.getDisplayName() == null ? user.getDisplayName() : settings.getDisplayName()));
        }
        if (req.get("avatarUrl") instanceof String avatarUrl) {
            settings.setAvatarUrl(trim(avatarUrl, 500));
        }
        if (req.containsKey("favoriteElement")) {
            Object favoriteElement = req.get("favoriteElement");
            settings.setFavoriteElement(normalizeElement(favoriteElement == null ? null : String.valueOf(favoriteElement)));
        }
        String requestedTitleId = readString(req, "playerTitleId");
        if (requestedTitleId.isBlank()) {
            requestedTitleId = readString(req, "playerTitle");
        }
        if (!requestedTitleId.isBlank()) {
            String titleId = playerTitleService.migrateLegacyTitleId(requestedTitleId, settings.getFavoriteElement());
            if (!playerTitleService.isTitleUnlocked(user, progression, titleId)) {
                throw new IllegalArgumentException("That player title is locked.");
            }
            settings.setPlayerTitle(titleId);
        }
        if (req.get("bio") instanceof String bio) {
            settings.setBio(trim(bio, 240));
        }
        if (req.get("preferredCardBack") instanceof String preferredCardBack) {
            settings.setPreferredCardBack(trim(preferredCardBack, 60));
        }
        String requestedFavoriteId = readString(req, "favoriteSieglingId");
        if (requestedFavoriteId.isBlank()) {
            requestedFavoriteId = readString(req, "favoriteSiegling");
        }
        if (!requestedFavoriteId.isBlank()) {
            String cardId = resolveFavoriteSieglingId(requestedFavoriteId, progression);
            if (cardId.isBlank()) {
                throw new IllegalArgumentException("Choose a Siegeling you own.");
            }
            settings.setFavoriteSiegling(cardId);
        }
        settings.setUpdatedAt(Instant.now());
        return settingsStore.save(settings);
    }

    public Map<String, Object> serialize(ProfileSettingsEntity settings, AccountUser user) {
        PlayerProgressionEntity progression = playerProgressionService.getOrCreate(user);
        Map<String, Object> out = new LinkedHashMap<>();
        String displayName = settings.getDisplayName();
        if (displayName == null || displayName.isBlank()) {
            displayName = user.getDisplayName();
        }
        out.put("displayName", displayName);
        out.put("avatarMode", normalizeAvatarMode(settings.getAvatarMode()));
        out.put("avatar", settings.getAvatar() == null || settings.getAvatar().isBlank()
                ? trimAvatar("", displayName)
                : settings.getAvatar());
        out.put("avatarUrl", settings.getAvatarUrl() == null ? "" : settings.getAvatarUrl());
        out.put("favoriteElement", normalizeElement(settings.getFavoriteElement()));
        out.put("favoriteElementLabel", toProfileElementLabel(settings.getFavoriteElement()));

        String titleId = playerTitleService.migrateLegacyTitleId(settings.getPlayerTitle(), settings.getFavoriteElement());
        out.put("playerTitleId", titleId);
        out.put("playerTitle", playerTitleService.labelFor(titleId));

        out.put("bio", settings.getBio() == null ? "" : settings.getBio());
        out.put("preferredCardBack", settings.getPreferredCardBack() == null ? "" : settings.getPreferredCardBack());

        String favoriteId = resolveFavoriteSieglingId(settings.getFavoriteSiegling(), progression);
        out.put("favoriteSieglingId", favoriteId);
        Card favoriteCard = findSieglingById(favoriteId).orElse(null);
        out.put("favoriteSiegling", favoriteCard == null ? "" : favoriteCard.getName());
        if (favoriteCard != null) {
            out.put("favoriteSieglingCard", serializeFavoriteCard(favoriteCard, progression));
        }
        out.put("updatedAt", settings.getUpdatedAt() == null ? null : settings.getUpdatedAt().toString());
        return out;
    }

    private Map<String, Object> serializeFavoriteCard(Card card, PlayerProgressionEntity progression) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", card.getId());
        out.put("name", card.getName());
        out.put("type", card.getCardType().name());
        out.put("element", card.getElement().name());
        out.put("rarity", card.getRarity().name());
        out.put("health", card instanceof com.sieglings.model.SieglingCard siegling ? siegling.getHealth() : null);
        out.put("speed", card instanceof com.sieglings.model.SieglingCard siegling ? siegling.getSpeed() : null);
        out.put("owned", progression.getOwnedCards().getOrDefault(card.getId(), 0));
        return out;
    }

    private String resolveFavoriteSieglingId(String rawValue, PlayerProgressionEntity progression) {
        String trimmed = rawValue == null ? "" : rawValue.trim();
        if (trimmed.isBlank()) {
            return firstOwnedSieglingId(progression);
        }
        Optional<Card> byId = findSieglingById(trimmed);
        if (byId.isPresent() && ownsSiegling(progression, byId.get().getId())) {
            return byId.get().getId();
        }
        Optional<Card> byName = findSieglingByName(trimmed);
        if (byName.isPresent() && ownsSiegling(progression, byName.get().getId())) {
            return byName.get().getId();
        }
        return "";
    }

    private String firstOwnedSieglingId(PlayerProgressionEntity progression) {
        return cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(card -> card.getCardType() == CardType.SIEGLING)
                .filter(card -> ownsSiegling(progression, card.getId()))
                .map(Card::getId)
                .findFirst()
                .orElse("");
    }

    private boolean ownsSiegling(PlayerProgressionEntity progression, String cardId) {
        return progression.getOwnedCards().getOrDefault(cardId, 0) > 0;
    }

    private Optional<Card> findSieglingById(String cardId) {
        if (cardId == null || cardId.isBlank()) {
            return Optional.empty();
        }
        return cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(card -> card.getCardType() == CardType.SIEGLING)
                .filter(card -> card.getId().equalsIgnoreCase(cardId.trim()))
                .findFirst();
    }

    private Optional<Card> findSieglingByName(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        return cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(card -> card.getCardType() == CardType.SIEGLING)
                .filter(card -> card.getName().equalsIgnoreCase(name.trim()))
                .findFirst();
    }

    private ProfileSettingsEntity defaultsFor(AccountUser user) {
        ProfileSettingsEntity settings = new ProfileSettingsEntity();
        settings.setUserId(user.getId());
        settings.setDisplayName(user.getDisplayName());
        settings.setAvatarMode("INITIAL");
        settings.setAvatar(trimAvatar("", user.getDisplayName()));
        settings.setFavoriteElement("FIRE");
        settings.setPlayerTitle("title_starter_fire");
        settings.setBio("Ready to tune a deck, open a pack, and make the next match count.");
        settings.setPreferredCardBack("Molten Sigil");
        settings.setFavoriteSiegling("");
        settings.setUpdatedAt(Instant.now());
        return settings;
    }

    private String readString(Map<String, Object> req, String key) {
        if (req == null || !req.containsKey(key)) {
            return "";
        }
        Object value = req.get(key);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String normalizeAvatarMode(String mode) {
        String normalized = mode == null ? "INITIAL" : mode.trim().toUpperCase(Locale.ROOT);
        return AVATAR_MODES.contains(normalized) ? normalized : "INITIAL";
    }

    private String normalizeElement(String element) {
        String normalized = element == null ? "FIRE" : element.trim().toUpperCase(Locale.ROOT);
        if (normalized.isBlank()) {
            return "FIRE";
        }
        return normalized.length() > 20 ? normalized.substring(0, 20) : normalized;
    }

    private String toProfileElementLabel(String element) {
        String normalized = normalizeElement(element);
        if (normalized.isBlank()) {
            return "Fire";
        }
        return normalized.charAt(0) + normalized.substring(1).toLowerCase(Locale.ROOT);
    }

    private String trim(String value, int max) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }

    private String trimAvatar(String value, String displayName) {
        String candidate = value == null || value.isBlank()
                ? String.valueOf(displayName == null || displayName.isBlank() ? "S" : displayName.trim().charAt(0)).toUpperCase(Locale.ROOT)
                : value.trim().toUpperCase(Locale.ROOT);
        return candidate.length() > 4 ? candidate.substring(0, 4) : candidate;
    }
}
