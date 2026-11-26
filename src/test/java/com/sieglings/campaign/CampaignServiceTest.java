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
            if (List.of("sundile", "cacty", "fawny", "breezee", "pylord").contains(id)) {
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

    @Test
    void namedSiegeKnightsGuardFireWindAndIceRealms() {
        assertEquals("pyla", CampaignContent.REALM_KNIGHT_BY_LAND.get("fire"));
        assertEquals("ser-airek", CampaignContent.REALM_KNIGHT_BY_LAND.get("wind"));
        assertEquals("glacia", CampaignContent.REALM_KNIGHT_BY_LAND.get("ice"));
        assertEquals("fire", CampaignContent.SANCTUARY_NPC_KNIGHTS.get("pyla"));
        assertEquals("wind", CampaignContent.SANCTUARY_NPC_KNIGHTS.get("ser-airek"));
        assertEquals("ice", CampaignContent.SANCTUARY_NPC_KNIGHTS.get("glacia"));
    }

    private CampaignRun runWith(String... roster) {
        CampaignRun run = campaign.start(null, "sundile", "Test Squire");
        for (String id : roster) if (!run.roster.contains(id)) run.roster.add(id);
        return run;
    }

    @Test
    void presetCapsArenaPartyAtThreeAndKeepsChosenCells() {
        CampaignRun run = runWith("cacty", "fawny", "breezee");
        CampaignRun saved = campaign.setPreset(run.token, List.of("sundile", "cacty", "fawny", "breezee"),
                Map.of("sundile", 4, "cacty", 0, "fawny", 2));
        assertEquals(List.of("sundile", "cacty", "fawny"), saved.arenaPreset);
        assertEquals(4, saved.presetCells.get("sundile"));
        assertEquals(0, saved.presetCells.get("cacty"));
        assertEquals(2, saved.presetCells.get("fawny"));
        assertEquals(3, CampaignContent.partySizeFor(CampaignRun.ArenaKind.AKHAR, 9));
    }

    @Test
    void presetResolvesCellsThroughBattlePlacement() {
        CampaignRun run = runWith("cacty");
        // The battle's own placement moves cacty off an unlinked square: the saved cell follows it.
        when(gameService.previewCampaignBoard(org.mockito.ArgumentMatchers.anyList())).thenReturn(List.of(
                Map.entry("sundile", new int[]{0, 1}), Map.entry("cacty", new int[]{0, 2})));
        CampaignRun saved = campaign.setPreset(run.token, List.of("sundile", "cacty"), Map.of("sundile", 1, "cacty", 8));
        assertEquals(1, saved.presetCells.get("sundile"));
        assertEquals(2, saved.presetCells.get("cacty"));
    }

    @Test
    void equipMovesItemsBetweenBagAndSiegeling() {
        CampaignRun run = runWith();
        assertTrue(run.items.contains("oak-charm"));
        CampaignRun held = campaign.equip(run.token, "sundile", "oak-charm");
        assertEquals("oak-charm", held.equipped.get("sundile"));
        assertTrue(held.items.isEmpty());
        CampaignRun back = campaign.equip(run.token, "sundile", null);
        assertTrue(back.equipped.isEmpty());
        assertEquals(List.of("oak-charm"), back.items);
        assertThrows(IllegalArgumentException.class, () -> campaign.equip(run.token, "sundile", "heart-ember"));
    }

    private void finishBattle(CampaignRun run, boolean won) {
        com.sieglings.model.GameState state = new com.sieglings.model.GameState();
        state.setPlayer(new com.sieglings.model.Player(run.playerName, true));
        state.setGameOver(true);
        state.setWinner(won ? run.playerName : "Foe");
        when(gameService.getSoloGame("battle-1")).thenReturn(state);
        run.phase = CampaignRun.Phase.ARENA_BATTLE;
        run.battleToken = "battle-1";
    }

    @Test
    void winningAWildArenaBattleCapturesAndLevelsTheSquire() {
        CampaignRun run = runWith();
        run.pendingArenaKind = CampaignRun.ArenaKind.WILD;
        run.pendingWildCardId = "cacty";
        run.pendingArenaArea = "wildlands";
        run.xp = 90;
        finishBattle(run, true);
        CampaignRun after = campaign.view(run.token);
        assertTrue(after.roster.contains("cacty"));
        assertTrue(after.arenaPreset.contains("cacty"));
        assertTrue(after.presetCells.containsKey("cacty"));
        assertEquals("wildlands", after.area);
        assertEquals(CampaignRun.Phase.WORLD, after.phase);
        assertEquals(2, after.level);
        assertEquals(15, after.xp);
        assertTrue(after.journal.stream().anyMatch(e -> String.valueOf(e.get("text")).contains("Caught")));
    }

    @Test
    void beatingALandsLegendaryEarnsItsSigil() {
        CampaignRun run = runWith();
        run.pendingArenaKind = CampaignRun.ArenaKind.LEGENDARY;
        run.pendingArenaLandId = "fire";
        run.pendingArenaArea = "fire";
        finishBattle(run, true);
        CampaignRun after = campaign.view(run.token);
        assertTrue(after.sigils.contains("fire"));
        assertEquals(CampaignRun.Phase.LAND, after.phase);
        assertTrue(after.lastMessage.contains("Sigil"));
    }

    @Test
    void everyElementalLandHasALegendaryForItsSigil() {
        assertEquals(12, CampaignContent.LEGENDARY_BY_ELEMENT.size());
        for (var land : CampaignContent.elementalLands()) {
            String el = land.elements().get(0).name().toLowerCase();
            assertTrue(CampaignContent.LEGENDARY_BY_ELEMENT.containsKey(el), el);
        }
    }
}
