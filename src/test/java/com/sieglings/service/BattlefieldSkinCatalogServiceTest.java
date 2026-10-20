package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BattlefieldSkinCatalogServiceTest {
    private final BattlefieldSkinCatalogService catalog = new BattlefieldSkinCatalogService(new ObjectMapper());

    @Test
    void manifestCatalogContainsAllSeventeenManifestIdsAndOnlyAchievementSkinsHaveAchievementRequirements() {
        assertEquals(17, catalog.all().size());
        assertEquals(17, catalog.all().stream().map(skin -> skin.get("id")).distinct().count());
        assertTrue(catalog.all().stream().allMatch(skin -> String.valueOf(skin.get("id")).startsWith("board-")));
        assertTrue(catalog.all().stream().filter(skin -> "prestige".equals(skin.get("collection")))
                .allMatch(skin -> skin.get("achievementId") != null && skin.get("price") == null));
        assertFalse(catalog.all().stream().filter(skin -> "premium".equals(skin.get("collection")))
                .anyMatch(skin -> skin.get("achievementId") != null));
    }

    @Test
    void unprefixedIdsFromTheFirstShopDeployStillNameTheSameSkin() {
        assertEquals("board-haunted-harvest", catalog.canonicalId("haunted-harvest"));
        assertEquals("board-dragons-hoard", catalog.canonicalId("dragons-hoard"));
        assertEquals("board-unstoppable-inferno", catalog.canonicalId("unstoppable-inferno"));
        assertEquals("board-haunted-harvest", catalog.canonicalId("board-haunted-harvest"));
        assertEquals("elemental-confluence", catalog.canonicalId("elemental-confluence"));
        assertEquals("siegebreakers-citadel", catalog.canonicalId("siegebreakers-citadel"));
        assertEquals(List.of("board-haunted-harvest", "board-dragons-hoard"),
                catalog.canonicalIds(List.of("haunted-harvest", "board-haunted-harvest", "dragons-hoard")));
        assertTrue(catalog.find("haunted-harvest").isPresent());
        assertEquals("board-haunted-harvest", catalog.find("haunted-harvest").orElseThrow().get("id"));
    }

    @Test
    void seasonalPurchaseWindowsCloseNewPurchasesAndReopenForTheirEvents() {
        assertTrue(catalog.isAvailableForPurchase("board-haunted-harvest", LocalDate.of(2026, 10, 31)));
        assertFalse(catalog.isAvailableForPurchase("board-haunted-harvest", LocalDate.of(2026, 11, 1)));
        assertTrue(catalog.isAvailableForPurchase("board-midnight-ascension", LocalDate.of(2027, 1, 3)));
        assertFalse(catalog.isAvailableForPurchase("board-midnight-ascension", LocalDate.of(2027, 1, 4)));
        assertTrue(catalog.isAvailableForPurchase("board-dragons-hoard", LocalDate.of(2026, 11, 1)));
        assertFalse(catalog.isAvailableForPurchase("board-unstoppable-inferno", LocalDate.of(2026, 10, 31)));
    }
}
