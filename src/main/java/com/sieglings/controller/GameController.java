package com.sieglings.controller;

import com.sieglings.model.Ability;
import com.sieglings.model.BattleAbilityOption;
import com.sieglings.model.Card;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Phase;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.EnergyService;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.GameService;
import com.sieglings.service.AccountService;
import com.sieglings.service.MultiplayerRoom;
import com.sieglings.service.MultiplayerService;
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
                "recommendedTrainerId", deck.recommendedTrainerId()
        )).toList());
        resp.put("trainers", gameService.getTrainerOptions().stream().map(this::serializeTrainerOption).toList());
        resp.put("deckBuilder", Map.of(
                "minDeckSize", gameService.getDeckBuilderMinSize(),
                "maxCopies", gameService.getDeckBuilderMaxCopies()
        ));
        resp.put("cardCatalog", gameService.getDeckBuilderCatalog().stream().map(this::serializeCard).toList());
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

    @GetMapping("/api/match/status")
    @ResponseBody
    public Map<String, Object> getMatchStatus(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                              @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                              HttpServletRequest request) {
        try {
            MultiplayerRoom room = multiplayerService.requireAuthorizedRoom(roomId, playerToken);
            boolean viewerIsPlayer = multiplayerService.viewerIsPlayer(roomId, playerToken);
            Map<String, Object> resp = buildRoomMeta(
                    room,
                    new MultiplayerService.RoomSession(roomId, playerToken, viewerIsPlayer, room.isStarted()),
                    request
            );
            if (room.isStarted()) {
                resp.putAll(buildStateResponse(room.getGameState(), viewerIsPlayer, roomId));
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
            GameState state = gameService.newGame(options.playerDeckId(), options.playerTrainerId(), options.customDeckCards());
            AccountUser user = accountService.findUser(authorizationHeader);
            if (user != null) {
                state.getPlayer().setAccountUserId(user.getId());
            }
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
        return buildStateResponse(gameService.getState(), true, null);
    }

    @PostMapping("/api/game/mulligan")
    @ResponseBody
    public Map<String, Object> mulligan(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                        @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
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

        List<Integer> indices = parseMulliganIndices(req, gameService.getState(), true);
        gameService.resolveOpeningMulligan(indices);
        return buildStateResponse(gameService.getState(), true, null);
    }

    @GetMapping("/api/game/state")
    @ResponseBody
    public Map<String, Object> getState(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                        @RequestHeader(value = "X-Player-Token", required = false) String playerToken) {
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

        if (gameService.getState() == null) {
            return Map.of("error", "No active game. Start a new game first.");
        }
        return buildStateResponse(gameService.getState(), true, null);
    }

    @PostMapping("/api/game/draw")
    @ResponseBody
    public Map<String, Object> draw(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                    @RequestHeader(value = "X-Player-Token", required = false) String playerToken) {
        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.draw(roomId, playerToken);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        gameService.playerDraw();
        return buildStateResponse(gameService.getState(), true, null);
    }

    @PostMapping("/api/game/place")
    @ResponseBody
    public Map<String, Object> place(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                     @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
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

        gameService.placeSiegling(cardId, row, col);
        return buildStateResponse(gameService.getState(), true, null);
    }

    @PostMapping("/api/game/cast")
    @ResponseBody
    public Map<String, Object> cast(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                    @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
                                    @RequestBody Map<String, Object> req) {
        String cardId = (String) req.get("cardId");
        int targetRow = req.containsKey("targetRow") ? (int) req.get("targetRow") : -1;
        int targetCol = req.containsKey("targetCol") ? (int) req.get("targetCol") : -1;

        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.castSpell(roomId, playerToken, cardId, targetRow, targetCol);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        gameService.castSpell(cardId, targetRow, targetCol);
        return buildStateResponse(gameService.getState(), true, null);
    }

    @PostMapping("/api/game/claim")
    @ResponseBody
    public Map<String, Object> claim(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                     @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
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

        gameService.claimSiegling(row, col);
        return buildStateResponse(gameService.getState(), true, null);
    }

    @PostMapping("/api/game/trainer")
    @ResponseBody
    public Map<String, Object> useTrainer(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                          @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
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

        gameService.useTrainerAbility(targetRow, targetCol);
        return buildStateResponse(gameService.getState(), true, null);
    }

    @PostMapping("/api/game/battle")
    @ResponseBody
    public Map<String, Object> battle(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                      @RequestHeader(value = "X-Player-Token", required = false) String playerToken) {
        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.battle(roomId, playerToken);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        gameService.executeBattle();
        return buildStateResponse(gameService.getState(), true, null);
    }

    @PostMapping("/api/game/battle/action")
    @ResponseBody
    public Map<String, Object> battleAction(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                            @RequestHeader(value = "X-Player-Token", required = false) String playerToken,
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

        gameService.submitBattleAction(abilityIndex, targetRow, targetCol);
        return buildStateResponse(gameService.getState(), true, null);
    }

    @PostMapping("/api/game/endturn")
    @ResponseBody
    public Map<String, Object> endTurn(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                       @RequestHeader(value = "X-Player-Token", required = false) String playerToken) {
        if (roomId != null && playerToken != null) {
            try {
                GameState state = multiplayerService.endTurn(roomId, playerToken);
                return buildStateResponse(state, multiplayerService.viewerIsPlayer(roomId, playerToken), roomId);
            } catch (IllegalArgumentException ex) {
                return Map.of("error", ex.getMessage());
            }
        }

        gameService.endTurn();
        return buildStateResponse(gameService.getState(), true, null);
    }

    @GetMapping("/api/game/placements")
    @ResponseBody
    public List<int[]> getPlacements(@RequestHeader(value = "X-Room-Id", required = false) String roomId,
                                     @RequestHeader(value = "X-Player-Token", required = false) String playerToken) {
        if (roomId != null && playerToken != null) {
            try {
                return multiplayerService.getLegalPlacements(roomId, playerToken);
            } catch (IllegalArgumentException ex) {
                return List.of();
            }
        }
        return gameService.getPlayerLegalPlacements();
    }

    private Map<String, Object> buildStateResponse(GameState gs, boolean viewerIsPlayer, String roomId) {
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
        resp.put("playerPlacementUsed", gs.hasPlacedSieglingThisTurn(viewerIsPlayer));
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
        resp.put("gameLog", log.subList(Math.max(0, log.size() - 20), log.size()));
        return resp;
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
        resp.put("shareUrl", buildShareUrl(request, room.getRoomId()));
        return resp;
    }

    private String buildShareUrl(HttpServletRequest request, String roomId) {
        String baseUrl = resolveRequestOrigin(request);
        return baseUrl + "/?room=" + roomId;
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
            if (s.getAbility() != null) {
                m.put("ability", serializeAbility(s.getAbility()));
            }
            if (!s.getAbilities().isEmpty()) {
                m.put("abilities", s.getAbilities().stream()
                        .map(this::serializeAbility)
                        .toList());
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
            m.put("active", Map.of(
                    "name", trainer.getActiveAbility().getName(),
                    "description", trainer.getActiveAbility().getDescription(),
                    "targetType", trainer.getActiveAbility().getTargetType().name()
            ));
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
                m.put("spd", ci.getEffectiveSpeed());
                m.put("battlePhasesSeen", ci.getBattlePhasesSeen());
                m.put("statuses", ci.getStatusEffects().stream().map(Enum::name).toList());
                m.put("notches", serializeNotches(ci.getNotches()));
                if (!ci.getCard().getAbilities().isEmpty()) {
                    m.put("abilities", ci.getCard().getAbilities().stream()
                            .map(this::serializeAbility)
                            .toList());
                }
                if (ci.getCard().getAbility() != null) {
                    m.put("ability", ci.getCard().getAbility().getDescription());
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
            ability.put("requiredElement", option.getRequiredElement() == null ? null : option.getRequiredElement().name());
            ability.put("requiredEnergy", option.getRequiredEnergy());
            ability.put("affordable", option.isAffordable());
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
