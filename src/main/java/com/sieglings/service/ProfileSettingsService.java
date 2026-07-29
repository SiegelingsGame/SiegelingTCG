package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.TrainerCard;
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
    private record FavoriteSelection(String id, String variant) {}

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
        if (req.containsKey("profileArtId")) {
            settings.setProfileArtId(trim(readString(req, "profileArtId"), 120));
        }
        if (req.containsKey("pageArtId")) {
            settings.setPageArtId(trim(readString(req, "pageArtId"), 120));
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
        String requestedFavoriteId = readString(req, "favoriteCardId");
        if (requestedFavoriteId.isBlank()) {
            requestedFavoriteId = readString(req, "favoriteSieglingId");
        }
        if (requestedFavoriteId.isBlank()) {
            requestedFavoriteId = readString(req, "favoriteSiegling");
        }
        if (!requestedFavoriteId.isBlank()) {
            FavoriteSelection requested = parseFavoriteSelection(requestedFavoriteId,
                    readString(req, "favoriteCardVariant"));
            Optional<Card> favorite = findFavoriteById(requested.id());
            if (favorite.isEmpty() || !ownsFavorite(progression, favorite.get())) {
                throw new IllegalArgumentException("Choose a card you own.");
            }
            String variant = hasHolographicVariant(favorite.get(), progression)
                    && "HOLOGRAPHIC".equals(requested.variant()) ? "HOLOGRAPHIC" : "STANDARD";
            settings.setFavoriteCardId(favorite.get().getId());
            settings.setFavoriteCardVariant(variant);
            // Keep the old field populated for existing achievement/profile clients,
            // while the new fields support SiegeKnights and card finishes.
            settings.setFavoriteSiegling(favorite.get().getCardType() == CardType.SIEGLING
                    ? favorite.get().getId() : "");
        }
        if (req.containsKey("featuredBadgeIds") && req.get("featuredBadgeIds") instanceof List<?> raw) {
            List<String> featured = new java.util.ArrayList<>();
            for (Object item : raw) {
                if (item == null) {
                    continue;
                }
                String id = String.valueOf(item).trim().toLowerCase(Locale.ROOT);
                if (!id.isBlank() && !featured.contains(id) && featured.size() < 6) {
                    featured.add(id);
                }
            }
            settings.setFeaturedBadgeIds(featured);
        }
        if (req.containsKey("favoriteCardIds") && req.get("favoriteCardIds") instanceof List<?> rawCards) {
            List<String> requested = new java.util.ArrayList<>();
            for (Object item : rawCards) {
                if (item == null) {
                    continue;
                }
                String id = String.valueOf(item).trim();
                if (!id.isBlank() && requested.stream().noneMatch(existing -> existing.equalsIgnoreCase(id))) {
                    requested.add(id);
                }
                if (requested.size() >= 3) {
                    break;
                }
            }
            List<String> favorites = resolveFavoriteCardIds(requested, progression);
            if (favorites.size() != requested.size()) {
                throw new IllegalArgumentException("Choose cards you own for your collection favorites.");
            }
            settings.setFavoriteCardIds(favorites);
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
        out.put("profileArtId", settings.getProfileArtId() == null ? "" : settings.getProfileArtId());
        out.put("pageArtId", settings.getPageArtId() == null ? "" : settings.getPageArtId());

        String titleId = playerTitleService.migrateLegacyTitleId(settings.getPlayerTitle(), settings.getFavoriteElement());
        out.put("playerTitleId", titleId);
        out.put("playerTitle", playerTitleService.labelFor(titleId));

        out.put("bio", settings.getBio() == null ? "" : settings.getBio());
        out.put("preferredCardBack", settings.getPreferredCardBack() == null ? "" : settings.getPreferredCardBack());

        FavoriteSelection selection = resolveFavoriteSelection(settings, progression);
        out.put("favoriteCardId", selection.id());
        out.put("favoriteCardVariant", selection.variant());
        out.put("favoriteSieglingId", selection.id().isBlank() || !isSieglingId(selection.id()) ? "" : selection.id());
        Card favoriteCard = findFavoriteById(selection.id()).orElse(null);
        out.put("favoriteSiegling", favoriteCard == null || favoriteCard.getCardType() != CardType.SIEGLING
                ? "" : favoriteCard.getName());
        if (favoriteCard != null) {
            out.put("favoriteSieglingCard", serializeFavoriteCard(favoriteCard, progression, selection.variant()));
        }
        out.put("featuredBadgeIds", settings.getFeaturedBadgeIds() == null ? List.of() : settings.getFeaturedBadgeIds());
        out.put("favoriteCardIds", resolveFavoriteCardIds(settings.getFavoriteCardIds(), progression));
        out.put("updatedAt", settings.getUpdatedAt() == null ? null : settings.getUpdatedAt().toString());
        return out;
    }

    /** Keep only owned favorites (max 3), preserving player order. */
    private List<String> resolveFavoriteCardIds(List<String> requested, PlayerProgressionEntity progression) {
        if (requested == null || requested.isEmpty()) {
            return List.of();
        }
        List<String> resolved = new java.util.ArrayList<>();
        for (String raw : requested) {
            if (raw == null || raw.isBlank() || resolved.size() >= 3) {
                continue;
            }
            String match = progression.getOwnedCards().entrySet().stream()
                    .filter(entry -> entry.getKey() != null
                            && entry.getKey().equalsIgnoreCase(raw.trim())
                            && entry.getValue() != null
                            && entry.getValue() > 0)
                    .map(Map.Entry::getKey)
                    .findFirst()
                    .orElse("");
            if (!match.isBlank() && !resolved.contains(match)) {
                resolved.add(match);
            }
        }
        return resolved;
    }

    private Map<String, Object> serializeFavoriteCard(Card card, PlayerProgressionEntity progression, String variant) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", card.getId());
        out.put("name", card.getName());
        out.put("type", card instanceof TrainerCard ? "SIEGEKNIGHT" : card.getCardType().name());
        out.put("element", card.getElement().name());
        out.put("rarity", card.getRarity().name());
        out.put("health", card instanceof com.sieglings.model.SieglingCard siegling ? siegling.getHealth() : null);
        out.put("speed", card instanceof com.sieglings.model.SieglingCard siegling ? siegling.getSpeed() : null);
        out.put("tier", card instanceof TrainerCard trainer ? trainer.getTier() : null);
        out.put("owned", ownsFavorite(progression, card) ? 1 : 0);
        out.put("cardArtUrl", card.getCardArtUrl());
        out.put("cardArtMode", card.getCardArtMode());
        out.put("cardArtOffsetX", card.getCardArtOffsetX());
        out.put("cardArtOffsetY", card.getCardArtOffsetY());
        out.put("cardArtOffsetXPct", card.getCardArtOffsetXPct());
        out.put("cardArtOffsetYPct", card.getCardArtOffsetYPct());
        out.put("cardArtScale", card.getCardArtScale());
        out.put("cardArtRotation", card.getCardArtRotation());
        out.put("holographicCardArtUrl", card.getHolographicCardArtUrl());
        out.put("holographicCardArtScale", card.getHolographicCardArtScale());
        out.put("holographic", "HOLOGRAPHIC".equals(normalizeCardVariant(variant)));
        out.put("description", card.getDescription());
        return out;
    }

    private FavoriteSelection resolveFavoriteSelection(ProfileSettingsEntity settings,
                                                        PlayerProgressionEntity progression) {
        String rawId = settings.getFavoriteCardId();
        if (rawId == null || rawId.isBlank()) {
            rawId = settings.getFavoriteSiegling();
        }
        FavoriteSelection requested = parseFavoriteSelection(rawId, settings.getFavoriteCardVariant());
        Optional<Card> selected = findFavoriteById(requested.id());
        if (selected.isPresent() && ownsFavorite(progression, selected.get())) {
            String variant = hasHolographicVariant(selected.get(), progression)
                    && "HOLOGRAPHIC".equals(requested.variant()) ? "HOLOGRAPHIC" : "STANDARD";
            return new FavoriteSelection(selected.get().getId(), variant);
        }
        String fallback = firstOwnedFavoriteId(progression);
        return fallback.isBlank() ? new FavoriteSelection("", "STANDARD")
                : new FavoriteSelection(fallback, "STANDARD");
    }

    private FavoriteSelection parseFavoriteSelection(String rawId, String rawVariant) {
        String trimmed = rawId == null ? "" : rawId.trim();
        String variant = normalizeCardVariant(rawVariant);
        int separator = trimmed.indexOf("::");
        if (separator > 0) {
            variant = normalizeCardVariant(trimmed.substring(separator + 2));
            trimmed = trimmed.substring(0, separator).trim();
        }
        return new FavoriteSelection(trimmed, variant);
    }

    private String normalizeCardVariant(String variant) {
        return "HOLOGRAPHIC".equalsIgnoreCase(variant) ? "HOLOGRAPHIC" : "STANDARD";
    }

    private String firstOwnedFavoriteId(PlayerProgressionEntity progression) {
        Optional<String> card = cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(item -> item.getCardType() == CardType.SIEGLING)
                .filter(item -> ownsFavorite(progression, item))
                .map(Card::getId)
                .findFirst();
        if (card.isPresent()) return card.get();
        return cardDefinitionService.getTrainerOptions().stream()
                .filter(item -> ownsFavorite(progression, item))
                .map(Card::getId)
                .findFirst().orElse("");
    }

    private boolean ownsFavorite(PlayerProgressionEntity progression, Card card) {
        if (card == null || progression == null) return false;
        if (card.getCardType() == CardType.TRAINER) {
            return progression.getTrainerLevels().getOrDefault(card.getId().toLowerCase(Locale.ROOT), 0) > 0;
        }
        return progression.getOwnedCards().getOrDefault(card.getId(), 0) > 0;
    }

    private boolean hasHolographicVariant(Card card, PlayerProgressionEntity progression) {
        if (card == null) return false;
        if (card.isHolographic()) {
            return true;
        }
        List<String> ownedHolographic = progression == null || progression.getHolographicCardIds() == null
                ? List.of() : progression.getHolographicCardIds();
        return ownedHolographic.stream().anyMatch(id -> id != null && id.equalsIgnoreCase(card.getId()));
    }

    private boolean isSieglingId(String cardId) {
        return findSieglingById(cardId).isPresent();
    }

    private Optional<Card> findFavoriteById(String cardId) {
        if (cardId == null || cardId.isBlank()) {
            return Optional.empty();
        }
        Optional<Card> card = cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(item -> item.getCardType() == CardType.SIEGLING)
                .filter(item -> item.getId().equalsIgnoreCase(cardId.trim()))
                .findFirst();
        if (card.isPresent()) return card;
        return cardDefinitionService.getTrainerOptions().stream()
                .filter(item -> item.getId().equalsIgnoreCase(cardId.trim()))
                .map(item -> (Card) item)
                .findFirst();
    }

    private Optional<Card> findSieglingById(String cardId) {
        return cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(card -> card.getCardType() == CardType.SIEGLING)
                .filter(card -> card.getId().equalsIgnoreCase(cardId == null ? "" : cardId.trim()))
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
        settings.setFavoriteCardId("");
        settings.setFavoriteCardVariant("STANDARD");
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
