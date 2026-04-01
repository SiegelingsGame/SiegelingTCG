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
import static org.junit.jupiter.api.Assertions.assertTrue;

class PlacementServiceTest {

    private final PlacementService placementService = new PlacementService();

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
