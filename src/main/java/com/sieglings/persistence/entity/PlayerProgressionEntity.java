package com.sieglings.persistence.entity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class PlayerProgressionEntity {
    private String userId;
    private int gold;
    private Map<String, Integer> ownedCards = new LinkedHashMap<>();
    private String starterPackId;
    private List<String> rewardedMatchIds = new ArrayList<>();
    private List<String> purchasedDeckIds = new ArrayList<>();
    private List<String> purchasedDailyOfferIds = new ArrayList<>();
    private List<Map<String, Object>> packHistory = new ArrayList<>();
    private int soloWinStreak;
    private int onlineWinStreak;
    private Instant updatedAt = Instant.now();

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public int getGold() { return gold; }
    public void setGold(int gold) { this.gold = gold; }
    public Map<String, Integer> getOwnedCards() { return ownedCards; }
    public void setOwnedCards(Map<String, Integer> ownedCards) {
        this.ownedCards = ownedCards == null ? new LinkedHashMap<>() : new LinkedHashMap<>(ownedCards);
    }
    public String getStarterPackId() { return starterPackId; }
    public void setStarterPackId(String starterPackId) { this.starterPackId = starterPackId; }
    public List<String> getRewardedMatchIds() { return rewardedMatchIds; }
    public void setRewardedMatchIds(List<String> rewardedMatchIds) {
        this.rewardedMatchIds = rewardedMatchIds == null ? new ArrayList<>() : new ArrayList<>(rewardedMatchIds);
    }
    public List<String> getPurchasedDeckIds() { return purchasedDeckIds; }
    public void setPurchasedDeckIds(List<String> purchasedDeckIds) {
        this.purchasedDeckIds = purchasedDeckIds == null ? new ArrayList<>() : new ArrayList<>(purchasedDeckIds);
    }
    public List<String> getPurchasedDailyOfferIds() { return purchasedDailyOfferIds; }
    public void setPurchasedDailyOfferIds(List<String> purchasedDailyOfferIds) {
        this.purchasedDailyOfferIds = purchasedDailyOfferIds == null ? new ArrayList<>() : new ArrayList<>(purchasedDailyOfferIds);
    }
    public List<Map<String, Object>> getPackHistory() { return packHistory; }
    public void setPackHistory(List<Map<String, Object>> packHistory) {
        this.packHistory = packHistory == null ? new ArrayList<>() : new ArrayList<>(packHistory);
    }
    public int getSoloWinStreak() { return soloWinStreak; }
    public void setSoloWinStreak(int soloWinStreak) { this.soloWinStreak = Math.max(0, soloWinStreak); }
    public int getOnlineWinStreak() { return onlineWinStreak; }
    public void setOnlineWinStreak(int onlineWinStreak) { this.onlineWinStreak = Math.max(0, onlineWinStreak); }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
