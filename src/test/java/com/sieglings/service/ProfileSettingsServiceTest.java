package com.sieglings.service;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.ProfileSettingsStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProfileSettingsServiceTest {

    private ProfileSettingsStore store;
    private PlayerProgressionService progressionService;
    private ProfileSettingsService profiles;
    private PlayerProgressionEntity progression;

    @BeforeEach
    void setUp() {
        store = mock(ProfileSettingsStore.class);
        when(store.findByUserId(anyString())).thenReturn(Optional.empty());
        when(store.save(any())).thenAnswer(call -> call.getArgument(0));

        progression = new PlayerProgressionEntity();
        progression.getOwnedCards().put("applehead", 2);
        progression.getTrainerLevels().put("pyla", 1);

        progressionService = mock(PlayerProgressionService.class);
        when(progressionService.getOrCreate(any())).thenReturn(progression);

        CardDefinitionService cards = mock(CardDefinitionService.class);
        when(cards.getDeckBuilderCatalog()).thenReturn(List.of(
                new SieglingCard("applehead", "Applehead", Element.EARTH, Rarity.COMMON, 20, 3, List.of(), null)));
        when(cards.getTrainerOptions()).thenReturn(List.of(
                new TrainerCard("pyla", "Pyla", Element.FIRE, Rarity.LEGENDARY, null, null, false),
                new TrainerCard("bob", "Squire Bob", Element.NEUTRAL, Rarity.COMMON, null, null, false)));

        PlayerTitleService titles = mock(PlayerTitleService.class);
        when(titles.migrateLegacyTitleId(any(), any())).thenAnswer(call -> {
            Object id = call.getArgument(0);
            return id == null ? "" : String.valueOf(id);
        });
        when(titles.labelFor(any())).thenReturn("Starter");

        profiles = new ProfileSettingsService();
        ReflectionTestUtils.setField(profiles, "settingsStore", store);
        ReflectionTestUtils.setField(profiles, "userStore", mock(AccountUserStore.class));
        ReflectionTestUtils.setField(profiles, "playerTitleService", titles);
        ReflectionTestUtils.setField(profiles, "playerProgressionService", progressionService);
        ReflectionTestUtils.setField(profiles, "cardDefinitionService", cards);
    }

    @Test
    void showcaseSaveKeepsAnOwnedSiegeKnightSignature() {
        AccountUser user = user();
        ProfileSettingsEntity saved = profiles.save(user, Map.of(
                "favoriteCardId", "pyla",
                "favoriteCardIds", List.of("pyla", "applehead")));

        assertEquals("pyla", saved.getFavoriteCardId());
        assertEquals(List.of("pyla", "applehead"), saved.getFavoriteCardIds());

        Map<String, Object> out = profiles.serialize(saved, user);
        assertEquals("pyla", out.get("favoriteCardId"));
        assertEquals(List.of("pyla", "applehead"), out.get("favoriteCardIds"));
    }

    @Test
    void showcaseSaveStillRejectsASiegeKnightThePlayerDoesNotOwn() {
        ProfileSettingsEntity existing = new ProfileSettingsEntity();
        existing.setUserId("u1");
        existing.setFavoriteCardId("applehead");
        existing.setFavoriteCardIds(List.of("applehead"));
        when(store.findByUserId("u1")).thenReturn(Optional.of(existing));

        // The Signature itself is owned. The unowned knight is only in the
        // showcase list, which is the check that used to ignore trainer ownership.
        IllegalArgumentException rejected = assertThrows(IllegalArgumentException.class, () ->
                profiles.save(user(), Map.of(
                        "favoriteCardId", "applehead",
                        "favoriteCardIds", List.of("bob", "applehead"))));

        assertEquals("Choose cards you own for your collection favorites.", rejected.getMessage());
        verify(store, never()).save(any());
        assertEquals("applehead", existing.getFavoriteCardId());
        assertEquals(List.of("applehead"), existing.getFavoriteCardIds());
    }

    private static AccountUser user() {
        AccountUser user = new AccountUser();
        user.setId("u1");
        user.setDisplayName("Tester");
        return user;
    }
}
