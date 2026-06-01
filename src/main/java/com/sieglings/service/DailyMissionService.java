package com.sieglings.service;

import com.sieglings.mission.DailyMissionCatalog;
import com.sieglings.mission.DailyMissionDefinition;
import com.sieglings.mission.DailyMissionType;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.DailyMissionProgressEntity;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.DailyMissionProgressStore;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DailyMissionService {

    private static final DateTimeFormatter DATE_KEY_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    @Autowired
    private DailyMissionProgressStore progressStore;

    @Autowired
    private PlayerProgressionStore playerProgressionStore;

    @Value("${app.leaderboard.time-zone:UTC}")
    private String missionTimeZoneId;

    public Map<String, Object> getDailySnapshot(AccountUser user) {
        DailyMissionProgressEntity progress = loadProgressForToday(user.getId());
        ZoneId zone = zone();
        Instant now = Instant.now();
        List<Map<String, Object>> missions = new ArrayList<>();
        for (DailyMissionDefinition definition : DailyMissionCatalog.all()) {
            missions.add(serializeMission(definition, progress));
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("dateKey", progress.getDateKey());
        payload.put("timeZone", zone.getId());
        payload.put("resetAt", nextResetAt(zone, now).toString());
        payload.put("missions", missions);
        payload.put("featured", missions.stream().filter(m -> Boolean.TRUE.equals(m.get("featured"))).toList());
        return payload;
    }

    public Map<String, Object> claimMission(AccountUser user, String missionId) {
        DailyMissionDefinition definition = DailyMissionCatalog.findById(missionId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown mission."));
        DailyMissionProgressEntity progress = loadProgressForToday(user.getId());
        int current = progressFor(definition, progress);
        if (current < definition.target()) {
            throw new IllegalArgumentException("Mission is not complete yet.");
        }
        if (progress.getClaimedMissionIds().contains(definition.id())) {
            throw new IllegalArgumentException("Mission reward already claimed.");
        }
        List<String> claimed = new ArrayList<>(progress.getClaimedMissionIds());
        claimed.add(definition.id());
        progress.setClaimedMissionIds(claimed);
        progress.setUpdatedAt(Instant.now());
        progressStore.save(progress);

        PlayerProgressionEntity progression = playerProgressionStore.findByUserId(user.getId()).orElseGet(() -> {
            PlayerProgressionEntity created = new PlayerProgressionEntity();
            created.setUserId(user.getId());
            created.setGold(PlayerProgressionService.STARTING_GOLD);
            return created;
        });
        progression.setGold(progression.getGold() + definition.reward());
        progression.setUpdatedAt(Instant.now());
        playerProgressionStore.save(progression);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("missionId", definition.id());
        response.put("reward", definition.reward());
        response.put("gold", progression.getGold());
        response.put("mission", serializeMission(definition, progress));
        response.put("dailyMissions", getDailySnapshot(user));
        return response;
    }

    public void recordMatch(MatchHistoryEntity history, int goldAwarded) {
        if (history == null || history.getUserId() == null || history.getUserId().isBlank()) {
            return;
        }
        DailyMissionProgressEntity progress = loadProgressForToday(history.getUserId());
        progress.addCounter(DailyMissionType.MATCHES_PLAYED, 1);
        if (goldAwarded > 0) {
            progress.addCounter(DailyMissionType.SIEGECOINS_EARNED, goldAwarded);
        }
        boolean win = "WIN".equalsIgnoreCase(history.getResult());
        boolean online = "ONLINE".equalsIgnoreCase(history.getMatchType());
        if (win && online) {
            progress.addCounter(DailyMissionType.PVP_WINS, 1);
        } else if (win) {
            progress.addCounter(DailyMissionType.SOLO_WINS, 1);
        }
        if (history.getSpellsCast() > 0) {
            progress.addCounter(DailyMissionType.SPELLS_CAST, history.getSpellsCast());
        }
        if (history.getTrapsSprung() > 0) {
            progress.addCounter(DailyMissionType.TRAPS_SPRUNG, history.getTrapsSprung());
        }
        if (history.getSiegelingsDefeated() > 0) {
            progress.addCounter(DailyMissionType.SIEGELINGS_DEFEATED, history.getSiegelingsDefeated());
        }
        progress.setUpdatedAt(Instant.now());
        progressStore.save(progress);
    }

    public void recordPackOpened(String userId) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        DailyMissionProgressEntity progress = loadProgressForToday(userId);
        progress.addCounter(DailyMissionType.PACK_OPENS, 1);
        progress.setUpdatedAt(Instant.now());
        progressStore.save(progress);
    }

    private DailyMissionProgressEntity loadProgressForToday(String userId) {
        String todayKey = dateKey(Instant.now());
        DailyMissionProgressEntity progress = progressStore.findByUserId(userId).orElseGet(() -> {
            DailyMissionProgressEntity created = new DailyMissionProgressEntity();
            created.setUserId(userId);
            return created;
        });
        if (!todayKey.equals(progress.getDateKey())) {
            progress.setDateKey(todayKey);
            progress.setCounters(new LinkedHashMap<>());
            progress.setClaimedMissionIds(new ArrayList<>());
            progress.setUpdatedAt(Instant.now());
            progressStore.save(progress);
        }
        return progress;
    }

    private Map<String, Object> serializeMission(DailyMissionDefinition definition, DailyMissionProgressEntity progress) {
        int current = Math.min(definition.target(), progressFor(definition, progress));
        boolean completed = current >= definition.target();
        boolean claimed = progress.getClaimedMissionIds().contains(definition.id());
        Map<String, Object> mission = new LinkedHashMap<>();
        mission.put("id", definition.id());
        mission.put("type", definition.type().name());
        mission.put("title", definition.title());
        mission.put("icon", definition.icon());
        mission.put("coinIcon", definition.coinIcon());
        mission.put("target", definition.target());
        mission.put("current", current);
        mission.put("reward", definition.reward());
        mission.put("featured", definition.featured());
        mission.put("completed", completed);
        mission.put("claimed", claimed);
        mission.put("claimable", completed && !claimed);
        return mission;
    }

    private int progressFor(DailyMissionDefinition definition, DailyMissionProgressEntity progress) {
        return progress.counter(definition.type());
    }

    private String dateKey(Instant instant) {
        return instant.atZone(zone()).toLocalDate().format(DATE_KEY_FORMAT);
    }

    private Instant nextResetAt(ZoneId zone, Instant now) {
        ZonedDateTime nextDay = now.atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone);
        return nextDay.toInstant();
    }

    private ZoneId zone() {
        return ZoneId.of(missionTimeZoneId == null || missionTimeZoneId.isBlank() ? "UTC" : missionTimeZoneId);
    }
}
