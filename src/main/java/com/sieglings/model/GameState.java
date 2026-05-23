package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Phase;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Complete game state for a single match.
 */
public class GameState {
    private Player player;
    private Player enemy;

    // Board: [row][col], row 0=BACK, 1=MIDDLE, 2=FRONT
    private CardInstance[][] playerBoard = new CardInstance[3][3];
    private CardInstance[][] enemyBoard = new CardInstance[3][3];

    private Phase currentPhase = Phase.DRAW;
    private int turnNumber = 1;
    private boolean playerTurn = true;
    private boolean gameOver = false;
    private String winner;
    private int nextPlacementOrder = 1;
    private List<String> battleQueue = new ArrayList<>();
    private int battleCursor = 0;
    private String pendingBattleInstanceId;
    /**
     * Set after a battle action resolves so the client can show that action's
     * visual result before the queue advances to the next creature or phase.
     */
    private boolean battleActionPausePending = false;
    /** Setup actions consumed this turn by Sieglings, spells, and traps. */
    private int playerPlacementsThisTurn = 0;
    private int enemyPlacementsThisTurn = 0;
    /** External board sockets that have ever been activated; persist even if Sieglinks break. */
    private Map<String, Element> playerExternalSocketActivations = new LinkedHashMap<>();
    private Map<String, Element> enemyExternalSocketActivations = new LinkedHashMap<>();
    /**
     * Extra Siegling setup placements from total pooled energy ({@link Player#sumPooledEnergy()}) for this turn only.
     * Captured when entering setup (after {@code recalculateEnergy}) so energy gained during the same setup phase
     * does not increase the budget mid-turn.
     */
    private int playerSetupEnergyPlacementBonus = 0;
    private int enemySetupEnergyPlacementBonus = 0;
    private boolean playerGoesFirst = true;
    private int setupTurnsTakenThisRound = 0;
    private boolean enemyHumanControlled = false;
    private boolean playerMulliganPending = false;
    private boolean enemyMulliganPending = false;
    private boolean playerMulliganUsed = false;
    private boolean enemyMulliganUsed = false;
    private boolean matchHistoryRecorded = false;

    private List<String> gameLog = new ArrayList<>();

    // Track if first turn (player 1 restrictions)
    private boolean firstTurn = true;

    public GameState() {}

    public void log(String message) {
        gameLog.add("[Turn " + turnNumber + " " + currentPhase + "] " + message);
        // Keep log manageable
        if (gameLog.size() > 100) {
            gameLog = new ArrayList<>(gameLog.subList(gameLog.size() - 80, gameLog.size()));
        }
    }

