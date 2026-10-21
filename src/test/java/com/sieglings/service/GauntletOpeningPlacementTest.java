package com.sieglings.service;

import com.sieglings.model.*;
import com.sieglings.model.enums.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class GauntletOpeningPlacementTest {
    private final PlacementService placement = new PlacementService();

    private GameState seed(List<GameService.GauntletPlacement> pack) {
        GameService service = new GameService();
        ReflectionTestUtils.setField(service, "placementService", placement);
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("Pack", false));
        state.getEnemy().setDeck(new ArrayList<>());
        service.placeGauntletOpeningBoard(state, pack);
        return state;
    }

    private SieglingCard card(String id, NotchDirection... directions) {
        return new SieglingCard(id, id, Element.FIRE, Rarity.COMMON, 10, 3,
                java.util.Arrays.stream(directions).map(d -> new Notch(d, Element.FIRE)).toList(), Row.FRONT);
    }

    @Test
    void relocatesAnUnconnectedPreferredSquareToAReciprocalNotch() {
        SieglingCard first = card("first", NotchDirection.RIGHT);
        SieglingCard second = card("second", NotchDirection.LEFT);
        GameState state = seed(List.of(new GameService.GauntletPlacement(first, 1, 1),
                new GameService.GauntletPlacement(second, 2, 1)));
        assertNull(state.getAt(false, 2, 1), "A square without a notch connection must remain empty");
        assertEquals(2, state.countBoardSieglings(false));
        CardInstance placed = state.getBoardSieglings(false).stream()
                .filter(c -> c.getCard().getId().equals("second")).findFirst().orElseThrow();
        assertTrue(placement.hasExternalSocketAnchor(placed, false)
                || !placement.getDirectlyConnectedAllies(state, placed).isEmpty());
    }

    @Test
    void keepsCardsWithNoLegalConnectionInTheDeck() {
        SieglingCard stranded = card("stranded");
        GameState state = seed(List.of(new GameService.GauntletPlacement(card("first"), 1, 1),
                new GameService.GauntletPlacement(stranded, 2, 1)));
        assertEquals(1, state.countBoardSieglings(false));
        assertEquals(List.of(stranded), state.getEnemy().getDeck());
    }

    @Test
    void openingEvolvedFightersStillRespectConnectionsAndFiveCardLimit() {
        List<GameService.GauntletPlacement> pack = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            SieglingCard evolved = card("evolved-" + i, NotchDirection.TOP, NotchDirection.BOTTOM,
                    NotchDirection.LEFT, NotchDirection.RIGHT);
            evolved.setEvolvesFromId("base");
            pack.add(new GameService.GauntletPlacement(evolved, 1, 1));
        }
        GameState state = seed(pack);
        assertEquals(5, state.countBoardSieglings(false));
        assertEquals(1, state.getEnemy().getDeck().size());
        assertTrue(placement.getLegalPlacements(new GameState(), false, pack.get(0).card()).isEmpty(),
                "Normal play must still require a base card for evolution");
    }
}
