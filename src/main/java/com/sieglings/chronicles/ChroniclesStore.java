package com.sieglings.chronicles;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Transaction;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Firestore persistence for Siegeknight Chronicles. The save is nested (a roster of
 * individual Siegelings, an expedition timeline), so it is stored as one JSON
 * field rather than mapped column by column; the version sits beside it so it can
 * be read without parsing. Like the other user-data stores this throws when
 * Firestore is unavailable, so a save is never silently dropped.
 *
 * <p>Commits are a compare-and-set on {@code version}. Cloud Run has no shared
 * lock, and a poll plus an action can land on two instances that both read the
 * same document. A blind {@code set} lets the slower one replace the document.
 * Realm writes (marketplace escrow, guild donations, operation scores) ride in
 * the same transaction: they commit only when the chronicle does, and a retry
 * of the transaction sees the documents as they were at the start.
 */
@Component
public class ChroniclesStore {
    /** Version passed to {@link #commit} when the chronicle document does not exist yet. */
    public static final long ABSENT_VERSION = -1L;
    private static final long OP_TIMEOUT_SECONDS = 10;
    static final ObjectMapper JSON = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @Autowired
    private FirestoreUserDataClient client;

    @Autowired(required = false)
    private ChroniclesRealmStore realm;

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
     * Compare-and-set for a caller that has already stored the next version on
     * {@code state}. The expected version is the one this write replaces.
     */
    public ChroniclesState save(ChroniclesState state) {
        return commit(state, state == null ? ABSENT_VERSION : state.version - 1, null);
    }

    /**
     * Writes {@code state} only if the stored version is still {@code expectedVersion}
     * ({@link #ABSENT_VERSION} when the document must not exist yet). {@code realmWork}
     * may read and stage marketplace or guild documents in that same transaction;
     * it must be safe to run again, because Firestore retries the body on contention.
     * A mismatch means another instance committed first.
     */
    public ChroniclesState commit(ChroniclesState state, long expectedVersion,
                                  Consumer<ChroniclesRealmStore.RealmBatch> realmWork) {
        if (state == null || state.userId == null || state.userId.isBlank()) {
            throw new IllegalArgumentException("Chronicles user id is required.");
        }
        if (realmWork != null && realm == null) {
            throw new IllegalStateException("Guilds and the marketplace are unavailable right now.");
        }
        try {
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
                // Realm reads happen before either document is written. The
                // chronicle JSON is encoded after that work, because a payout
                // assigns crowns on the state object inside the callback.
                if (realmWork != null) realm.apply(transaction, realmWork);
                transaction.set(ref, payload(state));
                return null;
            }).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return state;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while saving Siegeknight Chronicles.", ex);
        } catch (ExecutionException ex) {
            RuntimeException stale = staleCause(ex);
            if (stale != null) throw stale;
            if (ex.getCause() instanceof IllegalArgumentException illegal) throw illegal;
            if (ex.getCause() instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException("Unable to save Siegeknight Chronicles to Firestore.", ex);
        } catch (ChroniclesService.StaleStateException ex) {
            throw ex;
        } catch (Exception ex) {
            RuntimeException stale = staleCause(ex);
            if (stale != null) throw stale;
            if (ex instanceof IllegalArgumentException illegal) throw illegal;
            throw new IllegalStateException("Unable to save Siegeknight Chronicles to Firestore.", ex);
        }
    }

    private static Map<String, Object> payload(ChroniclesState state) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("version", state.version);
            payload.put("schema", state.schema);
            payload.put("state", JSON.writeValueAsString(state));
            payload.put("updatedAt", Timestamp.now());
            return payload;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to encode Siegeknight Chronicles.", ex);
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
