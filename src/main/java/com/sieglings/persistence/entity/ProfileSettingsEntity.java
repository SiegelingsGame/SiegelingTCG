package com.sieglings.persistence.entity;

import java.time.Instant;

public class ProfileSettingsEntity {
    private String userId;
    private String displayName;
    /** INITIAL or ELEMENT */
    private String avatarMode = "INITIAL";
    private String avatar = "";
    private String avatarUrl = "";
    private String favoriteElement = "FIRE";
    /** Optional themed profile background key (e.g. FIRE/ICE/WIND/EARTH/NEUTRAL); blank matches favoriteElement. */
    private String profileTheme = "";
    private String playerTitle = "";
    private String bio = "";
    private String preferredCardBack = "";
    private String favoriteSiegling = "";
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
    public String getProfileTheme() { return profileTheme; }
    public void setProfileTheme(String profileTheme) { this.profileTheme = profileTheme; }
    public String getPlayerTitle() { return playerTitle; }
    public void setPlayerTitle(String playerTitle) { this.playerTitle = playerTitle; }
    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }
    public String getPreferredCardBack() { return preferredCardBack; }
    public void setPreferredCardBack(String preferredCardBack) { this.preferredCardBack = preferredCardBack; }
    public String getFavoriteSiegling() { return favoriteSiegling; }
    public void setFavoriteSiegling(String favoriteSiegling) { this.favoriteSiegling = favoriteSiegling; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
