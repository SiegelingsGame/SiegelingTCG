package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.Player;
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

    @Autowired
    private CardDefinitionService cardDefs;

    private static boolean handHas(GameState state, String id) {
        return state.getPlayer().getHand().stream()
                .anyMatch(c -> c != null && id.equalsIgnoreCase(c.getId()));
    }

    @Test
    void advancedStartsWithFivePerSideAndAPlayableDeceptionThenReachesBattle() {
        GameState state = gameService.newAdvancedTutorialGame("Student").state();
        assertEquals(Phase.SETUP, state.getCurrentPhase());
        assertEquals(6, state.getTurnNumber());
        for (boolean side : new boolean[]{true, false}) {
            int count = 0;
            for (int row = 0; row < 3; row++) {
                for (int col = 0; col < 3; col++) {
                    if (state.getAt(side, row, col) != null) count++;
                }
            }
            assertEquals(5, count);
        }
        assertTrue(state.getPlayer().getFireEnergy() >= 6);
        assertTrue(state.getPlayer().getEarthEnergy() >= 6);
        assertTrue(state.getEnemy().getIceEnergy() >= 3);
        int health = state.getAt(false, 1, 0).getCurrentHealth();
        gameService.castSpell(state, true, "trap13", 1, 0);
        assertTrue(!handHas(state, "trap13"), "Deception must be playable immediately.");
        assertTrue(state.getAt(false, 1, 0).getCurrentHealth() < health);
        gameService.endTurn(state, true);
        if (state.getCurrentPhase() == Phase.DRAW) gameService.draw(state, false);
        if (state.getCurrentPhase() == Phase.SETUP) gameService.endTurn(state, false);
        assertEquals(Phase.BATTLE, state.getCurrentPhase());
        for (int i = 0; i < 10 && state.getPendingBattleInstanceId() == null; i++) {
            gameService.executeBattle(state);
        }
        assertNotNull(state.getPendingBattleInstanceId(), "Prepared match must reach a player action.");
        assertTrue(!gameService.getPendingBattleAbilities(state).isEmpty());
    }

    @Test
    void openingHandHoldsTheRoundOneAndRoundTwoLessonCards() {
        GameState state = gameService.newTutorialGame("Student").state();
        assertTrue(!handHas(state, "squirebud"), "No Squire Bud in the opening hand.");
        assertTrue(handHas(state, "tutorial_ashfall"), "Ashfall starts in hand for its preview lesson.");
        assertTrue(handHas(state, "sundile"), "Round one opens with Sundile.");
        assertTrue(handHas(state, "pylook"), "Round two links Pylook to Sundile, so it must be dealt.");
        assertEquals("pylook",
                state.getPlayer().getHand().get(GameService.TUTORIAL_SCRIPTED_MULLIGAN_INDEX).getId(),
                "The practice-redraw slot must hold the SPARE Pylook, never a lesson card.");
    }

    @Test
    void theScriptedMulliganHandsOverGeneroot() {
        GameState state = gameService.newTutorialGame("Student").state();
        gameService.resolveOpeningMulligan(state, true, List.of(GameService.TUTORIAL_SCRIPTED_MULLIGAN_INDEX));
        assertTrue(handHas(state, "generoot"),
                "Redrawing the spare must deal Generoot.");
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
                assertEquals(turnNumber == 1 ? "raydile" : "floraknight", drawn.getId());
                assertTrue(!handHas(state, "squirebud"), "Squire Bud must wait until turn three.");
            }

            state.setTurnNumber(3);
            state.setCurrentPhase(Phase.DRAW);
            int before = state.getPlayer().getHand().size();
            gameService.draw(state, true);
            Card drawn = state.getPlayer().getHand().get(before);
            assertNotNull(drawn);
            assertEquals("squirebud", drawn.getId());
            assertTrue(handHas(state, "tutorial_ashfall"), "Ashfall must be available for its preview lesson.");
            SieglingCard partner = assertInstanceOf(SieglingCard.class, drawn,
                    "Round three must draw a Siegling to link a combo with.");
            assertEquals(Element.EARTH, partner.getElement(),
                    "Round three's draw is the combo partner — a different element to the Fire board.");
        }
    }

    /**
     * The combo lesson is gated on the student's own progress, so it can open well
     * after round three — and the partner drawn on round three can be spent before
     * it does. Reported from a real run: the coach said "tap a Siegling of a
     * different element" over an all-Fire hand, which cannot be complied with. The
     * partner is therefore re-hoisted on every draw from round three onward until
     * one is actually in hand.
     */
    @Test
    void aComboPartnerKeepsArrivingWhileTheHandHasNone() {
        GameState state = gameService.newTutorialGame("Student").state();
        gameService.resolveOpeningMulligan(state, true, List.of());

        for (int turnNumber = 1; turnNumber <= 2; turnNumber++) {
            state.setTurnNumber(turnNumber);
            state.setCurrentPhase(Phase.DRAW);
            gameService.draw(state, true);
        }

        // Round three deals one, then it is spent — the student places or loses it.
        state.setTurnNumber(3);
        state.setCurrentPhase(Phase.DRAW);
        gameService.draw(state, true);
        state.getPlayer().getHand().removeIf(c ->
                c instanceof SieglingCard s && s.getElement() != Element.FIRE);
        assertTrue(state.getPlayer().getHand().stream().noneMatch(c ->
                        c instanceof SieglingCard s && s.getElement() != Element.FIRE),
                "Precondition: the hand is all Fire once the partner is spent.");

        // Every later draw must keep offering one, or the lesson is unwinnable.
        for (int turnNumber = 4; turnNumber <= 6; turnNumber++) {
            state.setTurnNumber(turnNumber);
            state.setCurrentPhase(Phase.DRAW);
            int before = state.getPlayer().getHand().size();
            gameService.draw(state, true);
            Card drawn = state.getPlayer().getHand().get(before);
            SieglingCard partner = assertInstanceOf(SieglingCard.class, drawn,
                    "Round " + turnNumber + " must re-deal a combo partner, not a spell.");
            assertEquals(Element.EARTH, partner.getElement(),
                    "Round " + turnNumber + " must re-deal an off-element partner while the hand holds none.");
            state.getPlayer().getHand().removeIf(c ->
                    c instanceof SieglingCard s && s.getElement() != Element.FIRE);
        }
    }

    /**
     * Reproduces production. The tutorial asks for the deck "deck_fire_earth"
     * (Ashen Roots), but a preset deck is dashboard data and that one is NOT in
     * the live set — so `buildDeckById` falls back to the FIRST playable preset,
     * which live is the mono-Fire "Blazing Core". The scripted cards used to be
     * taken only from that pool, so squirebud and the Earth Strategies were
     * silently dropped and the combo lesson asked for an off-element Siegling the
     * deck could not contain. Reported from a real run: no Earth card ever drawn.
     *
     * The local catalog still has deck_fire_earth, which is exactly why this could
     * not be caught by starting a normal tutorial game here — the pool has to be
     * the mono-element one on purpose.
     */
    @Test
    void theScriptedStackSurvivesABackingDeckThatHasNoneOfItsCards() {
        Player player = new Player("Student", true);
        player.setDeck(cardDefs.buildDeckById("deck_fire"));
        assertTrue(player.getDeck().stream().noneMatch(c ->
                        c instanceof SieglingCard s && s.getElement() == Element.EARTH),
                "Precondition: the fallback deck is mono-Fire, as it is in production.");

        gameService.prepareTutorialPlayerDeck(player);

        assertTrue(player.getDeck().stream().anyMatch(c -> "squirebud".equalsIgnoreCase(c.getId())),
                "The Earth combo partner must be supplied from the catalog when the backing "
                        + "deck has none — otherwise the round-three lesson is unwinnable.");
        assertTrue(player.getDeck().stream().anyMatch(c ->
                        c instanceof SieglingCard s && !s.isEvolutionCard() && s.getElement() == Element.EARTH),
                "A placeable off-element Siegling must exist in the tutorial deck.");
        for (String id : List.of("sundile", "pylook", "raydile", "trap13", "tutorial_ashen_ward")) {
            assertTrue(player.getDeck().stream().anyMatch(c -> id.equalsIgnoreCase(c.getId())),
                    "Scripted lesson card '" + id + "' must survive a foreign backing deck too.");
        }
    }

    /** ...but it must stop once the student is holding one, or every later draw is Earth. */
    @Test
    void theHoistStopsOnceThePartnerIsInHand() {
        GameState state = gameService.newTutorialGame("Student").state();
        gameService.resolveOpeningMulligan(state, true, List.of());
        for (int turnNumber = 1; turnNumber <= 3; turnNumber++) {
            state.setTurnNumber(turnNumber);
            state.setCurrentPhase(Phase.DRAW);
            gameService.draw(state, true);
        }
        assertTrue(state.getPlayer().getHand().stream().anyMatch(c ->
                        c instanceof SieglingCard s && s.getElement() == Element.EARTH),
                "Precondition: round three dealt the partner and it is still held.");

        state.setTurnNumber(4);
        state.setCurrentPhase(Phase.DRAW);
        String expectedNext = state.getPlayer().getDeck().get(0).getId();
        int before = state.getPlayer().getHand().size();
        gameService.draw(state, true);
        Card drawn = state.getPlayer().getHand().get(before);
        assertEquals(expectedNext, drawn.getId(),
                "With a partner already in hand the deck must run normally, not keep hoisting Earth "
                        + "(got " + drawn.getId() + ").");
    }
}
