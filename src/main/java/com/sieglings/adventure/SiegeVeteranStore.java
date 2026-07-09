package com.sieglings.adventure;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Persists extracted "veteran" Siege teams to Firestore so a team you leveled up
 * and banked from a won expedition survives restarts and can later march into
 * Battlegrounds. One document per user (id = userId) holds that user's teams,
 * newest first, capped at {@link #MAX_TEAMS} — a new extraction evicts the oldest.
 *
 * <p>Fail-soft by design, mirroring {@link SiegeCheckpointStore}: if Firestore is
 * unavailable the game keeps running and extraction simply does not persist
 * (reads return an empty list, writes no-op after a single warning).
 */
@Component
class SiegeVeteranStore {

    private static final String COLLECTION = "siegeVeteranTeams";
    private static final long OP_TIMEOUT_SECONDS = 5;
    /** Newest-first cap: a fresh extraction evicts anything past this. */
    static final int MAX_TEAMS = 10;

    @Autowired
    private FirestoreUserDataClient client;

    private volatile boolean warned;

    /**
     * Appends a team snapshot for the user (newest first) and evicts the oldest so
     * at most {@link #MAX_TEAMS} remain. Guests (null/blank userId) are a no-op.
     * Returns the resulting team list (newest first).
     */
    List<Map<String, Object>> saveTeam(String userId, Map<String, Object> teamSnapshot) {
        if (userId == null || userId.isBlank() || teamSnapshot == null) return listTeams(userId);
        List<Map<String, Object>> teams = new ArrayList<>();
        teams.add(teamSnapshot);
        for (Map<String, Object> existing : loadRaw(userId)) {
            if (teams.size() >= MAX_TEAMS) break;
            teams.add(existing);
        }
        persistRaw(userId, teams);
        return teams;
    }

    /** This user's banked teams, newest first (empty for guests or when unavailable). */
    List<Map<String, Object>> listTeams(String userId) {
        if (userId == null || userId.isBlank()) return new ArrayList<>();
        return loadRaw(userId);
    }

    /** A single banked team by its stable teamId, if present. */
    Optional<Map<String, Object>> getTeam(String userId, String teamId) {
        if (teamId == null) return Optional.empty();
        for (Map<String, Object> team : listTeams(userId)) {
            if (teamId.equals(String.valueOf(team.get("teamId")))) return Optional.of(team);
        }
        return Optional.empty();
    }

    /**
     * Fatigue lockout: stamps {@code lockedUntil} (epoch-ms) on each of the user's banked
     * teams whose teamId is in {@code teamIds}, then persists. Called when a Battlegrounds
     * run is LOST so the squad's teams survive but can't be re-fielded until the timer
     * expires. Guests (null/blank userId) are a no-op. Returns the updated team list.
     */
    List<Map<String, Object>> lockTeams(String userId, java.util.Collection<String> teamIds, long lockedUntil) {
        if (userId == null || userId.isBlank() || teamIds == null || teamIds.isEmpty()) return listTeams(userId);
        List<Map<String, Object>> teams = loadRaw(userId);
        boolean changed = false;
        for (Map<String, Object> team : teams) {
            if (teamIds.contains(String.valueOf(team.get("teamId")))) {
                team.put("lockedUntil", lockedUntil);
                changed = true;
            }
        }
        if (changed) persistRaw(userId, teams);
        return teams;
    }

    /** Whether a team snapshot is fatigue-locked at {@code now} (epoch-ms). */
    static boolean isLocked(Map<String, Object> team, long now) {
        return lockedUntil(team) > now;
    }

    /** The team's fatigue lock expiry (epoch-ms), or 0 when never locked / expired field absent. */
    static long lockedUntil(Map<String, Object> team) {
        if (team == null) return 0L;
        Object v = team.get("lockedUntil");
        if (v instanceof Number n) return n.longValue();
        try {
            return v == null ? 0L : Long.parseLong(String.valueOf(v));
        } catch (NumberFormatException ex) {
            return 0L;
        }
    }

    // ---- Snapshot helpers (pure; shared by SiegeService + tests) -----------

    /** Serializes a party into veteran member entries (level/xp/final stats/item). */
    static List<Map<String, Object>> membersOf(List<Combatant> party) {
        List<Map<String, Object>> members = new ArrayList<>();
        for (Combatant c : party) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("sourceCardId", c.getSourceCardId());
            m.put("name", c.getName());
            m.put("element", c.getElement() == null ? null : c.getElement().name());
            m.put("level", c.getLevel());
            m.put("xp", c.getXp());
            m.put("maxHp", c.getMaxHp());
            m.put("baseMaxHp", c.getBaseMaxHp());
            m.put("speed", c.getSpeed());
            m.put("baseSpeed", c.getBaseSpeed());
            m.put("itemId", c.getItemId());
            members.add(m);
        }
        return members;
    }

    /** Serializes the run's modified deck templates so Phase 3 can rebuild the deck. */
    static List<Map<String, Object>> deckOf(List<SiegeCard> deck) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (SiegeCard card : deck) {
            AbilitySpec spec = card.getSpec();
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("id", spec.id());
            s.put("name", spec.name());
            s.put("element", spec.element() == null ? null : spec.element().name());
            s.put("effect", spec.effect().name());
            s.put("value", spec.value());
            s.put("target", spec.target().name());
            s.put("cost", spec.actionCost());
            s.put("desc", spec.description());
            s.put("status", spec.status() == null ? null : spec.status().name());
            s.put("statusChance", spec.statusChance());
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("iid", card.getInstanceId());
            d.put("owner", card.getOwnerId());
            d.put("spec", s);
            out.add(d);
        }
        return out;
    }

    /**
     * Flattens banked teams into a single list of veteran Siegelings (one entry per
     * member across all teams) — the ">=3 veteran Siegelings" list the Battlegrounds
     * entry counts.
     */
    static List<Map<String, Object>> flattenVeterans(List<Map<String, Object>> teams) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> team : teams) {
            Object teamId = team.get("teamId");
            long lockedUntil = lockedUntil(team);
            Object membersObj = team.get("members");
            if (!(membersObj instanceof List<?> members)) continue;
            for (Object mo : members) {
                if (!(mo instanceof Map<?, ?> member)) continue;
                Map<String, Object> v = new LinkedHashMap<>();
                v.put("teamId", teamId);
                v.put("sourceCardId", member.get("sourceCardId"));
                v.put("name", member.get("name"));
                v.put("element", member.get("element"));
                v.put("level", member.get("level"));
                v.put("itemId", member.get("itemId"));
                // Fatigue lockout: the lobby grays a member out until this epoch-ms passes.
                v.put("lockedUntil", lockedUntil);
                out.add(v);
            }
        }
        return out;
    }

    // ---- Persistence I/O (overridable in tests to avoid Firestore) ---------

    /** Loads this user's stored teams (newest first). Fail-soft: empty on error. */
    @SuppressWarnings("unchecked")
    protected List<Map<String, Object>> loadRaw(String userId) {
        try {
            DocumentSnapshot doc = client.requireFirestore().collection(COLLECTION).document(userId)
                    .get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!doc.exists()) return new ArrayList<>();
            Object teams = doc.get("teams");
            List<Map<String, Object>> out = new ArrayList<>();
            if (teams instanceof List<?> list) {
                for (Object o : list) {
                    if (o instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
                }
            }
            return out;
        } catch (Exception ex) {
            warnOnce(ex);
            return new ArrayList<>();
        }
    }

    /** Writes this user's team list (newest first). Fail-soft: warns once and no-ops on error. */
    protected void persistRaw(String userId, List<Map<String, Object>> teams) {
        try {
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("teams", teams);
            doc.put("updatedAt", Timestamp.now());
            client.requireFirestore().collection(COLLECTION).document(userId)
                    .set(doc).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            warnOnce(ex);
        }
    }

    private void warnOnce(Exception ex) {
        if (!warned) {
            warned = true;
            System.err.println("[Siege] Veteran teams unavailable (extractions won't persist): " + ex.getMessage());
        }
    }
}
