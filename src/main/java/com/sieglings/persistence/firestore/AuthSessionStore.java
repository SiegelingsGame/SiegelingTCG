package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.entity.AuthSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Component
public class AuthSessionStore {

    private static final long OP_TIMEOUT_SECONDS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    public Optional<AuthSession> findById(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        try {
            DocumentSnapshot snapshot = sessionDoc(token).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return snapshot.exists() ? Optional.of(toSession(token, snapshot)) : Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load session from Firestore.", ex);
        }
    }

    public AuthSession save(AuthSession session) {
        if (session.getToken() == null || session.getToken().isBlank()) {
            throw new IllegalArgumentException("AuthSession token is required.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", session.getUserId());
        payload.put("createdAt", toTimestamp(session.getCreatedAt()));
        payload.put("expiresAt", toTimestamp(session.getExpiresAt()));
        payload.put("lastUsedAt", toTimestamp(session.getLastUsedAt()));
        try {
            sessionDoc(session.getToken()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return session;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save session to Firestore.", ex);
        }
    }

    public void deleteById(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        try {
            sessionDoc(token).delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete session from Firestore.", ex);
        }
    }

    private DocumentReference sessionDoc(String token) {
        return client.requireFirestore().collection(client.sessionsCollection()).document(token);
    }

    private AuthSession toSession(String token, DocumentSnapshot snapshot) {
        AuthSession session = new AuthSession();
        session.setToken(token);
        session.setUserId(snapshot.getString("userId"));
        session.setCreatedAt(readInstant(snapshot, "createdAt"));
        session.setExpiresAt(readInstant(snapshot, "expiresAt"));
        session.setLastUsedAt(readInstant(snapshot, "lastUsedAt"));
        return session;
    }

    private Instant readInstant(DocumentSnapshot snapshot, String key) {
        Object value = snapshot.get(key);
        if (value instanceof Timestamp ts) {
            return Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos());
        }
        return null;
    }

    private Timestamp toTimestamp(Instant instant) {
        Instant safe = instant == null ? Instant.now() : instant;
        return Timestamp.ofTimeSecondsAndNanos(safe.getEpochSecond(), safe.getNano());
    }
}
