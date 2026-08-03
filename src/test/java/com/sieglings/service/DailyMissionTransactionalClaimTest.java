package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.DailyMissionProgressEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.DailyMissionProgressStore;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import com.sieglings.persistence.firestore.RewardClaimStore;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The striped lock in {@link DailyMissionService} only serializes callers sharing
 * a JVM, so it stops duplicate payouts on one instance and nothing more. These
 * tests model <em>two</em> instances — two services with independent locks over
 * one shared store — which is the case the Firestore transaction exists for.
 *
 * <p>{@link OptimisticClaimStore} reproduces Firestore's transaction semantics:
 * read at a version, run the body, and commit only if nothing else wrote in the
 * meantime, otherwise re-run the body against a fresh read. That retry is why the
 * claim bodies must be pure functions of the two entities handed to them.
 */
class DailyMissionTransactionalClaimTest {

    @Test
    void twoInstancesClaimingOneChestPayExactlyOnce() throws Exception {
        OptimisticClaimStore shared = new OptimisticClaimStore();
        shared.missionDoc = progressForToday("player@example.com");
        shared.missionDoc.setDailyPoints(100);
        shared.progressionDoc = progression("player@example.com");

        DailyMissionService instanceA = serviceOn(shared);
        DailyMissionService instanceB = serviceOn(shared);

        int granted = race(
                () -> instanceA.claimChest(user(), "daily", 40),
                () -> instanceB.claimChest(user(), "daily", 40));

        assertEquals(1, granted, "two instances must not both pay the same chest");
        assertEquals(150, shared.progressionDoc.getGold());
        assertEquals(40, shared.progressionDoc.getRemnants());
        assertEquals(1, shared.missionDoc.getClaimedDailyChests().size());
        assertTrue(shared.bodyRuns.get() >= 2, "the loser should have re-run its body against a fresh read");
    }

    @Test
    void twoInstancesClaimingKnightLevelsPayExactlyOnce() throws Exception {
        OptimisticClaimStore shared = new OptimisticClaimStore();
        shared.missionDoc = progressForToday("player@example.com");
        shared.missionDoc.setKnightPoints(260);
        shared.progressionDoc = progression("player@example.com");

        DailyMissionService instanceA = serviceOn(shared);
        DailyMissionService instanceB = serviceOn(shared);

        int granted = race(
                () -> instanceA.claimKnightLevels(user()),
                () -> instanceB.claimKnightLevels(user()));

        assertEquals(1, granted, "two instances must not both pay the same Knight Levels");
        assertEquals(650, shared.progressionDoc.getGold());
        assertEquals(275, shared.progressionDoc.getRemnants());
        assertEquals(3, shared.missionDoc.getClaimedKnightLevel());
    }

    /**
     * A retry re-runs the body from scratch. If a body accumulated into captured
     * state instead of deriving everything from its two entities, the committed
     * payout would be a multiple of the intended one.
     */
    @Test
    void bodyIsSafeToRetry() throws Exception {
        OptimisticClaimStore shared = new OptimisticClaimStore();
        shared.missionDoc = progressForToday("player@example.com");
        shared.missionDoc.setDailyPoints(100);
        shared.progressionDoc = progression("player@example.com");
        shared.forcedRetries = 3;

        serviceOn(shared).claimChest(user(), "daily", 40);

        assertEquals(4, shared.bodyRuns.get(), "body should have run once per forced retry plus the commit");
        assertEquals(150, shared.progressionDoc.getGold(), "a retried claim must still pay exactly once");
        assertEquals(40, shared.progressionDoc.getRemnants());
    }

