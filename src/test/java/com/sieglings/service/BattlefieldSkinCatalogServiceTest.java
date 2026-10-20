package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Set;

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
    void seasonalPurchaseWindowsCloseNewPurchasesAndReopenForTheirEvents() {
        assertTrue(catalog.isAvailableForPurchase("board-haunted-harvest", LocalDate.of(2026, 10, 31)));
        assertFalse(catalog.isAvailableForPurchase("board-haunted-harvest", LocalDate.of(2026, 11, 1)));
        assertTrue(catalog.isAvailableForPurchase("board-midnight-ascension", LocalDate.of(2027, 1, 3)));
        assertFalse(catalog.isAvailableForPurchase("board-midnight-ascension", LocalDate.of(2027, 1, 4)));
        assertTrue(catalog.isAvailableForPurchase("board-dragons-hoard", LocalDate.of(2026, 11, 1)));
        assertFalse(catalog.isAvailableForPurchase("board-unstoppable-inferno", LocalDate.of(2026, 10, 31)));
    }
}
