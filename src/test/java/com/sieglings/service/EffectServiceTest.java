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
import com.sieglings.model.enums.StatusEffect;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
    void oneDamageAttackAppliesAndLogsWeaknessBonus() {
        GameState state = battleState();
        CardInstance source = instance("wind-source", Element.WIND, 1, 1, true);
        CardInstance target = instance("earth-target", Element.EARTH, 1, 1, false);
        state.setAt(true, 1, 1, source);
        state.setAt(false, 1, 1, target);

        Ability poke = Ability.damage(
                "Sproutspray",
                "Deal 1 damage to 1 enemy",
                TargetType.SINGLE_ENEMY,
                null,
                1,
                1
        );

        effectService.resolveAbility(state, poke, source, true, 1, 1);

        assertEquals(8, target.getCurrentHealth());
        assertTrue(state.getGameLog().stream().anyMatch(line -> line.contains("weakness +1")));
    }

    @Test
    void elementalWeaknessChartMatchesCurrentRules() {
        assertWeaknessBonus(Element.FIRE, Element.ICE);
        assertWeaknessBonus(Element.FIRE, Element.METAL);
        assertWeaknessBonus(Element.ICE, Element.WIND);
        assertWeaknessBonus(Element.ICE, Element.POISON);
        assertWeaknessBonus(Element.WIND, Element.EARTH);
        assertWeaknessBonus(Element.WIND, Element.WATER);
        assertWeaknessBonus(Element.EARTH, Element.FIRE);
        assertWeaknessBonus(Element.EARTH, Element.ELECTRIC);
        assertWeaknessBonus(Element.SHADOW, Element.PSYCHIC);
        assertWeaknessBonus(Element.SHADOW, Element.LIGHT);
        assertWeaknessBonus(Element.PSYCHIC, Element.LIGHT);
        assertWeaknessBonus(Element.PSYCHIC, Element.UNDEAD);
        assertWeaknessBonus(Element.LIGHT, Element.UNDEAD);
        assertWeaknessBonus(Element.LIGHT, Element.SHADOW);
        assertWeaknessBonus(Element.UNDEAD, Element.SHADOW);
        assertWeaknessBonus(Element.UNDEAD, Element.PSYCHIC);

        assertNoWeaknessBonus(Element.EARTH, Element.WIND);
        assertNoWeaknessBonus(Element.WATER, Element.FIRE);
        assertNoWeaknessBonus(Element.WATER, Element.EARTH);
        assertNoWeaknessBonus(Element.METAL, Element.EARTH);
        assertNoWeaknessBonus(Element.ELECTRIC, Element.WIND);
        assertNoWeaknessBonus(Element.ELECTRIC, Element.WATER);
        assertNoWeaknessBonus(Element.POISON, Element.ICE);
    }

    @Test
    void speedZeroOverridesTrainerPassiveSpeedBuff() {
        GameState state = battleState();
        CardInstance target = instance("quick-target", 1, 1, false);
        target.setTrainerPassiveSpeedBuff(3);
        state.setAt(false, 1, 1, target);

        Ability mudTrap = new Ability(
                "Mud Trap",
                "Sets effective Speed to 0",
                TargetType.SINGLE_ENEMY,
                null,
                1,
                AbilityEffectKeys.SPEED_ZERO,
                0,
                false
        );

        effectService.resolveAbility(state, mudTrap, null, true, 1, 1);

        assertEquals(0, target.getCurrentSpeed());
        assertTrue(target.getStatusEffects().contains(StatusEffect.SPEED_ZERO));
        assertEquals(0, target.getEffectiveSpeed(), "Speed-zero effects must override passive speed bonuses.");
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
    void connectedAlliesShieldOnlyAffectsLinkedAllies() {
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

        Ability shield = Ability.connectedAlliesShield(
                "Ward Root",
                "Connected allies gain +2 Shield",
                2
        );

        effectService.resolveAbility(state, shield, source, true, source.getBoardRow(), source.getBoardCol());

        assertEquals(0, source.getTemporaryShield(), "Source card should not shield itself.");
        assertEquals(2, linkedLeft.getTemporaryShield(), "Linked ally should gain Shield.");
        assertEquals(2, linkedRight.getTemporaryShield(), "Linked ally should gain Shield.");
        assertEquals(0, chained.getTemporaryShield(), "Indirect chain allies should stay unchanged.");
        assertEquals(0, isolated.getTemporaryShield(), "Unlinked ally should stay unchanged.");
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
    void connectedAlliesSlowOnlyAffectsLinkedAllies() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);

        CardInstance source = instance("source", List.of(
                new Notch(NotchDirection.LEFT, Element.EARTH),
                new Notch(NotchDirection.RIGHT, Element.EARTH)
        ), 1, 1);
        source.setPlacementOrder(1);
        source.setCurrentSpeed(6);
        state.setAt(true, 1, 1, source);

        CardInstance linkedLeft = instance("linked-left", List.of(
                new Notch(NotchDirection.RIGHT, Element.EARTH)
        ), 1, 0);
        linkedLeft.setPlacementOrder(2);
        linkedLeft.setCurrentSpeed(6);
        state.setAt(true, 1, 0, linkedLeft);

        CardInstance linkedRight = instance("linked-right", List.of(
                new Notch(NotchDirection.LEFT, Element.EARTH)
        ), 1, 2);
        linkedRight.setPlacementOrder(3);
        linkedRight.setCurrentSpeed(6);
        state.setAt(true, 1, 2, linkedRight);

        CardInstance isolated = instance("isolated", List.of(
                new Notch(NotchDirection.TOP, Element.EARTH)
        ), 0, 2);
        isolated.setPlacementOrder(4);
        isolated.setCurrentSpeed(6);
        state.setAt(true, 0, 2, isolated);

        Ability slow = Ability.connectedAlliesSlow(
                "Mud Circuit",
                "Connected allies lose 2 Speed",
                2
        );

        effectService.resolveAbility(state, slow, source, true, source.getBoardRow(), source.getBoardCol());

        assertEquals(6, source.getCurrentSpeed(), "Source card should not slow itself.");
        assertEquals(4, linkedLeft.getCurrentSpeed(), "Linked ally should lose Speed.");
        assertEquals(4, linkedRight.getCurrentSpeed(), "Linked ally should lose Speed.");
        assertEquals(6, isolated.getCurrentSpeed(), "Unlinked ally should stay unchanged.");
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
    void selfMoveLinkReturnsNoValidNotchesWhenMoveWouldLeaveUserDisconnected() {
        GameState state = battleState();
        CardInstance mover = instance("mover", List.of(
                new Notch(NotchDirection.TOP, Element.EARTH)
        ), 1, 1);
        state.setAt(true, 1, 1, mover);

        Ability drift = new Ability(
                "Drift",
                "Move to an open linked point",
                TargetType.SELF,
                null,
                1,
                AbilityEffectKeys.MOVE_LINK,
                0,
                false
        );

        effectService.resolveAbility(state, drift, mover, true, -1, -1);

        assertEquals(mover, state.getAt(true, 1, 1));
        assertNull(state.getAt(true, 2, 1));
        assertTrue(state.getGameLog().stream().anyMatch(line -> line.contains(EffectService.NO_VALID_NOTCHES_MESSAGE)));
    }

    @Test
    void selfMoveLinkMovesOnlyToSpaceWithActiveNotchConnection() {
        GameState state = battleState();
        CardInstance mover = instance("mover", List.of(
                new Notch(NotchDirection.TOP, Element.EARTH),
                new Notch(NotchDirection.LEFT, Element.EARTH)
        ), 1, 1);
        state.setAt(true, 1, 1, mover);

        CardInstance linkedAlly = instance("linked-ally", List.of(
                new Notch(NotchDirection.RIGHT, Element.EARTH)
        ), 2, 0);
        state.setAt(true, 2, 0, linkedAlly);

        Ability drift = new Ability(
                "Drift",
                "Move to an open linked point",
                TargetType.SELF,
                null,
                1,
                AbilityEffectKeys.MOVE_LINK,
                0,
                false
        );

        effectService.resolveAbility(state, drift, mover, true, -1, -1);

        assertNull(state.getAt(true, 1, 1));
        assertEquals(mover, state.getAt(true, 2, 1));
        assertEquals(2, mover.getBoardRow());
        assertEquals(1, mover.getBoardCol());
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

    @Test
    void slowReducesCurrentSpeedByEffectValueAndClampsAtZero() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);

        CardInstance target = instance("fast", List.of(
                new Notch(NotchDirection.TOP, Element.EARTH)
        ), 1, 1);
        target.setCurrentSpeed(6);
        state.setAt(false, 1, 1, target);

        Ability slow = new Ability(
                "Heavy Mist",
                "Reduce 1 enemy speed by 2",
                TargetType.SINGLE_ENEMY,
                null,
                1,
                AbilityEffectKeys.SLOW,
                2,
                false
        );
        effectService.resolveAbility(state, slow, null, true, 1, 1);

        assertEquals(4, target.getEffectiveSpeed(), "Slow should subtract exactly the effect value.");

        Ability heavierSlow = new Ability(
                "Deep Mist",
                "Reduce 1 enemy speed by 8",
                TargetType.SINGLE_ENEMY,
                null,
                1,
                AbilityEffectKeys.SLOW,
                8,
                false
        );
        effectService.resolveAbility(state, heavierSlow, null, true, 1, 1);

        assertEquals(0, target.getEffectiveSpeed(), "Slow should not reduce speed below zero.");
        assertTrue(target.getStatusEffects().contains(StatusEffect.SPEED_ZERO),
                "A slowed target that reaches zero speed should act like a speed-zero target.");
    }

    @Test
    void drawEffectDrawsEffectValueCardsForActingSide() {
        GameState state = new GameState();
        Player player = new Player("Player", true);
        state.setPlayer(player);
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);
        player.getDeck().add(new SieglingCard("draw-a", "Draw A", Element.EARTH, Rarity.COMMON, 10, 4, List.of(), Row.MIDDLE));
        player.getDeck().add(new SieglingCard("draw-b", "Draw B", Element.EARTH, Rarity.COMMON, 10, 4, List.of(), Row.MIDDLE));
        player.getDeck().add(new SieglingCard("draw-c", "Draw C", Element.EARTH, Rarity.COMMON, 10, 4, List.of(), Row.MIDDLE));

        Ability draw = new Ability(
                "Fresh Plans",
                "Draw 2 cards",
                TargetType.SELF,
                null,
                0,
                AbilityEffectKeys.DRAW,
                2,
                false
        );

        effectService.resolveAbility(state, draw, null, true, -1, -1);

        assertEquals(2, player.getHand().size(), "Draw should move effect-value cards into hand.");
        assertEquals(1, player.getDeck().size(), "Draw should remove the same number of cards from deck.");
    }

    @Test
    void autoSingleEnemyTargetPrioritizesLowestHealthEnemy() {
        GameState state = battleState();
        CardInstance source = instance("source", 1, 0, true);
        // Front-row enemy is at full health; a back-row enemy is nearly dead.
        CardInstance fullFront = instance("full-front", 2, 1, false);
        CardInstance woundedBack = instance("wounded-back", 0, 0, false);
        woundedBack.setCurrentHealth(2);
        state.setAt(true, 1, 0, source);
        state.setAt(false, 2, 1, fullFront);
        state.setAt(false, 0, 0, woundedBack);

        Ability strike = Ability.damage(
                "Strike",
                "Deal 3 damage to 1 enemy",
                TargetType.SINGLE_ENEMY,
                null,
                0,
                3
        );

        // No explicit target (-1,-1): the AI auto-target should pick the weakest enemy to finish it.
        effectService.resolveAbility(state, strike, source, true, -1, -1);

        assertEquals(0, woundedBack.getCurrentHealth(), "Lowest-health enemy should be targeted to secure the kill.");
        assertEquals(10, fullFront.getCurrentHealth(), "Healthy front enemy should be skipped.");
    }

    @Test
    void autoSingleEnemyTargetKeepsFrontPriorityOnHealthTie() {
        GameState state = battleState();
        CardInstance source = instance("source", 1, 0, true);
        CardInstance front = instance("front", 2, 1, false);
        CardInstance back = instance("back", 0, 0, false);
        state.setAt(true, 1, 0, source);
        state.setAt(false, 2, 1, front);
        state.setAt(false, 0, 0, back);

        Ability strike = Ability.damage(
                "Strike",
                "Deal 3 damage to 1 enemy",
                TargetType.SINGLE_ENEMY,
                null,
                0,
                3
        );

        effectService.resolveAbility(state, strike, source, true, -1, -1);

        assertEquals(7, front.getCurrentHealth(), "On equal health, the front-row enemy keeps priority.");
        assertEquals(10, back.getCurrentHealth());
    }

    private CardInstance instance(String id, List<Notch> notches, int row, int col) {
        SieglingCard card = new SieglingCard(id, id, Element.EARTH, Rarity.COMMON, 10, 4, notches, Row.MIDDLE);
        return new CardInstance(card, row, col, true);
    }

    private CardInstance instance(String id, int row, int col, boolean owner) {
        SieglingCard card = new SieglingCard(id, id, Element.NEUTRAL, Rarity.COMMON, 10, 4, List.of(), Row.MIDDLE);
        return new CardInstance(card, row, col, owner);
    }

    private CardInstance instance(String id, Element element, int row, int col, boolean owner) {
        SieglingCard card = new SieglingCard(id, id, element, Rarity.COMMON, 10, 4, List.of(), Row.MIDDLE);
        return new CardInstance(card, row, col, owner);
    }

    private void assertWeaknessBonus(Element attacker, Element defender) {
        GameState state = battleState();
        CardInstance source = instance(attacker.name().toLowerCase() + "-source", attacker, 1, 1, true);
        CardInstance target = instance(defender.name().toLowerCase() + "-target", defender, 1, 1, false);
        state.setAt(true, 1, 1, source);
        state.setAt(false, 1, 1, target);

        effectService.resolveAbility(state, oneDamageAbility(), source, true, 1, 1);

        assertEquals(8, target.getCurrentHealth(), attacker + " should be strong into " + defender);
        assertTrue(state.getGameLog().stream().anyMatch(line -> line.contains("weakness +1")),
                attacker + " into " + defender + " should log a weakness bonus");
    }

    private void assertNoWeaknessBonus(Element attacker, Element defender) {
        GameState state = battleState();
        CardInstance source = instance(attacker.name().toLowerCase() + "-source", attacker, 1, 1, true);
        CardInstance target = instance(defender.name().toLowerCase() + "-target", defender, 1, 1, false);
        state.setAt(true, 1, 1, source);
        state.setAt(false, 1, 1, target);

        effectService.resolveAbility(state, oneDamageAbility(), source, true, 1, 1);

        assertEquals(9, target.getCurrentHealth(), attacker + " should not get weakness damage into " + defender);
        assertFalse(state.getGameLog().stream().anyMatch(line -> line.contains("weakness +1")),
                attacker + " into " + defender + " should not log a weakness bonus");
    }

    private Ability oneDamageAbility() {
        return Ability.damage(
                "Weakness Probe",
                "Deal 1 damage to 1 enemy",
                TargetType.SINGLE_ENEMY,
                null,
                1,
                1
        );
    }

    private GameState battleState() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);
        return state;
    }
}
