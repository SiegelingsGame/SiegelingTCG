package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.BattleAbilityOption;
import com.sieglings.model.Card;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.enums.StatusEffect;
import com.sieglings.model.enums.TargetType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.stream.IntStream;

/**
 * Core game orchestrator managing turns, phases, and win conditions.
 */
@Service
public class GameService {

    public record StartOptions(String playerDeckId, String playerTrainerId, List<String> customDeckCards, String loadoutLabel) {}

    private record ResolvedLoadout(
            List<Card> deck,
            TrainerCard trainer,
            List<Element> elements,
            String label,
            String deckId,
            boolean custom
    ) {}

    @Autowired
    private CardDefinitionService cardDefs;

    @Autowired
    private EnergyService energyService;

    @Autowired
    private PlacementService placementService;

    @Autowired
    private BattleService battleService;

    @Autowired
    private EffectService effectService;

    @Autowired
    private AIService aiService;

    @Autowired
    private MatchHistoryService matchHistoryService;

    private GameState currentGame;
    private final Random random = new Random();

    public GameState newGame() {
        return newGame("deck_fire_earth", "trainer05", null);
    }

    public GameState newGame(String playerDeckId, String playerTrainerId) {
        return newGame(playerDeckId, playerTrainerId, null);
    }

    public GameState newGame(String playerDeckId, String playerTrainerId, List<String> customDeckCards) {
        currentGame = createGame(
                new StartOptions(playerDeckId, playerTrainerId, customDeckCards, null),
                null,
                "Player",
                "AI Opponent",
                false
        );
        return currentGame;
    }

    public GameState newMultiplayerGame(StartOptions playerOneOptions, StartOptions playerTwoOptions,
                                        String playerOneName, String playerTwoName) {
        return createGame(playerOneOptions, playerTwoOptions, playerOneName, playerTwoName, true);
    }

    public List<CardDefinitionService.DeckOption> getDeckOptions() {
        return cardDefs.getDeckOptions();
    }

    public List<TrainerCard> getTrainerOptions() {
        return cardDefs.createTrainers().stream().map(TrainerCard::copy).toList();
    }

    public List<Card> getDeckBuilderCatalog() {
        return cardDefs.getDeckBuilderCatalog();
    }

    public int getDeckBuilderMinSize() {
        return cardDefs.getDeckBuilderMinSize();
    }

    public int getDeckBuilderMaxCopies() {
        return cardDefs.getDeckBuilderMaxCopies();
    }

    public GameState getState() {
        return currentGame;
    }

    public GameState playerDraw() {
        return draw(currentGame, true);
    }

    public GameState draw(GameState state, boolean isPlayerSide) {
        if (state == null || state.isGameOver()) return state;
        if (state.getCurrentPhase() != Phase.DRAW || state.isPlayerTurn() != isPlayerSide) {
            return state;
        }

        Player actor = getSidePlayer(state, isPlayerSide);
        state.resetPlacementsForTurn(isPlayerSide);
        if (actor.getActiveTrainer() != null) {
            actor.getActiveTrainer().resetTurn();
        }

        Card drawn = actor.drawCard();
        if (drawn != null) {
            state.log(sideName(state, isPlayerSide) + " draws a card.");
        } else {
            state.log(sideName(state, isPlayerSide) + "'s deck is empty!");
        }

        state.setCurrentPhase(Phase.SETUP);
        energyService.recalculateEnergy(state);
        return state;
    }

    public GameState placeSiegling(String cardId, int row, int col) {
        return placeSiegling(currentGame, true, cardId, row, col);
    }

