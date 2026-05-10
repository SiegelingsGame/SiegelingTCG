package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.BattleAbilityOption;
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

import java.lang.reflect.Field;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BattleServiceTest {

    @Test
    void automaticBattleActionPausesBeforeNextCreatureActs() throws Exception {
        BattleService battleService = createBattleService();

        GameState state = new GameState();
        Player player = new Player("Player", true);
        Player enemy = new Player("AI", false);
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.BATTLE);

        SieglingCard playerCard = new SieglingCard("splashfin", "Splashfin", Element.WATER, Rarity.COMMON, 10, 2, List.of(), Row.FRONT);
        SieglingCard enemyCard = new SieglingCard("emberfox", "Emberfox", Element.FIRE, Rarity.COMMON, 10, 6, List.of(), Row.FRONT);
        CardInstance playerInstance = new CardInstance(playerCard, 1, 1, true);
        CardInstance enemyInstance = new CardInstance(enemyCard, 1, 1, false);
        state.setAt(true, 1, 1, playerInstance);
        state.setAt(false, 1, 1, enemyInstance);

        battleService.initializeBattle(state);
        battleService.advanceBattle(state);

        assertTrue(state.isBattleActionPausePending(), "The AI action should pause so the client can animate it.");
        assertEquals(1, state.getBattleCursor(), "Only one creature action should resolve in this step.");
        assertEquals(null, state.getPendingBattleInstanceId(), "The next human action should not be queued until the pause is continued.");
        assertEquals(9, playerInstance.getCurrentHealth(), "Emberfox's zero-cost poke should be visible as its own damage step.");

        battleService.advanceBattle(state);

        assertFalse(state.isBattleActionPausePending());
        assertEquals(playerInstance.getInstanceId(), state.getPendingBattleInstanceId(), "Continuing after the pause should surface the player's next action.");
    }

    @Test
    void lastAutomaticBattleActionPausesBeforeBattleFinishes() throws Exception {
        BattleService battleService = createBattleService();

        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);

        SieglingCard enemyCard = new SieglingCard("emberfox", "Emberfox", Element.FIRE, Rarity.COMMON, 10, 6, List.of(), Row.FRONT);
        state.setAt(false, 1, 1, new CardInstance(enemyCard, 1, 1, false));

        battleService.initializeBattle(state);
        battleService.advanceBattle(state);

        assertTrue(state.isBattleActionPausePending(), "The final automatic action should still get a visual pause.");
        assertEquals(1, state.getBattleCursor());
        assertFalse(state.getBattleQueue().isEmpty(), "The battle queue should remain until the client advances after the visual pause.");

        battleService.advanceBattle(state);

        assertFalse(state.isBattleActionPausePending());
        assertTrue(state.getBattleQueue().isEmpty(), "The follow-up advance should finish and clear the battle queue.");
    }

    @Test
    void explicitMoveLoadoutUsesConfiguredAbilitiesAndCosts() throws Exception {
        BattleService battleService = createBattleService();
        MovesPoolService pool = getField(battleService, "movesPoolService");

        String m0 = "test:staticap:0";
        String m1 = "test:staticap:1";
        pool.registerLegacyManualMove(m0, new ManualSieglingCatalog.ManualAbilityDefinition(
                "Quick Circuit",
                "Connected allies gain +1 Speed",
                TargetType.SELF,
                null,
                0,
                "connected_allies_speed_boost",
                1,
                false,
                null,
                0,
                null
        ), Element.ELECTRIC);
        pool.registerLegacyManualMove(m1, new ManualSieglingCatalog.ManualAbilityDefinition(
                "Volt Crash",
                "Deal 5 damage to 1 enemy",
                TargetType.SINGLE_ENEMY,
                null,
                1,
                "damage",
                5,
                false,
                Element.ELECTRIC,
                2,
                null
        ), Element.ELECTRIC);

        SieglingCard card = new SieglingCard("staticap", "Staticap", Element.ELECTRIC, Rarity.COMMON, 12, 4, List.of(), Row.FRONT);
        card.setMoveIds(List.of(m0, m1));

        CardInstance attacker = new CardInstance(card, 1, 1, true);

        GameState state = new GameState();
        Player player = new Player("Player", true);
        player.setElectricEnergy(1);
        state.setPlayer(player);
        state.setEnemy(new Player("AI", false));

        List<BattleAbilityOption> options = battleService.getAvailableAbilities(state, attacker);

        assertEquals(2, options.size());
        assertEquals("Quick Circuit", options.get(0).getAbility().getName());
        assertEquals(0, options.get(0).getRequiredEnergy());
        assertTrue(options.get(0).isAffordable());
        assertEquals("Volt Crash", options.get(1).getAbility().getName());
        assertEquals(Element.ELECTRIC, options.get(1).getRequiredElement());
        assertEquals(2, options.get(1).getRequiredEnergy());
        assertFalse(options.get(1).isAffordable());
    }

    @Test
    void rowSelectEnemyMoveLoadoutRemainsExplicitBattleTarget() throws Exception {
        BattleService battleService = new BattleService();
        setField(battleService, "effectService", new EffectService());
        setField(battleService, "energyService", new EnergyService(new PlacementService()));
        MovesPoolService pool = new MovesPoolService(new ObjectMapper(), null);
        setField(battleService, "movesPoolService", pool);

        String moveId = "test:wind:row-select";
        pool.registerLegacyManualMove(moveId, new ManualSieglingCatalog.ManualAbilityDefinition(
                "Tornadus",
                "Deal 3 damage to the selected enemy row",
                TargetType.ROW_SELECT_ENEMIES,
                null,
                0,
                "damage",
                3,
                false,
                Element.WIND,
                1,
                null
        ), Element.WIND);

        SieglingCard card = new SieglingCard("cloudwisp", "Cloudwisp", Element.WIND, Rarity.COMMON, 10, 4, List.of(), Row.MIDDLE);
        card.setMoveIds(List.of(moveId));
        CardInstance attacker = new CardInstance(card, 1, 1, true);

        GameState state = new GameState();
        Player player = new Player("Player", true);
        player.setWindEnergy(1);
        state.setPlayer(player);
        state.setEnemy(new Player("AI", false));

        List<BattleAbilityOption> options = battleService.getAvailableAbilities(state, attacker);

        assertEquals(1, options.size());
        assertEquals(TargetType.ROW_SELECT_ENEMIES, options.get(0).getTargetType());
        assertTrue(options.get(0).isAffordable());
    }

    @Test
    void selfMoveLinkWithoutValidNotchDestinationIsUnavailable() throws Exception {
        BattleService battleService = new BattleService();
        setField(battleService, "effectService", new EffectService());
        setField(battleService, "energyService", new EnergyService(new PlacementService()));
        MovesPoolService pool = new MovesPoolService(new ObjectMapper(), null);
        setField(battleService, "movesPoolService", pool);

        String moveId = "test:mover:drift";
        pool.registerLegacyManualMove(moveId, new ManualSieglingCatalog.ManualAbilityDefinition(
                "Drift",
                "Move to an open linked point",
                TargetType.SELF,
                null,
                1,
                AbilityEffectKeys.MOVE_LINK,
                0,
                false,
                null,
                0,
                null
        ), Element.EARTH);

        SieglingCard card = new SieglingCard(
                "mover",
                "Mover",
                Element.EARTH,
                Rarity.COMMON,
                10,
                4,
                List.of(new Notch(NotchDirection.TOP, Element.EARTH)),
                Row.MIDDLE
        );
        card.setMoveIds(List.of(moveId));
        CardInstance attacker = new CardInstance(card, 1, 1, true);

        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setAt(true, 1, 1, attacker);

        List<BattleAbilityOption> options = battleService.getAvailableAbilities(state, attacker);

        assertEquals(1, options.size());
        assertFalse(options.get(0).isAffordable());
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }

    @SuppressWarnings("unchecked")
    private <T> T getField(Object target, String fieldName) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        return (T) field.get(target);
    }

    private BattleService createBattleService() throws Exception {
        BattleService battleService = new BattleService();
        setField(battleService, "effectService", new EffectService());
        setField(battleService, "energyService", new EnergyService(new PlacementService()));
        setField(battleService, "movesPoolService", new MovesPoolService(new ObjectMapper(), null));
        return battleService;
    }
}
