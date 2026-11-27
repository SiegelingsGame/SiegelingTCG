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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
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
    void arenaTeamCapsAtFiveAndKeepsChosenCells() {
        CampaignRun run = runWith("cacty", "fawny", "breezee", "pylord");
        run.roster.add("extra");
        CampaignRun saved = campaign.setPreset(run.token, List.of("sundile", "cacty", "fawny", "breezee", "pylord", "extra"),
                Map.of("sundile", 4, "cacty", 0, "fawny", 2, "breezee", 6, "pylord", 8));
        assertEquals(List.of("sundile", "cacty", "fawny", "breezee", "pylord"), saved.arenaPreset);
        assertEquals(4, saved.presetCells.get("sundile"));
        assertEquals(0, saved.presetCells.get("cacty"));
        assertEquals(8, saved.presetCells.get("pylord"));
        assertEquals(5, CampaignRun.ARENA_PARTY_MAX);
    }

    @Test
    void siegeSquadHoldsLeftCenterRightAndFollowerIsChosen() {
        CampaignRun run = runWith("cacty", "fawny");
        assertEquals(java.util.Arrays.asList(null, "sundile", null), run.siegeSquad);
        assertEquals("sundile", run.followerId);
        CampaignRun set = campaign.setSquad(run.token, java.util.Arrays.asList("fawny", null, "cacty"));
        assertEquals(java.util.Arrays.asList("fawny", null, "cacty"), set.siegeSquad);
        assertEquals(List.of("fawny", "cacty"), set.squadInOrder());
        assertThrows(IllegalArgumentException.class, () -> campaign.setSquad(run.token, List.of("cacty", "cacty")));
        assertThrows(IllegalArgumentException.class, () -> campaign.setSquad(run.token, java.util.Arrays.asList(null, null, null)));
        assertEquals("cacty", campaign.setFollower(run.token, "cacty").followerId);
        assertThrows(IllegalArgumentException.class, () -> campaign.setFollower(run.token, "pylord"));
    }

    @Test
    void wildSiegeBattlesUseTheSquadAndReturnToTheArea() {
        CampaignRun run = runWith("cacty");
        campaign.setSquad(run.token, java.util.Arrays.asList("cacty", "sundile", null));
        com.sieglings.model.TrainerCard squire = new com.sieglings.model.TrainerCard();
        when(cardDefs.getActiveTrainerById("squire-bob")).thenReturn(Optional.of(squire));
        when(wildSupport.start(org.mockito.ArgumentMatchers.eq(run.token), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.eq(List.of("cacty", "sundile")), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.isNull()))
                .thenReturn(new CampaignWildSupport.StartResult("fawny", "Fawny"));
        run.area = "fire";
        CampaignRun started = campaign.startWild(run.token, null, "fire");
        assertEquals(CampaignRun.Phase.WILD_BATTLE, started.phase);
        Map<String, Object> opening = Map.of("battle", Map.of("phase", "PLAYER_INPUT"));
        Map<String, Object> victory = Map.of("battle", Map.of("phase", "WON",
                "events", List.of(Map.of("type", "faint"))));
        when(wildSupport.isOver(run.token)).thenReturn(false, false, true);
        when(wildSupport.battleView(run.token)).thenReturn(opening, victory);
        when(wildSupport.won(run.token)).thenReturn(true);

        assertEquals(opening, campaign.wildBattle(run.token));
        int initialGold = run.gold;
        assertEquals(victory, campaign.wildPlay(run.token, "card-1", "enemy-2"));
        verify(wildSupport).play(eq(run.token), eq("card-1"), eq("enemy-2"), any());
        assertTrue(run.roster.contains("fawny"));
        assertTrue(run.siegeSquad.contains("fawny"));
        assertEquals(CampaignRun.Phase.LAND, run.phase);
        assertEquals("fire", run.area);

        assertTrue(campaign.wildBattle(run.token).isEmpty());
        assertTrue(campaign.wildEndTurn(run.token).isEmpty());
        assertEquals(initialGold + 8, run.gold);
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
        assertTrue(after.siegeSquad.contains("cacty"));
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
