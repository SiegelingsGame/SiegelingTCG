package com.sieglings.chronicles;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Firestore persistence for Siegeknight Chronicles. The save is nested (a roster of
 * individual Siegelings, an expedition timeline), so it is stored as one JSON
 * field rather than mapped column by column; the version sits beside it so it can
 * be read without parsing. Like the other user-data stores this throws when
 * Firestore is unavailable, so a save is never silently dropped.
 */
@Component
public class ChroniclesStore {
    private static final long OP_TIMEOUT_SECONDS = 10;
    static final ObjectMapper JSON = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @Autowired
    private FirestoreUserDataClient client;

    @Value("${app.user-data.collection-chronicles:playerChronicles}")
    private String collection = "playerChronicles";

    public Optional<ChroniclesState> findByUserId(String userId) {
        if (userId == null || userId.isBlank()) return Optional.empty();
        try {
            DocumentSnapshot snapshot = doc(userId).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!snapshot.exists()) return Optional.empty();
            String json = snapshot.getString("state");
            if (json == null || json.isBlank()) return Optional.empty();
            ChroniclesState state = JSON.readValue(json, ChroniclesState.class);
            state.userId = userId;
            return Optional.of(state);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load Siegeknight Chronicles from Firestore.", ex);
        }
    }

    public ChroniclesState save(ChroniclesState state) {
        if (state == null || state.userId == null || state.userId.isBlank()) {
            throw new IllegalArgumentException("Chronicles user id is required.");
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("version", state.version);
            payload.put("schema", state.schema);
            payload.put("state", JSON.writeValueAsString(state));
            payload.put("updatedAt", Timestamp.now());
            doc(state.userId).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return state;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save Siegeknight Chronicles to Firestore.", ex);
        }
    }

    public void deleteByUserId(String userId) {
        if (userId == null || userId.isBlank()) return;
        try {
            doc(userId).delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to delete Siegeknight Chronicles from Firestore.", ex);
        }
    }

    private DocumentReference doc(String userId) {
        return client.requireFirestore().collection(collection).document(userId);
    }
}
