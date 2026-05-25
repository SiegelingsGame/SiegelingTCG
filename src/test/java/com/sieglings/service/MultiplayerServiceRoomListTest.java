package com.sieglings.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MultiplayerServiceRoomListTest {

    @Test
    void openRoomListReturnsCreatedUnstartedRooms() {
        MultiplayerService service = new MultiplayerService();
        service.createRoom("Host", new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"), "user-1");

        List<MultiplayerRoom> rooms = service.listOpenRooms();

        assertEquals(1, rooms.size());
        assertEquals("Host", rooms.get(0).getHostName());
    }
}
