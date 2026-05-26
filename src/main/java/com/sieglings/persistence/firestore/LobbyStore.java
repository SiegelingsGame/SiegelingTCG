package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.sieglings.persistence.entity.LobbyEntity;
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
public class LobbyStore {
    private static final long OP_TIMEOUT_SECONDS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    public Optional<LobbyEntity> findByRoomId(String roomId) {
        if (roomId == null || roomId.isBlank()) {
            return Optional.empty();
        }
        try {
            DocumentSnapshot snapshot = doc(roomId).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return snapshot.exists() ? Optional.of(toEntity(roomId, snapshot)) : Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load lobby from Firestore.", ex);
        }
    }

    public List<LobbyEntity> listOpenLobbies(Instant now) {
        try {
            List<QueryDocumentSnapshot> docs = client.requireFirestore()
                    .collection(client.lobbiesCollection())
                    .whereEqualTo("closed", false)
                    .whereEqualTo("started", false)
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .getDocuments();
            List<LobbyEntity> results = new ArrayList<>();
            for (QueryDocumentSnapshot snapshot : docs) {
                LobbyEntity lobby = toEntity(snapshot.getId(), snapshot);
                if (lobby.getExpiresAt() != null && lobby.getExpiresAt().isAfter(now)) {
                    results.add(lobby);
                }
            }
            results.sort((left, right) -> right.getUpdatedAt().compareTo(left.getUpdatedAt()));
            return results;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to list open lobbies from Firestore.", ex);
        }
    }

    public LobbyEntity save(LobbyEntity lobby) {
        if (lobby.getRoomId() == null || lobby.getRoomId().isBlank()) {
            throw new IllegalArgumentException("Lobby room id is required.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("hostUserId", lobby.getHostUserId());
        payload.put("hostName", lobby.getHostName());
        payload.put("format", lobby.getFormat());
        payload.put("started", lobby.isStarted());
        payload.put("closed", lobby.isClosed());
        payload.put("createdAt", toTimestamp(lobby.getCreatedAt()));
        payload.put("updatedAt", toTimestamp(lobby.getUpdatedAt()));
        payload.put("expiresAt", toTimestamp(lobby.getExpiresAt()));
        try {
            doc(lobby.getRoomId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return lobby;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save lobby to Firestore.", ex);
        }
    }

    public void delete(String roomId) {
        if (roomId == null || roomId.isBlank()) {
            return;
        }
        try {
            doc(roomId).delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete lobby from Firestore.", ex);
        }
    }

    private DocumentReference doc(String roomId) {
        return client.requireFirestore().collection(client.lobbiesCollection()).document(roomId);
    }

    private LobbyEntity toEntity(String roomId, DocumentSnapshot snapshot) {
        LobbyEntity lobby = new LobbyEntity();
        lobby.setRoomId(roomId);
        lobby.setHostUserId(snapshot.getString("hostUserId"));
        lobby.setHostName(snapshot.getString("hostName"));
        lobby.setFormat(snapshot.getString("format"));
        Boolean started = snapshot.getBoolean("started");
        Boolean closed = snapshot.getBoolean("closed");
        lobby.setStarted(Boolean.TRUE.equals(started));
        lobby.setClosed(Boolean.TRUE.equals(closed));
        lobby.setCreatedAt(readInstant(snapshot.get("createdAt")));
        lobby.setUpdatedAt(readInstant(snapshot.get("updatedAt")));
        lobby.setExpiresAt(readInstant(snapshot.get("expiresAt")));
        return lobby;
    }

    private Instant readInstant(Object value) {
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
