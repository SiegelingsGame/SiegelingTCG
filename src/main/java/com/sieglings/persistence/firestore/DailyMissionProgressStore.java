package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.entity.DailyMissionProgressEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Component
public class DailyMissionProgressStore {

    private static final long OP_TIMEOUT_SECONDS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    public Optional<DailyMissionProgressEntity> findByUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return Optional.empty();
        }
        try {
            DocumentSnapshot snapshot = doc(userId).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!snapshot.exists()) {
                return Optional.empty();
            }
            return Optional.of(toEntity(userId, snapshot));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load daily mission progress from Firestore.", ex);
        }
    }

    public DailyMissionProgressEntity save(DailyMissionProgressEntity progress) {
        if (progress.getUserId() == null || progress.getUserId().isBlank()) {
            throw new IllegalArgumentException("Daily mission progress user id is required.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("dateKey", progress.getDateKey());
        payload.put("counters", progress.getCounters());
        payload.put("claimedMissionIds", progress.getClaimedMissionIds());
        payload.put("dailyPoints", progress.getDailyPoints());
        payload.put("claimedDailyChests", progress.getClaimedDailyChests());
        payload.put("weekKey", progress.getWeekKey());
        payload.put("weeklyCounters", progress.getWeeklyCounters());
        payload.put("claimedWeeklyIds", progress.getClaimedWeeklyIds());
        payload.put("weeklyPoints", progress.getWeeklyPoints());
        payload.put("claimedWeeklyChests", progress.getClaimedWeeklyChests());
        payload.put("lifetimeCounters", progress.getLifetimeCounters());
        payload.put("claimedLifetimeIds", progress.getClaimedLifetimeIds());
        payload.put("knightPoints", progress.getKnightPoints());
        payload.put("claimedKnightLevel", progress.getClaimedKnightLevel());
        payload.put("lastLoginClaimKey", progress.getLastLoginClaimKey());
        payload.put("loginStreak", progress.getLoginStreak());
        payload.put("updatedAt", toTimestamp(progress.getUpdatedAt()));
        try {
            doc(progress.getUserId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return progress;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save daily mission progress to Firestore.", ex);
        }
    }

    public void deleteByUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        try {
            doc(userId).delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete daily mission progress from Firestore.", ex);
        }
    }

    private DocumentReference doc(String userId) {
        return client.requireFirestore()
                .collection(client.dailyMissionProgressCollection())
                .document(userId);
    }

    @SuppressWarnings("unchecked")
    private DailyMissionProgressEntity toEntity(String userId, DocumentSnapshot snapshot) {
        DailyMissionProgressEntity progress = new DailyMissionProgressEntity();
        progress.setUserId(userId);
        progress.setDateKey(snapshot.getString("dateKey"));
        progress.setCounters(readIntMap(snapshot.get("counters")));
        progress.setClaimedMissionIds(readStringList(snapshot.get("claimedMissionIds")));
        progress.setDailyPoints(readInt(snapshot, "dailyPoints", 0));
        progress.setClaimedDailyChests(readIntList(snapshot.get("claimedDailyChests")));
        progress.setWeekKey(snapshot.getString("weekKey"));
        progress.setWeeklyCounters(readIntMap(snapshot.get("weeklyCounters")));
        progress.setClaimedWeeklyIds(readStringList(snapshot.get("claimedWeeklyIds")));
        progress.setWeeklyPoints(readInt(snapshot, "weeklyPoints", 0));
        progress.setClaimedWeeklyChests(readIntList(snapshot.get("claimedWeeklyChests")));
        progress.setLifetimeCounters(readIntMap(snapshot.get("lifetimeCounters")));
        progress.setClaimedLifetimeIds(readStringList(snapshot.get("claimedLifetimeIds")));
        progress.setKnightPoints(readInt(snapshot, "knightPoints", 0));
        // Rows written before Knight Levels existed have no marker; level 1 is the floor.
        progress.setClaimedKnightLevel(readInt(snapshot, "claimedKnightLevel", 1));
        progress.setLastLoginClaimKey(snapshot.getString("lastLoginClaimKey"));
        Long loginStreak = snapshot.getLong("loginStreak");
        progress.setLoginStreak(loginStreak == null ? 0 : loginStreak.intValue());
        progress.setUpdatedAt(readInstant(snapshot, "updatedAt"));
        return progress;
    }

    private Map<String, Integer> readIntMap(Object raw) {
        Map<String, Integer> out = new LinkedHashMap<>();
        if (!(raw instanceof Map<?, ?> map)) {
            return out;
        }
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getKey() == null || !(entry.getValue() instanceof Number number)) {
                continue;
            }
            out.put(String.valueOf(entry.getKey()), Math.max(0, number.intValue()));
        }
        return out;
    }

    private List<Integer> readIntList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return new ArrayList<>();
        }
        return list.stream()
                .filter(Number.class::isInstance)
                .map(value -> ((Number) value).intValue())
                .toList();
    }

    private int readInt(DocumentSnapshot snapshot, String key, int fallback) {
        Long value = snapshot.getLong(key);
        return value == null ? fallback : value.intValue();
    }

    private List<String> readStringList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return new ArrayList<>();
        }
        return list.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .toList();
    }

    private Instant readInstant(DocumentSnapshot snapshot, String key) {
        Object value = snapshot.get(key);
        if (value instanceof Timestamp ts) {
            return Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos());
        }
        return null;
    }

    private Timestamp toTimestamp(Instant instant) {
        Instant safe = instant == null ? Instant.now() : instant;
        return Timestamp.ofTimeSecondsAndNanos(safe.getEpochSecond(), safe.getNano());
    }
}
