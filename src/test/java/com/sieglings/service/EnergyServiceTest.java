package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
    void movingAwayFromTheNetworkRemovesBrokenConnectionEnergy() {
        SieglingCard root = new SieglingCard(
                "root-fire",
                "Root Fire",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.TOP, Element.FIRE)),
                Row.MIDDLE
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
                Row.FRONT
        );
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI Opponent", false));

        CardInstance rootInstance = new CardInstance(root.copy(), 1, 1, true);
        rootInstance.setPlacementOrder(1);
        CardInstance moverInstance = new CardInstance(mover.copy(), 2, 1, true);
        moverInstance.setPlacementOrder(2);
        state.setAt(true, 1, 1, rootInstance);
        state.setAt(true, 2, 1, moverInstance);

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

        assertTrue(state.getAt(true, 2, 2) == moverInstance, "Mover should relocate to the only open destination.");
        EnergyService.EnergyBreakdown afterMove = energyService.getBreakdown(state, true);
        assertEquals(0, afterMove.fireInternal());
        assertEquals(0, afterMove.fireTotal());
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
