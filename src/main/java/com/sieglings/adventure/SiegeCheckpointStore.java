package com.sieglings.adventure;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Persists Siege run checkpoints to Firestore so a player can leave and resume
 * later — even across server restarts and deploys, and even mid-battle (hand,
 * deck, enemy intents, statuses, everything). Camp/cache/broker/reward
 * prompts are short-lived UI states that are skipped; resuming from one of
 * those lands the player on the map with the current node uncleared, ready to
 * re-enter.
 *
 * <p>Fail-soft by design: if Firestore is unavailable the game keeps running on
 * in-memory sessions and checkpoints simply do not persist.
 */
@Component
public class SiegeCheckpointStore {

    private static final String COLLECTION = "siegeCheckpoints";
    private static final long OP_TIMEOUT_SECONDS = 5;

    @Autowired
    private FirestoreUserDataClient client;

    private volatile boolean warned;

    /** Saves a checkpoint snapshot keyed by run token. Returns true on success. */
    boolean save(String token, Map<String, Object> snapshot) {
        try {
            snapshot.put("savedAt", Timestamp.now());
            client.requireFirestore().collection(COLLECTION).document(token)
                    .set(snapshot).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return true;
        } catch (Exception ex) {
            warnOnce(ex);
            return false;
        }
    }

    /** Loads a checkpoint snapshot by run token, if one exists. */
    Optional<Map<String, Object>> load(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        try {
            DocumentSnapshot doc = client.requireFirestore().collection(COLLECTION).document(token)
                    .get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!doc.exists()) return Optional.empty();
            return Optional.ofNullable(doc.getData());
        } catch (Exception ex) {
            warnOnce(ex);
            return Optional.empty();
        }
    }

    /** Removes a finished run's checkpoint. */
    void delete(String token) {
        if (token == null || token.isBlank()) return;
        try {
            client.requireFirestore().collection(COLLECTION).document(token)
                    .delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            warnOnce(ex);
        }
    }

    private void warnOnce(Exception ex) {
        if (!warned) {
            warned = true;
            System.err.println("[Siege] Checkpoints unavailable (runs stay in-memory only): " + ex.getMessage());
        }
    }
}
