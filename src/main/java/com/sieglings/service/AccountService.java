package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.AuthSession;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.AuthSessionStore;
import com.sieglings.persistence.firestore.DailyMissionProgressStore;
import com.sieglings.persistence.firestore.DirectMessageStore;
import com.sieglings.persistence.firestore.FriendRequestStore;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import com.sieglings.persistence.firestore.ProfileSettingsStore;
import com.sieglings.persistence.firestore.SavedDeckStore;
import com.sieglings.persistence.firestore.UserPresenceStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class AccountService {

    public record SessionView(AccountUser user, String token) {}

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Autowired
    private AccountUserStore userStore;

    @Autowired
    private AuthSessionStore sessionStore;

    @Autowired
    private FriendRequestService friendRequestService;

    @Autowired
    private SavedDeckStore savedDeckStore;

    @Autowired
    private MatchHistoryStore matchHistoryStore;

    @Autowired
    private PlayerProgressionStore playerProgressionStore;

    @Autowired
    private ProfileSettingsStore profileSettingsStore;

    @Autowired
    private UserPresenceStore userPresenceStore;

    @Autowired
    private DailyMissionProgressStore dailyMissionProgressStore;

    @Autowired
    private FriendRequestStore friendRequestStore;

    @Autowired
    private DirectMessageStore directMessageStore;

    @Value("${app.auth.password-reset-code:}")
    private String passwordResetCode;

    public SessionView register(String email, String password, String displayName) {
        String normalizedEmail = normalizeEmail(email);
        validatePassword(password);
        if (userStore.findById(normalizedEmail).isPresent()) {
            throw new IllegalArgumentException("That email is already registered.");
        }

        AccountUser user = new AccountUser();
        user.setId(normalizedEmail);
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setDisplayName(normalizeDisplayName(displayName, normalizedEmail));
        user.setCreatedAt(Instant.now());
        userStore.save(user);

        return createSession(user);
    }

    public SessionView login(String email, String password) {
        String normalizedEmail = normalizeEmail(email);
        AccountUser user = userStore.findById(normalizedEmail)
                .orElseThrow(() -> new IllegalArgumentException("Email or password is incorrect."));

        if (!passwordEncoder.matches(password == null ? "" : password, user.getPasswordHash())) {
            throw new IllegalArgumentException("Email or password is incorrect.");
        }

        return createSession(user);
    }

    public SessionView resetPassword(String email, String resetCode, String newPassword) {
        String configuredCode = passwordResetCode == null ? "" : passwordResetCode.trim();
        if (configuredCode.isBlank()) {
            throw new IllegalArgumentException("Password reset is not configured on this server.");
        }
        if (!configuredCode.equals(resetCode == null ? "" : resetCode.trim())) {
            throw new IllegalArgumentException("Reset code is incorrect.");
        }

        String normalizedEmail = normalizeEmail(email);
        validatePassword(newPassword);
        AccountUser user = userStore.findById(normalizedEmail)
                .orElseThrow(() -> new IllegalArgumentException("No account exists for that email."));
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userStore.save(user);

        return createSession(user);
    }

    public AccountUser findUser(String authorizationHeader) {
        String token = extractToken(authorizationHeader);
        if (token == null) {
            return null;
        }

        AuthSession session = sessionStore.findById(token).orElse(null);
        if (session == null) {
            return null;
        }
        if (session.getExpiresAt() != null && session.getExpiresAt().isBefore(Instant.now())) {
            return null;
        }
        if (session.getUserId() == null) {
            return null;
        }
        return userStore.findById(session.getUserId()).orElse(null);
    }

    public AccountUser requireUser(String authorizationHeader) {
        AccountUser user = findUser(authorizationHeader);
        if (user == null) {
            throw new IllegalArgumentException("Sign in to use saved decks and history.");
        }
        return user;
    }

    public void logout(String authorizationHeader) {
        String token = extractToken(authorizationHeader);
        if (token == null) {
            return;
        }
        sessionStore.deleteById(token);
    }

    /**
     * Permanently removes the account and every record tied to it. Requires the caller to type
     * {@code DELETE} exactly, so an accidental click can never wipe a player's data.
     */
    public void deleteAccount(AccountUser user, String confirmationText) {
        if (user == null) {
            throw new IllegalArgumentException("Sign in to delete your account.");
        }
        if (!"DELETE".equals(confirmationText == null ? "" : confirmationText.trim())) {
            throw new IllegalArgumentException("Type DELETE to confirm account deletion.");
        }

        String userId = user.getId();

        // Detach from each friend so we don't leave dangling references in their friend lists.
        List<String> friendEmails = user.getFriendEmails() == null ? List.of() : user.getFriendEmails();
        for (String friendEmail : new LinkedHashSet<>(friendEmails)) {
            AccountUser peer = userStore.findById(friendEmail).orElse(null);
            if (peer == null) {
                continue;
            }
            LinkedHashSet<String> peerFriends = new LinkedHashSet<>(peer.getFriendEmails());
            if (peerFriends.remove(userId)) {
                peer.setFriendEmails(peerFriends.stream().toList());
                userStore.save(peer);
            }
        }

        // Remove all associated records, then the account document itself.
        friendRequestStore.deleteByUserId(userId);
        directMessageStore.deleteByUserId(userId);
        savedDeckStore.deleteByUserId(userId);
        matchHistoryStore.deleteByUserId(userId);
        playerProgressionStore.deleteByUserId(userId);
        profileSettingsStore.deleteByUserId(userId);
        dailyMissionProgressStore.deleteByUserId(userId);
        userPresenceStore.deleteByUserId(userId);
        sessionStore.deleteByUserId(userId);
        userStore.deleteById(userId);
    }

    public AccountUser sendFriendRequest(AccountUser user, String email) {
        friendRequestService.sendRequest(user, email);
        return userStore.findById(user.getId()).orElse(user);
    }

    public AccountUser acceptFriendRequest(AccountUser user, String fromUserId) {
        return friendRequestService.acceptRequest(user, fromUserId);
    }

    public AccountUser denyFriendRequest(AccountUser user, String fromUserId) {
        friendRequestService.denyRequest(user, fromUserId);
        return user;
    }

    public AccountUser removeFriend(AccountUser user, String email) {
        if (user == null) {
            throw new IllegalArgumentException("Sign in to manage friends.");
        }
        String normalizedEmail = normalizeEmail(email);
        LinkedHashSet<String> friends = new LinkedHashSet<>(user.getFriendEmails());
        friends.remove(normalizedEmail);
        user.setFriendEmails(friends.stream().toList());
        userStore.save(user);

        AccountUser peer = userStore.findById(normalizedEmail).orElse(null);
        if (peer != null) {
            LinkedHashSet<String> peerFriends = new LinkedHashSet<>(peer.getFriendEmails());
            peerFriends.remove(user.getId());
            peer.setFriendEmails(peerFriends.stream().toList());
            userStore.save(peer);
        }
        return user;
    }

    public AccountUser findByEmail(String email) {
        return userStore.findById(normalizeEmail(email)).orElse(null);
    }

    private SessionView createSession(AccountUser user) {
        AuthSession session = new AuthSession();
        session.setToken(UUID.randomUUID().toString().replace("-", ""));
        session.setUserId(user.getId());
        session.setCreatedAt(Instant.now());
        session.setLastUsedAt(Instant.now());
        session.setExpiresAt(Instant.now().plus(30, ChronoUnit.DAYS));
        sessionStore.save(session);
        return new SessionView(user, session.getToken());
    }

    private String normalizeEmail(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (!normalized.contains("@") || normalized.startsWith("@") || normalized.endsWith("@")) {
            throw new IllegalArgumentException("Enter a valid email address.");
        }
        if (normalized.length() > 190) {
            throw new IllegalArgumentException("That email is too long.");
        }
        return normalized;
    }

    private void validatePassword(String password) {
        if (password == null || password.length() < 6) {
            throw new IllegalArgumentException("Passwords must be at least 6 characters.");
        }
        if (password.length() > 72) {
            throw new IllegalArgumentException("Passwords must be 72 characters or fewer.");
        }
    }

    private String normalizeDisplayName(String displayName, String email) {
        String candidate = displayName == null ? "" : displayName.trim();
        if (candidate.isBlank()) {
            candidate = email.substring(0, email.indexOf('@'));
        }
        if (candidate.length() > 20) {
            candidate = candidate.substring(0, 20);
        }
        return candidate;
    }

    private String extractToken(String authorizationHeader) {
        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            return null;
        }
        String trimmed = authorizationHeader.trim();
        if (trimmed.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return trimmed.substring(7).trim();
        }
        return trimmed;
    }
}
