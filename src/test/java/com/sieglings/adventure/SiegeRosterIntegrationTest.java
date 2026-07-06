package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class SiegeRosterIntegrationTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    @Test
    void selectableSieglingsAreNotEmptyInSpringContext() {
        assertFalse(content.selectableSieglings().isEmpty(),
                "Expedition warband roster must include stage-1 Siegelings with playable moves");
    }

    @Test
    void rosterEndpointUsesSiegelingsKeyAndIncludesCards() {
        long started = System.nanoTime();
        Map<String, Object> roster = siegeService.roster(null);
        long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
        assertTrue(roster.containsKey("siegelings"),
                "roster JSON must expose the siegelings array");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> siegelings = (List<Map<String, Object>>) roster.get("siegelings");
        assertFalse(siegelings.isEmpty(),
                "roster must include at least one Siegeling");
        assertTrue(elapsedMs < 4000,
                "roster should build quickly (took " + elapsedMs + "ms)");
    }

    @Test
    void rosterIncludesMoreThanPsychicStartersWhenCatalogIsComplete() {
        List<SieglingCard> selectable = content.selectableSieglings();
        Map<String, Object> roster = siegeService.roster(null);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> siegelings = (List<Map<String, Object>>) roster.get("siegelings");
        assertTrue(selectable.size() > 6,
                "catalog should expose starters from every live element, not only Psychic");
        assertEquals(selectable.size(), siegelings.size());
    }
}
