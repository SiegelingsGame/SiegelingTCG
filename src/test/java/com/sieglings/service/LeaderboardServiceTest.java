package com.sieglings.service;

import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LeaderboardServiceTest {

    @Test
    void filterMatchesForPeriod_dailyOnlyIncludesTodayInZone() {
        ZoneId zone = ZoneId.of("UTC");
        ZonedDateTime todayMorning = ZonedDateTime.of(2026, 5, 27, 10, 0, 0, 0, zone);
        Instant now = todayMorning.plusHours(6).toInstant();

        MatchHistoryEntity todayMatch = matchFinishedAt(todayMorning.plusHours(1).toInstant());
        MatchHistoryEntity yesterdayMatch = matchFinishedAt(todayMorning.minusDays(1).toInstant());

        List<MatchHistoryEntity> daily = LeaderboardService.filterMatchesForPeriod(
                List.of(todayMatch, yesterdayMatch),
                zone,
                LeaderboardService.PERIOD_DAILY,
                now
        );

        assertEquals(1, daily.size());
        assertEquals(todayMatch.getFinishedAt(), daily.get(0).getFinishedAt());
    }

    @Test
    void filterMatchesForPeriod_allTimeIncludesEveryMatch() {
        ZoneId zone = ZoneId.of("UTC");
        Instant now = Instant.parse("2026-05-27T12:00:00Z");
        List<MatchHistoryEntity> matches = List.of(
                matchFinishedAt(Instant.parse("2020-01-01T00:00:00Z")),
                matchFinishedAt(Instant.parse("2026-05-27T11:00:00Z"))
        );

        List<MatchHistoryEntity> allTime = LeaderboardService.filterMatchesForPeriod(
                matches,
                zone,
                LeaderboardService.PERIOD_ALL_TIME,
                now
        );

        assertEquals(2, allTime.size());
    }

    @Test
    void normalizePeriod_acceptsCommonAliases() {
        assertEquals(LeaderboardService.PERIOD_ALL_TIME, LeaderboardService.normalizePeriod("all"));
        assertEquals(LeaderboardService.PERIOD_WEEKLY, LeaderboardService.normalizePeriod("WEEKLY"));
        assertEquals(LeaderboardService.PERIOD_DAILY, LeaderboardService.normalizePeriod(null));
    }

    @Test
    void periodStart_weeklyBeginsOnMonday() {
        ZoneId zone = ZoneId.of("UTC");
        Instant wednesday = Instant.parse("2026-05-27T15:00:00Z");
        Instant start = LeaderboardService.periodStart(zone, LeaderboardService.PERIOD_WEEKLY, wednesday);
        assertEquals(Instant.parse("2026-05-25T00:00:00Z"), start);
    }

    @Test
    void periodStart_yearBeginsOnJanuaryFirst() {
        ZoneId zone = ZoneId.of("UTC");
        Instant midYear = Instant.parse("2026-07-04T12:00:00Z");
        Instant start = LeaderboardService.periodStart(zone, LeaderboardService.PERIOD_YEAR, midYear);
        assertTrue(start.isBefore(midYear));
        assertEquals(Instant.parse("2026-01-01T00:00:00Z"), start);
    }

    @Test
    void isStale_rebuildsWhenNeverBuiltOrPastTtl() {
        Instant now = Instant.parse("2026-05-31T16:28:00Z");

        // Never built yet -> always stale.
        assertTrue(LeaderboardService.isStale(null, now, 120_000L));

        // Within the TTL window -> still fresh.
        assertFalse(LeaderboardService.isStale(now.minusMillis(30_000L), now, 120_000L));

        // Past the TTL window -> stale so today's matches get picked up.
        assertTrue(LeaderboardService.isStale(now.minusMillis(180_000L), now, 120_000L));

        // TTL disabled -> never stale once a snapshot exists.
        assertFalse(LeaderboardService.isStale(now.minusMillis(180_000L), now, 0L));
    }

    @Test
    @SuppressWarnings("unchecked")
    void snapshotAggregatesAnAllTimeBoardFromEveryStoredMatch() throws Exception {
        // Old matches only ever land in the all-time (and year) buckets, so a board
        // that aggregates correctly for today can still be empty for all time. This
        // drives the real refresh so the payload shape the hub reads is covered.
        StubMatchHistoryStore store = new StubMatchHistoryStore(List.of(
                match("roc", "Roc", Instant.parse("2020-03-04T12:00:00Z"), "WIN", "SOLO", 3, 1, 5),
                match("roc", "Roc", Instant.parse("2020-03-05T12:00:00Z"), "LOSS", "SOLO", 2, 0, 4),
                match("lawz", "lawz67", Instant.parse("2019-11-02T12:00:00Z"), "WIN", "SOLO", 1, 0, 2)
        ));
        LeaderboardService service = serviceBackedBy(store);

        service.refreshSnapshot();
        Map<String, Object> snapshot = service.getSnapshot();
        Map<String, List<Map<String, Object>>> allTime =
                service.boardsForPeriod(snapshot, LeaderboardService.PERIOD_ALL_TIME);

        List<Map<String, Object>> wins = allTime.get(LeaderboardService.BOARD_WINS);
        assertEquals(2, wins.size());
        assertEquals("Roc", wins.get(0).get("displayName"));
        assertEquals(1, wins.get(0).get("rank"));
        assertEquals(1L, wins.get(0).get("value"));

        assertEquals(2L, allTime.get(LeaderboardService.BOARD_MATCHES_PLAYED).get(0).get("value"));
        assertEquals(5L, allTime.get(LeaderboardService.BOARD_SPELLS_CAST).get(0).get("value"));
        assertEquals(9L, allTime.get(LeaderboardService.BOARD_SIEGELINGS_DEFEATED).get(0).get("value"));

        // Every period key the hub's tabs ask for must exist, even when empty —
        // a missing key renders as "no results" with no way to tell it apart.
        Map<String, Object> periods = (Map<String, Object>) snapshot.get("periods");
        assertTrue(periods.keySet().containsAll(List.of("daily", "weekly", "monthly", "year", "allTime")));
        assertTrue(((Map<String, List<?>>) periods.get("daily")).get(LeaderboardService.BOARD_WINS).isEmpty());
    }

    @Test
    void winsBoardExcludesPlayersWhoHaveNotWon() throws Exception {
        StubMatchHistoryStore store = new StubMatchHistoryStore(List.of(
                match("loser", "Loser", Instant.parse("2020-03-04T12:00:00Z"), "LOSS", "SOLO", 0, 0, 0)
        ));
        LeaderboardService service = serviceBackedBy(store);

        service.refreshSnapshot();
        Map<String, List<Map<String, Object>>> allTime =
                service.boardsForPeriod(service.getSnapshot(), LeaderboardService.PERIOD_ALL_TIME);

        assertTrue(allTime.get(LeaderboardService.BOARD_WINS).isEmpty());
        // The match still counts as played — only the wins board requires a win.
        assertEquals(1, allTime.get(LeaderboardService.BOARD_MATCHES_PLAYED).size());
    }

    @Test
    void failedRefreshKeepsServingTheLastGoodSnapshot() throws Exception {
        StubMatchHistoryStore store = new StubMatchHistoryStore(List.of(
                match("roc", "Roc", Instant.parse("2020-03-04T12:00:00Z"), "WIN", "SOLO", 0, 0, 0)
        ));
        LeaderboardService service = serviceBackedBy(store);
        service.refreshSnapshot();

        store.failing = true;
        setField(service, "refreshTtlMs", 0L);
        Map<String, List<Map<String, Object>>> allTime =
                service.boardsForPeriod(service.getSnapshot(), LeaderboardService.PERIOD_ALL_TIME);

        assertEquals(1, allTime.get(LeaderboardService.BOARD_WINS).size());
        assertEquals("Roc", allTime.get(LeaderboardService.BOARD_WINS).get(0).get("displayName"));
    }

    private static LeaderboardService serviceBackedBy(MatchHistoryStore store) throws Exception {
        LeaderboardService service = new LeaderboardService();
        setField(service, "matchHistoryStore", store);
        setField(service, "leaderboardTimeZoneId", "UTC");
        setField(service, "refreshTtlMs", 120_000L);
        return service;
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = LeaderboardService.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static MatchHistoryEntity match(String userId,
                                            String displayName,
                                            Instant finishedAt,
                                            String result,
                                            String matchType,
                                            int spellsCast,
                                            int trapsSprung,
                                            int siegelingsDefeated) {
        MatchHistoryEntity match = new MatchHistoryEntity();
        match.setUserId(userId);
        match.setUserDisplayName(displayName);
        match.setFinishedAt(finishedAt);
        match.setResult(result);
        match.setMatchType(matchType);
        match.setSpellsCast(spellsCast);
        match.setTrapsSprung(trapsSprung);
        match.setSiegelingsDefeated(siegelingsDefeated);
        return match;
    }

    private static final class StubMatchHistoryStore extends MatchHistoryStore {
        private final List<MatchHistoryEntity> matches;
        private boolean failing;

        private StubMatchHistoryStore(List<MatchHistoryEntity> matches) {
            this.matches = matches;
        }

        @Override
        public List<MatchHistoryEntity> findAll() {
            if (failing) {
                throw new IllegalStateException("Unable to scan match history from Firestore.");
            }
            return matches;
        }
    }

    private static MatchHistoryEntity matchFinishedAt(Instant finishedAt) {
        MatchHistoryEntity match = new MatchHistoryEntity();
        match.setUserId("player@example.com");
        match.setFinishedAt(finishedAt);
        match.setResult("WIN");
        return match;
    }
}
