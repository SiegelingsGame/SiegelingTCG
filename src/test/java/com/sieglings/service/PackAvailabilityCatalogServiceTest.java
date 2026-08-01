package com.sieglings.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackAvailabilityCatalogServiceTest {

    @Test
    void packsWithNoStoredRowStayActive() {
        PackAvailabilityCatalogService service = PackCatalogServiceTest.inMemoryAvailability();

        assertTrue(service.isActive("pack_water"));
        assertTrue(service.isActive("pack_siegeknight"));
        assertTrue(service.inactivePackIds().isEmpty());
    }

    @Test
    void deactivatingOnePackLeavesOthersAloneAndIsReversible() {
        PackAvailabilityCatalogService service = PackCatalogServiceTest.inMemoryAvailability();

        service.setActive("pack_water", false, "editor@example.com");

        assertFalse(service.isActive("pack_water"));
        assertTrue(service.isActive("pack_fire"));
        assertEquals(List.of("pack_water"), service.inactivePackIds());

        service.setActive("pack_water", true, "editor@example.com");

        assertTrue(service.isActive("pack_water"));
        assertTrue(service.inactivePackIds().isEmpty());
    }

    @Test
    void packIdsAreMatchedCaseInsensitivelyAndBlankIdsAreRejected() {
        PackAvailabilityCatalogService service = PackCatalogServiceTest.inMemoryAvailability();

        service.setActive("  Pack_Stormtide  ", false, "editor@example.com");

        assertFalse(service.isActive("pack_stormtide"));
        assertFalse(service.isActive("PACK_STORMTIDE"));
        assertEquals(List.of("pack_stormtide"), service.inactivePackIds());

        assertThrows(IllegalArgumentException.class, () -> service.setActive("  ", false, "editor@example.com"));
        assertThrows(IllegalArgumentException.class, () -> service.setActive(null, true, "editor@example.com"));
        // An unknown id resolves as active rather than throwing, so a stale row never hides a pack.
        assertTrue(service.isActive("pack_that_no_longer_exists"));
    }
}
