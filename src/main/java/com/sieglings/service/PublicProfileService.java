package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.persistence.entity.UserPresenceEntity;
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

    public Map<String, Object> buildPublicProfile(AccountUser viewer, String targetUserId) {
        String normalized = normalizeUserId(targetUserId);
        AccountUser target = accountService.findByEmail(normalized);
        if (target == null) {
            throw new IllegalArgumentException("Player not found.");
        }
        boolean self = viewer != null && viewer.getId().equals(target.getId());
        boolean friend = viewer != null && (self || (viewer.getFriendEmails() != null && viewer.getFriendEmails().contains(target.getId())));

        ProfileSettingsEntity settings = profileSettingsService.getOrCreate(target);
        UserPresenceEntity presence = presenceStore.findByUserId(target.getId()).orElse(null);
        Instant now = Instant.now();

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("userId", target.getId());
        response.put("editable", self);
        response.put("isFriend", friend);
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
        stats.put("uniqueOwned", progression.getOwnedCards() == null ? 0 : progression.getOwnedCards().size());
        stats.put("level", Math.max(1, ownedTotal / 12 + 1));
        return stats;
    }

    private List<Map<String, Object>> loadRecentMatches(AccountUser target) {
        return matchHistoryService.listRecent(target).stream().limit(8).map(this::serializeMatch).toList();
    }

    private Map<String, Object> serializeMatch(MatchHistoryEntity history) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("result", history.getResult());
        row.put("matchType", history.getMatchType());
        row.put("opponentName", history.getOpponentName());
        row.put("finishedAt", history.getFinishedAt() == null ? null : history.getFinishedAt().toString());
        return row;
    }

    private String normalizeUserId(String userId) {
        return userId == null ? "" : userId.trim().toLowerCase(Locale.ROOT);
    }
}
