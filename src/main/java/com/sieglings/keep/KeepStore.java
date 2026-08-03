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
        payload.put("essence", state.getEssence());
        payload.put("storehouseLevel", state.getStorehouseLevel());
        payload.put("woodlotLevel", state.getWoodlotLevel());
        payload.put("archiveLevel", state.getArchiveLevel());
        payload.put("hallLevel", state.getHallLevel());
        payload.put("hallThemeId", state.getHallThemeId());
        payload.put("buildersYardLevel", state.getBuildersYardLevel());
        payload.put("enclaveLevel", state.getEnclaveLevel());
        payload.put("enclaveResidentIds", state.getEnclaveResidentIds());
        payload.put("akharsFrontLevel", state.getAkharsFrontLevel());
        payload.put("akharsFrontResidentIds", state.getAkharsFrontResidentIds());
        payload.put("akharsFrontStoredGold", state.getAkharsFrontStoredGold());
        payload.put("akharsFrontProductionRemainder", state.getAkharsFrontProductionRemainder());
        payload.put("akharsFrontLastAccruedAt", timestamp(state.getAkharsFrontLastAccruedAt()));
        payload.put("enclaveMissionProgress", state.getEnclaveMissionProgress());
        payload.put("enclaveTaskProgress", state.getEnclaveTaskProgress());
        payload.put("enclaveTaskCompletions", state.getEnclaveTaskCompletions());
        payload.put("residentRapport", state.getResidentRapport());
        payload.put("favoriteResidentId", state.getFavoriteResidentId());
        payload.put("activeConstructionId2", state.getActiveConstructionId2());
        payload.put("constructionStartedAt2", timestamp(state.getConstructionStartedAt2()));
        payload.put("constructionCompletesAt2", timestamp(state.getConstructionCompletesAt2()));
        payload.put("additionalConstructionIds", state.getAdditionalConstructionIds());
        payload.put("additionalConstructionStartedAts", timestampList(state.getAdditionalConstructionStartedAts()));
        payload.put("additionalConstructionCompletesAts", timestampList(state.getAdditionalConstructionCompletesAts()));
        payload.put("woodlotStored", state.getWoodlotStored());
        payload.put("woodlotProductionRemainder", state.getWoodlotProductionRemainder());
        payload.put("woodlotCollectCount", state.getWoodlotCollectCount());
        payload.put("woodlotLastAccruedAt", timestamp(state.getWoodlotLastAccruedAt()));
        payload.put("woodlotResidentId", state.getWoodlotResidentId());
        payload.put("facilityLevels", state.getFacilityLevels());
        payload.put("facilityStored", state.getFacilityStored());
        payload.put("facilityProductionRemainders", state.getFacilityProductionRemainders());
        payload.put("facilityLastAccruedAt", timestampMap(state.getFacilityLastAccruedAt()));
        payload.put("facilityResidentIds", state.getFacilityResidentIds());
        payload.put("materialInventory", state.getMaterialInventory());
        payload.put("craftedItemCounts", state.getCraftedItemCounts());
        payload.put("placedDecorations", state.getPlacedDecorations());
        payload.put("storageUpgradeLevels", state.getStorageUpgradeLevels());
        payload.put("craftCount", state.getCraftCount());
        payload.put("essenceCollectCount", state.getEssenceCollectCount());
        payload.put("activeConstructionId", state.getActiveConstructionId());
        payload.put("constructionStartedAt", timestamp(state.getConstructionStartedAt()));
        payload.put("constructionCompletesAt", timestamp(state.getConstructionCompletesAt()));
        payload.put("unlockedLoreIds", state.getUnlockedLoreIds());
        payload.put("readLoreIds", state.getReadLoreIds());
        payload.put("completedConversationIds", state.getCompletedConversationIds());
        payload.put("choiceFlags", state.getChoiceFlags());
        payload.put("npcTrust", state.getNpcTrust());
        payload.put("activeVisitorIds", state.getActiveVisitorIds());
        payload.put("visitorAvailableAt", timestampMap(state.getVisitorAvailableAt()));
        payload.put("lastVisitorRollAt", timestamp(state.getLastVisitorRollAt()));
        payload.put("activeKeepEventId", state.getActiveKeepEventId());
        payload.put("keepEventOccurredAt", timestamp(state.getKeepEventOccurredAt()));
        payload.put("keepEventRepairStartedAt", timestamp(state.getKeepEventRepairStartedAt()));
        payload.put("keepEventRepairCompletesAt", timestamp(state.getKeepEventRepairCompletesAt()));
        payload.put("lastKeepEventRollAt", timestamp(state.getLastKeepEventRollAt()));
        payload.put("recentKeepEventIds", state.getRecentKeepEventIds());
        payload.put("keepEventCount", state.getKeepEventCount());
        payload.put("displayedMemorabiliaIds", state.getDisplayedMemorabiliaIds());
        payload.put("processedRequestIds", state.getProcessedRequestIds());
        payload.put("lastVisitedAt", timestamp(state.getLastVisitedAt()));
        payload.put("lastTributeClaimedAt", timestamp(state.getLastTributeClaimedAt()));
        payload.put("keeperXp", state.getKeeperXp());
        payload.put("keeperXpBackfilled", state.isKeeperXpBackfilled());
        payload.put("keeperDailyXpAt", timestamp(state.getKeeperDailyXpAt()));
        payload.put("keeperResourceXpToday", state.getKeeperResourceXpToday());
        payload.put("keeperResourceXpDay", state.getKeeperResourceXpDay());
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
        state.setEssence((int) number(snapshot.get("essence"), 0));
        state.setStorehouseLevel((int) number(snapshot.get("storehouseLevel"), 0));
        state.setWoodlotLevel((int) number(snapshot.get("woodlotLevel"), 1));
        state.setArchiveLevel((int) number(snapshot.get("archiveLevel"), 0));
        state.setHallLevel((int) number(snapshot.get("hallLevel"), 1));
        state.setHallThemeId(string(snapshot.get("hallThemeId")));
        state.setBuildersYardLevel((int) number(snapshot.get("buildersYardLevel"), 0));
        state.setEnclaveLevel((int) number(snapshot.get("enclaveLevel"), 0));
        state.setEnclaveResidentIds(strings(snapshot.get("enclaveResidentIds")));
        state.setAkharsFrontLevel((int) number(snapshot.get("akharsFrontLevel"), 0));
        state.setAkharsFrontResidentIds(strings(snapshot.get("akharsFrontResidentIds")));
        state.setAkharsFrontStoredGold((int) number(snapshot.get("akharsFrontStoredGold"), 0));
        state.setAkharsFrontProductionRemainder(decimal(snapshot.get("akharsFrontProductionRemainder"), 0));
        state.setAkharsFrontLastAccruedAt(instant(snapshot.get("akharsFrontLastAccruedAt")));
        state.setEnclaveMissionProgress(intMap(snapshot.get("enclaveMissionProgress")));
        state.setEnclaveTaskProgress(intMap(snapshot.get("enclaveTaskProgress")));
        state.setEnclaveTaskCompletions(intMap(snapshot.get("enclaveTaskCompletions")));
        state.setResidentRapport(intMap(snapshot.get("residentRapport")));
        state.setFavoriteResidentId(string(snapshot.get("favoriteResidentId")));
        state.setActiveConstructionId2(string(snapshot.get("activeConstructionId2")));
        state.setConstructionStartedAt2(instant(snapshot.get("constructionStartedAt2")));
        state.setConstructionCompletesAt2(instant(snapshot.get("constructionCompletesAt2")));
        state.setAdditionalConstructionIds(strings(snapshot.get("additionalConstructionIds")));
        state.setAdditionalConstructionStartedAts(instants(snapshot.get("additionalConstructionStartedAts")));
        state.setAdditionalConstructionCompletesAts(instants(snapshot.get("additionalConstructionCompletesAts")));
        state.setWoodlotStored((int) number(snapshot.get("woodlotStored"), 0));
        state.setWoodlotProductionRemainder(decimal(snapshot.get("woodlotProductionRemainder"), 0));
        state.setWoodlotCollectCount((int) number(snapshot.get("woodlotCollectCount"), 0));
        state.setWoodlotLastAccruedAt(instant(snapshot.get("woodlotLastAccruedAt")));
        state.setWoodlotResidentId(string(snapshot.get("woodlotResidentId")));
        state.setFacilityLevels(intMap(snapshot.get("facilityLevels")));
        state.setFacilityStored(intMap(snapshot.get("facilityStored")));
        state.setFacilityProductionRemainders(doubleMap(snapshot.get("facilityProductionRemainders")));
        state.setFacilityLastAccruedAt(instantMap(snapshot.get("facilityLastAccruedAt")));
        state.setFacilityResidentIds(stringMap(snapshot.get("facilityResidentIds")));
        state.setMaterialInventory(intMap(snapshot.get("materialInventory")));
        state.setCraftedItemCounts(intMap(snapshot.get("craftedItemCounts")));
        state.setPlacedDecorations(stringMap(snapshot.get("placedDecorations")));
        state.setStorageUpgradeLevels(intMap(snapshot.get("storageUpgradeLevels")));
        state.setCraftCount((int) number(snapshot.get("craftCount"), 0));
        state.setEssenceCollectCount((int) number(snapshot.get("essenceCollectCount"), 0));
        state.setActiveConstructionId(string(snapshot.get("activeConstructionId")));
        state.setConstructionStartedAt(instant(snapshot.get("constructionStartedAt")));
        state.setConstructionCompletesAt(instant(snapshot.get("constructionCompletesAt")));
        state.setUnlockedLoreIds(strings(snapshot.get("unlockedLoreIds")));
        state.setReadLoreIds(strings(snapshot.get("readLoreIds")));
        state.setCompletedConversationIds(strings(snapshot.get("completedConversationIds")));
        state.setChoiceFlags(strings(snapshot.get("choiceFlags")));
        state.setNpcTrust(intMap(snapshot.get("npcTrust")));
        state.setActiveVisitorIds(strings(snapshot.get("activeVisitorIds")));
        state.setVisitorAvailableAt(instantMap(snapshot.get("visitorAvailableAt")));
        state.setLastVisitorRollAt(instant(snapshot.get("lastVisitorRollAt")));
        state.setActiveKeepEventId(string(snapshot.get("activeKeepEventId")));
        state.setKeepEventOccurredAt(instant(snapshot.get("keepEventOccurredAt")));
        state.setKeepEventRepairStartedAt(instant(snapshot.get("keepEventRepairStartedAt")));
        state.setKeepEventRepairCompletesAt(instant(snapshot.get("keepEventRepairCompletesAt")));
        state.setLastKeepEventRollAt(instant(snapshot.get("lastKeepEventRollAt")));
        state.setRecentKeepEventIds(strings(snapshot.get("recentKeepEventIds")));
        state.setKeepEventCount((int) number(snapshot.get("keepEventCount"), 0));
        state.setDisplayedMemorabiliaIds(strings(snapshot.get("displayedMemorabiliaIds")));
        state.setProcessedRequestIds(strings(snapshot.get("processedRequestIds")));
        state.setLastVisitedAt(instant(snapshot.get("lastVisitedAt")));
        state.setLastTributeClaimedAt(instant(snapshot.get("lastTributeClaimedAt")));
        state.setKeeperXp(number(snapshot.get("keeperXp"), 0));
        state.setKeeperXpBackfilled(Boolean.TRUE.equals(snapshot.get("keeperXpBackfilled")));
        state.setKeeperDailyXpAt(instant(snapshot.get("keeperDailyXpAt")));
        state.setKeeperResourceXpToday((int) number(snapshot.get("keeperResourceXpToday"), 0));
        state.setKeeperResourceXpDay(string(snapshot.get("keeperResourceXpDay")));
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

    private static Map<String, Double> doubleMap(Object value) {
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
            if (entry.getKey() != null) out.put(String.valueOf(entry.getKey()), string(entry.getValue()));
        }
        return out;
    }

    private static Map<String, Instant> instantMap(Object value) {
        Map<String, Instant> out = new LinkedHashMap<>();
        if (!(value instanceof Map<?, ?> map)) return out;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getKey() == null) continue;
            Instant parsed = instant(entry.getValue());
            if (parsed != null) out.put(String.valueOf(entry.getKey()), parsed);
        }
        return out;
    }

    private static Map<String, Object> timestampMap(Map<String, Instant> values) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (values != null) values.forEach((key, value) -> out.put(key, timestamp(value)));
        return out;
    }

    private static List<Instant> instants(Object value) {
        List<Instant> out = new ArrayList<>();
        if (!(value instanceof List<?> list)) return out;
        for (Object item : list) out.add(instant(item));
        return out;
    }

    private static List<Object> timestampList(List<Instant> values) {
        List<Object> out = new ArrayList<>();
        if (values != null) values.forEach(value -> out.add(timestamp(value)));
        return out;
    }
}
