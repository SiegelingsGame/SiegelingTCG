package com.sieglings.keep;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/** Firestore persistence for the compact My Keep document. */
@Component
public class KeepStore {
    private static final long OP_TIMEOUT_SECONDS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    @Value("${app.user-data.collection-keeps:playerKeeps}")
    private String collection = "playerKeeps";

    public Optional<KeepState> findByUserId(String userId) {
        if (userId == null || userId.isBlank()) return Optional.empty();
        try {
            DocumentSnapshot snapshot = doc(userId).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return snapshot.exists() ? Optional.of(fromSnapshot(userId, snapshot)) : Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load My Keep from Firestore.", ex);
        }
    }

    public KeepState save(KeepState state) {
        if (state == null || state.getUserId() == null || state.getUserId().isBlank()) {
            throw new IllegalArgumentException("Keep user id is required.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("version", state.getVersion());
        payload.put("timber", state.getTimber());
        payload.put("woodlotLevel", state.getWoodlotLevel());
        payload.put("archiveLevel", state.getArchiveLevel());
        payload.put("woodlotStored", state.getWoodlotStored());
        payload.put("woodlotProductionRemainder", state.getWoodlotProductionRemainder());
        payload.put("woodlotCollectCount", state.getWoodlotCollectCount());
        payload.put("woodlotLastAccruedAt", timestamp(state.getWoodlotLastAccruedAt()));
        payload.put("woodlotResidentId", state.getWoodlotResidentId());
        payload.put("activeConstructionId", state.getActiveConstructionId());
        payload.put("constructionStartedAt", timestamp(state.getConstructionStartedAt()));
        payload.put("constructionCompletesAt", timestamp(state.getConstructionCompletesAt()));
        payload.put("unlockedLoreIds", state.getUnlockedLoreIds());
        payload.put("readLoreIds", state.getReadLoreIds());
        payload.put("completedConversationIds", state.getCompletedConversationIds());
        payload.put("choiceFlags", state.getChoiceFlags());
        payload.put("npcTrust", state.getNpcTrust());
        payload.put("displayedMemorabiliaIds", state.getDisplayedMemorabiliaIds());
        payload.put("processedRequestIds", state.getProcessedRequestIds());
        payload.put("stationLevels", state.getStationLevels());
        payload.put("stationStored", state.getStationStored());
        payload.put("stationRemainders", state.getStationRemainders());
        payload.put("stationResidents", state.getStationResidents());
        payload.put("lifetimeCoinsEarned", state.getLifetimeCoinsEarned());
        payload.put("lifetimeRemnantsEarned", state.getLifetimeRemnantsEarned());
        payload.put("lastSeenAt", timestamp(state.getLastSeenAt()));
        payload.put("createdAt", timestamp(state.getCreatedAt()));
        payload.put("updatedAt", timestamp(state.getUpdatedAt()));
        try {
            doc(state.getUserId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return state;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save My Keep to Firestore.", ex);
        }
    }

    public void deleteByUserId(String userId) {
        if (userId == null || userId.isBlank()) return;
        try {
            doc(userId).delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete My Keep from Firestore.", ex);
        }
    }

    private DocumentReference doc(String userId) {
        return client.requireFirestore().collection(collection).document(userId);
    }

    private KeepState fromSnapshot(String userId, DocumentSnapshot snapshot) {
        KeepState state = new KeepState();
        state.setUserId(userId);
        state.setVersion(number(snapshot.get("version"), 0));
        state.setTimber((int) number(snapshot.get("timber"), 80));
        state.setWoodlotLevel((int) number(snapshot.get("woodlotLevel"), 1));
        state.setArchiveLevel((int) number(snapshot.get("archiveLevel"), 0));
        state.setWoodlotStored((int) number(snapshot.get("woodlotStored"), 0));
        state.setWoodlotProductionRemainder(decimal(snapshot.get("woodlotProductionRemainder"), 0));
        state.setWoodlotCollectCount((int) number(snapshot.get("woodlotCollectCount"), 0));
        state.setWoodlotLastAccruedAt(instant(snapshot.get("woodlotLastAccruedAt")));
        state.setWoodlotResidentId(string(snapshot.get("woodlotResidentId")));
        state.setActiveConstructionId(string(snapshot.get("activeConstructionId")));
        state.setConstructionStartedAt(instant(snapshot.get("constructionStartedAt")));
        state.setConstructionCompletesAt(instant(snapshot.get("constructionCompletesAt")));
        state.setUnlockedLoreIds(strings(snapshot.get("unlockedLoreIds")));
        state.setReadLoreIds(strings(snapshot.get("readLoreIds")));
        state.setCompletedConversationIds(strings(snapshot.get("completedConversationIds")));
        state.setChoiceFlags(strings(snapshot.get("choiceFlags")));
        state.setNpcTrust(intMap(snapshot.get("npcTrust")));
        state.setDisplayedMemorabiliaIds(strings(snapshot.get("displayedMemorabiliaIds")));
        state.setProcessedRequestIds(strings(snapshot.get("processedRequestIds")));
        state.setStationLevels(intMap(snapshot.get("stationLevels")));
        state.setStationStored(intMap(snapshot.get("stationStored")));
        state.setStationRemainders(decimalMap(snapshot.get("stationRemainders")));
        state.setStationResidents(stringMap(snapshot.get("stationResidents")));
        state.setLifetimeCoinsEarned((int) number(snapshot.get("lifetimeCoinsEarned"), 0));
        state.setLifetimeRemnantsEarned((int) number(snapshot.get("lifetimeRemnantsEarned"), 0));
        state.setLastSeenAt(instant(snapshot.get("lastSeenAt")));
        state.setCreatedAt(instant(snapshot.get("createdAt")));
        state.setUpdatedAt(instant(snapshot.get("updatedAt")));
        return state;
    }

    private static long number(Object value, long fallback) {
        return value instanceof Number number ? number.longValue() : fallback;
    }

    private static double decimal(Object value, double fallback) {
        return value instanceof Number number ? number.doubleValue() : fallback;
    }

    private static String string(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static Instant instant(Object value) {
        if (value instanceof Timestamp ts) return Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos());
        if (value instanceof String text && !text.isBlank()) {
            try { return Instant.parse(text); } catch (Exception ignored) { }
        }
        return null;
    }

    private static Timestamp timestamp(Instant value) {
        if (value == null) return null;
        return Timestamp.ofTimeSecondsAndNanos(value.getEpochSecond(), value.getNano());
    }

    private static List<String> strings(Object value) {
        if (!(value instanceof List<?> list)) return new ArrayList<>();
        return list.stream().filter(String.class::isInstance).map(String.class::cast).toList();
    }

    private static Map<String, Integer> intMap(Object value) {
        Map<String, Integer> out = new LinkedHashMap<>();
        if (!(value instanceof Map<?, ?> map)) return out;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getKey() != null && entry.getValue() instanceof Number number) {
                out.put(String.valueOf(entry.getKey()), number.intValue());
            }
        }
        return out;
    }

    private static Map<String, Double> decimalMap(Object value) {
        Map<String, Double> out = new LinkedHashMap<>();
        if (!(value instanceof Map<?, ?> map)) return out;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getKey() != null && entry.getValue() instanceof Number number) {
                out.put(String.valueOf(entry.getKey()), number.doubleValue());
            }
        }
        return out;
    }

    private static Map<String, String> stringMap(Object value) {
        Map<String, String> out = new LinkedHashMap<>();
        if (!(value instanceof Map<?, ?> map)) return out;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getKey() != null && entry.getValue() instanceof String text) {
                out.put(String.valueOf(entry.getKey()), text);
            }
        }
        return out;
    }
}
