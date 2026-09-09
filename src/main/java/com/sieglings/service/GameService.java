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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.IntStream;

/**
 * Core game orchestrator managing turns, phases, and win conditions.
 */
@Service
public class GameService {

    /**
     * The tutorial match is a fixed rehearsal: the same free knight and deck on
     * both sides every run, so a returning player replays the exact same lesson.
     * Ice opposes the Fire half of Ashen Roots, which makes the weakness chart
     * visible without stacking the fight against the student.
     */
    public static final String TUTORIAL_PLAYER_DECK_ID = "deck_fire_earth";
    public static final String TUTORIAL_PLAYER_TRAINER_ID = "squire-bob";
    public static final String TUTORIAL_ENEMY_DECK_ID = "deck_ice";
    public static final String TUTORIAL_ENEMY_TRAINER_ID = "trainer09";
    public static final String TUTORIAL_OPPONENT_NAME = "Training Dummy";
    public static final int TUTORIAL_ENEMY_HEALTH = 20;

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

    /** Hand size the advanced chapter is scripted around (four plays plus the Deception). */
    private static final int ADVANCED_TUTORIAL_HAND_SIZE = 5;

    /** A playable late-game sandbox for the advanced chapter, without a mulligan. */
    public SoloHandle newAdvancedTutorialGame(String playerName) {
        SoloHandle handle = newTutorialGame(playerName);
        GameState state = handle.state();
        state.setTurnNumber(6);
        state.setFirstTurn(false);
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);
        state.setSetupTurnsTakenThisRound(0);
        state.setMulliganPending(true, false);
        state.setMulliganPending(false, false);
        state.getPlayer().setHealth(50);
        state.getEnemy().setHealth(50);
        String[][] teams = {
                {"dracoil", "raydile", "pylook", "floraknight", "generoot"},
                {"cozycub", "falcool", "frostfly", "icewee", "fawny"}
        };
        int[][] positions = {{0, 0}, {1, 0}, {1, 1}, {1, 2}, {2, 0}};
        for (int side = 0; side < teams.length; side++) {
            for (int i = 0; i < teams[side].length; i++) {
                // Card ids can disappear from under us: the live dashboard overrides the
                // generated catalog, so a card renamed or deleted there is simply absent
                // at runtime. Skipping the slot leaves the sandbox one creature short,
                // which is a lesson worth teaching; throwing 500'd /api/game/new and left
                // the player staring at the finished previous match.
                Card card = cardDefs.findCardCopy(teams[side][i]).orElse(null);
                if (!(card instanceof SieglingCard creature)) {
                    state.log("Advanced tutorial: skipped missing creature " + teams[side][i] + ".");
                    continue;
                }
                CardInstance placed = new CardInstance(creature, positions[i][0], positions[i][1], side == 0);
                placed.setBattlePhasesSeen(2);
                placed.setPlacementOrder(state.consumePlacementOrder());
                if (i == 0) placed.addShield(3);
                state.setAt(side == 0, positions[i][0], positions[i][1], placed);
            }
        }
        Player player = state.getPlayer();
        player.getHand().clear();
        for (String id : List.of("trap13", "spell_fire_06", "spell_earth_02", "spell_earth_01")) {
            cardDefs.findCardCopy(id).ifPresent(player.getHand()::add);
        }
        player.getHand().add(buildTutorialAshenWard());
        // Live card data is the dashboard's, not the generated catalog's, and none of
        // the pinned spell/trap ids survive there — which left the chapter holding a
        // single card. The tutorial deck is built from whatever is live, so top the
        // hand up from it: the lesson needs spells and traps to cast, not these
        // specific ones.
        topUpAdvancedTutorialHand(player);
        player.adjustTemporaryEnergy(Element.FIRE, 6);
        player.adjustTemporaryEnergy(Element.EARTH, 6);
        state.getEnemy().adjustTemporaryEnergy(Element.ICE, 8);
        recalculateTrainerPassiveStatBuffs(state);
        energyService.recalculateEnergy(state);
        state.resetPlacementsForTurn(true);
        state.captureSieglingSetupPlacementBonusFromEnergy(true);
        state.log("Advanced tutorial: five creatures per side, prepared energy, and a Deception ready to practice.");
        return handle;
    }

    /**
     * Fills the advanced sandbox hand out of the player's own (live) deck. The
     * chapter practises a Deception, so a trap is taken first: deck order is
     * spell-heavy and a straight scan handed out five spells and no trap.
     */
    private void topUpAdvancedTutorialHand(Player player) {
        takeIntoAdvancedTutorialHand(player, true);
        takeIntoAdvancedTutorialHand(player, false);
    }

    private void takeIntoAdvancedTutorialHand(Player player, boolean trapsOnly) {
        for (java.util.Iterator<Card> it = player.getDeck().iterator();
                it.hasNext() && player.getHand().size() < ADVANCED_TUTORIAL_HAND_SIZE; ) {
            Card next = it.next();
            boolean castable = trapsOnly ? next instanceof TrapCard
                    : (next instanceof SpellCard || next instanceof TrapCard);
            // A duplicate reads as a dealing bug in a five-card teaching hand.
            if (!castable || player.getHand().stream().anyMatch(held -> held.getName().equals(next.getName()))) {
                continue;
            }
            it.remove();
            player.getHand().add(next);
            if (trapsOnly) {
                return;
            }
        }
    }

    /** Starts a brand-new solo game scoped to a freshly generated token. */
    public SoloHandle newSoloGame(StartOptions options) {
        return newSoloGame(options, "Player");
    }

    /**
     * Starts the fixed tutorial match: pinned loadouts on both sides, the player
     * always moves first, and the sparring partner starts on reduced health so a
     * full lesson fits in a few rounds.
     */
    public SoloHandle newTutorialGame(String playerName) {
        StartOptions playerOptions = new StartOptions(
                TUTORIAL_PLAYER_DECK_ID, TUTORIAL_PLAYER_TRAINER_ID, null, "Tutorial Loadout");
        StartOptions enemyOptions = new StartOptions(
                TUTORIAL_ENEMY_DECK_ID, TUTORIAL_ENEMY_TRAINER_ID, null, "Tutorial Warband");
        GameState state = createGame(playerOptions, enemyOptions,
                safePlayerName(playerName, "Player"), TUTORIAL_OPPONENT_NAME, false, true);
        state.setTutorialMatch(true);
        state.getEnemy().setHealth(TUTORIAL_ENEMY_HEALTH);
        state.log("Tutorial match: " + TUTORIAL_OPPONENT_NAME + " starts at " + TUTORIAL_ENEMY_HEALTH
                + " health so a full lesson fits in a few rounds.");
        purgeStaleSoloGames();
        String token = generateSoloToken();
        soloGames.put(token, new SoloSession(state));
        return new SoloHandle(token, state);
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

    public List<Map<String, Object>> deckCardCounts(String deckId) {
        return cardDefs.deckCardCounts(deckId);
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
        // An overcharge started during the last battle phase carries into this setup; say so,
        // because the pool is bigger than the board explains.
        if (actor.isOvercharged()) {
            state.log(sideName(state, isPlayerSide) + " is overcharged: "
                    + describeOvercharge(actor) + " through this Setup phase.");
        }
        state.resetPlacementsForTurn(isPlayerSide);

        // Pin the early lesson cards independently of whether the player mulligans.
        // From turn four onward, retain the recovery path for a missing combo partner.
        // Mulligan already hands Raydile (the practice-redraw slot), so the first
        // normal draw is Flora Knight — not a second Raydile.
        if (state.isTutorialMatch() && isPlayerSide && state.getTurnNumber() <= 3) {
            String scriptedDraw = switch (state.getTurnNumber()) {
                case 1 -> "floraknight";
                case 2 -> "generoot";
                default -> "squirebud";
            };
            Card lessonCard = takeNamedCard(actor.getDeck(), scriptedDraw);
            if (lessonCard == null) lessonCard = cardDefs.findCardCopy(scriptedDraw).orElse(null);
            if (lessonCard != null) actor.getDeck().add(0, lessonCard);
        } else if (state.isTutorialMatch() && isPlayerSide && state.getTurnNumber() >= 4
                && !tutorialCanFormCombo(state, isPlayerSide, actor)) {
            hoistTutorialComboPartner(state, isPlayerSide, actor);
        }
        Card drawn = actor.drawCard();
        if (drawn != null) {
            state.log(sideName(state, isPlayerSide) + " draws a card.");
        } else {
            state.log(sideName(state, isPlayerSide) + "'s deck is empty!");
        }

        if (state.isTutorialMatch() && isPlayerSide && state.getTurnNumber() == 3
                && actor.getHand().stream().noneMatch(c -> "tutorial_ashfall".equals(c.getId()))) {
            Card ashfall = takeNamedCard(actor.getDeck(), "tutorial_ashfall");
            actor.getHand().add(ashfall == null ? buildTutorialAshfall() : ashfall);
        }
        state.setCurrentPhase(Phase.SETUP);
        // Burn (and future Setup-tick afflictions) resolve as this side enters Setup.
        if (elementalAfflictionService != null) {
            elementalAfflictionService.tickOwnerSetup(state, isPlayerSide);
        }
        // Turn-2 Setup is when the coach teaches Deceptions (keyed to opponent Ice).
        // Guarantee the Dummy holds enough Ice so Shatter Seal is actually playable.
        if (state.isTutorialMatch() && isPlayerSide && state.getTurnNumber() >= 2) {
            state.getEnemy().adjustTemporaryEnergy(Element.ICE, 3);
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
        if (!isTutorialTurnOnePlacementAllowed(state, isPlayerSide, siegling)) {
            state.log("The tutorial opens with " + tutorialOpenerName(actor) + " — place it first.");
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
        return createGame(playerOptions, enemyOptions, playerName, enemyName, enemyHumanControlled, false);
    }

    private GameState createGame(StartOptions playerOptions, StartOptions enemyOptions,
                                 String playerName, String enemyName, boolean enemyHumanControlled,
                                 boolean tutorial) {
        GameState state = new GameState();
        state.setEnemyHumanControlled(enemyHumanControlled);

        Player player = new Player(playerName, true);
        Player enemy = new Player(enemyName, enemyHumanControlled);
        // Ensure any reused Player instances (e.g. future persistence hooks) begin at match-start HP.
        player.setHealth(50);
        enemy.setHealth(50);

        ResolvedLoadout playerLoadout = resolveLoadout(playerOptions, "deck_fire_earth", "trainer05");
        ResolvedLoadout enemyLoadout = enemyHumanControlled || tutorial
                ? resolveLoadout(enemyOptions, "deck_water_wind", "trainer06")
                : resolveSoloEnemyLoadout(playerLoadout.deckId());

        player.setDeck(playerLoadout.deck());
        enemy.setDeck(enemyLoadout.deck());
        player.setActiveTrainer(playerLoadout.trainer());
        enemy.setActiveTrainer(enemyLoadout.trainer());
        player.setLoadoutLabel(playerLoadout.label());
        enemy.setLoadoutLabel(enemyLoadout.label());

        if (tutorial) {
            // Fixed draw order so every coach lesson can fire (socket, Strategy,
            // link/combo, Deception, evolution) without relying on shuffle luck.
            prepareTutorialPlayerDeck(player);
            prepareTutorialEnemyDeck(enemy);
        } else {
            player.shuffleDeck();
            enemy.shuffleDeck();
            biasOpeningDraw(player);
            biasOpeningDraw(enemy);
        }

        state.setPlayer(player);
        state.setEnemy(enemy);

        for (int i = 0; i < 5; i++) {
            player.drawCard();
            enemy.drawCard();
        }

        // The tutorial teaches the setup phase before it is played against, so the
        // student always takes the first turn.
        boolean playerStarts = tutorial || random.nextBoolean();
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

    /**
     * Opening-hand index the tutorial student may redraw (0-based). Indices 0–3 are
     * the locked lesson cards (Sundile, Pylook, Strategy, Shatter Seal); index 4 is
     * a SPARE copy of Pylook, there purely to be thrown away. A redraw does not
     * shuffle — the next scripted card comes off the top of the deck, which is
     * Raydile (the round-two evolution). The normal turn draws are pinned
     * separately: Flora Knight on one, Generoot on two, Squire Bud on three.
     */
    public static final int TUTORIAL_SCRIPTED_MULLIGAN_INDEX = 4;

    private static final List<String> TUTORIAL_REQUIRED_OPENING_IDS = List.of(
            "sundile", "pylook", "tutorial_ashfall", "trap13");

    /** Single source of truth for the turn-one opener; see GameState. */
    public static final String TUTORIAL_TURN_ONE_OPENER_ID = GameState.TUTORIAL_TURN_ONE_OPENER_ID;

    /**
     * Tutorial draw stack, in the order the lessons need it. The opening five are
     * Sundile (Fire socket opener), Pylook (the Fire partner round two links to),
     * Ashfall (the cost-preview lesson), Shatter Seal (Ice Deception vs the Dummy) and a SPARE
     * Pylook in the practice-redraw slot. Raydile is its replacement — the evolution
     * for round two — so the first normal draw is Flora Knight rather than a second
     * Raydile. Generoot follows on turn two; Squire Bud on turn three for the combo
     * lesson. Keeping the opening hand does not shift these lesson draws.
     * Remaining Strategies support the later lessons.
     */
    /* Package-private so a test can reproduce the production shape directly:
       the tutorial's own preset deck can be missing from the dashboard, and the
       scripted stack has to survive being built over any other deck's pool. */
    void prepareTutorialPlayerDeck(Player player) {
        if (player == null) {
            return;
        }
        List<Card> pool = new ArrayList<>(player.getDeck());
        List<Card> ordered = new ArrayList<>();
        // Every scripted card falls back to the catalog, not just a hand-picked
        // few. The tutorial asks for deck_fire_earth ("Ashen Roots"), but a preset
        // deck is dashboard data and can simply stop existing: buildDeckById then
        // falls back to the FIRST playable preset, which in production is the
        // mono-Fire "Blazing Core". Taking the scripted cards only from that pool
        // silently dropped squirebud and the Earth Strategies, so the round-three
        // combo lesson asked for an off-element Siegling the deck could not
        // contain. Pulling from the pool first still preserves any dashboard
        // tuning of that copy; the catalog is the guarantee behind it.
        for (String id : List.of(
                "sundile", "pylook", "tutorial_ashfall", "trap13", "pylook", "raydile", "floraknight", "generoot", "squirebud",
                "spell_fire_09", "tutorial_ashen_ward", "tutorial_ashfall",
                "spell_earth_02", "spell_earth_01")) {
            Card taken = takeNamedCard(pool, id);
            if (taken == null) {
                if ("tutorial_ashen_ward".equals(id)) {
                    taken = buildTutorialAshenWard();
                } else if ("tutorial_ashfall".equals(id)) {
                    taken = buildTutorialAshfall();
                } else {
                    taken = cardDefs.findCardCopy(id).orElse(null);
                }
            }
            if (taken != null) {
                ordered.add(taken);
            }
        }
        ordered.addAll(pool);
        player.setDeck(ordered);
    }

    /** Tutorial-only Strategy so the Advanced chapter can teach shields on-board. */
    private SpellCard buildTutorialAshenWard() {
        Ability shield = new Ability(
                "Ashen Ward",
                "Grant 1 ally +3 Shield",
                TargetType.SINGLE_ALLY,
                null,
                1,
                AbilityEffectKeys.SHIELD,
                3,
                false);
        SpellCard ward = new SpellCard(
                "tutorial_ashen_ward",
                "Ashen Ward",
                Element.FIRE,
                com.sieglings.model.enums.Rarity.COMMON,
                1,
                shield);
        ward.setDescription("A training ward — temporary Shield that absorbs damage before HP.");
        return ward;
    }

    /**
     * Tutorial-only Strategy: wipes the Dummy's board outright.
     *
     * It exists to give the CLAIM lesson a reason. Claiming pays one unit of the
     * claimed card's element, so cashing in Raydile takes the student from 2 Fire
     * to 3 — exactly this card's cost. Asking them to bin their best Siegeling for
     * energy they had no use for was the part that did not make sense; here the
     * claim is the only way to afford the swing that follows it.
     *
     * ALL_ENEMIES + DESTROY is a real combination: EffectService resolves
     * ALL_ENEMIES to every enemy Siegeling and runs the effect per target. Priced
     * at 3 so it cannot be cast without the claim, and kept out of every real deck
     * — a free board wipe is a tutorial prop, not a card.
     */
    private SpellCard buildTutorialAshfall() {
        Ability wipe = new Ability(
                "Ashfall",
                "Destroy every enemy Siegeling",
                TargetType.ALL_ENEMIES,
                null,
                3,
                AbilityEffectKeys.DESTROY,
                0,
                false);
        SpellCard ashfall = new SpellCard(
                "tutorial_ashfall",
                "Ashfall",
                Element.FIRE,
                com.sieglings.model.enums.Rarity.EPIC,
                3,
                wipe);
        // Priced in a POOL, not a combo. Pricing it as a Fire/Earth combo was
        // tried and reverted: EnergyService recomputes combo points from the
        // connected foundation network, so the claim step — which takes a
        // Siegling off the board one beat earlier — breaks the very link the
        // combo was standing on, and the wipe became uncastable at the exact
        // moment the script asks for it. A pool survives the claim; a link does
        // not, and the claim is what pays for this.
        ashfall.setDescription("A training Strategy — burns the whole enemy board away. Costs 3 Fire.");
        return ashfall;
    }

    /** Dummy opens on Cozycub so turn-1 Ice sockets are reliable for the Deception lesson. */
    private void prepareTutorialEnemyDeck(Player enemy) {
        if (enemy == null) {
            return;
        }
        List<Card> pool = new ArrayList<>(enemy.getDeck());
        List<Card> ordered = new ArrayList<>();
        for (String id : List.of("cozycub", "falcool", "fawny", "frostfly", "icewee")) {
            Card taken = takeNamedCard(pool, id);
            if (taken != null) {
                ordered.add(taken);
            }
        }
        ordered.addAll(pool);
        enemy.setDeck(ordered);
    }

    /**
     * Move the first off-element Siegling in the tutorial deck to the top, so the
     * round-three draw hands the student a combo partner. Elements already on the
     * player's board are skipped — a second Fire card would link, but it would pay
     * Fire energy, not the combo point the lesson is about.
     */
    private void hoistTutorialComboPartner(GameState state, boolean isPlayerSide, Player actor) {
        if (actor == null || actor.getDeck() == null || actor.getDeck().isEmpty()) {
            return;
        }
        // Held elements, not just board elements: on an empty board the board-only
        // rule matches the first Siegling in the deck whatever its element, which
        // hoists another Fire card and leaves the lesson exactly as stuck.
        Set<Element> held = tutorialVisibleElements(state, isPlayerSide, actor);
        for (int i = 0; i < actor.getDeck().size(); i++) {
            if (isComboPartnerFor(actor.getDeck().get(i), held)) {
                actor.getDeck().add(0, actor.getDeck().remove(i));
                return;
            }
        }
    }

    /**
     * Can the student build a combo at all from what they can see — the board plus
     * the hand? A combo needs two DIFFERENT elements facing each other, so one
     * distinct element across both is a dead end no matter how well they play.
     *
     * Deliberately not "is there a card in hand whose element is missing from the
     * board": on an empty board that is true of every Siegling, so it reads as
     * satisfied while the student holds nothing but Fire — the exact state that was
     * reported.
     */
    private boolean tutorialCanFormCombo(GameState state, boolean isPlayerSide, Player actor) {
        return tutorialVisibleElements(state, isPlayerSide, actor).size() >= 2;
    }

    /** Every element the student can already play with: board plus hand. */
    private Set<Element> tutorialVisibleElements(GameState state, boolean isPlayerSide, Player actor) {
        Set<Element> elements = elementsOnBoard(state, isPlayerSide);
        if (actor != null && actor.getHand() != null) {
            for (Card card : actor.getHand()) {
                if (card instanceof SieglingCard siegling
                        && !siegling.isEvolutionCard()
                        && siegling.getElement() != null) {
                    elements.add(siegling.getElement());
                }
            }
        }
        return elements;
    }

    /**
     * One rule, shared by the hoist and the combo check, so "what counts as a combo
     * partner" cannot drift between deciding to hoist and deciding it is no longer
     * needed. An evolution is excluded because it cannot be placed on its own, and
     * an element already on the board would link for that element's energy rather
     * than the combo point the lesson is about.
     */
    private boolean isComboPartnerFor(Card card, Set<Element> alreadyHeld) {
        if (!(card instanceof SieglingCard siegling) || siegling.isEvolutionCard()) {
            return false;
        }
        return siegling.getElement() != null && !alreadyHeld.contains(siegling.getElement());
    }

    private Set<Element> elementsOnBoard(GameState state, boolean isPlayerSide) {
        Set<Element> onBoard = new HashSet<>();
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                CardInstance slot = state.getAt(isPlayerSide, r, c);
                if (slot != null && slot.getCard() != null && slot.getCard().getElement() != null) {
                    onBoard.add(slot.getCard().getElement());
                }
            }
        }
        return onBoard;
    }

    private Card takeNamedCard(List<Card> pool, String cardId) {
        if (pool == null || cardId == null || cardId.isBlank()) {
            return null;
        }
        for (int i = 0; i < pool.size(); i++) {
            Card card = pool.get(i);
            if (card != null && cardId.equalsIgnoreCase(card.getId())) {
                pool.remove(i);
                return card;
            }
        }
        return null;
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
        // Active energy buffs run out here: they power setup, not the fight. Dropping them
        // before the restore is what makes the pool read true for the whole battle phase.
        boolean overchargeEnded = state.getPlayer().isOvercharged() || state.getEnemy().isOvercharged();
        energyService.clearOvercharge(state);
        if (overchargeEnded) {
            state.log("Overcharge fades as the battle phase begins.");
        }
        // Full energy restore at start of battle phase
        energyService.recalculateEnergy(state);
        state.log("Both setup turns are complete. Entering battle phase. Energy restored!");
        recalculateTrainerPassiveStatBuffs(state);
        effectService.recalculateBoardAuraDamageBoosts(state);
        battleService.initializeBattle(state);
        // Stop at the phase boundary. The client presents the Battle Phase
        // banner (starter + speed order) and only then calls executeBattle to
        // surface a human choice or resolve the first AI action. Advancing here
        // let a fast AI attack arrive in the same response as the banner.
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
            int shieldBuff = 0;
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
                        case AbilityEffectKeys.SHIELD -> shieldBuff += value;
                    }
                }
            }
            ci.setTrainerPassiveHealthBuff(healthBuff);
            ci.setTrainerPassiveDamageBuff(damageBuff);
            ci.setTrainerPassiveSpeedBuff(speedBuff);
            ci.setTrainerPassiveShieldBuff(shieldBuff);
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
        boolean tutorialScripted = state.isTutorialMatch() && isPlayerSide;
        if (tutorialScripted) {
            // Only the practice slot may leave the hand; keep / ignore anything else so
            // lesson cards cannot be discarded even by an old or malicious client.
            plan = plan.stream()
                    .filter(i -> i != null && i == TUTORIAL_SCRIPTED_MULLIGAN_INDEX)
                    .distinct()
                    .toList();
        }
        if (plan.isEmpty()) {
            state.log(sideName(state, isPlayerSide) + " keeps the opening hand.");
        } else {
            actor.mulliganHandAtIndices(plan, !tutorialScripted);
            state.setMulliganUsed(isPlayerSide, true);
            state.log(sideName(state, isPlayerSide) + " mulligans " + plan.size() + " opening card(s).");
        }
        if (tutorialScripted) {
            ensureTutorialLessonOpeningHand(actor);
        }
        state.setMulliganPending(isPlayerSide, false);
        tryCompleteOpeningMulligan(state);
        return state;
    }

    /**
     * Turn one of the tutorial takes the designated opener and nothing else.
     * Evolutions are exempt — they cannot be placed on turn one anyway (their
     * base has not fought yet), so the base rules already refuse them and this
     * gate has no business producing a second, more confusing refusal.
     */
    private boolean isTutorialTurnOnePlacementAllowed(GameState state, boolean isPlayerSide, SieglingCard siegling) {
        if (state == null || !state.isTutorialMatch() || !isPlayerSide) {
            return true;
        }
        if (siegling == null || siegling.isEvolutionCard()) {
            return true;
        }
        String required = state.getTutorialRequiredPlacementId();
        return required == null || required.equalsIgnoreCase(siegling.getId());
    }

    /** The opener's printed name, so the refusal names a card the player can see. */
    private String tutorialOpenerName(Player actor) {
        if (actor != null) {
            for (Card held : actor.getHand()) {
                if (held != null && TUTORIAL_TURN_ONE_OPENER_ID.equalsIgnoreCase(held.getId())) {
                    return held.getName();
                }
            }
        }
        return "its first Siegling";
    }

    /**
     * After a tutorial mulligan, restore any missing lesson openers from the deck so
     * the coach script can still fire even if a client somehow bypassed the UI lock.
     */
    private void ensureTutorialLessonOpeningHand(Player player) {
        if (player == null) {
            return;
        }
        for (String id : TUTORIAL_REQUIRED_OPENING_IDS) {
            boolean inHand = player.getHand().stream()
                    .anyMatch(card -> card != null && id.equalsIgnoreCase(card.getId()));
            if (inHand) {
                continue;
            }
            Card restored = takeNamedCard(player.getDeck(), id);
            if (restored == null) {
                continue;
            }
            // Keep hand size stable: park a non-required card under the deck.
            int swapIndex = -1;
            for (int i = 0; i < player.getHand().size(); i++) {
                Card held = player.getHand().get(i);
                String heldId = held == null ? "" : held.getId();
                boolean required = TUTORIAL_REQUIRED_OPENING_IDS.stream()
                        .anyMatch(req -> req.equalsIgnoreCase(heldId));
                if (!required) {
                    swapIndex = i;
                    break;
                }
            }
            if (swapIndex >= 0) {
                Card parked = player.getHand().remove(swapIndex);
                player.getDeck().add(parked);
            }
            player.getHand().add(restored);
        }
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
