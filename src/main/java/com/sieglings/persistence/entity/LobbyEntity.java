package com.sieglings.persistence.entity;

import java.time.Instant;

public class LobbyEntity {
    private String roomId;
    private String hostUserId;
    private String hostName;
    private String format = "PVP";
    private boolean started;
    private boolean closed;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();
    private Instant expiresAt;

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }
    public String getHostUserId() { return hostUserId; }
    public void setHostUserId(String hostUserId) { this.hostUserId = hostUserId; }
    public String getHostName() { return hostName; }
    public void setHostName(String hostName) { this.hostName = hostName; }
    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }
    public boolean isStarted() { return started; }
    public void setStarted(boolean started) { this.started = started; }
    public boolean isClosed() { return closed; }
    public void setClosed(boolean closed) { this.closed = closed; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
}
