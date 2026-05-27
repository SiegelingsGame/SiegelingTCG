package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.UserPresenceEntity;
import com.sieglings.persistence.firestore.UserPresenceStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class PresenceService {
    public static final Duration ONLINE_WINDOW = Duration.ofSeconds(90);
    private static final Set<String> STATUSES = Set.of("ONLINE", "IN_GAME", "AWAY");

    @Autowired
    private UserPresenceStore presenceStore;

    public UserPresenceEntity heartbeat(AccountUser user, String status, String currentRoomId) {
        UserPresenceEntity presence = presenceStore.findByUserId(user.getId()).orElseGet(() -> {
            UserPresenceEntity created = new UserPresenceEntity();
            created.setUserId(user.getId());
            return created;
        });
        presence.setStatus(normalizeStatus(status));
        presence.setCurrentRoomId(currentRoomId == null || currentRoomId.isBlank() ? null : currentRoomId.trim());
        presence.setLastSeenAt(Instant.now());
        return presenceStore.save(presence);
    }

    public boolean isOnline(UserPresenceEntity presence, Instant now) {
        if (presence == null || presence.getLastSeenAt() == null) {
            return false;
        }
        return presence.getLastSeenAt().isAfter(now.minus(ONLINE_WINDOW));
    }

    public Map<String, Object> serialize(UserPresenceEntity presence, Instant now) {
        Map<String, Object> out = new LinkedHashMap<>();
        boolean online = isOnline(presence, now);
        out.put("online", online);
        out.put("status", online ? normalizeStatus(presence.getStatus()) : "OFFLINE");
        out.put("currentRoomId", online ? presence.getCurrentRoomId() : null);
        out.put("lastSeenAt", presence.getLastSeenAt() == null ? null : presence.getLastSeenAt().toString());
        return out;
    }

    public List<UserPresenceEntity> listFriendPresence(List<String> friendUserIds) {
        return presenceStore.findByUserIds(friendUserIds);
    }

    private String normalizeStatus(String status) {
        String normalized = status == null ? "ONLINE" : status.trim().toUpperCase(Locale.ROOT);
        return STATUSES.contains(normalized) ? normalized : "ONLINE";
    }
}
