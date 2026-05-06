package com.sieglings.service;

import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PlacementServiceTest {

    private final PlacementService placementService = new PlacementService();

    @Test
    void evolvedFormStartsAtZeroBattlePhasesSoCannotChainEvolveWithoutABattle() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));

        SieglingCard base = siegling(
                "base-e",
                Element.FIRE,
                List.of(new Notch(NotchDirection.RIGHT, Element.FIRE))
        );
        SieglingCard stage2 = siegling(
                "stage2-e",
                Element.FIRE,
                List.of(new Notch(NotchDirection.RIGHT, Element.FIRE))
        );
        stage2.setEvolvesFromId("base-e");
        SieglingCard stage3 = siegling(
                "stage3-e",
                Element.FIRE,
                List.of(new Notch(NotchDirection.RIGHT, Element.FIRE))
        );
        stage3.setEvolvesFromId("stage2-e");

        CardInstance baseInstance = new CardInstance(base.copy(), 1, 1, true);
        baseInstance.setBattlePhasesSeen(2);
        CardInstance evolved = placementService.createPlacedInstance(baseInstance, stage2.copy(), true, 1, 1);

        assertEquals(0, evolved.getBattlePhasesSeen());
        state.setAt(true, 1, 1, evolved);
        assertFalse(
                placementService.isEvolutionPlacement(state, true, 1, 1, stage3),
                "New evolution stage must complete a battle phase before evolving again."
        );
    }

    @Test
    void edgeSocketAllowsPlacementWithoutReciprocalCreatureLink() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));

        SieglingCard root = siegling(
                "root-mid",
                Element.FIRE,
                List.of(new Notch(NotchDirection.TOP, Element.FIRE))
        );
        CardInstance rootInstance = new CardInstance(root.copy(), 1, 1, true);
        rootInstance.setPlacementOrder(1);
        state.setAt(true, 1, 1, rootInstance);

        SieglingCard socketAnchor = siegling(
                "socket-left",
                Element.WATER,
                List.of(new Notch(NotchDirection.LEFT, Element.WATER))
        );

        List<int[]> placements = placementService.getLegalPlacements(state, true, socketAnchor);

        assertTrue(contains(placements, 0, 0), "Top-left player cell should be legal because its left socket can anchor the card.");
        assertTrue(contains(placements, 1, 0), "Middle-left player cell should be legal because its left socket can anchor the card.");
        assertTrue(contains(placements, 2, 0), "Front-left player cell should be legal because its left socket can anchor the card.");
    }

    @Test
    void externallyAnchoredCardCountsAsFoundationEvenWhenDisconnectedFromRoot() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));

        SieglingCard root = siegling(
                "root-mid",
                Element.FIRE,
                List.of(new Notch(NotchDirection.TOP, Element.FIRE))
        );
        CardInstance rootInstance = new CardInstance(root.copy(), 1, 1, true);
        rootInstance.setPlacementOrder(1);
        state.setAt(true, 1, 1, rootInstance);

        SieglingCard socketAnchor = siegling(
                "socket-left",
                Element.WATER,
                List.of(new Notch(NotchDirection.LEFT, Element.WATER))
        );
        CardInstance anchoredInstance = new CardInstance(socketAnchor.copy(), 1, 0, true);
        anchoredInstance.setPlacementOrder(2);
        state.setAt(true, 1, 0, anchoredInstance);

        List<CardInstance> foundation = placementService.getFoundationSieglings(state, true);

        assertEquals(2, foundation.size());
        assertTrue(foundation.contains(rootInstance));
        assertTrue(foundation.contains(anchoredInstance));
    }

    @Test
    void placementCanAnchorOffDisconnectedFriendlySiegling() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));

        SieglingCard root = siegling(
                "root-corner",
                Element.WATER,
                List.of(new Notch(NotchDirection.LEFT, Element.WATER))
        );
        CardInstance rootInstance = new CardInstance(root.copy(), 0, 0, true);
        rootInstance.setPlacementOrder(1);
        state.setAt(true, 0, 0, rootInstance);

        SieglingCard disconnectedNeighbor = siegling(
                "pylook-like",
                Element.FIRE,
                List.of(new Notch(NotchDirection.BOTTOM, Element.FIRE))
        );
        CardInstance disconnectedInstance = new CardInstance(disconnectedNeighbor.copy(), 2, 1, true);
        disconnectedInstance.setPlacementOrder(2);
        state.setAt(true, 2, 1, disconnectedInstance);

        SieglingCard emberfoxLike = siegling(
                "emberfox-like",
                Element.FIRE,
                List.of(
                        new Notch(NotchDirection.TOP, Element.FIRE),
                        new Notch(NotchDirection.LEFT, Element.FIRE),
                        new Notch(NotchDirection.RIGHT, Element.FIRE)
                )
        );

        List<int[]> placements = placementService.getLegalPlacements(state, true, emberfoxLike);

        assertTrue(
                contains(placements, 1, 1),
                "A card should be placeable if it can reciprocally link to any friendly neighbor on the board, even if that neighbor is not part of the current foundation cluster."
        );
    }

    @Test
    void directConnectedAlliesExcludeIndirectChainMembers() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));

        CardInstance source = new CardInstance(siegling(
                "source",
                Element.EARTH,
                List.of(new Notch(NotchDirection.LEFT, Element.EARTH))
        ), 1, 1, true);
        state.setAt(true, 1, 1, source);

        CardInstance direct = new CardInstance(siegling(
                "direct",
                Element.EARTH,
                List.of(
                        new Notch(NotchDirection.RIGHT, Element.EARTH),
                        new Notch(NotchDirection.TOP, Element.EARTH)
                )
        ), 1, 0, true);
        state.setAt(true, 1, 0, direct);

        CardInstance chained = new CardInstance(siegling(
                "chained",
                Element.EARTH,
                List.of(new Notch(NotchDirection.BOTTOM, Element.EARTH))
        ), 0, 0, true);
        state.setAt(true, 0, 0, chained);

        List<CardInstance> directAllies = placementService.getDirectlyConnectedAllies(state, source);

        assertEquals(1, directAllies.size());
        assertTrue(directAllies.contains(direct));
        assertFalse(directAllies.contains(chained));
    }

    private SieglingCard siegling(String id, Element element, List<Notch> notches) {
        return new SieglingCard(
                id,
                id,
                element,
                Rarity.COMMON,
                10,
                1,
                notches,
                Row.MIDDLE
        );
    }

    private boolean contains(List<int[]> placements, int row, int col) {
        return placements.stream().anyMatch(pos -> pos[0] == row && pos[1] == col);
    }
}
