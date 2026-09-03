package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.GameState;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.SieglingCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Turn one of the tutorial is a fixed opening: every later lesson is built on
 * Sundile being on the board (Pylook links to it in round two, and the evolution
 * needs it to have survived a battle phase), so placing anything else first
 * derails the script. The restriction is enforced here, not merely recommended
 * by the coach, because a marker the player can ignore is what let this happen.
 */
@SpringBootTest
class TutorialOpenerPlacementTest {

    @Autowired
    private GameService gameService;

    private GameState freshTutorialSetup() {
        GameState state = gameService.newTutorialGame("Player").state();
        // Clear the mulligan (keep the hand) and advance to the player's Setup.
        if (state.getCurrentPhase() == Phase.MULLIGAN) {
            state = gameService.resolveOpeningMulligan(state, true, List.of());
        }
        if (state.getCurrentPhase() == Phase.DRAW) {
            state = gameService.draw(state, true);
        }
        return state;
    }

    private SieglingCard handSiegling(GameState state, boolean wantOpener) {
        for (Card c : state.getPlayer().getHand()) {
            if (c instanceof SieglingCard s && !s.isEvolutionCard()) {
                boolean isOpener = GameService.TUTORIAL_TURN_ONE_OPENER_ID.equalsIgnoreCase(s.getId());
                if (isOpener == wantOpener) {
                    return s;
                }
            }
        }
        return null;
    }

    @Test
    void turnOneRefusesAnySieglingButTheDesignatedOpener() {
        GameState state = freshTutorialSetup();
        assertEquals(1, state.getTurnNumber(), "precondition: this is turn one");

        SieglingCard other = handSiegling(state, false);
        assertNotNull(other, "the tutorial hand must hold a second Siegling for this test to mean anything");

        int before = countPlayerBoard(state);
        state = gameService.placeSiegling(state, true, other.getId(), 0, 0);

        assertEquals(before, countPlayerBoard(state),
                "placing " + other.getName() + " on turn one must be refused — the tutorial opens with Sundile");
        assertTrue(state.getGameLog().stream().anyMatch(l -> l != null && l.contains("opens with")),
                "the refusal must say which card opens, so the player is not left guessing");
    }

    @Test
    void turnOneAcceptsTheDesignatedOpener() {
        GameState state = freshTutorialSetup();
        SieglingCard opener = handSiegling(state, true);
        assertNotNull(opener, "Sundile must be in the tutorial opening hand");

        int before = countPlayerBoard(state);
        state = gameService.placeSiegling(state, true, opener.getId(), 0, 0);
        assertEquals(before + 1, countPlayerBoard(state),
                opener.getName() + " is the designated opener and must be accepted");
    }

    @Test
    void theRestrictionIsPublishedForTheClientAndLiftsAfterTurnOne() {
        GameState state = freshTutorialSetup();
        assertEquals(GameService.TUTORIAL_TURN_ONE_OPENER_ID, state.getTutorialRequiredPlacementId(),
                "the client locks the hand off this field, so turn one must publish it");

        // A normal (non-tutorial) match must never carry the restriction.
        GameState normal = gameService.newSoloGame(
                new GameService.StartOptions(null, null, null, null), "Player").state();
        if (normal.getCurrentPhase() == Phase.MULLIGAN) {
            normal = gameService.resolveOpeningMulligan(normal, true, List.of());
        }
        if (normal.getCurrentPhase() == Phase.DRAW) {
            normal = gameService.draw(normal, true);
        }
        assertNull(normal.getTutorialRequiredPlacementId(),
                "a normal match must not restrict the opening placement");
    }

    private int countPlayerBoard(GameState state) {
        int n = 0;
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (state.getAt(true, r, c) != null) n++;
            }
        }
        return n;
    }
}
