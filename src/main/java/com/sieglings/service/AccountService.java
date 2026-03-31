package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.AuthSession;
import com.sieglings.persistence.repo.AccountUserRepository;
import com.sieglings.persistence.repo.AuthSessionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.UUID;

@Service
public class AccountService {

    public record SessionView(AccountUser user, String token) {}

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Autowired
    private AccountUserRepository userRepository;

    @Autowired
    private AuthSessionRepository sessionRepository;

    @Transactional
    public SessionView register(String email, String password, String displayName) {
        String normalizedEmail = normalizeEmail(email);
        validatePassword(password);
        if (userRepository.findByEmail(normalizedEmail).isPresent()) {
            throw new IllegalArgumentException("That email is already registered.");
        }

        AccountUser user = new AccountUser();
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setDisplayName(normalizeDisplayName(displayName, normalizedEmail));
        user.setCreatedAt(Instant.now());
        userRepository.save(user);

        return createSession(user);
    }

    @Transactional
    public SessionView login(String email, String password) {
        String normalizedEmail = normalizeEmail(email);
        AccountUser user = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() -> new IllegalArgumentException("Email or password is incorrect."));

        if (!passwordEncoder.matches(password == null ? "" : password, user.getPasswordHash())) {
            throw new IllegalArgumentException("Email or password is incorrect.");
        }

        return createSession(user);
    }

    @Transactional(readOnly = true)
    public AccountUser findUser(String authorizationHeader) {
        String token = extractToken(authorizationHeader);
        if (token == null) {
            return null;
        }

        AuthSession session = sessionRepository.findById(token).orElse(null);
        if (session == null) {
            return null;
        }
        if (session.getExpiresAt() != null && session.getExpiresAt().isBefore(Instant.now())) {
            return null;
        }
        AccountUser user = session.getUser();
        user.getId();
        user.getEmail();
        return user;
    }

    @Transactional(readOnly = true)
    public AccountUser requireUser(String authorizationHeader) {
        AccountUser user = findUser(authorizationHeader);
        if (user == null) {
            throw new IllegalArgumentException("Sign in to use saved decks and history.");
        }
        return user;
    }

    @Transactional
    public void logout(String authorizationHeader) {
        String token = extractToken(authorizationHeader);
        if (token == null) {
            return;
        }
        sessionRepository.deleteById(token);
    }

    private SessionView createSession(AccountUser user) {
        AuthSession session = new AuthSession();
        session.setToken(UUID.randomUUID().toString().replace("-", ""));
        session.setUser(user);
        session.setCreatedAt(Instant.now());
        session.setLastUsedAt(Instant.now());
        session.setExpiresAt(Instant.now().plus(30, ChronoUnit.DAYS));
        sessionRepository.save(session);
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
