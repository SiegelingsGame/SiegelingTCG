package com.sieglings.service;

import com.sieglings.model.GameState;

import java.time.Instant;

public class MultiplayerRoom {
    private final String roomId;
    private final String hostToken;
    private String guestToken;
    private String hostName;
    private String guestName;
    private Long hostUserId;
    private Long guestUserId;
    private GameService.StartOptions hostOptions;
    private GameService.StartOptions guestOptions;
    private GameState gameState;
    private Instant updatedAt = Instant.now();

    public MultiplayerRoom(String roomId, String hostToken, String hostName, GameService.StartOptions hostOptions) {
        this.roomId = roomId;
        this.hostToken = hostToken;
        this.hostName = hostName;
        this.hostOptions = hostOptions;
    }

    public String getRoomId() { return roomId; }
    public String getHostToken() { return hostToken; }
    public String getGuestToken() { return guestToken; }
    public void setGuestToken(String guestToken) { this.guestToken = guestToken; }
    public String getHostName() { return hostName; }
    public void setHostName(String hostName) { this.hostName = hostName; }
    public String getGuestName() { return guestName; }
    public void setGuestName(String guestName) { this.guestName = guestName; }
    public Long getHostUserId() { return hostUserId; }
    public void setHostUserId(Long hostUserId) { this.hostUserId = hostUserId; }
    public Long getGuestUserId() { return guestUserId; }
    public void setGuestUserId(Long guestUserId) { this.guestUserId = guestUserId; }
    public GameService.StartOptions getHostOptions() { return hostOptions; }
    public void setHostOptions(GameService.StartOptions hostOptions) { this.hostOptions = hostOptions; }
    public GameService.StartOptions getGuestOptions() { return guestOptions; }
    public void setGuestOptions(GameService.StartOptions guestOptions) { this.guestOptions = guestOptions; }
    public GameState getGameState() { return gameState; }
    public void setGameState(GameState gameState) { this.gameState = gameState; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void touch() { updatedAt = Instant.now(); }

    public boolean hasGuest() {
        return guestToken != null && guestName != null && guestOptions != null;
    }

    public boolean isStarted() {
        return gameState != null;
    }

    public boolean isHostToken(String token) {
        return hostToken.equals(token);
    }

    public boolean isGuestToken(String token) {
        return guestToken != null && guestToken.equals(token);
    }
}
