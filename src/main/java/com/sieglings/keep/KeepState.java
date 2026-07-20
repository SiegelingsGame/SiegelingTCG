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
    private int woodlotLevel = 1;
    private int archiveLevel;
    private int woodlotStored;
    private double woodlotProductionRemainder;
    private int woodlotCollectCount;
    private Instant woodlotLastAccruedAt;
    private String woodlotResidentId = "";
    private String activeConstructionId = "";
    private Instant constructionStartedAt;
    private Instant constructionCompletesAt;
    private List<String> unlockedLoreIds = new ArrayList<>();
    private List<String> readLoreIds = new ArrayList<>();
    private List<String> completedConversationIds = new ArrayList<>();
    private List<String> choiceFlags = new ArrayList<>();
    private Map<String, Integer> npcTrust = new LinkedHashMap<>();
    private List<String> displayedMemorabiliaIds = new ArrayList<>();
    private List<String> processedRequestIds = new ArrayList<>();
    private Instant createdAt;
    private Instant updatedAt;

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public long getVersion() { return version; }
    public void setVersion(long version) { this.version = Math.max(0, version); }
    public int getTimber() { return timber; }
    public void setTimber(int timber) { this.timber = Math.max(0, timber); }
    public int getWoodlotLevel() { return woodlotLevel; }
    public void setWoodlotLevel(int woodlotLevel) { this.woodlotLevel = Math.max(1, woodlotLevel); }
    public int getArchiveLevel() { return archiveLevel; }
    public void setArchiveLevel(int archiveLevel) { this.archiveLevel = Math.max(0, archiveLevel); }
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
    public List<String> getDisplayedMemorabiliaIds() { return displayedMemorabiliaIds; }
    public void setDisplayedMemorabiliaIds(List<String> displayedMemorabiliaIds) { this.displayedMemorabiliaIds = copy(displayedMemorabiliaIds); }
    public List<String> getProcessedRequestIds() { return processedRequestIds; }
    public void setProcessedRequestIds(List<String> processedRequestIds) { this.processedRequestIds = copy(processedRequestIds); }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    private static List<String> copy(List<String> values) {
        return values == null ? new ArrayList<>() : new ArrayList<>(values);
    }
}
