package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
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

    @Test
    void knightsCarryTheirCardArtForTeamSelect() {
        Map<String, Object> roster = siegeService.roster(null);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> knights = (List<Map<String, Object>>) roster.get("knights");
        for (TrainerCard k : content.selectableKnights()) {
            Map<String, Object> row = knights.stream()
                    .filter(m -> k.getId().equals(m.get("id"))).findFirst().orElseThrow();
            String art = k.getCardArtUrl();
            if (art == null || art.isBlank()) {
                assertFalse(row.containsKey("artUrl"), k.getId() + " has no art, so none is sent");
                continue;
            }
            assertEquals(art.trim(), row.get("artUrl"));
            String mode = k.getCardArtMode() == null ? "" : k.getCardArtMode().trim().toUpperCase();
            assertEquals(mode, row.get("artMode"), k.getId() + " art mode decides frame vs overlay");
        }
    }
}
