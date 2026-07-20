package com.sieglings.service;

import com.sieglings.mission.DailyMissionType;
import com.sieglings.mission.MissionPeriod;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.DailyMissionProgressEntity;
import com.sieglings.persistence.entity.MatchHistoryEntity;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DailyMissionServiceTest {

    private FakeMissionProgressStore missionStore;
    private FakeProgressionStore progressionStore;
    private DailyMissionService service;

    @BeforeEach
    void setUp() throws Exception {
        missionStore = new FakeMissionProgressStore();
        progressionStore = new FakeProgressionStore();
        service = new DailyMissionService();
        setField(service, "progressStore", missionStore);
        setField(service, "playerProgressionStore", progressionStore);
        setField(service, "missionTimeZoneId", "UTC");
    }

    @Test
    void recordMatchIncrementsPvpWinAndSiegecoins() {
        MatchHistoryEntity history = match("ONLINE", "WIN", 5, 2, 4);
        service.recordMatch(history, 7);

        DailyMissionProgressEntity saved = missionStore.saved;
        assertEquals(1, saved.counter(DailyMissionType.PVP_WINS));
        assertEquals(7, saved.counter(DailyMissionType.SIEGECOINS_EARNED));
        assertEquals(5, saved.counter(DailyMissionType.SPELLS_CAST));
        assertEquals(2, saved.counter(DailyMissionType.TRAPS_SPRUNG));
        assertEquals(4, saved.counter(DailyMissionType.SIEGELINGS_DEFEATED));
        assertEquals(1, saved.counter(DailyMissionType.MATCHES_PLAYED));
    }

    @Test
    void recordPackOpenedIncrementsPackCounter() {
        service.recordPackOpened("player@example.com");
        assertEquals(1, missionStore.saved.counter(DailyMissionType.PACK_OPENS));
    }

    @Test
    void claimMissionGrantsGoldOnce() {
        AccountUser user = user();
        progressionStore.saved = progression(user.getId(), 200);
        missionStore.saved = progressForToday(user.getId());
        missionStore.saved.addCounter(DailyMissionType.PVP_WINS, 3);

        Map<String, Object> claim = service.claimMission(user, "pvp-wins-3");

        assertEquals(350, claim.get("gold"));
        assertTrue(missionStore.saved.getClaimedMissionIds().contains("pvp-wins-3"));
        assertThrows(IllegalArgumentException.class, () -> service.claimMission(user, "pvp-wins-3"));
    }

    @Test
    void recordSiegeIncrementsAllScopes() {
        service.recordSiege("player@example.com", true, 3, 12, 90);

        DailyMissionProgressEntity saved = missionStore.saved;
        assertEquals(1, saved.counter(MissionPeriod.DAILY, DailyMissionType.SIEGE_RUNS));
        assertEquals(1, saved.counter(MissionPeriod.WEEKLY, DailyMissionType.SIEGE_WINS));
        assertEquals(3, saved.counter(MissionPeriod.LIFETIME, DailyMissionType.SIEGE_BOSS_KILLS));
        assertEquals(12, saved.counter(MissionPeriod.LIFETIME, DailyMissionType.SIEGE_NODES_CLEARED));
        assertEquals(90, saved.counter(MissionPeriod.WEEKLY, DailyMissionType.SIEGECOINS_EARNED));
    }

    @Test
    void claimLoginRewardGrantsOncePerDayAndTracksStreak() {
        AccountUser user = user();
        progressionStore.saved = progression(user.getId(), 200);
        missionStore.saved = progressForToday(user.getId());

        Map<String, Object> claim = service.claimLoginReward(user);
        assertEquals(300, claim.get("gold"));
        assertEquals(1, claim.get("streak"));
        assertThrows(IllegalArgumentException.class, () -> service.claimLoginReward(user));
    }

    @Test
    void claimWeeklyMissionGrantsGoldOnce() {
        AccountUser user = user();
        progressionStore.saved = progression(user.getId(), 100);
        missionStore.saved = progressForToday(user.getId());
        missionStore.saved.addCounter(MissionPeriod.WEEKLY, DailyMissionType.PVP_WINS, 10);

        Map<String, Object> claim = service.claimMission(user, "weekly-pvp-10");
        assertEquals(600, claim.get("gold"));
        assertTrue(missionStore.saved.getClaimedWeeklyIds().contains("weekly-pvp-10"));
        assertThrows(IllegalArgumentException.class, () -> service.claimMission(user, "weekly-pvp-10"));
    }

    @Test
    void dailySnapshotMarksFeaturedMissionsComplete() {
        AccountUser user = user();
        missionStore.saved = progressForToday(user.getId());
        missionStore.saved.addCounter(DailyMissionType.PACK_OPENS, 2);
        missionStore.saved.addCounter(DailyMissionType.SIEGECOINS_EARNED, 400);

        Map<String, Object> snapshot = service.getDailySnapshot(user);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> featured = (List<Map<String, Object>>) snapshot.get("featured");
        Map<String, Object> packMission = featured.stream()
                .filter(m -> "pack-opens-2".equals(m.get("id")))
                .findFirst()
                .orElseThrow();
        assertTrue((Boolean) packMission.get("completed"));
        assertTrue((Boolean) packMission.get("claimable"));
        assertFalse(featured.stream().anyMatch(m -> "pvp-wins-3".equals(m.get("id")) && Boolean.TRUE.equals(m.get("completed"))));
    }

    private static MatchHistoryEntity match(String type, String result, int spells, int traps, int siegelings) {
        MatchHistoryEntity history = new MatchHistoryEntity();
        history.setUserId("player@example.com");
        history.setMatchType(type);
        history.setResult(result);
        history.setSpellsCast(spells);
        history.setTrapsSprung(traps);
        history.setSiegelingsDefeated(siegelings);
        return history;
    }

    private static DailyMissionProgressEntity progressForToday(String userId) {
        DailyMissionProgressEntity progress = new DailyMissionProgressEntity();
        progress.setUserId(userId);
        java.time.LocalDate today = Instant.now().atZone(ZoneId.of("UTC")).toLocalDate();
        progress.setDateKey(today.format(DateTimeFormatter.ISO_LOCAL_DATE));
        progress.setWeekKey(String.format(java.util.Locale.ROOT, "%d-W%02d",
                today.get(java.time.temporal.IsoFields.WEEK_BASED_YEAR),
                today.get(java.time.temporal.IsoFields.WEEK_OF_WEEK_BASED_YEAR)));
        progress.setCounters(new LinkedHashMap<>());
        progress.setClaimedMissionIds(new ArrayList<>());
        return progress;
    }

    private static PlayerProgressionEntity progression(String userId, int gold) {
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId(userId);
        progression.setGold(gold);
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

    private static final class FakeMissionProgressStore extends DailyMissionProgressStore {
        DailyMissionProgressEntity saved;

        @Override
        public Optional<DailyMissionProgressEntity> findByUserId(String userId) {
            return Optional.ofNullable(saved);
        }

        @Override
        public DailyMissionProgressEntity save(DailyMissionProgressEntity progress) {
            saved = progress;
            return progress;
        }
    }

    private static final class FakeProgressionStore extends PlayerProgressionStore {
        PlayerProgressionEntity saved;

        @Override
        public Optional<PlayerProgressionEntity> findByUserId(String userId) {
            return Optional.ofNullable(saved);
        }

        @Override
        public PlayerProgressionEntity save(PlayerProgressionEntity progression) {
            saved = progression;
            return progression;
        }
    }
}
