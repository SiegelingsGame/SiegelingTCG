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
        Map<String, Object> payload = toPayload(progression);
        try {
            doc(progression.getUserId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return progression;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save player progression to Firestore.", ex);
        }
    }

    /** Shared with {@link RewardClaimStore} so a transactional write serializes identically. */
    Map<String, Object> toPayload(PlayerProgressionEntity progression) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("gold", progression.getGold());
        payload.put("remnants", progression.getRemnants());
        payload.put("warmarks", progression.getWarmarks());
        payload.put("battlegroundsTier", progression.getBattlegroundsTier());
        payload.put("battlegroundsUnlocks", progression.getBattlegroundsUnlocks());
        payload.put("ownedCards", progression.getOwnedCards());
        payload.put("trainerLevels", progression.getTrainerLevels());
        payload.put("trainerPoints", progression.getTrainerPoints());
        payload.put("starterPackId", progression.getStarterPackId());
        payload.put("tutorialCompleted", progression.isTutorialCompleted());
        payload.put("rewardedMatchIds", progression.getRewardedMatchIds());
        payload.put("purchasedDeckIds", progression.getPurchasedDeckIds());
        payload.put("purchasedDailyOfferIds", progression.getPurchasedDailyOfferIds());
        payload.put("completedPackOpenRequestIds", progression.getCompletedPackOpenRequestIds());
        payload.put("purchasedTitleIds", progression.getPurchasedTitleIds());
        payload.put("craftCount", progression.getCraftCount());
        payload.put("holographicCardIds", progression.getHolographicCardIds());
        payload.put("siegeUnlockedKnights", progression.getSiegeUnlockedKnights());
        payload.put("siegeUnlockedSieglings", progression.getSiegeUnlockedSieglings());
        payload.put("siegeRuns", progression.getSiegeRuns());
        payload.put("siegeWins", progression.getSiegeWins());
        payload.put("siegeBossKills", progression.getSiegeBossKills());
        payload.put("siegeNodesCleared", progression.getSiegeNodesCleared());
        payload.put("siegeBestScore", progression.getSiegeBestScore());
        payload.put("keepFounded", progression.isKeepFounded());
        payload.put("keepTimberCollected", progression.getKeepTimberCollected());
        payload.put("keepProjectsCompleted", progression.getKeepProjectsCompleted());
        payload.put("keepLoreRead", progression.getKeepLoreRead());
        payload.put("keepConversationsCompleted", progression.getKeepConversationsCompleted());
        payload.put("keepRewardClaimIds", progression.getKeepRewardClaimIds());
        payload.put("packHistory", progression.getPackHistory());
        payload.put("soloWinStreak", progression.getSoloWinStreak());
        payload.put("onlineWinStreak", progression.getOnlineWinStreak());
        payload.put("updatedAt", toTimestamp(progression.getUpdatedAt()));
        return payload;
    }

    public void deleteByUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        try {
            doc(userId).delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete player progression from Firestore.", ex);
        }
    }

    DocumentReference doc(String userId) {
        return client.requireFirestore().collection(client.progressionCollection()).document(userId);
    }

    @SuppressWarnings("unchecked")
    PlayerProgressionEntity toProgression(String userId, DocumentSnapshot snapshot) {
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setUserId(userId);
        Long gold = snapshot.getLong("gold");
        progression.setGold(gold == null ? 0 : gold.intValue());
        Long remnants = snapshot.getLong("remnants");
        progression.setRemnants(remnants == null ? 0 : remnants.intValue());
        Long warmarks = snapshot.getLong("warmarks");
        progression.setWarmarks(warmarks == null ? 0 : warmarks.intValue());
        Long battlegroundsTier = snapshot.getLong("battlegroundsTier");
        progression.setBattlegroundsTier(battlegroundsTier == null ? 0 : battlegroundsTier.intValue());
        progression.setBattlegroundsUnlocks(readStringList(snapshot.get("battlegroundsUnlocks")));
        progression.setOwnedCards(readIntMap(snapshot.get("ownedCards")));
        progression.setTrainerLevels(readIntMap(snapshot.get("trainerLevels")));
        progression.setTrainerPoints(readIntMap(snapshot.get("trainerPoints")));
        progression.setStarterPackId(snapshot.getString("starterPackId"));
        progression.setTutorialCompleted(Boolean.TRUE.equals(snapshot.getBoolean("tutorialCompleted")));
        progression.setRewardedMatchIds(readStringList(snapshot.get("rewardedMatchIds")));
        progression.setPurchasedDeckIds(readStringList(snapshot.get("purchasedDeckIds")));
        progression.setPurchasedDailyOfferIds(readStringList(snapshot.get("purchasedDailyOfferIds")));
        progression.setPurchasedTitleIds(readStringList(snapshot.get("purchasedTitleIds")));
        Long craftCount = snapshot.getLong("craftCount");
        progression.setCraftCount(craftCount == null ? 0 : craftCount.intValue());
        progression.setHolographicCardIds(readStringList(snapshot.get("holographicCardIds")));
        progression.setSiegeUnlockedKnights(readStringList(snapshot.get("siegeUnlockedKnights")));
        progression.setSiegeUnlockedSieglings(readStringList(snapshot.get("siegeUnlockedSieglings")));
        progression.setSiegeRuns(intValue(snapshot.getLong("siegeRuns")));
        progression.setSiegeWins(intValue(snapshot.getLong("siegeWins")));
        progression.setSiegeBossKills(intValue(snapshot.getLong("siegeBossKills")));
        progression.setSiegeNodesCleared(intValue(snapshot.getLong("siegeNodesCleared")));
        progression.setSiegeBestScore(intValue(snapshot.getLong("siegeBestScore")));
        progression.setKeepFounded(Boolean.TRUE.equals(snapshot.getBoolean("keepFounded")));
        progression.setKeepTimberCollected(intValue(snapshot.getLong("keepTimberCollected")));
        progression.setKeepProjectsCompleted(intValue(snapshot.getLong("keepProjectsCompleted")));
        progression.setKeepLoreRead(intValue(snapshot.getLong("keepLoreRead")));
        progression.setKeepConversationsCompleted(intValue(snapshot.getLong("keepConversationsCompleted")));
        progression.setKeepRewardClaimIds(readStringList(snapshot.get("keepRewardClaimIds")));
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
        progression.setCompletedPackOpenRequestIds(mergeCompletedPackOpenRequestIds(
                readStringList(snapshot.get("completedPackOpenRequestIds")),
                progression.getPackHistory()
        ));
        progression.setUpdatedAt(readInstant(snapshot, "updatedAt"));
        return progression;
    }

    private List<String> mergeCompletedPackOpenRequestIds(List<String> storedIds, List<Map<String, Object>> packHistory) {
        List<String> out = new ArrayList<>();
        addRequestIds(out, storedIds);
        if (packHistory != null) {
            for (Map<String, Object> entry : packHistory) {
                if (entry != null) {
                    addRequestId(out, entry.get("requestId"));
                }
            }
        }
        return out;
    }

    private void addRequestIds(List<String> target, List<String> requestIds) {
        if (requestIds == null) {
            return;
        }
        for (String requestId : requestIds) {
            addRequestId(target, requestId);
        }
    }

    private void addRequestId(List<String> target, Object rawRequestId) {
        if (!(rawRequestId instanceof String requestId) || requestId.isBlank() || target.contains(requestId)) {
            return;
        }
        target.add(requestId);
    }

    private int intValue(Long value) {
        return value == null ? 0 : value.intValue();
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
