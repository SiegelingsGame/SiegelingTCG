package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Component
public class ProfileSettingsStore {
    private static final long OP_TIMEOUT_SECONDS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    public Optional<ProfileSettingsEntity> findByUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return Optional.empty();
        }
        try {
            DocumentSnapshot snapshot = doc(userId).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return snapshot.exists() ? Optional.of(toEntity(userId, snapshot)) : Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load profile settings from Firestore.", ex);
        }
    }

    public ProfileSettingsEntity save(ProfileSettingsEntity settings) {
        if (settings.getUserId() == null || settings.getUserId().isBlank()) {
            throw new IllegalArgumentException("Profile settings user id is required.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("displayName", settings.getDisplayName());
        payload.put("avatarMode", settings.getAvatarMode());
        payload.put("avatar", settings.getAvatar());
        payload.put("avatarUrl", settings.getAvatarUrl());
        payload.put("favoriteElement", settings.getFavoriteElement());
        payload.put("profileArtId", settings.getProfileArtId());
        payload.put("pageArtId", settings.getPageArtId());
        payload.put("playerTitle", settings.getPlayerTitle());
        payload.put("bio", settings.getBio());
        payload.put("preferredCardBack", settings.getPreferredCardBack());
        payload.put("favoriteSiegling", settings.getFavoriteSiegling());
        payload.put("updatedAt", toTimestamp(settings.getUpdatedAt()));
        try {
            doc(settings.getUserId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return settings;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save profile settings to Firestore.", ex);
        }
    }

    public void deleteByUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        try {
            doc(userId).delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete profile settings from Firestore.", ex);
        }
    }

    private DocumentReference doc(String userId) {
        return client.requireFirestore().collection(client.profileSettingsCollection()).document(userId);
    }

    private ProfileSettingsEntity toEntity(String userId, DocumentSnapshot snapshot) {
        ProfileSettingsEntity settings = new ProfileSettingsEntity();
        settings.setUserId(userId);
        settings.setDisplayName(snapshot.getString("displayName"));
        settings.setAvatarMode(snapshot.getString("avatarMode"));
        settings.setAvatar(snapshot.getString("avatar"));
        settings.setAvatarUrl(snapshot.getString("avatarUrl"));
        settings.setFavoriteElement(snapshot.getString("favoriteElement"));
        settings.setProfileArtId(snapshot.getString("profileArtId"));
        settings.setPageArtId(snapshot.getString("pageArtId"));
        settings.setPlayerTitle(snapshot.getString("playerTitle"));
        settings.setBio(snapshot.getString("bio"));
        settings.setPreferredCardBack(snapshot.getString("preferredCardBack"));
        settings.setFavoriteSiegling(snapshot.getString("favoriteSiegling"));
        Object updatedAt = snapshot.get("updatedAt");
        if (updatedAt instanceof Timestamp ts) {
            settings.setUpdatedAt(Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()));
        }
        return settings;
    }

    private Timestamp toTimestamp(Instant instant) {
        Instant safe = instant == null ? Instant.now() : instant;
        return Timestamp.ofTimeSecondsAndNanos(safe.getEpochSecond(), safe.getNano());
    }
}
