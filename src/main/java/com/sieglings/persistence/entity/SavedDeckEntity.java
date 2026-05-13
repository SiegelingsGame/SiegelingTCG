package com.sieglings.persistence.entity;

import java.time.Instant;

public class SavedDeckEntity {

    private String id;
    private String userId;
    private String name;
    private String presetDeckId;
    private String trainerId;
    private String customDeckCardsJson;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPresetDeckId() {
        return presetDeckId;
    }

    public void setPresetDeckId(String presetDeckId) {
        this.presetDeckId = presetDeckId;
    }

    public String getTrainerId() {
        return trainerId;
    }

    public void setTrainerId(String trainerId) {
        this.trainerId = trainerId;
    }

    public String getCustomDeckCardsJson() {
        return customDeckCardsJson;
    }

    public void setCustomDeckCardsJson(String customDeckCardsJson) {
        this.customDeckCardsJson = customDeckCardsJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