    public GameState placeSiegling(GameState state, boolean isPlayerSide, String cardId, int row, int col) {
        if (state == null || state.isGameOver()) return state;
        if (state.isPlayerTurn() != isPlayerSide) {
            state.log("Wait for your turn before placing a Siegling.");
            return state;
        }
        if (state.getCurrentPhase() != Phase.SETUP) {
            state.log("Can only place cards during Setup phase!");
            return state;
        }

        Player actor = getSidePlayer(state, isPlayerSide);
        Card card = findInHand(actor, cardId);
        if (!(card instanceof SieglingCard siegling)) {
            state.log("Card not found in hand or not a Siegling!");
            return state;
        }
        if (state.hasPlacedSieglingThisTurn(isPlayerSide)) {
            state.log("You can only place 1 Siegling per turn.");
            return state;
        }
        if (!energyService.canAfford(state, isPlayerSide, siegling.getCostElement(), siegling.getCostAmount())) {
            state.log("Not enough energy to play " + siegling.getName() + "!");
            return state;
        }
        if (!placementService.isLegalPlacement(state, isPlayerSide, row, col, siegling)) {
            state.log("Cannot place at that position!");
            return state;
        }

        CardInstance existing = state.getAt(isPlayerSide, row, col);
        boolean evolutionPlacement = placementService.isEvolutionPlacement(state, isPlayerSide, row, col, siegling);
        CardInstance instance = placementService.createPlacedInstance(existing, siegling, isPlayerSide, row, col);
        if (!evolutionPlacement) {
            instance.setPlacementOrder(state.consumePlacementOrder());
        }
        state.setAt(isPlayerSide, row, col, instance);
        state.recordSieglingPlacement(isPlayerSide);
        actor.removeFromHand(card);

        if (evolutionPlacement && existing != null) {
            state.log(sideName(state, isPlayerSide) + " evolves " + existing.getName() + " into " + siegling.getName()
                    + " at " + rowName(row) + " row, col " + col + ".");
        } else {
            state.log(sideName(state, isPlayerSide) + " places " + siegling.getName()
                    + " at " + rowName(row) + " row, col " + col + ".");
        }

        energyService.recalculateEnergy(state);
        return state;
    }

    public GameState castSpell(String cardId, int targetRow, int targetCol) {
        return castSpell(currentGame, true, cardId, targetRow, targetCol);
    }

    public GameState castSpell(GameState state, boolean isPlayerSide, String cardId, int targetRow, int targetCol) {
        if (state == null || state.isGameOver()) return state;
        if (state.isPlayerTurn() != isPlayerSide) {
            state.log("Wait for your turn before casting cards.");
            return state;
        }
        if (state.getCurrentPhase() != Phase.SETUP) {
            state.log("Can only cast spells during Setup phase!");
            return state;
        }
        if (isOpeningTurnRestricted(state, isPlayerSide)) {
            state.log("Player 1 cannot cast spells on turn 1.");
            return state;
        }

        Player actor = getSidePlayer(state, isPlayerSide);
        Card card = findInHand(actor, cardId);
        if (card instanceof SpellCard spell) {
            if (!energyService.canCastSpell(state, isPlayerSide, spell)) {
                state.log("Requirements not met to cast " + spell.getName() + "!");
                return state;
            }

            effectService.resolveAbility(state, spell.getAbility(), null, isPlayerSide, targetRow, targetCol);
            actor.removeFromHand(card);
            actor.getDiscard().add(card);
            state.log(sideName(state, isPlayerSide) + " casts " + spell.getName() + "!");
            // Spend energy from pool instead of recalculating (pool restores at next phase)
            energyService.spendEnergy(state, isPlayerSide, spell.getCostElement(), spell.getCostAmount());
        } else if (card instanceof TrapCard trap) {
            if (!energyService.canTriggerTrap(state, isPlayerSide, trap)) {
                state.log("Opponent bucket does not meet the trigger for " + trap.getName() + "!");
                return state;
            }

            effectService.resolveAbility(state, trap.getAbility(), null, isPlayerSide, targetRow, targetCol);
            actor.removeFromHand(card);
            actor.getDiscard().add(card);
            state.log(sideName(state, isPlayerSide) + " springs trap " + trap.getName() + "!");
            // Spend energy from pool instead of recalculating
            energyService.spendEnergy(state, isPlayerSide, trap.getCostElement(), trap.getCostAmount());
        } else {
            state.log("Spell or trap not found in hand!");
            return state;
        }

        state.removeDeadSieglings();
        checkWinCondition(state);
        return state;
    }

