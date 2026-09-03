package com.sieglings.service;

import com.sieglings.mission.DailyMissionType;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.DailyMissionProgressEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.DailyMissionProgressStore;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Every claim path is a read-modify-write spanning two stores: load progress,
 * check the already-claimed marker, save it, then credit the wallet. Without
 * per-user serialization two concurrent requests both read a pre-claim snapshot,
 * both pass the check, and both pay — the ledger shows one claim while the wallet
 * receives two, which a double-tap on the claim button is enough to trigger.
 *
 * <p>The fake store below rebuilds a detached entity on every read, exactly as the
 * Firestore store's {@code toEntity} does, and sleeps inside the read to hold the
 * window open the way a network round trip would. Removing the locking in
 * {@link DailyMissionService} makes every case here pay twice.
 */
class DailyMissionClaimConcurrencyTest {

    private ConcurrentMissionStore missionStore;
    private ConcurrentProgressionStore progressionStore;
    private DailyMissionService service;

    @BeforeEach
    void setUp() throws Exception {
        missionStore = new ConcurrentMissionStore();
        progressionStore = new ConcurrentProgressionStore();
        service = new DailyMissionService();
        setField(service, "progressStore", missionStore);
        setField(service, "playerProgressionStore", progressionStore);
        setField(service, "missionTimeZoneId", "UTC");

        missionStore.state = progressForToday("player@example.com");
        progressionStore.state = new PlayerProgressionEntity();
        progressionStore.state.setUserId("player@example.com");
        progressionStore.state.setGold(0);
    }

    @Test
    void concurrentChestClaimsPayExactlyOnce() throws Exception {
        missionStore.state.setDailyPoints(100);

        int granted = raceTwice(() -> service.claimChest(user(), "daily", 40));

        assertEquals(1, granted, "only one of two concurrent chest claims may succeed");
        assertEquals(150, progressionStore.state.getGold());
        assertEquals(40, progressionStore.state.getRemnants());
        assertEquals(1, missionStore.state.getClaimedDailyChests().size());
    }

    @Test
    void concurrentKnightClaimsPayExactlyOnce() throws Exception {
        // 100 (L1->2) + 150 (L2->3) = 250 points reaches level 3.
        missionStore.state.setKnightPoints(260);

        int granted = raceTwice(() -> service.claimKnightLevels(user()));

        assertEquals(1, granted, "only one of two concurrent Knight Level claims may succeed");
        assertEquals(650, progressionStore.state.getGold());
        assertEquals(275, progressionStore.state.getRemnants());
        assertEquals(3, missionStore.state.getClaimedKnightLevel());
    }

    @Test
    void concurrentMissionClaimsPayExactlyOnce() throws Exception {
        missionStore.state.addCounter(DailyMissionType.PVP_WINS, 3);

        int granted = raceTwice(() -> service.claimMission(user(), "pvp-wins-3"));

        assertEquals(1, granted, "only one of two concurrent mission claims may succeed");
        assertEquals(150, progressionStore.state.getGold());
    }

    @Test
    void concurrentLoginClaimsPayExactlyOnce() throws Exception {
        int granted = raceTwice(() -> service.claimLoginReward(user()));

        assertEquals(1, granted, "only one of two concurrent login claims may succeed");
        assertEquals(DailyMissionService.DAILY_LOGIN_REWARD, progressionStore.state.getGold());
        assertEquals(1, missionStore.state.getLoginStreak());
    }

    /** Fires {@code claim} on two threads released together; returns how many were paid. */
    private int raceTwice(Runnable claim) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger granted = new AtomicInteger();
        Runnable attempt = () -> {
            try {
                start.await();
                claim.run();
                granted.incrementAndGet();
            } catch (IllegalArgumentException expected) {
                // the loser of the race is rejected, which is the point
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
        };
        Thread a = new Thread(attempt);
        Thread b = new Thread(attempt);
        a.start();
        b.start();
        start.countDown();
        a.join(10_000);
        b.join(10_000);
        return granted.get();
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

    /** Detached copy per read plus a deliberate delay, mirroring the Firestore store. */
    private static final class ConcurrentMissionStore extends DailyMissionProgressStore {
        volatile DailyMissionProgressEntity state;

        @Override
        public Optional<DailyMissionProgressEntity> findByUserId(String userId) {
            DailyMissionProgressEntity snapshot = state;
            if (snapshot == null) {
                return Optional.empty();
            }
            DailyMissionProgressEntity copy = new DailyMissionProgressEntity();
            copy.setUserId(snapshot.getUserId());
            copy.setDateKey(snapshot.getDateKey());
            copy.setWeekKey(snapshot.getWeekKey());
            copy.setCounters(snapshot.getCounters());
            copy.setClaimedMissionIds(snapshot.getClaimedMissionIds());
            copy.setDailyPoints(snapshot.getDailyPoints());
            copy.setClaimedDailyChests(new ArrayList<>(snapshot.getClaimedDailyChests()));
            copy.setWeeklyCounters(snapshot.getWeeklyCounters());
            copy.setClaimedWeeklyIds(snapshot.getClaimedWeeklyIds());
            copy.setWeeklyPoints(snapshot.getWeeklyPoints());
            copy.setClaimedWeeklyChests(new ArrayList<>(snapshot.getClaimedWeeklyChests()));
            copy.setLifetimeCounters(snapshot.getLifetimeCounters());
            copy.setClaimedLifetimeIds(snapshot.getClaimedLifetimeIds());
            copy.setKnightPoints(snapshot.getKnightPoints());
            copy.setClaimedKnightLevel(snapshot.getClaimedKnightLevel());
            copy.setLastLoginClaimKey(snapshot.getLastLoginClaimKey());
            copy.setLoginStreak(snapshot.getLoginStreak());
            try {
                TimeUnit.MILLISECONDS.sleep(40);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
            return Optional.of(copy);
        }

        @Override
        public DailyMissionProgressEntity save(DailyMissionProgressEntity progress) {
            state = progress;
            return progress;
        }
    }

    private static final class ConcurrentProgressionStore extends PlayerProgressionStore {
        volatile PlayerProgressionEntity state;

        @Override
        public Optional<PlayerProgressionEntity> findByUserId(String userId) {
            return Optional.ofNullable(state);
        }

        @Override
        public PlayerProgressionEntity save(PlayerProgressionEntity progression) {
            state = progression;
            return progression;
        }
    }
}
