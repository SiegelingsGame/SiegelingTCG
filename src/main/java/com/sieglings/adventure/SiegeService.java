package com.sieglings.adventure;

import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.SieglingSize;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import com.sieglings.service.AccountService;
import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.DailyMissionService;
import com.sieglings.service.PlayerProgressionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Session + orchestration layer for the Siege roguelike: creates runs, resolves
 * map nodes, drives battles through {@link SiegeCombatEngine}, and serializes
 * run/battle state to plain maps for the JSON API. Runs are held in memory and
 * scoped to an opaque token (mirrors the base solo-game pattern).
 */
@Service
public class SiegeService {

    private static final Duration RUN_TTL = Duration.ofHours(6);

    @Autowired
    private SiegeContentService content;

    @Autowired
    private SiegeCombatEngine engine;

    @Autowired
    private SiegeCheckpointStore checkpoints;

    @Autowired
    private SiegeVeteranStore veterans;

    @Autowired(required = false)
    private AccountService accountService;

    @Autowired(required = false)
    private PlayerProgressionService progressionService;

    @Autowired(required = false)
    private PlayerProgressionStore progressionStore;

    @Autowired(required = false)
    private DailyMissionService dailyMissionService;

    @Autowired(required = false)
    private CardEditorAuthService editorAuth;

    private final Map<String, Session> runs = new ConcurrentHashMap<>();
    private final SecureRandom tokenRandom = new SecureRandom();
    private final Random rng = new Random();

    private static final class Session {
        final SiegeRun run;
        volatile Instant lastSeen;
        Session(SiegeRun run) { this.run = run; this.lastSeen = Instant.now(); }
    }

    // ---- Roster for team select ----------------------------------------

    Map<String, Object> roster(String authorizationHeader) {
        AccountUser user = resolveUser(authorizationHeader);
        PlayerProgressionEntity progression = null;
        if (user != null) {
            try {
                progression = loadProgression(user);
            } catch (Exception ignored) {
                // Still return Siegelings when progression lookup fails (e.g. local Firestore).
            }
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        List<Map<String, Object>> siegelings = new ArrayList<>();
        boolean startersConfigured = content.expeditionStartersConfigured();
        java.util.Set<String> evolvesFrom = content.idsWithEvolutionAvailable();
        for (SieglingCard s : content.selectableSieglings()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("name", s.getName());
            m.put("element", s.getElement().name());
            m.put("rarity", s.getRarity().name());
            m.put("hp", 18 + s.getHealth() * 4);
            m.put("speed", Math.max(4, s.getSpeed()));
            m.put("moveCount", content.moveCount(s));
            m.put("artUrl", s.getCardArtUrl());
            m.put("evolves", evolvesFrom.contains(s.getId()));
            // Catalog starters plus anything this account found on an expedition.
            m.put("expeditionStarter", content.isExpeditionStarter(s, startersConfigured)
                    || (progression != null && progressionService != null
                        && progressionService.isSiegeSieglingUnlocked(progression, s.getId())));
            m.put("moves", serializeSpecs(content.moveSpecs(s)));
            siegelings.add(m);
        }
        List<Map<String, Object>> knights = new ArrayList<>();
        for (TrainerCard k : content.selectableKnights()) {
            AbilitySpec active = content.knightActiveSpec(k);
            boolean starter = content.isExpeditionKnightStarter(k);
            boolean owned = progression != null && progression.getTrainerLevels().containsKey(normalizeKnightId(k.getId()));
            boolean unlocked = starter || (progression != null && progressionService != null
                    && progressionService.isSiegeKnightUnlocked(progression, k.getId()));
            int unlockCost = content.siegeUnlockCost(k);
            boolean canUnlock = user != null && progression != null && progressionService != null
                    && !starter && !unlocked && owned;
            boolean knightSelectable = starter || unlocked;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", k.getId());
            m.put("name", k.getName());
            m.put("element", k.getElement().name());
            m.put("activeName", k.getActiveAbility() == null ? "Rally" : k.getActiveAbility().getName());
            m.put("activeDesc", active.description());
            m.put("active", serializeSpec(active));
            KnightPassive passive = content.knightPassiveKind(k);
            m.put("passive", content.knightPassiveDescription(k));
            m.put("passiveKind", passive.name());
            m.put("passiveName", content.knightPassiveName(passive));
            m.put("passiveValue", content.knightPassiveValue(passive));
            // Marshal knights assemble a bigger warband, so the size is per-knight.
            m.put("startingParty", content.startingPartySize(k));
            m.put("expeditionStarter", starter);
            m.put("owned", owned);
            m.put("siegeUnlocked", unlocked);
            m.put("selectable", knightSelectable);
            m.put("unlockCost", unlockCost);
            m.put("canUnlock", canUnlock);
            knights.add(m);
        }
        resp.put("siegelings", List.copyOf(siegelings));
        resp.put("knights", knights);
        resp.put("partySize", content.partySize());
        resp.put("partyMax", content.partyMax());
        resp.put("loggedIn", user != null);
        resp.put("gold", progression == null ? 0 : progression.getGold());
        // Battlegrounds gate: `veterans` is a FLAT list of banked veteran Siegelings
        // (the ">=3 veteran Siegelings" gate the client counts), `veteranTeams` the
        // full team snapshots Phase 3 rebuilds a playable squad from.
        List<Map<String, Object>> veteranTeams = listVeteranTeams(user);
        resp.put("veterans", SiegeVeteranStore.flattenVeterans(veteranTeams));
        resp.put("veteranTeams", veteranTeams);
        // Battlegrounds economy + progression for the lobby.
        int clearedTier = progression == null ? 0 : progression.getBattlegroundsTier();
        resp.put("warmarks", progression == null ? 0 : progression.getWarmarks());
        resp.put("battlegroundsTier", clearedTier);
        resp.put("battlegroundsMaxTier", SiegeTuning.BG_MAX_TIER);
        resp.put("battlegroundsUnlockedTier", Math.min(SiegeTuning.BG_MAX_TIER, clearedTier + 1));
        resp.put("battlegroundsUnlocks", progression == null ? new ArrayList<>() : progression.getBattlegroundsUnlocks());
        return resp;
    }

    /** The authenticated user's banked veteran teams (newest first); empty for guests. */
    private List<Map<String, Object>> listVeteranTeams(AccountUser user) {
        if (user == null || user.getId() == null) return new ArrayList<>();
        try {
            return veterans.listTeams(user.getId());
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
    }

    /** Roster of banked veteran teams for the authenticated user (empty for guests). */
    Map<String, Object> veterans(String authorizationHeader) {
        List<Map<String, Object>> teams = listVeteranTeams(resolveUser(authorizationHeader));
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("veterans", SiegeVeteranStore.flattenVeterans(teams));
        resp.put("veteranTeams", teams);
        return resp;
    }

    // ---- Warmarks shop (Battlegrounds-only currency store) ----------------

    /** One purchasable Warmarks-shop entry (a cosmetic/utility unlock recorded as an owned flag). */
    record ShopItem(String id, String name, String icon, String desc, int cost) {}

    /** The Battlegrounds Warmarks shop catalog (owned as flags on the player's progression). */
    static final List<ShopItem> BG_SHOP = List.of(
            new ShopItem("frame_warlord", "Warlord Card Frame", "🖼️", "A battle-scarred frame for your cards.", 120),
            new ShopItem("frame_ember", "Ember Card Frame", "🔥", "A molten frame won only in the Battlegrounds.", 120),
            new ShopItem("loading_siegefront", "Siegefront Loading Art", "🌄", "An exclusive loading screen backdrop.", 150),
            new ShopItem("sigil_veteran", "Veteran's Sigil", "🎖️", "A unique carry sigil: +HP to its bearer next run.", 200),
            new ShopItem("title_warbringer", "Title: Warbringer", "🏷️", "A profile title earned in the Battlegrounds.", 90));

    private static ShopItem shopItem(String id) {
        for (ShopItem it : BG_SHOP) if (it.id().equals(id)) return it;
        return null;
    }

    /** The Warmarks shop catalog with the signed-in player's balance and owned unlocks. */
    Map<String, Object> battlegroundsShop(String authorizationHeader) {
        AccountUser user = resolveUser(authorizationHeader);
        int warmarks = 0;
        List<String> owned = new ArrayList<>();
        if (user != null && progressionService != null) {
            try {
                PlayerProgressionEntity p = progressionService.getOrCreate(user);
                warmarks = p.getWarmarks();
                owned = p.getBattlegroundsUnlocks();
            } catch (Exception ignored) { /* guest view */ }
        }
        List<Map<String, Object>> items = new ArrayList<>();
        for (ShopItem it : BG_SHOP) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", it.id());
            m.put("name", it.name());
            m.put("icon", it.icon());
            m.put("desc", it.desc());
            m.put("cost", it.cost());
            m.put("owned", owned.contains(it.id()));
            items.add(m);
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("warmarks", warmarks);
        resp.put("items", items);
        resp.put("loggedIn", user != null);
        return resp;
    }

    /** Spends Warmarks on a shop item after server-side balance + ownership checks. */
    Map<String, Object> buyBattlegroundsItem(String authorizationHeader, String itemId) {
        AccountUser user = resolveUser(authorizationHeader);
        if (user == null || user.getId() == null) {
            throw new IllegalArgumentException("Sign in to spend Warmarks.");
        }
        ShopItem item = shopItem(itemId);
        if (item == null) throw new IllegalArgumentException("That item is not in the Warmarks shop.");
        if (progressionService == null || progressionStore == null) {
            throw new IllegalArgumentException("The shop is unavailable right now.");
        }
        PlayerProgressionEntity p = progressionService.getOrCreate(user);
        if (p.getBattlegroundsUnlocks().contains(item.id())) {
            throw new IllegalArgumentException("You already own " + item.name() + ".");
        }
        if (p.getWarmarks() < item.cost()) {
            throw new IllegalArgumentException("Not enough Warmarks — " + item.name() + " costs " + item.cost() + ".");
        }
        p.setWarmarks(p.getWarmarks() - item.cost());
        List<String> owned = new ArrayList<>(p.getBattlegroundsUnlocks());
        owned.add(item.id());
        p.setBattlegroundsUnlocks(owned);
        p.setUpdatedAt(Instant.now());
        progressionStore.save(p);
        return battlegroundsShop(authorizationHeader);
    }

    /**
     * Battlegrounds standings. A global cross-user ranking needs a dedicated
     * aggregate store (seam left for later); for now this returns the signed-in
     * player's own best tier + Warmarks and the tier ladder so the UI can show
     * personal progress against the five tiers.
     */
    Map<String, Object> battlegroundsLeaderboard(String authorizationHeader) {
        AccountUser user = resolveUser(authorizationHeader);
        Map<String, Object> resp = new LinkedHashMap<>();
        int clearedTier = 0;
        int warmarks = 0;
        if (user != null && progressionService != null) {
            try {
                PlayerProgressionEntity p = progressionService.getOrCreate(user);
                clearedTier = p.getBattlegroundsTier();
                warmarks = p.getWarmarks();
            } catch (Exception ignored) { /* guest */ }
        }
        Map<String, Object> you = new LinkedHashMap<>();
        you.put("clearedTier", clearedTier);
        you.put("warmarks", warmarks);
        resp.put("you", you);
        resp.put("maxTier", SiegeTuning.BG_MAX_TIER);
        resp.put("loggedIn", user != null);
        return resp;
    }

    Map<String, Object> unlockKnight(String authorizationHeader, String knightId) {
        AccountUser user = requireUser(authorizationHeader);
        if (progressionService == null || progressionStore == null) {
            throw new IllegalStateException("SiegeKnight unlocks are unavailable right now.");
        }
        TrainerCard knight = content.findKnight(knightId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown SiegeKnight."));
        if (content.isExpeditionKnightStarter(knight)) {
            throw new IllegalArgumentException(knight.getName() + " is already available for expeditions.");
        }
        PlayerProgressionEntity progression = loadProgression(user);
        if (progressionService.isSiegeKnightUnlocked(progression, knight.getId())) {
            throw new IllegalArgumentException(knight.getName() + " is already unlocked for expeditions.");
        }
        int cost = content.siegeUnlockCost(knight);
        if (progression.getGold() < cost) {
            throw new IllegalArgumentException("Need " + cost + " Siegecoins to unlock " + knight.getName() + ".");
        }
        progressionService.unlockSiegeKnight(progression, knight.getId());
        progression.setGold(progression.getGold() - cost);
        progression.setUpdatedAt(Instant.now());
        progressionStore.save(progression);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("knightId", knight.getId());
        out.put("gold", progression.getGold());
        out.putAll(roster(authorizationHeader));
        return out;
    }

    private AccountUser resolveUser(String authorizationHeader) {
        if (accountService == null) {
            return null;
        }
        try {
            return accountService.findUser(authorizationHeader);
        } catch (Exception ignored) {
            return null;
        }
    }

    private AccountUser requireUser(String authorizationHeader) {
        AccountUser user = resolveUser(authorizationHeader);
        if (user == null) {
            throw new IllegalArgumentException("Sign in to unlock SiegeKnights for expeditions.");
        }
        return user;
    }

    /**
     * Records a Siegeling this run has met. Banked as a permanent starter unlock
     * when the run ends (see {@link #bankSieglingDiscoveries}); nothing is
     * granted mid-run, so a run that is abandoned or lost keeps its finds unbanked.
     */
    private void noteDiscovery(SiegeRun run, String cardId) {
        if (run != null && cardId != null && !cardId.isBlank()) {
            run.getDiscoveredSieglingIds().add(cardId);
        }
    }

    /**
     * Turns this run's discoveries into permanent starter unlocks. Finding any
     * form earns its whole line, so each id is resolved to its stage-1 base —
     * that is the card warband select can actually offer — and the found form is
     * banked alongside it so the collection reflects what was actually met.
     *
     * @return display names of the Siegelings newly unlocked, for the run summary
     */
    private List<String> bankSieglingDiscoveries(PlayerProgressionEntity progression, SiegeRun run) {
        if (progression == null || progressionService == null || run.getDiscoveredSieglingIds().isEmpty()) {
            return List.of();
        }
        java.util.LinkedHashSet<String> ids = new java.util.LinkedHashSet<>();
        for (String found : run.getDiscoveredSieglingIds()) {
            String base = content.baseFormId(found);
            if (base != null && !base.isBlank()) ids.add(base);
            ids.add(found);
        }
        // Unlocks are stored normalized (lower-case), so resolve display names
        // from the ids we passed in rather than from what comes back.
        Map<String, String> pickableNames = new LinkedHashMap<>();
        for (String id : ids) {
            content.findSiegling(id).ifPresent(s ->
                    pickableNames.put(id.toLowerCase(java.util.Locale.ROOT), s.getName()));
        }
        List<String> names = new ArrayList<>();
        for (String id : progressionService.unlockSiegeSieglings(progression, ids)) {
            // Only stage-1 bases become pickable, so they are the only unlock
            // worth announcing; an evolution is banked quietly.
            String name = pickableNames.get(id);
            if (name != null) names.add(name);
        }
        return names;
    }

    private PlayerProgressionEntity loadProgression(AccountUser user) {
        if (progressionService == null || user == null) {
            return null;
        }
        return progressionService.getOrCreate(user);
    }

    private boolean isKnightSelectable(TrainerCard knight, AccountUser user, PlayerProgressionEntity progression) {
        if (content.isExpeditionKnightStarter(knight)) {
            return true;
        }
        if (user == null || progression == null || progressionService == null) {
            return false;
        }
        return progressionService.isSiegeKnightUnlocked(progression, knight.getId());
    }

    private static String normalizeKnightId(String trainerId) {
        return trainerId == null ? null : trainerId.trim().toLowerCase(java.util.Locale.ROOT);
    }

    // ---- Run lifecycle --------------------------------------------------

    Map<String, Object> newRun(String authorizationHeader, String knightId, List<String> sieglingIds, String modeName) {
        RunMode mode = "ENDLESS".equalsIgnoreCase(modeName) ? RunMode.ENDLESS : RunMode.STANDARD;
        TrainerCard knight = content.findKnight(knightId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown SiegeKnight."));
        // The starting warband is knight-dependent: a Marshal musters an extra Siegeling.
        int startingParty = content.startingPartySize(knight);
        if (mode == RunMode.STANDARD
                ? (sieglingIds == null || sieglingIds.size() != startingParty)
                : (sieglingIds == null || sieglingIds.isEmpty() || sieglingIds.size() > content.partyMax())) {
            throw new IllegalArgumentException(mode == RunMode.STANDARD
                    ? "Choose exactly " + startingParty + " Siegeling" + (startingParty == 1 ? "" : "s")
                        + " — more will join along the way."
                    : "An endless team needs 1-" + content.partyMax() + " Siegelings.");
        }
        if (new java.util.LinkedHashSet<>(sieglingIds).size() != sieglingIds.size()) {
            throw new IllegalArgumentException("Each Siegeling can only join the warband once.");
        }
        AccountUser user = resolveUser(authorizationHeader);
        PlayerProgressionEntity progression = loadProgression(user);
        if (!isKnightSelectable(knight, user, progression)) {
            throw new IllegalArgumentException(knight.getName() + " is locked — unlock them with Siegecoins first.");
        }

        purgeStale();
        String token = generateToken();
        SiegeRun run = new SiegeRun(token);
        run.setOwnerId(user == null ? "" : user.getId());

        run.setKnightId(knight.getId());
        run.setKnightName(knight.getName());
        run.setKnightElement(knight.getElement());
        run.setKnightActive(content.knightActiveSpec(knight));
        run.setKnightPassiveDesc(content.knightPassiveDescription(knight));
        KnightPassive passive = content.knightPassiveKind(knight);
        run.setKnightPassive(passive);
        run.setKnightPassiveValue(content.knightPassiveValue(passive));
        run.setKnightUnit(content.toKnightCombatant(knight));

        run.setMode(mode);
        int slot = 0;
        for (String id : sieglingIds) {
            SieglingCard s = (mode == RunMode.ENDLESS ? content.findAnySiegling(id) : content.findSiegling(id))
                    .orElseThrow(() -> new IllegalArgumentException("Unknown Siegeling: " + id));
            if (!content.isExpeditionStarter(s)) {
                throw new IllegalArgumentException(s.getName() + " is locked — find them on the expedition path first.");
            }
            Combatant member = content.toPartyCombatant(s, slot);
            applyJoinBonus(run, member);
            run.getParty().add(member);
            run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
            noteDiscovery(run, s.getId());
            slot++;
        }
        // The SiegeKnight contributes one card to the shared deck.
        if (run.getKnightActive() != null) {
            run.getDeckTemplates().add(new SiegeCard("knightcard", "knight-" + knight.getId(), run.getKnightActive()));
        }

        seedStartingKnightBag(run);

        run.getMap().addAll(content.generateMap(rng));
        runs.put(token, new Session(run));
        checkpoint(run);
        return serialize(run);
    }

    /** Applies the knight's HEALTH passive to a member as it joins the warband. */
    private void applyJoinBonus(SiegeRun run, Combatant member) {
        if (run.getKnightPassive() == KnightPassive.HEALTH) {
            int v = run.getKnightPassiveValue();
            member.addBaseMaxHp(v);
        }
    }

    /** Grants flat XP to every living party member and the SiegeKnight (non-combat sources). */
    private void awardPartyXp(SiegeRun run, int amount) {
        if (amount <= 0) return;
        for (Combatant ally : run.getParty()) {
            if (ally.isAlive()) ally.addXp(amount);
        }
        Combatant knight = run.getKnightUnit();
        if (knight != null && knight.isAlive()) knight.addXp(amount);
    }

    /** Grants battle XP and stores a client-friendly recap for the reward screen. */
    private void awardBattleXpWithRecap(SiegeRun run, SiegeBattle battle, int baseXp) {
        if (run == null || battle == null || baseXp <= 0) return;
        Map<String, Integer> kills = battle.getKillCredit();
        List<Map<String, Object>> units = new ArrayList<>();
        List<Map<String, Object>> levelUps = new ArrayList<>();
        int totalAwarded = 0;

        for (Combatant ally : run.getParty()) {
            if (!ally.isAlive()) continue;
            Map<String, Object> entry = awardBattleXpEntry(ally, "SIEGLING", baseXp, kills);
            totalAwarded += intOf(entry.get("xpGained"), 0);
            units.add(entry);
            if (Boolean.TRUE.equals(entry.get("leveledUp"))) levelUps.add(entry);
        }
        Combatant knight = run.getKnightUnit();
        if (knight != null && knight.isAlive()) {
            Map<String, Object> entry = awardBattleXpEntry(knight, "KNIGHT", baseXp, kills);
            totalAwarded += intOf(entry.get("xpGained"), 0);
            units.add(entry);
            if (Boolean.TRUE.equals(entry.get("leveledUp"))) levelUps.add(entry);
        }

        Map<String, Object> recap = new LinkedHashMap<>();
        recap.put("baseXp", baseXp);
        recap.put("killBonusPerDefeat", SiegeTuning.XP_KILLING_BLOW);
        recap.put("totalAwarded", totalAwarded);
        recap.put("units", units);
        recap.put("levelUps", levelUps);
        run.setLastXpRecap(recap);
    }

    private Map<String, Object> awardBattleXpEntry(Combatant unit, String kind, int baseXp, Map<String, Integer> kills) {
        int beforeLevel = unit.getLevel();
        int beforeXp = unit.getXp();
        int killCount = kills.getOrDefault(unit.getId(), 0);
        int killBonus = killCount * SiegeTuning.XP_KILLING_BLOW;
        int gained = baseXp + killBonus;
        unit.addXp(gained);

        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", unit.getId());
        entry.put("kind", kind);
        entry.put("name", unit.getName());
        entry.put("element", unit.getElement() == null ? null : unit.getElement().name());
        entry.put("xpBefore", beforeXp);
        entry.put("xpAfter", unit.getXp());
        entry.put("xpGained", gained);
        entry.put("baseXp", baseXp);
        entry.put("killCount", killCount);
        entry.put("killBonus", killBonus);
        entry.put("levelBefore", beforeLevel);
        entry.put("levelAfter", unit.getLevel());
        entry.put("leveledUp", unit.getLevel() > beforeLevel);
        entry.put("xpInLevel", unit.getXp() - SiegeTuning.xpForLevel(unit.getLevel()));
        entry.put("xpSpan", unit.getLevel() >= SiegeTuning.MAX_LEVEL ? 0
                : SiegeTuning.xpForLevel(unit.getLevel() + 1) - SiegeTuning.xpForLevel(unit.getLevel()));
        entry.put("xpToNext", SiegeTuning.xpToNext(unit.getXp()));
        return entry;
    }

    /** Every SiegeKnight begins with a revive card and a healing potion in their bag. */
    private void seedStartingKnightBag(SiegeRun run) {
        run.getKnightBag().add("revive-card");
        run.getKnightBag().add("healing-potion");
    }

    /** Credits gold, applying the knight's LOOT passive and the Battlegrounds ×2.5 bonus; returns the amount added. */
    private int earnGold(SiegeRun run, int base) {
        int amount = base;
        if (run.getKnightPassive() == KnightPassive.LOOT) {
            amount = base + Math.round(base * run.getKnightPassiveValue() / 100f);
        }
        // Battlegrounds pays out far more gold than a standard expedition.
        if (run.isBattlegrounds()) {
            amount = SiegeTuning.bgGold(amount);
        }
        run.addGold(amount);
        run.setGoldEarnedTotal(run.getGoldEarnedTotal() + amount);
        run.addScore(amount);
        return amount;
    }

    /** A random Siegeling (1% stage 3, 5% stage 2) joins the warband. */
    private void joinStagedRecruit(SiegeRun run, String flavorSuffix) {
        joinStagedRecruit(run, flavorSuffix, false);
    }

    /**
     * @param afterCombat when true (post-battle wins), always eligible; when false,
     *                    blocks joins until the warband has won at least one fight.
     */
    private void joinStagedRecruit(SiegeRun run, String flavorSuffix, boolean afterCombat) {
        // Battlegrounds: your extracted squad IS the team — free recruit drops are
        // disabled and replaced with a gold windfall of comparable value.
        if (recruitsSuppressed(run)) {
            int g = earnGold(run, SiegeTuning.BG_RECRUIT_GOLD);
            String prior = run.getLastReward();
            run.setLastReward((prior == null || prior.isBlank() ? "" : prior + " ")
                    + "A wandering Siegeling can't join a veteran squad — they leave +" + g + " gold instead.");
            return;
        }
        if (!afterCombat && run.getEnemiesDefeated() <= 0) {
            return;
        }
        List<String> names = run.getParty().stream().map(Combatant::getName).toList();
        content.randomStagedRecruit(names, rng).ifPresent(s -> {
            Combatant member = content.toPartyCombatant(s, run.getParty().size());
            member.setPosition(run.getParty().size());
            applyJoinBonus(run, member);
            run.getParty().add(member);
            run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
            noteDiscovery(run, s.getId());
            int stage = content.stageOf(s);
            String stageNote = stage >= 3 ? " A STAGE 3 joins the cause!" : stage == 2 ? " A stage 2 — lucky!" : "";
            String prior = run.getLastReward();
            run.setLastReward((prior == null || prior.isBlank() ? "" : prior + " ")
                    + s.getName() + flavorSuffix + stageNote);
            queueRecruitReveal(run, s, member);
        });
    }

    /** Queues the gacha-style join reveal the client shows before anything else. */
    private void queueRecruitReveal(SiegeRun run, SieglingCard s, Combatant member) {
        Map<String, Object> reveal = new LinkedHashMap<>();
        reveal.put("name", s.getName());
        reveal.put("element", s.getElement().name());
        reveal.put("artUrl", s.getCardArtUrl());
        reveal.put("stage", content.stageOf(s));
        reveal.put("hp", member.getMaxHp());
        reveal.put("speed", member.getBaseSpeed());
        reveal.put("moveCount", content.moveCount(s));
        run.setPendingRecruit(reveal);
    }

    /** Player acknowledged the join reveal; the run flow resumes. */
    Map<String, Object> recruitAck(String token) {
        SiegeRun run = require(token);
        run.setPendingRecruit(null);
        return serialize(run);
    }

    /** Player acknowledged an interaction outcome popup; clears the banner text. */
    Map<String, Object> resultAck(String token) {
        SiegeRun run = require(token);
        run.setLastReward("");
        return serialize(run);
    }

    Optional<SiegeRun> lookup(String token) {
        if (token == null) return Optional.empty();
        Session session = runs.get(token);
        if (session == null) {
            // Not in memory (e.g. the server restarted): try the checkpoint.
            Optional<SiegeRun> restored = checkpoints.load(token).flatMap(snap -> restoreRun(token, snap));
            if (restored.isEmpty()) return Optional.empty();
            session = new Session(restored.get());
            runs.put(token, session);
        }
        session.lastSeen = Instant.now();
        return Optional.of(session.run);
    }

    Map<String, Object> state(String token) {
        return lookup(token).map(this::serialize)
                .orElseThrow(() -> new IllegalArgumentException("Run not found. Start a new expedition."));
    }

    /**
     * Account-aware state lookup. This also adopts an existing device-local
     * checkpoint the first time its signed-in owner opens it after this change.
     */
    Map<String, Object> state(String token, String authorizationHeader) {
        SiegeRun run = lookup(token)
                .orElseThrow(() -> new IllegalArgumentException("Run not found. Start a new expedition."));
        AccountUser user = resolveUser(authorizationHeader);
        if (user != null && user.getId() != null && !user.getId().isBlank() && run.getOwnerId().isBlank()) {
            run.setOwnerId(user.getId());
            run.setCheckpointSaved(saveCheckpoint(run));
        }
        return serialize(run);
    }

    /**
     * Every active account-owned run, letting a new device recover its token safely.
     * There is one save per {@link RunSlot}, so a player can hold an expedition and a
     * Battlegrounds march at once; {@code runs} carries them all and {@code run} keeps
     * the single-run shape older clients read (the expedition, or the only save there is).
     */
    Map<String, Object> activeRun(String authorizationHeader) {
        AccountUser user = resolveUser(authorizationHeader);
        if (user == null || user.getId() == null || user.getId().isBlank()) return Map.of();
        List<Map<String, Object>> found = new ArrayList<>();
        checkpoints.loadAllForUser(user.getId()).forEach((slot, snapshot) -> {
            String savedToken = str(snapshot.get("token"));
            if (savedToken.isBlank()) return;
            Optional<SiegeRun> restored = lookup(savedToken);
            if (restored.isEmpty() || !user.getId().equals(restored.get().getOwnerId())) return;
            Map<String, Object> serialized = new LinkedHashMap<>(serialize(restored.get()));
            serialized.put("slot", slot.name());
            serialized.put("slotLabel", slot.label());
            found.add(serialized);
        });
        if (found.isEmpty()) return Map.of();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("runs", found);
        out.put("run", found.getFirst());
        return out;
    }

    /** Player chose "start over" on the resume prompt: drop the run and its checkpoint for good. */
    void abandonRun(String token) {
        if (token == null) return;
        SiegeRun run = lookup(token).orElse(null);
        runs.remove(token);
        checkpoints.delete(token);
        if (run != null) checkpoints.deleteForUser(run.getOwnerId(), RunSlot.of(run.getMode()), run.getToken());
    }

    /** Player explicitly requested a durable checkpoint from the run menu. */
    Map<String, Object> saveRun(String token) {
        SiegeRun run = lookup(token)
                .orElseThrow(() -> new IllegalArgumentException("Run not found. Start a new expedition."));
        if (run.getStatus() != RunStatus.ACTIVE) {
            throw new IllegalArgumentException("This expedition has already ended.");
        }
        // Same rule as auto-checkpoint: never persist a finished battle. A WON
        // snapshot lets continueRun re-apply gold/XP after a recycle because the
        // post-continue reward prompt is not itself checkpointed.
        if (run.getBattle() != null && run.getBattle().isOver()) {
            throw new IllegalArgumentException(
                    "Claim victory (or accept defeat) before saving — a finished battle cannot be checkpointed safely.");
        }
        if (!run.getPendingRewards().isEmpty()) {
            throw new IllegalArgumentException("Choose your spoils before saving.");
        }
        run.setCheckpointSaved(saveCheckpoint(run));
        return serialize(run);
    }

    // ---- Checkpoints (save mid-battle and at safe map states; resume later) --

    /**
     * Persists the run — including a live battle, if one is in progress — so
     * closing the app or losing connection mid-fight resumes exactly where it
     * left off. Camp/cache/broker/reward prompts and the cache/event puzzle
     * mini-games are short-lived UI states without their own persisted model, so
     * those are skipped (the last checkpoint before entering them still resumes
     * cleanly — landing on the map with the node uncleared). Finished battles
     * (WON/LOST) are also skipped: a WON snapshot would let {@link #continueRun}
     * re-apply gold/XP/end-rewards after a Cloud Run recycle, because the
     * post-continue reward prompt itself cannot be checkpointed. Deletes the
     * checkpoint once the run ends.
     */
    private void checkpoint(SiegeRun run) {
        if (run.getStatus() != RunStatus.ACTIVE) {
            checkpoints.delete(run.getToken());
            checkpoints.deleteForUser(run.getOwnerId(), RunSlot.of(run.getMode()), run.getToken());
            run.setCheckpointSaved(false);
            return;
        }
        boolean battleOver = run.getBattle() != null && run.getBattle().isOver();
        boolean safe = !battleOver && !run.isInCamp() && !run.isInCache() && !run.isInBroker()
                && !run.isInMinigame() && run.getPendingRewards().isEmpty();
        if (!safe) return;
        run.setCheckpointSaved(saveCheckpoint(run));
    }

    private boolean saveCheckpoint(SiegeRun run) {
        Map<String, Object> snapshot = snapshotRun(run);
        boolean tokenSaved = checkpoints.save(run.getToken(), snapshot);
        boolean accountSaved = run.getOwnerId() == null || run.getOwnerId().isBlank()
                || checkpoints.saveForUser(run.getOwnerId(), RunSlot.of(run.getMode()), snapshot);
        // For signed-in players the account checkpoint is the authoritative
        // cross-device save. Guests continue to use the token checkpoint.
        return run.getOwnerId() == null || run.getOwnerId().isBlank() ? tokenSaved : accountSaved;
    }

    private Map<String, Object> snapshotRun(SiegeRun run) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("version", 1);
        s.put("token", run.getToken());
        s.put("ownerId", run.getOwnerId());
        s.put("knightId", run.getKnightId());
        s.put("gold", run.getGold());
        s.put("mode", run.getMode().name());
        if (run.isBattlegrounds()) {
            s.put("bgTier", run.getBgTier());
            s.put("averageVeteranLevel", run.getAverageVeteranLevel());
            s.put("bgTierScalar", run.getBgTierScalar());
            s.put("boons", new ArrayList<>(run.getBoons()));
            s.put("boonOffer", new ArrayList<>(run.getBoonOffer()));
            s.put("awaitingBoonPick", run.isAwaitingBoonPick());
            s.put("sourceTeamIds", new ArrayList<>(run.getSourceTeamIds()));
        }
        s.put("score", run.getScore());
        s.put("loop", run.getLoop());
        s.put("nodesCleared", run.getNodesCleared());
        s.put("bossKills", run.getBossKills());
        s.put("enemiesDefeated", run.getEnemiesDefeated());
        s.put("goldEarnedTotal", run.getGoldEarnedTotal());
        s.put("currentNodeId", run.getCurrentNodeId());
        if (run.getKnightUnit() != null) {
            s.put("knightHp", run.getKnightUnit().getHp());
            s.put("knightMaxHp", run.getKnightUnit().getMaxHp());
            s.put("knightBaseMaxHp", run.getKnightUnit().getBaseMaxHp());
            s.put("knightLevel", run.getKnightUnit().getLevel());
            s.put("knightXp", run.getKnightUnit().getXp());
        }
        List<Map<String, Object>> party = new ArrayList<>();
        for (Combatant c : run.getParty()) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("id", c.getId());
            p.put("sourceCardId", c.getSourceCardId());
            p.put("hp", c.getHp());
            p.put("maxHp", c.getMaxHp());
            p.put("baseMaxHp", c.getBaseMaxHp());
            p.put("level", c.getLevel());
            p.put("xp", c.getXp());
            p.put("position", c.getPosition());
            p.put("itemId", c.getItemId());
            p.put("baseSpeed", c.getBaseSpeed());
            party.add(p);
        }
        s.put("party", party);
        s.put("discoveredSieglings", new ArrayList<>(run.getDiscoveredSieglingIds()));
        s.put("inventory", new ArrayList<>(run.getInventory()));
        s.put("knightBag", new ArrayList<>(run.getKnightBag()));
        List<Map<String, Object>> deck = new ArrayList<>();
        for (SiegeCard card : run.getDeckTemplates()) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("iid", card.getInstanceId());
            d.put("owner", card.getOwnerId());
            d.put("spec", specToMap(card.getSpec()));
            deck.add(d);
        }
        s.put("deck", deck);
        List<Map<String, Object>> map = new ArrayList<>();
        for (SiegeNode node : run.getMap()) {
            Map<String, Object> n = new LinkedHashMap<>();
            n.put("id", node.getId());
            n.put("row", node.getRow());
            n.put("col", node.getCol());
            n.put("type", node.getType().name());
            n.put("label", node.getLabel());
            n.put("cleared", node.isCleared());
            n.put("next", new ArrayList<>(node.getNext()));
            map.add(n);
        }
        s.put("map", map);
        if (run.getBattle() != null) {
            s.put("battle", snapshotBattle(run.getBattle()));
        }
        return s;
    }

    private Map<String, Object> snapshotBattle(SiegeBattle battle) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("nodeType", battle.getNodeType().name());
        b.put("phase", battle.getPhase().name());
        b.put("actionPoints", battle.getActionPoints());
        b.put("roundNumber", battle.getRoundNumber());
        b.put("playerActsFirst", battle.isPlayerActsFirst());
        b.put("playerSpeed", battle.getPlayerSpeed());
        b.put("enemySpeed", battle.getEnemySpeed());
        b.put("knightCharge", battle.getKnightCharge());
        b.put("leadId", battle.getLeadId());
        b.put("log", new ArrayList<>(battle.getLog()));
        b.put("turnLog", new ArrayList<>(battle.getTurnLog()));
        b.put("killCredit", new LinkedHashMap<>(battle.getKillCredit()));
        List<Map<String, Object>> combatants = new ArrayList<>();
        for (Combatant c : battle.getCombatants()) {
            combatants.add(snapshotCombatant(c));
        }
        b.put("combatants", combatants);
        b.put("deck", snapshotCards(battle.getDeck()));
        b.put("hand", snapshotCards(battle.getHand()));
        b.put("discard", snapshotCards(battle.getDiscard()));
        return b;
    }

