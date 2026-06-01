package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.sieglings.persistence.entity.SavedDeckEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Component
public class SavedDeckStore {

    private static final long OP_TIMEOUT_SECONDS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    public List<SavedDeckEntity> findByUserOrderByUpdatedAtDesc(String userId) {
        if (userId == null || userId.isBlank()) {
            return List.of();
        }
        try {
            QuerySnapshot snapshot = client.requireFirestore()
                    .collection(client.decksCollection())
                    .whereEqualTo("userId", userId)
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            List<SavedDeckEntity> decks = new ArrayList<>();
            for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
                decks.add(toDeck(doc.getId(), doc));
            }
            decks.sort(Comparator.comparing(
                    SavedDeckEntity::getUpdatedAt,
                    Comparator.nullsLast(Comparator.reverseOrder())
            ));
            return decks;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load saved decks from Firestore.", ex);
        }
    }

    public Optional<SavedDeckEntity> findByIdAndUser(String id, String userId) {
        if (id == null || id.isBlank() || userId == null || userId.isBlank()) {
            return Optional.empty();
        }
        try {
            DocumentSnapshot snapshot = deckDoc(id).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!snapshot.exists()) {
                return Optional.empty();
            }
            if (!userId.equals(snapshot.getString("userId"))) {
                return Optional.empty();
            }
            return Optional.of(toDeck(id, snapshot));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load saved deck from Firestore.", ex);
        }
    }

    public SavedDeckEntity save(SavedDeckEntity deck) {
        if (deck.getId() == null || deck.getId().isBlank()) {
            throw new IllegalArgumentException("Saved deck id is required.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", deck.getUserId());
        payload.put("name", deck.getName());
        payload.put("presetDeckId", deck.getPresetDeckId());
        payload.put("trainerId", deck.getTrainerId());
        payload.put("customDeckCardsJson", deck.getCustomDeckCardsJson());
        payload.put("createdAt", toTimestamp(deck.getCreatedAt()));
        payload.put("updatedAt", toTimestamp(deck.getUpdatedAt()));
        try {
            deckDoc(deck.getId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return deck;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save deck to Firestore.", ex);
        }
    }

    public void delete(SavedDeckEntity deck) {
        if (deck == null || deck.getId() == null) {
            return;
        }
        try {
            deckDoc(deck.getId()).delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete deck from Firestore.", ex);
        }
    }

    public void deleteByUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        try {
            List<QueryDocumentSnapshot> docs = client.requireFirestore()
                    .collection(client.decksCollection())
                    .whereEqualTo("userId", userId)
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .getDocuments();
            for (QueryDocumentSnapshot doc : docs) {
                doc.getReference().delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            }
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete saved decks from Firestore.", ex);
        }
    }

    private DocumentReference deckDoc(String id) {
        return client.requireFirestore().collection(client.decksCollection()).document(id);
    }

    private SavedDeckEntity toDeck(String id, DocumentSnapshot snapshot) {
        SavedDeckEntity deck = new SavedDeckEntity();
        deck.setId(id);
        deck.setUserId(snapshot.getString("userId"));
        deck.setName(snapshot.getString("name"));
        deck.setPresetDeckId(snapshot.getString("presetDeckId"));
        deck.setTrainerId(snapshot.getString("trainerId"));
        deck.setCustomDeckCardsJson(snapshot.getString("customDeckCardsJson"));
        deck.setCreatedAt(readInstant(snapshot, "createdAt"));
        deck.setUpdatedAt(readInstant(snapshot, "updatedAt"));
        return deck;
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
