package com.sieglings.persistence.entity;

import com.sieglings.mission.DailyMissionType;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class DailyMissionProgressEntity {

    private String userId;
    private String dateKey;
    private Map<String, Integer> counters = new LinkedHashMap<>();
    private List<String> claimedMissionIds = new ArrayList<>();
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

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public int counter(DailyMissionType type) {
        if (type == null) {
            return 0;
        }
        return Math.max(0, counters.getOrDefault(type.name(), 0));
    }

    public void addCounter(DailyMissionType type, int delta) {
        if (type == null || delta <= 0) {
            return;
        }
        counters.put(type.name(), counter(type) + delta);
    }
}
