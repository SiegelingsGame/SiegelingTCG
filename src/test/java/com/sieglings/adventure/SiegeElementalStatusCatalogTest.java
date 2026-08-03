package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Siege damage riders read {@link com.sieglings.model.ElementalAfflictionCatalog}.
 */
class SiegeElementalStatusCatalogTest {

    @Test
    void statusForMatchesSharedCatalogRows() {
        assertEquals(StatusKind.BURN, SiegeContentService.statusFor(Element.FIRE));
        assertEquals(StatusKind.SLOW, SiegeContentService.statusFor(Element.ICE));
        assertEquals(StatusKind.STUN, SiegeContentService.statusFor(Element.EARTH));
        assertEquals(StatusKind.DISORIENT, SiegeContentService.statusFor(Element.WIND));
        assertEquals(StatusKind.SHOCK, SiegeContentService.statusFor(Element.ELECTRIC));
        assertEquals(StatusKind.POISON, SiegeContentService.statusFor(Element.POISON));
        assertEquals(StatusKind.SOAK, SiegeContentService.statusFor(Element.WATER));
        assertEquals(StatusKind.RUST, SiegeContentService.statusFor(Element.METAL));
        assertEquals(StatusKind.CURSE, SiegeContentService.statusFor(Element.SHADOW));
        assertEquals(StatusKind.INSIGHT, SiegeContentService.statusFor(Element.PSYCHIC));
        assertEquals(StatusKind.BLIND, SiegeContentService.statusFor(Element.LIGHT));
        assertEquals(StatusKind.WITHER, SiegeContentService.statusFor(Element.UNDEAD));
        assertNull(SiegeContentService.statusFor(Element.NEUTRAL));
        assertNull(SiegeContentService.statusFor(null));
    }
}
