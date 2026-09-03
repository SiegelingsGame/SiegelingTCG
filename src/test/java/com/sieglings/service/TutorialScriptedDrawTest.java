package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.GameState;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Phase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The Arena tutorial's lesson order is only true if the cards arrive on the turns
 * the coach talks about them: Sundile and Pylook in the opening hand (round two
 * links them), Raydile off the top the moment the scripted mulligan fires (round
 * two evolves with it), and an off-element partner on the round-three draw, which
 * is where the combo lesson lives.
 */
@SpringBootTest
class TutorialScriptedDrawTest {

    @Autowired
    private GameService gameService;

    private static boolean handHas(GameState state, String id) {
        return state.getPlayer().getHand().stream()
                .anyMatch(c -> c != null && id.equalsIgnoreCase(c.getId()));
    }

    @Test
    void openingHandHoldsTheRoundOneAndRoundTwoLessonCards() {
        GameState state = gameService.newTutorialGame("Student").state();
        assertTrue(handHas(state, "sundile"), "Round one opens with Sundile.");
        assertTrue(handHas(state, "pylook"), "Round two links Pylook to Sundile, so it must be dealt.");
        assertEquals("pylook",
                state.getPlayer().getHand().get(GameService.TUTORIAL_SCRIPTED_MULLIGAN_INDEX).getId(),
                "The practice-redraw slot must hold the SPARE Pylook, never a lesson card.");
    }

    @Test
    void theScriptedMulliganHandsOverTheEvolutionRoundTwoNeeds() {
        GameState state = gameService.newTutorialGame("Student").state();
        gameService.resolveOpeningMulligan(state, true, List.of(GameService.TUTORIAL_SCRIPTED_MULLIGAN_INDEX));
        assertTrue(handHas(state, "raydile"),
                "Redrawing the spare must deal Raydile — round two evolves Sundile with it.");
        assertTrue(handHas(state, "pylook"), "The kept Pylook must survive the redraw.");
    }

    /**
     * The mulligan shifts every later draw by one card, so the Earth partner cannot
     * simply be pinned to a deck position — it is hoisted for the round-three draw.
     * Asserted on both branches because the student may keep their hand.
     */
    @Test
    void roundThreeDrawsAnOffElementComboPartnerWhicheverMulliganWasTaken() {
        for (boolean redraw : new boolean[]{true, false}) {
            GameState state = gameService.newTutorialGame("Student").state();
            gameService.resolveOpeningMulligan(state, true,
                    redraw ? List.of(GameService.TUTORIAL_SCRIPTED_MULLIGAN_INDEX) : List.of());

            // Rounds one and two must not hand the combo partner over early — the
            // coach has the player linking Fire and evolving in those rounds.
            for (int turnNumber : new int[]{1, 2}) {
                state.setTurnNumber(turnNumber);
                state.setCurrentPhase(Phase.DRAW);
                int before = state.getPlayer().getHand().size();
                gameService.draw(state, true);
                Card drawn = state.getPlayer().getHand().get(before);
                assertTrue(!(drawn instanceof SieglingCard s) || s.getElement() == Element.FIRE,
                        "Round " + turnNumber + " must not deal an off-element Siegling (got " + drawn.getId() + ").");
            }

            state.setTurnNumber(3);
            state.setCurrentPhase(Phase.DRAW);
            int before = state.getPlayer().getHand().size();
            gameService.draw(state, true);
            Card drawn = state.getPlayer().getHand().get(before);
            assertNotNull(drawn);
            SieglingCard partner = assertInstanceOf(SieglingCard.class, drawn,
                    "Round three must draw a Siegling to link a combo with.");
            assertEquals(Element.EARTH, partner.getElement(),
                    "Round three's draw is the combo partner — a different element to the Fire board.");
        }
    }
}
