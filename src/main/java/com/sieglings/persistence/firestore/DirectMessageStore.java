package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.sieglings.persistence.entity.DirectMessageEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
public class DirectMessageStore {
    private static final long OP_TIMEOUT_SECONDS = 10;
    private static final int MESSAGE_PAGE_SIZE = 80;

    @Autowired
    private FirestoreUserDataClient client;

    public List<DirectMessageEntity> listThreadMessages(String threadId, Instant since) {
        if (threadId == null || threadId.isBlank()) {
            return List.of();
        }
        try {
            List<QueryDocumentSnapshot> docs = client.requireFirestore()
                    .collection(client.directMessagesCollection())
                    .whereEqualTo("threadId", threadId)
                    .limit(MESSAGE_PAGE_SIZE)
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .getDocuments();
            List<DirectMessageEntity> results = new ArrayList<>();
            for (QueryDocumentSnapshot snapshot : docs) {
                DirectMessageEntity message = toEntity(snapshot.getId(), snapshot);
                if (since == null || message.getCreatedAt() == null || message.getCreatedAt().isAfter(since)) {
                    results.add(message);
                }
            }
            results.sort(Comparator.comparing(DirectMessageEntity::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())));
            return results;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load direct messages from Firestore.", ex);
        }
    }

    public List<DirectMessageEntity> listRecentForUser(String userId, int limit) {
        if (userId == null || userId.isBlank()) {
            return List.of();
        }
        try {
            List<QueryDocumentSnapshot> sent = client.requireFirestore()
                    .collection(client.directMessagesCollection())
                    .whereEqualTo("senderId", userId)
                    .limit(limit)
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .getDocuments();
            List<QueryDocumentSnapshot> received = client.requireFirestore()
                    .collection(client.directMessagesCollection())
                    .whereEqualTo("recipientId", userId)
                    .limit(limit)
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .getDocuments();
            List<DirectMessageEntity> results = new ArrayList<>();
            for (QueryDocumentSnapshot snapshot : sent) {
                results.add(toEntity(snapshot.getId(), snapshot));
            }
            for (QueryDocumentSnapshot snapshot : received) {
                results.add(toEntity(snapshot.getId(), snapshot));
            }
            results.sort((left, right) -> right.getCreatedAt().compareTo(left.getCreatedAt()));
            return results.stream().limit(limit).toList();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to list recent direct messages from Firestore.", ex);
        }
    }

    public DirectMessageEntity save(DirectMessageEntity message) {
        if (message.getThreadId() == null || message.getThreadId().isBlank()) {
            throw new IllegalArgumentException("Message thread id is required.");
        }
        if (message.getId() == null || message.getId().isBlank()) {
            message.setId(UUID.randomUUID().toString());
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("threadId", message.getThreadId());
        payload.put("senderId", message.getSenderId());
        payload.put("recipientId", message.getRecipientId());
        payload.put("text", message.getText());
        payload.put("createdAt", toTimestamp(message.getCreatedAt()));
        try {
            doc(message.getId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return message;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save direct message to Firestore.", ex);
        }
    }

    private DocumentReference doc(String id) {
        return client.requireFirestore().collection(client.directMessagesCollection()).document(id);
    }

    private DirectMessageEntity toEntity(String id, DocumentSnapshot snapshot) {
        DirectMessageEntity message = new DirectMessageEntity();
        message.setId(id);
        message.setThreadId(snapshot.getString("threadId"));
        message.setSenderId(snapshot.getString("senderId"));
        message.setRecipientId(snapshot.getString("recipientId"));
        message.setText(snapshot.getString("text"));
        Object createdAt = snapshot.get("createdAt");
        if (createdAt instanceof Timestamp ts) {
            message.setCreatedAt(Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()));
        }
        return message;
    }

    private Timestamp toTimestamp(Instant instant) {
        Instant safe = instant == null ? Instant.now() : instant;
        return Timestamp.ofTimeSecondsAndNanos(safe.getEpochSecond(), safe.getNano());
    }
}
