package com.sieglings.persistence.entity;

import java.time.Instant;

public class UserPresenceEntity {
    private String userId;
    /** ONLINE, IN_GAME, AWAY */
    private String status = "ONLINE";
    private String currentRoomId;
    private Instant lastSeenAt = Instant.now();

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getCurrentRoomId() { return currentRoomId; }
    public void setCurrentRoomId(String currentRoomId) { this.currentRoomId = currentRoomId; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(Instant lastSeenAt) { this.lastSeenAt = lastSeenAt; }
}
