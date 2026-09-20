package com.sieglings.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The roster stored in Firestore is written by whatever build last published it,
 * so it can be SHORTER than the element order the running build knows about.
 * What happens to the elements it does not mention is the whole contract here:
 * production's own roster omits Poison and Light, and they were live anyway -
 * their starter packs sat in the shop next to elements the roster explicitly
 * switched off.
 */
class LiveElementCatalogServiceTest {

    /** Production's stored roster: ten rows in an older element order, no Poison, no Light. */
    private static final String STORED_TEN = """
            {"elements":[
              {"element":"FIRE","active":true},
              {"element":"ICE","active":true},
              {"element":"EARTH","active":true},
              {"element":"WIND","active":true},
              {"element":"WATER","active":true},
              {"element":"SHADOW","active":false},
              {"element":"ELECTRIC","active":true},
              {"element":"METAL","active":false},
              {"element":"UNDEAD","active":false},
              {"element":"PSYCHIC","active":false}
            ]}
            """;

    @Test
    void anElementTheStoredRosterNeverMentionsIsNotLive() throws Exception {
        Set<Element> active = activeFor(STORED_TEN);

        assertFalse(active.contains(Element.POISON), "Poison is absent from the roster, so it is not live");
        assertFalse(active.contains(Element.LIGHT), "Light is absent from the roster, so it is not live");
        assertEquals(
                List.of(Element.FIRE, Element.EARTH, Element.WIND, Element.ICE, Element.WATER, Element.ELECTRIC),
                List.copyOf(active),
                "only the rows the roster switched on stay live"
        );
    }

    @Test
    void theRowsTheRosterDoesCarryAreStillHonoured() throws Exception {
        Set<Element> active = activeFor(STORED_TEN);

        assertTrue(active.contains(Element.FIRE));
        assertFalse(active.contains(Element.METAL), "Metal is stored as inactive");
        assertFalse(active.contains(Element.SHADOW), "Shadow is stored as inactive");
    }

    @Test
    void anEmptyRosterStillMeansEverythingIsOn() throws Exception {
        // A fresh install has published nothing yet; that is an empty roster, not
        // an omission, and the whole element order should come up live.
        Set<Element> active = activeFor("{\"elements\":[]}");

        assertEquals(
                Set.copyOf(LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER),
                active
        );
    }

    /** The shipped resource is the fallback whenever Firestore is unreachable, so it has to agree. */
    @Test
    void theBundledRosterKeepsPoisonAndLightOff() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode bundled;
        try (var in = LiveElementCatalogService.class.getClassLoader()
                .getResourceAsStream(LiveElementCatalogService.RESOURCE_PATH)) {
            bundled = mapper.readTree(in);
        }

        Set<Element> active = activeFor(bundled);

        assertFalse(active.contains(Element.POISON));
        assertFalse(active.contains(Element.LIGHT));
    }

    /** The real read path: parse the stored document, then resolve what is live from it. */
    private static Set<Element> activeFor(String json) throws Exception {
        return activeFor(new ObjectMapper().readTree(json));
    }

    private static Set<Element> activeFor(JsonNode data) throws Exception {
        LiveElementCatalogService service =
                new LiveElementCatalogService(new ObjectMapper(), null, "appConfig", "liveElements");
        Method parse = LiveElementCatalogService.class
                .getDeclaredMethod("parseElementFile", JsonNode.class);
        parse.setAccessible(true);
        LiveElementCatalogService.LiveElementsFile file =
                (LiveElementCatalogService.LiveElementsFile) parse.invoke(service, data);
        return LiveElementCatalogService.resolveActiveElements(file.elements());
    }
}
