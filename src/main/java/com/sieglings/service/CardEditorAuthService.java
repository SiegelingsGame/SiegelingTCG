package com.sieglings.service;

import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
public class CardEditorAuthService {

    public record EditorIdentity(String email, String displayName) {}

    public record EditorAuthSnapshot(
            boolean available,
            boolean bootstrappable,
            boolean authenticated,
            boolean canEdit,
            String email,
            String displayName
    ) {}

    public record EditorAuthResponse(String token, EditorAuthSnapshot auth) {}

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final CardOverrideStorageService storageService;
    private final String adminsCollection;
    private final String sessionsCollection;
    private final long sessionTtlDays;

    public CardEditorAuthService(
            CardOverrideStorageService storageService,
            @Value("${app.card-editor.admins-collection:cardEditorAdmins}") String adminsCollection,
            @Value("${app.card-editor.sessions-collection:cardEditorSessions}") String sessionsCollection,
            @Value("${app.card-editor.session-ttl-days:30}") long sessionTtlDays
    ) {
        this.storageService = storageService;
        this.adminsCollection = adminsCollection;
        this.sessionsCollection = sessionsCollection;
        this.sessionTtlDays = sessionTtlDays;
    }

    public EditorAuthSnapshot describe(String token) {
        if (!storageService.isFirestoreReady()) {
            return new EditorAuthSnapshot(false, false, false, false, null, null);
        }
        boolean bootstrappable = !hasAnyAdmin();
        EditorIdentity identity = resolveIdentity(token);
        return new EditorAuthSnapshot(
                true,
                bootstrappable,
                identity != null,
                identity != null,
                identity == null ? null : identity.email(),
                identity == null ? null : identity.displayName()
        );
    }

    public EditorAuthResponse bootstrap(String email, String password, String displayName) {
        Firestore firestore = storageService.requireFirestore();
        String normalizedEmail = normalizeEmail(email);
        validatePassword(password);
        String normalizedDisplayName = normalizeDisplayName(displayName, normalizedEmail);

        try {
            firestore.runTransaction(transaction -> {
                boolean alreadyBootstrapped = !transaction.get(firestore.collection(adminsCollection).limit(1)).get().isEmpty();
                if (alreadyBootstrapped) {
                    throw new IllegalArgumentException("The dashboard already has an admin account. Use login instead.");
                }
                DocumentReference adminRef = adminRef(normalizedEmail);
                if (transaction.get(adminRef).get().exists()) {
                    throw new IllegalArgumentException("That editor account already exists.");
                }
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("email", normalizedEmail);
                payload.put("displayName", normalizedDisplayName);
                payload.put("passwordHash", passwordEncoder.encode(password));
                payload.put("createdAt", Instant.now().toString());
                transaction.create(adminRef, payload);
                return null;
            }).get(15, TimeUnit.SECONDS);
        } catch (Exception ex) {
            if (ex.getCause() instanceof IllegalArgumentException illegalArgumentException) {
                throw illegalArgumentException;
            }
            if (ex instanceof IllegalArgumentException illegalArgumentException) {
                throw illegalArgumentException;
            }
            throw new IllegalStateException("Unable to create the dashboard admin account.", ex);
        }

        return createSession(normalizedEmail, normalizedDisplayName);
    }

    public EditorAuthResponse login(String email, String password) {
        String normalizedEmail = normalizeEmail(email);
        Firestore firestore = storageService.requireFirestore();
        DocumentSnapshot snapshot;
        try {
            snapshot = adminRef(normalizedEmail).get().get(10, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to check that dashboard account.", ex);
        }
        if (!snapshot.exists()) {
            throw new IllegalArgumentException("That dashboard admin account was not found.");
        }
        String passwordHash = snapshot.getString("passwordHash");
        if (passwordHash == null || !passwordEncoder.matches(password == null ? "" : password, passwordHash)) {
            throw new IllegalArgumentException("Email or password is incorrect.");
        }
        return createSession(normalizedEmail, snapshot.getString("displayName"));
    }

    public void logout(String token) {
        if (!storageService.isFirestoreReady() || token == null || token.isBlank()) {
            return;
        }
        try {
            sessionRef(token.trim()).delete().get(10, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to end that dashboard session.", ex);
        }
    }

    public EditorIdentity requireEditor(String token) {
        EditorIdentity identity = resolveIdentity(token);
        if (identity == null) {
            throw new IllegalArgumentException("Sign in to publish live card data.");
        }
        return identity;
    }

    private EditorAuthResponse createSession(String email, String displayName) {
        String token = UUID.randomUUID().toString().replace("-", "");
        Instant expiresAt = Instant.now().plus(sessionTtlDays, ChronoUnit.DAYS);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("email", email);
        payload.put("displayName", displayName);
        payload.put("createdAt", Instant.now().toString());
        payload.put("expiresAt", expiresAt.toString());

        try {
            sessionRef(token).set(payload).get(10, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to create the dashboard session.", ex);
        }

        return new EditorAuthResponse(
                token,
                new EditorAuthSnapshot(true, !hasAnyAdmin(), true, true, email, displayName)
        );
    }

    private EditorIdentity resolveIdentity(String token) {
        if (!storageService.isFirestoreReady() || token == null || token.isBlank()) {
            return null;
        }
        try {
            DocumentSnapshot sessionSnapshot = sessionRef(token.trim()).get().get(10, TimeUnit.SECONDS);
            if (!sessionSnapshot.exists()) {
                return null;
            }
            String expiresAtRaw = sessionSnapshot.getString("expiresAt");
            if (expiresAtRaw == null || Instant.parse(expiresAtRaw).isBefore(Instant.now())) {
                sessionRef(token.trim()).delete();
                return null;
            }
            String email = sessionSnapshot.getString("email");
            String displayName = sessionSnapshot.getString("displayName");
            if (email == null || email.isBlank()) {
                return null;
            }
            return new EditorIdentity(email, displayName == null || displayName.isBlank() ? email : displayName);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to validate the dashboard session.", ex);
        }
    }

    private boolean hasAnyAdmin() {
        try {
            return !storageService.requireFirestore()
                    .collection(adminsCollection)
                    .limit(1)
                    .get()
                    .get(10, TimeUnit.SECONDS)
                    .isEmpty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to check dashboard admin setup.", ex);
        }
    }

    private DocumentReference adminRef(String email) {
        return storageService.requireFirestore().collection(adminsCollection).document(email);
    }

    private DocumentReference sessionRef(String token) {
        return storageService.requireFirestore().collection(sessionsCollection).document(token);
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
        if (password == null || password.length() < 8) {
            throw new IllegalArgumentException("Editor passwords must be at least 8 characters.");
        }
        if (password.length() > 72) {
            throw new IllegalArgumentException("Editor passwords must be 72 characters or fewer.");
        }
    }

    private String normalizeDisplayName(String displayName, String email) {
        String candidate = displayName == null ? "" : displayName.trim();
        if (candidate.isBlank()) {
            candidate = email.substring(0, email.indexOf('@'));
        }
        if (candidate.length() > 30) {
            candidate = candidate.substring(0, 30);
        }
        return candidate;
    }
}
