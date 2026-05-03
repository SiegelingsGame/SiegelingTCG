package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameServiceTest {

    @Test
    void trainerActivesResetOnlyAfterBattlePhaseCompletes() throws Exception {
        GameService gameService = new GameService();
        setField(gameService, "energyService", new EnergyService(new PlacementService()));

        TrainerCard playerTrainer = new TrainerCard(
                "trainer_player",
                "Wave Captain",
                Element.WATER,
                Rarity.RARE,
                null,
                Ability.heal("Rally", "Heal 1 ally", TargetType.SINGLE_ALLY, null, 1, 2),
                false
        );
        TrainerCard enemyTrainer = new TrainerCard(
                "trainer_enemy",
                "Ash Marshal",
                Element.FIRE,
                Rarity.RARE,
                null,
                Ability.damage("Scorch", "Deal 2 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 2),
                false
        );
        playerTrainer.useActive();
        enemyTrainer.useActive();

        Player player = new Player("Player", true);
        player.setActiveTrainer(playerTrainer);
        Player enemy = new Player("Enemy", false);
        enemy.setActiveTrainer(enemyTrainer);

        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.DRAW);
        state.setPlayerTurn(true);

        gameService.draw(state, true);

        assertTrue(playerTrainer.isActiveUsedThisTurn(), "Draw/setup should not refresh the SiegeKnight active anymore.");
        assertTrue(enemyTrainer.isActiveUsedThisTurn(), "The opponent trainer should also stay spent until battle fully ends.");

        Method startNextRound = GameService.class.getDeclaredMethod("startNextRound", GameState.class);
        startNextRound.setAccessible(true);
        startNextRound.invoke(gameService, state);

        assertFalse(playerTrainer.isActiveUsedThisTurn(), "Player trainer active should refresh only after battle completes.");
        assertFalse(enemyTrainer.isActiveUsedThisTurn(), "Enemy trainer active should refresh only after battle completes.");
    }

    @Test
    void claimTurnsLostLinkIntoOneTurnTemporaryEnergy() throws Exception {
        GameService gameService = new GameService();
        EnergyService energyService = new EnergyService(new PlacementService());
        setField(gameService, "energyService", energyService);
        setField(gameService, "effectService", new EffectService());

        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("Enemy", false));
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);

        SieglingCard rooted = new SieglingCard(
                "rooted-fire",
                "Rooted Fire",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(
                        new Notch(NotchDirection.TOP, Element.FIRE),
                        new Notch(NotchDirection.BOTTOM, Element.FIRE)
                ),
                Row.BACK
        );
        SieglingCard linked = new SieglingCard(
                "linked-fire",
                "Linked Fire",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.BOTTOM, Element.FIRE)),
                Row.MIDDLE
        );

        CardInstance rootInstance = new CardInstance(rooted.copy(), 0, 0, true);
        rootInstance.setPlacementOrder(1);
        rootInstance.setBattlePhasesSeen(1);
        CardInstance linkedInstance = new CardInstance(linked.copy(), 1, 0, true);
        linkedInstance.setPlacementOrder(2);
        linkedInstance.setBattlePhasesSeen(1);
        state.setAt(true, 0, 0, rootInstance);
        state.setAt(true, 1, 0, linkedInstance);

        energyService.recalculateEnergy(state);
        assertEquals(2, state.getPlayer().getFireEnergy(), "The rooted pair should start at 2 fire energy from 1 internal and 1 socket link.");

        gameService.claimSiegling(state, true, 1, 0);

        assertNull(state.getAt(true, 1, 0), "Claiming should remove the Siegling from the board.");
        assertEquals(1, state.getPlayer().getDiscard().size(), "Claimed Sieglings should move to the discard pile.");
        assertEquals(2, state.getPlayer().getFireEnergy(), "Losing the internal link should drop to 1, then the claim should add 1 temporary fire energy back.");
    }

    @Test
    void claimTemporaryEnergyLastsThroughBattleUntilNextDraw() throws Exception {
        GameService gameService = new GameService();
        PlacementService placementService = new PlacementService();
        EnergyService energyService = new EnergyService(placementService);
        setField(gameService, "energyService", energyService);
        setField(gameService, "placementService", placementService);
        setField(gameService, "effectService", new EffectService());
        setField(gameService, "battleService", new BattleService() {
            @Override
            public void initializeBattle(GameState state) {
            }

            @Override
            public void advanceBattle(GameState state) {
            }
        });

        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("Enemy", false));
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);
        state.setPlayerGoesFirst(true);

        SieglingCard rooted = new SieglingCard(
                "rooted-fire",
                "Rooted Fire",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(
                        new Notch(NotchDirection.TOP, Element.FIRE),
                        new Notch(NotchDirection.BOTTOM, Element.FIRE)
                ),
                Row.BACK
        );
        SieglingCard linked = new SieglingCard(
                "linked-fire",
                "Linked Fire",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(new Notch(NotchDirection.BOTTOM, Element.FIRE)),
                Row.MIDDLE
        );

        CardInstance rootInstance = new CardInstance(rooted.copy(), 0, 0, true);
        rootInstance.setPlacementOrder(1);
        rootInstance.setBattlePhasesSeen(1);
        CardInstance linkedInstance = new CardInstance(linked.copy(), 1, 0, true);
        linkedInstance.setPlacementOrder(2);
        linkedInstance.setBattlePhasesSeen(1);
        state.setAt(true, 0, 0, rootInstance);
        state.setAt(true, 1, 0, linkedInstance);

        energyService.recalculateEnergy(state);
        gameService.claimSiegling(state, true, 1, 0);
        assertEquals(2, state.getPlayer().getFireEnergy(), "Claim should immediately replace the lost link energy with temporary fire energy.");

        Method startBattlePhase = GameService.class.getDeclaredMethod("startBattlePhase", GameState.class);
        startBattlePhase.setAccessible(true);
        startBattlePhase.invoke(gameService, state);

        assertEquals(2, state.getPlayer().getFireEnergy(), "Claim energy should persist through the next battle phase and into the following draw step.");

        gameService.draw(state, true);

        assertEquals(1, state.getPlayer().getFireEnergy(), "Temporary claim energy should expire when that side starts its next draw phase.");
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }
}
