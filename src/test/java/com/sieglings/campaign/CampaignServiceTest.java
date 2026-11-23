package com.sieglings.campaign;

import com.sieglings.adventure.CampaignWildSupport;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.GameService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CampaignServiceTest {

    @Mock CardDefinitionService cardDefs;
    @Mock GameService gameService;
    @Mock CampaignWildSupport wildSupport;
    @Mock CampaignRunStore store;

    @InjectMocks CampaignService campaign;

    @BeforeEach
    void cards() {
        lenient().when(cardDefs.findCardCopy(anyString())).thenAnswer(inv -> {
            String id = inv.getArgument(0);
            if (List.of("sundile", "cacty", "fawny", "breezee").contains(id)) {
                com.sieglings.model.SieglingCard card = new com.sieglings.model.SieglingCard();
                card.setId(id);
                card.setName(id);
                return Optional.of(card);
            }
            return Optional.empty();
        });
        lenient().when(store.latestTokenFor(anyString())).thenReturn(Optional.empty());
    }

    @Test
    void startSeedsSquireRosterAndHomeLand() {
        CampaignRun run = campaign.start(null, "sundile", "Test Squire");
        assertEquals(CampaignRun.Phase.WORLD, run.phase);
        assertEquals("sundile", run.starterId);
        assertEquals("squire-bob", run.trainerId);
        assertEquals(List.of("sundile"), run.roster);
        assertEquals(List.of("sundile"), run.arenaPreset);
        assertTrue(run.unlockedLandIds.contains("fire"));
        assertEquals("fire", run.currentLandId);
    }

    @Test
    void startRejectsUnknownStarter() {
        assertThrows(IllegalArgumentException.class, () -> campaign.start(null, "mossling", "X"));
    }

    @Test
    void optionsListsFourStarters() {
        Map<String, Object> options = campaign.options(null);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> starters = (List<Map<String, Object>>) options.get("starters");
        assertEquals(4, starters.size());
        assertEquals("squire-bob", options.get("squireId"));
    }
}
