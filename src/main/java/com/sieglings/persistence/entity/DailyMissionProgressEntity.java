package com.sieglings.persistence.entity;

import com.sieglings.mission.DailyMissionType;
import com.sieglings.mission.MissionPeriod;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class DailyMissionProgressEntity {

    private String userId;

    // Daily scope (resets each calendar day).
    private String dateKey;
    private Map<String, Integer> counters = new LinkedHashMap<>();
    private List<String> claimedMissionIds = new ArrayList<>();

    // Weekly scope (resets each ISO week).
    private String weekKey;
    private Map<String, Integer> weeklyCounters = new LinkedHashMap<>();
    private List<String> claimedWeeklyIds = new ArrayList<>();

    // Lifetime scope (never resets).
    private Map<String, Integer> lifetimeCounters = new LinkedHashMap<>();
    private List<String> claimedLifetimeIds = new ArrayList<>();

    // Daily login reward — survives the daily/weekly counter resets.
    private String lastLoginClaimKey = "";
    private int loginStreak;

    private Instant updatedAt = Instant.now();

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getDateKey() {
        return dateKey;
    }

    public void setDateKey(String dateKey) {
        this.dateKey = dateKey;
    }

    public Map<String, Integer> getCounters() {
        return counters;
    }

    public void setCounters(Map<String, Integer> counters) {
        this.counters = counters == null ? new LinkedHashMap<>() : new LinkedHashMap<>(counters);
    }

    public List<String> getClaimedMissionIds() {
        return claimedMissionIds;
    }

    public void setClaimedMissionIds(List<String> claimedMissionIds) {
        this.claimedMissionIds = claimedMissionIds == null ? new ArrayList<>() : new ArrayList<>(claimedMissionIds);
    }

    public String getWeekKey() {
        return weekKey;
    }

    public void setWeekKey(String weekKey) {
        this.weekKey = weekKey;
    }

    public Map<String, Integer> getWeeklyCounters() {
        return weeklyCounters;
    }

    public void setWeeklyCounters(Map<String, Integer> weeklyCounters) {
        this.weeklyCounters = weeklyCounters == null ? new LinkedHashMap<>() : new LinkedHashMap<>(weeklyCounters);
    }

    public List<String> getClaimedWeeklyIds() {
        return claimedWeeklyIds;
    }

    public void setClaimedWeeklyIds(List<String> claimedWeeklyIds) {
        this.claimedWeeklyIds = claimedWeeklyIds == null ? new ArrayList<>() : new ArrayList<>(claimedWeeklyIds);
    }

    public Map<String, Integer> getLifetimeCounters() {
        return lifetimeCounters;
    }

    public void setLifetimeCounters(Map<String, Integer> lifetimeCounters) {
        this.lifetimeCounters = lifetimeCounters == null ? new LinkedHashMap<>() : new LinkedHashMap<>(lifetimeCounters);
    }

    public List<String> getClaimedLifetimeIds() {
        return claimedLifetimeIds;
    }

    public void setClaimedLifetimeIds(List<String> claimedLifetimeIds) {
        this.claimedLifetimeIds = claimedLifetimeIds == null ? new ArrayList<>() : new ArrayList<>(claimedLifetimeIds);
    }

    public String getLastLoginClaimKey() {
        return lastLoginClaimKey == null ? "" : lastLoginClaimKey;
    }

    public void setLastLoginClaimKey(String lastLoginClaimKey) {
        this.lastLoginClaimKey = lastLoginClaimKey == null ? "" : lastLoginClaimKey;
    }

    public int getLoginStreak() {
        return loginStreak;
    }

    public void setLoginStreak(int loginStreak) {
        this.loginStreak = Math.max(0, loginStreak);
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    // ── Daily counters ──────────────────────────────────────────────────────

    public int counter(DailyMissionType type) {
        return counterFrom(counters, type);
    }

    public void addCounter(DailyMissionType type, int delta) {
        addTo(counters, type, delta);
    }

    // ── Period-aware counter access ─────────────────────────────────────────

    public int counter(MissionPeriod period, DailyMissionType type) {
        return counterFrom(mapFor(period), type);
    }

    public void addCounter(MissionPeriod period, DailyMissionType type, int delta) {
        addTo(mapFor(period), type, delta);
    }

    public List<String> claimedIds(MissionPeriod period) {
        return switch (period) {
            case WEEKLY -> claimedWeeklyIds;
            case LIFETIME -> claimedLifetimeIds;
            default -> claimedMissionIds;
        };
    }

    private Map<String, Integer> mapFor(MissionPeriod period) {
        return switch (period) {
            case WEEKLY -> weeklyCounters;
            case LIFETIME -> lifetimeCounters;
            default -> counters;
        };
    }

    private static int counterFrom(Map<String, Integer> map, DailyMissionType type) {
        if (type == null) {
            return 0;
        }
        return Math.max(0, map.getOrDefault(type.name(), 0));
    }

    private static void addTo(Map<String, Integer> map, DailyMissionType type, int delta) {
        if (type == null || delta <= 0) {
            return;
        }
        map.put(type.name(), counterFrom(map, type) + delta);
    }
}
