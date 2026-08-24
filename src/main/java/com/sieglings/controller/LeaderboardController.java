package com.sieglings.controller;

import com.sieglings.service.LeaderboardService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class LeaderboardController {

    @Autowired
    private LeaderboardService leaderboardService;

    @GetMapping("/api/leaderboards")
    public ResponseEntity<Map<String, Object>> getLeaderboards(
            @RequestParam(value = "period", required = false) String period) {
        Map<String, Object> snapshot;
        try {
            snapshot = leaderboardService.getSnapshot();
        } catch (RuntimeException ex) {
            // A cold instance has no snapshot to fall back on, so the first scan
            // failing used to surface as a bare 500 ("Internal Server Error" in the
            // hub banner). Say what is actually happening instead — the client
            // renders this text next to its Retry button.
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Leaderboards are warming up. Try again in a moment.", "warming", true));
        }
        if (period == null || period.isBlank()) {
            return ResponseEntity.ok(snapshot);
        }
        String normalized = LeaderboardService.normalizePeriod(period);
        Map<String, Object> scoped = new LinkedHashMap<>(snapshot);
        scoped.put("period", normalized);
        scoped.put("boards", leaderboardService.boardsForPeriod(snapshot, normalized));
        return ResponseEntity.ok(scoped);
    }
}
