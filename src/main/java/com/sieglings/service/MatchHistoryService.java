package com.sieglings.service;

import com.sieglings.model.GameState;
import com.sieglings.model.Player;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.repo.AccountUserRepository;
import com.sieglings.persistence.repo.MatchHistoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class MatchHistoryService {

    @Autowired
    private MatchHistoryRepository matchHistoryRepository;

    @Autowired
    private AccountUserRepository accountUserRepository;

    @Transactional(readOnly = true)
    public List<MatchHistoryEntity> listRecent(AccountUser user) {
        return matchHistoryRepository.findTop12ByUser_IdOrderByFinishedAtDesc(user.getId());
    }

    @Transactional
    public void recordCompletedGame(GameState state) {
        if (state == null || !state.isGameOver() || state.isMatchHistoryRecorded()) {
            return;
        }

        recordForSide(state, true);
        recordForSide(state, false);
        state.setMatchHistoryRecorded(true);
    }

    private void recordForSide(GameState state, boolean isPlayerSide) {
        Player player = isPlayerSide ? state.getPlayer() : state.getEnemy();
        Player opponent = isPlayerSide ? state.getEnemy() : state.getPlayer();
        if (player.getAccountUserId() == null) {
            return;
        }

        AccountUser user = accountUserRepository.findById(player.getAccountUserId()).orElse(null);
        if (user == null) {
            return;
        }

        MatchHistoryEntity history = new MatchHistoryEntity();
        history.setId(UUID.randomUUID().toString());
        history.setUser(user);
        history.setFinishedAt(Instant.now());
        history.setResult(resolveResult(state, player.getName()));
        history.setMatchType(state.isEnemyHumanControlled() ? "ONLINE" : "SOLO");
        history.setOpponentName(opponent.getName());
        history.setLoadoutLabel(player.getLoadoutLabel() == null || player.getLoadoutLabel().isBlank()
                ? "Custom Loadout"
                : player.getLoadoutLabel());
        history.setTrainerName(player.getActiveTrainer() == null ? "No Trainer" : player.getActiveTrainer().getName());
        history.setTurnNumber(state.getTurnNumber());
        matchHistoryRepository.save(history);
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
