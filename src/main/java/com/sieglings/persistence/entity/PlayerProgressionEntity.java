package com.sieglings.persistence.entity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class PlayerProgressionEntity {
    private String userId;
    private int gold;
    private int remnants;
    /** Battlegrounds-only currency, earned in Battlegrounds runs and spent in its shop. */
    private int warmarks;
    /** Highest Battlegrounds tier the player has cleared (0 = none; tier N unlocks tier N+1). */
    private int battlegroundsTier;
    /** Cosmetic / shop unlocks bought with Warmarks (owned-flag ids). */
    private List<String> battlegroundsUnlocks = new ArrayList<>();
    private Map<String, Integer> ownedCards = new LinkedHashMap<>();
    private Map<String, Integer> trainerLevels = new LinkedHashMap<>();
    private Map<String, Integer> trainerPoints = new LinkedHashMap<>();
    private String starterPackId;
    private boolean tutorialCompleted;
    private List<String> rewardedMatchIds = new ArrayList<>();
    private List<String> purchasedDeckIds = new ArrayList<>();
    private List<String> purchasedDailyOfferIds = new ArrayList<>();
    private List<String> completedPackOpenRequestIds = new ArrayList<>();
    private List<Map<String, Object>> packHistory = new ArrayList<>();
    private int soloWinStreak;
    private int onlineWinStreak;
    private List<String> purchasedTitleIds = new ArrayList<>();
    private int craftCount;
    /** Card or SiegeKnight ids the player upgraded to a holographic foil finish. */
    private List<String> holographicCardIds = new ArrayList<>();
    /** SiegeKnight ids unlocked for expedition warband selection (gold purchase). */
    private List<String> siegeUnlockedKnights = new ArrayList<>();
    /** Lifetime Siege / Adventure expedition stats, powering siege achievements and titles. */
    private int siegeRuns;
    private int siegeWins;
    private int siegeBossKills;
    private int siegeNodesCleared;
    private int siegeBestScore;
    private Instant updatedAt = Instant.now();

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public int getGold() { return gold; }
    public void setGold(int gold) { this.gold = gold; }
    public int getRemnants() { return remnants; }
    public void setRemnants(int remnants) { this.remnants = Math.max(0, remnants); }
    public int getWarmarks() { return warmarks; }
    public void setWarmarks(int warmarks) { this.warmarks = Math.max(0, warmarks); }
    public int getBattlegroundsTier() { return battlegroundsTier; }
    public void setBattlegroundsTier(int battlegroundsTier) { this.battlegroundsTier = Math.max(0, battlegroundsTier); }
    public List<String> getBattlegroundsUnlocks() { return battlegroundsUnlocks; }
    public void setBattlegroundsUnlocks(List<String> battlegroundsUnlocks) {
        this.battlegroundsUnlocks = battlegroundsUnlocks == null ? new ArrayList<>() : new ArrayList<>(battlegroundsUnlocks);
    }
    public Map<String, Integer> getOwnedCards() { return ownedCards; }
    public void setOwnedCards(Map<String, Integer> ownedCards) {
        this.ownedCards = ownedCards == null ? new LinkedHashMap<>() : new LinkedHashMap<>(ownedCards);
    }
    public Map<String, Integer> getTrainerLevels() { return trainerLevels; }
    public void setTrainerLevels(Map<String, Integer> trainerLevels) {
        this.trainerLevels = trainerLevels == null ? new LinkedHashMap<>() : new LinkedHashMap<>(trainerLevels);
    }
    public Map<String, Integer> getTrainerPoints() { return trainerPoints; }
    public void setTrainerPoints(Map<String, Integer> trainerPoints) {
        this.trainerPoints = trainerPoints == null ? new LinkedHashMap<>() : new LinkedHashMap<>(trainerPoints);
    }
    public String getStarterPackId() { return starterPackId; }
    public void setStarterPackId(String starterPackId) { this.starterPackId = starterPackId; }

    public boolean isTutorialCompleted() { return tutorialCompleted; }
    public void setTutorialCompleted(boolean tutorialCompleted) { this.tutorialCompleted = tutorialCompleted; }
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
    public List<String> getCompletedPackOpenRequestIds() { return completedPackOpenRequestIds; }
    public void setCompletedPackOpenRequestIds(List<String> completedPackOpenRequestIds) {
        this.completedPackOpenRequestIds = completedPackOpenRequestIds == null ? new ArrayList<>() : new ArrayList<>(completedPackOpenRequestIds);
    }
    public List<Map<String, Object>> getPackHistory() { return packHistory; }
    public void setPackHistory(List<Map<String, Object>> packHistory) {
        this.packHistory = packHistory == null ? new ArrayList<>() : new ArrayList<>(packHistory);
    }
    public int getSoloWinStreak() { return soloWinStreak; }
    public void setSoloWinStreak(int soloWinStreak) { this.soloWinStreak = Math.max(0, soloWinStreak); }
    public int getOnlineWinStreak() { return onlineWinStreak; }
    public void setOnlineWinStreak(int onlineWinStreak) { this.onlineWinStreak = Math.max(0, onlineWinStreak); }
    public List<String> getPurchasedTitleIds() { return purchasedTitleIds; }
    public void setPurchasedTitleIds(List<String> purchasedTitleIds) {
        this.purchasedTitleIds = purchasedTitleIds == null ? new ArrayList<>() : new ArrayList<>(purchasedTitleIds);
    }
    public int getCraftCount() { return craftCount; }
    public void setCraftCount(int craftCount) { this.craftCount = Math.max(0, craftCount); }
    public List<String> getHolographicCardIds() { return holographicCardIds; }
    public void setHolographicCardIds(List<String> holographicCardIds) {
        this.holographicCardIds = holographicCardIds == null ? new ArrayList<>() : new ArrayList<>(holographicCardIds);
    }
    public List<String> getSiegeUnlockedKnights() { return siegeUnlockedKnights; }
    public void setSiegeUnlockedKnights(List<String> siegeUnlockedKnights) {
        this.siegeUnlockedKnights = siegeUnlockedKnights == null ? new ArrayList<>() : new ArrayList<>(siegeUnlockedKnights);
    }
    public int getSiegeRuns() { return siegeRuns; }
    public void setSiegeRuns(int siegeRuns) { this.siegeRuns = Math.max(0, siegeRuns); }
    public int getSiegeWins() { return siegeWins; }
    public void setSiegeWins(int siegeWins) { this.siegeWins = Math.max(0, siegeWins); }
    public int getSiegeBossKills() { return siegeBossKills; }
    public void setSiegeBossKills(int siegeBossKills) { this.siegeBossKills = Math.max(0, siegeBossKills); }
    public int getSiegeNodesCleared() { return siegeNodesCleared; }
    public void setSiegeNodesCleared(int siegeNodesCleared) { this.siegeNodesCleared = Math.max(0, siegeNodesCleared); }
    public int getSiegeBestScore() { return siegeBestScore; }
    public void setSiegeBestScore(int siegeBestScore) { this.siegeBestScore = Math.max(0, siegeBestScore); }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
