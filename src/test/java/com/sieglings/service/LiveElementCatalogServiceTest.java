package com.sieglings.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LiveElementCatalogServiceTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /**
     * Production Firestore still stores the pre-#946 ten-element roster. Metal /
     * Shadow / Undead / Psychic were already switched off there; Poison and Light
     * were simply absent. Missing keys must stay off, or those two unreleased
     * lines appear in the shop as starter packs that cannot be opened.
     */
    @Test
    void productionShapedRosterDoesNotSilentlyActivatePoisonAndLight() {
        List<LiveElementCatalogService.ElementToggle> stored = List.of(
                toggle("FIRE", true),
                toggle("ICE", true),
                toggle("EARTH", true),
                toggle("WIND", true),
                toggle("WATER", true),
                toggle("SHADOW", false),
                toggle("ELECTRIC", true),
                toggle("METAL", false),
                toggle("UNDEAD", false),
                toggle("PSYCHIC", false)
        );

        // Production load is parse → normalizeFile → resolve. Calling resolve
        // alone used to look correct while normalizeFile still filled missing
        // keys as on, which is how Poison/Light went live.
        LiveElementCatalogService.LiveElementsFile loaded =
                LiveElementCatalogService.normalizeFile(new LiveElementCatalogService.LiveElementsFile(stored));
        Set<Element> active = LiveElementCatalogService.resolveActiveElements(loaded.elements());

        assertEquals(
                List.of(Element.FIRE, Element.EARTH, Element.WIND, Element.ICE, Element.WATER, Element.ELECTRIC),
                List.copyOf(active)
        );
        assertFalse(active.contains(Element.POISON));
        assertFalse(active.contains(Element.LIGHT));
    }

    @Test
    void normalizeFileMustUseTheSameOptInRuleAsResolve() {
        List<LiveElementCatalogService.ElementToggle> stored = List.of(
                toggle("FIRE", true),
                toggle("EARTH", true),
                toggle("WIND", true),
                toggle("ICE", true),
                toggle("WATER", true),
                toggle("ELECTRIC", true)
        );

        LiveElementCatalogService.LiveElementsFile normalized =
                LiveElementCatalogService.normalizeFile(new LiveElementCatalogService.LiveElementsFile(stored));
        Set<Element> fromNormalized = LiveElementCatalogService.resolveActiveElements(normalized.elements());
        Set<Element> fromRaw = LiveElementCatalogService.resolveActiveElements(stored);

        assertEquals(fromRaw, fromNormalized);
        assertFalse(fromNormalized.contains(Element.POISON));
        assertFalse(fromNormalized.contains(Element.LIGHT));
        assertTrue(toggleFor(normalized, Element.POISON).active() == Boolean.FALSE);
        assertTrue(toggleFor(normalized, Element.LIGHT).active() == Boolean.FALSE);
    }

    @Test
    void emptyRosterStillDefaultsEveryGameplayElementOn() {
        Set<Element> active = LiveElementCatalogService.resolveActiveElements(List.of());

        assertEquals(Set.copyOf(LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER), active);
        assertTrue(active.contains(Element.POISON));
        assertTrue(active.contains(Element.LIGHT));
    }

    @Test
    void explicitPoisonOrLightStayHonored() {
        List<LiveElementCatalogService.ElementToggle> stored = List.of(
                toggle("FIRE", true),
                toggle("POISON", true),
                toggle("LIGHT", false)
        );

        Set<Element> active = LiveElementCatalogService.resolveActiveElements(stored);

        assertTrue(active.contains(Element.FIRE));
        assertTrue(active.contains(Element.POISON));
        assertFalse(active.contains(Element.LIGHT));
        assertFalse(active.contains(Element.WATER));
    }

    @Test
    void classpathLiveElementsKeepPoisonAndLightOff() throws Exception {
        try (InputStream stream = getClass().getClassLoader()
                .getResourceAsStream(LiveElementCatalogService.RESOURCE_PATH)) {
            JsonNode data = OBJECT_MAPPER.readTree(stream);
            LiveElementCatalogService.LiveElementsFile file =
                    OBJECT_MAPPER.treeToValue(data, LiveElementCatalogService.LiveElementsFile.class);
            Set<Element> active = LiveElementCatalogService.resolveActiveElements(file.elements());
            assertFalse(active.contains(Element.POISON), "classpath live-elements.json must keep Poison opted out");
            assertFalse(active.contains(Element.LIGHT), "classpath live-elements.json must keep Light opted out");
            assertTrue(active.contains(Element.FIRE));
            assertTrue(active.contains(Element.METAL));
            assertTrue(active.contains(Element.PSYCHIC));
        }
    }

    private static LiveElementCatalogService.ElementToggle toggle(String element, boolean active) {
        return new LiveElementCatalogService.ElementToggle(element, active);
    }

    private static LiveElementCatalogService.ElementToggle toggleFor(
            LiveElementCatalogService.LiveElementsFile file, Element element) {
        return file.elements().stream()
                .filter(row -> element.name().equals(row.element()))
                .findFirst()
                .orElseThrow();
    }
}
