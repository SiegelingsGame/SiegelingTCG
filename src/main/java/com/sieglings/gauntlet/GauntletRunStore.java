package com.sieglings.gauntlet;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Saves Gauntlet runs to Firestore. Cloud Run recycles idle instances, so a run held only
 * in memory would vanish between sittings; a roguelike climb has to survive that.
 * The run is stored as one JSON string (decks of nested upgrade records do not map
 * cleanly onto Firestore fields), plus an account pointer so a signed-in player can
 * resume on another device.
 *
 * <p>Fail-soft like the Siege checkpoints: without Firestore (local dev) runs stay in memory.
 */
@Component
public class GauntletRunStore {

    private static final String COLLECTION = "gauntletRuns";
    private static final long OP_TIMEOUT_SECONDS = 5;

    @Autowired(required = false)
    private FirestoreUserDataClient client;

    private final ObjectMapper mapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private volatile boolean warned;

    void save(GauntletRun run) {
        if (client == null || run == null) return;
        try {
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("json", mapper.writeValueAsString(run));
            doc.put("ownerUserId", run.ownerUserId);
            doc.put("floor", run.floor);
            doc.put("savedAt", Timestamp.now());
            var firestore = client.requireFirestore();
            firestore.collection(COLLECTION).document(run.token).set(doc).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            String pointer = accountDocumentId(run.ownerUserId);
            if (pointer != null) {
                Map<String, Object> index = new LinkedHashMap<>();
                index.put("token", run.token);
                index.put("savedAt", Timestamp.now());
                firestore.collection(COLLECTION).document(pointer).set(index).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            }
        } catch (Exception ex) {
            warnOnce(ex);
        }
    }

    Optional<GauntletRun> load(String token) {
        if (client == null || token == null || token.isBlank() || token.startsWith("account-")) return Optional.empty();
        try {
            DocumentSnapshot doc = client.requireFirestore().collection(COLLECTION).document(token)
                    .get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            String json = doc.exists() ? doc.getString("json") : null;
            return json == null ? Optional.empty() : Optional.of(mapper.readValue(json, GauntletRun.class));
        } catch (Exception ex) {
            warnOnce(ex);
            return Optional.empty();
        }
    }

    Optional<String> latestTokenFor(String userId) {
        String pointer = accountDocumentId(userId);
        if (client == null || pointer == null) return Optional.empty();
        try {
            DocumentSnapshot doc = client.requireFirestore().collection(COLLECTION).document(pointer)
                    .get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return doc.exists() ? Optional.ofNullable(doc.getString("token")) : Optional.empty();
        } catch (Exception ex) {
            warnOnce(ex);
            return Optional.empty();
        }
    }

    private static String accountDocumentId(String userId) {
        if (userId == null || userId.isBlank()) return null;
        return "account-" + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(userId.getBytes(StandardCharsets.UTF_8));
    }

    private void warnOnce(Exception ex) {
        if (!warned) {
            warned = true;
            System.err.println("[Gauntlet] Run saves unavailable (runs stay in-memory only): " + ex.getMessage());
        }
    }
}
