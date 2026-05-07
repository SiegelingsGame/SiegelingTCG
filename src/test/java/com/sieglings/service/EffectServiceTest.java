package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
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
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class EffectServiceTest {

    private final EffectService effectService = new EffectService();

    @Test
    void allEnemiesDamageHitsEveryEnemyAndNoAllies() {
        GameState state = battleState();
        CardInstance enemyBack = instance("enemy-back", 0, 0, false);
        CardInstance enemyMiddle = instance("enemy-middle", 1, 1, false);
        CardInstance enemyFront = instance("enemy-front", 2, 2, false);
        CardInstance ally = instance("ally", 1, 0, true);
        state.setAt(false, 0, 0, enemyBack);
        state.setAt(false, 1, 1, enemyMiddle);
        state.setAt(false, 2, 2, enemyFront);
        state.setAt(true, 1, 0, ally);

        Ability quake = Ability.damage(
                "Quake",
                "Deal 3 damage to all enemies",
                TargetType.ALL_ENEMIES,
                null,
                0,
                3
        );

        effectService.resolveAbility(state, quake, null, true, -1, -1);

        assertEquals(7, enemyBack.getCurrentHealth());
        assertEquals(7, enemyMiddle.getCurrentHealth());
        assertEquals(7, enemyFront.getCurrentHealth());
        assertEquals(10, ally.getCurrentHealth());
    }

    @Test
    void fixedEnemyRowDamageOnlyHitsConfiguredRow() {
        GameState state = battleState();
        CardInstance back = instance("back", 0, 0, false);
        CardInstance middleLeft = instance("middle-left", 1, 0, false);
        CardInstance middleRight = instance("middle-right", 1, 2, false);
        CardInstance front = instance("front", 2, 1, false);
        state.setAt(false, 0, 0, back);
        state.setAt(false, 1, 0, middleLeft);
        state.setAt(false, 1, 2, middleRight);
        state.setAt(false, 2, 1, front);

        Ability wave = Ability.damage(
                "Wave",
                "Deal 4 damage to all enemies in Middle Row",
                TargetType.ROW_ENEMIES,
                Row.MIDDLE,
                0,
                4
        );

        effectService.resolveAbility(state, wave, null, true, -1, -1);

        assertEquals(10, back.getCurrentHealth());
        assertEquals(6, middleLeft.getCurrentHealth());
        assertEquals(6, middleRight.getCurrentHealth());
        assertEquals(10, front.getCurrentHealth());
    }

    @Test
    void selectedEnemyRowDamageUsesRuntimeRowAndIgnoresColumn() {
        GameState state = battleState();
        CardInstance selectedLeft = instance("selected-left", 1, 0, false);
        CardInstance selectedRight = instance("selected-right", 1, 2, false);
        CardInstance otherRow = instance("other-row", 2, 1, false);
        state.setAt(false, 1, 0, selectedLeft);
        state.setAt(false, 1, 2, selectedRight);
        state.setAt(false, 2, 1, otherRow);

        Ability tornado = Ability.damage(
                "Tornado",
                "Deal 5 damage to the selected enemy row",
                TargetType.ROW_SELECT_ENEMIES,
                null,
                0,
                5
        );

        effectService.resolveAbility(state, tornado, null, true, 1, -1);

        assertEquals(5, selectedLeft.getCurrentHealth());
        assertEquals(5, selectedRight.getCurrentHealth());
        assertEquals(10, otherRow.getCurrentHealth());
    }

    @Test
    void selectedEnemyRowDamageWithoutRuntimeRowFindsNoTargets() {
        GameState state = battleState();
        CardInstance enemy = instance("enemy", 1, 1, false);
        state.setAt(false, 1, 1, enemy);

        Ability tornado = Ability.damage(
                "Tornado",
                "Deal 5 damage to the selected enemy row",
                TargetType.ROW_SELECT_ENEMIES,
                null,
                0,
                5
        );

        effectService.resolveAbility(state, tornado, null, true, -1, -1);

        assertEquals(10, enemy.getCurrentHealth());
    }

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
                new Notch(NotchDirection.RIGHT, Element.EARTH),
                new Notch(NotchDirection.TOP, Element.EARTH)
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

        CardInstance chained = instance("chained", List.of(
                new Notch(NotchDirection.BOTTOM, Element.EARTH)
        ), 0, 0);
        chained.setPlacementOrder(5);
        state.setAt(true, 0, 0, chained);

        Ability aura = Ability.connectedAlliesHealthBoost(
                "Root Circuit",
                "Connected allies gain +2 max Health",
                2
        );

        effectService.resolveAbility(state, aura, source, true, source.getBoardRow(), source.getBoardCol());

        assertEquals(10, source.getEffectiveMaxHealth(), "Source card should not buff itself.");
        assertEquals(12, linkedLeft.getEffectiveMaxHealth(), "Linked ally should gain max Health.");
        assertEquals(12, linkedRight.getEffectiveMaxHealth(), "Linked ally should gain max Health.");
        assertEquals(10, chained.getEffectiveMaxHealth(), "Indirect chain allies should stay unchanged.");
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
                new Notch(NotchDirection.RIGHT, Element.EARTH),
                new Notch(NotchDirection.TOP, Element.EARTH)
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

        CardInstance chained = instance("chained", List.of(
                new Notch(NotchDirection.BOTTOM, Element.EARTH)
        ), 0, 0);
        chained.setPlacementOrder(5);
        state.setAt(true, 0, 0, chained);

        Ability aura = Ability.connectedAlliesDamageBoost(
                "War Root",
                "Connected allies gain +2 attack damage",
                2
        );

        effectService.resolveAbility(state, aura, source, true, source.getBoardRow(), source.getBoardCol());

        assertEquals(0, source.getDamageBoost(), "Source card should not buff itself.");
        assertEquals(2, linkedLeft.getDamageBoost(), "Linked ally should gain attack damage.");
        assertEquals(2, linkedRight.getDamageBoost(), "Linked ally should gain attack damage.");
        assertEquals(0, chained.getDamageBoost(), "Indirect chain allies should stay unchanged.");
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
                new Notch(NotchDirection.RIGHT, Element.EARTH),
                new Notch(NotchDirection.TOP, Element.EARTH)
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

        CardInstance chained = instance("chained", List.of(
                new Notch(NotchDirection.BOTTOM, Element.EARTH)
        ), 0, 0);
        chained.setPlacementOrder(5);
        state.setAt(true, 0, 0, chained);

        Ability aura = Ability.connectedAlliesSpeedBoost(
                "Rush Root",
                "Connected allies gain +2 Speed",
                2
        );

        effectService.resolveAbility(state, aura, source, true, source.getBoardRow(), source.getBoardCol());

        assertEquals(4, source.getCurrentSpeed(), "Source card should not buff itself.");
        assertEquals(6, linkedLeft.getCurrentSpeed(), "Linked ally should gain Speed.");
        assertEquals(6, linkedRight.getCurrentSpeed(), "Linked ally should gain Speed.");
        assertEquals(4, chained.getCurrentSpeed(), "Indirect chain allies should stay unchanged.");
        assertEquals(4, isolated.getCurrentSpeed(), "Unlinked ally should stay unchanged.");
    }

    @Test
    void spellForcedMoveRelocatesEnemyToAnyEmptyCell() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));

        SieglingCard ec = new SieglingCard(
                "e1",
                "e1",
                Element.FIRE,
                Rarity.COMMON,
                10,
                5,
                List.of(new Notch(NotchDirection.LEFT, Element.FIRE)),
                Row.MIDDLE
        );
        CardInstance enemy = new CardInstance(ec, 1, 1, false);
        state.setAt(false, 1, 1, enemy);

        Ability gust = new Ability(
                "Gust",
                "Move",
                TargetType.SINGLE_ENEMY,
                null,
                1,
                AbilityEffectKeys.MOVE_LINK,
                0,
                false
        );

        effectService.resolveAbility(state, gust, null, true, 1, 1, 0, 2);

        assertNull(state.getAt(false, 1, 1));
        assertEquals(enemy, state.getAt(false, 0, 2));
        assertEquals(0, enemy.getBoardRow());
        assertEquals(2, enemy.getBoardCol());
    }

    @Test
    void speedBoostCanRestoreMovementAfterSpeedZero() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);

        CardInstance target = instance("slowed", List.of(
                new Notch(NotchDirection.TOP, Element.EARTH)
        ), 1, 1);
        state.setAt(true, 1, 1, target);

        Ability speedZero = new Ability(
                "Freeze Tempo",
                "Set 1 ally's Speed to 0",
                TargetType.SINGLE_ALLY,
                null,
                1,
                "speed_zero",
                1,
                false
        );
        effectService.resolveAbility(state, speedZero, null, true, 1, 1);
        assertEquals(0, target.getEffectiveSpeed(), "Speed-zero effects should set the target's current speed to 0.");

        Ability speedBoost = new Ability(
                "Rush Spark",
                "Increase 1 ally's Speed by 2",
                TargetType.SINGLE_ALLY,
                null,
                1,
                "speed_boost",
                2,
                false
        );
        effectService.resolveAbility(state, speedBoost, null, true, 1, 1);

        assertEquals(2, target.getEffectiveSpeed(), "Later speed boosts should be able to lift a speed-zero target back above 0.");
    }

    private CardInstance instance(String id, List<Notch> notches, int row, int col) {
        SieglingCard card = new SieglingCard(id, id, Element.EARTH, Rarity.COMMON, 10, 4, notches, Row.MIDDLE);
        return new CardInstance(card, row, col, true);
    }

    private CardInstance instance(String id, int row, int col, boolean owner) {
        SieglingCard card = new SieglingCard(id, id, Element.NEUTRAL, Rarity.COMMON, 10, 4, List.of(), Row.MIDDLE);
        return new CardInstance(card, row, col, owner);
    }

    private GameState battleState() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);
        return state;
    }
}
