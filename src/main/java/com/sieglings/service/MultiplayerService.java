package com.sieglings.service;

import com.sieglings.model.GameState;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
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

    public synchronized RoomSession createRoom(String playerName, GameService.StartOptions options, String accountUserId) {
        String roomId = generateRoomId();
        String token = generateToken();
        MultiplayerRoom room = new MultiplayerRoom(roomId, token, safeName(playerName, "Host"), options);
        room.setHostUserId(accountUserId);
        rooms.put(roomId, room);
        return new RoomSession(roomId, token, true, false);
    }

    public synchronized RoomSession joinRoom(String roomId, String playerName, GameService.StartOptions options, String accountUserId) {
        MultiplayerRoom room = requireRoom(roomId);
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
        room.setGuestOptions(options);
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
        room.touch();
        return new RoomSession(roomId, token, false, true);
    }

    public MultiplayerRoom getRoom(String roomId) {
        return rooms.get(roomId);
    }

    public List<MultiplayerRoom> listOpenRooms() {
        return rooms.values().stream()
                .filter(room -> !room.isStarted())
                .filter(room -> !room.hasGuest())
                .sorted((left, right) -> right.getUpdatedAt().compareTo(left.getUpdatedAt()))
                .toList();
    }

    public MultiplayerRoom requireRoom(String roomId) {
        MultiplayerRoom room = rooms.get(roomId);
        if (room == null) {
            throw new IllegalArgumentException("Room not found.");
        }
        return room;
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
