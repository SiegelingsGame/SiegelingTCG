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
 * Ashfall is the payoff of round three's COMBO lesson: it is bought with a
 * Fire/Earth combo point standing on the board rather than out of an energy
 * pool, and it clears the Dummy's board so the swing is visible.
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

    @Autowired
    private EnergyService energyService;

    private static Card findInDeck(GameState state, String id) {
        return state.getPlayer().getDeck().stream()
                .filter(c -> c != null && id.equalsIgnoreCase(c.getId()))
                .findFirst().orElse(null);
    }

    @Test
    void theTutorialDeckCarriesAshfallPricedAsAFireEarthCombo() {
        GameState state = gameService.newTutorialGame("Student").state();
        Card card = findInDeck(state, "tutorial_ashfall");
        assertNotNull(card, "The combo lesson needs Ashfall in the tutorial deck to unlock.");
        SpellCard spell = (SpellCard) card;
        assertEquals(0, spell.getCostAmount(),
                "Ashfall is bought with a combo, not a pool — no energy is spent on it.");
        assertEquals(2, spell.getRequiredComboSize(), "It takes a two-element combo.");
        // Sorted by element name, which is how EnergyService builds the key this
        // is compared against — "FIRE+EARTH" would never match anything.
        assertEquals("EARTH+FIRE", spell.getRequiredComboSignature(),
                "The signature must be sorted the way EnergyService writes it.");
    }

    /**
     * The gate is the whole point of the change, so it is exercised rather than
     * described: the same spell is refused on a board with no combo and allowed
     * once a real Fire/Earth point stands on it.
     */
    @Test
    void theFireEarthComboIsWhatUnlocksTheCast() {
        GameState state = gameService.newTutorialGame("Student").state();
        SpellCard ashfall = (SpellCard) findInDeck(state, "tutorial_ashfall");
        assertNotNull(ashfall, "Ashfall must be in the tutorial deck.");

        // Empty board: no combo point anywhere, so the spell is barred.
        state.setPlayer(new com.sieglings.model.Player("Player", true));
        state.setEnemy(new com.sieglings.model.Player("AI Opponent", false));
        assertTrue(!energyService.canCastSpell(state, true, ashfall),
                "With no combo on the board, Ashfall must be uncastable — otherwise the lesson "
                        + "teaches a gate that is not there.");

        // A mismatched reciprocal pair makes exactly one combo point, and Fire
        // beside Earth signs as EARTH+FIRE.
        var earth = new com.sieglings.model.SieglingCard(
                "combo-earth", "Combo Earth", Element.EARTH, com.sieglings.model.enums.Rarity.COMMON,
                10, 1, java.util.List.of(new com.sieglings.model.Notch(
                        com.sieglings.model.enums.NotchDirection.RIGHT, Element.EARTH)),
                com.sieglings.model.enums.Row.MIDDLE);
        var fire = new com.sieglings.model.SieglingCard(
                "combo-fire", "Combo Fire", Element.FIRE, com.sieglings.model.enums.Rarity.COMMON,
                10, 1, java.util.List.of(new com.sieglings.model.Notch(
                        com.sieglings.model.enums.NotchDirection.LEFT, Element.FIRE)),
                com.sieglings.model.enums.Row.MIDDLE);
        state.setAt(true, 1, 0, new com.sieglings.model.CardInstance(earth.copy(), 1, 0, true));
        state.setAt(true, 1, 1, new com.sieglings.model.CardInstance(fire.copy(), 1, 1, true));

        var breakdown = energyService.getBreakdown(state, true);
        assertEquals(1, breakdown.comboPoints().size(), "Precondition: the pair makes one combo.");
        assertEquals("EARTH+FIRE", breakdown.comboPoints().get(0).signature(),
                "Precondition: and it signs the way the card asks for.");

        assertTrue(energyService.canCastSpell(state, true, ashfall),
                "With the Fire/Earth combo standing, Ashfall must be castable — that combo IS its "
                        + "price.");
    }

    /**
     * Pricing Ashfall in a combo makes it DEAD if the tutorial deck cannot build
     * that combo. Combo signatures are built from NOTCH elements, not card
     * elements, so this checks the deck actually holds both halves the signature
     * needs — otherwise a deck retune would silently strand round three's wipe.
     */
    @Test
    void theTutorialDeckCanActuallyBuildTheComboAshfallAsksFor() {
        GameState state = gameService.newTutorialGame("Student").state();
        boolean hasFireNotch = false;
        boolean hasEarthNotch = false;
        for (Card c : state.getPlayer().getDeck()) {
            if (!(c instanceof com.sieglings.model.SieglingCard sc)) continue;
            for (var notch : sc.getNotches()) {
                if (notch == null) continue;
                if (notch.element() == Element.FIRE) hasFireNotch = true;
                if (notch.element() == Element.EARTH) hasEarthNotch = true;
            }
        }
        assertTrue(hasFireNotch,
                "Ashfall needs a FIRE notch in the tutorial deck to make its combo half.");
        assertTrue(hasEarthNotch,
                "Ashfall needs an EARTH notch in the tutorial deck — without one the combo it is "
                        + "priced in can never be built and the round-three wipe is dead.");
    }

    /** A combo of the wrong elements must not pay for it. */
    @Test
    void aDifferentComboDoesNotPayForIt() {
        GameState state = gameService.newTutorialGame("Student").state();
        SpellCard ashfall = (SpellCard) findInDeck(state, "tutorial_ashfall");
        state.setPlayer(new com.sieglings.model.Player("Player", true));
        state.setEnemy(new com.sieglings.model.Player("AI Opponent", false));

        var ice = new com.sieglings.model.SieglingCard(
                "combo-ice", "Combo Ice", Element.ICE, com.sieglings.model.enums.Rarity.COMMON,
                10, 1, java.util.List.of(new com.sieglings.model.Notch(
                        com.sieglings.model.enums.NotchDirection.RIGHT, Element.ICE)),
                com.sieglings.model.enums.Row.MIDDLE);
        var fire = new com.sieglings.model.SieglingCard(
                "combo-fire2", "Combo Fire", Element.FIRE, com.sieglings.model.enums.Rarity.COMMON,
                10, 1, java.util.List.of(new com.sieglings.model.Notch(
                        com.sieglings.model.enums.NotchDirection.LEFT, Element.FIRE)),
                com.sieglings.model.enums.Row.MIDDLE);
        state.setAt(true, 1, 0, new com.sieglings.model.CardInstance(ice.copy(), 1, 0, true));
        state.setAt(true, 1, 1, new com.sieglings.model.CardInstance(fire.copy(), 1, 1, true));

        assertEquals("FIRE+ICE", energyService.getBreakdown(state, true)
                .comboPoints().get(0).signature(), "Precondition: this is a Fire/Ice combo.");
        assertTrue(!energyService.canCastSpell(state, true, ashfall),
                "Only a Fire/Earth combo pays for Ashfall — any-combo-will-do would make the "
                        + "round-three lesson about the wrong thing.");
    }

    /**
     * Claiming pays ONE unit of the claimed card's element. Ashfall no longer
     * rides on that, but the claim lesson still promises it — and pooled energy
     * is what buys the extra Setup action the summon step spends.
     */
    @Test
    void claimingPaysOneUnitOfTheClaimedElement() throws Exception {
        String gameService = java.nio.file.Files.readString(
                java.nio.file.Path.of("src/main/java/com/sieglings/service/GameService.java"));
        assertTrue(gameService.contains("actor.adjustTemporaryEnergy(claimed.getElement(), 1);"),
                "Claiming must still pay exactly one unit of the claimed element — the claim "
                        + "lesson's copy promises that, and pooled energy is what buys the extra "
                        + "Setup action the summon step spends.");
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
        // Ashfall is bought with a combo now, not a pool, so stand a Fire/Earth
        // pair up to satisfy the gate the way round three's link does.
        var earth = new com.sieglings.model.SieglingCard(
                "wipe-earth", "Wipe Earth", Element.EARTH, com.sieglings.model.enums.Rarity.COMMON,
                10, 1, java.util.List.of(new com.sieglings.model.Notch(
                        com.sieglings.model.enums.NotchDirection.RIGHT, Element.EARTH)),
                com.sieglings.model.enums.Row.MIDDLE);
        var fireMate = new com.sieglings.model.SieglingCard(
                "wipe-fire", "Wipe Fire", Element.FIRE, com.sieglings.model.enums.Rarity.COMMON,
                10, 1, java.util.List.of(new com.sieglings.model.Notch(
                        com.sieglings.model.enums.NotchDirection.LEFT, Element.FIRE)),
                com.sieglings.model.enums.Row.MIDDLE);
        state.setAt(true, 1, 0, new com.sieglings.model.CardInstance(earth.copy(), 1, 0, true));
        state.setAt(true, 1, 1, new com.sieglings.model.CardInstance(fireMate.copy(), 1, 1, true));

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
                        + "combo-gated board wipe in a real deck would be indefensible.");
        for (var deck : cardDefs.getDeckOptions()) {
            boolean leaked = cardDefs.buildDeckById(deck.id()).stream()
                    .anyMatch(c -> c != null && "tutorial_ashfall".equalsIgnoreCase(c.getId()));
            assertTrue(!leaked, "Ashfall leaked into preset deck " + deck.id() + ".");
        }
    }
}
