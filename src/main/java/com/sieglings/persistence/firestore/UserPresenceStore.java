package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.sieglings.persistence.entity.UserPresenceEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Component
public class UserPresenceStore {
    private static final long OP_TIMEOUT_SECONDS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    public Optional<UserPresenceEntity> findByUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return Optional.empty();
        }
        try {
            DocumentSnapshot snapshot = doc(userId).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return snapshot.exists() ? Optional.of(toEntity(userId, snapshot)) : Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load presence from Firestore.", ex);
        }
    }

    public List<UserPresenceEntity> findByUserIds(List<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }
        List<UserPresenceEntity> results = new ArrayList<>();
        for (String userId : userIds) {
            findByUserId(userId).ifPresent(results::add);
        }
        return results;
    }

    public List<UserPresenceEntity> listOnlineSince(Instant since) {
        try {
            List<QueryDocumentSnapshot> docs = client.requireFirestore()
                    .collection(client.presenceCollection())
                    .whereGreaterThan("lastSeenAt", toTimestamp(since))
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .getDocuments();
            List<UserPresenceEntity> results = new ArrayList<>();
            for (QueryDocumentSnapshot snapshot : docs) {
                results.add(toEntity(snapshot.getId(), snapshot));
            }
            return results;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to list online presence from Firestore.", ex);
        }
    }

    public UserPresenceEntity save(UserPresenceEntity presence) {
        if (presence.getUserId() == null || presence.getUserId().isBlank()) {
            throw new IllegalArgumentException("Presence user id is required.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("status", presence.getStatus());
        payload.put("currentRoomId", presence.getCurrentRoomId());
        payload.put("lastSeenAt", toTimestamp(presence.getLastSeenAt()));
        try {
            doc(presence.getUserId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return presence;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save presence to Firestore.", ex);
        }
    }

    private DocumentReference doc(String userId) {
        return client.requireFirestore().collection(client.presenceCollection()).document(userId);
    }

    private UserPresenceEntity toEntity(String userId, DocumentSnapshot snapshot) {
        UserPresenceEntity presence = new UserPresenceEntity();
        presence.setUserId(userId);
        presence.setStatus(snapshot.getString("status"));
        presence.setCurrentRoomId(snapshot.getString("currentRoomId"));
        Object lastSeenAt = snapshot.get("lastSeenAt");
        if (lastSeenAt instanceof Timestamp ts) {
            presence.setLastSeenAt(Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()));
        }
        return presence;
    }

    private Timestamp toTimestamp(Instant instant) {
        Instant safe = instant == null ? Instant.now() : instant;
        return Timestamp.ofTimeSecondsAndNanos(safe.getEpochSecond(), safe.getNano());
    }
}
