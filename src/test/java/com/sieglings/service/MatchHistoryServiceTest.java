package com.sieglings.service;

import com.sieglings.model.GameState;
import com.sieglings.model.Player;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MatchHistoryServiceTest {

    @Test
    void completedGameRecordingIsIdempotentUnderConcurrentCalls() throws Exception {
        BlockingMatchHistoryStore matchHistoryStore = new BlockingMatchHistoryStore();
        RecordingProgressionService progressionService = new RecordingProgressionService();
        MatchHistoryService service = createService(matchHistoryStore, progressionService);
        GameState state = completedOnlineGame();

        Thread first = new Thread(() -> service.recordCompletedGame(state), "match-history-first");
        Thread second = new Thread(() -> {
            try {
                assertTrue(matchHistoryStore.firstSaveStarted.await(2, TimeUnit.SECONDS));
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
            service.recordCompletedGame(state);
        }, "match-history-second");

        first.start();
        second.start();
        first.join(2_000);
        second.join(2_000);

        assertTrue(state.isMatchHistoryRecorded());
        assertEquals(2, matchHistoryStore.savedIds.size());
        assertEquals(2, progressionService.rewardedIds.size());
        assertTrue(matchHistoryStore.savedIds.contains(state.getMatchHistoryId() + "-player"));
        assertTrue(matchHistoryStore.savedIds.contains(state.getMatchHistoryId() + "-enemy"));
    }

    @Test
    void completedGuestSoloGameCanBeRecordedAfterAccountIsAttached() throws Exception {
        BlockingMatchHistoryStore matchHistoryStore = new BlockingMatchHistoryStore();
        RecordingProgressionService progressionService = new RecordingProgressionService();
        MatchHistoryService service = createService(matchHistoryStore, progressionService);
        GameState state = completedGuestSoloGame();

        service.recordCompletedGame(state);

        assertFalse(state.isMatchHistoryRecorded());
        assertEquals(0, matchHistoryStore.savedIds.size());
        assertEquals(0, progressionService.rewardedIds.size());

        state.getPlayer().setAccountUserId("player@example.com");
        service.recordCompletedGame(state);

        assertTrue(state.isMatchHistoryRecorded());
        assertEquals(1, matchHistoryStore.savedIds.size());
        assertEquals(1, progressionService.rewardedIds.size());
        assertTrue(matchHistoryStore.savedIds.contains(state.getMatchHistoryId() + "-player"));
    }

    private MatchHistoryService createService(MatchHistoryStore matchHistoryStore, PlayerProgressionService progressionService) throws Exception {
        MatchHistoryService service = new MatchHistoryService();
        setField(service, "matchHistoryStore", matchHistoryStore);
        setField(service, "accountUserStore", new FakeAccountUserStore());
        setField(service, "playerProgressionService", progressionService);
        return service;
    }

    private GameState completedOnlineGame() {
        GameState state = new GameState();
        Player player = new Player("Player", true);
        player.setAccountUserId("player@example.com");
        Player enemy = new Player("Enemy", true);
        enemy.setAccountUserId("enemy@example.com");
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setEnemyHumanControlled(true);
        state.setGameOver(true);
        state.setWinner("Player");
        return state;
    }

    private GameState completedGuestSoloGame() {
        GameState state = new GameState();
        Player player = new Player("Player", true);
        Player enemy = new Player("Enemy", false);
        state.setPlayer(player);
        state.setEnemy(enemy);
        state.setGameOver(true);
        state.setWinner("Player");
        return state;
    }

    private void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static class BlockingMatchHistoryStore extends MatchHistoryStore {
        private final CountDownLatch firstSaveStarted = new CountDownLatch(1);
        private final List<String> savedIds = new ArrayList<>();

        @Override
        public synchronized MatchHistoryEntity save(MatchHistoryEntity match) {
            savedIds.add(match.getId());
            if (savedIds.size() == 1) {
                firstSaveStarted.countDown();
                try {
                    Thread.sleep(100);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
            }
            return match;
        }
    }

    private static class FakeAccountUserStore extends AccountUserStore {
        @Override
        public Optional<AccountUser> findById(String id) {
            AccountUser user = new AccountUser();
            user.setId(id);
            user.setEmail(id);
            user.setDisplayName(id);
            return Optional.of(user);
        }
    }

    private static class RecordingProgressionService extends PlayerProgressionService {
        private final List<String> rewardedIds = new ArrayList<>();

        @Override
        public void awardMatchGold(MatchHistoryEntity history) {
            rewardedIds.add(history.getId());
        }
    }
}
