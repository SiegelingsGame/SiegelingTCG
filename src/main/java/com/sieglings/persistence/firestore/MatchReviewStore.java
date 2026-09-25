package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Documents behind the profile match review: battle replays ({@code matchReplays},
 * keyed by the match-history id they belong to) and finished Siege runs
 * ({@code siegeRunHistory}).
 *
 * <p>Replays live apart from {@code matchHistory} because the history rows are
 * listed wholesale by profiles, leaderboards and achievements, and a replay is
 * tens of KB that only the review screen needs. Siege runs live apart because
 * they are not battles: in {@code matchHistory} they would count toward win
 * rates, leaderboards and battle missions.
 *
 * <p>Both fall back to process memory when Firestore is unavailable (local dev),
 * as lobbies do; a review is a convenience and must never fail a match.
 */
@Component
public class MatchReviewStore {

    private static final long OP_TIMEOUT_SECONDS = 15;

    @Autowired
    private FirestoreUserDataClient client;

    @Value("${app.user-data.collection-match-replays:matchReplays}")
    private String replaysCollection = "matchReplays";

    @Value("${app.user-data.collection-siege-runs:siegeRunHistory}")
    private String siegeRunsCollection = "siegeRunHistory";

    private final Map<String, Map<String, Object>> memoryReplays = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> memorySiegeRuns = new ConcurrentHashMap<>();

    public void saveReplay(String historyId, Map<String, Object> payload) {
        save(replaysCollection, memoryReplays, historyId, payload);
    }

    public Optional<Map<String, Object>> findReplay(String historyId) {
        return find(replaysCollection, memoryReplays, historyId);
    }

    public void saveSiegeRun(String runId, Map<String, Object> payload) {
        save(siegeRunsCollection, memorySiegeRuns, runId, payload);
    }

    public Optional<Map<String, Object>> findSiegeRun(String runId) {
        return find(siegeRunsCollection, memorySiegeRuns, runId);
    }

    /** Newest first. Rows carry {@code id} and {@code finishedAt} as an ISO string. */
    public List<Map<String, Object>> listSiegeRuns(String userId, int limit) {
        if (userId == null || userId.isBlank()) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        if (client != null && client.isAvailable()) {
            try {
                for (QueryDocumentSnapshot doc : client.requireFirestore()
                        .collection(siegeRunsCollection)
                        .whereEqualTo("userId", userId)
                        .get()
                        .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                        .getDocuments()) {
                    out.add(normalize(doc.getId(), doc.getData()));
                }
            } catch (Exception ex) {
                throw new IllegalStateException("Unable to list Siege runs from Firestore.", ex);
            }
        } else {
            memorySiegeRuns.forEach((id, data) -> {
                if (userId.equals(data.get("userId"))) {
                    out.add(normalize(id, data));
                }
            });
        }
        out.sort(Comparator.comparing((Map<String, Object> row) -> String.valueOf(row.getOrDefault("finishedAt", ""))).reversed());
        return out.size() > limit ? new ArrayList<>(out.subList(0, limit)) : out;
    }

    private void save(String collection, Map<String, Map<String, Object>> memory, String id, Map<String, Object> payload) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Review document id is required.");
        }
        Map<String, Object> stored = new LinkedHashMap<>(payload);
        Object finishedAt = stored.get("finishedAt");
        if (finishedAt instanceof Instant instant) {
            stored.put("finishedAt", Timestamp.ofTimeSecondsAndNanos(instant.getEpochSecond(), instant.getNano()));
        }
        if (client != null && client.isAvailable()) {
            try {
                client.requireFirestore().collection(collection).document(id).set(stored)
                        .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                return;
            } catch (Exception ex) {
                throw new IllegalStateException("Unable to save review document to Firestore.", ex);
            }
        }
        memory.put(id, stored);
    }

    private Optional<Map<String, Object>> find(String collection, Map<String, Map<String, Object>> memory, String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        if (client != null && client.isAvailable()) {
            try {
                DocumentSnapshot snapshot = client.requireFirestore().collection(collection).document(id).get()
                        .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                return snapshot.exists() ? Optional.of(normalize(id, snapshot.getData())) : Optional.empty();
            } catch (Exception ex) {
                throw new IllegalStateException("Unable to load review document from Firestore.", ex);
            }
        }
        Map<String, Object> data = memory.get(id);
        return data == null ? Optional.empty() : Optional.of(normalize(id, data));
    }

    private Map<String, Object> normalize(String id, Map<String, Object> data) {
        Map<String, Object> out = new LinkedHashMap<>(data == null ? Map.of() : data);
        out.put("id", id);
        Object finishedAt = out.get("finishedAt");
        if (finishedAt instanceof Timestamp ts) {
            out.put("finishedAt", Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()).toString());
        } else if (finishedAt instanceof Instant instant) {
            out.put("finishedAt", instant.toString());
        }
        return out;
    }
}
