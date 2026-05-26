package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
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
public class PlayerProgressionStore {
    private static final long OP_TIMEOUT_SECONDS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    public Optional<PlayerProgressionEntity> findByUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return Optional.empty();
        }
        try {
            DocumentSnapshot snapshot = doc(userId).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!snapshot.exists()) {
                return Optional.empty();
            }
            return Optional.of(toProgression(userId, snapshot));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load player progression from Firestore.", ex);
        }
    }

    public PlayerProgressionEntity save(PlayerProgressionEntity progression) {
        if (progression.getUserId() == null || progression.getUserId().isBlank()) {
            throw new IllegalArgumentException("Progression user id is required.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("gold", progression.getGold());
        payload.put("ownedCards", progression.getOwnedCards());
        payload.put("starterPackId", progression.getStarterPackId());
        payload.put("rewardedMatchIds", progression.getRewardedMatchIds());
        payload.put("purchasedDeckIds", progression.getPurchasedDeckIds());
        payload.put("purchasedDailyOfferIds", progression.getPurchasedDailyOfferIds());
        payload.put("packHistory", progression.getPackHistory());
        payload.put("soloWinStreak", progression.getSoloWinStreak());
        payload.put("onlineWinStreak", progression.getOnlineWinStreak());
        payload.put("updatedAt", toTimestamp(progression.getUpdatedAt()));
        try {
            doc(progression.getUserId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return progression;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save player progression to Firestore.", ex);
        }
    }

    private DocumentReference doc(String userId) {
        return client.requireFirestore().collection(client.progressionCollection()).document(userId);
    }

    @SuppressWarnings("unchecked")
    private PlayerProgressionEntity toProgression(String userId, DocumentSnapshot snapshot) {
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId(userId);
        Long gold = snapshot.getLong("gold");
        progression.setGold(gold == null ? 0 : gold.intValue());
        progression.setOwnedCards(readIntMap(snapshot.get("ownedCards")));
        progression.setStarterPackId(snapshot.getString("starterPackId"));
        progression.setRewardedMatchIds(readStringList(snapshot.get("rewardedMatchIds")));
        progression.setPurchasedDeckIds(readStringList(snapshot.get("purchasedDeckIds")));
        progression.setPurchasedDailyOfferIds(readStringList(snapshot.get("purchasedDailyOfferIds")));
        Long soloWinStreak = snapshot.getLong("soloWinStreak");
        Long onlineWinStreak = snapshot.getLong("onlineWinStreak");
        progression.setSoloWinStreak(soloWinStreak == null ? 0 : soloWinStreak.intValue());
        progression.setOnlineWinStreak(onlineWinStreak == null ? 0 : onlineWinStreak.intValue());
        Object history = snapshot.get("packHistory");
        if (history instanceof List<?> list) {
            List<Map<String, Object>> packHistory = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    for (Map.Entry<?, ?> rawEntry : map.entrySet()) {
                        if (rawEntry.getKey() != null) {
                            entry.put(String.valueOf(rawEntry.getKey()), rawEntry.getValue());
                        }
                    }
                    packHistory.add(entry);
                }
            }
            progression.setPackHistory(packHistory);
        } else {
            progression.setPackHistory(List.of());
        }
        progression.setUpdatedAt(readInstant(snapshot, "updatedAt"));
        return progression;
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
