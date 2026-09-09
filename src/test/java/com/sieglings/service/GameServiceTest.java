package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.Card;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.ElementalAffliction;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.StatusEffect;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameServiceTest {

    @Test
    void fireShieldPassiveGrantsAbsorbsAndRefreshesWithoutStacking() throws Exception {
        GameService service = new GameService();
        setField(service, "energyService", new EnergyService(new PlacementService()));
        setField(service, "placementService", new PlacementService());
        setField(service, "effectService", new EffectService());
        Player player = new Player("Player", true);
        Player enemy = new Player("Enemy", false);
        TrainerCard pyla = new TrainerCard("pyla", "Pyla", Element.FIRE, Rarity.UNCOMMON,
                Ability.passive("Heat Shield", "All Fire allies gain +2 Shield", AbilityEffectKeys.SHIELD, 2), null, false);
        player.setActiveTrainer(pyla);
        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);
        SieglingCard fire = new SieglingCard("fire", "Fire Ally", Element.FIRE, Rarity.COMMON, 10, 3, List.of(), Row.FRONT);
        player.getHand().add(fire);
        service.placeSiegling(state, true, "fire", 2, 0);
        CardInstance ally = state.getAt(true, 2, 0);
        assertNotNull(ally);
        assertEquals(2, ally.getTemporaryShield(), "Grant the shield immediately on placement.");
        CardInstance water = new CardInstance(new SieglingCard("water", "Water", Element.WATER, Rarity.COMMON, 10, 3, List.of(), Row.BACK), 0, 0, true);
        CardInstance foe = new CardInstance(fire, 0, 0, false);
        state.setAt(true, 0, 0, water);
        state.setAt(false, 0, 0, foe);
        Method recalculate = GameService.class.getDeclaredMethod("recalculateTrainerPassiveStatBuffs", GameState.class);
        recalculate.setAccessible(true);
        recalculate.invoke(service, state);
        assertEquals(2, ally.getTemporaryShield());
        assertEquals(0, water.getTemporaryShield());
        assertEquals(0, foe.getTemporaryShield());
        ally.takeRawDamage(1);
        recalculate.invoke(service, state);
        assertEquals(1, ally.getTemporaryShield(), "Recalculation must not refill consumed shield.");
        assertEquals(10, ally.getCurrentHealth());
        ally.takeRawDamage(3);
        recalculate.invoke(service, state);
        assertEquals(0, ally.getTemporaryShield());
        assertEquals(8, ally.getCurrentHealth(), "Only damage beyond the shield reaches HP.");
        CardInstance evolved = new CardInstance(fire, 2, 0, true);
        evolved.carryShieldFrom(ally);
        evolved.setTrainerPassiveShieldBuff(2);
        assertEquals(0, evolved.getTemporaryShield(), "Evolution must not refill a consumed passive grant.");
        ally.clearTemporaryEffects();
        recalculate.invoke(service, state);
        assertEquals(2, ally.getTemporaryShield(), "Refresh with the existing end-of-battle temporary-effect reset.");
        ally.addShield(3);
        player.setActiveTrainer(null);
        recalculate.invoke(service, state);
        assertEquals(3, ally.getTemporaryShield(), "Removing the passive preserves spell shields.");
        enemy.setActiveTrainer(pyla);
        recalculate.invoke(service, state);
        assertEquals(2, foe.getTemporaryShield(), "The opponent's passive uses the same rules.");
    }

    @Test
    void maxHealthBoostStaysPermanentWhileShieldAbsorbsDamageSeparately() {
        SieglingCard card = new SieglingCard("leaf", "Leaf", Element.EARTH, Rarity.COMMON, 10, 4, List.of(), Row.FRONT);
        CardInstance instance = new CardInstance(card, 0, 0, true);

        instance.addMaxHealthBoost(3);

        assertEquals(13, instance.getEffectiveMaxHealth());
        assertEquals(13, instance.getCurrentHealth());
        assertEquals(0, instance.getTemporaryShield());
        assertFalse(instance.getStatusEffects().contains(StatusEffect.HEALTH_BOOST));

        instance.clearTemporaryEffects();

        assertEquals(13, instance.getEffectiveMaxHealth());
        assertEquals(13, instance.getCurrentHealth());

        instance.addShield(2);
        instance.takeRawDamage(1);

        assertEquals(1, instance.getTemporaryShield());
        assertEquals(13, instance.getCurrentHealth());
        assertTrue(instance.getStatusEffects().contains(StatusEffect.HEALTH_BOOST));

        instance.takeRawDamage(3);

        assertEquals(0, instance.getTemporaryShield());
        assertEquals(11, instance.getCurrentHealth());
        assertFalse(instance.getStatusEffects().contains(StatusEffect.HEALTH_BOOST));
    }

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
    void placedEnergyBoostPassiveFeedsThePoolAndSurvivesTheNextDraw() throws Exception {
        GameService gameService = new GameService();
        PlacementService placementService = new PlacementService();
        MovesPoolService pool = new MovesPoolService(new com.fasterxml.jackson.databind.ObjectMapper(), null);
        setField(gameService, "energyService", new EnergyService(placementService, pool));
        setField(gameService, "placementService", placementService);
        setField(gameService, "effectService", new EffectService());

        Player player = new Player("Player", true);
        Player enemy = new Player("Enemy", false);
        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);

        // The shipped pool move: passive, 1 Fire energy, no notch link and no socket involved.
        SieglingCard card = new SieglingCard("wellspring", "Wellspring", Element.FIRE, Rarity.COMMON, 10, 3,
                List.of(new Notch(NotchDirection.TOP, Element.FIRE)), Row.MIDDLE);
        card.setMoveIds(List.of("fire-energy-boost"));
        player.getHand().add(card);

        gameService.placeSiegling(state, true, "wellspring", 1, 1);

        assertEquals(1, player.getFireEnergy(), "The passive should pay into the pool as soon as the card lands.");

        // The Draw phase clears claim-style temporary energy; a board passive must outlive it.
        state.setCurrentPhase(Phase.DRAW);
        gameService.draw(state, true);

        assertEquals(1, player.getFireEnergy());
        assertEquals(0, enemy.getFireEnergy());
    }

    /**
     * An active energy buff is immediate, rides through the owner's Setup phase, and is gone
     * before the fight: the whole point is that it pays for placements, not for attacks.
     */
    @Test
    void activeEnergyBuffIsImmediateAndFadesWhenTheBattlePhaseBegins() throws Exception {
        GameService gameService = newGameServiceWithBattleStack();
        EnergyService energyService = getField(gameService, "energyService");
        EffectService effectService = getField(gameService, "effectService");

        Player player = new Player("Player", true);
        Player enemy = new Player("Enemy", false);
        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);

        SieglingCard card = new SieglingCard("dynamo", "Dynamo", Element.ELECTRIC, Rarity.COMMON, 10, 3,
                List.of(), Row.MIDDLE);
        CardInstance source = new CardInstance(card, 1, 1, true);
        state.setAt(true, 1, 1, source);

        Ability charge = new Ability("Overcharge", "Generate 2 electric energy",
                TargetType.SELF, null, 0, AbilityEffectKeys.ENERGY_BOOST, 2, false);
        effectService.resolveAbility(state, charge, source, true, -1, -1);

        // Immediate: spendable in the setup phase it was used in, before any recalculation.
        assertTrue(player.isOvercharged());
        assertEquals(2, player.getElectricEnergy());
        assertEquals(0, enemy.getElectricEnergy());

        // Still there after a mid-setup recalculation (placing a card triggers one).
        energyService.recalculateEnergy(state);
        assertEquals(2, player.getElectricEnergy());

        // Carries through the owner's next Setup phase.
        state.setCurrentPhase(Phase.DRAW);
        gameService.draw(state, true);
        assertTrue(player.isOvercharged());
        assertEquals(2, player.getElectricEnergy());

        // ...and is gone the moment the battle phase opens.
        state.setSetupTurnsTakenThisRound(1);
        gameService.endTurn(state, true);

        assertEquals(Phase.BATTLE, state.getCurrentPhase());
        assertFalse(player.isOvercharged());
        assertEquals(0, player.getElectricEnergy());
        assertTrue(state.getGameLog().stream()
                .anyMatch(line -> line.contains("Overcharge fades as the battle phase begins")));
    }

    @Test
    void battlePhaseBoundaryDoesNotSurfaceOrResolveFirstActorUntilAdvanced() throws Exception {
        GameService gameService = newGameServiceWithBattleStack();
        Method startBattlePhase = GameService.class.getDeclaredMethod("startBattlePhase", GameState.class);
        startBattlePhase.setAccessible(true);

        GameState playerFirst = battleBoundaryState(7, 3);
        CardInstance playerLead = playerFirst.getAt(true, 1, 1);
        startBattlePhase.invoke(gameService, playerFirst);
        assertEquals(Phase.BATTLE, playerFirst.getCurrentPhase());
        assertEquals(0, playerFirst.getBattleCursor(), "The banner boundary must keep the full speed order untouched.");
        assertNull(playerFirst.getPendingBattleInstanceId(), "A player-first action must not be exposed under the banner.");
        gameService.executeBattle(playerFirst);
        assertEquals(playerLead.getInstanceId(), playerFirst.getPendingBattleInstanceId(),
                "The player choice should surface only after the client advances beyond the banner.");

        GameState enemyFirst = battleBoundaryState(3, 7);
        int playerHpBefore = enemyFirst.getAt(true, 1, 1).getCurrentHealth();
        startBattlePhase.invoke(gameService, enemyFirst);
        assertEquals(0, enemyFirst.getBattleCursor());
        assertNull(enemyFirst.getPendingBattleInstanceId());
        assertEquals(playerHpBefore, enemyFirst.getAt(true, 1, 1).getCurrentHealth(),
                "An AI-first attack must not resolve in the same response as the phase banner.");
        gameService.executeBattle(enemyFirst);
        assertTrue(enemyFirst.getBattleCursor() > 0, "The AI actor should advance after the banner gate opens.");
        assertTrue(enemyFirst.getAt(true, 1, 1).getCurrentHealth() < playerHpBefore,
                "The deferred AI action should resolve when battle is explicitly advanced.");
    }

    @Test
    void spendingOverchargedEnergyStaysSpentForTheRestOfTheTurn() throws Exception {
        GameService gameService = new GameService();
        PlacementService placementService = new PlacementService();
        EnergyService energyService = new EnergyService(placementService);
        setField(gameService, "energyService", energyService);
        setField(gameService, "placementService", placementService);
        setField(gameService, "effectService", new EffectService());

        Player player = new Player("Player", true);
        GameState state = new GameState();
        state.setPlayer(player);
        state.setEnemy(new Player("Enemy", false));
        state.setCurrentPhase(Phase.DRAW);
        state.setPlayerTurn(true);

        EnergyService.grantOverchargeEnergy(player, Element.FIRE, 3);
        gameService.draw(state, true);
        assertEquals(3, player.getFireEnergy());

        energyService.spendEnergy(state, true, Element.FIRE, 2);
        assertEquals(1, player.getFireEnergy());
        assertEquals(1, player.getOverchargeEnergy(Element.FIRE),
                "Spends must drain the overcharge ledger, not only the live pool.");

        // A later recalculation must not refund the spend, only keep the surge.
        energyService.recalculateEnergy(state);
        assertEquals(1, player.getFireEnergy());
    }

    /**
     * Spending an overcharge during Setup must not leave temporary debt that steals board
     * energy when the surge fades at Battle. Concrete trigger: board has 2 fire from links,
     * active boost grants +2, player spends those 2 on a cast, Battle opens — board fire must
     * still read 2 (the spent surge is gone; the links are not).
     */
    @Test
    void spendingOverchargeDoesNotStealBoardEnergyWhenBattleBegins() throws Exception {
        GameService gameService = newGameServiceWithBattleStack();
        EnergyService energyService = getField(gameService, "energyService");

        GameState state = new GameState();
        Player player = new Player("Player", true);
        state.setPlayer(player);
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
        assertEquals(2, player.getFireEnergy(), "Board links should supply 2 fire before the surge.");

        EnergyService.grantOverchargeEnergy(player, Element.FIRE, 2);
        assertEquals(4, player.getFireEnergy());

        energyService.spendEnergy(state, true, Element.FIRE, 2);
        assertEquals(2, player.getFireEnergy());
        assertFalse(player.isOvercharged(), "The spent surge should be fully consumed.");
        assertEquals(0, player.getTemporaryEnergyAdjustment(Element.FIRE),
                "Spending only overcharge must not book claim-style temporary debt.");

        Method startBattlePhase = GameService.class.getDeclaredMethod("startBattlePhase", GameState.class);
        startBattlePhase.setAccessible(true);
        startBattlePhase.invoke(gameService, state);

        assertEquals(Phase.BATTLE, state.getCurrentPhase());
        assertEquals(2, player.getFireEnergy(),
                "Battle restore must keep board link energy after a spent overcharge fades.");
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
    void successfulActionCardsConsumeSetupActionBudget() throws Exception {
        GameService gameService = new GameService();
        PlacementService placementService = new PlacementService();
        setField(gameService, "energyService", new EnergyService(placementService));
        setField(gameService, "placementService", placementService);
        setField(gameService, "effectService", new EffectService());

        Player player = new Player("Player", true);
        Player enemy = new Player("Enemy", false);
        GameState spellState = new GameState();
        spellState.setPlayer(player);
        spellState.setEnemy(enemy);
        spellState.setCurrentPhase(Phase.SETUP);
        spellState.setPlayerTurn(true);
        spellState.setFirstTurn(false);

        SpellCard spell = new SpellCard(
                "budget-spell",
                "Budget Spell",
                Element.FIRE,
                Rarity.COMMON,
                0,
                Ability.damage("Budget Spell", "Deal 3 damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 3)
        );
        SieglingCard followUp = new SieglingCard("follow-up", "Follow Up", Element.FIRE, Rarity.COMMON, 10, 0, List.of(), Row.FRONT);
        player.getHand().add(spell);
        player.getHand().add(followUp);

        gameService.castSpell(spellState, true, "budget-spell", -1, -1);
        gameService.placeSiegling(spellState, true, "follow-up", 2, 0);

        assertEquals(47, enemy.getHealth(), "The spell should resolve.");
        assertEquals(1, spellState.getSieglingSetupActionsUsed(true), "The spell should spend the only base setup action.");
        assertNull(spellState.getAt(true, 2, 0), "No follow-up placement should be allowed after the action budget is spent.");
        assertTrue(player.getHand().contains(followUp), "Blocked follow-up cards should remain in hand.");

        Player trapPlayer = new Player("Trap Player", true);
        Player trapEnemy = new Player("Trap Enemy", false);
        GameState trapState = new GameState();
        trapState.setPlayer(trapPlayer);
        trapState.setEnemy(trapEnemy);
        trapState.setCurrentPhase(Phase.SETUP);
        trapState.setPlayerTurn(true);
        trapState.setFirstTurn(false);

        TrapCard trap = new TrapCard(
                "budget-trap",
                "Budget Trap",
                Element.FIRE,
                Rarity.COMMON,
                Element.FIRE,
                0,
                Ability.damage("Budget Trap", "Deal 4 damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 4)
        );
        SieglingCard trapFollowUp = new SieglingCard("trap-follow-up", "Trap Follow Up", Element.FIRE, Rarity.COMMON, 10, 0, List.of(), Row.FRONT);
        trapPlayer.getHand().add(trap);
        trapPlayer.getHand().add(trapFollowUp);

        gameService.castSpell(trapState, true, "budget-trap", -1, -1);
        gameService.placeSiegling(trapState, true, "trap-follow-up", 2, 0);

        assertEquals(46, trapEnemy.getHealth(), "The trap should resolve.");
        assertEquals(1, trapState.getSieglingSetupActionsUsed(true), "The trap should spend the only base setup action.");
        assertNull(trapState.getAt(true, 2, 0), "No follow-up placement should be allowed after the trap spends the budget.");
        assertTrue(trapPlayer.getHand().contains(trapFollowUp), "Blocked follow-up cards should remain in hand.");
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
    void aiOverchargeSurvivesItsOwnDrawAndSetupPhase() throws Exception {
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

        EnergyService.grantOverchargeEnergy(enemy, Element.FIRE, 2);

        // The AI runs its own draw phase instead of GameService.draw; the surge must ride
        // through it rather than being wiped by the AI's own energy recalculation.
        aiService.executeAITurn(state);

        assertTrue(enemy.isOvercharged());
        assertEquals(2, enemy.getFireEnergy());
        assertEquals(0, player.getFireEnergy());
    }

    @Test
    void aiActionCardsSpendSetupBudgetBeforeTryingTrap() throws Exception {
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
        SieglingCard playerAnchor = new SieglingCard(
                "player-anchor",
                "Player Anchor",
                Element.FIRE,
                Rarity.COMMON,
                10,
                0,
                List.of(),
                Row.FRONT
        );
        state.setAt(true, 2, 0, new CardInstance(playerAnchor, 2, 0, true));

        SpellCard spell = new SpellCard(
                "ai-budget-spell",
                "AI Budget Spell",
                Element.FIRE,
                Rarity.COMMON,
                0,
                Ability.damage("AI Budget Spell", "Deal 4 damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 4)
        );
        TrapCard trap = new TrapCard(
                "ai-budget-trap",
                "AI Budget Trap",
                Element.FIRE,
                Rarity.COMMON,
                Element.FIRE,
                0,
                Ability.damage("AI Budget Trap", "Deal 5 damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 5)
        );
        enemy.getHand().add(spell);
        enemy.getHand().add(trap);

        aiService.executeAITurn(state);

        assertEquals(1, state.getSieglingSetupActionsUsed(false), "The AI spell should spend the only base setup action.");
        assertEquals(46, player.getHealth(), "The AI should cast the spell but not also spring the trap.");
        assertFalse(enemy.getHand().contains(spell));
        assertTrue(enemy.getDiscard().contains(spell));
        assertTrue(enemy.getHand().contains(trap), "The AI trap should remain in hand once the setup budget is spent.");
        assertFalse(enemy.getDiscard().contains(trap), "The AI trap should not be discarded without resolving.");
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

        gameService.executeBattle(state);
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

    @Test
    void chillFreezeOutlivesTheBattlePhaseWithoutItsBadges() throws Exception {
        GameService gameService = new GameService();

        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("Enemy", false));
        state.setCurrentPhase(Phase.BATTLE);

        SieglingCard card = new SieglingCard("frosty", "Frosty", Element.ICE, Rarity.COMMON, 13, 6, List.of(), Row.FRONT);
        CardInstance chillFrozen = new CardInstance(card, 0, 0, true);
        // The stacks are already spent by the freeze they triggered — only the flag carries it.
        chillFrozen.setChillFrozen(true);
        chillFrozen.getStatusEffects().add(StatusEffect.FREEZE);
        state.setAt(true, 0, 0, chillFrozen);

        Method clearTempEffects = GameService.class.getDeclaredMethod("clearTempEffects", GameState.class);
        clearTempEffects.setAccessible(true);
        clearTempEffects.invoke(gameService, state);

        assertTrue(chillFrozen.getStatusEffects().contains(StatusEffect.FREEZE),
                "Chill-freeze must survive the end of battle and thaw at its owner's next Setup.");
        assertEquals(0, chillFrozen.getAfflictionStacks(ElementalAffliction.CHILL));
    }

    @Test
    void shieldFromSetupPersistsIntoBattlePhase() throws Exception {
        GameService gameService = new GameService();
        EffectService effectService = new EffectService();
        PlacementService placementService = new PlacementService();
        EnergyService energyService = new EnergyService(placementService);
        BattleService battleService = new BattleService();
        setField(battleService, "effectService", effectService);
        setField(battleService, "energyService", energyService);
        setField(battleService, "movesPoolService", new MovesPoolService(new com.fasterxml.jackson.databind.ObjectMapper(), null));
        setField(gameService, "effectService", effectService);
        setField(gameService, "battleService", battleService);
        setField(gameService, "energyService", energyService);

        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("Enemy", false));
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);

        SieglingCard card = new SieglingCard("guard", "Guard", Element.EARTH, Rarity.COMMON, 12, 4, List.of(), Row.FRONT);
        CardInstance ally = new CardInstance(card, 1, 1, true);
        state.setAt(true, 1, 1, ally);

        Ability shield = new Ability(
                "Stone Ward",
                "Grant 2 Shield",
                TargetType.SINGLE_ALLY,
                null,
                0,
                AbilityEffectKeys.SHIELD,
                2,
                false
        );
        effectService.resolveAbility(state, shield, null, true, 1, 1);

        assertEquals(2, ally.getTemporaryShield(), "Shield should be applied during setup.");

        Method startBattlePhase = GameService.class.getDeclaredMethod("startBattlePhase", GameState.class);
        startBattlePhase.setAccessible(true);
        startBattlePhase.invoke(gameService, state);

        assertEquals(Phase.BATTLE, state.getCurrentPhase());
        CardInstance onBoard = state.getAt(true, 1, 1);
        assertEquals(2, onBoard.getTemporaryShield(), "Shield should persist when battle phase begins.");
    }

    @Test
    void tutorialPlayerDeckPutsLessonCardsOnTopInOrder() throws Exception {
        GameService gameService = new GameService();
        CardDefinitionService stubs = new CardDefinitionService() {
            @Override
            public java.util.Optional<Card> findCardCopy(String cardId) {
                if ("trap13".equals(cardId)) {
                    return java.util.Optional.of(new TrapCard(
                            "trap13", "Shatter Seal", Element.FIRE, Rarity.RARE,
                            Element.ICE, 3,
                            Ability.damage("Shatter", "Deal 4 if opponent has 3 Ice",
                                    TargetType.SINGLE_ENEMY, null, 1, 4)));
                }
                if ("spell_fire_09".equals(cardId)) {
                    return java.util.Optional.of(new SpellCard("spell_fire_09", "Cinder Volley", Element.FIRE, Rarity.COMMON, 1,
                            new Ability("Volley", "Allies +1 attack", TargetType.ALL_ALLIES, null, 0,
                                    AbilityEffectKeys.DAMAGE_BOOST, 1, false)));
                }
                if ("spell_earth_02".equals(cardId)) {
                    return java.util.Optional.of(new SpellCard("spell_earth_02", "Root Guard", Element.EARTH, Rarity.COMMON, 1,
                            new Ability("Guard", "Allies +3 max Health", TargetType.ALL_ALLIES, null, 0,
                                    AbilityEffectKeys.HEALTH_BOOST, 3, false)));
                }
                if ("spell_earth_01".equals(cardId)) {
                    return java.util.Optional.of(new SpellCard("spell_earth_01", "Root Bind", Element.EARTH, Rarity.COMMON, 1,
                            new Ability("Bind", "Set Speed to 0", TargetType.SINGLE_ENEMY, null, 1,
                                    AbilityEffectKeys.SPEED_ZERO, 1, false)));
                }
                return java.util.Optional.empty();
            }
        };
        setField(gameService, "cardDefs", stubs);

        Player player = new Player("Roc", true);
        List<Card> mixed = new ArrayList<>();
        mixed.add(new SpellCard("spell_fire_06", "Cinder Bolt", Element.FIRE, Rarity.COMMON, 1,
                Ability.damage("Bolt", "Deal 4", TargetType.SINGLE_ENEMY, null, 1, 4)));
        mixed.add(baseSiegling("pylook", "Pylook", Element.FIRE));
        mixed.add(baseSiegling("pylook", "Pylook", Element.FIRE));
        mixed.add(baseSiegling("squirebud", "Squire Bud", Element.EARTH));
        mixed.add(baseSiegling("sundile", "Sundile", Element.FIRE));
        mixed.add(new TrapCard("trap01", "Backfire", Element.FIRE, Rarity.UNCOMMON,
                Element.FIRE, 3, Ability.damage("Boom", "Deal 4", TargetType.SINGLE_ENEMY, null, 1, 4)));
        player.setDeck(mixed);

        Method prepare = GameService.class.getDeclaredMethod("prepareTutorialPlayerDeck", Player.class);
        prepare.setAccessible(true);
        prepare.invoke(gameService, player);

        List<String> top = player.getDeck().stream().limit(5).map(Card::getId).toList();
        assertEquals(List.of("sundile", "pylook", "tutorial_ashfall", "trap13", "pylook"), top,
                "Round two links Pylook to Sundile, so Pylook is dealt and the spare copy sits "
                        + "in the practice-redraw slot; Squire Bud waits for the round-three combo.");
        assertTrue(player.getDeck().stream().anyMatch(c -> "trap13".equals(c.getId())));
        assertTrue(player.getDeck().stream().anyMatch(c -> "tutorial_ashen_ward".equals(c.getId())),
                "Advanced shield Strategy should be injected");
        assertTrue(player.getDeck().stream().anyMatch(c -> "spell_fire_09".equals(c.getId()) || "spell_earth_02".equals(c.getId())),
                "Advanced buff Strategies should be seeded when available");
    }

    @Test
    void tutorialMulliganLocksLessonCardsAndPreservesDeckOrder() throws Exception {
        GameService gameService = new GameService();
        CardDefinitionService stubs = new CardDefinitionService() {
            @Override
            public java.util.Optional<Card> findCardCopy(String cardId) {
                if ("trap13".equals(cardId)) {
                    return java.util.Optional.of(new TrapCard(
                            "trap13", "Shatter Seal", Element.FIRE, Rarity.RARE,
                            Element.ICE, 3,
                            Ability.damage("Shatter", "Deal 4 if opponent has 3 Ice",
                                    TargetType.SINGLE_ENEMY, null, 1, 4)));
                }
                return java.util.Optional.empty();
            }
        };
        setField(gameService, "cardDefs", stubs);

        Player player = new Player("Roc", true);
        List<Card> mixed = new ArrayList<>();
        mixed.add(baseSiegling("sundile", "Sundile", Element.FIRE));
        mixed.add(baseSiegling("squirebud", "Squire Bud", Element.EARTH));
        mixed.add(new SpellCard("spell_fire_06", "Cinder Bolt", Element.FIRE, Rarity.COMMON, 1,
                Ability.damage("Bolt", "Deal 4", TargetType.SINGLE_ENEMY, null, 1, 4)));
        mixed.add(baseSiegling("pylook", "Pylook", Element.FIRE));
        mixed.add(baseSiegling("pylook", "Pylook", Element.FIRE));
        mixed.add(baseSiegling("generoot", "Generoot", Element.EARTH));
        mixed.add(baseSiegling("raydile", "Raydile", Element.FIRE));
        mixed.add(baseSiegling("floraknight", "Flora Knight", Element.EARTH));
        player.setDeck(mixed);

        Method prepare = GameService.class.getDeclaredMethod("prepareTutorialPlayerDeck", Player.class);
        prepare.setAccessible(true);
        prepare.invoke(gameService, player);

        GameState state = new GameState();
        state.setTutorialMatch(true);
        state.setPlayer(player);
        state.setEnemy(new Player("Dummy", false));
        state.setCurrentPhase(Phase.MULLIGAN);
        state.setMulliganPending(true, true);
        // Keep the enemy pending so completing the player side does not advance phases
        // (this unit test only asserts hand/deck scripting).
        state.setMulliganPending(false, true);
        for (int i = 0; i < 5; i++) {
            player.drawCard();
        }

        List<String> opening = player.getHand().stream().map(Card::getId).toList();
        assertEquals(List.of("sundile", "pylook", "tutorial_ashfall", "trap13", "pylook"), opening);
        assertEquals("raydile", player.getDeck().get(0).getId());

        // Dumping lesson cards is ignored — treated as a keep.
        gameService.resolveOpeningMulligan(state, true, List.of(0, 1, 2));
        assertEquals(opening, player.getHand().stream().map(Card::getId).toList());
        assertFalse(state.isMulliganPending(true));
        assertFalse(state.hasUsedMulligan(true));

        // Fresh opening hand for the practice redraw path.
        state = new GameState();
        state.setTutorialMatch(true);
        player = new Player("Roc", true);
        List<Card> mixed2 = new ArrayList<>();
        mixed2.add(baseSiegling("sundile", "Sundile", Element.FIRE));
        mixed2.add(baseSiegling("squirebud", "Squire Bud", Element.EARTH));
        mixed2.add(new SpellCard("spell_fire_06", "Cinder Bolt", Element.FIRE, Rarity.COMMON, 1,
                Ability.damage("Bolt", "Deal 4", TargetType.SINGLE_ENEMY, null, 1, 4)));
        mixed2.add(baseSiegling("pylook", "Pylook", Element.FIRE));
        mixed2.add(baseSiegling("pylook", "Pylook", Element.FIRE));
        mixed2.add(baseSiegling("generoot", "Generoot", Element.EARTH));
        mixed2.add(baseSiegling("raydile", "Raydile", Element.FIRE));
        mixed2.add(baseSiegling("floraknight", "Flora Knight", Element.EARTH));
        player.setDeck(mixed2);
        prepare.invoke(gameService, player);
        state.setPlayer(player);
        state.setEnemy(new Player("Dummy", false));
        state.setCurrentPhase(Phase.MULLIGAN);
        state.setMulliganPending(true, true);
        state.setMulliganPending(false, true);
        for (int i = 0; i < 5; i++) {
            player.drawCard();
        }

        gameService.resolveOpeningMulligan(state, true, List.of(4));
        List<String> after = player.getHand().stream().map(Card::getId).toList();
        assertEquals(List.of("sundile", "pylook", "tutorial_ashfall", "trap13", "raydile"), after);
        // Raydile is the mulligan replacement; Flora Knight is ready for the first normal draw.
        assertEquals("floraknight", player.getDeck().get(0).getId(),
                "Deck order must stay intact after a non-shuffling tutorial mulligan");
        assertTrue(state.hasUsedMulligan(true));
    }

    private SieglingCard baseSiegling(String id, String name, Element element) {
        return new SieglingCard(id, name, element, Rarity.COMMON, 8, 4, List.of(), Row.FRONT);
    }

    private GameState battleBoundaryState(int playerSpeed, int enemySpeed) {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("Enemy", false));
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);

        Ability strike = Ability.damage("Strike", "Deal 1 damage", TargetType.SINGLE_ENEMY, null, 0, 1);
        SieglingCard playerCard = new SieglingCard(
                "emberfox", "Emberfox", Element.FIRE, Rarity.COMMON, 8, playerSpeed, List.of(), Row.MIDDLE);
        SieglingCard enemyCard = new SieglingCard(
                "splashfin", "Splashfin", Element.WATER, Rarity.COMMON, 8, enemySpeed, List.of(), Row.MIDDLE);
        playerCard.setAbility(strike);
        enemyCard.setAbility(strike.copy());
        state.setAt(true, 1, 1, new CardInstance(playerCard, 1, 1, true));
        state.setAt(false, 1, 1, new CardInstance(enemyCard, 1, 1, false));
        return state;
    }

    /** A GameService wired far enough to run a setup turn all the way into the battle phase. */
    private GameService newGameServiceWithBattleStack() throws Exception {
        GameService gameService = new GameService();
        EffectService effectService = new EffectService();
        PlacementService placementService = new PlacementService();
        EnergyService energyService = new EnergyService(placementService);
        BattleService battleService = new BattleService();
        setField(battleService, "effectService", effectService);
        setField(battleService, "energyService", energyService);
        setField(battleService, "movesPoolService",
                new MovesPoolService(new com.fasterxml.jackson.databind.ObjectMapper(), null));
        setField(gameService, "effectService", effectService);
        setField(gameService, "battleService", battleService);
        setField(gameService, "energyService", energyService);
        setField(gameService, "placementService", placementService);
        return gameService;
    }

    @SuppressWarnings("unchecked")
    private <T> T getField(Object target, String fieldName) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        return (T) field.get(target);
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }
}
