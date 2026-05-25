package com.sieglings.persistence.firestore;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Component
public class MatchHistoryStore {

    private static final long OP_TIMEOUT_SECONDS = 15;

    @Autowired
    private FirestoreUserDataClient client;

    public List<MatchHistoryEntity> findTop12ByUserOrderByFinishedAtDesc(String userId) {
        if (userId == null || userId.isBlank()) {
            return List.of();
        }
        try {
            QuerySnapshot snapshot = client.requireFirestore()
                    .collection(client.matchesCollection())
                    .whereEqualTo("userId", userId)
                    .orderBy("finishedAt", Query.Direction.DESCENDING)
                    .limit(12)
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            List<MatchHistoryEntity> out = new ArrayList<>();
            for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
                out.add(toMatch(doc.getId(), doc));
            }
            return out;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load match history from Firestore.", ex);
        }
    }

    /**
     * Returns every match document. Used by the daily leaderboard refresh, which aggregates
     * stats in memory because Firestore lacks GROUP BY. Fine for the current scale; if match
     * volume grows large, switch to maintained per-user aggregate documents.
     */
    public List<MatchHistoryEntity> findAll() {
        try {
            QuerySnapshot snapshot = client.requireFirestore()
                    .collection(client.matchesCollection())
                    .get()
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            List<MatchHistoryEntity> out = new ArrayList<>();
            for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
                out.add(toMatch(doc.getId(), doc));
            }
            return out;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to scan match history from Firestore.", ex);
        }
    }

    public MatchHistoryEntity save(MatchHistoryEntity match) {
        if (match.getId() == null || match.getId().isBlank()) {
            throw new IllegalArgumentException("Match history id is required.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", match.getUserId());
        payload.put("userDisplayName", match.getUserDisplayName());
        payload.put("finishedAt", toTimestamp(match.getFinishedAt()));
        payload.put("result", match.getResult());
        payload.put("matchType", match.getMatchType());
        payload.put("opponentName", match.getOpponentName());
        payload.put("loadoutLabel", match.getLoadoutLabel());
        payload.put("trainerName", match.getTrainerName());
        payload.put("turnNumber", match.getTurnNumber());
        payload.put("spellsCast", match.getSpellsCast());
        payload.put("trapsSprung", match.getTrapsSprung());
        payload.put("siegelingsDefeated", match.getSiegelingsDefeated());
        payload.put("playerHealthRemaining", match.getPlayerHealthRemaining());
        payload.put("opponentHealthRemaining", match.getOpponentHealthRemaining());
        payload.put("playerEnergyRemaining", match.getPlayerEnergyRemaining());
        // Cap the stored log so a single match doc stays well under the 1MB
        // Firestore limit even for very long games.
        List<String> log = match.getGameLog();
        if (log != null && log.size() > 60) {
            log = new ArrayList<>(log.subList(log.size() - 60, log.size()));
        }
        payload.put("gameLog", log == null ? List.of() : log);
        try {
            matchDoc(match.getId()).set(payload).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return match;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save match to Firestore.", ex);
        }
    }

    private DocumentReference matchDoc(String id) {
        return client.requireFirestore().collection(client.matchesCollection()).document(id);
    }

    private MatchHistoryEntity toMatch(String id, DocumentSnapshot snapshot) {
        MatchHistoryEntity match = new MatchHistoryEntity();
        match.setId(id);
        match.setUserId(snapshot.getString("userId"));
        match.setUserDisplayName(snapshot.getString("userDisplayName"));
        match.setFinishedAt(readInstant(snapshot, "finishedAt"));
        match.setResult(snapshot.getString("result"));
        match.setMatchType(snapshot.getString("matchType"));
        match.setOpponentName(snapshot.getString("opponentName"));
        match.setLoadoutLabel(snapshot.getString("loadoutLabel"));
        match.setTrainerName(snapshot.getString("trainerName"));
        Long turn = snapshot.getLong("turnNumber");
        match.setTurnNumber(turn == null ? null : turn.intValue());
        match.setSpellsCast(readInt(snapshot, "spellsCast"));
        match.setTrapsSprung(readInt(snapshot, "trapsSprung"));
        match.setSiegelingsDefeated(readInt(snapshot, "siegelingsDefeated"));
        match.setPlayerHealthRemaining(readInt(snapshot, "playerHealthRemaining"));
        match.setOpponentHealthRemaining(readInt(snapshot, "opponentHealthRemaining"));
        match.setPlayerEnergyRemaining(readInt(snapshot, "playerEnergyRemaining"));
        match.setGameLog(readStringList(snapshot, "gameLog"));
        return match;
    }

    @SuppressWarnings("unchecked")
    private List<String> readStringList(DocumentSnapshot snapshot, String key) {
        Object value = snapshot.get(key);
        if (value instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object item : list) {
                if (item != null) out.add(String.valueOf(item));
            }
            return out;
        }
        return new ArrayList<>();
    }

    private int readInt(DocumentSnapshot snapshot, String key) {
        Long value = snapshot.getLong(key);
        return value == null ? 0 : value.intValue();
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
