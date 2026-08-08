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

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.IntStream;

/**
 * Core game orchestrator managing turns, phases, and win conditions.
 */
@Service
public class GameService {

    public record StartOptions(String playerDeckId, String playerTrainerId, List<String> customDeckCards,
                               String loadoutLabel, int playerTrainerLevel) {
        public StartOptions(String playerDeckId, String playerTrainerId, List<String> customDeckCards, String loadoutLabel) {
            this(playerDeckId, playerTrainerId, customDeckCards, loadoutLabel, 1);
        }

        public StartOptions withTrainerLevel(int level) {
            return new StartOptions(playerDeckId, playerTrainerId, customDeckCards, loadoutLabel, Math.max(1, level));
        }
    }

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
    private ElementalAfflictionService elementalAfflictionService;

    @Autowired
    private AIService aiService;

    @Autowired
    private MatchHistoryService matchHistoryService;

    private final Random random = new Random();

    /** Per-player solo (vs-AI) games, keyed by an opaque solo token issued at game start. */
    private static final Duration SOLO_GAME_TTL = Duration.ofHours(6);
    private final Map<String, SoloSession> soloGames = new ConcurrentHashMap<>();
    private final SecureRandom soloRandom = new SecureRandom();

    private static final class SoloSession {
        final GameState state;
        volatile Instant lastSeen;

        SoloSession(GameState state) {
            this.state = state;
            this.lastSeen = Instant.now();
        }
    }

    /** Result of starting a solo game: the opaque token the client must echo back, plus the fresh state. */
    public record SoloHandle(String token, GameState state) {}

    /** Starts a brand-new solo game scoped to a freshly generated token. */
    public SoloHandle newSoloGame(StartOptions options) {
        return newSoloGame(options, "Player");
    }

    /** Starts a brand-new solo game scoped to a freshly generated token. */
    public SoloHandle newSoloGame(StartOptions options, String playerName) {
        GameState state = createGame(options, null, safePlayerName(playerName, "Player"), "AI Opponent", false);
        purgeStaleSoloGames();
        String token = generateSoloToken();
        soloGames.put(token, new SoloSession(state));
        return new SoloHandle(token, state);
    }

    /** Returns the solo game for the given token, or {@code null} if it does not exist / has expired. */
    public GameState getSoloGame(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        SoloSession session = soloGames.get(token);
        if (session == null) {
            return null;
        }
        session.lastSeen = Instant.now();
        return session.state;
    }

    private String generateSoloToken() {
        byte[] bytes = new byte[24];
        String token;
        do {
            soloRandom.nextBytes(bytes);
            token = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } while (soloGames.containsKey(token));
        return token;
    }

