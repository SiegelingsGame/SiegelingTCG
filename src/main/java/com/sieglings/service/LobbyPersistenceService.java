package com.sieglings.service;

import com.sieglings.persistence.entity.LobbyEntity;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
import com.sieglings.persistence.firestore.LobbyStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

@Service
public class LobbyPersistenceService {
    public static final Duration OPEN_LOBBY_TTL = Duration.ofMinutes(10);

    @Autowired
    private LobbyStore lobbyStore;

    @Autowired
    private FirestoreUserDataClient firestoreUserDataClient;

    @Lazy
    @Autowired
    private MultiplayerService multiplayerService;

    public void registerOpenLobby(MultiplayerRoom room, String hostUserId) {
        Instant now = Instant.now();
        LobbyEntity lobby = new LobbyEntity();
        lobby.setRoomId(room.getRoomId());
        lobby.setHostUserId(hostUserId);
        lobby.setHostName(room.getHostName());
        lobby.setFormat(room.getFormat());
        lobby.setStarted(false);
        lobby.setClosed(false);
        lobby.setCreatedAt(now);
        lobby.setUpdatedAt(now);
        lobby.setExpiresAt(now.plus(OPEN_LOBBY_TTL));
        lobbyStore.save(lobby);
        room.setExpiresAt(lobby.getExpiresAt());
        room.setCreatedAt(now);
        room.setClosed(false);
    }

    public void markStarted(String roomId) {
        lobbyStore.findByRoomId(roomId).ifPresent(lobby -> {
            lobby.setStarted(true);
            lobby.setUpdatedAt(Instant.now());
            lobbyStore.save(lobby);
        });
    }

    public void closeLobby(String roomId, String hostUserId) {
        lobbyStore.findByRoomId(roomId).ifPresent(lobby -> {
            if (hostUserId != null && lobby.getHostUserId() != null && !hostUserId.equals(lobby.getHostUserId())) {
                throw new IllegalArgumentException("Only the host can close this lobby.");
            }
            lobby.setClosed(true);
            lobby.setUpdatedAt(Instant.now());
            lobbyStore.save(lobby);
        });
        multiplayerService.removeRoom(roomId);
    }

    public boolean isJoinable(String roomId, Instant now) {
        return lobbyStore.findByRoomId(roomId)
                .map(lobby -> !lobby.isClosed() && !lobby.isStarted()
                        && lobby.getExpiresAt() != null && lobby.getExpiresAt().isAfter(now))
                .orElse(false);
    }

    @Scheduled(fixedRate = 60_000)
    public void purgeExpiredLobbies() {
        Instant now = Instant.now();
        if (!firestoreUserDataClient.isAvailable()) {
            multiplayerService.purgeExpiredRooms(now);
            return;
        }
        for (LobbyEntity lobby : lobbyStore.listOpenLobbies(now)) {
            if (lobby.getExpiresAt() != null && lobby.getExpiresAt().isBefore(now)) {
                lobby.setClosed(true);
                lobby.setUpdatedAt(now);
                lobbyStore.save(lobby);
                multiplayerService.removeRoom(lobby.getRoomId());
            }
        }
        multiplayerService.purgeExpiredRooms(now);
    }
}
