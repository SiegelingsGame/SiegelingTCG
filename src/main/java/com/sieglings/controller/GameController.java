package com.sieglings.controller;

import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.BattleAbilityOption;
import com.sieglings.model.Card;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Move;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Phase;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.service.CardOverrideStorageService;
import com.sieglings.service.EnergyService;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.GameService;
import com.sieglings.service.MatchHistoryService;
import com.sieglings.service.MovesPoolService;
import com.sieglings.service.AccountService;
import com.sieglings.service.MultiplayerRoom;
import com.sieglings.service.MultiplayerService;
import com.sieglings.service.PlayerProgressionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseBody;

import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

/**
 * REST controller for all game actions.
 */
@Controller
public class GameController {

    @Autowired
    private GameService gameService;

    @Autowired
    private EnergyService energyService;

    @Autowired
    private MultiplayerService multiplayerService;

    @Autowired
    private AccountService accountService;

    @Autowired
    private MovesPoolService movesPoolService;

    @Autowired
    private MatchHistoryService matchHistoryService;

    @Autowired
    private PlayerProgressionService playerProgressionService;

    @Autowired
    private CardOverrideStorageService cardOverrideStorageService;

    @GetMapping("/api/game/options")
    @ResponseBody
    public Map<String, Object> getOptions() {
        List<CardDefinitionService.DeckOption> deckOptions = gameService.getDeckOptions();
        CardDefinitionService.DeckOption defaultDeck = deckOptions.stream()
                .filter(deck -> deck.id().equals("deck_fire_earth"))
                .findFirst()
                .or(() -> deckOptions.stream().findFirst())
                .orElse(null);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("decks", deckOptions.stream().map(deck -> Map.of(
                "id", deck.id(),
                "name", deck.name(),
                "description", deck.description(),
                "elements", deck.elements().stream().map(Enum::name).toList(),
                "recommendedTrainerId", deck.recommendedTrainerId(),
                "cards", deckCardCounts(deck.id())
        )).toList());
        resp.put("trainers", gameService.getTrainerOptions().stream().map(this::serializeTrainerOption).toList());
        resp.put("deckBuilder", Map.of(
                "minDeckSize", gameService.getDeckBuilderMinSize(),
                "maxCopies", gameService.getDeckBuilderMaxCopies()
        ));
        resp.put("cardCatalog", gameService.getDeckBuilderCatalog().stream().map(this::serializeCard).toList());
        resp.put("liveElements", gameService.getActiveLiveElementNames());
        resp.put("defaultDeckId", defaultDeck == null ? null : defaultDeck.id());
        resp.put("defaultTrainerId", defaultDeck == null ? null : defaultDeck.recommendedTrainerId());
        resp.put("catalogVersion", cardOverrideStorageService.getCatalogRevision());
        return resp;
    }

    @GetMapping("/api/game/catalog-version")
    @ResponseBody
    public Map<String, Object> getCatalogVersion() {
        return Map.of("catalogVersion", cardOverrideStorageService.getCatalogRevision());
    }

    /**
     * Mobile/low-bandwidth option payload (no full deck-builder catalog).
     * The full /api/game/options response can be very large and slow to generate
     * on cold starts, which makes lightweight clients feel disconnected.
     */
    @GetMapping("/api/game/options-lite")
    @ResponseBody
    public Map<String, Object> getOptionsLite() {
        List<CardDefinitionService.DeckOption> deckOptions = gameService.getDeckOptions();
        CardDefinitionService.DeckOption defaultDeck = deckOptions.stream()
                .filter(deck -> deck.id().equals("deck_fire_earth"))
                .findFirst()
                .or(() -> deckOptions.stream().findFirst())
                .orElse(null);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("decks", deckOptions.stream().map(deck -> Map.of(
                "id", deck.id(),
                "name", deck.name(),
                "description", deck.description(),
                "elements", deck.elements().stream().map(Enum::name).toList(),
                "recommendedTrainerId", deck.recommendedTrainerId(),
                "cards", deckCardCounts(deck.id())
        )).toList());
        resp.put("trainers", gameService.getTrainerOptions().stream().map(this::serializeTrainerOption).toList());
        resp.put("deckBuilder", Map.of(
                "minDeckSize", gameService.getDeckBuilderMinSize(),
                "maxCopies", gameService.getDeckBuilderMaxCopies()
        ));
        resp.put("liveElements", gameService.getActiveLiveElementNames());
        resp.put("defaultDeckId", defaultDeck == null ? null : defaultDeck.id());
        resp.put("defaultTrainerId", defaultDeck == null ? null : defaultDeck.recommendedTrainerId());
        return resp;
    }