    private List<Map<String, Object>> snapshotCards(List<SiegeCard> cards) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (SiegeCard card : cards) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("iid", card.getInstanceId());
            d.put("owner", card.getOwnerId());
            d.put("spec", specToMap(card.getSpec()));
            out.add(d);
        }
        return out;
    }

    private Map<String, Object> snapshotCombatant(Combatant c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getName());
        m.put("element", c.getElement() == null ? null : c.getElement().name());
        m.put("side", c.getSide().name());
        m.put("knight", c.isKnight());
        m.put("artUrl", c.getArtUrl());
        m.put("shadeOf", c.getShadeOf());
        m.put("maxHp", c.getMaxHp());
        m.put("hp", c.getHp());
        m.put("shield", c.getShield());
        m.put("shieldExpiryRound", c.getShieldExpiryRound());
        m.put("battleMaxHpBonus", c.getBattleMaxHpBonus());
        m.put("speed", c.getSpeed());
        m.put("baseSpeed", c.getBaseSpeed());
        m.put("baseMaxHp", c.getBaseMaxHp());
        m.put("level", c.getLevel());
        m.put("xp", c.getXp());
        m.put("attackBuff", c.getAttackBuff());
        m.put("position", c.getPosition());
        m.put("sourceCardId", c.getSourceCardId());
        m.put("artCardId", c.getArtCardId());
        m.put("leader", c.isLeader());
        m.put("itemId", c.getItemId());
        m.put("apSpent", c.getApSpent());
        // Battle evolutions are battle-scoped: without the pre-evolution form the
        // post-battle revert in SiegeCombatEngine#clearBattleBuffs has nothing to
        // walk back to, and a run resumed mid-battle would keep the evolved form
        // permanently. The chain is at most two links deep (stage 1 → 2 → 3).
        if (c.getEvolvedFrom() != null) {
            m.put("evolvedFrom", snapshotCombatant(c.getEvolvedFrom()));
        }
        Map<String, Integer> statuses = new LinkedHashMap<>();
        c.getStatuses().forEach((k, v) -> statuses.put(k.name(), v));
        m.put("statuses", statuses);
        List<Map<String, Object>> abilities = new ArrayList<>();
        for (AbilitySpec spec : c.getAbilities()) abilities.add(specToMap(spec));
        m.put("abilities", abilities);
        m.put("intent", c.getIntent() == null ? null : specToMap(c.getIntent()));
        m.put("intentPosition", c.getIntentPosition());
        return m;
    }

    @SuppressWarnings("unchecked")
    private SiegeBattle restoreBattle(Map<String, Object> b) {
        SiegeBattle battle = new SiegeBattle(NodeType.valueOf(String.valueOf(b.get("nodeType"))));
        battle.setPhase(BattlePhase.valueOf(String.valueOf(b.get("phase"))));
        battle.setActionPoints(intVal(b.get("actionPoints"), SiegeBattle.ACTIONS_PER_TURN));
        battle.setRoundNumber(intVal(b.get("roundNumber"), 0));
        battle.setPlayerActsFirst(!Boolean.FALSE.equals(b.get("playerActsFirst")));
        battle.setPlayerSpeed(intVal(b.get("playerSpeed"), 0));
        battle.setEnemySpeed(intVal(b.get("enemySpeed"), 0));
        battle.setKnightCharge(intVal(b.get("knightCharge"), 0));
        battle.setLeadId(b.get("leadId") == null ? null : String.valueOf(b.get("leadId")));
        for (Object line : (List<Object>) b.getOrDefault("log", List.of())) {
            battle.log(String.valueOf(line));
        }
        for (Object entry : (List<Object>) b.getOrDefault("turnLog", List.of())) {
            battle.getTurnLog().add((Map<String, Object>) entry);
        }
        Object killCredit = b.get("killCredit");
        if (killCredit instanceof Map) {
            ((Map<String, Object>) killCredit).forEach((k, v) -> battle.getKillCredit().put(k, intVal(v, 0)));
        }
        for (Object c : (List<Object>) b.getOrDefault("combatants", List.of())) {
            battle.getCombatants().add(restoreCombatant((Map<String, Object>) c));
        }
        for (Object d : (List<Object>) b.getOrDefault("deck", List.of())) battle.getDeck().add(restoreSiegeCard((Map<String, Object>) d));
        for (Object d : (List<Object>) b.getOrDefault("hand", List.of())) battle.getHand().add(restoreSiegeCard((Map<String, Object>) d));
        for (Object d : (List<Object>) b.getOrDefault("discard", List.of())) battle.getDiscard().add(restoreSiegeCard((Map<String, Object>) d));
        return battle;
    }

    private SiegeCard restoreSiegeCard(Map<String, Object> d) {
        return new SiegeCard(String.valueOf(d.get("iid")), String.valueOf(d.get("owner")),
                specFromMap((Map<String, Object>) d.get("spec")));
    }

    @SuppressWarnings("unchecked")
    private Combatant restoreCombatant(Map<String, Object> m) {
        Element element = m.get("element") == null ? null : Element.valueOf(String.valueOf(m.get("element")));
        Side side = Side.valueOf(String.valueOf(m.get("side")));
        boolean knight = Boolean.TRUE.equals(m.get("knight"));
        int baseSpeed = intVal(m.get("baseSpeed"), 1);
        int snapMaxHp = intVal(m.get("maxHp"), 1);
        int snapHp = intVal(m.get("hp"), snapMaxHp);
        Combatant c = new Combatant(String.valueOf(m.get("id")), String.valueOf(m.get("name")), element, side,
                snapMaxHp, baseSpeed,
                m.get("artUrl") == null ? null : String.valueOf(m.get("artUrl")), knight);
        // Leveling first: set the pre-level base, then load XP (re-derives level and
        // rescales max HP from base — never compounds). HP is applied afterwards.
        c.setBaseMaxHp(intVal(m.get("baseMaxHp"), snapMaxHp));
        c.loadLeveling(intVal(m.get("xp"), 0));
        // A health_boost widens max HP for the battle, so it has to be back in place
        // before HP is applied or the snapshotted HP clamps down to the unboosted max.
        c.setBattleMaxHpBonus(intVal(m.get("battleMaxHpBonus"), 0));
        c.setHp(snapHp);
        c.setShield(intVal(m.get("shield"), 0));
        c.setShieldExpiryRound(intVal(m.get("shieldExpiryRound"), 0));
        c.setSpeed(intVal(m.get("speed"), baseSpeed));
        c.addAttackBuff(intVal(m.get("attackBuff"), 0));
        c.setPosition(intVal(m.get("position"), -1));
        c.setSourceCardId(m.get("sourceCardId") == null ? null : String.valueOf(m.get("sourceCardId")));
        // Without this a run resumed mid-battle keeps the shade's art and "Shade of X"
        // name but loses the badge, so the same foe renders differently after a reload.
        c.setShadeOf(m.get("shadeOf") == null ? null : String.valueOf(m.get("shadeOf")));
        // Same reason, for size: a resumed boss without this shrinks back to stage-1 art.
        c.setArtCardId(m.get("artCardId") == null ? null : String.valueOf(m.get("artCardId")));
        // And for the squad badge: a resumed boss would otherwise read as one of its
        // own minions.
        c.setLeader(Boolean.TRUE.equals(m.get("leader")));
        if (m.get("itemId") != null) c.setItemId(String.valueOf(m.get("itemId")));
        c.setApSpent(intVal(m.get("apSpent"), 0));
        if (m.get("evolvedFrom") instanceof Map) {
            // Battle evolutions set max HP from the evolved form's formula and only
            // copy level/XP (no applyLevel). loadLeveling above would re-scale that
            // already-elevated pool — honour the snapshotted HP instead.
            c.setEvolvedFrom(restoreCombatant((Map<String, Object>) m.get("evolvedFrom")));
            c.setMaxHp(snapMaxHp);
            c.setHp(snapHp);
        }
        Object statuses = m.get("statuses");
        if (statuses instanceof Map) {
            ((Map<String, Object>) statuses).forEach((k, v) -> c.applyStatus(StatusKind.valueOf(k), intVal(v, 1)));
        }
        Object abilities = m.get("abilities");
        if (abilities instanceof List) {
            for (Object a : (List<Object>) abilities) c.getAbilities().add(specFromMap((Map<String, Object>) a));
        }
        Object intent = m.get("intent");
        if (intent instanceof Map) {
            c.setIntent(specFromMap((Map<String, Object>) intent));
        }
        c.setIntentPosition(intVal(m.get("intentPosition"), -1));
        return c;
    }

    private Map<String, Object> specToMap(AbilitySpec spec) {
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
        return s;
    }

    @SuppressWarnings("unchecked")
    private Optional<SiegeRun> restoreRun(String token, Map<String, Object> s) {
        try {
            TrainerCard knight = content.findKnight(String.valueOf(s.get("knightId"))).orElse(null);
            if (knight == null) return Optional.empty();
            SiegeRun run = new SiegeRun(token);
            run.setOwnerId(str(s.get("ownerId")));
            run.setKnightId(knight.getId());
            run.setKnightName(knight.getName());
            run.setKnightElement(knight.getElement());
            run.setKnightActive(content.knightActiveSpec(knight));
            run.setKnightPassiveDesc(content.knightPassiveDescription(knight));
            KnightPassive passive = content.knightPassiveKind(knight);
            run.setKnightPassive(passive);
            run.setKnightPassiveValue(content.knightPassiveValue(passive));
            Combatant knightUnit = content.toKnightCombatant(knight);
            // Restore the pre-level base then load XP (re-derives level + rescales HP).
            knightUnit.setBaseMaxHp(intVal(s.get("knightBaseMaxHp"), knightUnit.getBaseMaxHp()));
            knightUnit.loadLeveling(intVal(s.get("knightXp"), 0));
            knightUnit.setHp(intVal(s.get("knightHp"), knightUnit.getMaxHp()));
            run.setKnightUnit(knightUnit);
            run.setGold(intVal(s.get("gold"), 0));
            String modeName = String.valueOf(s.get("mode"));
            RunMode mode = "ENDLESS".equals(modeName) ? RunMode.ENDLESS
                    : "BATTLEGROUNDS".equals(modeName) ? RunMode.BATTLEGROUNDS : RunMode.STANDARD;
            run.setMode(mode);
            if (mode == RunMode.BATTLEGROUNDS) {
                run.setBgTier(intVal(s.get("bgTier"), 1));
                run.setAverageVeteranLevel(intVal(s.get("averageVeteranLevel"), 0));
                run.setBgTierScalar(s.get("bgTierScalar") instanceof Number sc
                        ? sc.doubleValue() : SiegeTuning.bgTierScalar(run.getBgTier()));
                if (s.get("boons") instanceof List<?> bl) {
                    for (Object b : bl) run.getBoons().add(String.valueOf(b));
                }
                if (s.get("boonOffer") instanceof List<?> bo) {
                    for (Object b : bo) run.getBoonOffer().add(String.valueOf(b));
                }
                run.setAwaitingBoonPick(Boolean.TRUE.equals(s.get("awaitingBoonPick")));
                if (s.get("sourceTeamIds") instanceof List<?> tl) {
                    for (Object t : tl) run.getSourceTeamIds().add(String.valueOf(t));
                }
            }
            run.setScore(intVal(s.get("score"), 0));
            run.setLoop(intVal(s.get("loop"), 0));
            run.setNodesCleared(intVal(s.get("nodesCleared"), 0));
            run.setBossKills(intVal(s.get("bossKills"), 0));
            run.setEnemiesDefeated(intVal(s.get("enemiesDefeated"), 0));
            run.setGoldEarnedTotal(intVal(s.get("goldEarnedTotal"), 0));
            run.setCurrentNodeId(intVal(s.get("currentNodeId"), -1));
            if (s.get("inventory") instanceof List) {
                for (Object it : (List<Object>) s.get("inventory")) run.getInventory().add(String.valueOf(it));
            }
            // Resuming must not forget what the run already found — those unlocks
            // are only banked when it ends.
            if (s.get("discoveredSieglings") instanceof List) {
                for (Object it : (List<Object>) s.get("discoveredSieglings")) {
                    run.getDiscoveredSieglingIds().add(String.valueOf(it));
                }
            }
            if (s.get("knightBag") instanceof List) {
                for (Object it : (List<Object>) s.get("knightBag")) run.getKnightBag().add(String.valueOf(it));
            }

            for (Map<String, Object> p : (List<Map<String, Object>>) s.get("party")) {
                String sourceId = String.valueOf(p.get("sourceCardId"));
                SieglingCard src = content.findAnySiegling(sourceId).orElse(null);
                if (src == null) return Optional.empty(); // catalog changed under us
                int innateHp = 18 + src.getHealth() * 4;
                // baseMaxHp is the pre-level base; legacy snapshots (pre-leveling) fall
                // back to the innate formula and restore as level 1.
                int baseMaxHp = intVal(p.get("baseMaxHp"), intVal(p.get("maxHp"), innateHp));
                Combatant m = new Combatant(String.valueOf(p.get("id")), src.getName(), src.getElement(),
                        Side.PLAYER, baseMaxHp, Math.max(4, src.getSpeed()), src.getCardArtUrl());
                m.setSourceCardId(sourceId);
                m.setBaseSpeed(intVal(p.get("baseSpeed"), Math.max(4, src.getSpeed())));
                m.setBaseMaxHp(baseMaxHp);
                m.loadLeveling(intVal(p.get("xp"), 0)); // re-derives level, rescales max HP from base
                m.setHp(intVal(p.get("hp"), m.getMaxHp()));
                m.setPosition(intVal(p.get("position"), run.getParty().size()));
                if (p.get("itemId") != null) m.setItemId(String.valueOf(p.get("itemId")));
                run.getParty().add(m);
            }
            for (Map<String, Object> d : (List<Map<String, Object>>) s.get("deck")) {
                run.getDeckTemplates().add(new SiegeCard(String.valueOf(d.get("iid")),
                        String.valueOf(d.get("owner")), specFromMap((Map<String, Object>) d.get("spec"))));
            }
            for (Map<String, Object> n : (List<Map<String, Object>>) s.get("map")) {
                SiegeNode node = new SiegeNode(intVal(n.get("id"), 0), intVal(n.get("row"), 0),
                        intVal(n.get("col"), 0), NodeType.valueOf(String.valueOf(n.get("type"))),
                        String.valueOf(n.get("label")));
                node.setCleared(Boolean.TRUE.equals(n.get("cleared")));
                for (Object next : (List<Object>) n.get("next")) {
                    node.getNext().add(intVal(next, 0));
                }
                run.getMap().add(node);
            }

            // A live battle takes precedence over the idle party/knight HP above —
            // its combatants ARE the party/knight instances (same objects the
            // combat engine mutates), so restoring it keeps every stat (shield,
            // statuses, position, hand/deck/discard, enemy intents) exact.
            if (s.get("battle") instanceof Map) {
                SiegeBattle battle = restoreBattle((Map<String, Object>) s.get("battle"));
                run.setBattle(battle);
                List<Combatant> restoredParty = new ArrayList<>();
                Combatant restoredKnight = null;
                for (Combatant c : battle.getCombatants()) {
                    if (c.getSide() != Side.PLAYER) continue;
                    if (c.isKnight()) restoredKnight = c; else restoredParty.add(c);
                }
                restoredParty.sort((x, y) -> Integer.compare(x.getPosition(), y.getPosition()));
                run.getParty().clear();
                run.getParty().addAll(restoredParty);
                if (restoredKnight != null) run.setKnightUnit(restoredKnight);
            }

            run.setCheckpointSaved(true);
            run.setLastReward("Welcome back — the expedition resumes from your last checkpoint.");
            return Optional.of(run);
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    private AbilitySpec specFromMap(Map<String, Object> s) {
        Object statusName = s.get("status");
        return new AbilitySpec(
                String.valueOf(s.get("id")),
                String.valueOf(s.get("name")),
                s.get("element") == null ? null : Element.valueOf(String.valueOf(s.get("element"))),
                Effect.valueOf(String.valueOf(s.get("effect"))),
                intVal(s.get("value"), 0),
                TargetKind.valueOf(String.valueOf(s.get("target"))),
                intVal(s.get("cost"), 1),
                s.get("desc") == null ? "" : String.valueOf(s.get("desc")),
                statusName == null ? null : StatusKind.valueOf(String.valueOf(statusName)),
                intVal(s.get("statusChance"), 0));
    }

    private int intVal(Object value, int fallback) {
        return value instanceof Number n ? n.intValue() : fallback;
    }

    /** Travels to a reachable map node: starts a battle or resolves a rest/treasure stop. */
    Map<String, Object> enterNode(String token, int nodeId) {
        SiegeRun run = require(token);
        if (run.getStatus() != RunStatus.ACTIVE) return serialize(run);
        if (run.getBattle() != null && !run.getBattle().isOver()) return serialize(run); // battle already live
        if (!run.getPendingRewards().isEmpty()) {
            throw new IllegalArgumentException("Choose a reward before moving on.");
        }
        if (!run.reachableNodeIds().contains(nodeId)) {
            throw new IllegalArgumentException("That node is not on a path you can reach.");
        }
        SiegeNode node = run.nodeById(nodeId);
        run.setCurrentNodeId(nodeId);
        run.setLastReward("");
        run.setBossReveal(null); // the boss reveal is a one-shot; travelling dismisses it

        if (node.isBattle()) {
            startNodeBattle(run, node, node.getType(), false);
        } else if (node.getType() == NodeType.REST) {
            openCamp(run);
        } else if (node.getType() == NodeType.TREASURE) {
            openCache(run);
        } else if (node.getType() == NodeType.BROKER) {
            openBroker(run);
        } else if (node.getType() == NodeType.SMITH) {
            openSmith(run);
        } else if (node.getType() == NodeType.CARAVAN) {
            openCaravan(run);
        } else if (node.getType() == NodeType.EVENT) {
            openEvent(run);
        } else {
            node.setCleared(true);
            checkpoint(run);
        }
        return serialize(run);
    }

    /** Generates and starts a battle at the current node, optionally as an ambush. */
    private void startNodeBattle(SiegeRun run, SiegeNode node, NodeType battleType, boolean ambush) {
        List<Element> palette = elementPaletteFor(run);
        int segment = SiegeContentService.segmentOf(node.getRow());
        int effFloor = node.getRow() % SiegeContentService.SEGMENT_ROWS + 1
                + segment * 4 + run.getLoop() * 4;
        int partySize = (int) run.getParty().stream().filter(Combatant::isAlive).count()
                + (run.getMercenary() != null ? 1 : 0);
        // Battlegrounds scales enemies off the squad's average veteran level (+8% HP,
        // +5% damage per level), on top of the tier scalar seam. 1.0/1.0 elsewhere.
        double bgHp = run.isBattlegrounds()
                ? SiegeTuning.bgEnemyHpScalar(run.getAverageVeteranLevel(), run.getBgTierScalar()) : 1.0;
        double bgDmg = run.isBattlegrounds()
                ? SiegeTuning.bgEnemyDamageScalar(run.getAverageVeteranLevel(), run.getBgTierScalar()) : 1.0;
        // The run's opening fight is a fixed yardstick — same foe for every warband,
        // so the difficulty curve starts from one known point instead of moving with
        // the starting party size. Everything after it scales as usual. Row 0 is
        // always a BATTLE and cleared before any event can ambush you, so
        // "no fight won yet" identifies exactly that first encounter; Battlegrounds
        // opts out because its whole premise is enemies scaled to veteran squads.
        boolean openingFight = run.getEnemiesDefeated() == 0
                && battleType == NodeType.BATTLE
                && !run.isBattlegrounds();
        List<Combatant> enemies = openingFight
                ? content.generateOpeningEnemies(rng, palette)
                : content.generateEnemies(battleType, effFloor,
                        Math.max(1, partySize), segment + run.getLoop(), rng, palette, bgHp, bgDmg);
        if (ambush) {
            // Ambush: enemies get the drop on you — extra shield, bite, and haste.
            for (Combatant foe : enemies) {
                foe.addShield(6, SiegeCombatEngine.BATTLE_START_SHIELD_EXPIRY);
                foe.addAttackBuff(3);
                foe.setSpeed(foe.getSpeed() + 6);
            }
        }
        engine.startBattle(run, battleType, enemies, rng);
        if (ambush && run.getBattle() != null) run.getBattle().log("Ambush! The enemy struck first.");
    }

    // ---- Broker stall (recruit or swap Siegelings for gold) ----------------

    private static final int MERC_RENT_COST = 55;
    private static final int BROKER_HIRE_COST = 45;
    private static final int BROKER_SWAP_COST = 25;

    /**
     * Opens a broker stall. If the warband has room, Siegelings are for sale to
     * add or swap; if it is already full (3), only mercenary rentals are offered.
     */
    private void openBroker(SiegeRun run) {
        run.setInBroker(true);
        run.getBrokerOptions().clear();
        int oid = 0;
        boolean full = run.getParty().size() >= content.partyMax();
        if (full) {
            for (SieglingCard s : content.mercOffers(2, rng)) {
                run.getBrokerOptions().add(CampOption.merc("b" + (oid++), s.getName(), s.getElement(),
                        s.getCardArtUrl(), s.getId(), MERC_RENT_COST));
            }
        } else {
            List<String> names = run.getParty().stream().map(Combatant::getName).toList();
            for (SieglingCard s : content.randomRecruits(3, names, rng)) {
                run.getBrokerOptions().add(CampOption.broker("b" + (oid++), s.getName(), s.getElement(),
                        s.getCardArtUrl(), s.getId(), BROKER_HIRE_COST));
            }
            // One mercenary is always available as an alternative.
            for (SieglingCard s : content.mercOffers(1, rng)) {
                run.getBrokerOptions().add(CampOption.merc("b" + (oid++), s.getName(), s.getElement(),
                        s.getCardArtUrl(), s.getId(), MERC_RENT_COST));
            }
        }
    }

    /**
     * Hires a broker Siegeling. With {@code replaceId} it swaps in for that
     * party member (cheaper — the member is released and its cards leave the
     * deck); without it the recruit joins an open warband slot.
     */
    Map<String, Object> brokerHire(String token, String optionId, String replaceId) {
        SiegeRun run = require(token);
        if (!run.isInBroker()) throw new IllegalArgumentException("There is no broker here.");
        CampOption pick = run.getBrokerOptions().stream()
                .filter(o -> o.id.equals(optionId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown broker offer."));
        if (pick.used) throw new IllegalArgumentException("That offer has already been taken.");
        if (run.getGold() < pick.cost) throw new IllegalArgumentException("Not enough gold.");

        if ("MERC".equals(pick.kind)) {
            if (run.getMercenary() != null) throw new IllegalArgumentException("A mercenary is already under contract.");
            SieglingCard s = content.findAnySiegling(pick.sieglingId)
                    .orElseThrow(() -> new IllegalArgumentException("That mercenary is gone."));
            run.addGold(-pick.cost);
            Combatant merc = content.toMercCombatant(s);
            run.setMercenary(merc);
            run.getMercCards().clear();
            run.getMercCards().addAll(content.mercBoonCards(merc, s));
            run.setLastReward(merc.getName() + " is under contract — it fights your NEXT battle with boon cards, then departs.");
            pick.used = true;
            return serialize(run);
        }

        // Siegeling hire (add to an open slot) or swap (release a current member).
        SieglingCard s = content.findSiegling(pick.sieglingId)
                .orElseThrow(() -> new IllegalArgumentException("That Siegeling is gone."));
        boolean swap = replaceId != null && !replaceId.isBlank() && !"null".equals(replaceId);
        if (!swap && run.getParty().size() >= content.partyMax()) {
            throw new IllegalArgumentException("The warband is full — swap a member or rent a mercenary instead.");
        }
        int cost = swap ? BROKER_SWAP_COST : BROKER_HIRE_COST;
        if (run.getGold() < cost) throw new IllegalArgumentException("Not enough gold.");
        run.addGold(-cost);
        if (swap) {
            Combatant leaving = run.getParty().stream()
                    .filter(m -> m.getId().equals(replaceId)).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Unknown party member to swap out."));
            int position = leaving.getPosition();
            if (leaving.getItemId() != null) run.getInventory().add(leaving.getItemId()); // keep their gear
            run.getParty().remove(leaving);
            run.getDeckTemplates().removeIf(c -> c.getOwnerId().equals(leaving.getId()));
            Combatant member = content.toPartyCombatant(s, run.getParty().size());
            member.setPosition(position >= 0 ? position : run.getParty().size());
            applyJoinBonus(run, member);
            run.getParty().add(member);
            run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
            noteDiscovery(run, s.getId());
            run.setLastReward(s.getName() + " joins the warband — " + leaving.getName() + " returns to the broker.");
            queueRecruitReveal(run, s, member);
        } else {
            Combatant member = content.toPartyCombatant(s, run.getParty().size());
            member.setPosition(run.getParty().size());
            applyJoinBonus(run, member);
            run.getParty().add(member);
            run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
            noteDiscovery(run, s.getId());
            run.setLastReward(s.getName() + " joined the warband!");
            queueRecruitReveal(run, s, member);
        }
        pick.used = true;
        return serialize(run);
    }

    /** Leaves the broker stall; the node is spent. */
    Map<String, Object> brokerLeave(String token) {
        SiegeRun run = require(token);
        if (!run.isInBroker()) return serialize(run);
        run.setInBroker(false);
        run.getBrokerOptions().clear();
        SiegeNode node = run.currentNode();
        if (node != null) node.setCleared(true);
        checkpoint(run);
        return serialize(run);
    }

    // ---- Rest Camp (interactive stop: fire, trader, broker) ---------------

    /** Sets up camp: resting is free; a trader and/or Siegeling broker may be there. */
    private void openCamp(SiegeRun run) {
        run.setInCamp(true);
        run.getCampOptions().clear();
        int oid = 0;
        run.getCampOptions().add(CampOption.rest("c" + (oid++)));

        // Fallen Siegelings can be revived here for gold: half strength or full.
        for (Combatant member : run.getParty()) {
            if (!member.isAlive()) {
                run.getCampOptions().add(CampOption.revive("c" + (oid++), member.getId(), member.getName(), 50, 35));
                run.getCampOptions().add(CampOption.revive("c" + (oid++), member.getId(), member.getName(), 100, 70));
            }
        }

        boolean trader = rng.nextInt(100) < 65;
        boolean broker = rng.nextInt(100) < 45 && run.getParty().size() < content.partyMax();

        if (trader) {
            List<Combatant> living = run.getParty().stream().filter(Combatant::isAlive).toList();
            if (!living.isEmpty()) {
                for (int i = 0; i < 2; i++) {
                    Combatant owner = living.get(rng.nextInt(living.size()));
                    AbilitySpec spec = content.randomCardRewardFor(owner.getElement(), rng);
                    run.getCampOptions().add(CampOption.shopCard("c" + (oid++), spec, owner.getId(), owner.getName(), 25));
                }
            }
            run.getCampOptions().add(CampOption.shopHeal("c" + (oid++), 15));
            if (!run.getDeckTemplates().isEmpty()) {
                int idx = rng.nextInt(run.getDeckTemplates().size());
                AbilitySpec spec = run.getDeckTemplates().get(idx).getSpec();
                run.getCampOptions().add(CampOption.shopUpgrade("c" + (oid++), spec.name(), spec.element(), idx, 20));
            }
        }
        if (broker) {
            List<String> names = run.getParty().stream().map(Combatant::getName).toList();
            String brokerId = "c" + oid;
            content.randomRecruit(names, rng).ifPresent(s ->
                    run.getCampOptions().add(CampOption.broker(brokerId, s.getName(), s.getElement(),
                            s.getCardArtUrl(), s.getId(), 45)));
        }

        run.setCampNote(trader && broker ? "A wandering trader and a Siegeling broker share your fire tonight."
                : trader ? "A wandering trader has set up shop by the fire."
                : broker ? "A Siegeling broker warms their hands at your fire."
                : "A quiet night. The fire crackles; the warband rests easy.");
    }

    /** Uses one camp interaction (each option once; goods cost gold). */
    Map<String, Object> campChoose(String token, String optionId) {
        SiegeRun run = require(token);
        if (!run.isInCamp()) throw new IllegalArgumentException("The party is not camped.");
        CampOption pick = run.getCampOptions().stream()
                .filter(o -> o.id.equals(optionId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown camp option."));
        if (pick.used) throw new IllegalArgumentException("Already used this stop.");
        if (run.getGold() < pick.cost) throw new IllegalArgumentException("Not enough gold.");

        switch (pick.kind) {
            case "REST" -> {
                int healed = 0;
                for (Combatant ally : run.getParty()) {
                    if (ally.isAlive()) {
                        int before = ally.getHp();
                        ally.setHp(before + (int) Math.round(ally.getMaxHp() * 0.4));
                        healed += ally.getHp() - before;
                    }
                }
                if (run.getKnightUnit() != null && run.getKnightUnit().isAlive()) {
                    int before = run.getKnightUnit().getHp();
                    run.getKnightUnit().setHp(before + (int) Math.round(run.getKnightUnit().getMaxHp() * 0.4));
                    healed += run.getKnightUnit().getHp() - before;
                }
                run.setLastReward("The party rests: +" + healed + " HP.");
            }
            case "SHOP_HEAL" -> {
                run.addGold(-pick.cost);
                int healed = 0;
                for (Combatant ally : run.getParty()) {
                    if (ally.isAlive()) {
                        int before = ally.getHp();
                        ally.setHp(before + (int) Math.round(ally.getMaxHp() * 0.25));
                        healed += ally.getHp() - before;
                    }
                }
                run.setLastReward("Hot stew! The party recovers " + healed + " HP.");
            }
            case "SHOP_CARD" -> {
                run.addGold(-pick.cost);
                run.getDeckTemplates().add(new SiegeCard(
                        "camp-" + pick.id + "-" + run.getDeckTemplates().size(), pick.ownerId, pick.cardSpec));
                run.setLastReward("Bought " + pick.cardSpec.name() + " for the deck.");
            }
            case "SHOP_UPGRADE" -> {
                run.addGold(-pick.cost);
                int idx = pick.templateIndex;
                if (idx >= 0 && idx < run.getDeckTemplates().size()) {
                    SiegeCard old = run.getDeckTemplates().get(idx);
                    AbilitySpec upgraded = content.upgradeSpec(old.getSpec());
                    run.getDeckTemplates().set(idx, new SiegeCard(old.getInstanceId(), old.getOwnerId(), upgraded));
                    run.setLastReward(old.getSpec().name() + " was honed into " + upgraded.name() + ".");
                }
            }
            case "REVIVE50", "REVIVE100" -> {
                run.addGold(-pick.cost);
                Combatant fallen = run.getParty().stream()
                        .filter(mb -> mb.getId().equals(pick.ownerId) && !mb.isAlive()).findFirst().orElse(null);
                if (fallen != null) {
                    int pct = "REVIVE100".equals(pick.kind) ? 100 : 50;
                    fallen.setHp(Math.max(1, (int) Math.round(fallen.getMaxHp() * (pct / 100.0))));
                    run.setLastReward(fallen.getName() + " rises again at " + pct + "% strength!");
                    // Both revive tiers for this member are spent together.
                    for (CampOption o : run.getCampOptions()) {
                        if (pick.ownerId != null && pick.ownerId.equals(o.ownerId)) o.used = true;
                    }
                }
            }
            case "BROKER" -> {
                run.addGold(-pick.cost);
                content.findSiegling(pick.sieglingId).ifPresent(s -> {
                    Combatant member = content.toPartyCombatant(s, run.getParty().size());
                    member.setPosition(run.getParty().size());
                    applyJoinBonus(run, member);
                    run.getParty().add(member);
                    run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
                    noteDiscovery(run, s.getId());
                    run.setLastReward(s.getName() + " joined the warband!");
                    queueRecruitReveal(run, s, member);
                });
            }
            default -> { }
        }
        pick.used = true;
        return serialize(run);
    }

    /** Breaks camp: the stop is spent and the map opens up again. */
    Map<String, Object> campLeave(String token) {
        SiegeRun run = require(token);
        if (!run.isInCamp()) return serialize(run);
        run.setInCamp(false);
        run.getCampOptions().clear();
        SiegeNode node = run.currentNode();
        if (node != null) node.setCleared(true);
        checkpoint(run);
        return serialize(run);
    }

    // ---- Cache dig minigame (press your luck) ------------------------------

    private static final int CACHE_MAX_DIGS = 4;

    private void openCache(SiegeRun run) {
        run.setInCache(true);
        run.setCacheDigs(0);
        run.setCacheGold(6 + rng.nextInt(6));
        run.setLastReward("");
        run.getCacheOptions().clear();
        // Six cache flavours: three press-your-luck games and three puzzles.
        int roll = rng.nextInt(100);
        if (roll < 24) {
            run.setCacheGame("DIG");
        } else if (roll < 45) {
            run.setCacheGame("CHESTS");
            for (int i = 0; i < 3; i++) {
                run.getCacheOptions().add(CampOption.cache("ch" + i, "CHEST",
                        "Battered chest #" + (i + 1), "Something rattles inside… pick one chest.", 0));
            }
        } else if (roll < 66) {
            run.setCacheGame("WHEEL");
            run.getCacheOptions().add(CampOption.cache("spin", "WHEEL_SPIN",
                    "Spin the Wheel of Spoils", "Stake 15 gold: it returns x0, x1, x2 or x3.", 15));
            run.getCacheOptions().add(CampOption.cache("walk", "WHEEL_LEAVE",
                    "Pocket the loose coins", "Take a safe 10 gold and move on.", 0));
        } else {
            // The remaining third rolls one of the three puzzle mini-games instead.
            run.setInCache(false);
            openPuzzleMinigame(run, rollPuzzleType(), "Buried Cache", "💎",
                    "The cache is sealed by an old warden's puzzle — solve it for the loot.");
        }
    }

    /** Resolves a CHESTS / WHEEL cache pick; the cache closes afterwards. */
    Map<String, Object> cacheChoose(String token, String optionId) {
        SiegeRun run = require(token);
        if (!run.isInCache()) throw new IllegalArgumentException("No cache here.");
        CampOption pick = run.getCacheOptions().stream()
                .filter(o -> o.id.equals(optionId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown cache option."));
        if (pick.used) throw new IllegalArgumentException("Already taken.");
        if (run.getGold() < pick.cost) throw new IllegalArgumentException("Not enough gold.");

        switch (pick.kind) {
            case "CHEST" -> {
                int roll = rng.nextInt(100);
                if (roll < 40) {
                    int gold = earnGold(run, 20 + rng.nextInt(21));
                    run.setLastReward("The chest spills " + gold + " gold!");
                } else if (roll < 65) {
                    List<Combatant> living = run.getParty().stream().filter(Combatant::isAlive).toList();
                    if (!living.isEmpty()) {
                        Combatant lucky = living.get(rng.nextInt(living.size()));
                        lucky.addBaseMaxHp(5);
                        run.setLastReward("A growth elixir! " + lucky.getName() + " gains +5 max HP.");
                    }
                } else if (roll < 85) {
                    int healed = 0;
                    for (Combatant ally : run.getParty()) {
                        if (ally.isAlive()) {
                            int before = ally.getHp();
                            ally.setHp(before + (int) Math.round(ally.getMaxHp() * 0.25));
                            healed += ally.getHp() - before;
                        }
                    }
                    run.setLastReward("Medical supplies! The party recovers " + healed + " HP.");
                } else {
                    for (Combatant ally : run.getParty()) {
                        if (ally.isAlive()) ally.takeDamage(5);
                    }
                    run.setLastReward("A trapped chest! The blast singes the party for 5.");
                }
            }
            case "WHEEL_SPIN" -> {
                run.addGold(-pick.cost);
                int roll = rng.nextInt(100);
                int mult = roll < 25 ? 0 : roll < 50 ? 1 : roll < 85 ? 2 : 3;
                if (mult > 0) {
                    int winnings = earnGold(run, pick.cost * mult);
                    run.setLastReward("The wheel lands on x" + mult + " — " + winnings + " gold!");
                } else {
                    run.setLastReward("The wheel lands on x0. The stake is gone.");
                }
            }
            case "WHEEL_LEAVE" -> {
                int gold = earnGold(run, 10);
                run.setLastReward("Pocketed " + gold + " loose gold.");
            }
            default -> { }
        }
        pick.used = true;
        run.setInCache(false);
        run.getCacheOptions().clear();
        SiegeNode node = run.currentNode();
        if (node != null) node.setCleared(true);
        checkpoint(run);
        return serialize(run);
    }

    private int cacheBustChance(SiegeRun run) {
        return Math.min(85, 15 + run.getCacheDigs() * 20);
    }

    /** Digs deeper: more loot, or the cache collapses and unbanked gold is lost. */
    Map<String, Object> cacheDig(String token) {
        SiegeRun run = require(token);
        if (!run.isInCache()) throw new IllegalArgumentException("No cache to dig.");
        int bust = cacheBustChance(run);
        if (rng.nextInt(100) < bust) {
            run.setInCache(false);
            run.setCacheGold(0);
            SiegeNode node = run.currentNode();
            if (node != null) node.setCleared(true);
            run.setLastReward("The cache collapses! The unbanked loot is buried…");
            checkpoint(run);
            return serialize(run);
        }
        run.setCacheDigs(run.getCacheDigs() + 1);
        int roll = rng.nextInt(100);
        if (roll < 60) {
            int found = 8 + rng.nextInt(8);
            run.setCacheGold(run.getCacheGold() + found);
            run.setLastReward("Dug up " + found + " gold — bank it or dig deeper?");
        } else if (roll < 85) {
            List<Combatant> living = run.getParty().stream().filter(Combatant::isAlive).toList();
            if (!living.isEmpty()) {
                Combatant lucky = living.get(rng.nextInt(living.size()));
                lucky.addBaseMaxHp(3);
                run.setLastReward("An ancient tonic! " + lucky.getName() + " gains +3 max HP (kept even on a bust).");
            }
        } else {
            List<Combatant> living = run.getParty().stream().filter(Combatant::isAlive).toList();
            if (!living.isEmpty()) {
                Combatant owner = living.get(rng.nextInt(living.size()));
                AbilitySpec find = content.randomCardRewardFor(owner.getElement(), rng);
                run.getDeckTemplates().add(new SiegeCard(
                        "cache-" + run.getDeckTemplates().size(), owner.getId(), find));
                run.setLastReward("A buried technique! " + owner.getName() + " learns " + find.name() + " (kept even on a bust).");
            }
        }
        // The floor gives way after enough digging: bank automatically.
        if (run.getCacheDigs() >= CACHE_MAX_DIGS) {
            return cacheTake(token);
        }
        return serialize(run);
    }

    /** Banks the loot and seals the cache. */
    Map<String, Object> cacheTake(String token) {
        SiegeRun run = require(token);
        if (!run.isInCache()) return serialize(run);
        int banked = earnGold(run, run.getCacheGold());
        run.setInCache(false);
        run.setCacheGold(0);
        SiegeNode node = run.currentNode();
        if (node != null) node.setCleared(true);
        run.setLastReward("Banked " + banked + " gold from the cache.");
        checkpoint(run);
        return serialize(run);
    }

    // ---- Puzzle mini-games (LINE / RPS / MATCH) ----------------------------
    // Server holds all hidden state and validates every outcome — the client is
    // never trusted. Reachable from caches (openCache) and events (openEvent);
    // both frame the puzzle with their own title/prompt/icon. Rewards run through
    // earnGold so the knight's LOOT passive applies, exactly like other caches.

    private String rollPuzzleType() {
        int r = rng.nextInt(3);
        return r == 0 ? "LINE" : r == 1 ? "RPS" : "MATCH";
    }

    /** Enters a puzzle mini-game with the given framing and freshly generated hidden state. */
    private void openPuzzleMinigame(SiegeRun run, String type, String title, String icon, String prompt) {
        run.setInMinigame(true);
        run.setMinigameType(type);
        run.setMinigameTitle(title);
        run.setMinigameIcon(icon);
        run.setMinigamePrompt(prompt);
        run.setLastReward("");
        switch (type) {
            case "LINE" -> run.setMinigameState(SiegePuzzles.generateLine(rng));
            case "RPS" -> run.setMinigameState(SiegePuzzles.generateRps(rng));
            default -> run.setMinigameState(SiegePuzzles.generateMatch(rng));
        }
    }

    /** Closes the puzzle and clears the node, mirroring how a cache seals itself. */
    private void endMinigame(SiegeRun run) {
        run.setInMinigame(false);
        run.setMinigameState(null);
        run.setMinigameType("");
        SiegeNode node = run.currentNode();
        if (node != null) node.setCleared(true);
        checkpoint(run);
    }

    /** LINE: validate the submitted paths; a full solve pays a large reward. */
    Map<String, Object> minigameLineSubmit(String token, Object rawPaths) {
        SiegeRun run = require(token);
        if (!run.isInMinigame() || !"LINE".equals(run.getMinigameType())) {
            throw new IllegalArgumentException("There is no line puzzle to solve here.");
        }
        SiegePuzzles.LineBoard board = (SiegePuzzles.LineBoard) run.getMinigameState();
        List<List<int[]>> paths = parseLinePaths(rawPaths, board.colors());
        if (!SiegePuzzles.validateLine(board, paths)) {
            throw new IllegalArgumentException(
                    "The circuit isn't solved — every colour must link its runes without crossing or reusing a tile.");
        }
        int gold = earnGold(run, 40 + rng.nextInt(21)); // 40–60: a large cache-tier reward
        awardPartyXp(run, SiegeTuning.XP_PUZZLE_PERFECT); // solving the circuit is a perfect clear
        run.setLastReward("Every rune connects — the seal shatters! +" + gold + " gold.");
        endMinigame(run);
        return serialize(run);
    }

    /** LINE: bail out for a small consolation instead of solving. */
    Map<String, Object> minigameGiveUp(String token) {
        SiegeRun run = require(token);
        if (!run.isInMinigame()) return serialize(run);
        int gold = earnGold(run, 8);
        run.setLastReward("You step away from the puzzle and pocket a few loose coins. +" + gold + " gold.");
        endMinigame(run);
        return serialize(run);
    }

    /** RPS: resolve one round of the committed best-of-three; win the match for good gold. */
    Map<String, Object> minigameRpsThrow(String token, String choice) {
        SiegeRun run = require(token);
        if (!run.isInMinigame() || !"RPS".equals(run.getMinigameType())) {
            throw new IllegalArgumentException("There is no wager to play here.");
        }
        String player = choice == null ? "" : choice.toUpperCase(java.util.Locale.ROOT);
        if (!SiegePuzzles.isRpsThrow(player)) throw new IllegalArgumentException("Throw rock, paper or scissors.");
        SiegePuzzles.RpsMatch match = (SiegePuzzles.RpsMatch) run.getMinigameState();
        if (match.over || match.round >= match.npcThrows.size()) {
            throw new IllegalArgumentException("The match is already decided.");
        }
        String npc = match.npcThrows.get(match.round);
        int result = SiegePuzzles.rpsOutcome(player, npc);
        String verdict = result > 0 ? "you win" : result < 0 ? "you lose" : "a tie";
        if (result > 0) match.playerWins++;
        else if (result < 0) match.npcWins++;
        match.log.add("Round " + (match.round + 1) + ": " + player + " vs " + npc + " — " + verdict + ".");
        match.round++;

        boolean decided = match.playerWins >= 2 || match.npcWins >= 2 || match.round >= match.npcThrows.size();
        if (decided) {
            match.over = true;
            match.playerWon = match.playerWins > match.npcWins;
            if (match.playerWon) {
                int gold = earnGold(run, 30 + rng.nextInt(16)); // 30–45
                awardPartyXp(run, SiegeTuning.XP_PUZZLE_PERFECT); // winning the match is a clear
                run.setLastReward("You take the match " + match.playerWins + "–" + match.npcWins
                        + "! The gambler pays up: +" + gold + " gold.");
            } else {
                int gold = earnGold(run, 8);
                run.setLastReward("The gambler wins " + match.npcWins + "–" + match.playerWins
                        + ". They flick you " + gold + " gold for the show.");
            }
            endMinigame(run);
        } else {
            run.setLastReward("");
        }
        return serialize(run);
    }

    /** MATCH: reveal each tap immediately; resolve the pair after the second tile. */
    Map<String, Object> minigameMatchFlip(String token, int index) {
        SiegeRun run = require(token);
        if (!run.isInMinigame() || !"MATCH".equals(run.getMinigameType())) {
            throw new IllegalArgumentException("There are no tiles to flip here.");
        }
        SiegePuzzles.MatchBoard board = (SiegePuzzles.MatchBoard) run.getMinigameState();
        int n = board.symbols.size();
        if (index < 0 || index >= n) {
            throw new IllegalArgumentException("Pick a face-down tile.");
        }
        if (board.matched[index]) {
            throw new IllegalArgumentException("That tile is already face-up.");
        }
        if (board.pendingFlip < 0) {
            board.pendingFlip = index;
            board.lastFlip = new int[]{index};
            board.lastFlipMatched = false;
            return serialize(run);
        }
        if (board.pendingFlip == index) {
            throw new IllegalArgumentException("Pick a different face-down tile.");
        }
        int a = board.pendingFlip;
        int b = index;
        board.pendingFlip = -1;
        board.lastFlip = new int[]{a, b};
        boolean isPair = board.symbols.get(a).equals(board.symbols.get(b));
        board.lastFlipMatched = isPair;
        if (isPair) {
            board.matched[a] = true;
            board.matched[b] = true;
            board.pairsFound++;
            int gold = earnGold(run, 6);
            run.setLastReward("A matching pair! +" + gold + " gold.");
        } else {
            board.misses++;
            run.setLastReward("");
        }
        if (board.pairsFound >= SiegePuzzles.MATCH_PAIRS) {
            int bonus = earnGold(run, 20);
            awardPartyXp(run, SiegeTuning.XP_PUZZLE_PERFECT); // all pairs cleared
            run.setLastReward("Every tile matched! The vault yields a bonus of " + bonus + " gold.");
            endMinigame(run);
        } else if (board.misses >= SiegePuzzles.MATCH_MAX_MISSES) {
            run.setLastReward("The tiles reseal after too many misses. You keep what you matched.");
            endMinigame(run);
        }
        return serialize(run);
    }

    /** Coerces the raw JSON {@code [{color, cells:[[r,c],…]}]} into typed paths per colour. */
    private List<List<int[]>> parseLinePaths(Object raw, int colors) {
        List<List<int[]>> result = new ArrayList<>();
        for (int i = 0; i < colors; i++) result.add(null);
        if (!(raw instanceof List<?> list)) return result;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> map)) continue;
            int color = asInt(map.get("color"), -1);
            if (color < 0 || color >= colors) continue;
            List<int[]> cells = new ArrayList<>();
            if (map.get("cells") instanceof List<?> cl) {
                for (Object ce : cl) {
                    if (ce instanceof List<?> pair && pair.size() == 2) {
                        cells.add(new int[]{asInt(pair.get(0), -1), asInt(pair.get(1), -1)});
                    }
                }
            }
            result.set(color, cells);
        }
        return result;
    }

    private static int asInt(Object o, int def) {
        if (o instanceof Number num) return num.intValue();
        try { return Integer.parseInt(String.valueOf(o)); } catch (NumberFormatException e) { return def; }
    }

    /** Client-facing view of the active puzzle — hidden solution/board data stays server-side. */
    private Map<String, Object> serializeMinigame(SiegeRun run) {
        Map<String, Object> m = new LinkedHashMap<>();
        String type = run.getMinigameType();
        m.put("type", type);
        m.put("title", run.getMinigameTitle());
        m.put("prompt", run.getMinigamePrompt());
        m.put("icon", run.getMinigameIcon());
        Object st = run.getMinigameState();
        if ("LINE".equals(type) && st instanceof SiegePuzzles.LineBoard board) {
            m.put("size", board.size);
            m.put("colors", board.colors());
            List<Map<String, Object>> eps = new ArrayList<>();
            for (int c = 0; c < board.colors(); c++) {
                int[] ep = board.endpoints.get(c);
                Map<String, Object> em = new LinkedHashMap<>();
                em.put("color", c);
                em.put("a", List.of(ep[0], ep[1]));
                em.put("b", List.of(ep[2], ep[3]));
                eps.add(em);
            }
            m.put("endpoints", eps);
        } else if ("RPS".equals(type) && st instanceof SiegePuzzles.RpsMatch match) {
            m.put("bestOf", 3);
            m.put("round", match.round);
            m.put("playerWins", match.playerWins);
            m.put("npcWins", match.npcWins);
            m.put("throws", List.of(SiegePuzzles.RPS_THROWS));
            if (match.round < match.tells.size()) m.put("tell", match.tells.get(match.round));
            m.put("log", new ArrayList<>(match.log));
        } else if ("MATCH".equals(type) && st instanceof SiegePuzzles.MatchBoard board) {
            m.put("size", 4);
            m.put("misses", board.misses);
            m.put("maxMisses", SiegePuzzles.MATCH_MAX_MISSES);
            m.put("pairsFound", board.pairsFound);
            m.put("totalPairs", SiegePuzzles.MATCH_PAIRS);
            List<Map<String, Object>> cells = new ArrayList<>();
            for (int i = 0; i < board.symbols.size(); i++) {
                Map<String, Object> cm = new LinkedHashMap<>();
                cm.put("index", i);
                cm.put("matched", board.matched[i]);
                cm.put("symbol", board.matched[i] ? board.symbols.get(i) : null);
                cells.add(cm);
            }
            m.put("cells", cells);
            if (board.lastFlip != null) {
                Map<String, Object> flip = new LinkedHashMap<>();
                flip.put("a", board.lastFlip[0]);
                flip.put("symbolA", board.symbols.get(board.lastFlip[0]));
                if (board.lastFlip.length > 1) {
                    flip.put("b", board.lastFlip[1]);
                    flip.put("symbolB", board.symbols.get(board.lastFlip[1]));
                }
                flip.put("matched", board.lastFlipMatched);
                m.put("flip", flip);
            }
        }
        return m;
    }

    /** Applies battle outcome; a win off a boss row queues reward choices. */
    Map<String, Object> continueRun(String token, String authorizationHeader) {
        // Serialize per-run: a timeout retry / double Claim Rewards click otherwise
        // re-enters while the first call is still granting gold/XP and double-pays.
        Session session = requireSession(token);
        synchronized (session) {
            session.lastSeen = Instant.now();
            return continueRunLocked(session.run, authorizationHeader);
        }
    }

    private Map<String, Object> continueRunLocked(SiegeRun run, String authorizationHeader) {
        SiegeBattle battle = run.getBattle();
        if (battle == null) return serialize(run);
        if (battle.getPhase() == BattlePhase.WON) {
            SiegeNode node = run.currentNode();
            if (node != null) node.setCleared(true);
            run.setNodesCleared(run.getNodesCleared() + 1);
            int foes = (int) battle.getCombatants().stream().filter(c -> c.getSide() == Side.ENEMY).count();
            run.setEnemiesDefeated(run.getEnemiesDefeated() + foes);
            int depth = node == null ? 1 : node.getRow() + 1 + run.getLoop() * SiegeContentService.MAP_ROWS;
            run.addScore(foes * (10L + depth) + 5);
            // A short breather after victory.
            for (Combatant ally : run.getParty()) {
                if (ally.isAlive()) ally.heal((int) Math.round(ally.getMaxHp() * 0.12));
            }
            boolean wasBoss = node != null && node.getType() == NodeType.BOSS;
            boolean wasElite = node != null && node.getType() == NodeType.ELITE;

            // Leveling: every living party member (and the Knight) gains battle XP,
            // plus a killing-blow bonus for units that landed a kill this fight.
            int battleXp = wasBoss ? SiegeTuning.XP_BOSS_WON
                    : wasElite ? SiegeTuning.XP_ELITE_WON : SiegeTuning.XP_BATTLE_WON;
            awardBattleXpWithRecap(run, battle, battleXp);

            run.setBattle(null);

            // The rented mercenary's contract ends with the battle.
            String mercNote = "";
            if (run.getMercenary() != null) {
                mercNote = " " + run.getMercenary().getName() + " collects its pay and departs.";
                run.setMercenary(null);
                run.getMercCards().clear();
            }

            // Spoils: gold scales with how deep the fight was; elites pay more.
            int floor = node == null ? 1 : node.getRow() % SiegeContentService.SEGMENT_ROWS + 1;
            int base = 10 + floor * 2 + (wasElite ? 10 : 0) + rng.nextInt(5);

            if (wasBoss) {
                run.setBossKills(run.getBossKills() + 1);
                run.addScore(100L + 50L * run.getBossKills());
                if (run.isBattlegrounds()) {
                    // Every Battlegrounds boss guarantees a stage-2+ reveal reward.
                    grantBossReveal(run);
                    // Tiers III+ grant a second run-wide boon pick after the first boss.
                    if (SiegeTuning.enablesSecondBoon(run.getBgTier())
                            && run.getBossKills() == 1 && run.getBoons().size() < 2) {
                        offerBoon(run);
                    }
                }
                int gold = earnGold(run, base + 30);
                boolean finalRow = node.getRow() >= run.getMap().get(run.getMap().size() - 1).getRow();
                // STANDARD and BATTLEGROUNDS are both fixed 3-boss expeditions: beating
                // the final boss wins the run and auto-extracts the (now higher-level)
                // team. Only ENDLESS loops onward.
                boolean fixedExpedition = run.getMode() == RunMode.STANDARD || run.isBattlegrounds();
                if (finalRow && fixedExpedition) {
                    run.setStatus(RunStatus.WON);
                    run.setLastReward((run.isBattlegrounds()
                            ? "The Siegelord is defeated — Battlegrounds cleared!"
                            : "The Siegelord is defeated — the expedition is won!") + mercNote);
                    grantEndRewards(run, authorizationHeader);
                    // Beating the final boss re-extracts the leveled team automatically.
                    extractTeam(run, authorizationHeader);
                } else if (finalRow) {
                    // Endless: the road never ends — bolt on another region.
                    run.setLoop(run.getLoop() + 1);
                    appendEndlessSegment(run, node);
                    for (Combatant ally : run.getParty()) {
                        if (ally.isAlive()) ally.heal((int) Math.round(ally.getMaxHp() * 0.3));
                    }
                    run.setLastReward("The Siegelord falls (+" + gold + " gold) — but the horizon darkens. Loop "
                            + (run.getLoop() + 1) + " begins!" + mercNote);
                    generateRewards(run, true);
                } else {
                    for (Combatant ally : run.getParty()) {
                        if (ally.isAlive()) ally.heal((int) Math.round(ally.getMaxHp() * 0.25));
                    }
                    run.setLastReward("The " + node.getLabel() + " falls (+" + gold
                            + " gold)! The path to the next region opens." + mercNote);
                    generateRewards(run, true);
                }
            } else {
                int gold = earnGold(run, base);
                run.setLastReward("Victory! +" + gold + " gold. Choose your spoils." + mercNote);
                generateRewards(run, wasElite);
            }

            // After a battle the warband grows: a wild Siegeling may join
            // (1% stage 3, 5% stage 2) until the team is full. Recruits never
            // appear before the first combat. The Marshal muster is not here —
            // that knight picks its extra Siegeling at warband assembly instead.
            if (run.getStatus() == RunStatus.ACTIVE && run.getParty().size() < content.partyMax()) {
                joinStagedRecruit(run, " emerges from the battlefield and joins the warband!", true);
            }
        } else if (battle.getPhase() == BattlePhase.LOST) {
            run.setStatus(RunStatus.LOST);
            run.setBattle(null);
            run.setMercenary(null);
            run.getMercCards().clear();
            run.setLastReward(run.getMode() == RunMode.ENDLESS
                    ? "The warband falls after " + run.getBossKills() + " boss(es). Final score: " + run.getScore() + "."
                    : run.isBattlegrounds()
                        ? "The squad is routed. Its veteran teams are fatigued for 24h — but survive to fight again."
                        : "The warband has fallen. The expedition ends here.");
            grantEndRewards(run, authorizationHeader);
            // Battlegrounds fatigue: lock (don't consume) the squad's source teams for 24h.
            if (run.isBattlegrounds() && !run.getSourceTeamIds().isEmpty()) {
                AccountUser bgUser = resolveUser(authorizationHeader);
                if (bgUser != null && bgUser.getId() != null) {
                    try {
                        veterans.lockTeams(bgUser.getId(), run.getSourceTeamIds(),
                                System.currentTimeMillis() + SiegeTuning.BG_FATIGUE_LOCKOUT_MS);
                    } catch (Exception ignored) {
                        // best-effort; the loss stands regardless
                    }
                }
            }
        }
        checkpoint(run);
        return serialize(run);
    }

    /** Appends one more 8-row region after the final boss for Endless mode. */
    private void appendEndlessSegment(SiegeRun run, SiegeNode bossNode) {
        int startRow = run.getMap().get(run.getMap().size() - 1).getRow() + 1;
        int startId = run.getMap().stream().mapToInt(SiegeNode::getId).max().orElse(0) + 1;
        List<SiegeNode> extra = content.generateEndlessSegment(startRow, startId, run.getLoop(), rng);
        run.getMap().addAll(extra);
        for (SiegeNode n : extra) {
            if (n.getRow() == startRow) bossNode.getNext().add(n.getId());
        }
    }

    /**
     * One-time end-of-run payout to the player's account: Siegecoins, Remnants
     * and (on a win) a random collection card. Guests see a preview only.
     */
    private void grantEndRewards(SiegeRun run, String authorizationHeader) {
        grantEndRewards(run, authorizationHeader, 1.0);
    }

    /**
     * As {@link #grantEndRewards(SiegeRun, String)} but scales the Siegecoin and
     * Remnant payout by {@code rewardMultiplier} — Endless loop-boundary extraction
     * banks the team with a ×loop multiplier (see {@link #extract}).
     */
    private void grantEndRewards(SiegeRun run, String authorizationHeader, double rewardMultiplier) {
        if (run.isEndRewardsGranted()) return;
        double mult = Math.max(1.0, rewardMultiplier);
        // Battlegrounds tiers scale the end payout on top of any loop multiplier.
        if (run.isBattlegrounds()) mult *= SiegeTuning.bgTierRewardMult(run.getBgTier());
        boolean won = run.getStatus() == RunStatus.WON;
        int coins = (int) Math.round((15 + run.getNodesCleared() * 3 + run.getBossKills() * 20
                + (won ? 60 : 0) + (int) Math.min(200, run.getScore() / 40)) * mult);
        int remnants = (int) Math.round((10 + run.getNodesCleared() * 2 + run.getBossKills() * 10 + (won ? 40 : 0)) * mult);
        Card cardPrize = (won || run.getLoop() >= 1) ? content.randomCollectionCard(rng).orElse(null) : null;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("gold", coins);
        out.put("remnants", remnants);
        out.put("multiplier", mult);
        out.put("card", cardPrize == null ? null : Map.of(
                "id", cardPrize.getId(), "name", cardPrize.getName(),
                "element", cardPrize.getElement().name(), "rarity", cardPrize.getRarity().name()));
        // Battlegrounds triples the end-of-run score payout, further scaled by tier.
        out.put("score", run.isBattlegrounds() ? SiegeTuning.bgScore(run.getScore(), run.getBgTier()) : run.getScore());

        AccountUser user = null;
        try {
            if (accountService != null) user = accountService.findUser(authorizationHeader);
        } catch (Exception ignored) {
            // treat as guest
        }
        boolean claimed = false;
        if (user != null && progressionService != null && progressionStore != null) {
            try {
                PlayerProgressionEntity progression = progressionService.getOrCreate(user);
                progression.setGold(progression.getGold() + coins);
                progression.setRemnants(progression.getRemnants() + remnants);
                if (cardPrize != null) {
                    progressionService.grantCardsWithCap(progression, List.of(cardPrize));
                }
                // Lifetime siege stats power siege-mode achievements, titles, and missions.
                progression.setSiegeRuns(progression.getSiegeRuns() + 1);
                if (won) {
                    progression.setSiegeWins(progression.getSiegeWins() + 1);
                }
                progression.setSiegeBossKills(progression.getSiegeBossKills() + Math.max(0, run.getBossKills()));
                progression.setSiegeNodesCleared(progression.getSiegeNodesCleared() + Math.max(0, run.getNodesCleared()));
                progression.setSiegeBestScore(Math.max(progression.getSiegeBestScore(), (int) Math.max(0L, run.getScore())));
                // Siegelings met on the run become permanent starter picks. Banked
                // here (not at the moment of the find) so they are earned by
                // finishing the expedition, win or lose.
                List<String> unlockedNames = bankSieglingDiscoveries(progression, run);
                out.put("unlockedSieglings", unlockedNames);
                // Battlegrounds: award Warmarks (per boss + win bonus) and unlock the next tier on a first clear.
                if (run.isBattlegrounds()) {
                    int tier = run.getBgTier();
                    int base = run.getBossKills() * SiegeTuning.BG_WARMARKS_PER_BOSS + (won ? SiegeTuning.BG_WARMARKS_WIN : 0);
                    int warmarks = SiegeTuning.bgWarmarks(base, tier);
                    boolean firstClear = won && tier > progression.getBattlegroundsTier();
                    if (firstClear) {
                        progression.setBattlegroundsTier(tier);
                        warmarks += SiegeTuning.bgWarmarks(SiegeTuning.BG_WARMARKS_FIRST_CLEAR, tier);
                    }
                    progression.setWarmarks(progression.getWarmarks() + warmarks);
                    out.put("warmarks", warmarks);
                    out.put("tier", tier);
                    out.put("tierUnlocked", firstClear && tier < SiegeTuning.BG_MAX_TIER ? tier + 1 : 0);
                }
                progression.setUpdatedAt(Instant.now());
                progressionStore.save(progression);
                claimed = true;
                if (dailyMissionService != null) {
                    try {
                        dailyMissionService.recordSiege(user.getId(), won, run.getBossKills(), run.getNodesCleared(), coins);
                    } catch (Exception ignored) {
                        // mission counters are best-effort
                    }
                }
            } catch (Exception ignored) {
                // payout is best-effort; the run outcome stands either way
            }
        }
        out.put("claimed", claimed);
        out.put("guestPreview", !claimed);
        run.setEndRewards(out);
        run.setEndRewardsGranted(true);
    }

    // ---- Extraction (bank a leveled team as a veteran team) ---------------

    /**
     * Endless loop-boundary extraction: banks the current team as a veteran team,
     * grants end-rewards with a ×loop multiplier, and ends the run. Push On is the
     * existing continue behaviour; a later loss extracts nothing.
     */
    Map<String, Object> extract(String token, String authorizationHeader) {
        Session session = requireSession(token);
        synchronized (session) {
            session.lastSeen = Instant.now();
            SiegeRun run = session.run;
            if (run.getMode() != RunMode.ENDLESS) {
                throw new IllegalArgumentException("Only Endless expeditions bank a team mid-run.");
            }
            if (run.getStatus() != RunStatus.ACTIVE) {
                throw new IllegalArgumentException("This expedition has already ended.");
            }
            if (run.getBattle() != null) {
                throw new IllegalArgumentException("Finish the battle before extracting your team.");
            }
            if (run.getBossKills() < 1) {
                throw new IllegalArgumentException("Defeat at least one boss before extracting your team.");
            }
            double multiplier = Math.max(1, run.getLoop() + 1);
            run.setStatus(RunStatus.WON);
            run.setMercenary(null);
            run.getMercCards().clear();
            run.setLastReward("Team extracted after " + run.getBossKills() + " boss(es) — banked for Battlegrounds. End rewards ×"
                    + (long) multiplier + ".");
            grantEndRewards(run, authorizationHeader, multiplier);
            extractTeam(run, authorizationHeader);
            checkpoint(run); // status != ACTIVE, so this clears the saved checkpoint
            return serialize(run);
        }
    }

    /**
     * Snapshots the run's leveled team (knight + party + modified deck) and banks
     * it as a veteran team. Idempotent — guarded by {@link SiegeRun#isVeteranExtracted()}.
     * Guests build the snapshot for the confirmation UI but nothing persists.
     */
    private void extractTeam(SiegeRun run, String authorizationHeader) {
        if (run.isVeteranExtracted()) return;
        Map<String, Object> snapshot = buildVeteranSnapshot(run);
        run.setVeteranTeam(snapshot);
        run.setVeteranExtracted(true);
        AccountUser user = resolveUser(authorizationHeader);
        if (user != null && user.getId() != null) {
            try {
                veterans.saveTeam(user.getId(), snapshot);
            } catch (Exception ignored) {
                // best-effort; the run outcome + local confirmation stand either way
            }
        }
    }

    /** Builds a portable snapshot of the run's leveled team at its extracted level. */
    private Map<String, Object> buildVeteranSnapshot(SiegeRun run) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("teamId", java.util.UUID.randomUUID().toString());
        t.put("extractedAt", System.currentTimeMillis());
        t.put("mode", run.getMode().name());
        t.put("loop", run.getLoop());
        t.put("score", run.getScore());
        t.put("bossKills", run.getBossKills());

        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("knightId", run.getKnightId());
        knight.put("knightName", run.getKnightName());
        knight.put("element", run.getKnightElement() == null ? null : run.getKnightElement().name());
        knight.put("passive", run.getKnightPassive() == null ? null : run.getKnightPassive().name());
        knight.put("passiveName", run.getKnightPassive() == null ? null : content.knightPassiveName(run.getKnightPassive()));
        knight.put("passiveValue", run.getKnightPassiveValue());
        Combatant ku = run.getKnightUnit();
        knight.put("level", ku == null ? 1 : ku.getLevel());
        knight.put("xp", ku == null ? 0 : ku.getXp());
        knight.put("maxHp", ku == null ? 0 : ku.getMaxHp());
        knight.put("baseMaxHp", ku == null ? 0 : ku.getBaseMaxHp());
        t.put("knight", knight);
        t.put("members", SiegeVeteranStore.membersOf(run.getParty()));
        t.put("deck", SiegeVeteranStore.deckOf(run.getDeckTemplates()));
        return t;
    }

    // ---- Battlegrounds (march a squad of banked veterans) -----------------

    /** Whether free recruit drops are disabled for this run (Battlegrounds only). */
    static boolean recruitsSuppressed(SiegeRun run) {
        return run != null && run.isBattlegrounds();
    }

    /**
     * Battlegrounds boss reward: a guaranteed stage-2-or-higher Siegeling reveal.
     * Recruits are suppressed in Battlegrounds (your squad is fixed), so this is a
     * one-shot reveal shown to the player rather than a new party member. Cleared
     * when the player next travels ({@link #enterNode}).
     */
    private void grantBossReveal(SiegeRun run) {
        List<String> inPlay = run.getParty().stream().map(Combatant::getName).toList();
        content.randomRevealAtLeastStage(2, inPlay, rng).ifPresent(s -> {
            Map<String, Object> reveal = new LinkedHashMap<>();
            reveal.put("name", s.getName());
            reveal.put("element", s.getElement() == null ? null : s.getElement().name());
            reveal.put("stage", content.stageOf(s));
            reveal.put("artUrl", s.getCardArtUrl());
            run.setBossReveal(reveal);
        });
    }

    /**
     * Launches a Battlegrounds run. The client picks exactly {@link SiegeTuning#BG_SQUAD_SIZE}
     * veterans (each identified by {@code teamId}+{@code sourceCardId}) plus a veteran
     * knight (identified by its {@code knightTeamId}). Every pick is validated against
     * the signed-in user's banked veteran teams — stats, levels and decks are read
     * from the STORED snapshot, never trusted from the request.
     *
     * @param membersRaw   a list of {@code {teamId, sourceCardId}} maps (exactly 3)
     * @param knightTeamId the banked team whose veteran knight leads the squad
     */
    Map<String, Object> newBattlegrounds(String authorizationHeader, Object membersRaw, String knightTeamId, int tier) {
        AccountUser user = resolveUser(authorizationHeader);
        if (user == null || user.getId() == null) {
            throw new IllegalArgumentException("Sign in and bank some veteran teams to march into Battlegrounds.");
        }
        List<Map<String, Object>> teams = listVeteranTeams(user);
        if (SiegeVeteranStore.flattenVeterans(teams).size() < SiegeTuning.BG_MIN_VETERANS) {
            throw new IllegalArgumentException("Battlegrounds needs at least " + SiegeTuning.BG_MIN_VETERANS
                    + " banked veterans — extract more teams from Siege first.");
        }
        List<String[]> picks = parseMemberPicks(membersRaw);

        // Tier gate: only tiers up to (highest cleared + 1) are selectable.
        int clearedTier = 0;
        if (progressionService != null) {
            try { clearedTier = progressionService.getOrCreate(user).getBattlegroundsTier(); }
            catch (Exception ignored) { /* treat as none cleared */ }
        }
        int chosenTier = SiegeTuning.clampTier(tier);
        if (chosenTier > clearedTier + 1) {
            throw new IllegalArgumentException("Clear tier " + (clearedTier + 1) + " before entering a higher tier.");
        }

        // Fatigue: a team locked after a loss can't be re-fielded until its timer expires.
        long now = System.currentTimeMillis();
        java.util.Set<String> involvedTeamIds = new java.util.LinkedHashSet<>();
        if (knightTeamId != null) involvedTeamIds.add(knightTeamId);
        for (String[] pick : picks) involvedTeamIds.add(pick[0]);
        for (String teamId : involvedTeamIds) {
            Map<String, Object> team = findTeam(teams, teamId);
            if (team != null && SiegeVeteranStore.isLocked(team, now)) {
                throw new IllegalArgumentException("A chosen team is fatigued from a recent defeat — pick a rested squad.");
            }
        }

        purgeStale();
        String token = generateToken();
        SiegeRun run = buildBattlegroundsRun(token, teams, picks, knightTeamId, chosenTier, involvedTeamIds);
        seedStartingKnightBag(run);
        run.getMap().addAll(content.generateMap(rng, true));
        runs.put(token, new Session(run));
        checkpoint(run);
        return serialize(run);
    }

    /** Picks the pending run-start (or post-boss) Battlegrounds boon by id. */
    Map<String, Object> pickBoon(String token, String boonId) {
        SiegeRun run = require(token);
        if (!run.isBattlegrounds() || !run.isAwaitingBoonPick()) {
            throw new IllegalArgumentException("There is no boon to choose right now.");
        }
        if (!run.getBoonOffer().contains(boonId) || SiegeBoon.byId(boonId) == null) {
            throw new IllegalArgumentException("That boon is not on offer.");
        }
        run.getBoons().add(boonId);
        run.getBoonOffer().clear();
        run.setAwaitingBoonPick(false);
        SiegeBoon chosen = SiegeBoon.byId(boonId);
        run.setLastReward(chosen.icon() + " " + chosen.displayName() + " boon active — " + chosen.description());
        checkpoint(run);
        return serialize(run);
    }

    /** Sets a fresh boon offer for the run (excluding already-taken boons) and gates travel until picked. */
    private void offerBoon(SiegeRun run) {
        List<SiegeBoon> offer = SiegeBoon.offer(run.getBoons(), rng);
        run.getBoonOffer().clear();
        for (SiegeBoon b : offer) run.getBoonOffer().add(b.id());
        run.setAwaitingBoonPick(!run.getBoonOffer().isEmpty());
    }

    /** Parses the request's member picks into {@code [teamId, sourceCardId]} pairs (exactly the squad size). */
    private static List<String[]> parseMemberPicks(Object membersRaw) {
        List<String[]> picks = new ArrayList<>();
        if (membersRaw instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                String teamId = str(m.get("teamId"));
                String sourceCardId = str(m.get("sourceCardId"));
                if (teamId == null || sourceCardId == null) continue;
                picks.add(new String[] { teamId, sourceCardId });
            }
        }
        if (picks.size() != SiegeTuning.BG_SQUAD_SIZE) {
            throw new IllegalArgumentException("Pick exactly " + SiegeTuning.BG_SQUAD_SIZE + " veteran Siegelings.");
        }
        // No fielding the same banked veteran twice.
        for (int i = 0; i < picks.size(); i++) {
            for (int j = i + 1; j < picks.size(); j++) {
                if (picks.get(i)[0].equals(picks.get(j)[0]) && picks.get(i)[1].equals(picks.get(j)[1])) {
                    throw new IllegalArgumentException("You can't field the same veteran twice.");
                }
            }
        }
        return picks;
    }

    /**
     * Rebuilds a full Battlegrounds run from validated veteran picks: the party
     * Combatants at their extracted level/xp/stats/item, the merged modified deck,
     * the veteran knight, and BG-only run fields. Map generation is done by the caller.
     */
    private SiegeRun buildBattlegroundsRun(String token, List<Map<String, Object>> teams,
                                           List<String[]> picks, String knightTeamId,
                                           int tier, java.util.Collection<String> involvedTeamIds) {
        BgBuild build = buildBattlegroundsParty(teams, picks, knightTeamId);
        SiegeRun run = new SiegeRun(token);
        run.setMode(RunMode.BATTLEGROUNDS);
        run.setBgTier(tier);
        run.setBgTierScalar(SiegeTuning.bgTierScalar(tier));
        run.setAverageVeteranLevel(build.averageLevel);
        run.getSourceTeamIds().addAll(involvedTeamIds);
        // Offer the run-start boon; the player must pick before travelling.
        offerBoon(run);

        Map<String, Object> ks = build.knightSnap;
        String knightId = str(ks.get("knightId"));
        run.setKnightId(knightId);
        run.setKnightName(str(ks.get("knightName")));
        run.setKnightElement(parseElement(ks.get("element")));
        run.setKnightPassive(parsePassive(ks.get("passive")));
        run.setKnightPassiveValue(intOf(ks.get("passiveValue"), 0));
        Optional<TrainerCard> knightCard = content.findKnight(knightId);
        run.setKnightActive(knightCard.map(content::knightActiveSpec).orElse(null));
        run.setKnightPassiveDesc(knightCard.map(content::knightPassiveDescription).orElse(str(ks.get("passiveName"))));
        run.setKnightUnit(build.knightUnit);

        run.getParty().addAll(build.party);
        run.getDeckTemplates().addAll(build.deck);
        // If the stored deck predates the knight card, fall back to a fresh one.
        if (run.getKnightActive() != null
                && run.getDeckTemplates().stream().noneMatch(c -> c.getOwnerId().startsWith("knight-"))) {
            run.getDeckTemplates().add(new SiegeCard("knightcard", "knight-" + knightId, run.getKnightActive()));
        }
        return run;
    }

    /**
     * Pure reconstruction of a Battlegrounds squad from banked snapshots — no Spring
     * beans, so it is unit-testable. Validates every pick against the supplied teams
     * (throwing {@link IllegalArgumentException} if a pick or the knight team is not
     * present) and rebuilds Combatants + the merged deck from the stored snapshot.
     */
    BgBuild buildBattlegroundsParty(List<Map<String, Object>> teams,
                                    List<String[]> picks, String knightTeamId) {
        BgBuild build = new BgBuild();

        Map<String, Object> knightTeam = findTeam(teams, knightTeamId);
        if (knightTeam == null) {
            throw new IllegalArgumentException("That veteran knight is not in your banked teams.");
        }
        Map<String, Object> knightSnap = asMap(knightTeam.get("knight"));
        if (knightSnap == null) {
            throw new IllegalArgumentException("That banked team has no veteran knight to lead.");
        }
        build.knightSnap = knightSnap;
        String knightId = str(knightSnap.get("knightId"));
        build.knightUnit = rebuildKnightCombatant(knightSnap);
        // Merge the chosen knight's card(s) from its team's modified deck.
        String knightOwner = "knight-" + knightId;
        build.deck.addAll(rebuildDeck(deckOfTeam(knightTeam), knightOwner, knightOwner));

        int levelSum = 0;
        int slot = 0;
        for (String[] pick : picks) {
            String teamId = pick[0];
            String sourceCardId = pick[1];
            Map<String, Object> team = findTeam(teams, teamId);
            if (team == null) {
                throw new IllegalArgumentException("A chosen veteran is not in your banked teams.");
            }
            List<Map<String, Object>> members = membersOfTeam(team);
            int idx = indexOfMember(members, sourceCardId);
            if (idx < 0) {
                throw new IllegalArgumentException("A chosen veteran is not in your banked teams.");
            }
            Combatant member = rebuildMemberCombatant(members.get(idx), slot);
            build.party.add(member);
            levelSum += member.getLevel();
            // Deck cards for the member: matched by their original combatant id, rebound to the new one.
            String oldOwner = "ally-" + idx + "-" + sourceCardId;
            build.deck.addAll(rebuildDeck(deckOfTeam(team), oldOwner, member.getId()));
            slot++;
        }
        build.averageLevel = picks.isEmpty() ? 0 : Math.round(levelSum / (float) picks.size());
        return build;
    }

    /** Reconstructed Battlegrounds squad (party + merged deck + knight + average level). */
    static final class BgBuild {
        final List<Combatant> party = new ArrayList<>();
        final List<SiegeCard> deck = new ArrayList<>();
        Combatant knightUnit;
        Map<String, Object> knightSnap;
        int averageLevel;
    }

    /** Rebuilds one party Combatant from its veteran snapshot at its extracted level/xp/stats/item. */
    private Combatant rebuildMemberCombatant(Map<String, Object> snap, int slot) {
        String sourceCardId = str(snap.get("sourceCardId"));
        String name = str(snap.get("name"));
        Element element = parseElement(snap.get("element"));
        int maxHp = intOf(snap.get("maxHp"), 1);
        int baseMaxHp = intOf(snap.get("baseMaxHp"), maxHp);
        int baseSpeed = intOf(snap.get("baseSpeed"), intOf(snap.get("speed"), 5));
        int xp = intOf(snap.get("xp"), 0);
        String id = "ally-" + slot + "-" + sourceCardId;
        // Veteran snapshots store stats, not art: without resolving it back from the
        // catalog every Battlegrounds Siegeling fought as an element glyph instead of
        // its cutout, on the battlefield, the party rail and the resume prompt alike.
        Combatant c = new Combatant(id, name, element, Side.PLAYER, Math.max(1, baseMaxHp),
                Math.max(1, baseSpeed), sieglingArtUrl(sourceCardId));
        c.setSourceCardId(sourceCardId);
        c.setPosition(slot);
        c.setItemId(str(snap.get("itemId")));
        c.loadLeveling(xp); // re-derives level + scales maxHp/speed exactly as at extraction
        return c;
    }

    /** Rebuilds the veteran knight Combatant from its snapshot (persistent HP unit, no notch). */
    private Combatant rebuildKnightCombatant(Map<String, Object> snap) {
        String name = str(snap.get("knightName"));
        Element element = parseElement(snap.get("element"));
        int maxHp = intOf(snap.get("maxHp"), 1);
        int baseMaxHp = intOf(snap.get("baseMaxHp"), maxHp);
        int xp = intOf(snap.get("xp"), 0);
        Combatant knight = new Combatant("knight-unit", name, element, Side.PLAYER,
                Math.max(1, baseMaxHp), 5, knightArtUrl(str(snap.get("knightId"))), true);
        knight.loadLeveling(xp);
        return knight;
    }

    /**
     * Rebuilds deck cards owned by {@code oldOwner} from a stored deck, rebinding
     * them to {@code newOwner} and preserving the modified spec (smith upgrades etc.).
     * Reuses {@link #specFromMap} — the same reader that restores checkpoint decks.
     */
    private List<SiegeCard> rebuildDeck(List<Map<String, Object>> deck, String oldOwner, String newOwner) {
        List<SiegeCard> out = new ArrayList<>();
        int n = 0;
        for (Map<String, Object> card : deck) {
            if (!oldOwner.equals(str(card.get("owner")))) continue;
            Map<String, Object> specMap = asMap(card.get("spec"));
            if (specMap == null) continue;
            out.add(new SiegeCard(newOwner + "-m" + (n++), newOwner, specFromMap(specMap)));
        }
        return out;
    }

    // ---- Battlegrounds snapshot helpers (null-safe map/enum readers) -------

    private static Map<String, Object> findTeam(List<Map<String, Object>> teams, String teamId) {
        if (teams == null || teamId == null) return null;
        for (Map<String, Object> team : teams) {
            if (teamId.equals(str(team.get("teamId")))) return team;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> membersOfTeam(Map<String, Object> team) {
        Object members = team == null ? null : team.get("members");
        List<Map<String, Object>> out = new ArrayList<>();
        if (members instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
            }
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> deckOfTeam(Map<String, Object> team) {
        Object deck = team == null ? null : team.get("deck");
        List<Map<String, Object>> out = new ArrayList<>();
        if (deck instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
            }
        }
        return out;
    }

    private static int indexOfMember(List<Map<String, Object>> members, String sourceCardId) {
        for (int i = 0; i < members.size(); i++) {
            if (sourceCardId != null && sourceCardId.equals(str(members.get(i).get("sourceCardId")))) return i;
        }
        return -1;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static int intOf(Object o, int fallback) {
        if (o instanceof Number n) return n.intValue();
        if (o == null) return fallback;
        try { return Integer.parseInt(String.valueOf(o)); } catch (NumberFormatException e) { return fallback; }
    }

    private static Element parseElement(Object o) {
        return enumOf(Element.class, o, null);
    }

    private static KnightPassive parsePassive(Object o) {
        return enumOf(KnightPassive.class, o, KnightPassive.SHIELD);
    }

    private static <E extends Enum<E>> E enumOf(Class<E> type, Object o, E fallback) {
        if (o == null) return fallback;
        try { return Enum.valueOf(type, String.valueOf(o)); } catch (IllegalArgumentException e) { return fallback; }
    }

    // ---- Smith (upgrade or scrap deck cards) ------------------------------

    private static final int SMITH_UPGRADE_COST = 30;

    private void openSmith(SiegeRun run) {
        run.setInSmith(true);
        run.getSmithOptions().clear();
        int oid = 0;
        List<SiegeCard> deck = run.getDeckTemplates();
        // Offer up to three cards to chisel (upgrade), and allow scrapping any card.
        List<Integer> idxs = new ArrayList<>();
        for (int i = 0; i < deck.size(); i++) idxs.add(i);
        Collections.shuffle(idxs, rng);
        for (int k = 0; k < Math.min(3, idxs.size()); k++) {
            int idx = idxs.get(k);
            AbilitySpec spec = deck.get(idx).getSpec();
            AbilitySpec up = content.upgradeSpec(spec);
            run.getSmithOptions().add(CampOption.smith("s" + (oid++), "CHISEL",
                    "Chisel " + spec.name(), spec.name() + " → " + up.name() + " ("
                            + describeUpgrade(spec, up) + ")", spec.element(), idx, SMITH_UPGRADE_COST));
        }
        run.setLastReward("");
    }

    Map<String, Object> smithChoose(String token, String optionId, Integer scrapIndex) {
        SiegeRun run = require(token);
        if (!run.isInSmith()) throw new IllegalArgumentException("There is no smith here.");
        if (scrapIndex != null) {
            int idx = scrapIndex;
            if (idx < 0 || idx >= run.getDeckTemplates().size()) throw new IllegalArgumentException("No such card.");
            if (run.getDeckTemplates().size() <= 3) throw new IllegalArgumentException("Your deck is too thin to scrap more.");
            SiegeCard removed = run.getDeckTemplates().remove(idx);
            // Scraping shifts later deck indices. Remap remaining chisel offers so they
            // keep targeting the same cards the player was shown; drop the scrapped card's offer.
            List<CampOption> remapped = new ArrayList<>();
            for (CampOption option : run.getSmithOptions()) {
                if (option.templateIndex == idx) continue;
                int mappedIndex = option.templateIndex > idx ? option.templateIndex - 1 : option.templateIndex;
                CampOption copy = CampOption.smith(option.id, option.kind, option.title, option.desc,
                        option.element, mappedIndex, option.cost);
                copy.used = option.used;
                remapped.add(copy);
            }
            run.getSmithOptions().clear();
            run.getSmithOptions().addAll(remapped);
            run.setLastReward("Scrapped " + removed.getSpec().name() + " — a leaner deck.");
            return serialize(run);
        }
        CampOption pick = run.getSmithOptions().stream().filter(o -> o.id.equals(optionId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown smith option."));
        if (pick.used) throw new IllegalArgumentException("Already forged this card.");
        if (run.getGold() < pick.cost) throw new IllegalArgumentException("Not enough gold.");
        int idx = pick.templateIndex;
        if (idx < 0 || idx >= run.getDeckTemplates().size()) throw new IllegalArgumentException("That card is gone.");
        run.addGold(-pick.cost);
        SiegeCard old = run.getDeckTemplates().get(idx);
        AbilitySpec up = content.upgradeSpec(old.getSpec());
        run.getDeckTemplates().set(idx, new SiegeCard(old.getInstanceId(), old.getOwnerId(), up));
        run.setLastReward(old.getSpec().name() + " was chiseled into " + up.name() + "!");
        pick.used = true;
        return serialize(run);
    }

    Map<String, Object> smithLeave(String token) {
        SiegeRun run = require(token);
        if (!run.isInSmith()) return serialize(run);
        run.setInSmith(false);
        run.getSmithOptions().clear();
        SiegeNode node = run.currentNode();
        if (node != null) node.setCleared(true);
        checkpoint(run);
        return serialize(run);
    }

    // ---- Merchant Caravan (items + goods for gold) ------------------------

    private void openCaravan(SiegeRun run) {
        run.setInCaravan(true);
        run.getCaravanOptions().clear();
        int oid = 0;
        for (SiegeItem item : content.randomItems(3, rng)) {
            int cost = switch (item.kind()) { case "VITALITY" -> 45; case "SHIELD" -> 40; default -> 50; };
            run.getCaravanOptions().add(CampOption.shopItem("v" + (oid++), item, cost));
        }
        // A card and a heal round out the wares.
        List<Combatant> living = run.getParty().stream().filter(Combatant::isAlive).toList();
        if (!living.isEmpty()) {
            Combatant owner = living.get(rng.nextInt(living.size()));
            AbilitySpec spec = content.randomCardRewardFor(owner.getElement(), rng);
            run.getCaravanOptions().add(CampOption.shopCard("v" + (oid++), spec, owner.getId(), owner.getName(), 30));
        }
        run.getCaravanOptions().add(CampOption.shopHeal("v" + (oid++), 20));
        run.setLastReward("");
    }

    Map<String, Object> caravanBuy(String token, String optionId) {
        SiegeRun run = require(token);
        if (!run.isInCaravan()) throw new IllegalArgumentException("There is no caravan here.");
        CampOption pick = run.getCaravanOptions().stream().filter(o -> o.id.equals(optionId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown wares."));
        if (pick.used) throw new IllegalArgumentException("Already bought.");
        if (run.getGold() < pick.cost) throw new IllegalArgumentException("Not enough gold.");
        run.addGold(-pick.cost);
        switch (pick.kind) {
            case "SHOP_ITEM" -> {
                run.getInventory().add(pick.sieglingId);
                SiegeItem it = content.findItem(pick.sieglingId);
                run.setLastReward("Bought " + (it == null ? "an item" : it.name()) + " — equip it from your inventory.");
            }
            case "SHOP_CARD" -> {
                run.getDeckTemplates().add(new SiegeCard(
                        "caravan-" + pick.id + "-" + run.getDeckTemplates().size(), pick.ownerId, pick.cardSpec));
                run.setLastReward("Bought " + pick.cardSpec.name() + " for the deck.");
            }
            case "SHOP_HEAL" -> {
                int healed = healParty(run, 0.3);
                run.setLastReward("Supplies bought: the party recovers " + healed + " HP.");
            }
            default -> { }
        }
        pick.used = true;
        return serialize(run);
    }

    Map<String, Object> caravanLeave(String token) {
        SiegeRun run = require(token);
        if (!run.isInCaravan()) return serialize(run);
        run.setInCaravan(false);
        run.getCaravanOptions().clear();
        SiegeNode node = run.currentNode();
        if (node != null) node.setCleared(true);
        checkpoint(run);
        return serialize(run);
    }

    // ---- Event nodes ------------------------------------------------------

    private void openEvent(SiegeRun run) {
        // Roughly a third of events are actually a warden's puzzle in disguise,
        // framed with a matching event title/prompt instead of a choice list.
        if (rng.nextInt(100) < 35) {
            String type = rollPuzzleType();
            String title;
            String prompt;
            String icon;
            switch (type) {
                case "LINE" -> {
                    title = "Rune Circuit";
                    icon = "🔮";
                    prompt = "Glowing runes flank a warded door. Trace each colour to its twin to break the seal.";
                }
                case "RPS" -> {
                    title = "The Wager";
                    icon = "🎲";
                    prompt = "A grinning gambler blocks the road: \"Best of three hands. Win and the purse is yours.\"";
                }
                default -> {
                    title = "The Tile Vault";
                    icon = "🁢";
                    prompt = "Sixteen carved tiles lie face-down on the vault door. Match the pairs from memory.";
                }
            }
            openPuzzleMinigame(run, type, title, icon, prompt);
            return;
        }
        SiegeContentService.EventDef def = content.randomEvent(rng);
        run.setInEvent(true);
        run.setEventTitle(def.title());
        run.setEventIcon(def.icon());
        run.setEventPrompt(def.prompt());
        run.getEventOptions().clear();
        int oid = 0;
        for (SiegeContentService.EventChoice ch : def.choices()) {
            run.getEventOptions().add(CampOption.event("e" + (oid++), ch.outcome(), ch.label(), ch.flavor(), 0, ch.value()));
        }
    }

    Map<String, Object> eventChoose(String token, String optionId) {
        SiegeRun run = require(token);
        if (!run.isInEvent()) throw new IllegalArgumentException("There is no event here.");
        CampOption pick = run.getEventOptions().stream().filter(o -> o.id.equals(optionId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown choice."));
        String outcome = pick.kind.startsWith("EV_") ? pick.kind.substring(3) : pick.kind;
        int value = pick.templateIndex; // event value rides in templateIndex
        SiegeNode node = run.currentNode();

        run.setInEvent(false);
        run.getEventOptions().clear();
        boolean startedBattle = false;

        switch (outcome) {
            case "GOLD" -> run.setLastReward((pick.desc == null ? "" : pick.desc + " ") + "+" + earnGold(run, value) + " gold.");
            case "PAY_GOLD" -> {
                if (run.getGold() < value) { // can't pay -> forced fight
                    run.setInEvent(false);
                    startedBattle = true;
                    startNodeBattle(run, node, NodeType.BATTLE, true);
                    run.setLastReward("You can't pay — the bandits attack!");
                } else {
                    run.addGold(-value);
                    run.setLastReward("You pay the toll and pass.");
                }
            }
            case "SNEAK" -> {
                if (rng.nextBoolean()) run.setLastReward("You slip past unseen.");
                else { hurtParty(run, value); run.setLastReward("Caught! The party takes " + value + " damage escaping."); }
            }
            case "HEAL" -> run.setLastReward((pick.desc == null ? "" : pick.desc + " ") + "The party recovers " + healPartyFlat(run, value) + " HP.");
            case "AMBUSH" -> { startedBattle = true; startNodeBattle(run, node, NodeType.BATTLE, true); }
            case "AMBUSH_ELITE" -> { startedBattle = true; startNodeBattle(run, node, NodeType.ELITE, true); }
            case "ITEM_HEALTHCOST" -> {
                hurtParty(run, value);
                SiegeItem it = grantRandomItem(run);
                run.setLastReward(pick.desc + " Received " + (it == null ? "a trinket" : it.name()) + " (−" + value + " HP).");
            }
            case "BLEED_ITEM" -> {
                hurtParty(run, value);
                SiegeItem it = grantRandomItem(run);
                run.setLastReward("You bleed for it — received " + (it == null ? "a relic" : it.name()) + "!");
            }
            case "RECRUIT_CHANCE" -> {
                if (run.getParty().size() < content.partyMax()) joinStagedRecruit(run, " tags along and joins the warband!");
                else { grantRandomItem(run); run.setLastReward("The warband is full — the Siegeling leaves you a parting gift instead."); }
            }
            case "SEARCH" -> {
                int roll = rng.nextInt(100);
                if (roll < 45) { SiegeItem it = grantRandomItem(run); run.setLastReward("You find " + (it == null ? "a useful item" : it.name()) + " in the wreckage."); }
                else if (roll < 70) run.setLastReward("You scavenge " + earnGold(run, 20) + " gold.");
                else { startedBattle = true; startNodeBattle(run, node, NodeType.BATTLE, true); run.setLastReward("A scavenger's trap — ambush!"); }
            }
            case "DIG_MAP" -> {
                int g = earnGold(run, 25);
                SiegeItem it = grantRandomItem(run);
                run.setLastReward("X marks the spot: +" + g + " gold and " + (it == null ? "an item" : it.name()) + "!");
            }
            case "BLESS_SPEED" -> {
                if (run.getGold() < value) run.setLastReward("You can't afford the blessing.");
                else {
                    run.addGold(-value);
                    for (Combatant c : run.getParty()) c.setBaseSpeed(c.getBaseSpeed() + 1);
                    run.setLastReward("Foresight quickens the warband: +1 speed to all Siegelings.");
                }
            }
            default -> run.setLastReward(pick.desc == null ? "You move on." : pick.desc);
        }

        if (!startedBattle) {
            // Resolving an event peacefully (no fight triggered) is a "good outcome".
            awardPartyXp(run, SiegeTuning.XP_EVENT_GOOD);
            if (node != null) node.setCleared(true);
            checkpoint(run);
        }
        return serialize(run);
    }

    // ---- Items (equip / unequip) ------------------------------------------

    Map<String, Object> equipItem(String token, String itemId, String memberId) {
        SiegeRun run = require(token);
        if (run.getKnightBag().contains(itemId)) {
            throw new IllegalArgumentException("Knight consumables must be used from the knight's bag.");
        }
        if (!run.getInventory().contains(itemId)) throw new IllegalArgumentException("That item is not in your inventory.");
        Combatant member = run.getParty().stream().filter(m -> m.getId().equals(memberId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown Siegeling."));
        SiegeItem item = content.findItem(itemId);
        if (item == null) throw new IllegalArgumentException("Unknown item.");
        if (item.consumable()) throw new IllegalArgumentException("That item cannot be equipped.");
        validateEvolutionSigilEquip(member, item);
        // Unequip whatever the member currently holds (back to inventory).
        if (member.getItemId() != null) unequipToInventory(run, member);
        run.getInventory().remove(itemId);
        member.setItemId(itemId);
        if ("VITALITY".equals(item.kind())) { member.addBaseMaxHp(item.value()); }
        run.setLastReward(member.getName() + " equips " + item.name() + ".");
        checkpoint(run);
        return serialize(run);
    }

    private void validateEvolutionSigilEquip(Combatant member, SiegeItem item) {
        if (!item.evolutionSigil()) return;
        String cardId = member.getSourceCardId();
        if (cardId == null || cardId.isBlank()) {
            throw new IllegalArgumentException(member.getName() + " cannot equip an evolution sigil.");
        }
        if ("EVOLUTION2".equals(item.kind())) {
            if (!content.hasStage3EvolutionChain(cardId)) {
                throw new IllegalArgumentException(member.getName()
                        + " does not have a stage-3 evolution — only those Siegelings can equip an Evolution 2 Sigil.");
            }
        } else if (content.evolutionOf(cardId).isEmpty()) {
            throw new IllegalArgumentException(member.getName() + " has no evolution path for an Evolution Sigil.");
        }
    }

    Map<String, Object> unequipItem(String token, String memberId) {
        SiegeRun run = require(token);
        Combatant member = run.getParty().stream().filter(m -> m.getId().equals(memberId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown Siegeling."));
        if (member.getItemId() == null) return serialize(run);
        unequipToInventory(run, member);
        checkpoint(run);
        return serialize(run);
    }

    /** Use a knight-bag consumable on a party member or the knight: body { token, itemId, targetId }. */
    Map<String, Object> useKnightItem(String token, String itemId, String targetId) {
        SiegeRun run = require(token);
        if (targetId == null || targetId.isBlank()) throw new IllegalArgumentException("Choose a target.");
        if (!run.getKnightBag().contains(itemId)) throw new IllegalArgumentException("That item is not in the knight's bag.");
        SiegeItem item = content.findItem(itemId);
        if (item == null || !item.consumable()) throw new IllegalArgumentException("Unknown consumable.");

        SiegeBattle battle = run.getBattle();
        if (battle != null && battle.getPhase() != BattlePhase.PLAYER_INPUT) {
            throw new IllegalArgumentException("Cannot use items right now.");
        }

        Combatant target = resolveKnightItemTarget(run, battle, targetId);
        if (target == null) throw new IllegalArgumentException("Unknown target.");
        if (target.getSide() != Side.PLAYER) {
            throw new IllegalArgumentException("Knight items can only target your warband.");
        }
        Combatant merc = run.getMercenary();
        if (merc != null && merc.getId().equals(target.getId())) {
            throw new IllegalArgumentException("Mercenaries cannot use the knight's supplies.");
        }

        switch (item.kind()) {
            case "REVIVE" -> {
                if (target.isAlive()) throw new IllegalArgumentException("That Siegeling is still standing.");
                if (target.isKnight()) throw new IllegalArgumentException("The knight cannot be revived with a card.");
                int hp = Math.max(1, (int) Math.round(target.getMaxHp() * (item.value() / 100.0)));
                target.setHp(hp);
                run.setLastReward(target.getName() + " rises again at " + item.value() + "% strength!");
                if (battle != null) {
                    battle.log(run.getKnightName() + " plays " + item.name() + " — " + target.getName() + " returns!");
                    battle.event("revive", "targetId", target.getId(), "hp", target.getHp(), "maxHp", target.getMaxHp());
                }
            }
            case "HEAL" -> {
                if (!target.isAlive()) throw new IllegalArgumentException("That ally has fallen — use a Revive Card instead.");
                int before = target.getHp();
                target.setHp(before + (int) Math.round(target.getMaxHp() * (item.value() / 100.0)));
                int healed = target.getHp() - before;
                run.setLastReward(target.getName() + " drinks " + item.name() + " (+ " + healed + " HP).");
                if (battle != null) {
                    battle.log(run.getKnightName() + " shares " + item.name() + " with " + target.getName() + ".");
                    battle.event("heal", "targetId", target.getId(), "amount", healed, "hp", target.getHp());
                }
            }
            default -> throw new IllegalArgumentException("That item cannot be used.");
        }

        run.getKnightBag().remove(itemId);
        checkpoint(run);
        return serialize(run);
    }

    private Combatant resolveKnightItemTarget(SiegeRun run, SiegeBattle battle, String targetId) {
        if (battle != null) {
            for (Combatant c : battle.getCombatants()) {
                if (c.getId().equals(targetId)) return c;
            }
            return null;
        }
        Combatant knight = run.getKnightUnit();
        if (knight != null && knight.getId().equals(targetId)) return knight;
        return run.getParty().stream().filter(m -> m.getId().equals(targetId)).findFirst().orElse(null);
    }

    private void unequipToInventory(SiegeRun run, Combatant member) {
        SiegeItem item = content.findItem(member.getItemId());
        if (item != null && "VITALITY".equals(item.kind())) {
            member.addBaseMaxHp(-item.value());
        }
        run.getInventory().add(member.getItemId());
        member.setItemId(null);
    }

    // ---- Small shared helpers ---------------------------------------------

    private int healParty(SiegeRun run, double frac) {
        int healed = 0;
        for (Combatant ally : run.getParty()) {
            if (ally.isAlive()) { int b = ally.getHp(); ally.setHp(b + (int) Math.round(ally.getMaxHp() * frac)); healed += ally.getHp() - b; }
        }
        if (run.getKnightUnit() != null && run.getKnightUnit().isAlive()) {
            int b = run.getKnightUnit().getHp();
            run.getKnightUnit().setHp(b + (int) Math.round(run.getKnightUnit().getMaxHp() * frac));
            healed += run.getKnightUnit().getHp() - b;
        }
        return healed;
    }

    private int healPartyFlat(SiegeRun run, int amount) {
        int healed = 0;
        for (Combatant ally : run.getParty()) {
            if (ally.isAlive()) { int b = ally.getHp(); ally.heal(amount); healed += ally.getHp() - b; }
        }
        return healed;
    }

    private void hurtParty(SiegeRun run, int amount) {
        for (Combatant ally : run.getParty()) if (ally.isAlive()) ally.takeDamage(amount);
    }

    private SiegeItem grantRandomItem(SiegeRun run) {
        List<SiegeItem> items = content.randomItems(1, rng);
        if (items.isEmpty()) return null;
        run.getInventory().add(items.get(0).id());
        return items.get(0);
    }

    // ---- Rewards ----------------------------------------------------------

    /** Percent chance a normal win also offers an evolution sigil. */
    private static final int SIGIL_REWARD_CHANCE = 22;
    /** Elites are the reliable source of sigils. */
    private static final int SIGIL_REWARD_CHANCE_ELITE = 40;
    /** Of the sigil offers, the share that upgrade to the stage-3 sigil. */
    private static final int SIGIL_REWARD_STAGE3_SHARE = 25;

    private void generateRewards(SiegeRun run, boolean elite) {
        run.getPendingRewards().clear();
        int optId = 0;

        // Two new-card offers, each bound to a random living Siegeling.
        List<Combatant> living = run.getParty().stream().filter(Combatant::isAlive).toList();
        if (living.isEmpty()) return;
        for (int i = 0; i < 2; i++) {
            Combatant owner = living.get(rng.nextInt(living.size()));
            AbilitySpec spec = content.randomCardRewardFor(owner.getElement(), rng);
            run.getPendingRewards().add(RewardOption.card(
                    "r" + (optId++),
                    spec.name(),
                    spec.description() + " · learned by " + owner.getName(),
                    spec.element(), spec, owner.getId()));
        }

        // Elite wins can recruit a new Siegeling (until the warband is full);
        // otherwise offer an upgrade to a random existing card.
        boolean recruited = false;
        boolean offerRecruit = elite && run.getParty().size() < content.partyMax();
        if (offerRecruit) {
            List<String> names = run.getParty().stream().map(Combatant::getName).toList();
            var recruit = content.randomRecruit(names, rng);
            if (recruit.isPresent()) {
                var s = recruit.get();
                run.getPendingRewards().add(RewardOption.recruit(
                        "r" + (optId++),
                        s.getName() + " joins!",
                        s.getName() + " (" + s.getElement().name() + ") joins the warband with its moves.",
                        s.getElement(), s.getCardArtUrl(), s.getId()));
                recruited = true;
            }
        }
        if (!recruited && !run.getDeckTemplates().isEmpty()) {
            int idx = rng.nextInt(run.getDeckTemplates().size());
            SiegeCard target = run.getDeckTemplates().get(idx);
            AbilitySpec upgraded = content.upgradeSpec(target.getSpec());
            run.getPendingRewards().add(RewardOption.upgrade(
                    "r" + (optId++),
                    "Upgrade " + target.getSpec().name(),
                    target.getSpec().name() + " becomes " + upgraded.name() + " ("
                            + describeUpgrade(target.getSpec(), upgraded) + ").",
                    target.getSpec().element(), idx));
        }
        addEvolutionSigilOffer(run, living, elite, optId);
    }

    /**
     * Sometimes adds an evolution sigil to the spoils — the item that starts a
     * Siegeling's battle already evolved. Only offered when somebody in the
     * warband could actually equip it and none is already spare, so the choice
     * is never a dead pick.
     */
    private void addEvolutionSigilOffer(SiegeRun run, List<Combatant> living, boolean elite, int optId) {
        if (rng.nextInt(100) >= (elite ? SIGIL_REWARD_CHANCE_ELITE : SIGIL_REWARD_CHANCE)) return;
        boolean stage3 = living.stream().anyMatch(m -> m.getSourceCardId() != null
                && content.hasStage3EvolutionChain(m.getSourceCardId()));
        // The stage-3 sigil is the rarer prize, and only when someone can use it.
        String itemId = stage3 && rng.nextInt(100) < SIGIL_REWARD_STAGE3_SHARE
                ? "evolution-2-sigil" : "evolution-sigil";
        boolean usable = living.stream().anyMatch(m -> {
            String cardId = m.getSourceCardId();
            if (cardId == null || cardId.isBlank()) return false;
            return "evolution-2-sigil".equals(itemId)
                    ? content.hasStage3EvolutionChain(cardId)
                    : content.evolutionOf(cardId).isPresent();
        });
        if (!usable || run.getInventory().contains(itemId)) return;
        SiegeItem item = content.findItem(itemId);
        if (item == null) return;
        run.getPendingRewards().add(RewardOption.item(
                "r" + optId, item.icon() + " " + item.name(),
                item.effectText() + " · equip it from your inventory.", item.id()));
    }

    private String describeUpgrade(AbilitySpec from, AbilitySpec to) {
        if (to.value() != from.value() && to.actionCost() != from.actionCost()) {
            return from.value() + "→" + to.value() + " power, " + from.actionCost() + "→" + to.actionCost() + " actions";
        }
        if (to.value() != from.value()) return from.value() + "→" + to.value() + " power";
        return from.actionCost() + "→" + to.actionCost() + " actions";
    }

    /** Applies the chosen reward ("skip" forfeits the choice). */
    Map<String, Object> chooseReward(String token, String optionId) {
        SiegeRun run = require(token);
        if (run.getPendingRewards().isEmpty()) return serialize(run);
        if (!"skip".equalsIgnoreCase(String.valueOf(optionId))) {
            RewardOption pick = run.getPendingRewards().stream()
                    .filter(o -> o.id().equals(optionId)).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Unknown reward option."));
            applyReward(run, pick);
        } else {
            run.setLastReward("The party pressed on without spoils.");
        }
        run.getPendingRewards().clear();
        run.setLastXpRecap(null);
        checkpoint(run);
        return serialize(run);
    }

    private void applyReward(SiegeRun run, RewardOption pick) {
        switch (pick.kind()) {
            case "CARD" -> {
                run.getDeckTemplates().add(new SiegeCard(
                        "reward-" + pick.id() + "-" + run.getDeckTemplates().size(),
                        pick.ownerId(), pick.cardSpec()));
                run.setLastReward("Added " + pick.cardSpec().name() + " to the deck.");
            }
            case "UPGRADE" -> {
                int idx = pick.templateIndex();
                if (idx >= 0 && idx < run.getDeckTemplates().size()) {
                    SiegeCard old = run.getDeckTemplates().get(idx);
                    AbilitySpec upgraded = content.upgradeSpec(old.getSpec());
                    run.getDeckTemplates().set(idx, new SiegeCard(old.getInstanceId(), old.getOwnerId(), upgraded));
                    run.setLastReward(old.getSpec().name() + " was upgraded to " + upgraded.name() + ".");
                }
            }
            case "ITEM" -> {
                SiegeItem item = content.findItem(pick.itemId());
                if (item != null) {
                    run.getInventory().add(item.id());
                    run.setLastReward(item.name() + " went into your pack — equip it from Items.");
                }
            }
            case "RECRUIT" -> content.findSiegling(pick.sieglingId()).ifPresent(s -> {
                Combatant member = content.toPartyCombatant(s, run.getParty().size());
                member.setPosition(run.getParty().size());
                applyJoinBonus(run, member);
                run.getParty().add(member);
                run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
                noteDiscovery(run, s.getId());
                run.setLastReward(s.getName() + " joined the warband!");
                queueRecruitReveal(run, s, member);
            });
            default -> { }
        }
    }

    Map<String, Object> playCard(String token, String cardInstanceId, String targetId) {
        SiegeRun run = require(token);
        SiegeCombatEngine.PlayResult result = engine.playCard(run, cardInstanceId, targetId, rng);
        checkpoint(run);
        Map<String, Object> out = serialize(run);
        if (!result.ok && result.message != null) out.put("error", result.message);
        return out;
    }

    Map<String, Object> endTurn(String token) {
        SiegeRun run = require(token);
        engine.endPlayerTurn(run, rng);
        checkpoint(run);
        return serialize(run);
    }

    /** Fires the Knight Ultimate (not a card; 0 AP; needs 20 Charge). */
    Map<String, Object> knightUltimate(String token) {
        SiegeRun run = require(token);
        SiegeCombatEngine.PlayResult result = engine.useKnightUltimate(run, rng);
        checkpoint(run);
        Map<String, Object> out = serialize(run);
        if (!result.ok && result.message != null) out.put("error", result.message);
        return out;
    }

    private List<Element> elementPaletteFor(SiegeRun run) {
        // Bias enemies toward elements that counter the party for a bit of tension,
        // but fall back to the live palette so content stays valid.
        return content.defaultPalette();
    }

    // ---- Knight roguelike classes (dashboard admin) -----------------------

    Map<String, Object> listItems() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (SiegeItem it : content.allItems()) items.add(serializeItem(it));
        return Map.of("items", items,
                "kinds", List.of("VITALITY", "ATTACK", "SPEED", "SHIELD", "EVOLUTION", "EVOLUTION2"));
    }

    Map<String, Object> createItem(String editorToken, String name, String icon, String kind, int value) {
        if (editorAuth == null) throw new IllegalArgumentException("Editor auth is unavailable.");
        editorAuth.requireEditor(editorToken);
        content.createItem(name, icon, kind, value);
        return listItems();
    }

    Map<String, Object> listKnightClasses() {
        List<Map<String, Object>> knights = new ArrayList<>();
        for (TrainerCard k : content.selectableKnights()) {
            KnightPassive kind = content.knightPassiveKind(k);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", k.getId());
            m.put("name", k.getName());
            m.put("element", k.getElement().name());
            m.put("passive", kind.name());
            m.put("className", content.knightPassiveName(kind));
            m.put("overridden", content.classOverrides()
                    .containsKey(k.getId().trim().toLowerCase(java.util.Locale.ROOT)));
            knights.add(m);
        }
        List<Map<String, Object>> classes = new ArrayList<>();
        for (KnightPassive kind : KnightPassive.values()) {
            classes.add(Map.of("id", kind.name(), "name", content.knightPassiveName(kind)));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("knights", knights);
        out.put("classes", classes);
        return out;
    }

    Map<String, Object> assignKnightClass(String editorToken, String trainerId, String passiveName) {
        if (editorAuth == null) throw new IllegalArgumentException("Editor auth is unavailable.");
        editorAuth.requireEditor(editorToken); // throws when not an authenticated editor
        KnightPassive passive = null;
        if (passiveName != null && !passiveName.isBlank() && !"DEFAULT".equalsIgnoreCase(passiveName)) {
            try {
                passive = KnightPassive.valueOf(passiveName.trim().toUpperCase(java.util.Locale.ROOT));
            } catch (IllegalArgumentException ex) {
                throw new IllegalArgumentException("Unknown class: " + passiveName);
            }
        }
        content.assignClass(trainerId, passive);
        return listKnightClasses();
    }

    Map<String, Object> listEvents() {
        List<Map<String, Object>> events = new ArrayList<>();
        for (SiegeContentService.EventDef ev : content.allEvents()) {
            List<Map<String, Object>> choices = new ArrayList<>();
            for (SiegeContentService.EventChoice ch : ev.choices()) {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("label", ch.label());
                c.put("outcome", ch.outcome());
                c.put("value", ch.value());
                c.put("flavor", ch.flavor());
                choices.add(c);
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", ev.id());
            m.put("title", ev.title());
            m.put("icon", ev.icon());
            m.put("prompt", ev.prompt());
            m.put("choices", choices);
            events.add(m);
        }
        List<Map<String, Object>> outcomes = new ArrayList<>();
        outcomes.add(Map.of("code", "GOLD", "description", "Grants gold (value = amount)."));
        outcomes.add(Map.of("code", "PAY_GOLD", "description", "Pays gold; ambush if you cannot afford (value = cost)."));
        outcomes.add(Map.of("code", "HEAL", "description", "Heals the whole party (value = HP)."));
        outcomes.add(Map.of("code", "SNEAK", "description", "50% pass; on fail, party takes damage (value = damage)."));
        outcomes.add(Map.of("code", "AMBUSH", "description", "Starts a battle immediately."));
        outcomes.add(Map.of("code", "AMBUSH_ELITE", "description", "Starts an elite battle immediately."));
        outcomes.add(Map.of("code", "ITEM_HEALTHCOST", "description", "Party loses HP, then receives a random item (value = HP cost)."));
        outcomes.add(Map.of("code", "BLEED_ITEM", "description", "Party loses HP, then receives a random item (value = HP cost)."));
        outcomes.add(Map.of("code", "RECRUIT_CHANCE", "description", "Recruits a Siegeling if the party has room; otherwise grants an item."));
        outcomes.add(Map.of("code", "SEARCH", "description", "Random loot: item, gold, or ambush."));
        outcomes.add(Map.of("code", "DIG_MAP", "description", "Grants gold and a random item."));
        outcomes.add(Map.of("code", "BLESS_SPEED", "description", "Pays gold for +1 speed to all Siegelings (value = gold cost)."));
        outcomes.add(Map.of("code", "NOTHING", "description", "No mechanical effect; shows flavor text only."));
        return Map.of("events", events, "outcomes", outcomes);
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> createEvent(String editorToken, String title, String icon, String prompt, Object choicesRaw) {
        if (editorAuth == null) throw new IllegalArgumentException("Editor auth is unavailable.");
        editorAuth.requireEditor(editorToken);
        List<SiegeContentService.EventChoice> choices = new ArrayList<>();
        if (choicesRaw instanceof List<?> list) {
            for (Object row : list) {
                if (!(row instanceof Map<?, ?> m)) continue;
                String label = m.get("label") == null ? "" : String.valueOf(m.get("label"));
                String outcome = m.get("outcome") == null ? "NOTHING" : String.valueOf(m.get("outcome"));
                int value = 0;
                try { value = Integer.parseInt(String.valueOf(m.get("value"))); } catch (NumberFormatException ignored) { }
                String flavor = m.get("flavor") == null ? "" : String.valueOf(m.get("flavor"));
                choices.add(new SiegeContentService.EventChoice(label, outcome, value, flavor));
            }
        }
        content.createEvent(title, icon, prompt, choices);
        return listEvents();
    }

    // ---- Serialization --------------------------------------------------

    /** Compact JSON for a list of ability specs (detail modals / shop cards). */
    private List<Map<String, Object>> serializeSpecs(List<AbilitySpec> specs) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (AbilitySpec spec : specs) out.add(serializeSpec(spec));
        return out;
    }

    private Map<String, Object> serializeSpec(AbilitySpec spec) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("name", spec.name());
        s.put("element", spec.element() == null ? null : spec.element().name());
        s.put("effect", spec.effect().name());
        s.put("value", spec.value());
        s.put("actionCost", spec.actionCost());
        s.put("target", spec.target().name());
        s.put("description", spec.description());
        if (spec.status() != null && spec.statusChance() > 0) {
            s.put("status", spec.status().name());
            s.put("statusChance", spec.statusChance());
        }
        return s;
    }

    private Map<String, Object> serialize(SiegeRun run) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("token", run.getToken());
        m.put("status", run.getStatus().name());
        m.put("currentNodeId", run.getCurrentNodeId());
        m.put("lastReward", run.getLastReward());
        m.put("deckSize", run.getDeckTemplates().size());
        m.put("gold", run.getGold());
        m.put("mode", run.getMode().name());
        // Which account save this run occupies — the client labels the HUD and the
        // resume prompt from it, so the two modes never read as the same save.
        m.put("slot", RunSlot.of(run.getMode()).name());
        m.put("slotLabel", RunSlot.of(run.getMode()).label());
        m.put("score", run.getScore());
        m.put("loop", run.getLoop());
        m.put("partyMax", content.partyMax());
        if (run.isBattlegrounds()) {
            // HUD badge + reward hints for the Battlegrounds run.
            m.put("battlegrounds", true);
            m.put("avgVeteranLevel", run.getAverageVeteranLevel());
            m.put("bgTierScalar", run.getBgTierScalar());
            m.put("bgTier", run.getBgTier());
            m.put("goldMult", SiegeTuning.BG_GOLD_MULT * SiegeTuning.bgTierRewardMult(run.getBgTier()));
            m.put("scoreMult", SiegeTuning.BG_SCORE_MULT * SiegeTuning.bgTierRewardMult(run.getBgTier()));
            // Active boons (chosen) + a pending offer the player must pick from.
            List<Map<String, Object>> chosen = new ArrayList<>();
            for (String id : run.getBoons()) {
                SiegeBoon b = SiegeBoon.byId(id);
                if (b != null) chosen.add(b.toMap());
            }
            m.put("boons", chosen);
            if (run.isAwaitingBoonPick()) {
                List<Map<String, Object>> offer = new ArrayList<>();
                for (String id : run.getBoonOffer()) {
                    SiegeBoon b = SiegeBoon.byId(id);
                    if (b != null) offer.add(b.toMap());
                }
                m.put("boonOffer", offer);
            } else {
                m.put("boonOffer", null);
            }
            m.put("bossReveal", run.getBossReveal());
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("nodesCleared", run.getNodesCleared());
        stats.put("bossKills", run.getBossKills());
        stats.put("enemiesDefeated", run.getEnemiesDefeated());
        stats.put("goldEarned", run.getGoldEarnedTotal());
        m.put("stats", stats);
        m.put("endRewards", run.getEndRewards());
        m.put("xpRecap", run.getLastXpRecap());
        m.put("extraction", run.getVeteranTeam());
        m.put("recruit", run.getPendingRecruit());
        if (run.getMercenary() != null) {
            Combatant merc = run.getMercenary();
            m.put("mercenary", Map.of("name", merc.getName(),
                    "element", merc.getElement() == null ? "NEUTRAL" : merc.getElement().name(),
                    "hp", merc.getHp(), "maxHp", merc.getMaxHp()));
        } else {
            m.put("mercenary", null);
        }

        // Interactive camp stop (rest / trader / broker).
        if (run.isInCamp()) {
            Map<String, Object> camp = new LinkedHashMap<>();
            camp.put("note", run.getCampNote());
            List<Map<String, Object>> options = new ArrayList<>();
            for (CampOption o : run.getCampOptions()) {
                Map<String, Object> om = new LinkedHashMap<>();
                om.put("id", o.id);
                om.put("kind", o.kind);
                om.put("title", o.title);
                om.put("desc", o.desc);
                om.put("cost", o.cost);
                om.put("element", o.element == null ? null : o.element.name());
                om.put("artUrl", o.artUrl);
                om.put("used", o.used);
                om.put("affordable", run.getGold() >= o.cost);
                if (o.cardSpec != null) om.put("card", serializeSpec(o.cardSpec));
                options.add(om);
            }
            camp.put("options", options);
            m.put("camp", camp);
        } else {
            m.put("camp", null);
        }

        // Cache dig minigame.
        if (run.isInCache()) {
            Map<String, Object> cache = new LinkedHashMap<>();
            cache.put("game", run.getCacheGame());
            List<Map<String, Object>> copts = new ArrayList<>();
            for (CampOption o : run.getCacheOptions()) {
                Map<String, Object> om = new LinkedHashMap<>();
                om.put("id", o.id);
                om.put("kind", o.kind);
                om.put("title", o.title);
                om.put("desc", o.desc);
                om.put("cost", o.cost);
                om.put("used", o.used);
                om.put("affordable", run.getGold() >= o.cost);
                copts.add(om);
            }
            cache.put("options", copts);
            cache.put("loot", run.getCacheGold());
            cache.put("digs", run.getCacheDigs());
            cache.put("maxDigs", 4);
            cache.put("bustChance", Math.min(85, 15 + run.getCacheDigs() * 20));
            m.put("cache", cache);
        } else {
            m.put("cache", null);
        }

        // Broker stall: permanent recruits when the warband has room, mercenary
        // rentals when it is full (and always one merc alternative while hiring).
        if (run.isInBroker()) {
            boolean partyFull = run.getParty().size() >= content.partyMax();
            // Merc-only stalls (full party) expose rental prices; open stalls expose
            // hire/swap prices. Per-offer cost/kind still win for mixed menus.
            boolean mercOnly = partyFull;
            Map<String, Object> broker = new LinkedHashMap<>();
            broker.put("hireCost", mercOnly ? MERC_RENT_COST : BROKER_HIRE_COST);
            broker.put("swapCost", mercOnly ? MERC_RENT_COST : BROKER_SWAP_COST);
            broker.put("merc", mercOnly);
            broker.put("mercUnderContract", run.getMercenary() != null);
            broker.put("partyFull", partyFull);
            List<Map<String, Object>> offers = new ArrayList<>();
            for (CampOption o : run.getBrokerOptions()) {
                Map<String, Object> om = new LinkedHashMap<>();
                boolean mercOffer = "MERC".equals(o.kind);
                om.put("id", o.id);
                om.put("kind", o.kind);
                om.put("merc", mercOffer);
                om.put("cost", o.cost);
                om.put("name", o.title.replace(" joins for hire", "").replace(" — mercenary", ""));
                om.put("element", o.element == null ? null : o.element.name());
                om.put("artUrl", o.artUrl);
                om.put("used", o.used);
                SieglingCard src = content.findSiegling(o.sieglingId).orElse(null);
                if (src != null) {
                    om.put("hp", 18 + src.getHealth() * 4);
                    om.put("speed", Math.max(4, src.getSpeed()));
                    om.put("moves", serializeSpecs(content.moveSpecs(src)));
                    om.put("evolves", content.evolutionOf(src.getId()).isPresent());
                }
                offers.add(om);
            }
            broker.put("offers", offers);
            m.put("broker", broker);
        } else {
            m.put("broker", null);
        }

        m.put("checkpoint", run.isCheckpointSaved());

        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("id", run.getKnightId());
        knight.put("name", run.getKnightName());
        knight.put("element", run.getKnightElement() == null ? null : run.getKnightElement().name());
        knight.put("passive", run.getKnightPassiveDesc());
        knight.put("passiveKind", run.getKnightPassive() == null ? null : run.getKnightPassive().name());
        knight.put("passiveName", run.getKnightPassive() == null ? null : content.knightPassiveName(run.getKnightPassive()));
        knight.put("active", run.getKnightActive() == null ? null : run.getKnightActive().name());
        knight.put("activeSpec", run.getKnightActive() == null ? null : serializeSpec(run.getKnightActive()));
        if (run.getKnightUnit() != null) {
            knight.put("unitId", run.getKnightUnit().getId());
            knight.put("hp", run.getKnightUnit().getHp());
            knight.put("maxHp", run.getKnightUnit().getMaxHp());
            knight.put("artUrl", run.getKnightUnit().getArtUrl() != null
                    ? run.getKnightUnit().getArtUrl() : knightArtUrl(run.getKnightId()));
            knight.put("alive", run.getKnightUnit().isAlive());
            putKnightLeveling(knight, run.getKnightUnit());
        }
        m.put("knight", knight);

        List<Map<String, Object>> party = new ArrayList<>();
        for (Combatant c : run.getParty()) {
            Map<String, Object> pm = serializeCombatant(c, false);
            // This member's cards in the shared deck — powers the detail modal.
            List<AbilitySpec> cards = new ArrayList<>();
            for (SiegeCard card : run.getDeckTemplates()) {
                if (card.getOwnerId().equals(c.getId())) cards.add(card.getSpec());
            }
            pm.put("cards", serializeSpecs(cards));
            pm.put("evolvesTo", content.evolutionOf(c.getSourceCardId())
                    .map(SieglingCard::getName).orElse(null));
            party.add(pm);
        }
        m.put("party", party);

        // A rental under contract travels with the warband, so it stands with them
        // at every stop until its battle ends. It is kept out of "party" on purpose:
        // that list drives equipping, evolving and smith scrapping, none of which a
        // merc is eligible for. The UI appends this entry for display only.
        Combatant mercUnit = run.getMercenary();
        if (mercUnit != null) {
            Map<String, Object> mm = serializeCombatant(mercUnit, false);
            List<AbilitySpec> mercSpecs = new ArrayList<>();
            for (SiegeCard card : run.getMercCards()) mercSpecs.add(card.getSpec());
            mm.put("cards", serializeSpecs(mercSpecs));
            mm.put("merc", true);
            m.put("mercenary", mm);
        } else {
            m.put("mercenary", null);
        }

        // Deck list (indices) — powers the Smith scrap picker.
        List<Map<String, Object>> deckList = new ArrayList<>();
        List<SiegeCard> templates = run.getDeckTemplates();
        for (int i = 0; i < templates.size(); i++) {
            SiegeCard tpl = templates.get(i);
            AbilitySpec spec = tpl.getSpec();
            Combatant owner = run.getParty().stream()
                    .filter(c -> c.getId().equals(tpl.getOwnerId())).findFirst().orElse(null);
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("index", i);
            d.put("name", spec.name());
            d.put("element", spec.element() == null ? null : spec.element().name());
            d.put("owner", owner == null ? (tpl.getOwnerId().startsWith("knight-") ? run.getKnightName() : "—") : owner.getName());
            deckList.add(d);
        }
        m.put("deckList", deckList);

        // Inventory (unequipped items) + full item catalog for equip UI.
        List<Map<String, Object>> inv = new ArrayList<>();
        for (String id : run.getInventory()) {
            Map<String, Object> im = serializeItem(content.findItem(id));
            if (im != null) inv.add(im);
        }
        m.put("inventory", inv);

        List<Map<String, Object>> knightBag = new ArrayList<>();
        for (String id : run.getKnightBag()) {
            Map<String, Object> im = serializeItem(content.findItem(id));
            if (im != null) knightBag.add(im);
        }
        m.put("knightBag", knightBag);

        // Smith / Caravan / Event interactive stops.
        m.put("smith", run.isInSmith() ? serializeOptionStop(run, run.getSmithOptions(), null) : null);
        m.put("caravan", run.isInCaravan() ? serializeOptionStop(run, run.getCaravanOptions(), null) : null);
        if (run.isInEvent()) {
            Map<String, Object> ev = serializeOptionStop(run, run.getEventOptions(), null);
            ev.put("title", run.getEventTitle());
            ev.put("prompt", run.getEventPrompt());
            ev.put("icon", run.getEventIcon());
            m.put("event", ev);
        } else {
            m.put("event", null);
        }

        // Cache/event puzzle mini-game (LINE / RPS / MATCH).
        m.put("minigame", run.isInMinigame() ? serializeMinigame(run) : null);

        List<Integer> reachable = run.reachableNodeIds();
        List<Map<String, Object>> map = new ArrayList<>();
        for (SiegeNode node : run.getMap()) {
            Map<String, Object> n = new LinkedHashMap<>();
            n.put("id", node.getId());
            n.put("row", node.getRow());
            n.put("col", node.getCol());
            n.put("type", node.getType().name());
            n.put("label", node.getLabel());
            n.put("cleared", node.isCleared());
            n.put("current", node.getId() == run.getCurrentNodeId());
            n.put("reachable", reachable.contains(node.getId()));
            n.put("next", new ArrayList<>(node.getNext()));
            map.add(n);
        }
        m.put("map", map);

        List<Map<String, Object>> rewards = new ArrayList<>();
        for (RewardOption option : run.getPendingRewards()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", option.id());
            r.put("kind", option.kind());
            r.put("title", option.title());
            r.put("desc", option.desc());
            r.put("element", option.element() == null ? null : option.element().name());
            r.put("artUrl", option.artUrl());
            if (option.itemId() != null) {
                SiegeItem item = content.findItem(option.itemId());
                r.put("itemId", option.itemId());
                r.put("itemIcon", item == null ? null : item.icon());
            }
            if (option.cardSpec() != null) {
                r.put("cardEffect", option.cardSpec().effect().name());
                r.put("cardValue", option.cardSpec().value());
                r.put("cardCost", option.cardSpec().actionCost());
                r.put("cardTarget", option.cardSpec().target().name());
            }
            rewards.add(r);
        }
        m.put("pendingRewards", rewards);

        SiegeBattle battle = run.getBattle();
        m.put("battle", battle == null ? null : serializeBattle(run, battle));
        return m;
    }

    private Map<String, Object> serializeBattle(SiegeRun run, SiegeBattle battle) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("phase", battle.getPhase().name());
        b.put("roundNumber", battle.getRoundNumber());
        b.put("playerActsFirst", battle.isPlayerActsFirst());
        b.put("playerSpeed", battle.getPlayerSpeed());
        b.put("enemySpeed", battle.getEnemySpeed());
        b.put("actionPoints", battle.getActionPoints());
        b.put("maxActionPoints", SiegeBattle.ACTIONS_PER_TURN);
        b.put("handMax", SiegeBattle.HAND_MAX);
        b.put("leadId", battle.getLeadId());
        b.put("nodeType", battle.getNodeType().name());
        b.put("deckCount", battle.getDeck().size());
        b.put("discardCount", battle.getDiscard().size());
        b.put("log", new ArrayList<>(battle.getLog()));
        // Structured turn ledger: each action with the card behind it, by round.
        b.put("turnLog", new ArrayList<>(battle.getTurnLog()));

        // The Knight: HP, Ultimate Charge, and readiness for the HUD.
        Combatant knightUnit = battle.knight();
        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("id", run.getKnightId());
        knight.put("name", run.getKnightName());
        knight.put("element", run.getKnightElement() == null ? null : run.getKnightElement().name());
        if (knightUnit != null) {
            knight.put("id", knightUnit.getId());
            knight.put("hp", knightUnit.getHp());
            knight.put("maxHp", knightUnit.getMaxHp());
            knight.put("artUrl", knightUnit.getArtUrl() != null
                    ? knightUnit.getArtUrl() : knightArtUrl(run.getKnightId()));
            putKnightLeveling(knight, knightUnit);
        }
        knight.put("charge", battle.getKnightCharge());
        knight.put("ultCost", SiegeBattle.KNIGHT_ULT_COST);
        knight.put("ultReady", knightUnit != null && knightUnit.isAlive()
                && battle.getKnightCharge() >= SiegeBattle.KNIGHT_ULT_COST);
        b.put("knight", knight);

        List<Map<String, Object>> allies = new ArrayList<>();
        List<Map<String, Object>> foes = new ArrayList<>();
        for (Combatant c : battle.getCombatants()) {
            if (c.isKnight()) continue;
            Map<String, Object> cm = serializeCombatant(c, c.getSide() == Side.ENEMY);
            if (c.getSide() == Side.PLAYER) allies.add(cm); else foes.add(cm);
        }
        // Present the line in notch order so positions read left → right.
        allies.sort((x, y) -> Integer.compare((int) x.getOrDefault("position", 0), (int) y.getOrDefault("position", 0)));
        b.put("allies", allies);
        b.put("enemies", foes);

        // Which notches are threatened by telegraphed enemy attacks.
        List<Integer> targetedPositions = new ArrayList<>();
        boolean sweepIncoming = false;
        for (Combatant foe : battle.living(Side.ENEMY)) {
            AbilitySpec intent = foe.getIntent();
            if (intent == null || intent.effect() != Effect.DAMAGE) continue;
            if (intent.target() == TargetKind.ALL_ENEMIES) sweepIncoming = true;
            else if (foe.getIntentPosition() >= 0 && !targetedPositions.contains(foe.getIntentPosition())) {
                targetedPositions.add(foe.getIntentPosition());
            }
        }
        b.put("targetedPositions", targetedPositions);
        b.put("sweepIncoming", sweepIncoming);

        // Presentation events since the last response, for client playback.
        b.put("events", new ArrayList<>(battle.getEvents()));
        battle.getEvents().clear();

        List<Map<String, Object>> hand = new ArrayList<>();
        boolean playerTurn = battle.getPhase() == BattlePhase.PLAYER_INPUT;
        for (SiegeCard card : battle.getHand()) {
            AbilitySpec spec = card.getSpec();
            Combatant owner = battle.findCombatant(card.getOwnerId());
            boolean knightCard = card.getOwnerId().startsWith(SiegeCombatEngine.KNIGHT_OWNER_PREFIX);
            boolean ownerAlive = knightCard
                    ? (knightUnit != null ? knightUnit.isAlive() : !battle.living(Side.PLAYER).isEmpty())
                    : owner != null && owner.isAlive();
            boolean ownerReady = knightCard || owner == null || !owner.has(StatusKind.STUN);
            Combatant swinging = knightCard ? knightUnit : owner;
            int displayCost = engine.effectiveCost(battle, spec, swinging);
            boolean affordable = battle.getActionPoints() >= displayCost;
            // Evolution cards also require the owner's gauge (5 AP of own moves).
            boolean gaugeOk = spec.effect() != Effect.EVOLVE
                    || (owner != null && owner.getApSpent() >= SiegeBattle.EVOLVE_GAUGE
                    && !owner.has(StatusKind.CURSE));
            Map<String, Object> h = new LinkedHashMap<>();
            h.put("instanceId", card.getInstanceId());
            h.put("name", spec.name());
            h.put("element", spec.element().name());
            h.put("effect", spec.effect().name());
            h.put("value", spec.value());
            if (spec.effect() == Effect.DAMAGE || spec.effect() == Effect.HEAL
                    || spec.effect() == Effect.SHIELD || spec.effect() == Effect.MAX_HP_BOOST) {
                // Attack buffs + Blind (Light −1) land on the unit that will act,
                // so the hand preview matches the resolved number.
                int preview = spec.value() + (spec.effect() == Effect.DAMAGE && swinging != null
                        ? swinging.getAttackBuff() : 0);
                if (swinging != null && swinging.has(StatusKind.BLIND)) {
                    preview = Math.max(0, preview - 1);
                }
                h.put("boostedValue", preview);
            }
            h.put("target", spec.target().name());
            h.put("actionCost", displayCost);
            h.put("description", spec.description());
            if (spec.status() != null && spec.statusChance() > 0) {
                h.put("status", spec.status().name());
                h.put("statusChance", spec.statusChance());
            }
            h.put("ownerId", card.getOwnerId());
            h.put("ownerName", knightCard ? run.getKnightName() : (owner == null ? "" : owner.getName()));
            h.put("needsTarget", spec.needsExplicitTarget());
            if (spec.effect() == Effect.EVOLVE && owner != null) {
                h.put("gauge", Math.min(owner.getApSpent(), SiegeBattle.EVOLVE_GAUGE));
                h.put("gaugeMax", SiegeBattle.EVOLVE_GAUGE);
                if (owner.has(StatusKind.CURSE)) {
                    h.put("blockedBy", "CURSE");
                }
            }
            h.put("playable", playerTurn && ownerAlive && ownerReady && affordable && gaugeOk);
            hand.add(h);
        }
        b.put("hand", hand);
        return b;
    }

    private Map<String, Object> serializeItem(SiegeItem item) {
        if (item == null) return null;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", item.id());
        m.put("name", item.name());
        m.put("icon", item.icon());
        m.put("kind", item.kind());
        m.put("value", item.value());
        m.put("effect", item.effectText());
        m.put("desc", item.desc());
        return m;
    }

    private Map<String, Object> serializeOptionStop(SiegeRun run, List<CampOption> options, String note) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (note != null) out.put("note", note);
        List<Map<String, Object>> opts = new ArrayList<>();
        for (CampOption o : options) {
            Map<String, Object> om = new LinkedHashMap<>();
            om.put("id", o.id);
            om.put("kind", o.kind);
            om.put("title", o.title);
            om.put("desc", o.desc);
            om.put("cost", o.cost);
            om.put("element", o.element == null ? null : o.element.name());
            om.put("used", o.used);
            om.put("affordable", run.getGold() >= o.cost);
            om.put("templateIndex", o.templateIndex);
            if ("SHOP_ITEM".equals(o.kind) && o.sieglingId != null) {
                om.put("item", serializeItem(content.findItem(o.sieglingId)));
            }
            opts.add(om);
        }
        out.put("options", opts);
        return out;
    }

    /**
     * The authored physical size band of the card a unit is drawn from, or null when it
     * is not a Siegeling at all (the SiegeKnight). Unset bands fall back to the
     * rarity/evolution-depth default, the same call {@code KeepService} makes — the
     * catalog normally fills this in at load, so the fallback only covers cards that
     * arrived straight from a Firestore override.
     */
    private String sizeBandOf(Combatant c) {
        return content.findAnySiegling(c.getDisplayCardId())
                .map(card -> (card.getSize() != null ? card.getSize()
                        : SieglingSize.defaultFor(card.getRarity(), content.stageOf(card) - 1)).name())
                .orElse(null);
    }

    /** Adds the SiegeKnight's leveling fields (badge + XP bar) to a serialized knight map. */
    private void putKnightLeveling(Map<String, Object> knight, Combatant unit) {
        knight.put("level", unit.getLevel());
        knight.put("xp", unit.getXp());
        knight.put("xpToNext", SiegeTuning.xpToNext(unit.getXp()));
        knight.put("xpInLevel", unit.getXp() - SiegeTuning.xpForLevel(unit.getLevel()));
        knight.put("xpSpan", unit.getLevel() >= SiegeTuning.MAX_LEVEL ? 0
                : SiegeTuning.xpForLevel(unit.getLevel() + 1) - SiegeTuning.xpForLevel(unit.getLevel()));
        knight.put("leveledThisBattle", unit.isLeveledRecently());
    }

    /**
     * Card art for a Siegeling id, or null when the catalog has none. Null-safe on
     * {@code content} because the Battlegrounds rebuild is exercised by pure,
     * Firestore-free tests that construct this service without Spring.
     */
    private String sieglingArtUrl(String sieglingId) {
        if (content == null) return null;
        return content.findAnySiegling(sieglingId).map(SieglingCard::getCardArtUrl).orElse(null);
    }

    /** Card art for a SiegeKnight id, or null when the catalog has none. */
    private String knightArtUrl(String knightId) {
        if (content == null) return null;
        return content.findKnight(knightId).map(TrainerCard::getCardArtUrl).orElse(null);
    }

    /**
     * The art a unit is drawn with, falling back to the card it is drawn from. The
     * fallback is what makes an already-saved Battlegrounds run render: its combatants
     * were persisted with no art at all, and every surface that shows a unit — the
     * battlefield sprite, the party rail, the resume prompt — reads this one field.
     */
    private String artUrlOf(Combatant c) {
        if (c.getArtUrl() != null && !c.getArtUrl().isBlank()) return c.getArtUrl();
        if (c.isKnight()) return null;
        return sieglingArtUrl(c.getDisplayCardId());
    }

    private Map<String, Object> serializeCombatant(Combatant c, boolean includeAbilities) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getName());
        m.put("element", c.getElement() == null ? null : c.getElement().name());
        m.put("side", c.getSide().name());
        m.put("hp", c.getHp());
        m.put("maxHp", c.getMaxHp());
        m.put("shield", c.getShield());
        m.put("speed", c.getSpeed());
        m.put("baseSpeed", c.getBaseSpeed());
        m.put("effectiveSpeed", c.effectiveSpeed());
        m.put("attackBuff", c.getAttackBuff());
        m.put("maxHpBonus", c.getBattleMaxHpBonus());
        // Leveling (drives the level badge + XP bar on the unit chip).
        m.put("level", c.getLevel());
        m.put("xp", c.getXp());
        m.put("xpToNext", SiegeTuning.xpToNext(c.getXp()));
        m.put("xpInLevel", c.getXp() - SiegeTuning.xpForLevel(c.getLevel()));
        m.put("xpSpan", c.getLevel() >= SiegeTuning.MAX_LEVEL ? 0
                : SiegeTuning.xpForLevel(c.getLevel() + 1) - SiegeTuning.xpForLevel(c.getLevel()));
        m.put("leveledThisBattle", c.isLeveledRecently());
        m.put("sourceCardId", c.getSourceCardId());
        m.put("itemId", c.getItemId());
        m.put("item", c.getItemId() == null ? null : serializeItem(content.findItem(c.getItemId())));
        m.put("alive", c.isAlive());
        m.put("artUrl", artUrlOf(c));
        m.put("shadeOf", c.getShadeOf());
        m.put("position", c.getPosition());
        List<String> statuses = new ArrayList<>();
        for (StatusKind s : c.getStatuses().keySet()) statuses.add(s.name());
        m.put("statuses", statuses);
        Map<String, Integer> statusRounds = new LinkedHashMap<>();
        c.getStatuses().forEach((status, rounds) -> statusRounds.put(status.name(), rounds));
        m.put("statusRounds", statusRounds);
        // How far along an evolution line the unit currently stands. Derived from the
        // catalog stage of its source card: a Siegeling recruited at stage 2/3 reports that
        // stage before any battle evolution, and playing an EVOLVE card rewrites
        // sourceCardId to the evolved card (SiegeContentService#evolve), so stageOf already
        // folds in battle evolutions — walking the evolvedFrom chain on top would double-count.
        int evoStage = content.findAnySiegling(c.getDisplayCardId()).map(content::stageOf).orElse(1) - 1;
        m.put("evoStage", evoStage);
        // Sprite size, though, is the authored band — NOT the depth above. Depth is only one
        // of the inputs SieglingSize#defaultFor uses, and a designer can pin the band per card
        // in the dashboard, so a stage-1 bruiser marked LARGE has to stand like one (the
        // reported Kilokong merc). Resolved exactly as KeepService resolves its residents,
        // so a Siegeling reads at the same relative scale in the Keep and on the battlefield.
        // Both fields read the display card, so shades and mercs — which carry no
        // sourceCardId on purpose — are sized from the art they actually wear.
        m.put("size", sizeBandOf(c));
        // Evolution gauge for player Siegelings (AP spent on own moves this battle).
        if (c.getSide() == Side.PLAYER && !c.isKnight()) {
            boolean hasEvolution = content.evolutionOf(c.getSourceCardId()).isPresent();
            m.put("hasEvolution", hasEvolution);
            m.put("hasStage3Evolution", content.hasStage3EvolutionChain(c.getSourceCardId()));
            if (hasEvolution) {
                m.put("evoGauge", Math.min(c.getApSpent(), SiegeBattle.EVOLVE_GAUGE));
                m.put("evoGaugeMax", SiegeBattle.EVOLVE_GAUGE);
                m.put("evoReady", c.getApSpent() >= SiegeBattle.EVOLVE_GAUGE);
            }
        }
        if (includeAbilities) {
            // The squad's headline foe (boss/elite) — the client badges it so it reads
            // apart from the minions escorting it.
            m.put("leader", c.isLeader());
            // Full ability specs so the detail popup can show what enemies do.
            m.put("abilities", serializeSpecs(c.getAbilities()));
            AbilitySpec intent = c.getIntent();
            if (intent != null) {
                Map<String, Object> im = new LinkedHashMap<>();
                im.put("name", intent.name());
                im.put("effect", intent.effect().name());
                im.put("value", intent.value());
                im.put("sweep", intent.target() == TargetKind.ALL_ENEMIES);
                im.put("position", c.getIntentPosition());
                m.put("intent", im);
            }
        }
        return m;
    }

    // ---- Helpers --------------------------------------------------------

    private SiegeRun require(String token) {
        return requireSession(token).run;
    }

    private Session requireSession(String token) {
        if (token == null) {
            throw new IllegalArgumentException("Run not found. Start a new expedition.");
        }
        Session session = runs.get(token);
        if (session == null) {
            Optional<SiegeRun> restored = checkpoints.load(token).flatMap(snap -> restoreRun(token, snap));
            if (restored.isEmpty()) {
                throw new IllegalArgumentException("Run not found. Start a new expedition.");
            }
            session = new Session(restored.get());
            Session raced = runs.putIfAbsent(token, session);
            if (raced != null) {
                session = raced;
            }
        }
        session.lastSeen = Instant.now();
        return session;
    }

    private String generateToken() {
        byte[] bytes = new byte[24];
        String token;
        do {
            tokenRandom.nextBytes(bytes);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } while (runs.containsKey(token));
        return token;
    }

    private void purgeStale() {
        Instant cutoff = Instant.now().minus(RUN_TTL);
        runs.values().removeIf(s -> s.lastSeen.isBefore(cutoff));
    }
}
