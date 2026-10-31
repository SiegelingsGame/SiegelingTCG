package com.sieglings.adventure;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The Weekly Challenge is a seeded Endless run everybody plays with the same
 * pre-built team, so two runs started the same week must open on the same team,
 * the same map and the same Land, and keep a save slot of their own.
 */
@SpringBootTest
class SiegeWeeklyChallengeTest {

    @Autowired
    private SiegeService siegeService;

    @Test
    void weeksAreIsoWeeksInUtc() {
        assertEquals("2026-W44", SiegeService.weekId(Instant.parse("2026-10-31T23:59:00Z")));
        assertEquals("2026-W45", SiegeService.weekId(Instant.parse("2026-11-02T00:00:00Z")));
        assertEquals(Instant.parse("2026-11-02T00:00:00Z"), SiegeService.weekEndsAt(Instant.parse("2026-10-31T12:00:00Z")));
        assertNotEquals(SiegeService.weeklySeed("2026-W44"), SiegeService.weeklySeed("2026-W45"));
    }

    @Test
    void theWeeksTeamIsFixed() {
        SiegeService.WeeklyTeam a = siegeService.weeklyTeam("2026-W44");
        SiegeService.WeeklyTeam b = siegeService.weeklyTeam("2026-W44");
        assertEquals(a.knight().getId(), b.knight().getId());
        assertEquals(ids(a), ids(b));
        assertEquals(SiegeService.WEEKLY_TEAM_SIZE, a.sieglings().size());
        assertEquals(SiegeService.WEEKLY_TEAM_SIZE, ids(a).stream().distinct().count(), "no Siegeling twice");
    }

    @Test
    @SuppressWarnings("unchecked")
    void twoChallengeRunsOpenOnTheSameMapLandAndTeam() {
        Map<String, Object> first = siegeService.newWeeklyRun(null);
        Map<String, Object> second = siegeService.newWeeklyRun(null);

        assertNotEquals(first.get("token"), second.get("token"));
        assertEquals("ENDLESS", first.get("mode"));
        assertEquals("CHALLENGE", first.get("slot"));
        assertNotNull(first.get("challengeWeek"));
        assertEquals(first.get("seed"), second.get("seed"));
        assertEquals(mapShape((List<Map<String, Object>>) first.get("map")),
                mapShape((List<Map<String, Object>>) second.get("map")), "same seed, same map");
        assertEquals(((Map<String, Object>) first.get("land")).get("id"),
                ((Map<String, Object>) second.get("land")).get("id"), "same seed, same first Land");
        assertEquals(partyIds(first), partyIds(second));
    }

    @Test
    void theChallengeKeepsItsOwnSlot() {
        SiegeRun run = new SiegeRun("t");
        run.setMode(RunMode.ENDLESS);
        assertEquals(RunSlot.ENDLESS, RunSlot.of(run));
        run.setChallengeWeek("2026-W44");
        assertEquals(RunSlot.CHALLENGE, RunSlot.of(run));
    }

    @Test
    @SuppressWarnings("unchecked")
    void endingAfterABossPostsTheScoreAndDoesNotBankTheTeam() {
        Map<String, Object> started = siegeService.newWeeklyRun(null);
        String token = (String) started.get("token");
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        run.setBossKills(1);

        Map<String, Object> ended = siegeService.extract(token, null);

        assertEquals("WON", ended.get("status"));
        assertNull(ended.get("extraction"), "the assigned team is not a veteran squad");
        assertFalse(run.isVeteranExtracted());
        Map<String, Object> rewards = (Map<String, Object>) ended.get("endRewards");
        assertEquals(Boolean.TRUE, rewards.get("weekly"));
        assertEquals(0, ((Number) rewards.get("gold")).intValue());
        assertTrue(String.valueOf(ended.get("lastReward")).startsWith("Weekly Challenge ended"));
    }

    @Test
    void theWeeklyFeedNamesTheTeamAndTheClose() {
        Map<String, Object> feed = siegeService.weeklyChallenge(null);
        assertEquals(SiegeService.weekId(Instant.now()), feed.get("week"));
        assertNotNull(feed.get("endsAt"));
        assertTrue(feed.get("knight") instanceof Map);
        assertEquals(SiegeService.WEEKLY_TEAM_SIZE, ((List<?>) feed.get("team")).size());
        assertTrue(feed.get("leaderboard") instanceof List);
    }

    private static List<String> ids(SiegeService.WeeklyTeam team) {
        return team.sieglings().stream().map(s -> s.getId()).toList();
    }

    private static List<String> mapShape(List<Map<String, Object>> map) {
        return map.stream().map(n -> n.get("id") + ":" + n.get("type") + ":" + n.get("row") + ":" + n.get("col")).toList();
    }

    @SuppressWarnings("unchecked")
    private static List<Object> partyIds(Map<String, Object> run) {
        return ((List<Map<String, Object>>) run.get("party")).stream().map(m -> m.get("sourceCardId")).toList();
    }
}