    public GameState useTrainerAbility(int targetRow, int targetCol) {
        return useTrainerAbility(currentGame, true, targetRow, targetCol);
    }

    public GameState useTrainerAbility(GameState state, boolean isPlayerSide, int targetRow, int targetCol) {
        if (state == null || state.isGameOver()) return state;
        if (state.isPlayerTurn() != isPlayerSide) {
            state.log("Wait for your turn before using a SiegeKnight action.");
            return state;
        }
        if (isOpeningTurnRestricted(state, isPlayerSide)) {
            state.log("Player 1 cannot use trainer actions on turn 1.");
            return state;
        }

        TrainerCard trainer = getSidePlayer(state, isPlayerSide).getActiveTrainer();
        if (trainer == null || !trainer.canUseActive()) {
            state.log("Trainer ability not available!");
            return state;
        }

        effectService.resolveAbility(state, trainer.getActiveAbility(), null, isPlayerSide, targetRow, targetCol);
        trainer.useActive();
        state.log(sideName(state, isPlayerSide) + " uses trainer ability: " + trainer.getActiveAbility().getName());

        state.removeDeadSieglings();
        // Don't recalculate energy here - pool persists until next phase restore
        checkWinCondition(state);
        return state;
    }

    public GameState executeBattle() {
        return executeBattle(currentGame);
    }

    public GameState executeBattle(GameState state) {
        if (state == null || state.isGameOver()) return state;
        if (state.getCurrentPhase() != Phase.BATTLE) {
            state.log("Battle begins automatically after both setup turns are passed.");
            return state;
        }
        battleService.advanceBattle(state);
        completeBattleIfFinished(state);
        return state;
    }

    public GameState submitBattleAction(int abilityIndex, int targetRow, int targetCol) {
        return submitBattleAction(currentGame, true, abilityIndex, targetRow, targetCol);
    }

    public GameState submitBattleAction(GameState state, boolean isPlayerSide, int abilityIndex, int targetRow, int targetCol) {
        if (state == null || state.isGameOver()) return state;
        if (state.getCurrentPhase() != Phase.BATTLE) return state;

        CardInstance attacker = battleService.getPendingAttacker(state);
        if (attacker == null || attacker.isOwner() != isPlayerSide) {
            state.log("Wait for your battle action.");
            return state;
        }

        battleService.resolvePlayerAction(state, abilityIndex, targetRow, targetCol);
        completeBattleIfFinished(state);
        return state;
    }

    public GameState endTurn() {
        return endTurn(currentGame, true);
    }

    public GameState endTurn(GameState state, boolean isPlayerSide) {
        if (state == null || state.isGameOver()) return state;
        if (state.isPlayerTurn() != isPlayerSide) {
            state.log("Wait for your turn before passing.");
            return state;
        }
        if (state.getCurrentPhase() != Phase.SETUP) {
            state.log("Pass the turn during your setup phase.");
            return state;
        }

        state.log(sideName(state, isPlayerSide) + " passes the turn.");
        finishSetupTurn(state, isPlayerSide);
        return state;
    }

    public List<int[]> getPlayerLegalPlacements() {
        return getLegalPlacements(currentGame, true);
    }

    public List<int[]> getLegalPlacements(GameState state, boolean isPlayerSide) {
        if (state == null) return List.of();
        if (state.isPlayerTurn() != isPlayerSide || state.getCurrentPhase() != Phase.SETUP) return List.of();
        if (state.hasPlacedSieglingThisTurn(isPlayerSide)) return List.of();
        return placementService.getLegalPlacements(state, isPlayerSide);
    }

