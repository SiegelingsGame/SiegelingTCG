package com.sieglings.service;

import com.sieglings.mission.DailyMissionCatalog;
import com.sieglings.mission.DailyMissionDefinition;
import com.sieglings.mission.DailyMissionType;
import com.sieglings.mission.KnightLevelTrack;
import com.sieglings.mission.MissionPeriod;
import com.sieglings.mission.MissionRewardTrack;
import com.sieglings.model.Card;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.DailyMissionProgressEntity;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.DailyMissionProgressStore;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import com.sieglings.persistence.firestore.RewardClaimStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
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
import java.util.concurrent.ThreadLocalRandom;

@Service
public class DailyMissionService {

    private static final Logger logger = LoggerFactory.getLogger(DailyMissionService.class);

    /** Flat Siegecoin reward granted once per calendar day just for logging in. */
    public static final int DAILY_LOGIN_REWARD = 100;

    /** The login reward also seeds the daily chest ladder so the bar moves on day one. */
    public static final int DAILY_LOGIN_POINTS = 10;

    private static final DateTimeFormatter DATE_KEY_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    private static final int CLAIM_LOCK_STRIPES = 64;

    /**
     * Every claim path is a read-modify-write across two stores: load progress,
     * check the already-claimed marker, save it, then credit the wallet. Two
     * concurrent requests for the same player would both read a pre-claim
     * snapshot, both pass the check, and both pay out — the ledger records one
     * claim while the wallet receives two. A double-tap on the claim button is
     * enough to trigger it, so the window is serialized per user here, the same
     * way PlayerProgressionService guards pack opens. Cloud Run runs this
     * service at --max-instances 1, so an in-process lock covers every caller.
     */
    private final Object[] claimLocks = createLockStripes();

    private static Object[] createLockStripes() {
        Object[] locks = new Object[CLAIM_LOCK_STRIPES];
        for (int i = 0; i < locks.length; i++) {
            locks[i] = new Object();
        }
        return locks;
    }

    private Object claimLock(AccountUser user) {
        String userId = user == null ? "" : String.valueOf(user.getId());
        return claimLocks[Math.floorMod(userId.hashCode(), claimLocks.length)];
    }

    @Autowired
    private DailyMissionProgressStore progressStore;

    @Autowired
    private PlayerProgressionStore playerProgressionStore;

    // @Lazy breaks the PlayerProgressionService → DailyMissionService startup
    // cycle. Only used at claim time, to grant chest / Knight Level card pulls
    // through the shared copy-cap + duplicate-to-Remnants path.
    @Autowired(required = false)
    @Lazy
    private PlayerProgressionService playerProgressionService;

    @Autowired(required = false)
    private CardDefinitionService cardDefinitionService;

    // Absent in unit tests and when Firestore has no credentials; the claim path
    // then falls back to read-modify-write under the striped lock above.
    @Autowired(required = false)
    private RewardClaimStore rewardClaimStore;

    @Value("${app.leaderboard.time-zone:UTC}")
    private String missionTimeZoneId;

    public Map<String, Object> getDailySnapshot(AccountUser user) {
        return buildSnapshot(loadProgress(user.getId()));
    }

    private Map<String, Object> buildSnapshot(DailyMissionProgressEntity progress) {
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
        payload.put("dailyTrack", serializeTrack(MissionPeriod.DAILY, progress));
        payload.put("weeklyTrack", serializeTrack(MissionPeriod.WEEKLY, progress));
        payload.put("knight", serializeKnight(progress));
        return payload;
    }

