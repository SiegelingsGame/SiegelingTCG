package com.sieglings.controller;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import com.sieglings.service.DailyMissionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger LOGGER = LoggerFactory.getLogger(DailyMissionController.class);

    @Autowired
    private AccountService accountService;

    @Autowired
    private DailyMissionService dailyMissionService;

    @GetMapping("/api/missions/daily")
    public Map<String, Object> daily(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        // Matches the claim endpoints: a signed-out caller gets the same
        // {"error": ...} envelope the client already handles, rather than the
        // bare 500 an uncaught requireUser produced.
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            return dailyMissionService.getDailySnapshot(user);
        } catch (IllegalArgumentException ex) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", ex.getMessage());
            return error;
        } catch (RuntimeException ex) {
            // All three mission tabs render from this one snapshot, so a store
            // failure here blanks the whole panel. A bare 500 reaches the client
            // as "Internal Server Error"; give the player something they can act
            // on and keep the cause in the logs.
            LOGGER.error("Failed to build the daily mission snapshot", ex);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Missions are temporarily unavailable.");
            return error;
        }
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

    @PostMapping("/api/missions/claim-chest")
    public Map<String, Object> claimChest(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                          @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            String period = req == null ? "" : String.valueOf(req.getOrDefault("period", "")).trim();
            int threshold = req == null ? 0 : parseInt(req.get("threshold"));
            if (period.isEmpty() || threshold <= 0) {
                return Map.of("error", "period and threshold are required.");
            }
            return dailyMissionService.claimChest(user, period, threshold);
        } catch (IllegalArgumentException ex) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", ex.getMessage());
            return error;
        }
    }

    @PostMapping("/api/missions/claim-knight")
    public Map<String, Object> claimKnight(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            return dailyMissionService.claimKnightLevels(user);
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

    private static int parseInt(Object raw) {
        if (raw instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(raw).trim());
        } catch (NumberFormatException ex) {
            return 0;
        }
    }
}