    public CardInstance getPendingBattleAttacker() {
        return getPendingBattleAttacker(currentGame);
    }

    public CardInstance getPendingBattleAttacker(GameState state) {
        return state == null ? null : battleService.getPendingAttacker(state);
    }

    public List<BattleAbilityOption> getPendingBattleAbilities() {
        return getPendingBattleAbilities(currentGame);
    }

    public List<BattleAbilityOption> getPendingBattleAbilities(GameState state) {
        CardInstance attacker = getPendingBattleAttacker(state);
        if (state == null || attacker == null) {
            return List.of();
        }
        return battleService.getAvailableAbilities(state, attacker);
    }

    private GameState createGame(StartOptions playerOptions, StartOptions enemyOptions,
                                 String playerName, String enemyName, boolean enemyHumanControlled) {
        GameState state = new GameState();
        state.setEnemyHumanControlled(enemyHumanControlled);

        Player player = new Player(playerName, true);
        Player enemy = new Player(enemyName, enemyHumanControlled);

        ResolvedLoadout playerLoadout = resolveLoadout(playerOptions, "deck_fire_earth", "trainer05");
        ResolvedLoadout enemyLoadout = enemyHumanControlled
                ? resolveLoadout(enemyOptions, "deck_water_wind", "trainer06")
                : resolveSoloEnemyLoadout(playerLoadout.deckId());

        player.setDeck(playerLoadout.deck());
        enemy.setDeck(enemyLoadout.deck());
        player.setActiveTrainer(playerLoadout.trainer());
        enemy.setActiveTrainer(enemyLoadout.trainer());
        player.setLoadoutLabel(playerLoadout.label());
        enemy.setLoadoutLabel(enemyLoadout.label());

        player.shuffleDeck();
        enemy.shuffleDeck();

        state.setPlayer(player);
        state.setEnemy(enemy);

        for (int i = 0; i < 5; i++) {
            player.drawCard();
            enemy.drawCard();
        }

        boolean playerStarts = random.nextBoolean();
        state.setCurrentPhase(Phase.MULLIGAN);
        state.resetRoundOrder(playerStarts);
        state.setMulliganPending(true, true);
        state.setMulliganUsed(true, false);
        state.setMulliganUsed(false, false);
        state.log("Game started!");
        state.log("Both players begin at 100 health.");
        state.log("Coin flip: " + sideName(state, playerStarts) + " goes first.");
        state.log(player.getName() + " deck: " + formatElements(playerLoadout.elements()) + " with " + playerLoadout.trainer().getName() + ".");
        state.log(enemy.getName() + " deck: " + formatElements(enemyLoadout.elements()) + " with " + enemyLoadout.trainer().getName() + ".");
        state.log("Opening hand check: each player may mulligan once (replace any subset; draw as many as you return).");
        state.log("Turn order this round: " + (playerStarts
                ? player.getName() + " -> " + enemy.getName() + " -> Battle"
                : enemy.getName() + " -> " + player.getName() + " -> Battle") + ".");

        if (!enemyHumanControlled) {
            resolveAutomatedOpeningMulligan(state, false);
        }
        tryCompleteOpeningMulligan(state);
        return state;
    }

