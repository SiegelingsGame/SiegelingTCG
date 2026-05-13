package com.sieglings.persistence.entity;

import java.time.Instant;

public class MatchHistoryEntity {

    private String id;
    private String userId;
    private String userDisplayName;
    private Instant finishedAt = Instant.now();
    private String result;
    private String matchType;
    private String opponentName;
    private String loadoutLabel;
    private String trainerName;
    private Integer turnNumber;
    private int spellsCast;
    private int trapsSprung;
    private int siegelingsDefeated;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getUserDisplayName() {
        return userDisplayName;
    }

    public void setUserDisplayName(String userDisplayName) {
        this.userDisplayName = userDisplayName;
    }

    public Instant getFinishedAt() {
        return finishedAt;
    }

    public void setFinishedAt(Instant finishedAt) {
        this.finishedAt = finishedAt;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public String getMatchType() {
        return matchType;
    }

    public void setMatchType(String matchType) {
        this.matchType = matchType;
    }

    public String getOpponentName() {
        return opponentName;
    }

    public void setOpponentName(String opponentName) {
        this.opponentName = opponentName;
    }

    public String getLoadoutLabel() {
        return loadoutLabel;
    }

    public void setLoadoutLabel(String loadoutLabel) {
        this.loadoutLabel = loadoutLabel;
    }

    public String getTrainerName() {
        return trainerName;
    }

    public void setTrainerName(String trainerName) {
        this.trainerName = trainerName;
    }

    public Integer getTurnNumber() {
        return turnNumber;
    }

    public void setTurnNumber(Integer turnNumber) {
        this.turnNumber = turnNumber;
    }

    public int getSpellsCast() {
        return spellsCast;
    }

    public void setSpellsCast(int spellsCast) {
        this.spellsCast = spellsCast;
    }

    public int getTrapsSprung() {
        return trapsSprung;
    }

    public void setTrapsSprung(int trapsSprung) {
        this.trapsSprung = trapsSprung;
    }

    public int getSiegelingsDefeated() {
        return siegelingsDefeated;
    }

    public void setSiegelingsDefeated(int siegelingsDefeated) {
        this.siegelingsDefeated = siegelingsDefeated;
    }
}
