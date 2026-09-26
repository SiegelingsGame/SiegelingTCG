package com.sieglings.service;

import com.sieglings.model.GameState;
import com.sieglings.model.Player;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import com.sieglings.persistence.firestore.MatchReviewStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class MatchHistoryService {

    private static final Logger logger = LoggerFactory.getLogger(MatchHistoryService.class);
    private static final int STARTING_HEALTH = 50;

    @Autowired
    private MatchHistoryStore matchHistoryStore;

    @Autowired
    private AccountUserStore accountUserStore;

    @Autowired
    private PlayerProgressionService playerProgressionService;

    /** Optional so history still records if the review store is missing (unit tests). */
    @Autowired(required = false)
    private MatchReviewStore matchReviewStore;

    public List<MatchHistoryEntity> listRecent(AccountUser user) {
        return matchHistoryStore.findTop12ByUserOrderByFinishedAtDesc(user.getId());
    }

    public void recordCompletedGame(GameState state) {
        if (state == null || !state.isGameOver()) {
            return;
        }

        synchronized (state) {
            if (state.isMatchHistoryRecorded()) {
                return;
            }
            boolean playerRecorded = recordForSide(state, true);
            boolean enemyRecorded = recordForSide(state, false);
            if (playerRecorded || enemyRecorded) {
                state.setMatchHistoryRecorded(true);
            }
        }
    }

    private boolean recordForSide(GameState state, boolean isPlayerSide) {
        Player player = isPlayerSide ? state.getPlayer() : state.getEnemy();
        Player opponent = isPlayerSide ? state.getEnemy() : state.getPlayer();
        if (player.getAccountUserId() == null || player.getAccountUserId().isBlank()) {
            logger.info("Skipping match history for {} side because no account user id is attached.", isPlayerSide ? "player" : "enemy");
            return false;
        }

        AccountUser user = accountUserStore.findById(player.getAccountUserId()).orElse(null);
        if (user == null) {
            logger.warn("Skipping match history for missing account user id {}.", player.getAccountUserId());
            return false;
        }

        MatchHistoryEntity history = new MatchHistoryEntity();
        history.setId(state.getMatchHistoryId() + (isPlayerSide ? "-player" : "-enemy"));
        history.setUserId(user.getId());
        history.setUserDisplayName(user.getDisplayName());
        history.setFinishedAt(Instant.now());
        history.setResult(resolveResult(state, player.getName()));
        history.setMatchType(state.isEnemyHumanControlled() ? "ONLINE" : "SOLO");
        history.setOpponentName(opponent.getName());
        history.setLoadoutLabel(player.getLoadoutLabel() == null || player.getLoadoutLabel().isBlank()
                ? "Custom Loadout"
                : player.getLoadoutLabel());
        history.setTrainerName(player.getActiveTrainer() == null ? "No Trainer" : player.getActiveTrainer().getName());
        history.setTurnNumber(state.getTurnNumber());
        history.setSpellsCast(player.getSpellsCastThisMatch());
        history.setTrapsSprung(player.getTrapsSprungThisMatch());
        history.setSiegelingsDefeated(player.getOpponentSieglingsDefeatedThisMatch());
        history.setPlayerHealthRemaining(player.getHealth());
        history.setOpponentHealthRemaining(opponent.getHealth());
        history.setPlayerEnergyRemaining(totalEnergy(player));
        history.setGameLog(state.getGameLog() == null ? List.of() : List.copyOf(state.getGameLog()));
        history.setHasReplay(saveReplay(state, history, isPlayerSide, player, opponent));
        matchHistoryStore.save(history);
        playerProgressionService.awardMatchGold(history);
        logger.info("Recorded {} match history {} for user {}.", history.getMatchType(), history.getId(), user.getId());
        return true;
    }

    /**
     * Writes the board replay before the history row, so a row only claims a
     * replay that exists. A failure here is logged and the row is saved without
     * one: a review is a convenience and must never cost a player their record
     * or match gold.
     */
    private boolean saveReplay(GameState state, MatchHistoryEntity history, boolean isPlayerSide,
                               Player player, Player opponent) {
        if (matchReviewStore == null || state.getReplay() == null || state.getReplay().isEmpty()) {
            return false;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("userId", history.getUserId());
            payload.put("finishedAt", history.getFinishedAt());
            // Frames are always stored from the engine's player/enemy view; the
            // viewer side tells the client which half of the board is "you".
            payload.put("viewerSide", isPlayerSide ? "p" : "e");
            payload.put("playerName", state.getPlayer().getName());
            payload.put("enemyName", state.getEnemy().getName());
            payload.put("viewerName", player.getName());
            payload.put("opponentName", opponent.getName());
            payload.put("startingHealth", STARTING_HEALTH);
            payload.put("cards", state.getReplay().cards());
            payload.put("frames", state.getReplay().frames());
            matchReviewStore.saveReplay(history.getId(), payload);
            return true;
        } catch (RuntimeException ex) {
            logger.warn("Unable to save replay for match history {}; recording without one.", history.getId(), ex);
            return false;
        }
    }

    private int totalEnergy(Player player) {
        return player.getFireEnergy() + player.getEarthEnergy() + player.getWindEnergy()
                + player.getWaterEnergy() + player.getIceEnergy() + player.getShadowEnergy()
                + player.getElectricEnergy() + player.getMetalEnergy() + player.getUndeadEnergy()
                + player.getPsychicEnergy();
    }

    private String resolveResult(GameState state, String playerName) {
        if (state.getWinner() == null) {
            return "UNKNOWN";
        }
        if ("Draw".equalsIgnoreCase(state.getWinner())) {
            return "DRAW";
        }
        return state.getWinner().equalsIgnoreCase(playerName) ? "WIN" : "LOSS";
    }
}