    private ResolvedLoadout resolveLoadout(StartOptions options, String fallbackDeckId, String fallbackTrainerId) {
        StartOptions safeOptions = options == null
                ? new StartOptions(fallbackDeckId, fallbackTrainerId, null, null)
                : options;

        boolean usingCustomDeck = safeOptions.customDeckCards() != null && !safeOptions.customDeckCards().isEmpty();
        String deckId = safeOptions.playerDeckId() == null ? fallbackDeckId : safeOptions.playerDeckId();
        String trainerId = safeOptions.playerTrainerId() == null ? fallbackTrainerId : safeOptions.playerTrainerId();
        String preferredLabel = safeOptions.loadoutLabel() == null || safeOptions.loadoutLabel().isBlank()
                ? null
                : safeOptions.loadoutLabel().trim();

        if (usingCustomDeck) {
            List<Card> deck = cardDefs.buildCustomDeck(safeOptions.customDeckCards());
            return new ResolvedLoadout(deck, cardDefs.getTrainerById(trainerId), inferElements(deck), preferredLabel == null ? "Custom Loadout" : preferredLabel, null, true);
        }

        CardDefinitionService.DeckOption deckOption = cardDefs.getDeckOption(deckId)
                .orElseGet(() -> cardDefs.getDeckOption(fallbackDeckId).orElse(cardDefs.getDeckOptions().get(0)));
        return new ResolvedLoadout(
                cardDefs.buildDeckById(deckOption.id()),
                cardDefs.getTrainerById(trainerId),
                deckOption.elements(),
                preferredLabel == null ? deckOption.name() : preferredLabel,
                deckOption.id(),
                false
        );
    }

    private ResolvedLoadout resolveSoloEnemyLoadout(String playerDeckId) {
        CardDefinitionService.DeckOption enemyDeck = pickEnemyDeck(playerDeckId);
        TrainerCard trainer = pickEnemyTrainer(enemyDeck);
        return new ResolvedLoadout(
                cardDefs.buildDeckById(enemyDeck.id()),
                trainer,
                enemyDeck.elements(),
                enemyDeck.name(),
                enemyDeck.id(),
                false
        );
    }

    private void completeBattleIfFinished(GameState state) {
        if (state == null) return;
        if (state.isGameOver()) {
            state.clearBattleState();
            return;
        }
        if (state.getPendingBattleInstanceId() != null) return;
        if (state.getBattleCursor() < state.getBattleQueue().size()) return;

        clearTempEffects(state);
        state.removeDeadSieglings();
        energyService.recalculateEnergy(state);
        checkWinCondition(state);

        if (state.isGameOver()) {
            return;
        }
        startNextRound(state);
    }

    private void beginActiveSetupTurn(GameState state) {
        if (state == null || state.isGameOver()) {
            return;
        }
        state.setCurrentPhase(Phase.DRAW);
        state.resetPlacementsForTurn(state.isPlayerTurn());
        state.log(sideName(state, state.isPlayerTurn()) + "'s turn begins.");

        if (isHumanControlledSide(state, state.isPlayerTurn())) {
            return;
        }

        aiService.executeAITurn(state);
        finishSetupTurn(state, false);
    }

    private void finishSetupTurn(GameState state, boolean playerSide) {
        state.completeSetupTurn();
        energyService.recalculateEnergy(state);
        checkWinCondition(state);
        if (state.isGameOver()) {
            return;
        }

        if (state.getSetupTurnsTakenThisRound() >= 2) {
            startBattlePhase(state);
            return;
        }

        state.setPlayerTurn(!playerSide);
        beginActiveSetupTurn(state);
    }

    private void startBattlePhase(GameState state) {
        state.setCurrentPhase(Phase.BATTLE);
        // Full energy restore at start of battle phase
        energyService.recalculateEnergy(state);
        state.log("Both setup turns are complete. Entering battle phase. Energy restored!");
        applyTrainerPassives(state, true);
        applyTrainerPassives(state, false);
        battleService.initializeBattle(state);
        battleService.advanceBattle(state);
        completeBattleIfFinished(state);
    }

    private void startNextRound(GameState state) {
        state.clearBattleState();
        state.setFirstTurn(false);
        state.setTurnNumber(state.getTurnNumber() + 1);
        state.resetRoundOrder(state.isPlayerGoesFirst());
        state.setCurrentPhase(Phase.DRAW);
        state.log("--- Round " + state.getTurnNumber() + " ---");
        beginActiveSetupTurn(state);
    }

