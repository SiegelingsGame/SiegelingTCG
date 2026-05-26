package com.sieglings.controller;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import com.sieglings.service.GameService;
import com.sieglings.service.MultiplayerRoom;
import com.sieglings.service.MultiplayerService;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class GameControllerTest {

    @Test
    void signedInNonHostCannotCloseAnonymousRoomWithoutHostToken() throws Exception {
        MultiplayerService multiplayerService = new MultiplayerService();
        MultiplayerService.RoomSession session = multiplayerService.createRoom(
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, "Blazing Core"),
                null
        );
        GameController controller = createController(multiplayerService, accountServiceReturning(user("attacker@example.com")));

        Map<String, Object> denied = controller.closeMatch(Map.of("roomId", session.roomId()), "Bearer attacker", null, null);

        assertEquals("Only the host can close this lobby.", denied.get("error"));
        assertNotNull(multiplayerService.getRoom(session.roomId()));

        Map<String, Object> closed = controller.closeMatch(
                Map.of("roomId", session.roomId()),
                "Bearer attacker",
                null,
                session.playerToken()
        );

        assertEquals(true, closed.get("ok"));
        assertNull(multiplayerService.getRoom(session.roomId()));
    }

    private GameController createController(MultiplayerService multiplayerService,
                                            AccountService accountService) throws Exception {
        GameController controller = new GameController();
        setField(controller, "multiplayerService", multiplayerService);
        setField(controller, "accountService", accountService);
        return controller;
    }

    private AccountService accountServiceReturning(AccountUser user) {
        return new AccountService() {
            @Override
            public AccountUser findUser(String authorizationHeader) {
                return authorizationHeader == null ? null : user;
            }
        };
    }

    private AccountUser user(String id) {
        AccountUser user = new AccountUser();
        user.setId(id);
        user.setEmail(id);
        user.setDisplayName("Player");
        return user;
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }
}