    private String safePlayerName(String name, String fallback) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            return fallback;
        }
        return trimmed.length() > 20 ? trimmed.substring(0, 20) : trimmed;
    }

    private void purgeStaleSoloGames() {
        Instant cutoff = Instant.now().minus(SOLO_GAME_TTL);
        soloGames.values().removeIf(session -> session.lastSeen.isBefore(cutoff));
    }

    public GameState newMultiplayerGame(StartOptions playerOneOptions, StartOptions playerTwoOptions,
                                        String playerOneName, String playerTwoName) {
        return createGame(playerOneOptions, playerTwoOptions, playerOneName, playerTwoName, true);
    }

    public List<CardDefinitionService.DeckOption> getDeckOptions() {
        return cardDefs.getDeckOptions();
    }

    public List<TrainerCard> getTrainerOptions() {
        return cardDefs.getTrainerOptions();
    }

    public List<Card> getDeckBuilderCatalog() {
        return cardDefs.getDeckBuilderCatalog();
    }

    public List<Card> buildDeckById(String deckId) {
        return cardDefs.buildDeckById(deckId);
    }

    public List<String> getActiveLiveElementNames() {
        return cardDefs.getActiveLiveElementNames();
    }

    public int getDeckBuilderMinSize() {
        return cardDefs.getDeckBuilderMinSize();
    }

    public int getDeckBuilderMaxCopies() {
        return cardDefs.getDeckBuilderMaxCopies();
    }

    public GameState draw(GameState state, boolean isPlayerSide) {
        if (state == null || state.isGameOver()) return state;
        if (state.getCurrentPhase() != Phase.DRAW || state.isPlayerTurn() != isPlayerSide) {
            return state;
        }

        Player actor = getSidePlayer(state, isPlayerSide);
        actor.clearTemporaryEnergyAdjustments();
        // An active energy buff is banked when it resolves and goes live here, so it covers
        // exactly this side's next Setup and Battle phase; last turn's overcharge expires now.
        boolean wasOvercharged = actor.isOvercharged();
        actor.promotePendingOverchargeEnergy();
        if (actor.isOvercharged()) {
            state.log(sideName(state, isPlayerSide) + " is overcharged: "
                    + describeOvercharge(actor) + " this Setup and Battle phase.");
        } else if (wasOvercharged) {
            state.log(sideName(state, isPlayerSide) + "'s overcharge fades.");
        }
        state.resetPlacementsForTurn(isPlayerSide);

        Card drawn = actor.drawCard();
        if (drawn != null) {
            state.log(sideName(state, isPlayerSide) + " draws a card.");
        } else {
            state.log(sideName(state, isPlayerSide) + "'s deck is empty!");
        }

        state.setCurrentPhase(Phase.SETUP);
        // Burn (and future Setup-tick afflictions) resolve as this side enters Setup.
        if (elementalAfflictionService != null) {
            elementalAfflictionService.tickOwnerSetup(state, isPlayerSide);
        }
        energyService.recalculateEnergy(state);
        state.captureSieglingSetupPlacementBonusFromEnergy(isPlayerSide);
        return state;
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
        if (!energyService.canAfford(state, isPlayerSide, siegling.getCostElement(), siegling.getCostAmount())) {
            state.log("Not enough energy to play " + siegling.getName() + "!");
            return state;
        }
        if (!placementService.isLegalPlacement(state, isPlayerSide, row, col, siegling)) {
            CardInstance at = state.getAt(isPlayerSide, row, col);
            if (siegling.isEvolutionCard() && at != null && siegling.getEvolvesFromId().equals(at.getCard().getId())
                    && at.getBattlePhasesSeen() <= 0) {
                state.log(at.getName() + " must complete a full battle phase in its current form before it can evolve.");
            } else {
                state.log("Cannot place at that position!");
            }
            return state;
        }

        CardInstance existing = state.getAt(isPlayerSide, row, col);
        boolean evolutionPlacement = placementService.isEvolutionPlacement(state, isPlayerSide, row, col, siegling);
        if (evolutionPlacement && existing != null
                && elementalAfflictionService != null
                && elementalAfflictionService.hasCurse(existing)) {
            state.log(existing.getName() + " is Cursed and cannot evolve!");
            return state;
        }
        energyService.recalculateEnergy(state);
        if (state.isSieglingSetupBudgetExhausted(isPlayerSide)) {
            state.log(evolutionPlacement
                    ? "No Siegling setup actions left this turn — evolutions still cost 1 action."
                    : "No Siegling setup actions left this turn (1 base + 1 per energy in your pool when you entered setup).");
            return state;
        }
        CardInstance instance = placementService.createPlacedInstance(existing, siegling, isPlayerSide, row, col);
        if (!evolutionPlacement) {
            instance.setPlacementOrder(state.consumePlacementOrder());
        }
        state.setAt(isPlayerSide, row, col, instance);
        state.recordSieglingSetupActionConsumed(isPlayerSide);
        actor.removeFromHand(card);

        if (evolutionPlacement && existing != null) {
            state.log(existing.getName() + " evolved to " + siegling.getName() + "!");
        } else {
            state.log(sideName(state, isPlayerSide) + " places " + siegling.getName()
                    + " at " + rowName(row) + " row, col " + col + ".");
        }

        energyService.recalculateEnergy(state);
        recalculateTrainerPassiveStatBuffs(state);
        effectService.recalculateBoardAuraDamageBoosts(state);
        return state;
    }

    public GameState claimSiegling(GameState state, boolean isPlayerSide, int row, int col) {
        if (state == null || state.isGameOver()) return state;
        if (state.isPlayerTurn() != isPlayerSide) {
            state.log("Wait for your turn before claiming a Siegling.");
            return state;
        }
        if (state.getCurrentPhase() != Phase.SETUP) {
            state.log("You can only claim Sieglings during Setup phase.");
            return state;
        }

        CardInstance claimed = state.getAt(isPlayerSide, row, col);
        if (claimed == null || !claimed.isAlive()) {
            state.log("No Siegling is there to claim.");
            return state;
        }
        if (claimed.getBattlePhasesSeen() <= 0) {
            state.log(claimed.getName() + " must survive at least 1 battle phase before it can be claimed.");
            return state;
        }
        if (elementalAfflictionService != null && elementalAfflictionService.hasCurse(claimed)) {
            state.log(claimed.getName() + " is Cursed and cannot be claimed!");
            return state;
        }

        Player actor = getSidePlayer(state, isPlayerSide);
        state.setAt(isPlayerSide, row, col, null);
        actor.getDiscard().add(claimed.getCard());
        actor.adjustTemporaryEnergy(claimed.getElement(), 1);
        energyService.recalculateEnergy(state);
        state.log(sideName(state, isPlayerSide) + " claims " + claimed.getName()
                + " and gains 1 temporary " + claimed.getElement().name().toLowerCase() + " energy.");
        recalculateTrainerPassiveStatBuffs(state);
        effectService.recalculateBoardAuraDamageBoosts(state);
        return state;
    }

    public GameState castSpell(GameState state, boolean isPlayerSide, String cardId, int targetRow, int targetCol) {
        return castSpell(state, isPlayerSide, cardId, targetRow, targetCol, -1, -1);
    }

    public GameState castSpell(GameState state, boolean isPlayerSide, String cardId,
                               int targetRow, int targetCol, int destRow, int destCol) {
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
        if (state.isSieglingSetupBudgetExhausted(isPlayerSide)) {
            state.log("No setup actions left this turn. End the turn to continue.");
            return state;
        }

        Player actor = getSidePlayer(state, isPlayerSide);
        Card card = findInHand(actor, cardId);
        if (card instanceof SpellCard spell) {
            if (!energyService.canCastSpell(state, isPlayerSide, spell)) {
                state.log("Requirements not met to cast " + spell.getName() + "!");
                return state;
            }

            if (EffectService.isForcedBoardMoveSpell(spell.getAbility())) {
                if (targetRow < 0 || targetCol < 0 || destRow < 0 || destCol < 0) {
                    state.log(spell.getName() + " needs the enemy's cell and an empty destination cell.");
                    return state;
                }
                CardInstance victim = state.getAt(!isPlayerSide, targetRow, targetCol);
                if (victim == null || !victim.isAlive()) {
                    state.log("No enemy Siegling at the chosen cell.");
                    return state;
                }
                if (state.getAt(!isPlayerSide, destRow, destCol) != null) {
                    state.log("Destination must be an empty cell on the enemy board.");
                    return state;
                }
            }

            effectService.resolveAbility(state, spell.getAbility(), null, isPlayerSide, targetRow, targetCol, destRow, destCol);
            actor.removeFromHand(card);
            actor.getDiscard().add(card);
            actor.incrementSpellsCastThisMatch();
            state.log(sideName(state, isPlayerSide) + " casts " + spell.getName() + "!");
            // Spend energy from pool instead of recalculating (pool restores at next phase)
            energyService.spendEnergy(state, isPlayerSide, spell.getCostElement(), spell.getCostAmount());
            state.recordSieglingSetupActionConsumed(isPlayerSide);
        } else if (card instanceof TrapCard trap) {
            if (!energyService.canTriggerTrap(state, isPlayerSide, trap)) {
                state.log("Opponent bucket does not meet the trigger for " + trap.getName() + "!");
                return state;
            }

            if (EffectService.isForcedBoardMoveSpell(trap.getAbility())) {
                if (targetRow < 0 || targetCol < 0 || destRow < 0 || destCol < 0) {
                    state.log(trap.getName() + " needs the enemy's cell and an empty destination cell.");
                    return state;
                }
                CardInstance victim = state.getAt(!isPlayerSide, targetRow, targetCol);
                if (victim == null || !victim.isAlive()) {
                    state.log("No enemy Siegling at the chosen cell.");
                    return state;
                }
                if (state.getAt(!isPlayerSide, destRow, destCol) != null) {
                    state.log("Destination must be an empty cell on the enemy board.");
                    return state;
                }
            }

            effectService.resolveAbility(state, trap.getAbility(), null, isPlayerSide, targetRow, targetCol, destRow, destCol);
            actor.removeFromHand(card);
            actor.getDiscard().add(card);
            actor.incrementTrapsSprungThisMatch();
            state.log(sideName(state, isPlayerSide) + " springs trap " + trap.getName() + "!");
            // Spend energy from pool instead of recalculating
            energyService.spendEnergy(state, isPlayerSide, trap.getCostElement(), trap.getCostAmount());
            state.recordSieglingSetupActionConsumed(isPlayerSide);
        } else {
            state.log("Strategy or deception not found in hand!");
            return state;
        }

        state.removeDeadSieglings();
        recalculateTrainerPassiveStatBuffs(state);
        checkWinCondition(state);
        return state;
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
        recalculateTrainerPassiveStatBuffs(state);
        // Don't recalculate energy here - pool persists until next phase restore
        checkWinCondition(state);
        return state;
    }

    public GameState executeBattle(GameState state) {
        if (state == null || state.isGameOver()) return state;
        if (state.getCurrentPhase() != Phase.BATTLE) {
            state.log("Battle begins automatically after both setup turns are passed.");
            return state;
        }
        battleService.advanceBattle(state);
        recalculateTrainerPassiveStatBuffs(state);
        effectService.recalculateBoardAuraDamageBoosts(state);
        completeBattleIfFinished(state);
        return state;
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
        recalculateTrainerPassiveStatBuffs(state);
        effectService.recalculateBoardAuraDamageBoosts(state);
        completeBattleIfFinished(state);
        return state;
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

    public List<int[]> getLegalPlacements(GameState state, boolean isPlayerSide) {
        if (state == null) return List.of();
        if (state.isPlayerTurn() != isPlayerSide || state.getCurrentPhase() != Phase.SETUP) return List.of();
        energyService.recalculateEnergy(state);
        if (state.isSieglingSetupBudgetExhausted(isPlayerSide)) return List.of();
        return placementService.getLegalPlacements(state, isPlayerSide);
    }

    public CardInstance getPendingBattleAttacker(GameState state) {
        return state == null ? null : battleService.getPendingAttacker(state);
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
        // Ensure any reused Player instances (e.g. future persistence hooks) begin at match-start HP.
        player.setHealth(50);
        enemy.setHealth(50);

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
        biasOpeningDraw(player);
        biasOpeningDraw(enemy);

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
        state.log("Both players begin at 50 health.");
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

    private void biasOpeningDraw(Player player) {
        if (player == null || player.getDeck().size() < 6) {
            return;
        }

        List<Card> workingDeck = new ArrayList<>(player.getDeck());
        List<Card> seededCards = new ArrayList<>();

        pullOpeningCards(workingDeck, seededCards, 2, card ->
                card instanceof SieglingCard siegling && !siegling.isEvolutionCard());
        pullOpeningCards(workingDeck, seededCards, 1, this::isOpeningSupportCard);

        if (seededCards.isEmpty()) {
            return;
        }

        Collections.shuffle(seededCards, random);
        List<Card> rebuiltDeck = new ArrayList<>(workingDeck.size() + seededCards.size());
        int deckIndex = 0;
        for (Card seeded : seededCards) {
            rebuiltDeck.add(seeded);
            for (int filler = 0; filler < 2 && deckIndex < workingDeck.size(); filler++) {
                rebuiltDeck.add(workingDeck.get(deckIndex++));
            }
        }
        while (deckIndex < workingDeck.size()) {
            rebuiltDeck.add(workingDeck.get(deckIndex++));
        }
        player.setDeck(rebuiltDeck);
    }

    private void pullOpeningCards(List<Card> sourceDeck, List<Card> seededCards, int maxCount,
                                  java.util.function.Predicate<Card> predicate) {
        if (maxCount <= 0) {
            return;
        }
        for (int i = 0; i < sourceDeck.size() && maxCount > 0; ) {
            Card card = sourceDeck.get(i);
            if (predicate.test(card)) {
                seededCards.add(card);
                sourceDeck.remove(i);
                maxCount--;
                continue;
            }
            i++;
        }
    }

    private boolean isOpeningSupportCard(Card card) {
        if (card instanceof SpellCard spell) {
            return spell.getRequiredReaction() == null
                    && spell.getRequiredComboSize() <= 0
                    && spell.getCostAmount() <= 1;
        }
        if (card instanceof TrapCard trap) {
            return trap.getCostAmount() <= 1;
        }
        return false;
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
            return new ResolvedLoadout(
                    deck,
                    applyTrainerLevel(resolveTrainerSelection(trainerId, fallbackTrainerId, inferElements(deck)),
                            safeOptions.playerTrainerLevel()),
                    inferElements(deck),
                    preferredLabel == null ? "Custom Loadout" : preferredLabel,
                    null,
                    true
            );
        }

        CardDefinitionService.DeckOption deckOption = cardDefs.getDeckOption(deckId)
                .orElseGet(() -> cardDefs.getDeckOption(fallbackDeckId)
                        .or(() -> cardDefs.getDefaultDeckOption())
                        .orElseThrow(() -> new IllegalStateException("No active preset decks are available.")));
        return new ResolvedLoadout(
                cardDefs.buildDeckById(deckOption.id()),
                applyTrainerLevel(resolveTrainerSelection(trainerId, deckOption.recommendedTrainerId(), deckOption.elements()),
                        safeOptions.playerTrainerLevel()),
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
        if (state.isBattleActionPausePending()) return;
        if (state.isGameOver()) {
            matchHistoryService.recordCompletedGame(state);
            state.clearBattleState();
            return;
        }
        if (state.getPendingBattleInstanceId() != null) return;
        if (state.getBattleCursor() < state.getBattleQueue().size()) return;

        clearTempEffects(state);
        state.removeDeadSieglings();
        recalculateTrainerPassiveStatBuffs(state);
        effectService.recalculateBoardAuraDamageBoosts(state);
        recordBattlePhaseSeen(state);
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
        recalculateTrainerPassiveStatBuffs(state);
        effectService.recalculateBoardAuraDamageBoosts(state);
        battleService.initializeBattle(state);
        battleService.advanceBattle(state);
        recalculateTrainerPassiveStatBuffs(state);
        effectService.recalculateBoardAuraDamageBoosts(state);
        completeBattleIfFinished(state);
    }

    private void startNextRound(GameState state) {
        resetTrainerActivesForNewRound(state);
        state.clearBattleState();
        state.setFirstTurn(false);
        state.setTurnNumber(state.getTurnNumber() + 1);
        state.resetRoundOrder(state.isPlayerGoesFirst());
        state.setCurrentPhase(Phase.DRAW);
        state.log("--- Round " + state.getTurnNumber() + " ---");
        beginActiveSetupTurn(state);
    }

    private void resetTrainerActivesForNewRound(GameState state) {
        if (state == null) {
            return;
        }
        TrainerCard playerTrainer = state.getPlayer() == null ? null : state.getPlayer().getActiveTrainer();
        TrainerCard enemyTrainer = state.getEnemy() == null ? null : state.getEnemy().getActiveTrainer();
        if (playerTrainer != null) {
            playerTrainer.resetTurn();
        }
        if (enemyTrainer != null) {
            enemyTrainer.resetTurn();
        }
    }

    private void recalculateTrainerPassiveStatBuffs(GameState state) {
        if (state == null) {
            return;
        }
        recalculateTrainerPassiveStatBuffsForSide(state, true);
        recalculateTrainerPassiveStatBuffsForSide(state, false);
    }

    private void recalculateTrainerPassiveStatBuffsForSide(GameState state, boolean isPlayer) {
        Player player = getSidePlayer(state, isPlayer);
        TrainerCard trainer = player.getActiveTrainer();
        Ability passive = trainer == null ? null : trainer.getAbility();
        boolean activePassive = passive != null && passive.isPassive();
        // A "connected allies" health passive grants its bonus to every allied
        // Siegling notch-linked to at least one other ally, recomputed here so the
        // bonus follows the board's connection network as placements change.
        boolean connectedHealthPassive = activePassive
                && AbilityEffectKeys.CONNECTED_ALLIES_HEALTH_BOOST.equals(passive.getEffectType());
        List<CardInstance> sieglings = state.getBoardSieglings(isPlayer);
        for (CardInstance ci : sieglings) {
            int healthBuff = 0;
            int damageBuff = 0;
            int speedBuff = 0;
            if (activePassive) {
                int value = Math.max(1, passive.getEffectValue());
                if (connectedHealthPassive) {
                    if (!placementService.getDirectlyConnectedAllies(state, ci).isEmpty()) {
                        healthBuff += value;
                    }
                } else if (passiveAppliesToCard(passive, trainer, ci)) {
                    switch (passive.getEffectType()) {
                        case AbilityEffectKeys.DAMAGE_BOOST -> damageBuff += value;
                        case AbilityEffectKeys.HEALTH_BOOST -> healthBuff += value;
                        case AbilityEffectKeys.SPEED_BOOST -> speedBuff += value;
                    }
                }
            }
            ci.setTrainerPassiveHealthBuff(healthBuff);
            ci.setTrainerPassiveDamageBuff(damageBuff);
            ci.setTrainerPassiveSpeedBuff(speedBuff);
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
            clearTempEffects(ci);
        }
        for (CardInstance ci : state.getBoardSieglings(false)) {
            clearTempEffects(ci);
        }
    }

    private void clearTempEffects(CardInstance ci) {
        ci.clearTemporaryEffects();
        // Chill-freeze outlives the battle phase — it thaws at its owner's next Setup,
        // and its Chill badges are already spent, so the status is all that's left of it.
        if (!ci.isChillFrozen()) {
            ci.getStatusEffects().remove(StatusEffect.FREEZE);
        }
        ci.getStatusEffects().remove(StatusEffect.SPEED_ZERO);
        ci.setCurrentSpeed(ci.getCard().getSpeed());
    }

    private void clearTemporaryEnergyAdjustments(GameState state) {
        if (state == null) {
            return;
        }
        if (state.getPlayer() != null) {
            state.getPlayer().clearTemporaryEnergyAdjustments();
        }
        if (state.getEnemy() != null) {
            state.getEnemy().clearTemporaryEnergyAdjustments();
        }
    }

    private void recordBattlePhaseSeen(GameState state) {
        for (CardInstance ci : state.getBoardSieglings(true)) {
            ci.recordBattlePhaseSeen();
        }
        for (CardInstance ci : state.getBoardSieglings(false)) {
            ci.recordBattlePhaseSeen();
        }
    }

    public GameState forfeit(GameState state, boolean isPlayerSide) {
        if (state == null || state.isGameOver()) {
            return state;
        }
        Player actor = isPlayerSide ? state.getPlayer() : state.getEnemy();
        Player opponent = isPlayerSide ? state.getEnemy() : state.getPlayer();
        state.setEndReason("FORFEIT");
        state.setForfeitedBy(actor.getName());
        state.setGameOver(true);
        state.setWinner(opponent.getName());
        state.log(actor.getName() + " quit the match. " + opponent.getName() + " wins!");
        matchHistoryService.recordCompletedGame(state);
        return state;
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

    /** e.g. {@code "+2 fire, +1 water"} — used in the overcharge log line. */
    private String describeOvercharge(Player player) {
        return player.getOverchargeEnergyTotals().entrySet().stream()
                .filter(entry -> entry.getValue() != null && entry.getValue() > 0)
                .map(entry -> "+" + entry.getValue() + " " + entry.getKey().name().toLowerCase())
                .collect(java.util.stream.Collectors.joining(", "));
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
        if (options.isEmpty()) {
            List<CardDefinitionService.DeckOption> fallbackOptions = cardDefs.getDeckOptions();
            if (fallbackOptions.isEmpty()) {
                throw new IllegalStateException("No active preset decks are available.");
            }
            return fallbackOptions.get(random.nextInt(fallbackOptions.size()));
        }
        return options.get(random.nextInt(options.size()));
    }

    private TrainerCard pickEnemyTrainer(CardDefinitionService.DeckOption enemyDeck) {
        List<TrainerCard> candidates = cardDefs.getTrainerOptions().stream()
                .filter(trainer -> enemyDeck.elements().contains(trainer.getElement()))
                .toList();
        if (candidates.isEmpty()) {
            return resolveTrainerSelection(enemyDeck.recommendedTrainerId(), enemyDeck.recommendedTrainerId(), enemyDeck.elements());
        }
        return candidates.get(random.nextInt(candidates.size())).copy();
    }

    /**
     * Applies the player's SiegeKnight level bonus to its passive and active ability effect values.
     * The trainer is always a fresh copy here, so mutating it is safe.
     */
    private TrainerCard applyTrainerLevel(TrainerCard trainer, int level) {
        if (trainer == null) {
            return null;
        }
        int bonus = PlayerProgressionService.trainerAbilityBonus(level);
        if (bonus <= 0) {
            return trainer;
        }
        Ability passive = trainer.getAbility();
        if (passive != null) {
            passive.setEffectValue(passive.getEffectValue() + bonus);
        }
        Ability active = trainer.getActiveAbility();
        if (active != null) {
            active.setEffectValue(active.getEffectValue() + bonus);
        }
        return trainer;
    }

    private TrainerCard resolveTrainerSelection(String requestedTrainerId, String fallbackTrainerId, List<Element> deckElements) {
        return cardDefs.getActiveTrainerById(requestedTrainerId)
                .or(() -> cardDefs.getActiveTrainerById(fallbackTrainerId))
                .or(() -> deckElements == null ? java.util.Optional.empty() : deckElements.stream().findFirst().map(cardDefs::getTrainer))
                .or(() -> cardDefs.getTrainerOptions().stream().findFirst())
                .orElseGet(() -> cardDefs.getTrainerById(requestedTrainerId));
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
