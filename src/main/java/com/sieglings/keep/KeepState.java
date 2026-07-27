package com.sieglings.keep;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Persistent, account-bound state for the My Keep idle mode. */
public class KeepState {
    private String userId;
    private long version;
    private int timber;
    private int essence;
    private int storehouseLevel;
    private int woodlotLevel = 1;
    private int archiveLevel;
    private int hallLevel = 1;
    private String hallThemeId = "";
    private int buildersYardLevel;
    private int enclaveLevel;
    private List<String> enclaveResidentIds = new ArrayList<>();
    private Map<String, Integer> enclaveMissionProgress = new LinkedHashMap<>();
    // Rapport tasks are repeatable, so progress resets on claim and the completion count
    // is tracked separately. Both maps are keyed "<residentId>:<taskId>"; residentRapport
    // holds the lifetime points that drive a resident's buff multiplier.
    private Map<String, Integer> enclaveTaskProgress = new LinkedHashMap<>();
    private Map<String, Integer> enclaveTaskCompletions = new LinkedHashMap<>();
    private Map<String, Integer> residentRapport = new LinkedHashMap<>();
    private String favoriteResidentId = "";
    private String activeConstructionId2 = "";
    private Instant constructionStartedAt2;
    private Instant constructionCompletesAt2;
    private List<String> additionalConstructionIds = new ArrayList<>();
    private List<Instant> additionalConstructionStartedAts = new ArrayList<>();
    private List<Instant> additionalConstructionCompletesAts = new ArrayList<>();
    private int woodlotStored;
    private double woodlotProductionRemainder;
    private int woodlotCollectCount;
    private Instant woodlotLastAccruedAt;
    private String woodlotResidentId = "";
    private Map<String, Integer> facilityLevels = new LinkedHashMap<>();
    private Map<String, Integer> facilityStored = new LinkedHashMap<>();
    private Map<String, Double> facilityProductionRemainders = new LinkedHashMap<>();
    private Map<String, Instant> facilityLastAccruedAt = new LinkedHashMap<>();
    private Map<String, String> facilityResidentIds = new LinkedHashMap<>();
    private Map<String, Integer> materialInventory = new LinkedHashMap<>();
    private Map<String, Integer> craftedItemCounts = new LinkedHashMap<>();
    private Map<String, String> placedDecorations = new LinkedHashMap<>();
    private int craftCount;
    private int essenceCollectCount;
    private String activeConstructionId = "";
    private Instant constructionStartedAt;
    private Instant constructionCompletesAt;
    private List<String> unlockedLoreIds = new ArrayList<>();
    private List<String> readLoreIds = new ArrayList<>();
    private List<String> completedConversationIds = new ArrayList<>();
    private List<String> choiceFlags = new ArrayList<>();
    private Map<String, Integer> npcTrust = new LinkedHashMap<>();
    private List<String> activeVisitorIds = new ArrayList<>();
    private Map<String, Instant> visitorAvailableAt = new LinkedHashMap<>();
    private Instant lastVisitorRollAt;
    private List<String> displayedMemorabiliaIds = new ArrayList<>();
    private List<String> processedRequestIds = new ArrayList<>();
    private Instant lastVisitedAt;
    private Instant lastTributeClaimedAt;
    // Keeper leveling / battlepass. keeperXp is lifetime XP; the level is derived
    // from it. Backfill runs once for keeps that predate the system so their level
    // reflects work already done. Daily-login and resource XP are rate-limited by
    // the two "daily" trackers (a UTC day key plus that day's accumulated resource XP).
    private long keeperXp;
    private boolean keeperXpBackfilled;
    private Instant keeperDailyXpAt;
    private int keeperResourceXpToday;
    private String keeperResourceXpDay = "";
    private Instant createdAt;
    private Instant updatedAt;

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public long getVersion() { return version; }
    public void setVersion(long version) { this.version = Math.max(0, version); }
    public int getTimber() { return timber; }
    public void setTimber(int timber) { this.timber = Math.max(0, timber); }
    public int getEssence() { return essence; }
    public void setEssence(int essence) { this.essence = Math.max(0, essence); }
    public int getStorehouseLevel() { return storehouseLevel; }
    public void setStorehouseLevel(int storehouseLevel) { this.storehouseLevel = Math.max(0, storehouseLevel); }
    public int getWoodlotLevel() { return woodlotLevel; }
    public void setWoodlotLevel(int woodlotLevel) { this.woodlotLevel = Math.max(1, woodlotLevel); }
    public int getArchiveLevel() { return archiveLevel; }
    public void setArchiveLevel(int archiveLevel) { this.archiveLevel = Math.max(0, archiveLevel); }
    public int getHallLevel() { return hallLevel; }
    public void setHallLevel(int hallLevel) { this.hallLevel = Math.max(1, hallLevel); }
    public String getHallThemeId() { return hallThemeId; }
    public void setHallThemeId(String hallThemeId) { this.hallThemeId = hallThemeId == null ? "" : hallThemeId; }
    public int getBuildersYardLevel() { return buildersYardLevel; }
    public void setBuildersYardLevel(int buildersYardLevel) { this.buildersYardLevel = Math.max(0, buildersYardLevel); }
    public int getEnclaveLevel() { return enclaveLevel; }
    public void setEnclaveLevel(int enclaveLevel) { this.enclaveLevel = Math.max(0, enclaveLevel); }
    public List<String> getEnclaveResidentIds() { return enclaveResidentIds; }
    public void setEnclaveResidentIds(List<String> enclaveResidentIds) { this.enclaveResidentIds = copy(enclaveResidentIds); }
    public Map<String, Integer> getEnclaveMissionProgress() { return enclaveMissionProgress; }
    public void setEnclaveMissionProgress(Map<String, Integer> enclaveMissionProgress) { this.enclaveMissionProgress = intMap(enclaveMissionProgress); }
    public Map<String, Integer> getEnclaveTaskProgress() { return enclaveTaskProgress; }
    public void setEnclaveTaskProgress(Map<String, Integer> values) { this.enclaveTaskProgress = intMap(values); }
    public Map<String, Integer> getEnclaveTaskCompletions() { return enclaveTaskCompletions; }
    public void setEnclaveTaskCompletions(Map<String, Integer> values) { this.enclaveTaskCompletions = intMap(values); }
    public Map<String, Integer> getResidentRapport() { return residentRapport; }
    public void setResidentRapport(Map<String, Integer> values) { this.residentRapport = intMap(values); }
    public String getFavoriteResidentId() { return favoriteResidentId; }
    public void setFavoriteResidentId(String favoriteResidentId) { this.favoriteResidentId = favoriteResidentId == null ? "" : favoriteResidentId; }
    public String getActiveConstructionId2() { return activeConstructionId2; }
    public void setActiveConstructionId2(String activeConstructionId2) { this.activeConstructionId2 = activeConstructionId2 == null ? "" : activeConstructionId2; }
    public Instant getConstructionStartedAt2() { return constructionStartedAt2; }
    public void setConstructionStartedAt2(Instant constructionStartedAt2) { this.constructionStartedAt2 = constructionStartedAt2; }
    public Instant getConstructionCompletesAt2() { return constructionCompletesAt2; }
    public void setConstructionCompletesAt2(Instant constructionCompletesAt2) { this.constructionCompletesAt2 = constructionCompletesAt2; }
    public List<String> getAdditionalConstructionIds() { return additionalConstructionIds; }
    public void setAdditionalConstructionIds(List<String> values) { this.additionalConstructionIds = copy(values); }
    public List<Instant> getAdditionalConstructionStartedAts() { return additionalConstructionStartedAts; }
    public void setAdditionalConstructionStartedAts(List<Instant> values) {
        this.additionalConstructionStartedAts = values == null ? new ArrayList<>() : new ArrayList<>(values);
    }
    public List<Instant> getAdditionalConstructionCompletesAts() { return additionalConstructionCompletesAts; }
    public void setAdditionalConstructionCompletesAts(List<Instant> values) {
        this.additionalConstructionCompletesAts = values == null ? new ArrayList<>() : new ArrayList<>(values);
    }
    public int getWoodlotStored() { return woodlotStored; }
    public void setWoodlotStored(int woodlotStored) { this.woodlotStored = Math.max(0, woodlotStored); }
    public double getWoodlotProductionRemainder() { return woodlotProductionRemainder; }
    public void setWoodlotProductionRemainder(double woodlotProductionRemainder) {
        this.woodlotProductionRemainder = Double.isFinite(woodlotProductionRemainder)
                ? Math.max(0, Math.min(0.999999999, woodlotProductionRemainder)) : 0;
    }
    public int getWoodlotCollectCount() { return woodlotCollectCount; }
    public void setWoodlotCollectCount(int woodlotCollectCount) { this.woodlotCollectCount = Math.max(0, woodlotCollectCount); }
    public Instant getWoodlotLastAccruedAt() { return woodlotLastAccruedAt; }
    public void setWoodlotLastAccruedAt(Instant woodlotLastAccruedAt) { this.woodlotLastAccruedAt = woodlotLastAccruedAt; }
    public String getWoodlotResidentId() { return woodlotResidentId; }
    public void setWoodlotResidentId(String woodlotResidentId) { this.woodlotResidentId = woodlotResidentId == null ? "" : woodlotResidentId; }
    public Map<String, Integer> getFacilityLevels() { return facilityLevels; }
    public void setFacilityLevels(Map<String, Integer> facilityLevels) { this.facilityLevels = intMap(facilityLevels); }
    public Map<String, Integer> getFacilityStored() { return facilityStored; }
    public void setFacilityStored(Map<String, Integer> facilityStored) { this.facilityStored = intMap(facilityStored); }
    public Map<String, Double> getFacilityProductionRemainders() { return facilityProductionRemainders; }
    public void setFacilityProductionRemainders(Map<String, Double> values) {
        this.facilityProductionRemainders = new LinkedHashMap<>();
        if (values != null) values.forEach((key, value) -> this.facilityProductionRemainders.put(key,
                value == null || !Double.isFinite(value) ? 0 : Math.max(0, Math.min(.999999999, value))));
    }
    public Map<String, Instant> getFacilityLastAccruedAt() { return facilityLastAccruedAt; }
    public void setFacilityLastAccruedAt(Map<String, Instant> values) {
        this.facilityLastAccruedAt = values == null ? new LinkedHashMap<>() : new LinkedHashMap<>(values);
    }
    public Map<String, String> getFacilityResidentIds() { return facilityResidentIds; }
    public void setFacilityResidentIds(Map<String, String> values) {
        this.facilityResidentIds = new LinkedHashMap<>();
        if (values != null) values.forEach((key, value) -> this.facilityResidentIds.put(key, value == null ? "" : value));
    }
    public Map<String, Integer> getMaterialInventory() { return materialInventory; }
    public void setMaterialInventory(Map<String, Integer> values) { this.materialInventory = intMap(values); }
    public Map<String, Integer> getCraftedItemCounts() { return craftedItemCounts; }
    public void setCraftedItemCounts(Map<String, Integer> values) { this.craftedItemCounts = intMap(values); }
    public Map<String, String> getPlacedDecorations() { return placedDecorations; }
    public void setPlacedDecorations(Map<String, String> values) {
        this.placedDecorations = new LinkedHashMap<>();
        if (values != null) values.forEach((key, value) -> this.placedDecorations.put(key, value == null ? "" : value));
    }
    public int getCraftCount() { return craftCount; }
    public void setCraftCount(int craftCount) { this.craftCount = Math.max(0, craftCount); }
    public int getEssenceCollectCount() { return essenceCollectCount; }
    public void setEssenceCollectCount(int essenceCollectCount) { this.essenceCollectCount = Math.max(0, essenceCollectCount); }
    public String getActiveConstructionId() { return activeConstructionId; }
    public void setActiveConstructionId(String activeConstructionId) { this.activeConstructionId = activeConstructionId == null ? "" : activeConstructionId; }
    public Instant getConstructionStartedAt() { return constructionStartedAt; }
    public void setConstructionStartedAt(Instant constructionStartedAt) { this.constructionStartedAt = constructionStartedAt; }
    public Instant getConstructionCompletesAt() { return constructionCompletesAt; }
    public void setConstructionCompletesAt(Instant constructionCompletesAt) { this.constructionCompletesAt = constructionCompletesAt; }
    public List<String> getUnlockedLoreIds() { return unlockedLoreIds; }
    public void setUnlockedLoreIds(List<String> unlockedLoreIds) { this.unlockedLoreIds = copy(unlockedLoreIds); }
    public List<String> getReadLoreIds() { return readLoreIds; }
    public void setReadLoreIds(List<String> readLoreIds) { this.readLoreIds = copy(readLoreIds); }
    public List<String> getCompletedConversationIds() { return completedConversationIds; }
    public void setCompletedConversationIds(List<String> completedConversationIds) { this.completedConversationIds = copy(completedConversationIds); }
    public List<String> getChoiceFlags() { return choiceFlags; }
    public void setChoiceFlags(List<String> choiceFlags) { this.choiceFlags = copy(choiceFlags); }
    public Map<String, Integer> getNpcTrust() { return npcTrust; }
    public void setNpcTrust(Map<String, Integer> npcTrust) {
        this.npcTrust = npcTrust == null ? new LinkedHashMap<>() : new LinkedHashMap<>(npcTrust);
    }
    public List<String> getActiveVisitorIds() { return activeVisitorIds; }
    public void setActiveVisitorIds(List<String> activeVisitorIds) { this.activeVisitorIds = copy(activeVisitorIds); }
    public Map<String, Instant> getVisitorAvailableAt() { return visitorAvailableAt; }
    public void setVisitorAvailableAt(Map<String, Instant> visitorAvailableAt) {
        this.visitorAvailableAt = visitorAvailableAt == null ? new LinkedHashMap<>() : new LinkedHashMap<>(visitorAvailableAt);
    }
    public Instant getLastVisitorRollAt() { return lastVisitorRollAt; }
    public void setLastVisitorRollAt(Instant lastVisitorRollAt) { this.lastVisitorRollAt = lastVisitorRollAt; }
    public List<String> getDisplayedMemorabiliaIds() { return displayedMemorabiliaIds; }
    public void setDisplayedMemorabiliaIds(List<String> displayedMemorabiliaIds) { this.displayedMemorabiliaIds = copy(displayedMemorabiliaIds); }
    public List<String> getProcessedRequestIds() { return processedRequestIds; }
    public void setProcessedRequestIds(List<String> processedRequestIds) { this.processedRequestIds = copy(processedRequestIds); }
    public Instant getLastVisitedAt() { return lastVisitedAt; }
    public void setLastVisitedAt(Instant lastVisitedAt) { this.lastVisitedAt = lastVisitedAt; }
    public Instant getLastTributeClaimedAt() { return lastTributeClaimedAt; }
    public void setLastTributeClaimedAt(Instant lastTributeClaimedAt) { this.lastTributeClaimedAt = lastTributeClaimedAt; }
    public long getKeeperXp() { return keeperXp; }
    public void setKeeperXp(long keeperXp) { this.keeperXp = Math.max(0, keeperXp); }
    public boolean isKeeperXpBackfilled() { return keeperXpBackfilled; }
    public void setKeeperXpBackfilled(boolean keeperXpBackfilled) { this.keeperXpBackfilled = keeperXpBackfilled; }
    public Instant getKeeperDailyXpAt() { return keeperDailyXpAt; }
    public void setKeeperDailyXpAt(Instant keeperDailyXpAt) { this.keeperDailyXpAt = keeperDailyXpAt; }
    public int getKeeperResourceXpToday() { return keeperResourceXpToday; }
    public void setKeeperResourceXpToday(int keeperResourceXpToday) { this.keeperResourceXpToday = Math.max(0, keeperResourceXpToday); }
    public String getKeeperResourceXpDay() { return keeperResourceXpDay; }
    public void setKeeperResourceXpDay(String keeperResourceXpDay) { this.keeperResourceXpDay = keeperResourceXpDay == null ? "" : keeperResourceXpDay; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    private static List<String> copy(List<String> values) {
        return values == null ? new ArrayList<>() : new ArrayList<>(values);
    }

    private static Map<String, Integer> intMap(Map<String, Integer> values) {
        Map<String, Integer> out = new LinkedHashMap<>();
        if (values != null) values.forEach((key, value) -> out.put(key, Math.max(0, value == null ? 0 : value)));
        return out;
    }
}
