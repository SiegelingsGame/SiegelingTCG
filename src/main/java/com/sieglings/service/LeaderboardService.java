package com.sieglings.service;

import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class LeaderboardService {

    private static final Logger logger = LoggerFactory.getLogger(LeaderboardService.class);

    public static final String BOARD_WINS = "wins";
    public static final String BOARD_MATCHES_PLAYED = "matchesPlayed";
    public static final String BOARD_SPELLS_CAST = "spellsCast";
    public static final String BOARD_TRAPS_SPRUNG = "trapsSprung";
    public static final String BOARD_SIEGELINGS_DEFEATED = "siegelingsDefeated";
    public static final String BOARD_PVP_WIN_RATE = "pvpWinRate";

    public static final String PERIOD_DAILY = "daily";
    public static final String PERIOD_WEEKLY = "weekly";
    public static final String PERIOD_MONTHLY = "monthly";
    public static final String PERIOD_YEAR = "year";
    public static final String PERIOD_ALL_TIME = "allTime";

    private static final List<String> PERIOD_ORDER = List.of(
            PERIOD_DAILY,
            PERIOD_WEEKLY,
            PERIOD_MONTHLY,
            PERIOD_YEAR,
            PERIOD_ALL_TIME
    );

    private static final int TOP_N = 10;

    @Autowired
    private MatchHistoryStore matchHistoryStore;

    @Value("${app.leaderboard.time-zone:UTC}")
    private String leaderboardTimeZoneId;

    // How long a built snapshot stays fresh before the next read rebuilds it.
    // Keeps the daily board reflecting matches played today without scanning
    // Firestore on every request. Set to 0 to disable TTL refresh (cron only).
    @Value("${app.leaderboard.refresh-ttl-ms:120000}")
    private long refreshTtlMs;

    private final AtomicReference<Map<String, Object>> snapshot = new AtomicReference<>();
    private volatile Instant lastRefresh;

    @PostConstruct
    public void warmOnStartup() {
        try {
            refreshSnapshot();
        } catch (RuntimeException ignored) {
            // Firestore may not be reachable at boot; the scheduled cron will retry.
        }
    }

    @Scheduled(cron = "${app.leaderboard.refresh-cron:0 0 7 * * *}")
    public void scheduledRefresh() {
        refreshSnapshot();
    }

    public void refreshSnapshot() {
        ZoneId zone = ZoneId.of(leaderboardTimeZoneId);
        Instant now = Instant.now();
        List<MatchHistoryEntity> matches = matchHistoryStore.findAll();

        Map<String, Map<String, List<Map<String, Object>>>> periods = new LinkedHashMap<>();
        for (String period : PERIOD_ORDER) {
            List<MatchHistoryEntity> scoped = filterMatchesForPeriod(matches, zone, period, now);
            periods.put(period, buildBoards(scoped));
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("generatedAt", now.toString());
        payload.put("timeZone", zone.getId());
        payload.put("defaultPeriod", PERIOD_DAILY);
        payload.put("periods", periods);
        // Backward compatibility: top-level boards mirror the daily period.
        payload.put("boards", periods.get(PERIOD_DAILY));
        snapshot.set(payload);
        lastRefresh = now;
    }

    public Map<String, Object> getSnapshot() {
        refreshIfStale(Instant.now());
        return snapshot.get();
    }

    private synchronized void refreshIfStale(Instant now) {
        if (snapshot.get() == null || isStale(lastRefresh, now, refreshTtlMs)) {
            try {
                refreshSnapshot();
            } catch (RuntimeException ex) {
                // A Firestore blip should cost freshness, not the whole board. Every
                // read past the TTL used to rebuild and propagate the failure, so one
                // bad scan turned a populated leaderboard into a 500 for every player.
                // Keep serving the last good snapshot and let the next read retry.
                if (snapshot.get() == null) {
                    throw ex;
                }
                logger.warn("Leaderboard refresh failed; serving the snapshot built at {}.", lastRefresh, ex);
            }
        }
    }

    static boolean isStale(Instant lastRefresh, Instant now, long ttlMs) {
        if (lastRefresh == null) {
            return true;
        }
        if (ttlMs <= 0) {
            return false;
        }
        return !now.isBefore(lastRefresh.plusMillis(ttlMs));
    }

    @SuppressWarnings("unchecked")
    public Map<String, List<Map<String, Object>>> boardsForPeriod(Map<String, Object> snapshot, String period) {
        if (snapshot == null) {
            return Map.of();
        }
        String normalized = normalizePeriod(period);
        Object periodsObj = snapshot.get("periods");
        if (periodsObj instanceof Map<?, ?> periods) {
            Object boardsObj = periods.get(normalized);
            if (boardsObj instanceof Map<?, ?> boards) {
                return (Map<String, List<Map<String, Object>>>) boards;
            }
        }
        Object legacyBoards = snapshot.get("boards");
        if (legacyBoards instanceof Map<?, ?> boards) {
            return (Map<String, List<Map<String, Object>>>) boards;
        }
        return Map.of();
    }

    public static String normalizePeriod(String period) {
        if (period == null || period.isBlank()) {
            return PERIOD_DAILY;
        }
        String key = period.trim();
        if ("all".equalsIgnoreCase(key) || "all-time".equalsIgnoreCase(key) || "alltime".equalsIgnoreCase(key)) {
            return PERIOD_ALL_TIME;
        }
        for (String candidate : PERIOD_ORDER) {
            if (candidate.equalsIgnoreCase(key)) {
                return candidate;
            }
        }
        return PERIOD_DAILY;
    }

    static List<MatchHistoryEntity> filterMatchesForPeriod(List<MatchHistoryEntity> matches,
                                                           ZoneId zone,
                                                           String period,
                                                           Instant now) {
        if (PERIOD_ALL_TIME.equals(period)) {
            return matches;
        }
        Instant start = periodStart(zone, period, now);
        return matches.stream()
                .filter(match -> {
                    Instant finishedAt = match.getFinishedAt();
                    return finishedAt != null && !finishedAt.isBefore(start);
                })
                .toList();
    }

    static Instant periodStart(ZoneId zone, String period, Instant now) {
        ZonedDateTime zdt = now.atZone(zone);
        return switch (period) {
            case PERIOD_DAILY -> zdt.toLocalDate().atStartOfDay(zone).toInstant();
            case PERIOD_WEEKLY -> zdt.toLocalDate()
                    .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                    .atStartOfDay(zone)
                    .toInstant();
            case PERIOD_MONTHLY -> zdt.withDayOfMonth(1).toLocalDate().atStartOfDay(zone).toInstant();
            case PERIOD_YEAR -> zdt.withDayOfYear(1).toLocalDate().atStartOfDay(zone).toInstant();
            default -> Instant.EPOCH;
        };
    }

    private Map<String, List<Map<String, Object>>> buildBoards(List<MatchHistoryEntity> matches) {
        Map<String, List<Map<String, Object>>> boards = new LinkedHashMap<>();
        // A wins board whose #1 has zero wins is noise, not a ranking: playing a
        // match you lost should not put you on it. Matches played keeps its zero
        // floor because every counted match contributes at least 1 by definition.
        boards.put(BOARD_WINS, buildCountBoard(matches, m -> "WIN".equalsIgnoreCase(m.getResult()) ? 1L : 0L, true));
        boards.put(BOARD_MATCHES_PLAYED, buildCountBoard(matches, m -> 1L, false));
        boards.put(BOARD_SPELLS_CAST, buildCountBoard(matches, m -> (long) m.getSpellsCast(), true));
        boards.put(BOARD_TRAPS_SPRUNG, buildCountBoard(matches, m -> (long) m.getTrapsSprung(), true));
        boards.put(BOARD_SIEGELINGS_DEFEATED, buildCountBoard(matches, m -> (long) m.getSiegelingsDefeated(), true));
        boards.put(BOARD_PVP_WIN_RATE, buildPvpBoard(matches));
        return boards;
    }

    @FunctionalInterface
    private interface MatchValue {
        long valueOf(MatchHistoryEntity match);
    }

    private List<Map<String, Object>> buildCountBoard(List<MatchHistoryEntity> matches,
                                                     MatchValue extractor,
                                                     boolean requirePositive) {
        Map<String, long[]> totals = new HashMap<>();
        Map<String, String> displayNames = new HashMap<>();
        for (MatchHistoryEntity match : matches) {
            if (match.getUserId() == null) {
                continue;
            }
            long delta = extractor.valueOf(match);
            totals.computeIfAbsent(match.getUserId(), k -> new long[1])[0] += delta;
            displayNames.putIfAbsent(match.getUserId(), match.getUserDisplayName());
        }

        List<Map.Entry<String, Long>> ranked = new ArrayList<>();
        for (Map.Entry<String, long[]> entry : totals.entrySet()) {
            long value = entry.getValue()[0];
            if (requirePositive && value <= 0) {
                continue;
            }
            ranked.add(Map.entry(entry.getKey(), value));
        }
        ranked.sort(Comparator.<Map.Entry<String, Long>>comparingLong(Map.Entry::getValue).reversed());

        List<Map<String, Object>> out = new ArrayList<>();
        int rank = 1;
        for (Map.Entry<String, Long> entry : ranked) {
            if (rank > TOP_N) {
                break;
            }
            String displayName = displayNames.getOrDefault(entry.getKey(), "?");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("rank", rank++);
            row.put("displayName", displayName == null ? "?" : displayName);
            row.put("value", entry.getValue());
            row.put("detail", null);
            out.add(row);
        }
        return out;
    }

    private List<Map<String, Object>> buildPvpBoard(List<MatchHistoryEntity> matches) {
        Map<String, long[]> tally = new HashMap<>();
        Map<String, String> displayNames = new HashMap<>();
        for (MatchHistoryEntity match : matches) {
            if (match.getUserId() == null) {
                continue;
            }
            if (!"ONLINE".equalsIgnoreCase(match.getMatchType())) {
                continue;
            }
            String result = match.getResult();
            if (!"WIN".equalsIgnoreCase(result) && !"LOSS".equalsIgnoreCase(result)) {
                continue;
            }
            long[] counts = tally.computeIfAbsent(match.getUserId(), k -> new long[2]);
            if ("WIN".equalsIgnoreCase(result)) {
                counts[0]++;
            } else {
                counts[1]++;
            }
            displayNames.putIfAbsent(match.getUserId(), match.getUserDisplayName());
        }

        record PvpRow(String userId, long wins, long losses, double rate) {}
        List<PvpRow> rows = new ArrayList<>();
        for (Map.Entry<String, long[]> entry : tally.entrySet()) {
            long wins = entry.getValue()[0];
            long losses = entry.getValue()[1];
            long decided = wins + losses;
            if (decided == 0) {
                continue;
            }
            double rate = (double) wins / (double) decided;
            rows.add(new PvpRow(entry.getKey(), wins, losses, rate));
        }
        rows.sort(Comparator.<PvpRow>comparingDouble(PvpRow::rate)
                .thenComparingLong(PvpRow::wins)
                .reversed());

        List<Map<String, Object>> out = new ArrayList<>();
        int rank = 1;
        for (PvpRow row : rows) {
            if (rank > TOP_N) {
                break;
            }
            String displayName = displayNames.getOrDefault(row.userId(), "?");
            String detail = String.format(Locale.US, "%d/%d %.2f%%", row.wins(), row.losses(), row.rate() * 100.0);
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("rank", rank++);
            entry.put("displayName", displayName == null ? "?" : displayName);
            entry.put("value", row.wins() + row.losses());
            entry.put("detail", detail);
            out.add(entry);
        }
        return out;
    }
}
