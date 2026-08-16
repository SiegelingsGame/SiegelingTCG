package com.sieglings.adventure;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
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

    /**
     * The account index is the cross-device entrypoint; its snapshot still carries the
     * opaque run token. There is one index per {@link RunSlot}, so an expedition and a
     * Battlegrounds march are saved side by side instead of overwriting each other —
     * starting one used to silently discard the other.
     */
    Optional<Map<String, Object>> loadForUser(String userId, RunSlot slot) {
        return load(accountDocumentId(userId, slot));
    }

    /** Every slot this account has a save in, in slot order. */
    Map<RunSlot, Map<String, Object>> loadAllForUser(String userId) {
        Map<RunSlot, Map<String, Object>> out = new LinkedHashMap<>();
        for (RunSlot slot : RunSlot.values()) {
            loadForUser(userId, slot).ifPresent(snapshot -> out.put(slot, snapshot));
        }
        return out;
    }

    boolean saveForUser(String userId, RunSlot slot, Map<String, Object> snapshot) {
        String documentId = accountDocumentId(userId, slot);
        return documentId != null && save(documentId, snapshot);
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

    /**
     * Removes the account pointer only when it still points at this run. An old
     * device finishing a superseded run must not erase a newer expedition.
     */
    void deleteForUser(String userId, RunSlot slot, String token) {
        String documentId = accountDocumentId(userId, slot);
        if (documentId == null || token == null || token.isBlank()) return;
        try {
            var reference = client.requireFirestore().collection(COLLECTION).document(documentId);
            DocumentSnapshot doc = reference.get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (doc.exists() && token.equals(doc.getString("token"))) {
                reference.delete().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            }
        } catch (Exception ex) {
            warnOnce(ex);
        }
    }

    private static String accountDocumentId(String userId, RunSlot slot) {
        if (userId == null || userId.isBlank()) return null;
        // Firestore document IDs cannot include a slash. Encoding also keeps
        // account identifiers out of visible document paths. The EXPEDITION slot
        // keeps the original unsuffixed id so saves written before slots existed
        // still resume.
        String base = "account-" + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(userId.getBytes(StandardCharsets.UTF_8));
        return slot == null || slot == RunSlot.EXPEDITION ? base : base + "-" + slot.suffix();
    }

    private void warnOnce(Exception ex) {
        if (!warned) {
            warned = true;
            System.err.println("[Siege] Checkpoints unavailable (runs stay in-memory only): " + ex.getMessage());
        }
    }
}
