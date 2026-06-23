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
            try {
                lobbyPersistenceService.registerOpenLobby(room, accountUserId);
            } catch (IllegalStateException ex) {
                initializeLocalLobbyDeadline(room);
            }
        } else {
            initializeLocalLobbyDeadline(room);
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
        if (accountUserId != null && accountUserId.equals(room.getHostUserId())) {
            throw new IllegalArgumentException("You are hosting this table. Open the waiting room instead of joining as a guest.");
        }
        String token = generateToken();
        room.setGuestToken(token);
        room.setGuestName(safeName(playerName, "Guest"));
        room.setGuestUserId(accountUserId);
        room.setGuestOptions(options);
        room.setGuestReady(false);
        room.touch();
        room.addLobbyChatMessage(room.getGuestName(), "guest", "Joined the waiting room.");
        return new RoomSession(roomId, token, false, false);
    }

    public synchronized RoomSession setPlayerReady(String roomId,
                                                   String token,
                                                   String playerName,
                                                   GameService.StartOptions options) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        if (room.isStarted()) {
            throw new IllegalArgumentException("Match already started.");
        }
        if (room.isHostToken(token)) {
            if (playerName != null && !playerName.isBlank()) {
                room.setHostName(safeName(playerName, room.getHostName()));
            }
            if (options != null && options.playerDeckId() != null && options.playerTrainerId() != null) {
                room.setHostOptions(options);
            }
            room.setHostReady(true);
            room.addLobbyChatMessage(room.getHostName(), "host", "Confirmed loadout and is ready.");
        } else if (room.isGuestToken(token)) {
            if (playerName != null && !playerName.isBlank()) {
                room.setGuestName(safeName(playerName, room.getGuestName()));
            }
            if (options != null && options.playerDeckId() != null && options.playerTrainerId() != null) {
                room.setGuestOptions(options);
            }
            room.setGuestReady(true);
            room.addLobbyChatMessage(room.getGuestName(), "guest", "Confirmed loadout and is ready.");
        } else {
            throw new IllegalArgumentException("Room access denied.");
        }
        room.touch();
        if (room.hasGuest() && room.isHostReady() && room.isGuestReady()) {
            startMatch(room);
            return new RoomSession(roomId, token, room.isHostToken(token), true);
        }
        return new RoomSession(roomId, token, room.isHostToken(token), false);
    }

    public synchronized RoomSession reconnectHost(String roomId, String accountUserId) {
        MultiplayerRoom room = requireRoom(roomId);
        if (room.isClosed()) {
            throw new IllegalArgumentException("That lobby has been closed.");
        }
        if (room.isExpired(Instant.now())) {
            throw new IllegalArgumentException("That lobby has expired.");
        }
        if (accountUserId == null || room.getHostUserId() == null || !accountUserId.equals(room.getHostUserId())) {
            throw new IllegalArgumentException("Only the host can reopen this lobby.");
        }
        if (room.isStarted()) {
            return new RoomSession(roomId, room.getHostToken(), true, true);
        }
        room.touch();
        return new RoomSession(roomId, room.getHostToken(), true, false);
    }

    public synchronized void leaveLobby(String roomId, String token) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        if (room.isStarted()) {
            throw new IllegalArgumentException("Match already started.");
        }
        if (room.isHostToken(token)) {
            throw new IllegalArgumentException("Hosts should use Close Lobby to end the table.");
        }
        if (!room.isGuestToken(token)) {
            throw new IllegalArgumentException("Room access denied.");
        }
        String guestName = room.getGuestName();
        room.clearGuest();
        room.touch();
        room.addLobbyChatMessage("Arena", "system",
                (guestName == null || guestName.isBlank() ? "A player" : guestName) + " left the waiting room.");
    }

    public synchronized void addLobbyChat(String roomId, String token, String message) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        if (room.isStarted()) {
            throw new IllegalArgumentException("Match already started.");
        }
        String author = room.isHostToken(token) ? room.getHostName() : room.getGuestName();
        String role = room.isHostToken(token) ? "host" : "guest";
        room.addLobbyChatMessage(author, role, message);
        room.touch();
    }

    private void startMatch(MultiplayerRoom room) {
        if (room.isStarted() || !room.hasGuest()) {
            return;
        }
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
            try {
                lobbyPersistenceService.markStarted(room.getRoomId());
            } catch (IllegalStateException ignored) {
                // The in-memory room has already started; persistence can catch up later.
            }
        }
        room.addLobbyChatMessage("Arena", "system", "Both players are ready — match starting.");
    }

    public synchronized void closeRoom(String roomId, String hostUserId) {
        if (lobbyPersistenceService != null) {
            try {
                lobbyPersistenceService.closeLobby(roomId, hostUserId);
            } catch (IllegalStateException ex) {
                MultiplayerRoom room = rooms.get(roomId);
                if (room != null && hostUserId != null && room.getHostUserId() != null
                        && !hostUserId.equals(room.getHostUserId())) {
                    throw new IllegalArgumentException("Only the host can close this lobby.");
                }
                if (room != null) {
                    room.setClosed(true);
                }
                removeRoom(roomId);
            }
        } else {
            MultiplayerRoom room = rooms.get(roomId);
            if (room != null) {
                room.setClosed(true);
            }
            removeRoom(roomId);
        }
    }

    public List<MultiplayerRoom> listOpenRooms() {
        return listBrowsableRooms(null);
    }

    public List<MultiplayerRoom> listBrowsableRooms(String accountUserId) {
        Instant now = Instant.now();
        purgeExpiredRooms(now);
        Map<String, MultiplayerRoom> merged = new java.util.LinkedHashMap<>();
        rooms.values().stream()
                .filter(room -> !room.isClosed())
                .filter(room -> !room.isExpired(now))
                .filter(room -> !room.isStarted())
                .filter(room -> !room.hasGuest())
                .forEach(room -> merged.put(room.getRoomId(), room));
        if (accountUserId != null) {
            rooms.values().stream()
                    .filter(room -> !room.isClosed())
                    .filter(room -> !room.isExpired(now))
                    .filter(room -> !room.isStarted())
                    .filter(room -> accountUserId.equals(room.getHostUserId()))
                    .forEach(room -> merged.put(room.getRoomId(), room));
        }
        return merged.values().stream()
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
        if (lobbyPersistenceService != null) {
            try {
                if (!lobbyPersistenceService.isJoinable(roomId, now)) {
                    throw new IllegalArgumentException("That lobby is no longer available.");
                }
            } catch (IllegalStateException ignored) {
                // Keep local/dev lobbies usable when the persistence backend is unavailable.
            }
        }
        return room;
    }

    private void initializeLocalLobbyDeadline(MultiplayerRoom room) {
        Instant now = Instant.now();
        room.setCreatedAt(now);
        room.setExpiresAt(now.plus(LobbyPersistenceService.OPEN_LOBBY_TTL));
        room.setClosed(false);
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

    public synchronized GameState forfeitMatch(String roomId, String token) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        if (!room.isStarted() || room.getGameState() == null) {
            throw new IllegalArgumentException("No active match to quit.");
        }
        GameState state = room.getGameState();
        if (state.isGameOver()) {
            return state;
        }
        boolean isHost = room.isHostToken(token);
        gameService.forfeit(state, isHost);
        String quitterName = isHost ? room.getHostName() : room.getGuestName();
        room.setEndGameNotice(quitterName + " quit the match.");
        room.bumpEndGameNoticeSeq();
        room.touch();
        return state;
    }

    public synchronized GameState requestRematch(String roomId, String token) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        GameState state = room.getGameState();
        if (state == null || !state.isGameOver()) {
            throw new IllegalArgumentException("The match must be finished before rematch.");
        }
        if (room.isHostReturnedHome() || room.isGuestReturnedHome()) {
            throw new IllegalArgumentException("Rematch is no longer available.");
        }
        if (room.isHostToken(token)) {
            room.setHostRematchReady(true);
        } else {
            room.setGuestRematchReady(true);
        }
        if (room.isHostRematchReady() && room.isGuestRematchReady()) {
            return startRematch(room);
        }
        room.touch();
        return state;
    }

    public synchronized void returnHomeFromEnd(String roomId, String token) {
        MultiplayerRoom room = requireAuthorizedRoom(roomId, token);
        boolean isHost = room.isHostToken(token);
        if (isHost) {
            room.setHostReturnedHome(true);
            room.setHostRematchReady(false);
        } else {
            room.setGuestReturnedHome(true);
            room.setGuestRematchReady(false);
        }
        String leaverName = isHost ? room.getHostName() : room.getGuestName();
        room.setEndGameNotice(leaverName + " returned to the main menu.");
        room.bumpEndGameNoticeSeq();
        room.touch();
    }

    private GameState startRematch(MultiplayerRoom room) {
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
        room.clearEndGameSession();
        room.touch();
        return gameState;
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
