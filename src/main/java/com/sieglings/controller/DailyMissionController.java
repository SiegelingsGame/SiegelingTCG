package com.sieglings.controller;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import com.sieglings.service.DailyMissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class DailyMissionController {

    @Autowired
    private AccountService accountService;

    @Autowired
    private DailyMissionService dailyMissionService;

    @GetMapping("/api/missions/daily")
    public Map<String, Object> daily(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AccountUser user = accountService.requireUser(authorizationHeader);
        return dailyMissionService.getDailySnapshot(user);
    }

    @PostMapping("/api/missions/claim")
    public Map<String, Object> claim(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                     @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            String missionId = req == null ? null : String.valueOf(req.getOrDefault("missionId", "")).trim();
            if (missionId.isEmpty()) {
                return Map.of("error", "missionId is required.");
            }
            return dailyMissionService.claimMission(user, missionId);
        } catch (IllegalArgumentException ex) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", ex.getMessage());
            return error;
        }
    }

    @PostMapping("/api/missions/claim-login")
    public Map<String, Object> claimLogin(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            return dailyMissionService.claimLoginReward(user);
        } catch (IllegalArgumentException ex) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", ex.getMessage());
            return error;
        }
    }
}
