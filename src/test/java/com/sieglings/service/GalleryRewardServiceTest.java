package com.sieglings.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.ProfileSettingsStore;
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
import static org.junit.jupiter.api.Assertions.assertTrue;
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

        // Read: art picked before it became a reward is cleared, for every viewer, and stored that way.
        ProfileSettingsEntity legacy = rows.get("u1");
        legacy.setProfileArtId("aerovane");
        Map<String, Object> out = profiles.serialize(legacy, user());
        assertEquals("", out.get("profileArtId"));
        assertEquals("", rows.get("u1").getProfileArtId());
    }
}