    public Map<String, Object> claimMission(AccountUser user, String missionId) {
        DailyMissionDefinition definition = DailyMissionCatalog.findById(missionId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown mission."));
        return runClaim(user, (progress, progression) -> claimMissionInternal(definition, progress, progression));
    }

    public Map<String, Object> claimChest(AccountUser user, String periodName, int threshold) {
        MissionPeriod period = parseTrackPeriod(periodName);
        MissionRewardTrack.Chest chest = MissionRewardTrack.findChest(period, threshold);
        if (chest == null) {
            throw new IllegalArgumentException("Unknown reward chest.");
        }
        // Fetched before the transaction: the catalog read must not run inside it,
        // and it would be repeated on every optimistic retry.
        List<Card> catalog = chest.cardPulls() > 0 ? cardCatalog() : List.of();
        return runClaim(user, (progress, progression) ->
                claimChestInternal(period, chest, catalog, progress, progression));
    }

    public Map<String, Object> claimKnightLevels(AccountUser user) {
        List<Card> catalog = cardCatalog();
        return runClaim(user, (progress, progression) ->
                claimKnightLevelsInternal(catalog, progress, progression));
    }

    public Map<String, Object> claimLoginReward(AccountUser user) {
        return runClaim(user, this::claimLoginRewardInternal);
    }

    /**
     * Runs a claim so the already-claimed marker and the payout land together.
     *
     * <p>Firestore transactions make that atomic for every caller, including
     * other instances, and are used whenever Firestore is reachable. The striped
     * lock still wraps them: it costs nothing, and it keeps two requests from the
     * same player on this instance from burning optimistic retries against each
     * other. Without Firestore (unit tests, credential-less local runs) the lock
     * is the only guard, which is sound because those runs are single-process.
     */
    private Map<String, Object> runClaim(AccountUser user, RewardClaimStore.ClaimBody<Map<String, Object>> body) {
        synchronized (claimLock(user)) {
            if (rewardClaimStore != null && rewardClaimStore.isAvailable()) {
                return rewardClaimStore.runClaim(user.getId(), this::newProgression, (progress, progression) -> {
                    applyRollover(progress);
                    return body.apply(progress, progression);
                });
            }
            DailyMissionProgressEntity progress = loadProgress(user.getId());
            PlayerProgressionEntity progression = playerProgressionStore.findByUserId(user.getId())
                    .orElseGet(() -> newProgression(user.getId()));
            Map<String, Object> response = body.apply(progress, progression);
            progressStore.save(progress);
            playerProgressionStore.save(progression);
            return response;
        }
    }

    private PlayerProgressionEntity newProgression(String userId) {
        PlayerProgressionEntity created = new PlayerProgressionEntity();
        created.setUserId(userId);
        created.setGold(PlayerProgressionService.STARTING_GOLD);
        return created;
    }

    private Map<String, Object> claimMissionInternal(DailyMissionDefinition definition,
                                                    DailyMissionProgressEntity progress,
                                                    PlayerProgressionEntity progression) {
        int current = progress.counter(definition.period(), definition.type());
        if (current < definition.target()) {
            throw new IllegalArgumentException("Mission is not complete yet.");
        }
        List<String> claimed = progress.claimedIds(definition.period());
        if (claimed.contains(definition.id())) {
            throw new IllegalArgumentException("Mission reward already claimed.");
        }
        claimed.add(definition.id());
        // Points bank into the period's reward track: daily/weekly fill their chest
        // ladder, lifetime raises the account-wide Knight Level.
        progress.addPoints(definition.period(), definition.points());
        touch(progress, progression);

        applyRewards(progression, definition.reward(), 0, 0, List.of());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("missionId", definition.id());
        response.put("period", definition.period().name());
        response.put("reward", definition.reward());
        response.put("points", definition.points());
        response.put("gold", progression.getGold());
        response.put("mission", serializeMission(definition, progress));
        response.put("dailyMissions", buildSnapshot(progress));
        return response;
    }

    /**
     * Collects one chest from the daily or weekly point ladder. The chest must be
     * unlocked by the period's banked points and unclaimed; the ladder's final
     * chest also rolls a random card from the collection catalog.
     */
    private Map<String, Object> claimChestInternal(MissionPeriod period,
                                                  MissionRewardTrack.Chest chest,
                                                  List<Card> catalog,
                                                  DailyMissionProgressEntity progress,
                                                  PlayerProgressionEntity progression) {
        if (progress.points(period) < chest.threshold()) {
            throw new IllegalArgumentException("Not enough points for that chest yet.");
        }
        List<Integer> claimed = new ArrayList<>(progress.claimedChests(period));
        if (claimed.contains(chest.threshold())) {
            throw new IllegalArgumentException("Chest reward already claimed.");
        }
        claimed.add(chest.threshold());
        if (period == MissionPeriod.WEEKLY) {
            progress.setClaimedWeeklyChests(claimed);
        } else {
            progress.setClaimedDailyChests(claimed);
        }
        touch(progress, progression);

        List<Map<String, Object>> cards =
                applyRewards(progression, chest.gold(), chest.remnants(), chest.cardPulls(), catalog);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("period", period.name());
        response.put("threshold", chest.threshold());
        response.put("reward", chest.gold());
        response.put("remnants", chest.remnants());
        response.put("cards", cards);
        response.put("gold", progression.getGold());
        response.put("remnantsTotal", progression.getRemnants());
        response.put("dailyMissions", buildSnapshot(progress));
        return response;
    }

    /**
     * Pays out every Knight Level the player has reached but not yet collected.
     * Levels are banked from lifetime mission points only, so this is a permanent,
     * one-way track — {@code claimedKnightLevel} is the high-water mark.
     */
    private Map<String, Object> claimKnightLevelsInternal(List<Card> catalog,
                                                         DailyMissionProgressEntity progress,
                                                         PlayerProgressionEntity progression) {
        int reached = KnightLevelTrack.levelForPoints(progress.getKnightPoints());
        int claimedThrough = progress.getClaimedKnightLevel();
        if (reached <= claimedThrough) {
            throw new IllegalArgumentException("No Knight Level rewards to collect yet.");
        }

        int gold = 0;
        int remnants = 0;
        int cardPulls = 0;
        List<Map<String, Object>> levels = new ArrayList<>();
        for (int level = claimedThrough + 1; level <= reached; level++) {
            KnightLevelTrack.LevelReward reward = KnightLevelTrack.rewardForLevel(level);
            gold += reward.gold();
            remnants += reward.remnants();
            cardPulls += reward.cardPulls();
            levels.add(serializeLevelReward(reward));
        }
        progress.setClaimedKnightLevel(reached);
        touch(progress, progression);

        List<Map<String, Object>> cards = applyRewards(progression, gold, remnants, cardPulls, catalog);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("level", reached);
        response.put("levels", levels);
        response.put("reward", gold);
        response.put("remnants", remnants);
        response.put("cards", cards);
        response.put("gold", progression.getGold());
        response.put("remnantsTotal", progression.getRemnants());
        response.put("dailyMissions", buildSnapshot(progress));
        return response;
    }

    /**
     * Grants the flat daily login reward once per calendar day and advances the
     * consecutive-day login streak. Idempotent within a day — a second call the
     * same day throws so the client cannot double-claim.
     */
    private Map<String, Object> claimLoginRewardInternal(DailyMissionProgressEntity progress,
                                                        PlayerProgressionEntity progression) {
        String todayKey = dateKey(Instant.now());
        if (todayKey.equals(progress.getLastLoginClaimKey())) {
            throw new IllegalArgumentException("Daily login reward already claimed today.");
        }
        String yesterdayKey = LocalDate.now(zone()).minusDays(1).format(DATE_KEY_FORMAT);
        int streak = yesterdayKey.equals(progress.getLastLoginClaimKey()) ? progress.getLoginStreak() + 1 : 1;
        progress.setLoginStreak(streak);
        progress.setLastLoginClaimKey(todayKey);
        progress.addPoints(MissionPeriod.DAILY, DAILY_LOGIN_POINTS);
        touch(progress, progression);

        applyRewards(progression, DAILY_LOGIN_REWARD, 0, 0, List.of());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("reward", DAILY_LOGIN_REWARD);
        response.put("points", DAILY_LOGIN_POINTS);
        response.put("streak", streak);
        response.put("gold", progression.getGold());
        response.put("dailyMissions", buildSnapshot(progress));
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

    /** Stamps both documents so a claim is visible in each row's updatedAt. */
    private void touch(DailyMissionProgressEntity progress, PlayerProgressionEntity progression) {
        Instant now = Instant.now();
        progress.setUpdatedAt(now);
        progression.setUpdatedAt(now);
    }

    /**
     * Credits a payout onto the wallet entity and returns the cards actually
     * rolled. Pure mutation — the caller (transaction body or fallback) owns the
     * write, so this stays safe to re-run on an optimistic retry.
     */
    private List<Map<String, Object>> applyRewards(PlayerProgressionEntity progression,
                                                   int gold,
                                                   int remnants,
                                                   int cardPulls,
                                                   List<Card> catalog) {
        progression.setGold(progression.getGold() + Math.max(0, gold));
        progression.setRemnants(progression.getRemnants() + Math.max(0, remnants));

        List<Card> pulled = rollCards(cardPulls, catalog);
        List<Map<String, Object>> cards = new ArrayList<>();
        if (!pulled.isEmpty() && playerProgressionService != null) {
            // Routed through the shared grant so copy caps and duplicate-to-Remnants
            // conversion behave exactly as they do for pack pulls.
            for (PlayerProgressionService.CardGrantOutcome outcome
                    : playerProgressionService.grantCardsWithCap(progression, pulled)) {
                cards.add(serializeCardGrant(outcome));
            }
        }
        return cards;
    }

    /** Read once per claim, outside any transaction — this can hit Firestore. */
    private List<Card> cardCatalog() {
        return cardDefinitionService == null ? List.of() : cardDefinitionService.getDeckBuilderCatalog();
    }

    private List<Card> rollCards(int pulls, List<Card> catalog) {
        if (pulls <= 0 || catalog == null || catalog.isEmpty()) {
            return List.of();
        }
        List<Card> out = new ArrayList<>();
        for (int i = 0; i < pulls; i++) {
            out.add(catalog.get(ThreadLocalRandom.current().nextInt(catalog.size())));
        }
        return out;
    }

    private Map<String, Object> serializeCardGrant(PlayerProgressionService.CardGrantOutcome outcome) {
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("id", outcome.card().getId());
        card.put("name", outcome.card().getName());
        card.put("element", outcome.card().getElement() == null ? null : outcome.card().getElement().name());
        card.put("rarity", outcome.card().getRarity() == null ? null : outcome.card().getRarity().name());
        card.put("granted", outcome.grantedCopy());
        card.put("remnantsAwarded", outcome.remnantsAwarded());
        return card;
    }

    private MissionPeriod parseTrackPeriod(String periodName) {
        String normalized = periodName == null ? "" : periodName.trim().toUpperCase(Locale.ROOT);
        MissionPeriod period = switch (normalized) {
            case "WEEKLY" -> MissionPeriod.WEEKLY;
            case "DAILY" -> MissionPeriod.DAILY;
            default -> null;
        };
        if (period == null || !MissionRewardTrack.hasTrack(period)) {
            throw new IllegalArgumentException("Reward chests exist for the daily and weekly tracks only.");
        }
        return period;
    }

    private DailyMissionProgressEntity loadProgress(String userId) {
        DailyMissionProgressEntity progress = progressStore.findByUserId(userId).orElseGet(() -> {
            DailyMissionProgressEntity created = new DailyMissionProgressEntity();
            created.setUserId(userId);
            return created;
        });
        if (applyRollover(progress)) {
            progress.setUpdatedAt(Instant.now());
            persistRollover(progress);
        }
        return progress;
    }

    /**
     * The rollover write is a side effect of reading on the first request of a new
     * period, so a Firestore hiccup here must not fail the caller. Losing the write
     * only means the next request re-applies the same reset — the in-memory
     * progress is already correct, and the next claim persists it. Letting the
     * exception escape instead took the whole mission panel down (all three tabs
     * render from this one snapshot) for a write the reader never asked for.
     */
    private void persistRollover(DailyMissionProgressEntity progress) {
        try {
            progressStore.save(progress);
        } catch (RuntimeException ex) {
            logger.warn("Could not persist mission rollover for {}; serving the reset snapshot anyway.",
                    progress.getUserId(), ex);
        }
    }

    /**
     * Rolls the daily and weekly scopes over when their period key has moved on.
     * Split out of {@link #loadProgress} because a claim applies it inside the
     * transaction, where the commit carries the reset rather than a second write.
     * Lifetime counters, Knight points, and the claimed-level marker never reset.
     *
     * @return true when something was cleared
     */
    private boolean applyRollover(DailyMissionProgressEntity progress) {
        String todayKey = dateKey(Instant.now());
        String weekKey = weekKey(Instant.now());
        boolean dirty = false;
        if (!todayKey.equals(progress.getDateKey())) {
            progress.setDateKey(todayKey);
            progress.setCounters(new LinkedHashMap<>());
            progress.setClaimedMissionIds(new ArrayList<>());
            progress.setDailyPoints(0);
            progress.setClaimedDailyChests(new ArrayList<>());
            dirty = true;
        }
        if (!weekKey.equals(progress.getWeekKey())) {
            progress.setWeekKey(weekKey);
            progress.setWeeklyCounters(new LinkedHashMap<>());
            progress.setClaimedWeeklyIds(new ArrayList<>());
            progress.setWeeklyPoints(0);
            progress.setClaimedWeeklyChests(new ArrayList<>());
            dirty = true;
        }
        return dirty;
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
        mission.put("points", definition.points());
        mission.put("featured", definition.featured());
        mission.put("completed", completed);
        mission.put("claimed", claimed);
        mission.put("claimable", completed && !claimed);
        return mission;
    }

    private Map<String, Object> serializeTrack(MissionPeriod period, DailyMissionProgressEntity progress) {
        int points = progress.points(period);
        List<Integer> claimed = progress.claimedChests(period);
        List<Map<String, Object>> chests = new ArrayList<>();
        for (MissionRewardTrack.Chest chest : MissionRewardTrack.forPeriod(period)) {
            boolean unlocked = points >= chest.threshold();
            boolean taken = claimed.contains(chest.threshold());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("threshold", chest.threshold());
            row.put("gold", chest.gold());
            row.put("remnants", chest.remnants());
            row.put("cardPulls", chest.cardPulls());
            row.put("unlocked", unlocked);
            row.put("claimed", taken);
            row.put("claimable", unlocked && !taken);
            chests.add(row);
        }
        Map<String, Object> track = new LinkedHashMap<>();
        track.put("period", period.name());
        track.put("points", points);
        track.put("maxPoints", MissionRewardTrack.maxPoints(period));
        track.put("chests", chests);
        return track;
    }

    private Map<String, Object> serializeKnight(DailyMissionProgressEntity progress) {
        int points = progress.getKnightPoints();
        int level = KnightLevelTrack.levelForPoints(points);
        int claimedThrough = progress.getClaimedKnightLevel();
        int intoLevel = KnightLevelTrack.pointsIntoLevel(points);
        int toAdvance = KnightLevelTrack.pointsToAdvance(level);

        List<Map<String, Object>> pending = new ArrayList<>();
        for (int pendingLevel = claimedThrough + 1; pendingLevel <= level; pendingLevel++) {
            pending.add(serializeLevelReward(KnightLevelTrack.rewardForLevel(pendingLevel)));
        }

        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("level", level);
        knight.put("maxLevel", KnightLevelTrack.MAX_LEVEL);
        knight.put("points", points);
        knight.put("pointsIntoLevel", intoLevel);
        knight.put("pointsForNext", toAdvance);
        knight.put("claimedLevel", claimedThrough);
        knight.put("pendingLevels", pending);
        knight.put("claimable", !pending.isEmpty());
        knight.put("nextReward", level < KnightLevelTrack.MAX_LEVEL
                ? serializeLevelReward(KnightLevelTrack.rewardForLevel(level + 1))
                : null);
        return knight;
    }

    private Map<String, Object> serializeLevelReward(KnightLevelTrack.LevelReward reward) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("level", reward.level());
        out.put("gold", reward.gold());
        out.put("remnants", reward.remnants());
        out.put("cardPulls", reward.cardPulls());
        return out;
    }

    private Map<String, Object> serializeLogin(DailyMissionProgressEntity progress) {
        String todayKey = dateKey(Instant.now());
        boolean claimedToday = todayKey.equals(progress.getLastLoginClaimKey());
        Map<String, Object> login = new LinkedHashMap<>();
        login.put("reward", DAILY_LOGIN_REWARD);
        login.put("points", DAILY_LOGIN_POINTS);
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