    private void applyTrainerPassives(GameState state, boolean isPlayer) {
        Player player = getSidePlayer(state, isPlayer);
        TrainerCard trainer = player.getActiveTrainer();
        if (trainer == null || trainer.getAbility() == null) return;

        Ability passive = trainer.getAbility();
        if (!passive.isPassive()) return;

        List<CardInstance> sieglings = state.getBoardSieglings(isPlayer);
        for (CardInstance ci : sieglings) {
            if (!passiveAppliesToCard(passive, trainer, ci)) {
                continue;
            }
            switch (passive.getEffectType()) {
                case AbilityEffectKeys.DAMAGE_BOOST -> ci.addDamageBuff(Math.max(1, passive.getEffectValue()));
                case AbilityEffectKeys.HEALTH_BOOST -> ci.addHealthBuff(Math.max(1, passive.getEffectValue()));
                case AbilityEffectKeys.SPEED_BOOST -> ci.setCurrentSpeed(ci.getCurrentSpeed() + passive.getEffectValue());
            }
        }
    }

    private boolean passiveAppliesToCard(Ability passive, TrainerCard trainer, CardInstance card) {
        if (passive.getTargetType() == TargetType.ROW_ALLIES && passive.getTargetRow() != null) {
            return card.getBoardRow() == passive.getTargetRow().getIndex();
        }
        return trainer.getElement() == Element.NEUTRAL || card.getElement() == trainer.getElement();
    }

    private void clearTempEffects(GameState state) {
        for (CardInstance ci : state.getBoardSieglings(true)) {
            ci.clearTemporaryEffects();
            ci.getStatusEffects().remove(StatusEffect.SPEED_ZERO);
            ci.setCurrentSpeed(ci.getCard().getSpeed());
        }
        for (CardInstance ci : state.getBoardSieglings(false)) {
            ci.clearTemporaryEffects();
            ci.getStatusEffects().remove(StatusEffect.SPEED_ZERO);
            ci.setCurrentSpeed(ci.getCard().getSpeed());
        }
    }

    private void checkWinCondition(GameState state) {
        if (state == null || state.isGameOver()) return;

        if (state.getPlayer().getHealth() <= 0 && state.getEnemy().getHealth() <= 0) {
            state.setGameOver(true);
            state.setWinner("Draw");
            state.log("Both players fell in battle!");
        } else if (state.getPlayer().getHealth() <= 0) {
            state.setGameOver(true);
            state.setWinner(state.getEnemy().getName());
            state.log(state.getPlayer().getName() + " has fallen! " + state.getEnemy().getName() + " wins!");
        } else if (state.getEnemy().getHealth() <= 0) {
            state.setGameOver(true);
            state.setWinner(state.getPlayer().getName());
            state.log(state.getEnemy().getName() + " has fallen! " + state.getPlayer().getName() + " wins!");
        }

        if (state.isGameOver()) {
            matchHistoryService.recordCompletedGame(state);
        }
    }

    public GameState resolveOpeningMulligan(List<Integer> mulliganHandIndices) {
        return resolveOpeningMulligan(currentGame, true, mulliganHandIndices);
    }

    public GameState resolveOpeningMulligan(GameState state, boolean isPlayerSide, List<Integer> mulliganHandIndices) {
        if (state == null || state.isGameOver()) return state;
        if (state.getCurrentPhase() != Phase.MULLIGAN) {
            return state;
        }
        if (!state.isMulliganPending(isPlayerSide)) {
            state.log(sideName(state, isPlayerSide) + " already locked their opening hand.");
            return state;
        }

        Player actor = getSidePlayer(state, isPlayerSide);
        List<Integer> plan = mulliganHandIndices == null ? List.of() : mulliganHandIndices;
        if (plan.isEmpty()) {
            state.log(sideName(state, isPlayerSide) + " keeps the opening hand.");
        } else {
            actor.mulliganHandAtIndices(plan);
            state.setMulliganUsed(isPlayerSide, true);
            state.log(sideName(state, isPlayerSide) + " mulligans " + plan.size() + " opening card(s).");
        }
        state.setMulliganPending(isPlayerSide, false);
        tryCompleteOpeningMulligan(state);
        return state;
    }

