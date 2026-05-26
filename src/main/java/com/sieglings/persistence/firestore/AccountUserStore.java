package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.entity.AccountUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Component
public class AccountUserStore {

    private static final long OP_TIMEOUT_SECONDS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    public Optional<AccountUser> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        try {
            DocumentSnapshot snapshot = userDoc(id).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return snapshot.exists() ? Optional.of(toUser(id, snapshot)) : Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load account from Firestore.", ex);
        }
    }

    public Optional<AccountUser> findByEmail(String email) {
        return findById(email);
    }

    public AccountUser save(AccountUser user) {
        if (user.getId() == null || user.getId().isBlank()) {
            throw new IllegalArgumentException("AccountUser id (normalized email) is required.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("email", user.getEmail());
        payload.put("passwordHash", user.getPasswordHash());
        payload.put("displayName", user.getDisplayName());
        payload.put("friendEmails", user.getFriendEmails() == null ? java.util.List.of() : user.getFriendEmails());
        payload.put("createdAt", toTimestamp(user.getCreatedAt()));
        try {
            userDoc(user.getId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return user;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save account to Firestore.", ex);
        }
    }

    private DocumentReference userDoc(String id) {
        return client.requireFirestore().collection(client.usersCollection()).document(id);
    }

    private AccountUser toUser(String id, DocumentSnapshot snapshot) {
        AccountUser user = new AccountUser();
        user.setId(id);
        user.setEmail(snapshot.getString("email"));
        user.setPasswordHash(snapshot.getString("passwordHash"));
        user.setDisplayName(snapshot.getString("displayName"));
        Object friendEmails = snapshot.get("friendEmails");
        if (friendEmails instanceof java.util.List<?> rawList) {
            user.setFriendEmails(rawList.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .toList());
        }
        Object createdAt = snapshot.get("createdAt");
        if (createdAt instanceof Timestamp ts) {
            user.setCreatedAt(Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()));
        }
        return user;
    }

    private Timestamp toTimestamp(Instant instant) {
        Instant safe = instant == null ? Instant.now() : instant;
        return Timestamp.ofTimeSecondsAndNanos(safe.getEpochSecond(), safe.getNano());
    }
}
