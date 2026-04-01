package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class EffectServiceTest {

    private final EffectService effectService = new EffectService();

    @Test
    void connectedAlliesHealthBoostOnlyAffectsLinkedAllies() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);

        CardInstance source = instance("source", List.of(
                new Notch(NotchDirection.LEFT, Element.EARTH),
                new Notch(NotchDirection.RIGHT, Element.EARTH)
        ), 1, 1);
        source.setPlacementOrder(1);
        state.setAt(true, 1, 1, source);

        CardInstance linkedLeft = instance("linked-left", List.of(
                new Notch(NotchDirection.RIGHT, Element.EARTH)
        ), 1, 0);
        linkedLeft.setPlacementOrder(2);
        state.setAt(true, 1, 0, linkedLeft);

        CardInstance linkedRight = instance("linked-right", List.of(
                new Notch(NotchDirection.LEFT, Element.EARTH)
        ), 1, 2);
        linkedRight.setPlacementOrder(3);
        state.setAt(true, 1, 2, linkedRight);

        CardInstance isolated = instance("isolated", List.of(
                new Notch(NotchDirection.TOP, Element.EARTH)
        ), 0, 2);
        isolated.setPlacementOrder(4);
        state.setAt(true, 0, 2, isolated);

        Ability aura = Ability.connectedAlliesHealthBoost(
                "Root Circuit",
                "Connected allies gain +2 max Health",
                2
        );

        effectService.resolveAbility(state, aura, source, true, source.getBoardRow(), source.getBoardCol());

        assertEquals(10, source.getEffectiveMaxHealth(), "Source card should not buff itself.");
        assertEquals(12, linkedLeft.getEffectiveMaxHealth(), "Linked ally should gain max Health.");
        assertEquals(12, linkedRight.getEffectiveMaxHealth(), "Linked ally should gain max Health.");
        assertEquals(10, isolated.getEffectiveMaxHealth(), "Unlinked ally should stay unchanged.");
    }

    @Test
    void connectedAlliesDamageBoostOnlyAffectsLinkedAllies() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);

        CardInstance source = instance("source", List.of(
                new Notch(NotchDirection.LEFT, Element.EARTH),
                new Notch(NotchDirection.RIGHT, Element.EARTH)
        ), 1, 1);
        source.setPlacementOrder(1);
        state.setAt(true, 1, 1, source);

        CardInstance linkedLeft = instance("linked-left", List.of(
                new Notch(NotchDirection.RIGHT, Element.EARTH)
        ), 1, 0);
        linkedLeft.setPlacementOrder(2);
        state.setAt(true, 1, 0, linkedLeft);

        CardInstance linkedRight = instance("linked-right", List.of(
                new Notch(NotchDirection.LEFT, Element.EARTH)
        ), 1, 2);
        linkedRight.setPlacementOrder(3);
        state.setAt(true, 1, 2, linkedRight);

        CardInstance isolated = instance("isolated", List.of(
                new Notch(NotchDirection.TOP, Element.EARTH)
        ), 0, 2);
        isolated.setPlacementOrder(4);
        state.setAt(true, 0, 2, isolated);

        Ability aura = Ability.connectedAlliesDamageBoost(
                "War Root",
                "Connected allies gain +2 attack damage",
                2
        );

        effectService.resolveAbility(state, aura, source, true, source.getBoardRow(), source.getBoardCol());

        assertEquals(0, source.getDamageBoost(), "Source card should not buff itself.");
        assertEquals(2, linkedLeft.getDamageBoost(), "Linked ally should gain attack damage.");
        assertEquals(2, linkedRight.getDamageBoost(), "Linked ally should gain attack damage.");
        assertEquals(0, isolated.getDamageBoost(), "Unlinked ally should stay unchanged.");
    }

    @Test
    void connectedAlliesSpeedBoostOnlyAffectsLinkedAllies() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);

        CardInstance source = instance("source", List.of(
                new Notch(NotchDirection.LEFT, Element.EARTH),
                new Notch(NotchDirection.RIGHT, Element.EARTH)
        ), 1, 1);
        source.setPlacementOrder(1);
        state.setAt(true, 1, 1, source);

        CardInstance linkedLeft = instance("linked-left", List.of(
                new Notch(NotchDirection.RIGHT, Element.EARTH)
        ), 1, 0);
        linkedLeft.setPlacementOrder(2);
        state.setAt(true, 1, 0, linkedLeft);

        CardInstance linkedRight = instance("linked-right", List.of(
                new Notch(NotchDirection.LEFT, Element.EARTH)
        ), 1, 2);
        linkedRight.setPlacementOrder(3);
        state.setAt(true, 1, 2, linkedRight);

        CardInstance isolated = instance("isolated", List.of(
                new Notch(NotchDirection.TOP, Element.EARTH)
        ), 0, 2);
        isolated.setPlacementOrder(4);
        state.setAt(true, 0, 2, isolated);

        Ability aura = Ability.connectedAlliesSpeedBoost(
                "Rush Root",
                "Connected allies gain +2 Speed",
                2
        );

        effectService.resolveAbility(state, aura, source, true, source.getBoardRow(), source.getBoardCol());

        assertEquals(4, source.getCurrentSpeed(), "Source card should not buff itself.");
        assertEquals(6, linkedLeft.getCurrentSpeed(), "Linked ally should gain Speed.");
        assertEquals(6, linkedRight.getCurrentSpeed(), "Linked ally should gain Speed.");
        assertEquals(4, isolated.getCurrentSpeed(), "Unlinked ally should stay unchanged.");
    }

    private CardInstance instance(String id, List<Notch> notches, int row, int col) {
        SieglingCard card = new SieglingCard(id, id, Element.EARTH, Rarity.COMMON, 10, 4, notches, Row.MIDDLE);
        return new CardInstance(card, row, col, true);
    }
}
