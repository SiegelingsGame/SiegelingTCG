package com.sieglings.controller;

import com.sieglings.service.LeaderboardService;
import org.springframework.beans.factory.annotation.Autowired;
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
    public Map<String, Object> getLeaderboards(@RequestParam(value = "period", required = false) String period) {
        Map<String, Object> snapshot = leaderboardService.getSnapshot();
        if (period == null || period.isBlank()) {
            return snapshot;
        }
        String normalized = LeaderboardService.normalizePeriod(period);
        Map<String, Object> scoped = new LinkedHashMap<>(snapshot);
        scoped.put("period", normalized);
        scoped.put("boards", leaderboardService.boardsForPeriod(snapshot, normalized));
        return scoped;
    }
}
