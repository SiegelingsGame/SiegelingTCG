package com.sieglings.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "match_history")
public class MatchHistoryEntity {

    @Id
    @Column(length = 40)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AccountUser user;

    @Column(nullable = false)
    private Instant finishedAt = Instant.now();

    @Column(nullable = false, length = 16)
    private String result;

    @Column(nullable = false, length = 24)
    private String matchType;

    @Column(nullable = false, length = 60)
    private String opponentName;

    @Column(nullable = false, length = 60)
    private String loadoutLabel;

    @Column(nullable = false, length = 60)
    private String trainerName;

    @Column
    private Integer turnNumber;

    @Column(nullable = false)
    private int spellsCast;

    @Column(nullable = false)
    private int trapsSprung;

    @Column(nullable = false)
    private int siegelingsDefeated;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public AccountUser getUser() {
        return user;
    }

    public void setUser(AccountUser user) {
        this.user = user;
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
