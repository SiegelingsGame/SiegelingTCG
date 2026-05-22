package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.StatusEffect;
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
    void trainerHealthPassiveUpdatesPlacedSieglingDuringSetupWithoutRehealing() throws Exception {
        GameService gameService = new GameService();
        setField(gameService, "energyService", new EnergyService(new PlacementService()));
        setField(gameService, "placementService", new PlacementService());
        setField(gameService, "effectService", new EffectService());

        TrainerCard trainer = new TrainerCard(
                "trainer_earth",
                "Stone Warden",
                Element.EARTH,
                Rarity.RARE,
                Ability.passive("Roots of Resolve", "All Earth allies gain +1 max Health", AbilityEffectKeys.HEALTH_BOOST, 1),
                null,
                false
        );

        Player player = new Player("Player", true);
        player.setActiveTrainer(trainer);
        Player enemy = new Player("Enemy", false);

        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);

        SieglingCard cacty = new SieglingCard("cacty", "Cacty", Element.EARTH, Rarity.COMMON, 15, 3, List.of(), Row.BACK);
        player.getHand().add(cacty);

        gameService.placeSiegling(state, true, "cacty", 0, 0);

        CardInstance placed = state.getAt(true, 0, 0);
        assertEquals(16, placed.getEffectiveMaxHealth());
        assertEquals(16, placed.getCurrentHealth());

        placed.takeRawDamage(4);
        Method recalculate = GameService.class.getDeclaredMethod("recalculateTrainerPassiveStatBuffs", GameState.class);
        recalculate.setAccessible(true);
        recalculate.invoke(gameService, state);
        recalculate.invoke(gameService, state);

        assertEquals(12, placed.getCurrentHealth(), "Recalculating the passive should not repeatedly heal an already-buffed Siegling.");
        assertEquals(16, placed.getEffectiveMaxHealth());
    }

    @Test
    void evolutionLogSaysBaseEvolvedToNewForm() throws Exception {
        GameService gameService = new GameService();
        PlacementService placementService = new PlacementService();
        setField(gameService, "energyService", new EnergyService(placementService));
        setField(gameService, "placementService", placementService);
        setField(gameService, "effectService", new EffectService());

        Player player = new Player("Player", true);
        Player enemy = new Player("Enemy", false);

        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);

        SieglingCard base = new SieglingCard("emberpup", "Emberpup", Element.FIRE, Rarity.COMMON, 10, 3, List.of(), Row.FRONT);
        SieglingCard evolved = new SieglingCard("pylook", "Pylook", Element.FIRE, Rarity.UNCOMMON, 14, 4, List.of(), Row.FRONT);
        evolved.setEvolvesFromId("emberpup");
        player.getHand().add(evolved);

        CardInstance baseInstance = new CardInstance(base, 2, 1, true);
        baseInstance.setBattlePhasesSeen(1);
        state.setAt(true, 2, 1, baseInstance);

        gameService.placeSiegling(state, true, "pylook", 2, 1);

        assertTrue(
                state.getGameLog().stream().anyMatch(entry -> entry.endsWith("Emberpup evolved to Pylook!")),
                "Evolution should be logged as the base evolving into the new form."
        );
    }

    @Test
    void exhaustedSetupActionsBlockSpellAndTrapCardsWithoutConsumingThem() throws Exception {
        GameService gameService = new GameService();
        setField(gameService, "energyService", new EnergyService(new PlacementService()));
        setField(gameService, "effectService", new EffectService());

        Player player = new Player("Player", true);
        Player enemy = new Player("Enemy", false);
        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);
        state.setFirstTurn(false);
        state.recordSieglingSetupActionConsumed(true);

        SpellCard spell = new SpellCard(
                "spent-spell",
                "Spent Spell",
                Element.FIRE,
                Rarity.COMMON,
                0,
                Ability.damage("Spent Spell", "Deal 3 damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 3)
        );
        TrapCard trap = new TrapCard(
                "spent-trap",
                "Spent Trap",
                Element.FIRE,
                Rarity.COMMON,
                Element.FIRE,
                0,
                Ability.damage("Spent Trap", "Deal 3 damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 3)
        );
        player.getHand().add(spell);
        player.getHand().add(trap);

        gameService.castSpell(state, true, "spent-spell", -1, -1);
        gameService.castSpell(state, true, "spent-trap", -1, -1);

        assertEquals(50, enemy.getHealth(), "Blocked action cards should not resolve damage.");
        assertEquals(2, player.getHand().size(), "Blocked action cards should stay in hand.");
        assertTrue(player.getHand().contains(spell));
        assertTrue(player.getHand().contains(trap));
        assertTrue(player.getDiscard().isEmpty(), "Blocked action cards should not move to discard.");
        assertEquals(0, player.getSpellsCastThisMatch());
        assertEquals(0, player.getTrapsSprungThisMatch());
    }

    @Test
    void successfulActionCardConsumesSetupActionBudget() throws Exception {
        GameService gameService = new GameService();
        setField(gameService, "energyService", new EnergyService(new PlacementService()));
        setField(gameService, "effectService", new EffectService());

        Player player = new Player("Player", true);
        Player enemy = new Player("Enemy", false);
        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);
        state.setFirstTurn(false);

        SpellCard first = new SpellCard(
                "first-spell",
                "First Spell",
                Element.FIRE,
                Rarity.COMMON,
                0,
                Ability.damage("First Spell", "Deal 4 damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 4)
        );
        SpellCard second = new SpellCard(
                "second-spell",
                "Second Spell",
                Element.FIRE,
                Rarity.COMMON,
                0,
                Ability.damage("Second Spell", "Deal 4 damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 4)
        );
        player.getHand().add(first);
        player.getHand().add(second);

        gameService.castSpell(state, true, "first-spell", -1, -1);
        gameService.castSpell(state, true, "second-spell", -1, -1);

        assertEquals(46, enemy.getHealth(), "Only the first setup action card should resolve with a one-action budget.");
        assertEquals(1, state.getSieglingSetupActionsUsed(true));
        assertTrue(player.getDiscard().contains(first));
        assertTrue(player.getHand().contains(second), "The blocked second spell should remain in hand.");
        assertFalse(player.getDiscard().contains(second));
    }

    @Test
    void invalidTargetActionCardStaysInHandAndDoesNotConsumeBudget() throws Exception {
        GameService gameService = new GameService();
        setField(gameService, "energyService", new EnergyService(new PlacementService()));
        setField(gameService, "effectService", new EffectService());

        Player player = new Player("Player", true);
        Player enemy = new Player("Enemy", false);
        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);
        state.setFirstTurn(false);

        SpellCard spell = new SpellCard(
                "targeted-spell",
                "Targeted Spell",
                Element.FIRE,
                Rarity.COMMON,
                0,
                Ability.damage("Targeted Spell", "Deal 4 damage to an enemy", TargetType.SINGLE_ENEMY, null, 0, 4)
        );
        player.getHand().add(spell);

        gameService.castSpell(state, true, "targeted-spell", -1, -1);

        assertTrue(player.getHand().contains(spell), "Cards that cannot resolve should stay in hand.");
        assertTrue(player.getDiscard().isEmpty());
        assertEquals(0, state.getSieglingSetupActionsUsed(true));
        assertEquals(0, player.getSpellsCastThisMatch());
    }

    @Test
    void trainerAbilityCannotResolveDuringBattle() throws Exception {
        GameService gameService = new GameService();
        setField(gameService, "energyService", new EnergyService(new PlacementService()));
        setField(gameService, "effectService", new EffectService());

        TrainerCard trainer = new TrainerCard(
                "trainer_battle",
                "Battle Trainer",
                Element.FIRE,
                Rarity.RARE,
                null,
                Ability.damage("Battle Burst", "Deal 5 damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 5),
                false
        );
        Player player = new Player("Player", true);
        player.setActiveTrainer(trainer);
        Player enemy = new Player("Enemy", false);
        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.BATTLE);
        state.setPlayerTurn(true);
        state.setFirstTurn(false);

        gameService.useTrainerAbility(state, true, -1, -1);

        assertEquals(50, enemy.getHealth(), "SiegeKnight actives should not resolve during battle.");
        assertTrue(trainer.canUseActive(), "Blocked SiegeKnight actives should remain available for setup.");
    }

    @Test
    void aiDoesNotCastAfterUsingLastSetupAction() throws Exception {
        AIService aiService = new AIService();
        PlacementService placementService = new PlacementService();
        setField(aiService, "placementService", placementService);
        setField(aiService, "energyService", new EnergyService(placementService));
        setField(aiService, "effectService", new EffectService());

        Player player = new Player("Player", true);
        Player enemy = new Player("Enemy", false);
        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);

        SieglingCard siegling = new SieglingCard(
                "ai-siegling",
                "AI Siegling",
                Element.FIRE,
                Rarity.COMMON,
                10,
                1,
                List.of(),
                Row.FRONT
        );
        SpellCard spell = new SpellCard(
                "ai-spell",
                "AI Spell",
                Element.FIRE,
                Rarity.COMMON,
                0,
                Ability.damage("AI Spell", "Deal 4 damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 4)
        );
        enemy.getHand().add(siegling);
        enemy.getHand().add(spell);

        aiService.executeAITurn(state);

        assertEquals(1, state.getSieglingSetupActionsUsed(false));
        assertEquals(50, player.getHealth(), "AI should not cast after spending its last setup action.");
        assertTrue(enemy.getHand().contains(spell), "AI spell should remain in hand.");
        assertFalse(enemy.getDiscard().contains(spell), "AI spell should not be discarded.");
    }

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

    @Test
    void freezeExpiresWhenBattleTempEffectsAreCleared() throws Exception {
        GameService gameService = new GameService();

        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("Enemy", false));
        state.setCurrentPhase(Phase.BATTLE);

        SieglingCard playerCard = new SieglingCard("frosty", "Frosty", Element.ICE, Rarity.COMMON, 13, 6, List.of(), Row.FRONT);
        SieglingCard enemyCard = new SieglingCard("mossy", "Mossy", Element.EARTH, Rarity.COMMON, 18, 4, List.of(), Row.FRONT);
        CardInstance playerFrozen = new CardInstance(playerCard, 0, 0, true);
        CardInstance enemyFrozen = new CardInstance(enemyCard, 0, 0, false);
        playerFrozen.getStatusEffects().add(StatusEffect.FREEZE);
        enemyFrozen.getStatusEffects().add(StatusEffect.FREEZE);
        state.setAt(true, 0, 0, playerFrozen);
        state.setAt(false, 0, 0, enemyFrozen);

        Method clearTempEffects = GameService.class.getDeclaredMethod("clearTempEffects", GameState.class);
        clearTempEffects.setAccessible(true);
        clearTempEffects.invoke(gameService, state);

        assertFalse(playerFrozen.getStatusEffects().contains(StatusEffect.FREEZE), "Player Sieglings should thaw after battle ends.");
        assertFalse(enemyFrozen.getStatusEffects().contains(StatusEffect.FREEZE), "Opponent Sieglings should thaw after battle ends.");
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }
}