    private void resolveAutomatedOpeningMulligan(GameState state, boolean isPlayerSide) {
        if (state == null || !state.isMulliganPending(isPlayerSide)) {
            return;
        }
        Player actor = getSidePlayer(state, isPlayerSide);
        List<Card> hand = actor.getHand();
        long sieglingCount = hand.stream().filter(SieglingCard.class::isInstance).count();
        if (sieglingCount >= 2) {
            resolveOpeningMulligan(state, isPlayerSide, List.of());
            return;
        }
        List<Integer> indices = new ArrayList<>();
        for (int i = 0; i < hand.size(); i++) {
            if (!(hand.get(i) instanceof SieglingCard)) {
                indices.add(i);
            }
        }
        if (indices.isEmpty()) {
            indices = IntStream.range(0, hand.size()).boxed().toList();
        }
        resolveOpeningMulligan(state, isPlayerSide, indices);
    }

    private void tryCompleteOpeningMulligan(GameState state) {
        if (state == null || state.isMulliganPending(true) || state.isMulliganPending(false)) {
            return;
        }
        state.log("Opening hands are locked in.");
        beginActiveSetupTurn(state);
    }

    private Player getSidePlayer(GameState state, boolean isPlayerSide) {
        return isPlayerSide ? state.getPlayer() : state.getEnemy();
    }

    private boolean isHumanControlledSide(GameState state, boolean isPlayerSide) {
        return isPlayerSide || state.isEnemyHumanControlled();
    }

    private String sideName(GameState state, boolean isPlayerSide) {
        return getSidePlayer(state, isPlayerSide).getName();
    }

    private Card findInHand(Player player, String cardId) {
        return player.getHand().stream()
                .filter(c -> c.getId().equals(cardId))
                .findFirst()
                .orElse(null);
    }

    private String rowName(int row) {
        return switch (row) {
            case 0 -> "Back";
            case 1 -> "Middle";
            case 2 -> "Front";
            default -> "?";
        };
    }

    private boolean isOpeningTurnRestricted(GameState state, boolean isPlayerSide) {
        return isPlayerSide
                && state.isPlayerTurn()
                && state.isFirstTurn()
                && state.isPlayerGoesFirst()
                && state.getSetupTurnsTakenThisRound() == 0
                && state.getCurrentPhase() == Phase.SETUP;
    }

    private CardDefinitionService.DeckOption pickEnemyDeck(String playerDeckId) {
        List<CardDefinitionService.DeckOption> options = cardDefs.getDeckOptions().stream()
                .filter(option -> !option.id().equals(playerDeckId))
                .toList();
        return options.get(random.nextInt(options.size()));
    }

    private TrainerCard pickEnemyTrainer(CardDefinitionService.DeckOption enemyDeck) {
        List<TrainerCard> candidates = cardDefs.createTrainers().stream()
                .filter(trainer -> enemyDeck.elements().contains(trainer.getElement()))
                .toList();
        if (candidates.isEmpty()) {
            return cardDefs.getTrainerById(enemyDeck.recommendedTrainerId());
        }
        return candidates.get(random.nextInt(candidates.size())).copy();
    }

    private String formatElements(List<Element> elements) {
        return elements.stream()
                .map(element -> element.name().charAt(0) + element.name().substring(1).toLowerCase())
                .reduce((left, right) -> left + " / " + right)
                .orElse("Unknown");
    }

    private List<Element> inferElements(List<Card> deck) {
        return deck.stream()
                .map(Card::getElement)
                .filter(element -> element != Element.NEUTRAL)
                .distinct()
                .toList();
    }
}
