package com.sieglings.service;

import com.sieglings.mission.DailyMissionCatalog;
import com.sieglings.mission.DailyMissionDefinition;
import com.sieglings.mission.DailyMissionType;
import com.sieglings.mission.MissionPeriod;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.DailyMissionProgressEntity;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.DailyMissionProgressStore;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class DailyMissionService {

    /** Flat Siegecoin reward granted once per calendar day just for logging in. */
    public static final int DAILY_LOGIN_REWARD = 100;

    private static final DateTimeFormatter DATE_KEY_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    @Autowired
    private DailyMissionProgressStore progressStore;

    @Autowired
    private PlayerProgressionStore playerProgressionStore;

    @Value("${app.leaderboard.time-zone:UTC}")
    private String missionTimeZoneId;

    public Map<String, Object> getDailySnapshot(AccountUser user) {
        DailyMissionProgressEntity progress = loadProgress(user.getId());
        ZoneId zone = zone();
        Instant now = Instant.now();

        List<Map<String, Object>> daily = serializePeriod(MissionPeriod.DAILY, progress);
        List<Map<String, Object>> weekly = serializePeriod(MissionPeriod.WEEKLY, progress);
        List<Map<String, Object>> lifetime = serializePeriod(MissionPeriod.LIFETIME, progress);

        Map<String, Object> payload = new LinkedHashMap<>();
        // Daily fields kept at the top level for backwards compatibility with the
        // existing home hub feed (state.dailyMissions.missions / .featured).
        payload.put("dateKey", progress.getDateKey());
        payload.put("timeZone", zone.getId());
        payload.put("resetAt", nextDailyResetAt(zone, now).toString());
        payload.put("missions", daily);
        payload.put("featured", daily.stream().filter(m -> Boolean.TRUE.equals(m.get("featured"))).toList());

        payload.put("daily", daily);
        payload.put("weekly", weekly);
        payload.put("lifetime", lifetime);
        payload.put("weekKey", progress.getWeekKey());
        payload.put("weeklyResetAt", nextWeeklyResetAt(zone, now).toString());
        payload.put("login", serializeLogin(progress));
        return payload;
    }

    public Map<String, Object> claimMission(AccountUser user, String missionId) {
        DailyMissionDefinition definition = DailyMissionCatalog.findById(missionId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown mission."));
        DailyMissionProgressEntity progress = loadProgress(user.getId());
        int current = progress.counter(definition.period(), definition.type());
        if (current < definition.target()) {
            throw new IllegalArgumentException("Mission is not complete yet.");
        }
        List<String> claimed = progress.claimedIds(definition.period());
        if (claimed.contains(definition.id())) {
            throw new IllegalArgumentException("Mission reward already claimed.");
        }
        claimed.add(definition.id());
        progress.setUpdatedAt(Instant.now());
        progressStore.save(progress);

        PlayerProgressionEntity progression = grantGold(user, definition.reward());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("missionId", definition.id());
        response.put("period", definition.period().name());
        response.put("reward", definition.reward());
        response.put("gold", progression.getGold());
        response.put("mission", serializeMission(definition, progress));
        response.put("dailyMissions", getDailySnapshot(user));
        return response;
    }

    /**
     * Grants the flat daily login reward once per calendar day and advances the
     * consecutive-day login streak. Idempotent within a day — a second call the
     * same day throws so the client cannot double-claim.
     */
    public Map<String, Object> claimLoginReward(AccountUser user) {
        DailyMissionProgressEntity progress = loadProgress(user.getId());
        String todayKey = dateKey(Instant.now());
        if (todayKey.equals(progress.getLastLoginClaimKey())) {
            throw new IllegalArgumentException("Daily login reward already claimed today.");
        }
        String yesterdayKey = LocalDate.now(zone()).minusDays(1).format(DATE_KEY_FORMAT);
        int streak = yesterdayKey.equals(progress.getLastLoginClaimKey()) ? progress.getLoginStreak() + 1 : 1;
        progress.setLoginStreak(streak);
        progress.setLastLoginClaimKey(todayKey);
        progress.setUpdatedAt(Instant.now());
        progressStore.save(progress);

        PlayerProgressionEntity progression = grantGold(user, DAILY_LOGIN_REWARD);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("reward", DAILY_LOGIN_REWARD);
        response.put("streak", streak);
        response.put("gold", progression.getGold());
        response.put("dailyMissions", getDailySnapshot(user));
        return response;
    }

    public void recordMatch(MatchHistoryEntity history, int goldAwarded) {
        if (history == null || history.getUserId() == null || history.getUserId().isBlank()) {
            return;
        }
        DailyMissionProgressEntity progress = loadProgress(history.getUserId());
        addAll(progress, DailyMissionType.MATCHES_PLAYED, 1);
        if (goldAwarded > 0) {
            addAll(progress, DailyMissionType.SIEGECOINS_EARNED, goldAwarded);
        }
        boolean win = "WIN".equalsIgnoreCase(history.getResult());
        boolean online = "ONLINE".equalsIgnoreCase(history.getMatchType());
        if (win && online) {
            addAll(progress, DailyMissionType.PVP_WINS, 1);
        } else if (win) {
            addAll(progress, DailyMissionType.SOLO_WINS, 1);
        }
        if (history.getSpellsCast() > 0) {
            addAll(progress, DailyMissionType.SPELLS_CAST, history.getSpellsCast());
        }
        if (history.getTrapsSprung() > 0) {
            addAll(progress, DailyMissionType.TRAPS_SPRUNG, history.getTrapsSprung());
        }
        if (history.getSiegelingsDefeated() > 0) {
            addAll(progress, DailyMissionType.SIEGELINGS_DEFEATED, history.getSiegelingsDefeated());
        }
        progress.setUpdatedAt(Instant.now());
        progressStore.save(progress);
    }

    public void recordPackOpened(String userId) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        DailyMissionProgressEntity progress = loadProgress(userId);
        addAll(progress, DailyMissionType.PACK_OPENS, 1);
        progress.setUpdatedAt(Instant.now());
        progressStore.save(progress);
    }

    /**
     * Records the outcome of a completed Siege / Adventure expedition against the
     * daily, weekly, and lifetime mission counters. {@code goldEarned} feeds the
     * shared Siegecoin-earned counter so expedition payouts count toward those
     * objectives too.
     */
    public void recordSiege(String userId, boolean won, int bossKills, int nodesCleared, int goldEarned) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        DailyMissionProgressEntity progress = loadProgress(userId);
        addAll(progress, DailyMissionType.SIEGE_RUNS, 1);
        if (won) {
            addAll(progress, DailyMissionType.SIEGE_WINS, 1);
        }
        if (bossKills > 0) {
            addAll(progress, DailyMissionType.SIEGE_BOSS_KILLS, bossKills);
        }
        if (nodesCleared > 0) {
            addAll(progress, DailyMissionType.SIEGE_NODES_CLEARED, nodesCleared);
        }
        if (goldEarned > 0) {
            addAll(progress, DailyMissionType.SIEGECOINS_EARNED, goldEarned);
        }
        progress.setUpdatedAt(Instant.now());
        progressStore.save(progress);
    }

    private void addAll(DailyMissionProgressEntity progress, DailyMissionType type, int delta) {
        progress.addCounter(MissionPeriod.DAILY, type, delta);
        progress.addCounter(MissionPeriod.WEEKLY, type, delta);
        progress.addCounter(MissionPeriod.LIFETIME, type, delta);
    }

    private PlayerProgressionEntity grantGold(AccountUser user, int amount) {
        PlayerProgressionEntity progression = playerProgressionStore.findByUserId(user.getId()).orElseGet(() -> {
            PlayerProgressionEntity created = new PlayerProgressionEntity();
            created.setUserId(user.getId());
            created.setGold(PlayerProgressionService.STARTING_GOLD);
            return created;
        });
        progression.setGold(progression.getGold() + amount);
        progression.setUpdatedAt(Instant.now());
        playerProgressionStore.save(progression);
        return progression;
    }

    private DailyMissionProgressEntity loadProgress(String userId) {
        String todayKey = dateKey(Instant.now());
        String weekKey = weekKey(Instant.now());
        DailyMissionProgressEntity progress = progressStore.findByUserId(userId).orElseGet(() -> {
            DailyMissionProgressEntity created = new DailyMissionProgressEntity();
            created.setUserId(userId);
            return created;
        });
        boolean dirty = false;
        if (!todayKey.equals(progress.getDateKey())) {
            progress.setDateKey(todayKey);
            progress.setCounters(new LinkedHashMap<>());
            progress.setClaimedMissionIds(new ArrayList<>());
            dirty = true;
        }
        if (!weekKey.equals(progress.getWeekKey())) {
            progress.setWeekKey(weekKey);
            progress.setWeeklyCounters(new LinkedHashMap<>());
            progress.setClaimedWeeklyIds(new ArrayList<>());
            dirty = true;
        }
        if (dirty) {
            progress.setUpdatedAt(Instant.now());
            progressStore.save(progress);
        }
        return progress;
    }

    private List<Map<String, Object>> serializePeriod(MissionPeriod period, DailyMissionProgressEntity progress) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (DailyMissionDefinition definition : DailyMissionCatalog.forPeriod(period)) {
            out.add(serializeMission(definition, progress));
        }
        return out;
    }

    private Map<String, Object> serializeMission(DailyMissionDefinition definition, DailyMissionProgressEntity progress) {
        int current = Math.min(definition.target(), progress.counter(definition.period(), definition.type()));
        boolean completed = current >= definition.target();
        boolean claimed = progress.claimedIds(definition.period()).contains(definition.id());
        Map<String, Object> mission = new LinkedHashMap<>();
        mission.put("id", definition.id());
        mission.put("period", definition.period().name());
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

    private Map<String, Object> serializeLogin(DailyMissionProgressEntity progress) {
        String todayKey = dateKey(Instant.now());
        boolean claimedToday = todayKey.equals(progress.getLastLoginClaimKey());
        Map<String, Object> login = new LinkedHashMap<>();
        login.put("reward", DAILY_LOGIN_REWARD);
        login.put("claimedToday", claimedToday);
        login.put("claimable", !claimedToday);
        login.put("streak", progress.getLoginStreak());
        login.put("resetAt", nextDailyResetAt(zone(), Instant.now()).toString());
        return login;
    }

    private String dateKey(Instant instant) {
        return instant.atZone(zone()).toLocalDate().format(DATE_KEY_FORMAT);
    }

    private String weekKey(Instant instant) {
        LocalDate date = instant.atZone(zone()).toLocalDate();
        int week = date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
        int weekYear = date.get(IsoFields.WEEK_BASED_YEAR);
        return String.format(Locale.ROOT, "%d-W%02d", weekYear, week);
    }

    private Instant nextDailyResetAt(ZoneId zone, Instant now) {
        ZonedDateTime nextDay = now.atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone);
        return nextDay.toInstant();
    }

    private Instant nextWeeklyResetAt(ZoneId zone, Instant now) {
        LocalDate nextMonday = now.atZone(zone).toLocalDate()
                .with(TemporalAdjusters.next(DayOfWeek.MONDAY));
        return nextMonday.atStartOfDay(zone).toInstant();
    }

    private ZoneId zone() {
        return ZoneId.of(missionTimeZoneId == null || missionTimeZoneId.isBlank() ? "UTC" : missionTimeZoneId);
    }
}
