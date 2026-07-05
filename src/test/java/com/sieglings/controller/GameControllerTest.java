package com.sieglings.controller;

import com.sieglings.model.Ability;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import com.sieglings.service.GameService;
import com.sieglings.service.MultiplayerRoom;
import com.sieglings.service.MultiplayerService;
import com.sieglings.service.PlayerProgressionService;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameControllerTest {

    @Test
    void guestTrainerOptionsExposeBobPylaAndAirek() throws Exception {
        GameController controller = createController(new MultiplayerService(), accountServiceReturning(null));
        setField(controller, "gameService", guestTrainerGameService());
        setField(controller, "playerProgressionService", new PlayerProgressionService());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> trainers = (List<Map<String, Object>>) invoke(
                controller,
                "serializeTrainerOptions",
                new Class<?>[] { String.class },
                new Object[] { null }
        );

        assertEquals(List.of("squire-bob", "pyla", "ser-airek"), trainers.stream().map(row -> row.get("id")).toList());
        assertTrue(trainers.stream().allMatch(row -> Boolean.TRUE.equals(row.get("owned"))));
    }

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

    private GameService guestTrainerGameService() {
        return new GameService() {
            @Override
            public List<TrainerCard> getTrainerOptions() {
                return List.of(
                        trainer("squire-bob", "Squire Bob", Element.NEUTRAL),
                        trainer("pyla", "Lady Pyla", Element.FIRE),
                        trainer("ser-airek", "Ser Airek", Element.WIND),
                        trainer("trainer02", "Flame Tactician", Element.FIRE)
                );
            }
        };
    }

    private TrainerCard trainer(String id, String name, Element element) {
        return new TrainerCard(
                id,
                name,
                element,
                Rarity.RARE,
                "SiegeKnight",
                Ability.passive("Passive", "Passive effect", "damage_boost", 1),
                Ability.damage("Active", "Deal 1 damage", com.sieglings.model.enums.TargetType.SINGLE_ENEMY, null, 1, 1),
                false
        );
    }

    private Object invoke(Object target, String methodName, Class<?>[] parameterTypes, Object[] args) throws Exception {
        Method method = target.getClass().getDeclaredMethod(methodName, parameterTypes);
        method.setAccessible(true);
        return method.invoke(target, args);
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
