package com.sieglings.service;

import com.sieglings.persistence.entity.MatchHistoryEntity;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

    private static MatchHistoryEntity matchFinishedAt(Instant finishedAt) {
        MatchHistoryEntity match = new MatchHistoryEntity();
        match.setUserId("player@example.com");
        match.setFinishedAt(finishedAt);
        match.setResult("WIN");
        return match;
    }
}
