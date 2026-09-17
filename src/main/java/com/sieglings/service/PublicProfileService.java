package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.persistence.entity.UserPresenceEntity;
import com.sieglings.persistence.firestore.FriendRequestStore;
import com.sieglings.persistence.firestore.UserPresenceStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class PublicProfileService {

    @Autowired
    private AccountService accountService;

    @Autowired
    private ProfileSettingsService profileSettingsService;

    @Autowired
    private PresenceService presenceService;

    @Autowired
    private UserPresenceStore presenceStore;

    @Autowired
    private MatchHistoryService matchHistoryService;

    @Autowired
    private PlayerProgressionService playerProgressionService;

    @Autowired
    private FriendRequestStore friendRequestStore;

    public Map<String, Object> buildPublicProfile(AccountUser viewer, String targetUserId) {
        String normalized = normalizeUserId(targetUserId);
        AccountUser target = accountService.findByEmail(normalized);
        if (target == null) {
            throw new IllegalArgumentException("Player not found.");
        }
        boolean self = viewer != null && viewer.getId().equals(target.getId());
        boolean friend = self || (viewer != null && FriendRequestService.areMutualFriends(viewer, target));

        ProfileSettingsEntity settings = profileSettingsService.getOrCreate(target);
        UserPresenceEntity presence = presenceStore.findByUserId(target.getId()).orElse(null);
        Instant now = Instant.now();

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("userId", target.getId());
        response.put("editable", self);
        response.put("isFriend", friend);
        if (viewer != null && !self) {
            response.put("incomingFriendRequest",
                    friendRequestStore.findPending(target.getId(), viewer.getId()).isPresent());
            response.put("outgoingFriendRequest",
                    friendRequestStore.findPending(viewer.getId(), target.getId()).isPresent());
        }
        response.put("profileSettings", profileSettingsService.serialize(settings, target));
        response.put("presence", presenceService.serialize(presence, now));
        response.put("stats", buildStats(target));
        if (friend || self) {
            response.put("recentMatches", loadRecentMatches(target));
        }
        return response;
    }

    private Map<String, Object> buildStats(AccountUser target) {
        Map<String, Object> stats = new LinkedHashMap<>();
        PlayerProgressionEntity progression = playerProgressionService.getOrCreate(target);
        int ownedTotal = progression.getOwnedCards() == null
                ? 0
                : progression.getOwnedCards().values().stream().mapToInt(Integer::intValue).sum();
        stats.put("gold", progression.getGold());
        stats.put("ownedTotal", ownedTotal);
        // Same definition as the player's own profile, from the same method, so a
        // visitor and the owner cannot read two different completion figures for
        // one collection. See PlayerProgressionService#collectionProgress.
        PlayerProgressionService.CollectionProgress collection =
                playerProgressionService.collectionProgress(progression);
        stats.put("uniqueOwned", collection.owned());
        stats.put("collectibleTotal", collection.collectible());
        stats.put("collectedPercent", collection.percent());
        stats.put("level", Math.max(1, ownedTotal / 12 + 1));
        stats.put("siegeWins", progression.getSiegeWins());
        stats.put("knights", progression.getTrainerLevels() == null ? 0 : progression.getTrainerLevels().size());
        // The headline numbers a player's own profile leads with. Without these
        // a visitor's view of the same profile could only show em-dashes, which
        // is what it did: the record is the point of looking someone up.
        List<MatchHistoryEntity> history = matchHistoryService.listRecent(target);
        int matches = history.size();
        int wins = (int) history.stream()
                .filter(row -> row != null && "WIN".equalsIgnoreCase(row.getResult()))
                .count();
        stats.put("matches", matches);
        stats.put("wins", wins);
        stats.put("losses", matches - wins);
        stats.put("winRate", matches == 0 ? 0 : Math.round(wins * 100.0 / matches));
        return stats;
    }

    private List<Map<String, Object>> loadRecentMatches(AccountUser target) {
        return matchHistoryService.listRecent(target).stream().limit(8).map(this::serializeMatch).toList();
    }

    private Map<String, Object> serializeMatch(MatchHistoryEntity history) {
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
        row.put("gameLog", history.getGameLog() == null ? List.of() : history.getGameLog());
        return row;
    }

    private String normalizeUserId(String userId) {
        return userId == null ? "" : userId.trim().toLowerCase(Locale.ROOT);
    }
}
