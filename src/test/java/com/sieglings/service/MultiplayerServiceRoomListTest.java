package com.sieglings.service;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

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
}
