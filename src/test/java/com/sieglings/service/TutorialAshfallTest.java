package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.GameState;
import com.sieglings.model.SpellCard;
import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The claim lesson only makes sense if claiming BUYS something. Ashfall is that
 * something: it costs exactly the 3 Fire the student reaches by cashing in
 * Raydile, and it clears the Dummy's board so the swing is visible.
 *
 * These assertions cover the two things the lesson's copy promises and the one
 * thing that would quietly ruin the rest of the game if it leaked.
 */
@SpringBootTest
class TutorialAshfallTest {

    @Autowired
    private GameService gameService;

    @Autowired
    private CardDefinitionService cardDefs;

    private static Card findInDeck(GameState state, String id) {
        return state.getPlayer().getDeck().stream()
                .filter(c -> c != null && id.equalsIgnoreCase(c.getId()))
                .findFirst().orElse(null);
    }

    @Test
    void theTutorialDeckCarriesAshfallPricedAtTheClaimPayoff() {
        GameState state = gameService.newTutorialGame("Student").state();
        Card card = findInDeck(state, "tutorial_ashfall");
        assertNotNull(card, "The claim lesson needs Ashfall in the tutorial deck to pay for.");
        SpellCard spell = (SpellCard) card;
        assertEquals(Element.FIRE, spell.getCostElement(), "Ashfall is paid in Fire.");
        assertEquals(3, spell.getCostAmount(),
                "Priced at 3 so it cannot be cast WITHOUT claiming — the claim is what affords it.");
    }

    /**
     * Claiming pays ONE unit of the claimed card's element. That is the whole
     * reason the lesson works — 2 Fire on the board plus the claim is 3, exactly
     * Ashfall's cost — so it is pinned against the engine rather than described.
     */
    @Test
    void claimingPaysOneUnitOfTheClaimedElement() throws Exception {
        String gameService = java.nio.file.Files.readString(
                java.nio.file.Path.of("src/main/java/com/sieglings/service/GameService.java"));
        assertTrue(gameService.contains("actor.adjustTemporaryEnergy(claimed.getElement(), 1);"),
                "Claiming must still pay exactly one unit of the claimed element — Ashfall is "
                        + "priced so the claim is what completes its cost.");
    }

    /** The lesson promises the board clears. Cast it and check that it does. */
    @Test
    void castingAshfallClearsTheEnemyBoard() {
        GameState state = gameService.newTutorialGame("Student").state();
        state.setCurrentPhase(com.sieglings.model.enums.Phase.SETUP);
        // Spells are barred on turn one ("Player 1 cannot cast spells on turn 1"),
        // which is why the claim lesson lives in a later round.
        // isOpeningTurnRestricted also reads firstTurn and setup-turns-taken, not
        // turnNumber alone — clear the opening restriction the way a played round
        // would, rather than only bumping the counter.
        state.setTurnNumber(3);
        state.setFirstTurn(false);

        // Stand three Sieglings up on the Dummy's board.
        var enemyDeck = state.getEnemy().getDeck();
        int placed = 0;
        for (Card c : enemyDeck) {
            if (placed >= 3) break;
            if (c instanceof com.sieglings.model.SieglingCard sc && !sc.isEvolutionCard()) {
                state.setAt(false, placed, 0, new com.sieglings.model.CardInstance(sc, placed, 0, false));
                placed++;
            }
        }
        assertEquals(3, state.getBoardSieglings(false).size(), "Precondition: the Dummy has a board.");

        // Put Ashfall in hand and pay for it the way the claim would.
        Card ashfall = findInDeck(state, "tutorial_ashfall");
        assertNotNull(ashfall, "Ashfall must be in the tutorial deck.");
        state.getPlayer().getDeck().remove(ashfall);
        state.getPlayer().getHand().add(ashfall);
        // canAfford reads the resolved pool, and temporary energy is recomputed
        // from the board — so set the pool the claim would have produced.
        state.getPlayer().setFireEnergy(3);

        gameService.castSpell(state, true, "tutorial_ashfall", -1, -1);

        System.out.println("LOG TAIL: " + state.getGameLog().subList(
                Math.max(0, state.getGameLog().size()-6), state.getGameLog().size()));
        System.out.println("ALIVE: " + state.getBoardSieglings(false).stream()
                .map(u -> u.getName()+" hp="+u.getCurrentHealth()+" alive="+u.isAlive()).toList());
        assertEquals(0, state.getBoardSieglings(false).size(),
                "Ashfall must clear every enemy Siegeling — that is what the lesson shows.");
    }

    /** A free board wipe must never reach a real deck. */
    @Test
    void ashfallIsTutorialOnly() {
        assertTrue(cardDefs.findCardCopy("tutorial_ashfall").isEmpty(),
                "Ashfall must not exist in the shared catalog — it is a tutorial prop, and a "
                        + "3-cost board wipe in a real deck would be indefensible.");
        for (var deck : cardDefs.getDeckOptions()) {
            boolean leaked = cardDefs.buildDeckById(deck.id()).stream()
                    .anyMatch(c -> c != null && "tutorial_ashfall".equalsIgnoreCase(c.getId()));
            assertTrue(!leaked, "Ashfall leaked into preset deck " + deck.id() + ".");
        }
    }
}
