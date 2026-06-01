package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.sieglings.persistence.entity.FriendRequestEntity;
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
public class FriendRequestStore {

    private static final long OP_TIMEOUT_SECONDS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    public Optional<FriendRequestEntity> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        try {
            DocumentSnapshot snapshot = doc(id).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return snapshot.exists() ? Optional.of(toEntity(id, snapshot)) : Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load friend request from Firestore.", ex);
        }
    }

    public Optional<FriendRequestEntity> findPending(String fromUserId, String toUserId) {
        return findById(FriendRequestEntity.buildId(fromUserId, toUserId));
    }

    public List<FriendRequestEntity> listIncoming(String toUserId) {
        return listWhereEqual("toUserId", toUserId);
    }

    public List<FriendRequestEntity> listOutgoing(String fromUserId) {
        return listWhereEqual("fromUserId", fromUserId);
    }

    public FriendRequestEntity save(FriendRequestEntity request) {
        if (request.getFromUserId() == null || request.getFromUserId().isBlank()
                || request.getToUserId() == null || request.getToUserId().isBlank()) {
            throw new IllegalArgumentException("Friend request sender and recipient are required.");
        }
        if (request.getId() == null || request.getId().isBlank()) {
            request.setId(FriendRequestEntity.buildId(request.getFromUserId(), request.getToUserId()));
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("fromUserId", request.getFromUserId());
        payload.put("toUserId", request.getToUserId());
        payload.put("createdAt", toTimestamp(request.getCreatedAt()));
        try {
            doc(request.getId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return request;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save friend request to Firestore.", ex);
        }
    }

    public void deleteById(String id) {
        if (id == null || id.isBlank()) {
            return;
        }
        try {
            doc(id).delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete friend request from Firestore.", ex);
        }
    }

    public void deleteByUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        deleteWhereEqual("fromUserId", userId);
        deleteWhereEqual("toUserId", userId);
    }

    private void deleteWhereEqual(String field, String value) {
        try {
            List<QueryDocumentSnapshot> docs = client.requireFirestore()
                    .collection(client.friendRequestsCollection())
                    .whereEqualTo(field, value)
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .getDocuments();
            for (QueryDocumentSnapshot doc : docs) {
                doc.getReference().delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            }
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete friend requests from Firestore.", ex);
        }
    }

    private List<FriendRequestEntity> listWhereEqual(String field, String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            List<QueryDocumentSnapshot> docs = client.requireFirestore()
                    .collection(client.friendRequestsCollection())
                    .whereEqualTo(field, value)
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .getDocuments();
            List<FriendRequestEntity> results = new ArrayList<>();
            for (QueryDocumentSnapshot snapshot : docs) {
                results.add(toEntity(snapshot.getId(), snapshot));
            }
            results.sort((left, right) -> right.getCreatedAt().compareTo(left.getCreatedAt()));
            return results;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to list friend requests from Firestore.", ex);
        }
    }

    private DocumentReference doc(String id) {
        return client.requireFirestore().collection(client.friendRequestsCollection()).document(id);
    }

    private FriendRequestEntity toEntity(String id, DocumentSnapshot snapshot) {
        FriendRequestEntity request = new FriendRequestEntity();
        request.setId(id);
        request.setFromUserId(snapshot.getString("fromUserId"));
        request.setToUserId(snapshot.getString("toUserId"));
        Object createdAt = snapshot.get("createdAt");
        if (createdAt instanceof Timestamp ts) {
            request.setCreatedAt(Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()));
        }
        return request;
    }

    private Timestamp toTimestamp(Instant instant) {
        Instant safe = instant == null ? Instant.now() : instant;
        return Timestamp.ofTimeSecondsAndNanos(safe.getEpochSecond(), safe.getNano());
    }
}
