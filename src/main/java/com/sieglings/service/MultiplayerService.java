package com.sieglings.service;

import com.sieglings.model.GameState;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MultiplayerService {

    public record RoomSession(
            String roomId,
            String playerToken,
            boolean viewerIsPlayer,
            boolean started
    ) {}

    private static final String ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final SecureRandom random = new SecureRandom();
    private final Map<String, MultiplayerRoom> rooms = new ConcurrentHashMap<>();

    @Autowired
    private GameService gameService;

    @Autowired(required = false)
    private LobbyPersistenceService lobbyPersistenceService;

    public synchronized RoomSession createRoom(String playerName, GameService.StartOptions options, String accountUserId) {
        String roomId = generateRoomId();
        String token = generateToken();
        MultiplayerRoom room = new MultiplayerRoom(roomId, token, safeName(playerName, "Host"), options);
        room.setHostUserId(accountUserId);
        room.setFormat("PVP");
        rooms.put(roomId, room);
        if (lobbyPersistenceService != null) {
            lobbyPersistenceService.registerOpenLobby(room, accountUserId);
        } else {
            Instant now = Instant.now();
            room.setCreatedAt(now);
            room.setExpiresAt(now.plus(LobbyPersistenceService.OPEN_LOBBY_TTL));
        }
        return new RoomSession(roomId, token, true, false);
    }

    public synchronized RoomSession joinRoom(String roomId, String playerName, GameService.StartOptions options, String accountUserId) {
        MultiplayerRoom room = requireJoinableRoom(roomId);
        if (room.isStarted()) {
            throw new IllegalArgumentException("That room has already started.");
        }
        if (room.hasGuest()) {
            throw new IllegalArgumentException("That room is already full.");
        }

        String token = generateToken();
        room.setGuestToken(token);
        room.setGuestName(safeName(playerName, "Guest"));
        room.setGuestUserId(accountUserId);
        room.touch();
        return new RoomSession(roomId, token, false, false);
    }

    public synchronized RoomSession submitLoadout(String roomId, String token, GameService.StartOptions options, String accountUserId) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        if (room.isStarted()) {
            throw new IllegalArgumentException("That match has already started.");
        }
        if (!room.hasGuest()) {
            throw new IllegalArgumentException("Waiting for another player to join.");
        }

        boolean isHost = room.isHostToken(token);
        if (isHost) {
            room.setHostOptions(options);
            room.setHostLoadoutReady(true);
        } else {
            room.setGuestOptions(options);
            room.setGuestLoadoutReady(true);
        }
        room.touch();

        if (room.isHostLoadoutReady() && room.isGuestLoadoutReady()) {
            startMatch(room);
            return new RoomSession(roomId, token, isHost, true);
        }
        return new RoomSession(roomId, token, isHost, false);
    }

    private void startMatch(MultiplayerRoom room) {
        GameState gameState = gameService.newMultiplayerGame(
                room.getHostOptions(),
                room.getGuestOptions(),
                room.getHostName(),
                room.getGuestName()
        );
        if (room.getHostUserId() != null) {
            gameState.getPlayer().setAccountUserId(room.getHostUserId());
        }
        if (room.getGuestUserId() != null) {
            gameState.getEnemy().setAccountUserId(room.getGuestUserId());
        }
        room.setGameState(gameState);
        if (lobbyPersistenceService != null) {
            lobbyPersistenceService.markStarted(room.getRoomId());
        }
    }

    public synchronized void closeRoom(String roomId, String hostUserId) {
        if (lobbyPersistenceService != null) {
            lobbyPersistenceService.closeLobby(roomId, hostUserId);
        } else {
            MultiplayerRoom room = rooms.get(roomId);
            if (room != null) {
                room.setClosed(true);
            }
            removeRoom(roomId);
        }
    }

    public List<MultiplayerRoom> listOpenRooms() {
        Instant now = Instant.now();
        purgeExpiredRooms(now);
        return rooms.values().stream()
                .filter(room -> !room.isClosed())
                .filter(room -> !room.isExpired(now))
                .filter(room -> !room.isStarted())
                .filter(room -> !room.hasGuest())
                .sorted((left, right) -> right.getUpdatedAt().compareTo(left.getUpdatedAt()))
                .toList();
    }

    public MultiplayerRoom getRoom(String roomId) {
        MultiplayerRoom room = rooms.get(roomId);
        if (room != null && room.isExpired(Instant.now())) {
            removeRoom(roomId);
            return null;
        }
        return room;
    }

    public MultiplayerRoom requireRoom(String roomId) {
        MultiplayerRoom room = getRoom(roomId);
        if (room == null) {
            throw new IllegalArgumentException("Room not found.");
        }
        return room;
    }

    public MultiplayerRoom requireJoinableRoom(String roomId) {
        Instant now = Instant.now();
        MultiplayerRoom room = requireRoom(roomId);
        if (room.isClosed() || room.isExpired(now)) {
            throw new IllegalArgumentException("That lobby has expired.");
        }
        if (lobbyPersistenceService != null && !lobbyPersistenceService.isJoinable(roomId, now)) {
            throw new IllegalArgumentException("That lobby is no longer available.");
        }
        return room;
    }

    public void removeRoom(String roomId) {
        if (roomId != null) {
            rooms.remove(roomId);
        }
    }

    public void purgeExpiredRooms(Instant now) {
        rooms.values().removeIf(room -> room.isExpired(now) || room.isClosed());
    }

    public boolean viewerIsPlayer(String roomId, String token) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        return room.isHostToken(token);
    }

    public MultiplayerRoom requireAuthorizedRoom(String roomId, String token) {
        MultiplayerRoom room = requireRoom(roomId);
        if (token == null || (!room.isHostToken(token) && !room.isGuestToken(token))) {
            throw new IllegalArgumentException("Room access denied.");
        }
        return room;
    }

    public GameState getRoomState(String roomId, String token) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        return room.getGameState();
    }

    public synchronized GameState draw(String roomId, String token) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        room.touch();
        return gameService.draw(room.getGameState(), room.isHostToken(token));
    }

    public synchronized GameState placeSiegling(String roomId, String token, String cardId, int row, int col) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        room.touch();
        return gameService.placeSiegling(room.getGameState(), room.isHostToken(token), cardId, row, col);
    }

    public synchronized GameState castSpell(String roomId, String token, String cardId,
                                            int targetRow, int targetCol, int destRow, int destCol) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        room.touch();
        return gameService.castSpell(room.getGameState(), room.isHostToken(token), cardId, targetRow, targetCol, destRow, destCol);
    }

    public synchronized GameState claimSiegling(String roomId, String token, int row, int col) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        room.touch();
        return gameService.claimSiegling(room.getGameState(), room.isHostToken(token), row, col);
    }

    public synchronized GameState useTrainer(String roomId, String token, int targetRow, int targetCol) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        room.touch();
        return gameService.useTrainerAbility(room.getGameState(), room.isHostToken(token), targetRow, targetCol);
    }

    public synchronized GameState battle(String roomId, String token) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        room.touch();
        return gameService.executeBattle(room.getGameState());
    }

    public synchronized GameState battleAction(String roomId, String token, int abilityIndex, int targetRow, int targetCol) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        room.touch();
        return gameService.submitBattleAction(room.getGameState(), room.isHostToken(token), abilityIndex, targetRow, targetCol);
    }

    public synchronized GameState endTurn(String roomId, String token) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        room.touch();
        return gameService.endTurn(room.getGameState(), room.isHostToken(token));
    }

    public synchronized GameState mulligan(String roomId, String token, List<Integer> mulliganHandIndices) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        room.touch();
        return gameService.resolveOpeningMulligan(room.getGameState(), room.isHostToken(token), mulliganHandIndices);
    }

    public List<int[]> getLegalPlacements(String roomId, String token) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        return gameService.getLegalPlacements(room.getGameState(), room.isHostToken(token));
    }

    private String generateRoomId() {
        StringBuilder builder = new StringBuilder();
        do {
            builder.setLength(0);
            for (int i = 0; i < 6; i++) {
                builder.append(ROOM_ALPHABET.charAt(random.nextInt(ROOM_ALPHABET.length())));
            }
        } while (rooms.containsKey(builder.toString()));
        return builder.toString();
    }

    private String generateToken() {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < 24; i++) {
            builder.append(ROOM_ALPHABET.charAt(random.nextInt(ROOM_ALPHABET.length())));
        }
        return builder.toString();
    }

    private String safeName(String raw, String fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        String trimmed = raw.trim();
        return trimmed.length() > 20 ? trimmed.substring(0, 20) : trimmed;
    }
}
