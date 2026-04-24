package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EnergyServiceTest {

    private final CardDefinitionService cardDefinitions = new CardDefinitionService();
    private final PlacementService placementService = new PlacementService();
    private final EnergyService energyService = new EnergyService(placementService);
    private final EffectService effectService = new EffectService();

    @Test
    void enemyFrontLeftClawkidOnlyGetsLeftSocketEnergy() {
        SieglingCard clawkid = findSiegling("clawkid");
        GameState state = enemyStateWithCard(clawkid, 2, 0);

        EnergyService.EnergyBreakdown breakdown = energyService.getBreakdown(state, false);

        assertEquals(1, breakdown.waterExternal());
        assertEquals(1, breakdown.waterTotal());
    }

    @Test
    void enemyFrontLeftDiagonalNotchDoesNotActivateExternalSocket() {
        SieglingCard diagonalOnly = new SieglingCard(
                "diag-water",
                "Diagonal Water",
                Element.WATER,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.TOP_LEFT, Element.WATER)),
                Row.FRONT
        );
        GameState state = enemyStateWithCard(diagonalOnly, 2, 0);

        EnergyService.EnergyBreakdown breakdown = energyService.getBreakdown(state, false);

        assertEquals(0, breakdown.waterExternal());
        assertEquals(0, breakdown.waterTotal());
    }

    @Test
    void playerBackRowOuterNotchActivatesExternalSocket() {
        SieglingCard outerFire = new SieglingCard(
                "outer-fire",
                "Outer Fire",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.BOTTOM, Element.FIRE)),
                Row.BACK
        );
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI Opponent", false));
        state.setAt(true, 0, 1, new CardInstance(outerFire.copy(), 0, 1, true));

        EnergyService.EnergyBreakdown breakdown = energyService.getBreakdown(state, true);

        assertEquals(1, breakdown.fireExternal());
        assertEquals(1, breakdown.fireTotal());
    }

    @Test
    void movingAwayFromTheNetworkRemovesBrokenConnectionEnergy() {
        SieglingCard root = new SieglingCard(
                "root-fire",
                "Root Fire",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.TOP, Element.FIRE)),
                Row.BACK
        );
        SieglingCard mover = new SieglingCard(
                "mover-fire",
                "Mover Fire",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(
                        new Notch(NotchDirection.BOTTOM, Element.FIRE),
                        new Notch(NotchDirection.RIGHT, Element.FIRE)
                ),
                Row.MIDDLE
        );
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI Opponent", false));

        CardInstance rootInstance = new CardInstance(root.copy(), 0, 0, true);
        rootInstance.setPlacementOrder(1);
        CardInstance moverInstance = new CardInstance(mover.copy(), 1, 0, true);
        moverInstance.setPlacementOrder(2);
        state.setAt(true, 0, 0, rootInstance);
        state.setAt(true, 1, 0, moverInstance);

        EnergyService.EnergyBreakdown beforeMove = energyService.getBreakdown(state, true);
        assertEquals(1, beforeMove.fireInternal());
        assertEquals(1, beforeMove.fireTotal());

        Ability move = new Ability(
                "Slip",
                "Move this Siegling to an open linked point",
                TargetType.SELF,
                null,
                0,
                "move_link",
                0,
                false
        );
        effectService.resolveAbility(state, move, moverInstance, true, -1, -1);
        energyService.recalculateEnergy(state);

        assertTrue(state.getAt(true, 1, 1) == moverInstance, "Mover should relocate to the only open destination.");
        EnergyService.EnergyBreakdown afterMove = energyService.getBreakdown(state, true);
        assertEquals(0, afterMove.fireInternal());
        assertEquals(0, afterMove.fireTotal());
    }

    @Test
    void matchingHorizontalPairCreatesNexusWithoutComboPoint() {
        SieglingCard left = new SieglingCard(
                "nx-left",
                "Nx Left",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.RIGHT, Element.FIRE)),
                Row.MIDDLE
        );
        SieglingCard right = new SieglingCard(
                "nx-right",
                "Nx Right",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.LEFT, Element.FIRE)),
                Row.MIDDLE
        );
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI Opponent", false));
        state.setAt(true, 1, 0, new CardInstance(left.copy(), 1, 0, true));
        state.setAt(true, 1, 1, new CardInstance(right.copy(), 1, 1, true));

        EnergyService.EnergyBreakdown b = energyService.getBreakdown(state, true);

        assertEquals(1, b.fireInternal());
        assertEquals(1, b.nexusPoints().size());
        assertEquals(2, b.nexusPoints().get(0).notchCount());
        assertTrue(b.comboPoints().isEmpty());
    }

    @Test
    void mismatchedHorizontalPairCreatesNexusAndDistinctComboSignature() {
        SieglingCard left = new SieglingCard(
                "nx-ice",
                "Nx Ice",
                Element.ICE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.RIGHT, Element.ICE)),
                Row.MIDDLE
        );
        SieglingCard right = new SieglingCard(
                "nx-fire",
                "Nx Fire",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.LEFT, Element.FIRE)),
                Row.MIDDLE
        );
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI Opponent", false));
        state.setAt(true, 1, 0, new CardInstance(left.copy(), 1, 0, true));
        state.setAt(true, 1, 1, new CardInstance(right.copy(), 1, 1, true));

        EnergyService.EnergyBreakdown b = energyService.getBreakdown(state, true);

        assertEquals(0, b.fireInternal());
        assertEquals(0, b.iceInternal());
        assertEquals(1, b.nexusPoints().size());
        assertEquals(2, b.nexusPoints().get(0).notchCount());
        assertEquals(1, b.comboPoints().size());
        assertEquals("FIRE+ICE", b.comboPoints().get(0).signature());
        assertEquals(2, b.comboPoints().get(0).size());
    }

    @Test
    void spellComboGateUsesDistinctComboSignatureNotNotchMultiplicity() {
        SieglingCard left = new SieglingCard(
                "gate-ice",
                "Gate Ice",
                Element.ICE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.RIGHT, Element.ICE)),
                Row.MIDDLE
        );
        SieglingCard right = new SieglingCard(
                "gate-fire",
                "Gate Fire",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.LEFT, Element.FIRE)),
                Row.MIDDLE
        );
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI Opponent", false));
        state.setAt(true, 1, 0, new CardInstance(left.copy(), 1, 0, true));
        state.setAt(true, 1, 1, new CardInstance(right.copy(), 1, 1, true));

        SpellCard spell = new SpellCard("gate-spell", "Gate", Element.FIRE, Rarity.COMMON, 0, null);
        spell.setCostElement(Element.NEUTRAL);
        spell.setCostAmount(0);
        spell.setRequiredComboSize(2);
        spell.setRequiredComboSignature("FIRE+ICE");

        assertTrue(energyService.canCastSpell(state, true, spell));

        spell.setRequiredComboSignature("FIRE+FIRE");
        assertFalse(energyService.canCastSpell(state, true, spell));
    }

    /**
     * Four diagonal notches meeting lattice (2,2): (0,0) TR, (0,1) TL, (1,0) BR, (1,1) BL — all same element.
     * Extra orthogonal notches form a cycle so all four Sieglings stay in {@link PlacementService#getFoundationSieglings}.
     */
    @Test
    void fourSameElementNotchesAtOneInteriorLatticeYieldNexusWithoutCombo() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI Opponent", false));

        SieglingCard s00 = new SieglingCard("q00", "Q00", Element.FIRE, Rarity.COMMON, 10, 1,
                List.of(new Notch(NotchDirection.TOP_RIGHT, Element.FIRE),
                        new Notch(NotchDirection.RIGHT, Element.FIRE),
                        new Notch(NotchDirection.BOTTOM, Element.FIRE)), Row.MIDDLE);
        SieglingCard s01 = new SieglingCard("q01", "Q01", Element.FIRE, Rarity.COMMON, 10, 1,
                List.of(new Notch(NotchDirection.TOP_LEFT, Element.FIRE),
                        new Notch(NotchDirection.LEFT, Element.FIRE),
                        new Notch(NotchDirection.BOTTOM, Element.FIRE)), Row.MIDDLE);
        SieglingCard s10 = new SieglingCard("q10", "Q10", Element.FIRE, Rarity.COMMON, 10, 1,
                List.of(new Notch(NotchDirection.BOTTOM_RIGHT, Element.FIRE),
                        new Notch(NotchDirection.TOP, Element.FIRE),
                        new Notch(NotchDirection.RIGHT, Element.FIRE)), Row.MIDDLE);
        SieglingCard s11 = new SieglingCard("q11", "Q11", Element.FIRE, Rarity.COMMON, 10, 1,
                List.of(new Notch(NotchDirection.BOTTOM_LEFT, Element.FIRE),
                        new Notch(NotchDirection.TOP, Element.FIRE),
                        new Notch(NotchDirection.LEFT, Element.FIRE)), Row.MIDDLE);

        CardInstance i00 = new CardInstance(s00.copy(), 0, 0, true);
        CardInstance i01 = new CardInstance(s01.copy(), 0, 1, true);
        CardInstance i10 = new CardInstance(s10.copy(), 1, 0, true);
        CardInstance i11 = new CardInstance(s11.copy(), 1, 1, true);
        i00.setPlacementOrder(1);
        i01.setPlacementOrder(2);
        i10.setPlacementOrder(3);
        i11.setPlacementOrder(4);
        state.setAt(true, 0, 0, i00);
        state.setAt(true, 0, 1, i01);
        state.setAt(true, 1, 0, i10);
        state.setAt(true, 1, 1, i11);

        EnergyService.EnergyBreakdown b = energyService.getBreakdown(state, true);

        EnergyService.NexusPoint nexus = b.nexusPoints().stream()
                .filter(p -> p.x() == 2 && p.y() == 2)
                .findFirst()
                .orElseThrow();
        assertEquals(4, nexus.notchCount());
        assertEquals(4, nexus.contributingElements().size());
        assertTrue(nexus.contributingElements().stream().allMatch(e -> e == Element.FIRE));
        assertTrue(b.comboPoints().isEmpty());
    }

    /** ICE, ICE, FIRE, FIRE at (2,2) collapses to one FIRE+ICE combo; nexus still reports four notches. */
    @Test
    void fourNotchesTwoElementsEachCollapseToOneDistinctComboSignature() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI Opponent", false));

        SieglingCard s00 = new SieglingCard("m00", "M00", Element.ICE, Rarity.COMMON, 10, 1,
                List.of(new Notch(NotchDirection.TOP_RIGHT, Element.ICE),
                        new Notch(NotchDirection.RIGHT, Element.FIRE),
                        new Notch(NotchDirection.BOTTOM, Element.FIRE)), Row.MIDDLE);
        SieglingCard s01 = new SieglingCard("m01", "M01", Element.ICE, Rarity.COMMON, 10, 1,
                List.of(new Notch(NotchDirection.TOP_LEFT, Element.ICE),
                        new Notch(NotchDirection.LEFT, Element.FIRE),
                        new Notch(NotchDirection.BOTTOM, Element.FIRE)), Row.MIDDLE);
        SieglingCard s10 = new SieglingCard("m10", "M10", Element.FIRE, Rarity.COMMON, 10, 1,
                List.of(new Notch(NotchDirection.BOTTOM_RIGHT, Element.FIRE),
                        new Notch(NotchDirection.TOP, Element.FIRE),
                        new Notch(NotchDirection.RIGHT, Element.FIRE)), Row.MIDDLE);
        SieglingCard s11 = new SieglingCard("m11", "M11", Element.FIRE, Rarity.COMMON, 10, 1,
                List.of(new Notch(NotchDirection.BOTTOM_LEFT, Element.FIRE),
                        new Notch(NotchDirection.TOP, Element.FIRE),
                        new Notch(NotchDirection.LEFT, Element.FIRE)), Row.MIDDLE);

        CardInstance i00 = new CardInstance(s00.copy(), 0, 0, true);
        CardInstance i01 = new CardInstance(s01.copy(), 0, 1, true);
        CardInstance i10 = new CardInstance(s10.copy(), 1, 0, true);
        CardInstance i11 = new CardInstance(s11.copy(), 1, 1, true);
        i00.setPlacementOrder(1);
        i01.setPlacementOrder(2);
        i10.setPlacementOrder(3);
        i11.setPlacementOrder(4);
        state.setAt(true, 0, 0, i00);
        state.setAt(true, 0, 1, i01);
        state.setAt(true, 1, 0, i10);
        state.setAt(true, 1, 1, i11);

        EnergyService.EnergyBreakdown b = energyService.getBreakdown(state, true);

        EnergyService.NexusPoint nexus = b.nexusPoints().stream()
                .filter(p -> p.x() == 2 && p.y() == 2)
                .findFirst()
                .orElseThrow();
        assertEquals(4, nexus.notchCount());
        assertEquals(1, b.comboPoints().size());
        assertEquals("FIRE+ICE", b.comboPoints().get(0).signature());
        assertEquals(2, b.comboPoints().get(0).size());
    }

    private GameState enemyStateWithCard(SieglingCard card, int row, int col) {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI Opponent", false));
        state.setAt(false, row, col, new CardInstance(card.copy(), row, col, false));
        return state;
    }

    private SieglingCard findSiegling(String cardId) {
        return (SieglingCard) cardDefinitions.getDeckBuilderCatalog().stream()
                .filter(card -> cardId.equals(card.getId()))
                .findFirst()
                .map(Card.class::cast)
                .orElseThrow(() -> new IllegalArgumentException("Missing card: " + cardId));
    }
}
