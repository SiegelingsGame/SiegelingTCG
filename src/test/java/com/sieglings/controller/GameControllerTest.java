package com.sieglings.controller;

import com.sieglings.model.Ability;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.service.EnergyService;
import com.sieglings.service.PlacementService;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import com.sieglings.service.GameService;
import com.sieglings.service.MultiplayerRoom;
import com.sieglings.service.MultiplayerService;
import com.sieglings.service.PlayerProgressionService;
import com.sieglings.service.TournamentService;
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
    void guestTrainerOptionsExposeFullCatalogForBinderBrowsing() throws Exception {
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

        assertEquals(List.of("squire-bob", "pyla", "ser-airek", "trainer02"), trainers.stream().map(row -> row.get("id")).toList());
        assertTrue(trainers.stream().allMatch(row -> Boolean.FALSE.equals(row.get("owned"))));
    }

    @Test
    void battleCardsCarryTheirOwnersFinishNotTheViewers() throws Exception {
        java.util.List<String> reads = new java.util.ArrayList<>();
        GameController controller = createController(new MultiplayerService(), accountServiceReturning(null));
        setField(controller, "playerProgressionService", new PlayerProgressionService() {
            @Override
            public Map<String, String> cardFinishesForUser(String userId) {
                reads.add(userId);
                return "host".equals(userId) ? new java.util.HashMap<>(Map.of("draco", "GOLD", "pylme", "SP"))
                        : "guest".equals(userId) ? new java.util.HashMap<>(Map.of("draco", "SP"))
                        : new java.util.HashMap<>();
            }
        });
        com.sieglings.model.Player host = new com.sieglings.model.Player("Host", true);
        host.setAccountUserId("host");
        com.sieglings.model.Player guest = new com.sieglings.model.Player("Guest", true);
        guest.setAccountUserId("guest");
        com.sieglings.model.Player ai = new com.sieglings.model.Player("AI", false);
        com.sieglings.model.SieglingCard draco = siegling("draco");
        com.sieglings.model.SieglingCard foil = siegling("pylme");
        foil.setHolographic(true);
        Class<?>[] sig = { com.sieglings.model.Player.class, com.sieglings.model.Card.class };

        assertEquals("GOLD", invoke(controller, "finishFor", sig, new Object[] { host, draco }));
        assertEquals("SP", invoke(controller, "finishFor", sig, new Object[] { guest, draco }),
                "The same card shows each owner's own finish.");
        assertEquals("", invoke(controller, "finishFor", sig, new Object[] { ai, draco }));
        assertEquals("HSP", invoke(controller, "finishFor", sig, new Object[] { host, foil }),
                "A card that ships foil is at least HSP, even where its owner bought SP.");
        assertEquals("HSP", invoke(controller, "finishFor", sig, new Object[] { ai, foil }));
        invoke(controller, "finishFor", sig, new Object[] { host, draco });
        assertEquals(List.of("host", "guest", ""), reads.stream().map(id -> id == null ? "" : id).toList(),
                "Each player's finishes are read once per match, not on every state poll.");
    }

    private com.sieglings.model.SieglingCard siegling(String id) {
        return new com.sieglings.model.SieglingCard(id, id, Element.FIRE, Rarity.COMMON, 7, 3, List.of(),
                com.sieglings.model.enums.Row.FRONT);
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

    @Test
    void roomStatusCarriesTheTournamentRuleAndARoomPageInviteLink() throws Exception {
        MultiplayerService multiplayerService = new MultiplayerService();
        TournamentService tournamentService = new TournamentService();
        TournamentService.Tournament today = tournamentService.current(java.time.Instant.now());
        MultiplayerService.RoomSession session = multiplayerService.createRoom(
                "Host",
                new GameService.StartOptions("deck_fire", "trainer02", null, ""),
                "host-user",
                today.id()
        );
        GameController controller = createController(multiplayerService, accountServiceReturning(null));
        setField(controller, "tournamentService", tournamentService);
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        request.addHeader("Origin", "https://example.test");

        @SuppressWarnings("unchecked")
        Map<String, Object> meta = (Map<String, Object>) invoke(
                controller,
                "buildRoomMeta",
                new Class<?>[] { MultiplayerRoom.class, MultiplayerService.RoomSession.class, jakarta.servlet.http.HttpServletRequest.class },
                new Object[] { multiplayerService.requireRoom(session.roomId()), session, request }
        );

        // The room page themes itself and filters its deck picker from this.
        assertEquals(today.id(), meta.get("tournamentId"));
        @SuppressWarnings("unchecked")
        Map<String, Object> tournament = (Map<String, Object>) meta.get("tournament");
        assertEquals(today.rule().name(), tournament.get("name"));
        assertEquals(today.rule().element(), tournament.get("element"));
        // Invite links open the room page, not the old hub's waiting room.
        assertEquals("https://example.test/room/" + session.roomId(), meta.get("shareUrl"));
    }

    @Test
    void openTableStatusHasNoTournament() throws Exception {
        MultiplayerService multiplayerService = new MultiplayerService();
        MultiplayerService.RoomSession session = multiplayerService.createRoom(
                "Host", new GameService.StartOptions("deck_fire", "trainer02", null, ""), null);
        GameController controller = createController(multiplayerService, accountServiceReturning(null));
        setField(controller, "tournamentService", new TournamentService());

        @SuppressWarnings("unchecked")
        Map<String, Object> meta = (Map<String, Object>) invoke(
                controller,
                "buildRoomMeta",
                new Class<?>[] { MultiplayerRoom.class, MultiplayerService.RoomSession.class, jakarta.servlet.http.HttpServletRequest.class },
                new Object[] { multiplayerService.requireRoom(session.roomId()), session, new org.springframework.mock.web.MockHttpServletRequest() }
        );

        assertNull(meta.get("tournamentId"));
        assertNull(meta.get("tournament"));
    }

    @Test
    void statePayloadIncludesEverySpendableEnergyPool() throws Exception {
        EnergyService energyService = new EnergyService(new PlacementService());
        GameController controller = createController(new MultiplayerService(), accountServiceReturning(null));
        setField(controller, "energyService", energyService);

        GameState state = new GameState();
        Player player = new Player("Player", true);
        Player enemy = new Player("AI Opponent", false);
        state.setPlayer(player);
        state.setEnemy(enemy);
        // A reciprocal Metal link, plus one call well each for the other pools the
        // original serializer never copied. Light also has a claim still in the pool.
        // Lowest placement order is the foundation root. The Metal pair has to be
        // that network, or a later socketed card becomes the root and the link is ignored.
        CardInstance metalLeft = placed("metal-left", Element.METAL, NotchDirection.RIGHT, 1, 0);
        metalLeft.setPlacementOrder(0);
        CardInstance metalRight = placed("metal-right", Element.METAL, NotchDirection.LEFT, 1, 1);
        metalRight.setPlacementOrder(1);
        state.setAt(true, 1, 0, metalLeft);
        state.setAt(true, 1, 1, metalRight);
        state.setAt(true, 0, 1, ordered("light-well", Element.LIGHT, NotchDirection.BOTTOM, 0, 1, 10));
        state.setAt(true, 0, 0, ordered("poison-well", Element.POISON, NotchDirection.BOTTOM, 0, 0, 11));
        state.setAt(true, 0, 2, ordered("psychic-well", Element.PSYCHIC, NotchDirection.BOTTOM, 0, 2, 12));
        state.setAt(true, 2, 0, ordered("undead-well", Element.UNDEAD, NotchDirection.LEFT, 2, 0, 13));
        player.adjustTemporaryEnergy(Element.LIGHT, 1);
        energyService.recalculateEnergy(state);

        @SuppressWarnings("unchecked")
        Map<String, Object> payload = (Map<String, Object>) invoke(
                controller,
                "serializePlayer",
                new Class<?>[] { GameState.class, boolean.class, boolean.class },
                new Object[] { state, true, false }
        );

        assertEquals(1, number(payload, "metalEnergy"));
        assertEquals(1, number(payload, "metalInternal"));
        assertEquals(0, number(payload, "metalExternal"));
        assertEquals(2, number(payload, "lightEnergy"), "Claim energy has to ride along with the Light well.");
        assertEquals(0, number(payload, "lightInternal"));
        assertEquals(1, number(payload, "lightExternal"));
        assertEquals(1, number(payload, "poisonEnergy"));
        assertEquals(1, number(payload, "poisonExternal"));
        assertEquals(1, number(payload, "psychicEnergy"));
        assertEquals(1, number(payload, "psychicExternal"));
        assertEquals(1, number(payload, "undeadEnergy"));
        assertEquals(1, number(payload, "undeadExternal"));
        assertEquals(0, number(payload, "fireEnergy"));
    }

    private CardInstance placed(String id, Element element, NotchDirection direction, int row, int col) {
        SieglingCard card = new SieglingCard(
                id, id, element, Rarity.COMMON, 10, 1, List.of(new Notch(direction, element)), Row.MIDDLE);
        return new CardInstance(card, row, col, true);
    }

    private CardInstance ordered(String id, Element element, NotchDirection direction, int row, int col, int order) {
        CardInstance instance = placed(id, element, direction, row, col);
        instance.setPlacementOrder(order);
        return instance;
    }

    private int number(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        assertNotNull(value, key);
        return ((Number) value).intValue();
    }

    @Test
    void liveElementsEndpointReturnsOnlyTheActiveRoster() throws Exception {
        GameController controller = createController(new MultiplayerService(), accountServiceReturning(null));
        setField(controller, "gameService", new GameService() {
            @Override
            public List<String> getActiveLiveElementNames() {
                return List.of("FIRE", "ICE", "EARTH");
            }
        });

        // Reference surfaces (All Effects, the element key, the Field Guide) read this
        // instead of the multi-megabyte options payload, so it must stay this small.
        assertEquals(Map.of("liveElements", List.of("FIRE", "ICE", "EARTH")), controller.getLiveElements());
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
