package com.sieglings.controller;

import com.sieglings.service.LeaderboardService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class LeaderboardController {

    @Autowired
    private LeaderboardService leaderboardService;

    @GetMapping("/api/leaderboards")
    public Map<String, Object> getLeaderboards() {
        return leaderboardService.getSnapshot();
    }
}
