package com.sieglings.persistence.entity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class ProfileSettingsEntity {
    private String userId;
    private String displayName;
    /** INITIAL or ELEMENT */
    private String avatarMode = "INITIAL";
    private String avatar = "";
    private String avatarUrl = "";
    private String favoriteElement = "FIRE";
    /** Art gallery piece id used as the profile card background image; blank = default. */
    private String profileArtId = "";
    /** Art gallery piece id used as the page background image; blank = default. */
    private String pageArtId = "";
    private String playerTitle = "";
    private String bio = "";
    private String preferredCardBack = "";
    /** The owned Siegeling or SiegeKnight shown in the profile favorite slot. */
    private String favoriteCardId = "";
    /** STANDARD or HOLOGRAPHIC when the selected card supports a holo finish. */
    private String favoriteCardVariant = "STANDARD";
    /** Legacy Siegeling-only field retained for older profile clients. */
    private String favoriteSiegling = "";
    /** Achievement ids the player has chosen to feature on their profile badge case (max 6). */
    private List<String> featuredBadgeIds = new ArrayList<>();
    /** Owned card ids showcased in the profile collection snapshot (max 3). Empty = rarest owned. */
    private List<String> favoriteCardIds = new ArrayList<>();
    private Instant updatedAt = Instant.now();

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getAvatarMode() { return avatarMode; }
    public void setAvatarMode(String avatarMode) { this.avatarMode = avatarMode; }
    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }
    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
    public String getFavoriteElement() { return favoriteElement; }
    public void setFavoriteElement(String favoriteElement) { this.favoriteElement = favoriteElement; }
    public String getProfileArtId() { return profileArtId; }
    public void setProfileArtId(String profileArtId) { this.profileArtId = profileArtId; }
    public String getPageArtId() { return pageArtId; }
    public void setPageArtId(String pageArtId) { this.pageArtId = pageArtId; }
    public String getPlayerTitle() { return playerTitle; }
    public void setPlayerTitle(String playerTitle) { this.playerTitle = playerTitle; }
    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }
    public String getPreferredCardBack() { return preferredCardBack; }
    public void setPreferredCardBack(String preferredCardBack) { this.preferredCardBack = preferredCardBack; }
    public String getFavoriteCardId() { return favoriteCardId; }
    public void setFavoriteCardId(String favoriteCardId) { this.favoriteCardId = favoriteCardId; }
    public String getFavoriteCardVariant() { return favoriteCardVariant; }
    public void setFavoriteCardVariant(String favoriteCardVariant) { this.favoriteCardVariant = favoriteCardVariant; }
    public String getFavoriteSiegling() { return favoriteSiegling; }
    public void setFavoriteSiegling(String favoriteSiegling) { this.favoriteSiegling = favoriteSiegling; }
    public List<String> getFeaturedBadgeIds() { return featuredBadgeIds; }
    public void setFeaturedBadgeIds(List<String> featuredBadgeIds) {
        this.featuredBadgeIds = featuredBadgeIds == null ? new ArrayList<>() : new ArrayList<>(featuredBadgeIds);
    }
    public List<String> getFavoriteCardIds() { return favoriteCardIds; }
    public void setFavoriteCardIds(List<String> favoriteCardIds) {
        this.favoriteCardIds = favoriteCardIds == null ? new ArrayList<>() : new ArrayList<>(favoriteCardIds);
    }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
