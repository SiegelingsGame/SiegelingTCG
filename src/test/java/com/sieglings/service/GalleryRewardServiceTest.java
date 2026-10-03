package com.sieglings.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.ProfileSettingsStore;

import static org.mockito.ArgumentMatchers.nullable;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GalleryRewardServiceTest {

    private static final List<String> FREE_BACKDROPS = List.of(
            "air-and-wind", "air-battle", "air-loading", "earth", "electric", "fire-loading", "ice-earth", "ice-loading",
            "ice-peak", "light", "sand", "sky", "sky-ledge", "static", "void", "void-sigil", "water", "water-battle",
            "water-beach", "wind");

    private static GalleryRewardService service(AchievementEvaluationService achievements) {
        GalleryRewardService service = new GalleryRewardService();
        ReflectionTestUtils.setField(service, "objectMapper", new ObjectMapper());
        ReflectionTestUtils.setField(service, "achievementEvaluationService", achievements);
        return service;
    }

    private static AccountUser user() {
        AccountUser user = new AccountUser();
        user.setId("u1");
        user.setDisplayName("Tester");
        return user;
    }

    @Test
    void rewardTableGivesEveryScene_ItsOwnReachableServerCheckedAchievement() throws Exception {
        GalleryRewardService service = service(mock(AchievementEvaluationService.class));
        Map<String, GalleryRewardService.Reward> rewards = service.rewards();
        assertEquals(103, rewards.size());
        // One achievement per piece, so each unlock is a distinct reward.
        assertEquals(rewards.size(), rewards.values().stream().map(GalleryRewardService.Reward::achievementId).distinct().count());

        Set<String> serverAchievements;
        try (InputStream stream = getClass().getClassLoader().getResourceAsStream("catalog/achievement-titles.json")) {
            List<Map<String, String>> entries = new ObjectMapper().readValue(stream, new TypeReference<>() {});
            serverAchievements = entries.stream().map(entry -> entry.get("achievementId")).collect(Collectors.toSet());
        }
        for (Map.Entry<String, GalleryRewardService.Reward> entry : rewards.entrySet()) {
            String id = entry.getValue().achievementId();
            assertTrue(serverAchievements.contains(id), entry.getKey() + " needs " + id + ", which the server cannot evaluate");
            // Only the six live elements have cards, so their ladders are the only reachable ones.
            assertFalse(id.matches("^(metal|poison|psychic|light|shadow|undead)_.*"), id + " is not reachable");
            assertFalse(id.equals("rainbow_eight") || id.equals("rainbow_master"), id + " is not reachable");
            assertFalse(entry.getValue().requirement() == null || entry.getValue().requirement().isBlank(), entry.getKey());
            assertFalse(entry.getValue().achievement() == null || entry.getValue().achievement().isBlank(), entry.getKey());
        }
        for (String free : FREE_BACKDROPS) {
            assertTrue(service.rewardFor(free).isEmpty(), free + " should stay free");
        }
        assertTrue(service.rewardFor("art-added-tomorrow").isEmpty(), "unlisted art is free");
        assertEquals("first_pack", service.rewardFor("Sky-Egg").orElseThrow().achievementId());
    }

    @Test
    void unlockedPiecesComeFromOneEvaluationOfEveryNeededAchievement() {
        AchievementEvaluationService achievements = mock(AchievementEvaluationService.class);
        when(achievements.unlockedAmong(any(), anyCollection(), any(), any())).thenReturn(Set.of("first_pack", "signed_in"));
        GalleryRewardService service = service(achievements);

        Set<String> unlocked = service.unlockedPieceIds(user(), new PlayerProgressionEntity(), null);

        assertEquals(Set.of("sky-egg", "applehead-orchard"), unlocked);
        verify(achievements, times(1)).unlockedAmong(any(), anyCollection(), any(), any());
        verify(achievements, never()).isUnlocked(any(), anyString(), any(), any());
        assertTrue(service.unlockedPieceIds(null, new PlayerProgressionEntity(), null).isEmpty(), "guests earn nothing");
    }

    @Test
    void freeArtNeedsNoEvaluation_RewardArtNeedsItsAchievement() {
        AchievementEvaluationService achievements = mock(AchievementEvaluationService.class);
        when(achievements.isUnlocked(any(), eq("first_pack"), any(), any())).thenReturn(true);
        when(achievements.isUnlocked(any(), eq("arena_sovereign"), any(), any())).thenReturn(false);
        GalleryRewardService service = service(achievements);
        PlayerProgressionEntity progression = new PlayerProgressionEntity();

        assertTrue(service.canUse(user(), progression, null, ""));
        assertTrue(service.canUse(user(), progression, null, "sky"));
        assertTrue(service.canUse(user(), progression, null, "sky-egg"));
        assertFalse(service.canUse(user(), progression, null, "aerovane"));
        assertFalse(service.canUse(null, progression, null, "sky-egg"), "a reward needs an account");
        verify(achievements, never()).isUnlocked(any(), eq("sky"), any(), any());
    }

    @Test
    void titleUnlocksUseOneAchievementPassInsteadOfOnePerTitle() {
        AchievementEvaluationService achievements = mock(AchievementEvaluationService.class);
        when(achievements.unlockedAmong(any(), anyCollection(), any(), any())).thenReturn(Set.of("first_win"));
        PlayerTitleCatalogService catalog = mock(PlayerTitleCatalogService.class);
        when(catalog.listDefinitions()).thenReturn(List.of(
                new PlayerTitleCatalogService.TitleDefinition("title_ach_first_win", "First", "", PlayerTitleCatalogService.Source.ACHIEVEMENT, 0, null, null, "first_win"),
                new PlayerTitleCatalogService.TitleDefinition("title_ach_duelist", "Duelist", "", PlayerTitleCatalogService.Source.ACHIEVEMENT, 0, null, null, "duelist"),
                new PlayerTitleCatalogService.TitleDefinition("title_shop_x", "Shop", "", PlayerTitleCatalogService.Source.SHOP, 100, null, null, null)));
        PlayerTitleService titles = new PlayerTitleService();
        ReflectionTestUtils.setField(titles, "titleCatalogService", catalog);
        ReflectionTestUtils.setField(titles, "achievementEvaluationService", achievements);
        ReflectionTestUtils.setField(titles, "profileSettingsStore", mock(ProfileSettingsStore.class));

        List<String> unlocked = titles.resolveUnlockedTitleIds(user(), new PlayerProgressionEntity(), null);

        assertEquals(List.of("title_ach_first_win"), unlocked);
        verify(achievements, times(1)).unlockedAmong(any(), anyCollection(), any(), any());
        verify(achievements, never()).isUnlocked(any(), anyString(), any(), any());
    }

    @Test
    void lockedProfileArtResetsToTheDefault_OnSaveAndOnRead() {
        AchievementEvaluationService achievements = mock(AchievementEvaluationService.class);
        when(achievements.isUnlocked(any(), eq("first_pack"), any(), any())).thenReturn(true);
        when(achievements.isUnlocked(any(), eq("arena_sovereign"), any(), any())).thenReturn(false);
        GalleryRewardService rewards = service(achievements);

        ProfileSettingsStore store = mock(ProfileSettingsStore.class);
        Map<String, ProfileSettingsEntity> rows = new HashMap<>();
        when(store.findByUserId(anyString())).thenAnswer(call -> Optional.ofNullable(rows.get(call.<String>getArgument(0))));
        when(store.save(any())).thenAnswer(call -> {
            ProfileSettingsEntity saved = call.getArgument(0);
            rows.put(saved.getUserId(), saved);
            return saved;
        });
        // The read path must patch art only, and only while the stored id is
        // still the one it decided was locked. A full-document save of the
        // snapshot it loaded would put this bio and name back.
        doAnswer(call -> {
            ProfileSettingsEntity current = rows.get(call.getArgument(0, String.class));
            if (current == null) {
                return null;
            }
            String profileArtId = call.getArgument(1);
            String pageArtId = call.getArgument(2);
            if (profileArtId != null && profileArtId.equals(current.getProfileArtId())) {
                current.setProfileArtId("");
            }
            if (pageArtId != null && pageArtId.equals(current.getPageArtId())) {
                current.setPageArtId("");
            }
            return null;
        }).when(store).clearArtIfUnchanged(anyString(), nullable(String.class), nullable(String.class));
        PlayerProgressionService progression = mock(PlayerProgressionService.class);
        when(progression.getOrCreate(any())).thenReturn(new PlayerProgressionEntity());
        PlayerTitleService titles = mock(PlayerTitleService.class);
        when(titles.migrateLegacyTitleId(any(), any())).thenAnswer(call -> call.getArgument(0));
        ProfileSettingsService profiles = new ProfileSettingsService();
        ReflectionTestUtils.setField(profiles, "settingsStore", store);
        ReflectionTestUtils.setField(profiles, "userStore", mock(AccountUserStore.class));
        ReflectionTestUtils.setField(profiles, "playerTitleService", titles);
        ReflectionTestUtils.setField(profiles, "playerProgressionService", progression);
        ReflectionTestUtils.setField(profiles, "cardDefinitionService", mock(CardDefinitionService.class));
        ReflectionTestUtils.setField(profiles, "galleryRewardService", rewards);

        // Save: an earned reward and a free backdrop stick; an unearned reward falls back to the default.
        ProfileSettingsEntity saved = profiles.save(user(), Map.of("profileArtId", "sky-egg", "pageArtId", "aerovane"));
        assertEquals("sky-egg", saved.getProfileArtId());
        assertEquals("", saved.getPageArtId());
        assertEquals("sky", profiles.save(user(), Map.of("profileArtId", "sky")).getProfileArtId());

        // Read: a viewer loaded the profile, then the owner saved a new name,
        // bio, and page background while the achievement check was in flight.
        ProfileSettingsEntity live = rows.get("u1");
        live.setProfileArtId("aerovane");
        live.setPageArtId("aerovane");
        live.setBio("original");
        live.setDisplayName("Old Name");
        ProfileSettingsEntity stale = copySettings(live);
        when(achievements.isUnlocked(any(), eq("arena_sovereign"), any(), any())).thenAnswer(call -> {
            ProfileSettingsEntity current = rows.get("u1");
            current.setBio("edited while checking");
            current.setDisplayName("New Name");
            current.setPageArtId("sky");
            return false;
        });
        clearInvocations(store);

        Map<String, Object> out = profiles.serialize(stale, user());

        assertEquals("", out.get("profileArtId"), "the response hides the locked profile art");
        assertEquals("", rows.get("u1").getProfileArtId(), "the locked profile art is cleared");
        assertEquals("sky", rows.get("u1").getPageArtId(), "a page background saved during the check stays");
        assertEquals("edited while checking", rows.get("u1").getBio());
        assertEquals("New Name", rows.get("u1").getDisplayName());
        verify(store, never()).save(any());
    }

    @Test
    void unreadableAchievementHistoryDoesNotBlankProfileArtOrFailTheRead() {
        AchievementEvaluationService achievements = mock(AchievementEvaluationService.class);
        when(achievements.isUnlocked(any(), anyString(), any(), any()))
                .thenThrow(new IllegalStateException("Unable to load match history from Firestore."));
        GalleryRewardService rewards = service(achievements);

        ProfileSettingsStore store = mock(ProfileSettingsStore.class);
        ProfileSettingsEntity stored = new ProfileSettingsEntity();
        stored.setUserId("u1");
        stored.setDisplayName("Tester");
        stored.setProfileArtId("sky-egg");
        stored.setPageArtId("aerovane");
        stored.setBio("kept");
        when(store.findByUserId(anyString())).thenReturn(Optional.of(stored));

        PlayerProgressionService progression = mock(PlayerProgressionService.class);
        when(progression.getOrCreate(any())).thenReturn(new PlayerProgressionEntity());
        PlayerTitleService titles = mock(PlayerTitleService.class);
        when(titles.migrateLegacyTitleId(any(), any())).thenAnswer(call -> call.getArgument(0));
        when(titles.labelFor(any())).thenReturn("");
        CardDefinitionService cards = mock(CardDefinitionService.class);
        when(cards.getDeckBuilderCatalog()).thenReturn(List.of());
        when(cards.getTrainerOptions()).thenReturn(List.of());

        ProfileSettingsService profiles = new ProfileSettingsService();
        ReflectionTestUtils.setField(profiles, "settingsStore", store);
        ReflectionTestUtils.setField(profiles, "userStore", mock(AccountUserStore.class));
        ReflectionTestUtils.setField(profiles, "playerTitleService", titles);
        ReflectionTestUtils.setField(profiles, "playerProgressionService", progression);
        ReflectionTestUtils.setField(profiles, "cardDefinitionService", cards);
        ReflectionTestUtils.setField(profiles, "galleryRewardService", rewards);

        Map<String, Object> out = profiles.serialize(copySettings(stored), user());

        assertEquals("sky-egg", out.get("profileArtId"));
        assertEquals("aerovane", out.get("pageArtId"));
        assertEquals("sky-egg", stored.getProfileArtId());
        assertEquals("kept", stored.getBio());
        verify(store, never()).save(any());
        verify(store, never()).clearArtIfUnchanged(anyString(), nullable(String.class), nullable(String.class));
    }

    @Test
    void unreadableHistoryLeavesGalleryUnlocksUnknown() {
        GalleryRewardService rewards = mock(GalleryRewardService.class);
        when(rewards.unlockedPieceIds(any(), any(), any()))
                .thenThrow(new IllegalStateException("Unable to load match history from Firestore."));
        ProfileSettingsStore settings = mock(ProfileSettingsStore.class);
        when(settings.findByUserId(anyString())).thenReturn(Optional.empty());
        CardDefinitionService cards = mock(CardDefinitionService.class);
        when(cards.getDeckBuilderCatalog()).thenReturn(List.of());

        PlayerProgressionService progression = new PlayerProgressionService();
        ReflectionTestUtils.setField(progression, "cardDefinitionService", cards);
        ReflectionTestUtils.setField(progression, "galleryRewardService", rewards);
        ReflectionTestUtils.setField(progression, "profileSettingsStore", settings);

        Map<String, Object> out = progression.serialize(new PlayerProgressionEntity(), user());

        assertNull(out.get("galleryUnlockedIds"),
                "a failed read must not look like the player has earned nothing");
    }

    private static ProfileSettingsEntity copySettings(ProfileSettingsEntity src) {
        ProfileSettingsEntity copy = new ProfileSettingsEntity();
        copy.setUserId(src.getUserId());
        copy.setDisplayName(src.getDisplayName());
        copy.setAvatarMode(src.getAvatarMode());
        copy.setAvatar(src.getAvatar());
        copy.setAvatarUrl(src.getAvatarUrl());
        copy.setFavoriteElement(src.getFavoriteElement());
        copy.setProfileArtId(src.getProfileArtId());
        copy.setPageArtId(src.getPageArtId());
        copy.setPlayerTitle(src.getPlayerTitle());
        copy.setBio(src.getBio());
        copy.setPreferredCardBack(src.getPreferredCardBack());
        copy.setFavoriteCardId(src.getFavoriteCardId());
        copy.setFavoriteCardVariant(src.getFavoriteCardVariant());
        copy.setFavoriteSiegling(src.getFavoriteSiegling());
        copy.setFeaturedBadgeIds(src.getFeaturedBadgeIds() == null ? null : List.copyOf(src.getFeaturedBadgeIds()));
        copy.setFavoriteCardIds(src.getFavoriteCardIds() == null ? null : List.copyOf(src.getFavoriteCardIds()));
        copy.setUpdatedAt(src.getUpdatedAt());
        return copy;
    }
}
