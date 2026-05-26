package com.sieglings.controller;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.SavedDeckEntity;
import com.sieglings.service.AccountService;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.MatchHistoryService;
import com.sieglings.service.PlayerProgressionService;
import com.sieglings.service.SavedDeckService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private static final String UNAVAILABLE_MESSAGE =
            "The account service is temporarily unavailable. Please try again in a moment.";

    @Autowired
    private AccountService accountService;

    @Autowired
    private SavedDeckService savedDeckService;

    @Autowired
    private MatchHistoryService matchHistoryService;

    @Autowired
    private CardDefinitionService cardDefinitionService;

    @Autowired
    private PlayerProgressionService playerProgressionService;

    @PostMapping("/api/auth/register")
    public Map<String, Object> register(@RequestBody Map<String, Object> req) {
        try {
            AccountService.SessionView session = accountService.register(
                    (String) req.get("email"),
                    (String) req.get("password"),
                    (String) req.get("displayName")
            );
            return buildProfileResponse(session.user(), session.token());
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage(), "authenticated", false);
        } catch (RuntimeException ex) {
            log.error("Registration failed unexpectedly", ex);
            return Map.of("error", UNAVAILABLE_MESSAGE, "authenticated", false);
        }
    }

    @PostMapping("/api/auth/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> req) {
        try {
            AccountService.SessionView session = accountService.login(
                    (String) req.get("email"),
                    (String) req.get("password")
            );
            return buildProfileResponse(session.user(), session.token());
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage(), "authenticated", false);
        } catch (RuntimeException ex) {
            log.error("Login failed unexpectedly", ex);
            return Map.of("error", UNAVAILABLE_MESSAGE, "authenticated", false);
        }
    }

    @PostMapping("/api/auth/reset-password")
    public Map<String, Object> resetPassword(@RequestBody Map<String, Object> req) {
        try {
            AccountService.SessionView session = accountService.resetPassword(
                    (String) req.get("email"),
                    (String) req.get("resetCode"),
                    (String) req.get("password")
            );
            return buildProfileResponse(session.user(), session.token());
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage(), "authenticated", false);
        } catch (RuntimeException ex) {
            log.error("Password reset failed unexpectedly", ex);
            return Map.of("error", UNAVAILABLE_MESSAGE, "authenticated", false);
        }
    }

    @PostMapping("/api/auth/logout")
    public Map<String, Object> logout(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        accountService.logout(authorizationHeader);
        return Map.of("ok", true, "authenticated", false);
    }

    @GetMapping("/api/auth/me")
    public Map<String, Object> me(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AccountUser user = accountService.findUser(authorizationHeader);
        if (user == null) {
            return Map.of("authenticated", false);
        }
        return buildProfileResponse(user, null);
    }

    @PostMapping("/api/profile/decks")
    public Map<String, Object> saveDeck(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                        @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            List<String> customDeckCards = req.get("customDeckCards") instanceof List<?> rawCards
                    ? rawCards.stream().filter(String.class::isInstance).map(String.class::cast).toList()
                    : List.of();
            savedDeckService.saveDeck(
                    user,
                    (String) req.get("deckId"),
                    (String) req.get("trainerId"),
                    customDeckCards,
                    (String) req.get("name"),
                    (String) req.get("id")
            );
            return buildProfileResponse(user, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/profile/decks/delete")
    public Map<String, Object> deleteDeck(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                          @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            savedDeckService.deleteDeck(user, (String) req.get("id"));
            return buildProfileResponse(user, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/profile/friends")
    public Map<String, Object> addFriend(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                         @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            AccountUser updated = accountService.addFriend(user, (String) req.get("email"));
            return buildProfileResponse(updated, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/profile/friends/delete")
    public Map<String, Object> deleteFriend(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                            @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            AccountUser updated = accountService.removeFriend(user, (String) req.get("email"));
            return buildProfileResponse(updated, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    private Map<String, Object> buildProfileResponse(AccountUser user, String token) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("authenticated", true);
        if (token != null) {
            response.put("token", token);
        }
        response.put("user", Map.of(
                "id", user.getId(),
                "email", user.getEmail(),
                "displayName", user.getDisplayName()
        ));
        response.put("friends", loadFriends(user));
        response.put("savedDecks", loadSavedDecks(user));
        response.put("matchHistory", loadMatchHistory(user));
        if (playerProgressionService != null) {
            try {
                response.put("progression", playerProgressionService.serialize(playerProgressionService.getOrCreate(user)));
            } catch (RuntimeException ex) {
                log.warn("Unable to load progression for authenticated user {}", user.getId(), ex);
            }
        }
        return response;
    }

    private List<Map<String, Object>> loadFriends(AccountUser user) {
        return (user.getFriendEmails() == null ? List.<String>of() : user.getFriendEmails()).stream()
                .map(email -> {
                    Map<String, Object> friend = new LinkedHashMap<>();
                    friend.put("email", email);
                    try {
                        AccountUser friendUser = accountService.findByEmail(email);
                        friend.put("displayName", friendUser == null ? email : friendUser.getDisplayName());
                    } catch (RuntimeException ex) {
                        friend.put("displayName", email);
                    }
                    return friend;
                })
                .toList();
    }

    private List<Map<String, Object>> loadSavedDecks(AccountUser user) {
        try {
            return savedDeckService.listDecks(user).stream().map(this::serializeSavedDeck).toList();
        } catch (RuntimeException ex) {
            log.warn("Unable to load saved decks for authenticated user {}", user.getId(), ex);
            return List.of();
        }
    }

    private List<Map<String, Object>> loadMatchHistory(AccountUser user) {
        try {
            return matchHistoryService.listRecent(user).stream().map(this::serializeMatchHistory).toList();
        } catch (RuntimeException ex) {
            log.warn("Unable to load match history for authenticated user {}", user.getId(), ex);
            return List.of();
        }
    }

    private Map<String, Object> serializeSavedDeck(SavedDeckEntity deck) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", deck.getId());
        response.put("name", deck.getName());
        response.put("deckId", deck.getPresetDeckId());
        response.put("trainerId", deck.getTrainerId());
        response.put("customDeckCards", savedDeckService.readCustomDeckCards(deck));
        response.put("custom", deck.getCustomDeckCardsJson() != null && !deck.getCustomDeckCardsJson().isBlank() && !"[]".equals(deck.getCustomDeckCardsJson()));
        response.put("updatedAt", deck.getUpdatedAt() == null ? null : deck.getUpdatedAt().toString());
        if (deck.getPresetDeckId() != null) {
            cardDefinitionService.getDeckOption(deck.getPresetDeckId()).ifPresent(option -> response.put("deckName", option.name()));
        }
        response.put("trainerName", cardDefinitionService.getTrainerById(deck.getTrainerId()).getName());
        return response;
    }

    private Map<String, Object> serializeMatchHistory(MatchHistoryEntity history) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", history.getId());
        response.put("finishedAt", history.getFinishedAt() == null ? null : history.getFinishedAt().toString());
        response.put("result", history.getResult());
        response.put("matchType", history.getMatchType());
        response.put("opponentName", history.getOpponentName());
        response.put("loadoutLabel", history.getLoadoutLabel());
        response.put("trainerName", history.getTrainerName());
        response.put("turnNumber", history.getTurnNumber());
        response.put("spellsCast", history.getSpellsCast());
        response.put("trapsSprung", history.getTrapsSprung());
        response.put("siegelingsDefeated", history.getSiegelingsDefeated());
        response.put("playerHealthRemaining", history.getPlayerHealthRemaining());
        response.put("opponentHealthRemaining", history.getOpponentHealthRemaining());
        response.put("playerEnergyRemaining", history.getPlayerEnergyRemaining());
        response.put("gameLog", history.getGameLog() == null ? java.util.List.of() : history.getGameLog());
        return response;
    }
}
