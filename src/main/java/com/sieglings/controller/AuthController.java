package com.sieglings.controller;

import com.sieglings.config.SessionCookieAuthFilter;
import com.sieglings.config.SessionCookieService;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.persistence.entity.SavedDeckEntity;
import com.sieglings.service.DeckValidationException;
import com.sieglings.service.AccountService;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.MatchHistoryService;
import com.sieglings.service.PlayerProgressionService;
import com.sieglings.service.ProfileSettingsService;
import com.sieglings.service.FriendRequestService;
import com.sieglings.service.PresenceService;
import com.sieglings.service.SavedDeckService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
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
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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

    @Autowired
    private ProfileSettingsService profileSettingsService;

    @Autowired
    private FriendRequestService friendRequestService;

    @Autowired
    private PresenceService presenceService;

    @Autowired
    private SessionCookieService sessionCookieService;

    // Bounded pool for fanning out the independent Firestore reads that make up a
    // profile response. Daemon threads so it never blocks JVM shutdown. Every task
    // submitted here is a leaf — it never waits on another pooled task — so the
    // pool cannot deadlock on itself; the only blocking join runs on the request
    // thread.
    private final ExecutorService authProfileExecutor =
            Executors.newFixedThreadPool(16, runnable -> {
                Thread thread = new Thread(runnable, "auth-profile-loader");
                thread.setDaemon(true);
                return thread;
            });

    @PostMapping("/api/auth/register")
    public Map<String, Object> register(@RequestBody Map<String, Object> req, HttpServletResponse response) {
        try {
            AccountService.SessionView session = accountService.register(
                    (String) req.get("email"),
                    (String) req.get("password"),
                    (String) req.get("displayName")
            );
            sessionCookieService.setSession(response, session.token());
            return buildProfileResponse(session.user(), session.token());
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage(), "authenticated", false);
        } catch (RuntimeException ex) {
            log.error("Registration failed unexpectedly", ex);
            return Map.of("error", UNAVAILABLE_MESSAGE, "authenticated", false);
        }
    }

    @PostMapping("/api/auth/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> req, HttpServletResponse response) {
        try {
            AccountService.SessionView session = accountService.login(
                    (String) req.get("email"),
                    (String) req.get("password")
            );
            sessionCookieService.setSession(response, session.token());
            return buildProfileResponse(session.user(), session.token());
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage(), "authenticated", false);
        } catch (RuntimeException ex) {
            log.error("Login failed unexpectedly", ex);
            return Map.of("error", UNAVAILABLE_MESSAGE, "authenticated", false);
        }
    }

    @PostMapping("/api/auth/reset-password")
    public Map<String, Object> resetPassword(@RequestBody Map<String, Object> req, HttpServletResponse response) {
        try {
            AccountService.SessionView session = accountService.resetPassword(
                    (String) req.get("email"),
                    (String) req.get("resetCode"),
                    (String) req.get("password")
            );
            sessionCookieService.setSession(response, session.token());
            return buildProfileResponse(session.user(), session.token());
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage(), "authenticated", false);
        } catch (RuntimeException ex) {
            log.error("Password reset failed unexpectedly", ex);
            return Map.of("error", UNAVAILABLE_MESSAGE, "authenticated", false);
        }
    }

    @PostMapping("/api/auth/logout")
    public Map<String, Object> logout(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                      HttpServletResponse response) {
        AccountUser user = accountService.findUser(authorizationHeader);
        if (user != null) {
            presenceService.markOffline(user);
        }
        accountService.logout(authorizationHeader);
        sessionCookieService.clearSession(response);
        return Map.of("ok", true, "authenticated", false);
    }

    @PostMapping("/api/auth/delete-account")
    public Map<String, Object> deleteAccount(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                             @RequestBody Map<String, Object> req,
                                             HttpServletResponse response) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            accountService.deleteAccount(user, (String) req.get("confirmationText"));
            sessionCookieService.clearSession(response);
            return Map.of("ok", true, "authenticated", false);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        } catch (RuntimeException ex) {
            log.error("Account deletion failed unexpectedly", ex);
            return Map.of("error", UNAVAILABLE_MESSAGE);
        }
    }

    @GetMapping("/api/auth/me")
    public Map<String, Object> me(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                  HttpServletRequest request,
                                  HttpServletResponse response) {
        AccountUser user = accountService.findUser(authorizationHeader);
        if (user == null) {
            return Map.of("authenticated", false, "cookieSession", false);
        }
        // Refresh the cookie on every authenticated check: this transparently
        // upgrades legacy clients that still authenticate via the Bearer header
        // (the filter resolves either source) to cookie auth, and slides the
        // 30-day expiry forward on activity.
        sessionCookieService.setSession(response, accountService.extractBearerToken(authorizationHeader));
        Map<String, Object> profile = buildProfileResponse(user, null);
        // The one signal a client cannot derive for itself: did a session cookie
        // survive the trip to this server? Clients hold on to their Bearer token
        // until this comes back true, so a stripped cookie degrades to "still
        // signed in via header" instead of "log in again on every page".
        profile.put("cookieSession", cookieAuthenticated(request, authorizationHeader, user));
        return profile;
    }

    /** True when this request carried a session cookie that resolves to {@code user}. */
    private boolean cookieAuthenticated(HttpServletRequest request, String authorizationHeader, AccountUser user) {
        Object attribute = request == null
                ? null
                : request.getAttribute(SessionCookieAuthFilter.SESSION_COOKIE_TOKEN_ATTRIBUTE);
        if (!(attribute instanceof String cookieToken) || cookieToken.isBlank()) {
            return false;
        }
        // When the filter bridged the cookie it IS the credential that just
        // authenticated this request, so there is nothing left to verify.
        if (cookieToken.equals(accountService.extractBearerToken(authorizationHeader))) {
            return true;
        }
        try {
            AccountUser cookieUser = accountService.findUser("Bearer " + cookieToken);
            return cookieUser != null && Objects.equals(cookieUser.getId(), user.getId());
        } catch (RuntimeException ex) {
            log.warn("Unable to verify session cookie for user {}", user.getId(), ex);
            return false;
        }
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
                    (String) req.get("id"),
                    (String) req.get("clientDeckId")
            );
            return buildProfileResponse(user, null);
        } catch (IllegalArgumentException ex) {
            return deckError(ex);
        } catch (RuntimeException ex) {
            // A storage or catalog failure used to surface as a bare 500, which the
            // client could only render as "Request failed" — name it instead.
            log.error("Saving deck failed", ex);
            return Map.of("error", "We couldn't save this deck right now. Try again in a moment; if it keeps failing, reload the page.");
        }
    }

    // Validation errors carry the deck-builder control the player must fix so the
    // client can scroll to and highlight it rather than only popping a message.
    private Map<String, Object> deckError(IllegalArgumentException ex) {
        String message = ex.getMessage() == null ? "That deck could not be saved." : ex.getMessage();
        if (ex instanceof DeckValidationException validation && validation.getField() != null) {
            return Map.of("error", message, "field", validation.getField());
        }
        return Map.of("error", message);
    }

    @PostMapping("/api/profile/decks/delete")
    public Map<String, Object> deleteDeck(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                          @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            boolean removed = savedDeckService.deleteDeck(user, (String) req.get("id"));
            Map<String, Object> response = new LinkedHashMap<>(buildProfileResponse(user, null));
            // A deck that was already gone is not an error — the binder just held a
            // stale row. Say so, so the client can drop it silently instead of
            // restoring a tile the player can never delete.
            response.put("deckMissing", !removed);
            return response;
        } catch (IllegalArgumentException ex) {
            return deckError(ex);
        } catch (RuntimeException ex) {
            log.error("Deleting deck failed", ex);
            return Map.of("error", "We couldn't delete this deck right now. Try again in a moment.");
        }
    }

    @PostMapping("/api/profile/friends")
    public Map<String, Object> sendFriendRequest(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                                   @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            AccountUser updated = accountService.sendFriendRequest(user, (String) req.get("email"));
            return buildProfileResponse(updated, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/profile/friends/accept")
    public Map<String, Object> acceptFriendRequest(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                                   @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            AccountUser updated = accountService.acceptFriendRequest(user, (String) req.get("fromUserId"));
            return buildProfileResponse(updated, null);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/profile/friends/deny")
    public Map<String, Object> denyFriendRequest(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                                 @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            AccountUser updated = accountService.denyFriendRequest(user, (String) req.get("fromUserId"));
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
        // Kick off the independent profile lookups concurrently. Each is its own
        // Firestore read (or set of reads) with no ordering dependency on the
        // others, so fanning them out turns ~a dozen sequential round trips into
        // roughly the cost of the slowest one. Every task swallows its own failure
        // and falls back to an empty/absent value, so one slow or erroring lookup
        // can't fail the whole response.
        CompletableFuture<List<Map<String, Object>>> friendsF = loadFriendsAsync(user);
        CompletableFuture<List<Map<String, Object>>> incomingF =
                CompletableFuture.supplyAsync(() -> loadIncomingFriendRequests(user), authProfileExecutor);
        CompletableFuture<List<Map<String, Object>>> outgoingF =
                CompletableFuture.supplyAsync(() -> loadOutgoingFriendRequests(user), authProfileExecutor);
        CompletableFuture<List<Map<String, Object>>> decksF =
                CompletableFuture.supplyAsync(() -> loadSavedDecks(user), authProfileExecutor);
        CompletableFuture<List<Map<String, Object>>> historyF =
                CompletableFuture.supplyAsync(() -> loadMatchHistory(user), authProfileExecutor);
        CompletableFuture<Object> progressionF =
                CompletableFuture.supplyAsync(() -> loadProgression(user), authProfileExecutor);
        CompletableFuture<Object> settingsF =
                CompletableFuture.supplyAsync(() -> loadProfileSettings(user), authProfileExecutor);

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
        response.put("friends", friendsF.join());
        response.put("incomingFriendRequests", incomingF.join());
        response.put("outgoingFriendRequests", outgoingF.join());
        response.put("savedDecks", decksF.join());
        response.put("matchHistory", historyF.join());
        Object progression = progressionF.join();
        if (progression != null) {
            response.put("progression", progression);
        }
        Object profileSettings = settingsF.join();
        if (profileSettings != null) {
            response.put("profileSettings", profileSettings);
        }
        return response;
    }

    private Object loadProgression(AccountUser user) {
        if (playerProgressionService == null) {
            return null;
        }
        try {
            return playerProgressionService.serialize(playerProgressionService.getOrCreate(user), user);
        } catch (RuntimeException ex) {
            log.warn("Unable to load progression for authenticated user {}", user.getId(), ex);
            return null;
        }
    }

    private Object loadProfileSettings(AccountUser user) {
        if (profileSettingsService == null) {
            return null;
        }
        try {
            return profileSettingsService.findSerializedIfPresent(user).orElse(null);
        } catch (RuntimeException ex) {
            log.warn("Unable to load profile settings for authenticated user {}", user.getId(), ex);
            return null;
        }
    }

    private List<Map<String, Object>> loadIncomingFriendRequests(AccountUser user) {
        if (friendRequestService == null) {
            return List.of();
        }
        try {
            return friendRequestService.listIncoming(user);
        } catch (RuntimeException ex) {
            log.warn("Unable to load incoming friend requests for authenticated user {}", user.getId(), ex);
            return List.of();
        }
    }

    private List<Map<String, Object>> loadOutgoingFriendRequests(AccountUser user) {
        if (friendRequestService == null) {
            return List.of();
        }
        try {
            return friendRequestService.listOutgoing(user);
        } catch (RuntimeException ex) {
            log.warn("Unable to load outgoing friend requests for authenticated user {}", user.getId(), ex);
            return List.of();
        }
    }

    // Each friend requires its own Firestore reads (the friend's user record plus
    // their profile settings), so resolve them as concurrent leaf tasks rather
    // than looping sequentially. allOf + join completes without blocking a pool
    // thread, so this composes safely with the other parallel profile lookups.
    private CompletableFuture<List<Map<String, Object>>> loadFriendsAsync(AccountUser user) {
        List<String> emails = user.getFriendEmails() == null ? List.of() : user.getFriendEmails();
        List<CompletableFuture<Map<String, Object>>> futures = emails.stream()
                .map(email -> CompletableFuture.supplyAsync(() -> loadFriendEntry(user, email), authProfileExecutor))
                .toList();
        return CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                .thenApply(ignored -> futures.stream()
                        .map(CompletableFuture::join)
                        .filter(Objects::nonNull)
                        .toList());
    }

    private Map<String, Object> loadFriendEntry(AccountUser user, String email) {
        try {
            AccountUser friendUser = accountService.findByEmail(email);
            if (friendUser == null || !FriendRequestService.areMutualFriends(user, friendUser)) {
                return null;
            }
            Map<String, Object> friend = new LinkedHashMap<>();
            friend.put("email", email);
            friend.put("userId", friendUser.getId());
            String displayName = friendUser.getDisplayName();
            if (profileSettingsService != null) {
                ProfileSettingsEntity settings = profileSettingsService.getOrCreate(friendUser);
                String settingsName = settings.getDisplayName();
                if (settingsName != null && !settingsName.isBlank()) {
                    displayName = settingsName;
                }
            }
            friend.put("displayName", displayName);
            friend.put("mutual", true);
            return friend;
        } catch (RuntimeException ex) {
            log.warn("Unable to load friend {} for user {}", email, user.getId(), ex);
            return null;
        }
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
