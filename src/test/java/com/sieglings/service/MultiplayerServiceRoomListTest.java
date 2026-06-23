package com.sieglings.service;

import com.sieglings.model.GameState;
import com.sieglings.model.Player;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MultiplayerServiceRoomListTest {

    @Test
    void openRoomListReturnsCreatedUnstartedRooms() {
        MultiplayerService service = new MultiplayerService();
        service.createRoom("Host", new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"), "user-1");

        List<MultiplayerRoom> rooms = service.listOpenRooms();

        assertEquals(1, rooms.size());
        assertEquals("Host", rooms.get(0).getHostName());
    }

    @Test
    void hostCanReconnectToOwnLobby() {
        MultiplayerService service = new MultiplayerService();
        MultiplayerService.RoomSession host = service.createRoom(
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"),
                "user-host"
        );

        MultiplayerService.RoomSession reconnected = service.reconnectHost(host.roomId(), "user-host");

        assertEquals(host.roomId(), reconnected.roomId());
        assertEquals(host.playerToken(), reconnected.playerToken());
        assertTrue(reconnected.viewerIsPlayer());
        assertFalse(reconnected.started());
    }

    @Test
    void createRoomFallsBackToMemoryWhenLobbyPersistenceIsUnavailable() throws Exception {
        MultiplayerService service = new MultiplayerService();
        injectLobbyPersistence(service, new UnavailableLobbyPersistenceService());

        MultiplayerService.RoomSession host = service.createRoom(
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"),
                "user-host"
        );
        MultiplayerService.RoomSession guest = service.joinRoom(
                host.roomId(),
                "Guest",
                new GameService.StartOptions("deck_water", "trainer06", null, "Tide Deck"),
                "user-guest"
        );

        MultiplayerRoom room = service.requireRoom(host.roomId());
        assertEquals(host.roomId(), guest.roomId());
        assertTrue(room.hasGuest());
        assertFalse(room.isClosed());
        assertTrue(room.getExpiresAt().isAfter(Instant.now()));
    }

    @Test
    void matchStartDoesNotFailWhenLobbyPersistenceIsUnavailable() throws Exception {
        MultiplayerService service = new MultiplayerService();
        injectGameService(service);
        injectLobbyPersistence(service, new UnavailableLobbyPersistenceService());
        MultiplayerService.RoomSession host = service.createRoom(
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"),
                "user-host"
        );
        MultiplayerService.RoomSession guest = service.joinRoom(
                host.roomId(),
                "Guest",
                new GameService.StartOptions("deck_water", "trainer06", null, "Tide Deck"),
                "user-guest"
        );

        service.setPlayerReady(host.roomId(), host.playerToken(), "Host", service.requireRoom(host.roomId()).getHostOptions());
        MultiplayerService.RoomSession started = service.setPlayerReady(
                host.roomId(),
                guest.playerToken(),
                "Guest",
                service.requireRoom(host.roomId()).getGuestOptions()
        );

        assertTrue(started.started());
        assertTrue(service.requireRoom(host.roomId()).isStarted());
    }

    @Test
    void hostCannotJoinOwnLobbyAsGuest() {
        MultiplayerService service = new MultiplayerService();
        MultiplayerService.RoomSession host = service.createRoom(
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"),
                "user-host"
        );

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> service.joinRoom(
                host.roomId(),
                "Host Again",
                new GameService.StartOptions("deck_water", "trainer06", null, "Guest Deck"),
                "user-host"
        ));

        assertTrue(error.getMessage().toLowerCase().contains("hosting"));
    }

    @Test
    void guestLeaveOpensGuestSlotWithoutClosingLobby() {
        MultiplayerService service = new MultiplayerService();
        MultiplayerService.RoomSession host = service.createRoom(
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"),
                "user-host"
        );
        MultiplayerService.RoomSession guest = service.joinRoom(
                host.roomId(),
                "Guest",
                new GameService.StartOptions("deck_water", "trainer06", null, "Tide Deck"),
                "user-guest"
        );

        service.leaveLobby(host.roomId(), guest.playerToken());

        MultiplayerRoom room = service.requireRoom(host.roomId());
        assertFalse(room.isClosed());
        assertFalse(room.isStarted());
        assertFalse(room.hasGuest());
        assertFalse(room.isHostReady());
    }

    @Test
    void matchStartsOnlyAfterBothPlayersReady() throws Exception {
        MultiplayerService service = new MultiplayerService();
        injectGameService(service);
        MultiplayerService.RoomSession host = service.createRoom(
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"),
                "user-host"
        );
        MultiplayerService.RoomSession guest = service.joinRoom(
                host.roomId(),
                "Guest",
                new GameService.StartOptions("deck_water", "trainer06", null, "Tide Deck"),
                "user-guest"
        );

        MultiplayerRoom waiting = service.requireRoom(host.roomId());
        assertFalse(waiting.isStarted());
        assertTrue(waiting.isLoadoutPhase());

        service.setPlayerReady(host.roomId(), host.playerToken(), "Host", waiting.getHostOptions());
        assertFalse(service.requireRoom(host.roomId()).isStarted());

        MultiplayerService.RoomSession started = service.setPlayerReady(
                host.roomId(),
                guest.playerToken(),
                "Guest",
                waiting.getGuestOptions()
        );

        assertTrue(started.started());
        assertTrue(service.requireRoom(host.roomId()).isStarted());
    }

    @Test
    void browsableRoomsIncludeHostTableWithGuest() {
        MultiplayerService service = new MultiplayerService();
        MultiplayerService.RoomSession host = service.createRoom(
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"),
                "user-host"
        );
        service.joinRoom(
                host.roomId(),
                "Guest",
                new GameService.StartOptions("deck_water", "trainer06", null, "Tide Deck"),
                "user-guest"
        );

        assertEquals(0, service.listOpenRooms().size());
        assertEquals(1, service.listBrowsableRooms("user-host").size());
    }

    @Test
    void guestLeaveReopensLobbyForJoin() {
        MultiplayerService service = new MultiplayerService();
        MultiplayerService.RoomSession host = service.createRoom(
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"),
                "user-host"
        );
        MultiplayerService.RoomSession guest = service.joinRoom(
                host.roomId(),
                "Guest",
                new GameService.StartOptions("deck_water", "trainer06", null, "Tide Deck"),
                "user-guest"
        );

        assertTrue(service.listOpenRooms().isEmpty());

        service.leaveLobby(host.roomId(), guest.playerToken());

        MultiplayerRoom room = service.requireRoom(host.roomId());
        assertFalse(room.hasGuest());
        assertEquals(1, service.listOpenRooms().size());
        assertEquals(host.roomId(), service.listOpenRooms().get(0).getRoomId());
    }

    @Test
    void startedRoomDoesNotExpireOnOpenLobbyDeadline() {
        MultiplayerRoom room = new MultiplayerRoom(
                "ABC123",
                "HOSTTOKEN",
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core")
        );
        room.setExpiresAt(Instant.now().minusSeconds(1));
        room.setGameState(new com.sieglings.model.GameState());

        assertFalse(room.isExpired(Instant.now()));
    }

    private void injectGameService(MultiplayerService service) throws Exception {
        GameService gameService = new GameService() {
            @Override
            public GameState newMultiplayerGame(StartOptions hostOptions,
                                                StartOptions guestOptions,
                                                String hostName,
                                                String guestName) {
                GameState state = new GameState();
                state.setPlayer(new Player(hostName, true));
                state.setEnemy(new Player(guestName, false));
                return state;
            }
        };
        Field field = MultiplayerService.class.getDeclaredField("gameService");
        field.setAccessible(true);
        field.set(service, gameService);
    }

    private void injectLobbyPersistence(MultiplayerService service, LobbyPersistenceService persistenceService) throws Exception {
        Field field = MultiplayerService.class.getDeclaredField("lobbyPersistenceService");
        field.setAccessible(true);
        field.set(service, persistenceService);
    }

    private static class UnavailableLobbyPersistenceService extends LobbyPersistenceService {
        @Override
        public void registerOpenLobby(MultiplayerRoom room, String hostUserId) {
            throw new IllegalStateException("Persistence unavailable.");
        }

        @Override
        public void markStarted(String roomId) {
            throw new IllegalStateException("Persistence unavailable.");
        }

        @Override
        public void closeLobby(String roomId, String hostUserId) {
            throw new IllegalStateException("Persistence unavailable.");
        }

        @Override
        public boolean isJoinable(String roomId, Instant now) {
            throw new IllegalStateException("Persistence unavailable.");
        }
    }
}
