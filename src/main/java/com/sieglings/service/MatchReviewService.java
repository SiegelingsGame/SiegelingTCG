package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import com.sieglings.persistence.firestore.MatchReviewStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Serves the profile match review: one recorded battle (its stats, full log and,
 * when one was saved, the board replay) or one finished Siege run.
 *
 * <p>Visibility follows the profile that lists the match. A player's recent
 * matches are shown to themselves and to mutual friends
 * ({@link PublicProfileService}), so exactly those viewers may open one; anyone
 * else gets the same "not found" as a bad id, so ids cannot be probed.
 */
@Service
public class MatchReviewService {

    private static final Logger logger = LoggerFactory.getLogger(MatchReviewService.class);
    public static final String SIEGE_ID_PREFIX = "siege-";
    static final String NOT_FOUND = "That match could not be found.";

    @Autowired
    private MatchHistoryStore matchHistoryStore;

    @Autowired
    private MatchReviewStore matchReviewStore;

    @Autowired
    private AccountService accountService;

    public Map<String, Object> review(AccountUser viewer, String id) {
        if (viewer == null) {
            throw new IllegalArgumentException("Sign in to review matches.");
        }
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException(NOT_FOUND);
        }
        if (id.startsWith(SIEGE_ID_PREFIX)) {
            Map<String, Object> run = matchReviewStore.findSiegeRun(id)
                    .orElseThrow(() -> new IllegalArgumentException(NOT_FOUND));
            requireVisible(viewer, String.valueOf(run.get("userId")));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("kind", "SIEGE");
            out.put("run", withoutOwner(run));
            return out;
        }
        MatchHistoryEntity match = matchHistoryStore.findById(id)
                .orElseThrow(() -> new IllegalArgumentException(NOT_FOUND));
        requireVisible(viewer, match.getUserId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "BATTLE");
        out.put("match", serializeMatch(match));
        Map<String, Object> replay = null;
        if (match.isHasReplay()) {
            try {
                replay = matchReviewStore.findReplay(id).map(this::withoutOwner).orElse(null);
            } catch (RuntimeException ex) {
                logger.warn("Replay for {} could not be loaded; serving the log only.", id, ex);
            }
        }
        out.put("replay", replay);
        return out;
    }

    /** Recent finished Siege runs as list rows for a profile's Recent section. */
    public List<Map<String, Object>> recentSiegeRuns(AccountUser owner, int limit) {
        if (owner == null) {
            return List.of();
        }
        try {
            return matchReviewStore.listSiegeRuns(owner.getId(), limit).stream().map(this::siegeRow).toList();
        } catch (RuntimeException ex) {
            logger.warn("Unable to list Siege runs for {}", owner.getId(), ex);
            return List.of();
        }
    }

    boolean canView(AccountUser viewer, String ownerId) {
        if (viewer == null || ownerId == null || ownerId.isBlank()) {
            return false;
        }
        if (ownerId.equals(viewer.getId())) {
            return true;
        }
        AccountUser owner = accountService.findById(ownerId);
        return FriendRequestService.areMutualFriends(viewer, owner);
    }

    private void requireVisible(AccountUser viewer, String ownerId) {
        if (!canView(viewer, ownerId)) {
            throw new IllegalArgumentException(NOT_FOUND);
        }
    }

    /** The owner's account id is an email address; a friend's client has no use for it. */
    private Map<String, Object> withoutOwner(Map<String, Object> doc) {
        Map<String, Object> out = new LinkedHashMap<>(doc);
        out.remove("userId");
        return out;
    }

    private Map<String, Object> siegeRow(Map<String, Object> run) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", run.get("id"));
        row.put("matchType", "SIEGE");
        row.put("result", run.get("result"));
        row.put("finishedAt", run.get("finishedAt"));
        row.put("title", run.get("title"));
        row.put("knightName", run.get("knightName"));
        row.put("floorReached", run.get("floorReached"));
        row.put("floorTotal", run.get("floorTotal"));
        return row;
    }

    public static Map<String, Object> serializeMatch(MatchHistoryEntity history) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", history.getId());
        row.put("result", history.getResult());
        row.put("matchType", history.getMatchType());
        row.put("opponentName", history.getOpponentName());
        row.put("finishedAt", history.getFinishedAt() == null ? null : history.getFinishedAt().toString());
        row.put("loadoutLabel", history.getLoadoutLabel());
        row.put("trainerName", history.getTrainerName());
        row.put("turnNumber", history.getTurnNumber());
        row.put("spellsCast", history.getSpellsCast());
        row.put("trapsSprung", history.getTrapsSprung());
        row.put("siegelingsDefeated", history.getSiegelingsDefeated());
        row.put("playerHealthRemaining", history.getPlayerHealthRemaining());
        row.put("opponentHealthRemaining", history.getOpponentHealthRemaining());
        row.put("playerEnergyRemaining", history.getPlayerEnergyRemaining());
        row.put("hasReplay", history.isHasReplay());
        row.put("gameLog", history.getGameLog() == null ? List.of() : history.getGameLog());
        return row;
    }
}