    /** A rejection inside the transaction must surface unchanged, not wrapped. */
    @Test
    void rejectionInsideTransactionPropagates() throws Exception {
        OptimisticClaimStore shared = new OptimisticClaimStore();
        shared.missionDoc = progressForToday("player@example.com");
        shared.missionDoc.setDailyPoints(10);
        shared.progressionDoc = progression("player@example.com");

        DailyMissionService service = serviceOn(shared);
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.claimChest(user(), "daily", 40));
        assertEquals("Not enough points for that chest yet.", ex.getMessage());
        assertEquals(0, shared.progressionDoc.getGold(), "an aborted claim must not write");
    }

    private int race(Runnable a, Runnable b) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger granted = new AtomicInteger();
        Thread threadA = new Thread(attempt(a, start, granted));
        Thread threadB = new Thread(attempt(b, start, granted));
        threadA.start();
        threadB.start();
        start.countDown();
        threadA.join(10_000);
        threadB.join(10_000);
        return granted.get();
    }

    private Runnable attempt(Runnable claim, CountDownLatch start, AtomicInteger granted) {
        return () -> {
            try {
                start.await();
                claim.run();
                granted.incrementAndGet();
            } catch (IllegalArgumentException expected) {
                // the loser is rejected once it re-reads the committed claim
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
        };
    }

    /** A service whose only persistence is the shared transactional store. */
    private DailyMissionService serviceOn(OptimisticClaimStore shared) throws Exception {
        DailyMissionService service = new DailyMissionService();
        setField(service, "progressStore", new UnusedMissionStore());
        setField(service, "playerProgressionStore", new UnusedProgressionStore());
        setField(service, "rewardClaimStore", shared);
        setField(service, "missionTimeZoneId", "UTC");
        return service;
    }

    private static DailyMissionProgressEntity progressForToday(String userId) {
        DailyMissionProgressEntity progress = new DailyMissionProgressEntity();
        progress.setUserId(userId);
        java.time.LocalDate today = Instant.now().atZone(ZoneId.of("UTC")).toLocalDate();
        progress.setDateKey(today.format(DateTimeFormatter.ISO_LOCAL_DATE));
        progress.setWeekKey(String.format(java.util.Locale.ROOT, "%d-W%02d",
                today.get(java.time.temporal.IsoFields.WEEK_BASED_YEAR),
                today.get(java.time.temporal.IsoFields.WEEK_OF_WEEK_BASED_YEAR)));
        return progress;
    }

    private static PlayerProgressionEntity progression(String userId) {
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId(userId);
        progression.setGold(0);
        return progression;
    }

    private static AccountUser user() {
        AccountUser user = new AccountUser();
        user.setId("player@example.com");
        user.setEmail("player@example.com");
        user.setDisplayName("Player");
        return user;
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    /** In-memory stand-in with Firestore's read-version / commit-or-retry behaviour. */
    private static final class OptimisticClaimStore extends RewardClaimStore {
        volatile DailyMissionProgressEntity missionDoc;
        volatile PlayerProgressionEntity progressionDoc;
        private int version;
        final AtomicInteger bodyRuns = new AtomicInteger();
        volatile int forcedRetries;

        @Override
        public boolean isAvailable() {
            return true;
        }

        @Override
        public <T> T runClaim(String userId, ProgressionFactory progressionFactory, ClaimBody<T> body) {
            for (int attempt = 0; attempt < 8; attempt++) {
                int readVersion;
                DailyMissionProgressEntity progress;
                PlayerProgressionEntity progression;
                synchronized (this) {
                    readVersion = version;
                    progress = copyProgress(missionDoc);
                    progression = copyProgression(progressionDoc);
                }
                // Hold the window open so a competing caller commits first.
                try {
                    TimeUnit.MILLISECONDS.sleep(40);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
                bodyRuns.incrementAndGet();
                T result = body.apply(progress, progression);
                synchronized (this) {
                    if (forcedRetries > 0) {
                        forcedRetries--;
                        continue;
                    }
                    if (version != readVersion) {
                        continue;
                    }
                    missionDoc = progress;
                    progressionDoc = progression;
                    version++;
                    return result;
                }
            }
            throw new IllegalStateException("Too much contention on the reward claim.");
        }

        private static DailyMissionProgressEntity copyProgress(DailyMissionProgressEntity from) {
            DailyMissionProgressEntity copy = new DailyMissionProgressEntity();
            copy.setUserId(from.getUserId());
            copy.setDateKey(from.getDateKey());
            copy.setWeekKey(from.getWeekKey());
            copy.setCounters(new LinkedHashMap<>(from.getCounters()));
            copy.setClaimedMissionIds(new ArrayList<>(from.getClaimedMissionIds()));
            copy.setDailyPoints(from.getDailyPoints());
            copy.setClaimedDailyChests(new ArrayList<>(from.getClaimedDailyChests()));
            copy.setWeeklyCounters(new LinkedHashMap<>(from.getWeeklyCounters()));
            copy.setClaimedWeeklyIds(new ArrayList<>(from.getClaimedWeeklyIds()));
            copy.setWeeklyPoints(from.getWeeklyPoints());
            copy.setClaimedWeeklyChests(new ArrayList<>(from.getClaimedWeeklyChests()));
            copy.setLifetimeCounters(new LinkedHashMap<>(from.getLifetimeCounters()));
            copy.setClaimedLifetimeIds(new ArrayList<>(from.getClaimedLifetimeIds()));
            copy.setKnightPoints(from.getKnightPoints());
            copy.setClaimedKnightLevel(from.getClaimedKnightLevel());
            copy.setLastLoginClaimKey(from.getLastLoginClaimKey());
            copy.setLoginStreak(from.getLoginStreak());
            return copy;
        }

        private static PlayerProgressionEntity copyProgression(PlayerProgressionEntity from) {
            PlayerProgressionEntity copy = new PlayerProgressionEntity();
            copy.setUserId(from.getUserId());
            copy.setGold(from.getGold());
            copy.setRemnants(from.getRemnants());
            copy.setOwnedCards(new LinkedHashMap<>(from.getOwnedCards()));
            return copy;
        }
    }

    /** The transactional path must never touch these. */
    private static final class UnusedMissionStore extends DailyMissionProgressStore {
        @Override
        public Optional<DailyMissionProgressEntity> findByUserId(String userId) {
            throw new AssertionError("transactional claim must not read through the plain store");
        }

        @Override
        public DailyMissionProgressEntity save(DailyMissionProgressEntity progress) {
            throw new AssertionError("transactional claim must not write through the plain store");
        }
    }

    private static final class UnusedProgressionStore extends PlayerProgressionStore {
        @Override
        public Optional<PlayerProgressionEntity> findByUserId(String userId) {
            throw new AssertionError("transactional claim must not read through the plain store");
        }

        @Override
        public PlayerProgressionEntity save(PlayerProgressionEntity progression) {
            throw new AssertionError("transactional claim must not write through the plain store");
        }
    }
}
