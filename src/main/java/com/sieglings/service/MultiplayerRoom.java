package com.sieglings.service;

import com.sieglings.model.GameState;

import java.time.Instant;

public class MultiplayerRoom {
    private final String roomId;
    private final String hostToken;
    private String guestToken;
    private String hostName;
    private String guestName;
    private String hostUserId;
    private String guestUserId;
    private GameService.StartOptions hostOptions;
    private GameService.StartOptions guestOptions;
    private GameState gameState;
    private boolean hostLoadoutReady;
    private boolean guestLoadoutReady;
    private String format = "PVP";
    private boolean closed;
    private String endGameNotice;
    private int endGameNoticeSeq;
    private boolean hostRematchReady;
    private boolean guestRematchReady;
    private boolean hostReturnedHome;
    private boolean guestReturnedHome;
    private Instant createdAt = Instant.now();
    private Instant expiresAt;
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
    public String getHostUserId() { return hostUserId; }
    public void setHostUserId(String hostUserId) { this.hostUserId = hostUserId; }
    public String getGuestUserId() { return guestUserId; }
    public void setGuestUserId(String guestUserId) { this.guestUserId = guestUserId; }
    public GameService.StartOptions getHostOptions() { return hostOptions; }
    public void setHostOptions(GameService.StartOptions hostOptions) { this.hostOptions = hostOptions; }
    public GameService.StartOptions getGuestOptions() { return guestOptions; }
    public void setGuestOptions(GameService.StartOptions guestOptions) { this.guestOptions = guestOptions; }
    public GameState getGameState() { return gameState; }
    public void setGameState(GameState gameState) { this.gameState = gameState; }
    public boolean isHostLoadoutReady() { return hostLoadoutReady; }
    public void setHostLoadoutReady(boolean hostLoadoutReady) { this.hostLoadoutReady = hostLoadoutReady; }
    public boolean isGuestLoadoutReady() { return guestLoadoutReady; }
    public void setGuestLoadoutReady(boolean guestLoadoutReady) { this.guestLoadoutReady = guestLoadoutReady; }
    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }
    public boolean isClosed() { return closed; }
    public void setClosed(boolean closed) { this.closed = closed; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void touch() { updatedAt = Instant.now(); }

    public String getEndGameNotice() { return endGameNotice; }
    public void setEndGameNotice(String endGameNotice) { this.endGameNotice = endGameNotice; }
    public int getEndGameNoticeSeq() { return endGameNoticeSeq; }
    public void bumpEndGameNoticeSeq() { endGameNoticeSeq++; }
    public boolean isHostRematchReady() { return hostRematchReady; }
    public void setHostRematchReady(boolean hostRematchReady) { this.hostRematchReady = hostRematchReady; }
    public boolean isGuestRematchReady() { return guestRematchReady; }
    public void setGuestRematchReady(boolean guestRematchReady) { this.guestRematchReady = guestRematchReady; }
    public boolean isHostReturnedHome() { return hostReturnedHome; }
    public void setHostReturnedHome(boolean hostReturnedHome) { this.hostReturnedHome = hostReturnedHome; }
    public boolean isGuestReturnedHome() { return guestReturnedHome; }
    public void setGuestReturnedHome(boolean guestReturnedHome) { this.guestReturnedHome = guestReturnedHome; }

    public void clearEndGameSession() {
        endGameNotice = null;
        hostRematchReady = false;
        guestRematchReady = false;
        hostReturnedHome = false;
        guestReturnedHome = false;
    }

    public boolean isExpired(Instant now) {
        return !isStarted() && expiresAt != null && expiresAt.isBefore(now);
    }

    public boolean hasGuest() {
        return guestToken != null && guestName != null;
    }

    public boolean isLoadoutPhase() {
        return hasGuest() && !isStarted();
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
