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
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

/**
 * Firestore persistence for Siegeknight Chronicles. The save is nested (a roster of
 * individual Siegelings, an expedition timeline), so it is stored as one JSON
 * field rather than mapped column by column; the version sits beside it so it can
 * be read without parsing. Like the other user-data stores this throws when
 * Firestore is unavailable, so a save is never silently dropped.
 *
 * <p>The write is a compare-and-set on that version. Cloud Run has no shared
 * lock, and a poll plus an action (collect, tame, feed) can land on two
 * instances that both read the same document. A blind {@code set} lets the
 * slower one replace the document and drop the action. The in-memory lock in
 * {@link ChroniclesService} only serializes one instance.
 */
@Component
public class ChroniclesStore {
    /** Version passed to {@link #save} when the chronicle document does not exist yet. */
    public static final long ABSENT_VERSION = -1L;
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

    /**
     * Writes {@code state} only if the stored version is still {@code expectedVersion}
     * ({@link #ABSENT_VERSION} when the document must not exist yet). A mismatch
     * means another instance committed first; the caller reloads and tries again.
     */
    public ChroniclesState save(ChroniclesState state, long expectedVersion) {
        if (state == null || state.userId == null || state.userId.isBlank()) {
            throw new IllegalArgumentException("Chronicles user id is required.");
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("version", state.version);
            payload.put("schema", state.schema);
            payload.put("state", JSON.writeValueAsString(state));
            payload.put("updatedAt", Timestamp.now());
            DocumentReference ref = doc(state.userId);
            client.requireFirestore().runTransaction(transaction -> {
                DocumentSnapshot snapshot = transaction.get(ref).get();
                long current = ABSENT_VERSION;
                if (snapshot.exists()) {
                    Long stored = snapshot.getLong("version");
                    current = stored == null ? 0L : stored;
                }
                if (current != expectedVersion) {
                    throw new ChroniclesService.StaleStateException(
                            "Your chronicle changed on another device. Refreshing.");
                }
                transaction.set(ref, payload);
                return null;
            }).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return state;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while saving Siegeknight Chronicles.", ex);
        } catch (ExecutionException ex) {
            RuntimeException stale = staleCause(ex);
            if (stale != null) throw stale;
            throw new IllegalStateException("Unable to save Siegeknight Chronicles to Firestore.", ex);
        } catch (ChroniclesService.StaleStateException ex) {
            throw ex;
        } catch (Exception ex) {
            RuntimeException stale = staleCause(ex);
            if (stale != null) throw stale;
            throw new IllegalStateException("Unable to save Siegeknight Chronicles to Firestore.", ex);
        }
    }

    private static RuntimeException staleCause(Throwable ex) {
        Throwable current = ex;
        for (int i = 0; i < 8 && current != null; i++) {
            if (current instanceof ChroniclesService.StaleStateException stale) return stale;
            current = current.getCause();
        }
        return null;
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