    public int countBoardSieglings(boolean isPlayer) {
        CardInstance[][] board = isPlayer ? playerBoard : enemyBoard;
        int count = 0;
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (board[r][c] != null && board[r][c].isAlive()) count++;
            }
        }
        return count;
    }

    public List<CardInstance> getBoardSieglings(boolean isPlayer) {
        CardInstance[][] board = isPlayer ? playerBoard : enemyBoard;
        List<CardInstance> list = new ArrayList<>();
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (board[r][c] != null && board[r][c].isAlive()) {
                    list.add(board[r][c]);
                }
            }
        }
        return list;
    }

    public CardInstance getAt(boolean isPlayer, int row, int col) {
        if (row < 0 || row > 2 || col < 0 || col > 2) return null;
        return isPlayer ? playerBoard[row][col] : enemyBoard[row][col];
    }

    public void setAt(boolean isPlayer, int row, int col, CardInstance instance) {
        if (isPlayer) {
            playerBoard[row][col] = instance;
        } else {
            enemyBoard[row][col] = instance;
        }
    }

    public void removeDeadSieglings() {
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (playerBoard[r][c] != null && !playerBoard[r][c].isAlive()) {
                    player.getDiscard().add(playerBoard[r][c].getCard());
                    log(playerBoard[r][c].getName() + " was defeated!");
                    enemy.addOpponentSieglingsDefeatedThisMatch(1);
                    playerBoard[r][c] = null;
                }
                if (enemyBoard[r][c] != null && !enemyBoard[r][c].isAlive()) {
                    enemy.getDiscard().add(enemyBoard[r][c].getCard());
                    log(enemyBoard[r][c].getName() + " was defeated!");
                    player.addOpponentSieglingsDefeatedThisMatch(1);
                    enemyBoard[r][c] = null;
                }
            }
        }
    }

    public CardInstance findByInstanceId(String instanceId) {
        if (instanceId == null) return null;

        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (playerBoard[r][c] != null && instanceId.equals(playerBoard[r][c].getInstanceId())) {
                    return playerBoard[r][c];
                }
                if (enemyBoard[r][c] != null && instanceId.equals(enemyBoard[r][c].getInstanceId())) {
                    return enemyBoard[r][c];
                }
            }
        }

        return null;
    }

    public void clearBattleState() {
        battleQueue = new ArrayList<>();
        battleCursor = 0;
        pendingBattleInstanceId = null;
        battleActionPausePending = false;
    }

    /**
     * Setup action budget this turn = 1 base + total pooled energy when setup began (after draw).
     */
    public int getSieglingSetupActionBudget(boolean isPlayer) {
        int bonus = isPlayer ? playerSetupEnergyPlacementBonus : enemySetupEnergyPlacementBonus;
        return 1 + bonus;
    }

    /** Call after {@code recalculateEnergy} when entering setup (draw → setup, or AI draw → setup). */
    public void captureSieglingSetupPlacementBonusFromEnergy(boolean isPlayer) {
        if (isPlayer) {
            playerSetupEnergyPlacementBonus = player.sumPooledEnergy();
        } else {
            enemySetupEnergyPlacementBonus = enemy.sumPooledEnergy();
        }
    }

    public int getSieglingSetupActionsUsed(boolean isPlayer) {
        return isPlayer ? playerPlacementsThisTurn : enemyPlacementsThisTurn;
    }

    public boolean isSieglingSetupBudgetExhausted(boolean isPlayer) {
        return getSieglingSetupActionsUsed(isPlayer) >= getSieglingSetupActionBudget(isPlayer);
    }

    public boolean hasPlacedSieglingThisTurn(boolean isPlayer) {
        return isSieglingSetupBudgetExhausted(isPlayer);
    }

    public void mergeExternalSocketActivations(boolean isPlayer, Map<String, Element> detected) {
        if (detected == null || detected.isEmpty()) {
            return;
        }
        Map<String, Element> target = isPlayer ? playerExternalSocketActivations : enemyExternalSocketActivations;
        for (Map.Entry<String, Element> e : detected.entrySet()) {
            if (e.getKey() != null && e.getValue() != null) {
                target.putIfAbsent(e.getKey(), e.getValue());
            }
        }
    }

    public Map<String, Element> getExternalSocketActivations(boolean isPlayer) {
        return isPlayer ? playerExternalSocketActivations : enemyExternalSocketActivations;
    }

    public void recordSieglingSetupActionConsumed(boolean isPlayer) {
        if (isPlayer) {
            playerPlacementsThisTurn++;
        } else {
            enemyPlacementsThisTurn++;
        }
    }

    public void recordSieglingPlacement(boolean isPlayer) {
        recordSieglingSetupActionConsumed(isPlayer);
    }

    public void resetPlacementsForTurn(boolean isPlayer) {
        if (isPlayer) {
            playerPlacementsThisTurn = 0;
        } else {
            enemyPlacementsThisTurn = 0;
        }
    }

    public void resetRoundOrder(boolean playerStartsRound) {
        playerGoesFirst = playerStartsRound;
        playerTurn = playerStartsRound;
        setupTurnsTakenThisRound = 0;
        playerPlacementsThisTurn = 0;
        enemyPlacementsThisTurn = 0;
    }

    public void completeSetupTurn() {
        setupTurnsTakenThisRound++;
    }

    public boolean isMulliganPending(boolean isPlayer) {
        return isPlayer ? playerMulliganPending : enemyMulliganPending;
    }

    public void setMulliganPending(boolean isPlayer, boolean pending) {
        if (isPlayer) {
            playerMulliganPending = pending;
        } else {
            enemyMulliganPending = pending;
        }
    }

    public boolean hasUsedMulligan(boolean isPlayer) {
        return isPlayer ? playerMulliganUsed : enemyMulliganUsed;
    }

    public void setMulliganUsed(boolean isPlayer, boolean used) {
        if (isPlayer) {
            playerMulliganUsed = used;
        } else {
            enemyMulliganUsed = used;
        }
    }

    // Getters and setters
    public Player getPlayer() { return player; }
    public void setPlayer(Player player) { this.player = player; }
    public Player getEnemy() { return enemy; }
    public void setEnemy(Player enemy) { this.enemy = enemy; }
    public CardInstance[][] getPlayerBoard() { return playerBoard; }
    public CardInstance[][] getEnemyBoard() { return enemyBoard; }
    public Phase getCurrentPhase() { return currentPhase; }
    public void setCurrentPhase(Phase currentPhase) { this.currentPhase = currentPhase; }
    public int getTurnNumber() { return turnNumber; }
    public void setTurnNumber(int turnNumber) { this.turnNumber = turnNumber; }
    public boolean isPlayerTurn() { return playerTurn; }
    public void setPlayerTurn(boolean playerTurn) { this.playerTurn = playerTurn; }
    public boolean isGameOver() { return gameOver; }
    public void setGameOver(boolean gameOver) { this.gameOver = gameOver; }
    public String getWinner() { return winner; }
    public void setWinner(String winner) { this.winner = winner; }
    public int getNextPlacementOrder() { return nextPlacementOrder; }
    public int consumePlacementOrder() { return nextPlacementOrder++; }
    public List<String> getBattleQueue() { return battleQueue; }
    public void setBattleQueue(List<String> battleQueue) { this.battleQueue = battleQueue; }
    public int getBattleCursor() { return battleCursor; }
    public void setBattleCursor(int battleCursor) { this.battleCursor = battleCursor; }
    public String getPendingBattleInstanceId() { return pendingBattleInstanceId; }
    public void setPendingBattleInstanceId(String pendingBattleInstanceId) { this.pendingBattleInstanceId = pendingBattleInstanceId; }
    public boolean isBattleActionPausePending() { return battleActionPausePending; }
    public void setBattleActionPausePending(boolean battleActionPausePending) { this.battleActionPausePending = battleActionPausePending; }
    public List<String> getGameLog() { return gameLog; }
    public boolean isFirstTurn() { return firstTurn; }
    public void setFirstTurn(boolean firstTurn) { this.firstTurn = firstTurn; }
    public int getPlayerPlacementsThisTurn() { return playerPlacementsThisTurn; }
    public int getEnemyPlacementsThisTurn() { return enemyPlacementsThisTurn; }
    public boolean isPlayerGoesFirst() { return playerGoesFirst; }
    public void setPlayerGoesFirst(boolean playerGoesFirst) { this.playerGoesFirst = playerGoesFirst; }
    public int getSetupTurnsTakenThisRound() { return setupTurnsTakenThisRound; }
    public void setSetupTurnsTakenThisRound(int setupTurnsTakenThisRound) { this.setupTurnsTakenThisRound = setupTurnsTakenThisRound; }
    public boolean isEnemyHumanControlled() { return enemyHumanControlled; }
    public void setEnemyHumanControlled(boolean enemyHumanControlled) { this.enemyHumanControlled = enemyHumanControlled; }
    public boolean isPlayerMulliganPending() { return playerMulliganPending; }
    public boolean isEnemyMulliganPending() { return enemyMulliganPending; }
    public boolean isPlayerMulliganUsed() { return playerMulliganUsed; }
    public boolean isEnemyMulliganUsed() { return enemyMulliganUsed; }
    public boolean isMatchHistoryRecorded() { return matchHistoryRecorded; }
    public void setMatchHistoryRecorded(boolean matchHistoryRecorded) { this.matchHistoryRecorded = matchHistoryRecorded; }
}
