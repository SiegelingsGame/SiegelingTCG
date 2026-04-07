package com.sieglings.service;

import com.sieglings.persistence.repo.MatchHistoryRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
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

    @Autowired
    private MatchHistoryRepository matchHistoryRepository;

    @Value("${app.leaderboard.time-zone:UTC}")
    private String leaderboardTimeZoneId;

    private final AtomicReference<Map<String, Object>> snapshot = new AtomicReference<>();

    @PostConstruct
    public void warmOnStartup() {
        refreshSnapshot();
    }

    @Scheduled(cron = "${app.leaderboard.refresh-cron:0 0 7 * * *}")
    public void scheduledRefresh() {
        refreshSnapshot();
    }

    public void refreshSnapshot() {
        ZoneId zone = ZoneId.of(leaderboardTimeZoneId);
        Instant now = Instant.now();
        Map<String, List<Map<String, Object>>> boards = new LinkedHashMap<>();
        boards.put(BOARD_WINS, mapCountRows(matchHistoryRepository.leaderboardWins()));
        boards.put(BOARD_MATCHES_PLAYED, mapCountRows(matchHistoryRepository.leaderboardMatchesPlayed()));
        boards.put(BOARD_SPELLS_CAST, mapCountRows(matchHistoryRepository.leaderboardSpellsCast()));
        boards.put(BOARD_TRAPS_SPRUNG, mapCountRows(matchHistoryRepository.leaderboardTrapsSprung()));
        boards.put(BOARD_SIEGELINGS_DEFEATED, mapCountRows(matchHistoryRepository.leaderboardSiegelingsDefeated()));
        boards.put(BOARD_PVP_WIN_RATE, mapPvpRows(matchHistoryRepository.leaderboardPvpWinRate()));

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

    private List<Map<String, Object>> mapCountRows(List<Object[]> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        int rank = 1;
        for (Object[] row : rows) {
            if (row == null || row.length < 2) {
                continue;
            }
            String displayName = row[0] == null ? "?" : String.valueOf(row[0]);
            long value = ((Number) row[1]).longValue();
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("rank", rank++);
            entry.put("displayName", displayName);
            entry.put("value", value);
            entry.put("detail", null);
            out.add(entry);
        }
        return out;
    }

    private List<Map<String, Object>> mapPvpRows(List<Object[]> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        int rank = 1;
        for (Object[] row : rows) {
            if (row == null || row.length < 3) {
                continue;
            }
            String displayName = row[0] == null ? "?" : String.valueOf(row[0]);
            long wins = ((Number) row[1]).longValue();
            long losses = ((Number) row[2]).longValue();
            long decided = wins + losses;
            double pct = decided == 0 ? 0.0 : (100.0 * wins) / decided;
            String detail = String.format(Locale.US, "%d/%d %.2f%%", wins, losses, pct);
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("rank", rank++);
            entry.put("displayName", displayName);
            entry.put("value", decided);
            entry.put("detail", detail);
            out.add(entry);
        }
        return out;
    }
}