    @PostMapping("/api/match/create")
    @ResponseBody
    public Map<String, Object> createMatch(@RequestBody(required = false) Map<String, Object> req,
                                           @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                           HttpServletRequest request) {
        try {
            String playerName = req == null ? null : (String) req.get("playerName");
            GameService.StartOptions options = parseStartOptions(req, "deck_fire_earth", "trainer05");
            AccountUser user = accountService.findUser(authorizationHeader);
            validateStartOwnership(user, options);
            MultiplayerService.RoomSession session = multiplayerService.createRoom(playerName, options, user == null ? null : user.getId());
            return buildRoomMeta(multiplayerService.requireRoom(session.roomId()), session, request);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/match/join")
    @ResponseBody
    public Map<String, Object> joinMatch(@RequestBody Map<String, Object> req,
                                         @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                         HttpServletRequest request) {
        try {
            String roomId = req == null ? null : (String) req.get("roomId");
            String playerName = req == null ? null : (String) req.get("playerName");
            GameService.StartOptions options = parseStartOptions(req, "deck_water_wind", "trainer06");
            AccountUser user = accountService.findUser(authorizationHeader);
            validateStartOwnership(user, options);
            MultiplayerService.RoomSession session = multiplayerService.joinRoom(roomId, playerName, options, user == null ? null : user.getId());
            MultiplayerRoom room = multiplayerService.requireRoom(session.roomId());
            Map<String, Object> resp = buildRoomMeta(room, session, request);
            if (room.isStarted()) {
                resp.putAll(buildStateResponse(room.getGameState(), session.viewerIsPlayer(), room.getRoomId()));
            }
            return resp;
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/match/ready")
    @ResponseBody
    public Map<String, Object> readyMatch(@RequestBody(required = false) Map<String, Object> req,
                                          @RequestHeader(value = "X-Room-Id", required = false) String roomIdHeader,
                                          @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                          @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                          HttpServletRequest request) {
        try {
            String roomId = req == null ? null : (String) req.get("roomId");
            if (roomId == null || roomId.isBlank()) {
                roomId = roomIdHeader;
            }
            String playerName = req == null ? null : (String) req.get("playerName");
            MultiplayerRoom existingRoom = multiplayerService.requireAuthorizedRoom(roomId, playerToken);
            GameService.StartOptions existingOptions = existingRoom.isHostToken(playerToken)
                    ? existingRoom.getHostOptions()
                    : existingRoom.getGuestOptions();
            String fallbackDeck = existingOptions == null ? "deck_fire_earth" : existingOptions.playerDeckId();
            String fallbackTrainer = existingOptions == null ? "trainer05" : existingOptions.playerTrainerId();
            GameService.StartOptions options = parseStartOptions(req, fallbackDeck, fallbackTrainer);
            AccountUser user = accountService.findUser(authorizationHeader);
            validateStartOwnership(user, options);
            MultiplayerService.RoomSession session = multiplayerService.setPlayerReady(
                    roomId,
                    playerToken,
                    playerName,
                    options
            );
            MultiplayerRoom room = multiplayerService.requireRoom(session.roomId());
            Map<String, Object> resp = buildRoomMeta(room, session, request);
            if (room.isStarted()) {
                resp.putAll(buildStateResponse(room.getGameState(), session.viewerIsPlayer(), room.getRoomId()));
            }
            return resp;
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/match/lobby-chat")
    @ResponseBody
    public Map<String, Object> lobbyChat(@RequestBody Map<String, Object> req,
                                         @RequestHeader(value = "X-Room-Id", required = false) String roomIdHeader,
                                         @RequestHeader(value = "X-Player-Token", required = false) String playerToken) {
        try {
            String roomId = req == null ? null : (String) req.get("roomId");
            if (roomId == null || roomId.isBlank()) {
                roomId = roomIdHeader;
            }
            String message = req == null ? null : (String) req.get("message");
            multiplayerService.addLobbyChat(roomId, playerToken, message);
            MultiplayerRoom room = multiplayerService.requireRoom(roomId);
            return Map.of(
                    "ok", true,
                    "lobbyChat", room.getLobbyChat()
            );
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @GetMapping("/api/match/status")
    @ResponseBody
    public Map<String, Object> getMatchStatus(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                              @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                              @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                              HttpServletRequest request) {
        try {
            MultiplayerRoom room = multiplayerService.requireAuthorizedRoom(roomId, playerToken);
            boolean viewerIsPlayer = multiplayerService.viewerIsPlayer(roomId, playerToken);
            AccountUser user = accountService.findUser(authorizationHeader);
            Map<String, Object> resp = buildRoomMeta(
                    room,
                    new MultiplayerService.RoomSession(roomId, playerToken, viewerIsPlayer, room.isStarted()),
                    request
            );
            resp.putAll(buildEndSessionMeta(room, viewerIsPlayer));
            if (room.isStarted()) {
                resp.putAll(buildStateResponse(room.getGameState(), viewerIsPlayer, roomId, user, room));
            }
            return resp;
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/new")
    @ResponseBody
    public Map<String, Object> newGame(@RequestBody(required = false) Map<String, Object> req,
                                       @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            GameService.StartOptions options = parseStartOptions(req, "deck_fire_earth", "trainer05");
            AccountUser user = accountService.findUser(authorizationHeader);
            validateStartOwnership(user, options);
            GameService.SoloHandle handle = gameService.newSoloGame(options);
            attachAuthenticatedSoloUser(handle.state(), authorizationHeader);
            Map<String, Object> resp = new LinkedHashMap<>(buildStateResponse(handle.state(), true, null));
            resp.put("soloToken", handle.token());
            return resp;
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    /** Resolves the caller's solo game from its token, or fails if none is active. */
    private GameState requireSoloState(String soloToken) {
        GameState state = gameService.getSoloGame(soloToken);
        if (state == null) {
            throw new IllegalArgumentException("No active game. Start a new game first.");
        }
        return state;
    }

    @GetMapping("/api/match/rooms")
    @ResponseBody
    public Map<String, Object> listRooms() {
        return Map.of("rooms", multiplayerService.listOpenRooms().stream().map(this::serializeOpenRoom).toList());
    }

    @PostMapping("/api/match/forfeit")
    @ResponseBody
    public Map<String, Object> forfeitMatch(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                            @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            MultiplayerRoom room = multiplayerService.requireAuthorizedRoom(roomId, playerToken);
            boolean viewerIsPlayer = multiplayerService.viewerIsPlayer(roomId, playerToken);
            GameState state = multiplayerService.forfeitMatch(roomId, playerToken);
            AccountUser user = accountService.findUser(authorizationHeader);
            return buildStateResponse(state, viewerIsPlayer, roomId, user, room);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/match/rematch")
    @ResponseBody
    public Map<String, Object> rematch(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                       @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                       @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            MultiplayerRoom room = multiplayerService.requireAuthorizedRoom(roomId, playerToken);
            boolean viewerIsPlayer = multiplayerService.viewerIsPlayer(roomId, playerToken);
            GameState state = multiplayerService.requestRematch(roomId, playerToken);
            AccountUser user = accountService.findUser(authorizationHeader);
            Map<String, Object> resp = buildStateResponse(state, viewerIsPlayer, roomId, user, room);
            resp.put("rematchStarted", !state.isGameOver());
            return resp;
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/match/end-home")
    @ResponseBody
    public Map<String, Object> endScreenHome(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                             @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                             @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            multiplayerService.returnHomeFromEnd(roomId, playerToken);
            MultiplayerRoom room = multiplayerService.requireAuthorizedRoom(roomId, playerToken);
            boolean viewerIsPlayer = multiplayerService.viewerIsPlayer(roomId, playerToken);
            AccountUser user = accountService.findUser(authorizationHeader);
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("ok", true);
            if (room.isStarted() && room.getGameState() != null) {
                resp.putAll(buildStateResponse(room.getGameState(), viewerIsPlayer, roomId, user, room));
            } else {
                resp.putAll(buildEndSessionMeta(room, viewerIsPlayer));
            }
            return resp;
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/forfeit")
    @ResponseBody
    public Map<String, Object> forfeitSolo(@RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                           @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            GameState state = requireSoloState(soloToken);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            gameService.forfeit(state, true);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/match/close")
    @ResponseBody
    public Map<String, Object> closeMatch(@RequestBody(required = false) Map<String, Object> req,
                                          @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                          @RequestHeader(value = "X-Room-Id", required = false) String roomIdHeader,
                                          @RequestHeader(value = "X-Player-Token", required = false) String playerToken) {
        try {
            String roomId = req == null ? null : (String) req.get("roomId");
            if (roomId == null || roomId.isBlank()) {
                roomId = roomIdHeader;
            }
            AccountUser user = accountService.findUser(authorizationHeader);
            MultiplayerRoom room = multiplayerService.requireRoom(roomId);
            boolean hostTokenMatches = playerToken != null && room.isHostToken(playerToken);
            boolean signedInHost = user != null
                    && room.getHostUserId() != null
                    && room.getHostUserId().equals(user.getId());
            if (!hostTokenMatches && !signedInHost) {
                throw new IllegalArgumentException("Only the host can close this lobby.");
            }
            multiplayerService.closeRoom(roomId, room.getHostUserId());
            return Map.of("ok", true, "roomId", roomId);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/mulligan")
    @ResponseBody
    public Map<String, Object> mulligan(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                        @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                        @RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                        @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                        @RequestBody Map<String, Object> req) {
        if (roomId != null && playerToken != null) {
            try {
                MultiplayerRoom room = multiplayerService.requireAuthorizedRoom(roomId, playerToken);
                List<Integer> indices = parseMulliganIndices(req, room.getGameState(), room.isHostToken(playerToken));
                GameState state = multiplayerService.mulligan(roomId, playerToken, indices);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        try {
            GameState state = requireSoloState(soloToken);
            List<Integer> indices = parseMulliganIndices(req, state, true);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            gameService.resolveOpeningMulligan(state, true, indices);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @GetMapping("/api/game/state")
    @ResponseBody
    public Map<String, Object> getState(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                        @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                        @RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                        @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        if (roomId != null && playerToken != null) {
            try {
                MultiplayerRoom room = multiplayerService.requireAuthorizedRoom(roomId, playerToken);
                if (!room.isStarted()) {
                    return Map.of("error", "Room is waiting for another player.");
                }
                return buildStateResponse(room.getGameState(), multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        try {
            GameState state = requireSoloState(soloToken);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/draw")
    @ResponseBody
    public Map<String, Object> draw(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                    @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                    @RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                    @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.draw(roomId, playerToken);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        try {
            GameState state = requireSoloState(soloToken);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            gameService.draw(state, true);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/place")
    @ResponseBody
    public Map<String, Object> place(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                     @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                     @RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                     @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                     @RequestBody Map<String, Object> req) {
        String cardId = (String) req.get("cardId");
        int row = (int) req.get("row");
        int col = (int) req.get("col");

        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.placeSiegling(roomId, playerToken, cardId, row, col);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        try {
            GameState state = requireSoloState(soloToken);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            gameService.placeSiegling(state, true, cardId, row, col);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/cast")
    @ResponseBody
    public Map<String, Object> cast(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                    @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                    @RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                    @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                    @RequestBody Map<String, Object> req) {
        String cardId = (String) req.get("cardId");
        int targetRow = req.containsKey("targetRow") ? ((Number) req.get("targetRow")).intValue() : -1;
        int targetCol = req.containsKey("targetCol") ? ((Number) req.get("targetCol")).intValue() : -1;
        int destRow = req.containsKey("destRow") ? ((Number) req.get("destRow")).intValue() : -1;
        int destCol = req.containsKey("destCol") ? ((Number) req.get("destCol")).intValue() : -1;

        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.castSpell(roomId, playerToken, cardId, targetRow, targetCol, destRow, destCol);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        try {
            GameState state = requireSoloState(soloToken);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            gameService.castSpell(state, true, cardId, targetRow, targetCol, destRow, destCol);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/claim")
    @ResponseBody
    public Map<String, Object> claim(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                     @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                     @RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                     @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                     @RequestBody Map<String, Object> req) {
        int row = (int) req.get("row");
        int col = (int) req.get("col");

        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.claimSiegling(roomId, playerToken, row, col);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        try {
            GameState state = requireSoloState(soloToken);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            gameService.claimSiegling(state, true, row, col);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/trainer")
    @ResponseBody
    public Map<String, Object> useTrainer(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                          @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                          @RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                          @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                          @RequestBody Map<String, Object> req) {
        int targetRow = req.containsKey("targetRow") ? (int) req.get("targetRow") : -1;
        int targetCol = req.containsKey("targetCol") ? (int) req.get("targetCol") : -1;

        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.useTrainer(roomId, playerToken, targetRow, targetCol);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        try {
            GameState state = requireSoloState(soloToken);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            gameService.useTrainerAbility(state, true, targetRow, targetCol);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/battle")
    @ResponseBody
    public Map<String, Object> battle(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                      @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                      @RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                      @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.battle(roomId, playerToken);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        try {
            GameState state = requireSoloState(soloToken);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            gameService.executeBattle(state);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/battle/action")
    @ResponseBody
    public Map<String, Object> battleAction(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                            @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                            @RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                            @RequestBody Map<String, Object> req) {
        int abilityIndex = (int) req.get("abilityIndex");
        int targetRow = req.containsKey("targetRow") ? (int) req.get("targetRow") : -1;
        int targetCol = req.containsKey("targetCol") ? (int) req.get("targetCol") : -1;

        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.battleAction(roomId, playerToken, abilityIndex, targetRow, targetCol);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        try {
            GameState state = requireSoloState(soloToken);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            gameService.submitBattleAction(state, true, abilityIndex, targetRow, targetCol);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/game/endturn")
    @ResponseBody
    public Map<String, Object> endTurn(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                       @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                       @RequestHeader(value = "X-Solo-Token", required = false) String soloToken,
                                       @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.endTurn(roomId, playerToken);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        try {
            GameState state = requireSoloState(soloToken);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            gameService.endTurn(state, true);
            attachAuthenticatedSoloUser(state, authorizationHeader);
            return buildStateResponse(state, true, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @GetMapping("/api/game/placements")
    @ResponseBody
    public List<int[]> getPlacements(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                     @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                     @RequestHeader(value = "X-Solo-Token", required = false) String soloToken) {
        if (roomId != null && playerToken != null) {
            try {
                return multiplayerService.getLegalPlacements(roomId, playerToken);
            } catch (IllegalArgumentException ex) {
                return List.of();
            }
        }
        try {
            GameState state = requireSoloState(soloToken);
            return gameService.getLegalPlacements(state, true);
        } catch (IllegalArgumentException ex) {
            return List.of();
        }
    }

    private void attachAuthenticatedSoloUser(GameState state, String authorizationHeader) {
        if (state == null) {
            return;
        }
        Player player = state.getPlayer();
        if (player != null && (player.getAccountUserId() == null || player.getAccountUserId().isBlank())) {
            AccountUser user = accountService.findUser(authorizationHeader);
            if (user == null) {
                return;
            }
            player.setAccountUserId(user.getId());
        }
        if (state.isGameOver()) {
            matchHistoryService.recordCompletedGame(state);
        }
    }

    private Map<String, Object> buildStateResponse(GameState gs, boolean viewerIsPlayer, String roomId) {
        MultiplayerRoom room = roomId == null ? null : multiplayerService.getRoom(roomId);
        return buildStateResponse(gs, viewerIsPlayer, roomId, null, room);
    }

    private Map<String, Object> buildStateResponse(GameState gs,
                                                   boolean viewerIsPlayer,
                                                   String roomId,
                                                   AccountUser user,
                                                   MultiplayerRoom room) {
        if (gs == null) return Map.of("error", "No game");

        Player viewer = viewerIsPlayer ? gs.getPlayer() : gs.getEnemy();
        Player opponent = viewerIsPlayer ? gs.getEnemy() : gs.getPlayer();
        boolean mulliganActive = gs.getCurrentPhase() == Phase.MULLIGAN;
        boolean viewerPendingMulligan = gs.isMulliganPending(viewerIsPlayer);
        boolean opponentPendingMulligan = gs.isMulliganPending(!viewerIsPlayer);
        String activeSide = mulliganActive
                ? (viewerPendingMulligan ? "PLAYER" : (opponentPendingMulligan ? "ENEMY" : "PLAYER"))
                : (gs.isPlayerTurn() == viewerIsPlayer ? "PLAYER" : "ENEMY");
        String activeSideLabel = mulliganActive
                ? (viewerPendingMulligan ? "You" : (opponentPendingMulligan ? opponent.getName() : "Both players"))
                : (gs.isPlayerTurn() == viewerIsPlayer ? "You" : opponent.getName());

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("turnNumber", gs.getTurnNumber());
        resp.put("currentPhase", gs.getCurrentPhase().name());
        resp.put("activeSide", activeSide);
        resp.put("firstPlayer", gs.isPlayerGoesFirst() == viewerIsPlayer ? "PLAYER" : "ENEMY");
        resp.put("activeSideLabel", activeSideLabel);
        resp.put("firstPlayerLabel", gs.isPlayerGoesFirst() == viewerIsPlayer ? "You" : opponent.getName());
        resp.put("setupTurnsTakenThisRound", gs.getSetupTurnsTakenThisRound());
        resp.put("gameOver", gs.isGameOver());
        resp.put("winner", gs.getWinner());
        resp.put("multiplayer", roomId != null);
        resp.put("roomId", roomId);
        resp.put("viewerSide", viewerIsPlayer ? "PLAYER" : "ENEMY");
        resp.put("playerName", viewer.getName());
        resp.put("enemyName", opponent.getName());

        resp.put("player", serializePlayer(gs, viewerIsPlayer, true));
        resp.put("enemy", serializePlayer(gs, !viewerIsPlayer, false));
        resp.put("playerBoard", serializeBoard(gs, viewerIsPlayer));
        resp.put("enemyBoard", serializeBoard(gs, !viewerIsPlayer));
        resp.put("legalPlacements", gameService.getLegalPlacements(gs, viewerIsPlayer));
        resp.put("playerPlacementUsed", gs.isSieglingSetupBudgetExhausted(viewerIsPlayer));
        resp.put("setupSieglingActionsUsed", gs.getSieglingSetupActionsUsed(viewerIsPlayer));
        resp.put("setupSieglingActionBudget", gs.getSieglingSetupActionBudget(viewerIsPlayer));
        resp.put("mulligan", Map.of(
                "active", mulliganActive,
                "youPending", viewerPendingMulligan,
                "opponentPending", opponentPendingMulligan,
                "youUsed", gs.hasUsedMulligan(viewerIsPlayer),
                "opponentUsed", gs.hasUsedMulligan(!viewerIsPlayer)
        ));

        CardInstance pendingAttacker = gameService.getPendingBattleAttacker(gs);
        if (pendingAttacker != null && pendingAttacker.isOwner() == viewerIsPlayer) {
            resp.put("pendingBattle", serializePendingBattle(gs));
            resp.put("battleWaitingOn", null);
        } else {
            resp.put("pendingBattle", null);
            resp.put("battleWaitingOn", pendingAttacker == null ? null : "ENEMY");
        }

        List<String> log = gs.getGameLog();
        List<String> latestLog = new ArrayList<>(log.subList(Math.max(0, log.size() - 80), log.size()));
        Collections.reverse(latestLog);
        resp.put("gameLog", latestLog);

        if (gs.isGameOver()) {
            resp.put("endScreen", buildEndScreen(gs, viewerIsPlayer, roomId, user, viewer, opponent));
        }
        if (room != null) {
            resp.putAll(buildEndSessionMeta(room, viewerIsPlayer));
        }
        return resp;
    }

    private Map<String, Object> buildEndSessionMeta(MultiplayerRoom room, boolean viewerIsHostSide) {
        Map<String, Object> meta = new LinkedHashMap<>();
        if (room == null) {
            return meta;
        }
        meta.put("endGameNotice", room.getEndGameNotice());
        meta.put("endGameNoticeSeq", room.getEndGameNoticeSeq());
        boolean viewerIsHost = viewerIsHostSide;
        meta.put("youRematchReady", viewerIsHost ? room.isHostRematchReady() : room.isGuestRematchReady());
        meta.put("opponentRematchReady", viewerIsHost ? room.isGuestRematchReady() : room.isHostRematchReady());
        meta.put("youReturnedHome", viewerIsHost ? room.isHostReturnedHome() : room.isGuestReturnedHome());
        meta.put("opponentReturnedHome", viewerIsHost ? room.isGuestReturnedHome() : room.isHostReturnedHome());
        meta.put("rematchBlocked", room.isHostReturnedHome() || room.isGuestReturnedHome());
        return meta;
    }

    private Map<String, Object> buildEndScreen(GameState gs,
                                               boolean viewerIsPlayer,
                                               String roomId,
                                               AccountUser user,
                                               Player viewer,
                                               Player opponent) {
        Map<String, Object> screen = new LinkedHashMap<>();
        String result = resolveViewerResult(gs, viewer.getName());
        screen.put("result", result);
        screen.put("endReason", gs.getEndReason() == null ? "NORMAL" : gs.getEndReason());
        screen.put("forfeitedBy", gs.getForfeitedBy());
        screen.put("turns", gs.getTurnNumber());
        screen.put("opponentName", opponent.getName());

        EnergyService.EnergyBreakdown viewerEnergy = energyService.getBreakdown(gs, viewerIsPlayer);
        EnergyService.EnergyBreakdown opponentEnergy = energyService.getBreakdown(gs, !viewerIsPlayer);
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("spellsCast", viewer.getSpellsCastThisMatch());
        stats.put("trapsSprung", viewer.getTrapsSprungThisMatch());
        stats.put("siegelingsDefeated", viewer.getOpponentSieglingsDefeatedThisMatch());
        stats.put("yourHealth", viewer.getHealth());
        stats.put("opponentHealth", opponent.getHealth());
        stats.put("yourInternalEnergy", sumInternalEnergy(viewerEnergy));
        stats.put("yourExternalEnergy", sumExternalEnergy(viewerEnergy));
        stats.put("opponentInternalEnergy", sumInternalEnergy(opponentEnergy));
        stats.put("opponentExternalEnergy", sumExternalEnergy(opponentEnergy));
        screen.put("stats", stats);

        String matchType = roomId != null || gs.isEnemyHumanControlled() ? "ONLINE" : "SOLO";
        screen.put("matchType", matchType);
        screen.putAll(playerProgressionService.describeEarnedRewards(user, matchType, result));

        if (user != null) {
            screen.put("record", buildBattleRecord(user));
        }
        return screen;
    }

    private Map<String, Object> buildBattleRecord(AccountUser user) {
        List<MatchHistoryEntity> history = matchHistoryService.listRecent(user);
        int wins = 0;
        int losses = 0;
        for (MatchHistoryEntity entry : history) {
            if ("WIN".equalsIgnoreCase(entry.getResult())) {
                wins++;
            } else if ("LOSS".equalsIgnoreCase(entry.getResult())) {
                losses++;
            }
        }
        int total = wins + losses;
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("wins", wins);
        record.put("losses", losses);
        record.put("total", total);
        record.put("winRate", total == 0 ? 0 : Math.round((wins * 100.0) / total));
        return record;
    }

    private String resolveViewerResult(GameState gs, String viewerName) {
        if (gs.getWinner() == null) {
            return "UNKNOWN";
        }
        if ("Draw".equalsIgnoreCase(gs.getWinner())) {
            return "DRAW";
        }
        return gs.getWinner().equalsIgnoreCase(viewerName) ? "WIN" : "LOSS";
    }

    private int sumInternalEnergy(EnergyService.EnergyBreakdown energy) {
        return energy.fireInternal() + energy.earthInternal() + energy.windInternal()
                + energy.waterInternal() + energy.iceInternal() + energy.shadowInternal()
                + energy.electricInternal() + energy.metalInternal() + energy.undeadInternal()
                + energy.psychicInternal();
    }

    private int sumExternalEnergy(EnergyService.EnergyBreakdown energy) {
        return energy.fireExternal() + energy.earthExternal() + energy.windExternal()
                + energy.waterExternal() + energy.iceExternal() + energy.shadowExternal()
                + energy.electricExternal() + energy.metalExternal() + energy.undeadExternal()
                + energy.psychicExternal();
    }

    private Map<String, Object> buildRoomMeta(MultiplayerRoom room,
                                              MultiplayerService.RoomSession session,
                                              HttpServletRequest request) {
        boolean viewerIsPlayer = session.viewerIsPlayer();
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("roomId", room.getRoomId());
        resp.put("playerToken", session.playerToken());
        resp.put("viewerSide", viewerIsPlayer ? "PLAYER" : "ENEMY");
        resp.put("started", room.isStarted());
        resp.put("playerName", viewerIsPlayer ? room.getHostName() : room.getGuestName());
        resp.put("enemyName", viewerIsPlayer
                ? (room.getGuestName() == null ? "Waiting for Player 2" : room.getGuestName())
                : room.getHostName());
        resp.put("guestJoined", room.hasGuest());
        resp.put("hostReady", room.isHostReady());
        resp.put("guestReady", room.isGuestReady());
        resp.put("viewerIsHost", room.isHostToken(session.playerToken()));
        resp.put("hostUserId", room.getHostUserId());
        resp.put("hostName", room.getHostName());
        resp.put("guestName", room.getGuestName());
        resp.put("lobbyChat", room.getLobbyChat());
        resp.put("players", serializeLobbyPlayers(room));
        resp.put("shareUrl", buildShareUrl(request, room.getRoomId()));
        resp.put("expiresAt", room.getExpiresAt() == null ? null : room.getExpiresAt().toString());
        resp.put("format", room.getFormat() == null ? "PVP" : room.getFormat());
        return resp;
    }

    private List<Map<String, Object>> serializeLobbyPlayers(MultiplayerRoom room) {
        List<Map<String, Object>> players = new ArrayList<>();
        players.add(serializeLobbyPlayer(room.getHostName(), "host", room.isHostReady(), room.getHostOptions()));
        if (room.hasGuest()) {
            players.add(serializeLobbyPlayer(room.getGuestName(), "guest", room.isGuestReady(), room.getGuestOptions()));
        }
        return players;
    }

    private Map<String, Object> serializeLobbyPlayer(String name,
                                                     String role,
                                                     boolean ready,
                                                     GameService.StartOptions options) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("name", name);
        row.put("role", role);
        row.put("ready", ready);
        if (options != null) {
            row.put("deckId", options.playerDeckId());
            row.put("trainerId", options.playerTrainerId());
            row.put("loadoutLabel", options.loadoutLabel());
        }
        return row;
    }

    private String buildShareUrl(HttpServletRequest request, String roomId) {
        String baseUrl = resolveRequestOrigin(request);
        return baseUrl + "/social/lobby/" + roomId;
    }

    private Map<String, Object> serializeOpenRoom(MultiplayerRoom room) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("roomId", room.getRoomId());
        out.put("hostName", room.getHostName());
        out.put("hostUserId", room.getHostUserId());
        out.put("name", room.getHostName() + "'s Arena");
        out.put("playerCount", room.hasGuest() ? 2 : 1);
        out.put("maxPlayers", 2);
        out.put("format", "PVP 1v1");
        out.put("status", room.isStarted() ? "Started" : "Open");
        out.put("updatedAt", room.getUpdatedAt() == null ? null : room.getUpdatedAt().toString());
        out.put("expiresAt", room.getExpiresAt() == null ? null : room.getExpiresAt().toString());
        out.put("format", room.getFormat() == null ? "PVP" : room.getFormat());
        if (room.getHostOptions() != null) {
            out.put("deckId", room.getHostOptions().playerDeckId());
            out.put("trainerId", room.getHostOptions().playerTrainerId());
            out.put("custom", room.getHostOptions().customDeckCards() != null && !room.getHostOptions().customDeckCards().isEmpty());
        }
        return out;
    }

    private String resolveRequestOrigin(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isBlank()) {
            return origin.replaceAll("/+$", "");
        }

        String referer = request.getHeader("Referer");
        if (referer != null && !referer.isBlank()) {
            try {
                URI uri = URI.create(referer);
                if (uri.getScheme() != null && uri.getHost() != null) {
                    StringBuilder builder = new StringBuilder();
                    builder.append(uri.getScheme()).append("://").append(uri.getHost());
                    if (uri.getPort() != -1) {
                        builder.append(":").append(uri.getPort());
                    }
                    return builder.toString();
                }
            } catch (IllegalArgumentException ignored) {
                // Fall back to request URL parsing below.
            }
        }

        String baseUrl = request.getRequestURL().toString()
                .replace(request.getRequestURI(), request.getContextPath().isBlank() ? "" : request.getContextPath());
        String host = request.getHeader("Host");
        if (host != null && !host.isBlank() && !host.contains("localhost") && !host.startsWith("127.0.0.1")) {
            return "https://" + host;
        }
        return baseUrl;
    }

    private Map<String, Object> serializePlayer(GameState gs, boolean canonicalPlayerSide, boolean includeHand) {
        Player player = canonicalPlayerSide ? gs.getPlayer() : gs.getEnemy();
        EnergyService.EnergyBreakdown energy = energyService.getBreakdown(gs, canonicalPlayerSide);

        Map<String, Object> info = new LinkedHashMap<>();
        info.put("name", player.getName());
        info.put("health", player.getHealth());
        info.put("fireEnergy", player.getFireEnergy());
        info.put("earthEnergy", player.getEarthEnergy());
        info.put("windEnergy", player.getWindEnergy());
        info.put("waterEnergy", player.getWaterEnergy());
        info.put("iceEnergy", player.getIceEnergy());
        info.put("shadowEnergy", player.getShadowEnergy());
        info.put("electricEnergy", player.getElectricEnergy());
        info.put("mistActive", energy.mistActive());
        info.put("fireInternal", energy.fireInternal());
        info.put("fireExternal", energy.fireExternal());
        info.put("earthInternal", energy.earthInternal());
        info.put("earthExternal", energy.earthExternal());
        info.put("windInternal", energy.windInternal());
        info.put("windExternal", energy.windExternal());
        info.put("waterInternal", energy.waterInternal());
        info.put("waterExternal", energy.waterExternal());
        info.put("iceInternal", energy.iceInternal());
        info.put("iceExternal", energy.iceExternal());
        info.put("shadowInternal", energy.shadowInternal());
        info.put("shadowExternal", energy.shadowExternal());
        info.put("electricInternal", energy.electricInternal());
        info.put("electricExternal", energy.electricExternal());
        info.put("comboTwoCount", energy.comboTwoCount());
        info.put("comboThreeCount", energy.comboThreeCount());
        info.put("comboFourCount", energy.comboFourCount());
        info.put("comboPoints", energy.comboPoints().stream().map(point -> Map.of(
                "x", point.x(),
                "y", point.y(),
                "signature", point.signature(),
                "size", point.size(),
                "elements", point.elements().stream().map(Enum::name).toList()
        )).toList());
        info.put("nexusPoints", energy.nexusPoints().stream().map(point -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("x", point.x());
            row.put("y", point.y());
            row.put("notchCount", point.notchCount());
            row.put("contributingElements", point.contributingElements().stream().map(Enum::name).toList());
            return row;
        }).toList());
        info.put("deckSize", player.getDeck().size());
        info.put("trainer", serializeTrainer(player.getActiveTrainer()));

        if (includeHand) {
            info.put("hand", serializeHand(player));
            info.put("remainingDeck", serializeCards(player.getDeck()));
        } else {
            info.put("handSize", player.getHand().size());
        }

        return info;
    }

    private List<Map<String, Object>> serializeHand(Player player) {
        return serializeCards(player.getHand());
    }

    /** Ordered id+count summary of a preset deck so clients can preview its contents. */
    private List<Map<String, Object>> deckCardCounts(String deckId) {
        try {
            List<Card> cards = gameService.buildDeckById(deckId);
            Map<String, Long> counts = new LinkedHashMap<>();
            for (Card card : cards) {
                counts.merge(card.getId(), 1L, Long::sum);
            }
            return counts.entrySet().stream().map(entry -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", entry.getKey());
                m.put("count", entry.getValue());
                return (Map<String, Object>) m;
            }).toList();
        } catch (RuntimeException ex) {
            return List.of();
        }
    }

    private List<Map<String, Object>> serializeCards(List<Card> cards) {
        List<Map<String, Object>> serialized = new ArrayList<>();
        for (Card card : cards) {
            serialized.add(serializeCard(card));
        }
        return serialized;
    }

    private Map<String, Object> serializeCard(Card card) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", card.getId());
        m.put("name", card.getName());
        m.put("type", card.getCardType().name());
        m.put("element", card.getElement().name());
        m.put("rarity", card.getRarity().name());

        if (card.getCostElement() != null) {
            m.put("costElement", card.getCostElement().name());
            m.put("costAmount", card.getCostAmount());
        }

        if (card instanceof SieglingCard s) {
            m.put("moveIds", new ArrayList<>(s.getMoveIds()));
            m.put("moves", serializeSieglingMoves(s));
            List<Ability> visibleAbilities = visibleSieglingAbilities(s);
            if (!visibleAbilities.isEmpty()) {
                m.put("abilities", visibleAbilities.stream().map(this::serializeAbility).toList());
                m.put("ability", serializeAbility(visibleAbilities.get(0)));
            }
            m.put("health", s.getHealth());
            m.put("speed", s.getSpeed());
            m.put("preferredRow", s.getPreferredRow() == null ? null : s.getPreferredRow().name());
            m.put("notches", serializeNotches(s.getNotches()));
            m.put("evolvesFromId", s.getEvolvesFromId());
            m.put("evolvesFromName", s.getEvolvesFromName());
        } else if (card instanceof SpellCard sp) {
            if (card.getAbility() != null) {
                m.put("ability", serializeAbility(card.getAbility()));
            }
            if (sp.getRequiredReaction() != null) {
                m.put("requiredReaction", sp.getRequiredReaction().name());
            }
            if (sp.getRequiredComboSize() > 0) {
                m.put("requiredComboSize", sp.getRequiredComboSize());
            }
            if (sp.getRequiredComboSignature() != null) {
                m.put("requiredComboSignature", sp.getRequiredComboSignature());
            }
        } else if (card instanceof TrapCard trap) {
            if (card.getAbility() != null) {
                m.put("ability", serializeAbility(card.getAbility()));
            }
            m.put("trapBucketElement", trap.getCostElement() == null ? null : trap.getCostElement().name());
            m.put("trapBucketAmount", trap.getCostAmount());
        } else if (card.getAbility() != null) {
            m.put("ability", serializeAbility(card.getAbility()));
        }

        return m;
    }

    private Map<String, Object> serializeTrainer(TrainerCard trainer) {
        if (trainer == null) return null;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", trainer.getId());
        m.put("name", trainer.getName());
        m.put("element", trainer.getElement().name());
        m.put("tier", trainer.getTier());
        m.put("rarity", trainer.getRarity().name());
        m.put("oncePerGame", trainer.isOncePerGame());

        if (trainer.getAbility() != null) {
            m.put("passive", Map.of(
                    "name", trainer.getAbility().getName(),
                    "description", trainer.getAbility().getDescription(),
                    "targetType", trainer.getAbility().getTargetType().name()
            ));
        }
        if (trainer.getActiveAbility() != null) {
            m.put("active", serializeAbility(trainer.getActiveAbility()));
            m.put("canUseActive", trainer.canUseActive());
        }

        return m;
    }

    private Map<String, Object> serializeTrainerOption(TrainerCard trainer) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", trainer.getId());
        m.put("name", trainer.getName());
        m.put("element", trainer.getElement().name());
        m.put("tier", trainer.getTier());
        m.put("rarity", trainer.getRarity().name());
        m.put("oncePerGame", trainer.isOncePerGame());
        if (trainer.getAbility() != null) {
            m.put("passive", trainer.getAbility().getDescription());
        }
        if (trainer.getActiveAbility() != null) {
            m.put("active", trainer.getActiveAbility().getDescription());
        }
        return m;
    }

    private Object[][] serializeBoard(GameState gs, boolean canonicalPlayerSide) {
        Object[][] board = new Object[3][3];
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                CardInstance ci = gs.getAt(canonicalPlayerSide, r, c);
                if (ci == null) {
                    board[r][c] = null;
                    continue;
                }

                Map<String, Object> m = new LinkedHashMap<>();
                m.put("instanceId", ci.getInstanceId());
                m.put("cardId", ci.getCard().getId());
                m.put("name", ci.getName());
                m.put("element", ci.getElement().name());
                m.put("rarity", ci.getCard().getRarity().name());
                m.put("hp", ci.getCurrentHealth());
                m.put("maxHp", ci.getEffectiveMaxHealth());
                m.put("shieldHp", ci.getTemporaryShield());
                m.put("printedHealth", ci.getCard().getHealth());
                m.put("printedSpeed", ci.getCard().getSpeed());
                m.put("damageBoost", ci.getDamageBoost());
                m.put("spd", ci.getEffectiveSpeed());
                m.put("battlePhasesSeen", ci.getBattlePhasesSeen());
                m.put("statuses", ci.getStatusEffects().stream().map(Enum::name).toList());
                m.put("notches", serializeNotches(ci.getNotches()));
                List<Ability> visibleBoardAbilities = visibleSieglingAbilities(ci.getCard());
                if (!visibleBoardAbilities.isEmpty()) {
                    m.put("abilities", visibleBoardAbilities.stream()
                            .map((ab) -> serializeAbilityForBoard(ci, ab))
                            .toList());
                    Ability first = visibleBoardAbilities.get(0);
                    m.put("ability", describeBoardDamageAbility(ci, first));
                }
                board[r][c] = m;
            }
        }
        return board;
    }

    private List<Map<String, String>> serializeNotches(List<Notch> notches) {
        List<Map<String, String>> serialized = new ArrayList<>();
        for (Notch n : notches) {
            serialized.add(Map.of(
                    "direction", n.direction().name(),
                    "element", n.element().name()
            ));
        }
        return serialized;
    }

    private String describeBoardDamageAbility(CardInstance ci, Ability ability) {
        if (ability == null) {
            return "";
        }
        String desc = ability.getDescription();
        if (AbilityEffectKeys.DAMAGE.equals(ability.getEffectType()) && desc != null && desc.startsWith("Deal ")) {
            int boosted = Math.max(1, ability.getEffectValue() + ci.getDamageBoost());
            return desc.replaceFirst("Deal \\d+", "Deal " + boosted);
        }
        return desc == null ? "" : desc;
    }

    private Map<String, Object> serializeAbilityForBoard(CardInstance ci, Ability ability) {
        Map<String, Object> serialized = serializeAbility(ability);
        if (AbilityEffectKeys.DAMAGE.equals(ability.getEffectType())) {
            String desc = ability.getDescription();
            int boosted = Math.max(1, ability.getEffectValue() + ci.getDamageBoost());
            if (desc != null && desc.startsWith("Deal ")) {
                serialized.put("description", desc.replaceFirst("Deal \\d+", "Deal " + boosted));
                serialized.put("effectValue", boosted);
            }
        }
        return serialized;
    }

    private Map<String, Object> serializeAbility(Ability ability) {
        Map<String, Object> serialized = new LinkedHashMap<>();
        serialized.put("name", ability.getName());
        serialized.put("description", ability.getDescription());
        serialized.put("targetType", ability.getTargetType() == null ? null : ability.getTargetType().name());
        serialized.put("targetRow", ability.getTargetRow() == null ? null : ability.getTargetRow().name());
        serialized.put("targetCount", ability.getTargetCount());
        serialized.put("effectType", ability.getEffectType());
        serialized.put("effectValue", ability.getEffectValue());
        serialized.put("passive", ability.isPassive());
        serialized.put("requiredElement", ability.getRequiredElement() == null ? null : ability.getRequiredElement().name());
        serialized.put("requiredEnergy", ability.getRequiredEnergy());
        serialized.put("requiredReaction", ability.getRequiredReaction() == null ? null : ability.getRequiredReaction().name());
        return serialized;
    }

    private List<Map<String, Object>> serializeSieglingMoves(SieglingCard s) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (s == null || s.getMoveIds() == null) {
            return rows;
        }
        for (String mid : s.getMoveIds()) {
            Move move = movesPoolService.getMove(mid);
            if (move == null) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", move.id());
            row.put("name", move.name());
            row.put("energyCost", move.energyCost());
            row.put("description", move.description());
            row.put("isPassive", move.isPassive());
            rows.add(row);
        }
        return rows;
    }

    /** Abilities shown on cards / board in the game client (printed passives are hidden). */
    private List<Ability> visibleSieglingAbilities(SieglingCard s) {
        if (s == null) {
            return List.of();
        }
        return movesPoolService.resolvePrintedAbilities(s).stream()
                .filter(a -> a != null && !a.isPassive())
                .toList();
    }

    private Object serializePendingBattle(GameState gs) {
        CardInstance attacker = gameService.getPendingBattleAttacker(gs);
        if (attacker == null) {
            return null;
        }

        Map<String, Object> pending = new LinkedHashMap<>();
        pending.put("instanceId", attacker.getInstanceId());
        pending.put("name", attacker.getName());
        pending.put("element", attacker.getElement().name());
        pending.put("row", attacker.getBoardRow());
        pending.put("col", attacker.getBoardCol());

        List<Map<String, Object>> abilities = new ArrayList<>();
        for (BattleAbilityOption option : gameService.getPendingBattleAbilities(gs)) {
            Map<String, Object> ability = new LinkedHashMap<>();
            ability.put("index", option.getIndex());
            ability.put("name", option.getAbility().getName());
            ability.put("description", option.getAbility().getDescription());
            ability.put("targetType", option.getTargetType().name());
            ability.put("targetRow", option.getAbility().getTargetRow() == null ? null : option.getAbility().getTargetRow().name());
            ability.put("effectType", option.getAbility().getEffectType());
            ability.put("effectValue", option.getAbility().getEffectValue());
            ability.put("requiredElement", option.getRequiredElement() == null ? null : option.getRequiredElement().name());
            ability.put("requiredEnergy", option.getRequiredEnergy());
            ability.put("affordable", option.isAffordable());
            ability.put("fromPrintedPassive", option.getAbility().isBattleOptionFromPrintedPassive());
            abilities.add(ability);
        }

        pending.put("abilities", abilities);
        return pending;
    }

    private GameService.StartOptions parseStartOptions(Map<String, Object> req, String fallbackDeckId, String fallbackTrainerId) {
        String deckId = req == null ? null : (String) req.get("deckId");
        String trainerId = req == null ? null : (String) req.get("trainerId");
        String loadoutLabel = req == null ? null : (String) req.get("loadoutLabel");
        List<String> customDeckCards = null;
        if (req != null && req.get("customDeckCards") instanceof List<?> rawCards) {
            customDeckCards = rawCards.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .toList();
        }
        return new GameService.StartOptions(
                deckId == null ? fallbackDeckId : deckId,
                trainerId == null ? fallbackTrainerId : trainerId,
                customDeckCards,
                loadoutLabel
        );
    }

    private void validateStartOwnership(AccountUser user, GameService.StartOptions options) {
        if (options.customDeckCards() == null || options.customDeckCards().isEmpty()) {
            return;
        }
        if (user == null) {
            throw new IllegalArgumentException("Sign in to use custom decks.");
        }
        playerProgressionService.validateCustomDeckOwnership(user, options.customDeckCards());
    }

    @SuppressWarnings("unchecked")
    private List<Integer> parseMulliganIndices(Map<String, Object> req, GameState state, boolean viewerIsPlayer) {
        if (req == null || state == null) {
            return List.of();
        }
        Player actor = viewerIsPlayer ? state.getPlayer() : state.getEnemy();
        int handSize = actor.getHand().size();
        Object raw = req.get("mulliganIndices");
        if (raw instanceof List<?> list && !list.isEmpty()) {
            List<Integer> parsed = new ArrayList<>();
            for (Object o : list) {
                if (o instanceof Number num) {
                    parsed.add(num.intValue());
                } else {
                    throw new IllegalArgumentException("mulliganIndices must be a list of integers");
                }
            }
            return normalizeMulliganIndices(parsed, handSize);
        }
        if (Boolean.TRUE.equals(req.get("takeMulligan"))) {
            return IntStream.range(0, handSize).boxed().toList();
        }
        return List.of();
    }

    private List<Integer> normalizeMulliganIndices(List<Integer> raw, int handSize) {
        if (handSize == 0 || raw.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<Integer> unique = new LinkedHashSet<>();
        for (Integer i : raw) {
            if (i == null || i < 0 || i >= handSize) {
                throw new IllegalArgumentException("Invalid mulligan hand index: " + i);
            }
            unique.add(i);
        }
        return new ArrayList<>(unique);
    }
}
