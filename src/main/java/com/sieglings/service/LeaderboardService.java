package com.sieglings.service;

import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
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

    public static final String BOARD_WINS = "wins";
    public static final String BOARD_MATCHES_PLAYED = "matchesPlayed";
    public static final String BOARD_SPELLS_CAST = "spellsCast";
    public static final String BOARD_TRAPS_SPRUNG = "trapsSprung";
    public static final String BOARD_SIEGELINGS_DEFEATED = "siegelingsDefeated";
    public static final String BOARD_PVP_WIN_RATE = "pvpWinRate";

    private static final int TOP_N = 10;

    @Autowired
    private MatchHistoryStore matchHistoryStore;

    @Value("${app.leaderboard.time-zone:UTC}")
    private String leaderboardTimeZoneId;

    private final AtomicReference<Map<String, Object>> snapshot = new AtomicReference<>();

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

        Map<String, List<Map<String, Object>>> boards = new LinkedHashMap<>();
        boards.put(BOARD_WINS, buildCountBoard(matches, m -> "WIN".equalsIgnoreCase(m.getResult()) ? 1L : 0L, false));
        boards.put(BOARD_MATCHES_PLAYED, buildCountBoard(matches, m -> 1L, false));
        boards.put(BOARD_SPELLS_CAST, buildCountBoard(matches, m -> (long) m.getSpellsCast(), true));
        boards.put(BOARD_TRAPS_SPRUNG, buildCountBoard(matches, m -> (long) m.getTrapsSprung(), true));
        boards.put(BOARD_SIEGELINGS_DEFEATED, buildCountBoard(matches, m -> (long) m.getSiegelingsDefeated(), true));
        boards.put(BOARD_PVP_WIN_RATE, buildPvpBoard(matches));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("generatedAt", now.toString());
        payload.put("timeZone", zone.getId());
        payload.put("boards", boards);
        snapshot.set(payload);
    }

    public Map<String, Object> getSnapshot() {
        Map<String, Object> current = snapshot.get();
        if (current == null) {
            refreshSnapshot();
            current = snapshot.get();
        }
        return current;
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
