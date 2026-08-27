package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;

import java.util.ArrayList;
import java.util.List;

/**
 * A single Siege roguelike run: the chosen SiegeKnight + three Siegelings, the
 * deck built from their moves, the map, and the currently-active battle.
 * Held in memory and scoped to an opaque token (like the base solo games).
 */
class SiegeRun {
    private final String token;
    /** Account that owns this run; blank only for legacy/guest expeditions. */
    private String ownerId = "";

    // SiegeKnight (run leader — provides a deck card + a battle-start passive).
    private String knightId;
    private String knightName;
    private Element knightElement;
    private AbilitySpec knightActive;
    private String knightPassiveDesc;
    /** The knight's run-long leadership passive and its magnitude. */
    private KnightPassive knightPassive = KnightPassive.SHIELD;
    private int knightPassiveValue;
    /**
     * The level this account has raised the SiegeKnight card to in the collection
     * (1..TRAINER_MAX_LEVEL), carried into the run so leadership passives and the
     * Ultimate scale with the work already done outside Siege.
     */
    private int knightAccountLevel = 1;
    /** Rarity of the chosen knight card — the other half of the power scale. */
    private Rarity knightRarity;
    /** The Knight on the battlefield — persistent HP; the run is lost if it falls. */
    private Combatant knightUnit;

    /** Persistent party — HP carries between battles. Cloned into each battle. */
    private final List<Combatant> party = new ArrayList<>();
    /** Deck templates (one card per Siegeling move, plus the knight active). */
    private final List<SiegeCard> deckTemplates = new ArrayList<>();

    private final List<SiegeNode> map = new ArrayList<>();
    /** Id of the node the party currently occupies; -1 before the first move. */
    private int currentNodeId = -1;
    private RunStatus status = RunStatus.ACTIVE;

    private SiegeBattle battle;
    private String lastReward = "";
    /** Post-battle reward choices awaiting the player's pick (empty when none). */
    private final List<RewardOption> pendingRewards = new ArrayList<>();

    /** Gold earned from battles and caches, spent at camp traders/brokers. */
    private int gold;

    // Interactive Rest Camp state (NPC options; empty when not camping).
    private boolean inCamp;
    private final List<CampOption> campOptions = new ArrayList<>();
    private String campNote = "";

    // Cache dig minigame state (press your luck; bank or bust).
    private boolean inCache;
    private int cacheGold;
    private int cacheDigs;

    // Broker stall state (mercenary rentals for the next battle).
    private boolean inBroker;
    private final List<CampOption> brokerOptions = new ArrayList<>();

    /** Rented mercenary — fights the NEXT battle only, then departs. */
    private Combatant mercenary;
    private final List<SiegeCard> mercCards = new ArrayList<>();

    /** Which mini-game this cache rolled: DIG, CHESTS or WHEEL. */
    private String cacheGame = "DIG";
    private final List<CampOption> cacheOptions = new ArrayList<>();

    // Run mode, scoring and lifetime stats (endless loops + end-of-run rewards).
    private RunMode mode = RunMode.STANDARD;
    /**
     * Battlegrounds-only difficulty/reward tier scalar. Defaults to the base tier
     * (1.0) for Phase 3; Phase 4 sets it per tier (I–V). Ignored outside BATTLEGROUNDS.
     */
    private double bgTierScalar = SiegeTuning.BG_BASE_TIER_SCALAR;
    /** Battlegrounds-only: average level of the picked veteran squad; drives enemy scaling. */
    private int averageVeteranLevel;
    /** Battlegrounds tier (1..5, shown as I–V); sets the difficulty scalar and reward multipliers. */
    private int bgTier = 1;
    /** Chosen run-wide boon ids (Battlegrounds only); one at run start, a second after boss 1 on tiers III+. */
    private final List<String> boons = new ArrayList<>();
    /** Boon ids currently offered for the player to pick from (empty when no pick is pending). */
    private final List<String> boonOffer = new ArrayList<>();
    /** Whether the run is waiting for the player to pick a boon (gates map travel, like a pending recruit). */
    private boolean awaitingBoonPick;
    /** Banked team ids this squad drew members/knight from — locked on a Battlegrounds loss (fatigue). */
    private final List<String> sourceTeamIds = new ArrayList<>();
    /** A guaranteed stage-2+ reveal earned at a Battlegrounds boss (reward, not a party member); null when none. */
    private java.util.Map<String, Object> bossReveal;
    private long score;
    private int loop;
    private int nodesCleared;
    private int bossKills;
    private int enemiesDefeated;
    private int goldEarnedTotal;
    private boolean endRewardsGranted;
    private java.util.Map<String, Object> endRewards;
    /** The most recent battle's XP awards, shown on the post-victory reward screen. */
    private java.util.Map<String, Object> lastXpRecap;
    /** A just-joined Siegeling awaiting its gacha-style reveal (null when none). */
    private java.util.Map<String, Object> pendingRecruit;

    /**
     * Every Siegeling catalog card this run has met — recruits, broker hires, and
     * the forms they evolve into. Banked as permanent starter unlocks when the run
     * ends (see SiegeService#bankSieglingDiscoveries), so it must survive a
     * resume: insertion-ordered and carried in the run snapshot.
     */
    private final java.util.Set<String> discoveredSieglingIds = new java.util.LinkedHashSet<>();

    /** Unequipped items carried by the warband (equipped items live on Combatants). */
    private final List<String> inventory = new ArrayList<>();
    /** Consumables carried by the SiegeKnight (revive cards, potions, etc.). */
    private final List<String> knightBag = new ArrayList<>();

    // Smith / Caravan / Event interactive stops (each reuses the CampOption shape).
    private boolean inSmith;
    private final List<CampOption> smithOptions = new ArrayList<>();
    private boolean inCaravan;
    private final List<CampOption> caravanOptions = new ArrayList<>();
    private boolean inEvent;
    private String eventTitle = "";
    private String eventPrompt = "";
    private String eventIcon = "";
    private final List<CampOption> eventOptions = new ArrayList<>();

    // Puzzle mini-game state (LINE / RPS / MATCH) — server-authoritative hidden state.
    // Short-lived like the cache: skipped by checkpoints so a resume lands on the map
    // with the node still uncleared. Reachable from both cache and event nodes, so it
    // carries its own framing (title/prompt/icon).
    private boolean inMinigame;
    private String minigameType = "";
    private String minigameTitle = "";
    private String minigamePrompt = "";
    private String minigameIcon = "";
    private Object minigameState;

    /** Whether the run's last idle checkpoint reached persistent storage. */
    private boolean checkpointSaved;

    /** Whether this run's leveled team has already been banked as a veteran team (idempotency guard). */
    private boolean veteranExtracted;
    /** The just-extracted team snapshot (drives the "banked for Battlegrounds" confirmation UI); null until extracted. */
    private java.util.Map<String, Object> veteranTeam;

    SiegeRun(String token) {
        this.token = token;
    }

    String getToken() { return token; }
    String getOwnerId() { return ownerId; }
    void setOwnerId(String ownerId) { this.ownerId = ownerId == null ? "" : ownerId; }

    String getKnightId() { return knightId; }
    void setKnightId(String knightId) { this.knightId = knightId; }
    String getKnightName() { return knightName; }
    void setKnightName(String knightName) { this.knightName = knightName; }
    Element getKnightElement() { return knightElement; }
    void setKnightElement(Element knightElement) { this.knightElement = knightElement; }
    AbilitySpec getKnightActive() { return knightActive; }
    void setKnightActive(AbilitySpec knightActive) { this.knightActive = knightActive; }
    String getKnightPassiveDesc() { return knightPassiveDesc; }
    void setKnightPassiveDesc(String knightPassiveDesc) { this.knightPassiveDesc = knightPassiveDesc; }
    KnightPassive getKnightPassive() { return knightPassive; }
    void setKnightPassive(KnightPassive knightPassive) { this.knightPassive = knightPassive; }
    int getKnightPassiveValue() { return knightPassiveValue; }
    void setKnightPassiveValue(int knightPassiveValue) { this.knightPassiveValue = knightPassiveValue; }
    int getKnightAccountLevel() { return knightAccountLevel; }
    void setKnightAccountLevel(int level) { this.knightAccountLevel = SiegeTuning.clampAccountLevel(level); }
    Rarity getKnightRarity() { return knightRarity; }
    void setKnightRarity(Rarity knightRarity) { this.knightRarity = knightRarity; }
    Combatant getKnightUnit() { return knightUnit; }
    void setKnightUnit(Combatant knightUnit) { this.knightUnit = knightUnit; }

    List<Combatant> getParty() { return party; }
    List<SiegeCard> getDeckTemplates() { return deckTemplates; }
    List<SiegeNode> getMap() { return map; }

    int getCurrentNodeId() { return currentNodeId; }
    void setCurrentNodeId(int currentNodeId) { this.currentNodeId = currentNodeId; }
    RunStatus getStatus() { return status; }
    void setStatus(RunStatus status) { this.status = status; }

    SiegeBattle getBattle() { return battle; }
    void setBattle(SiegeBattle battle) { this.battle = battle; }
    String getLastReward() { return lastReward; }
    void setLastReward(String lastReward) { this.lastReward = lastReward == null ? "" : lastReward; }
    List<RewardOption> getPendingRewards() { return pendingRewards; }

    int getGold() { return gold; }
    void setGold(int gold) { this.gold = Math.max(0, gold); }
    void addGold(int amount) { setGold(gold + amount); }

    boolean isInCamp() { return inCamp; }
    void setInCamp(boolean inCamp) { this.inCamp = inCamp; }
    List<CampOption> getCampOptions() { return campOptions; }
    String getCampNote() { return campNote; }
    void setCampNote(String campNote) { this.campNote = campNote == null ? "" : campNote; }

    boolean isInCache() { return inCache; }
    void setInCache(boolean inCache) { this.inCache = inCache; }
    int getCacheGold() { return cacheGold; }
    void setCacheGold(int cacheGold) { this.cacheGold = Math.max(0, cacheGold); }
    int getCacheDigs() { return cacheDigs; }
    void setCacheDigs(int cacheDigs) { this.cacheDigs = cacheDigs; }

    boolean isInBroker() { return inBroker; }
    void setInBroker(boolean inBroker) { this.inBroker = inBroker; }
    List<CampOption> getBrokerOptions() { return brokerOptions; }

    Combatant getMercenary() { return mercenary; }
    void setMercenary(Combatant mercenary) { this.mercenary = mercenary; }
    List<SiegeCard> getMercCards() { return mercCards; }

    String getCacheGame() { return cacheGame; }
    void setCacheGame(String cacheGame) { this.cacheGame = cacheGame == null ? "DIG" : cacheGame; }
    List<CampOption> getCacheOptions() { return cacheOptions; }

    RunMode getMode() { return mode; }
    void setMode(RunMode mode) { this.mode = mode == null ? RunMode.STANDARD : mode; }
    boolean isBattlegrounds() { return mode == RunMode.BATTLEGROUNDS; }
    double getBgTierScalar() { return bgTierScalar; }
    void setBgTierScalar(double bgTierScalar) { this.bgTierScalar = bgTierScalar <= 0 ? SiegeTuning.BG_BASE_TIER_SCALAR : bgTierScalar; }
    int getAverageVeteranLevel() { return averageVeteranLevel; }
    void setAverageVeteranLevel(int averageVeteranLevel) { this.averageVeteranLevel = Math.max(0, averageVeteranLevel); }
    int getBgTier() { return bgTier; }
    void setBgTier(int bgTier) { this.bgTier = SiegeTuning.clampTier(bgTier); }
    List<String> getBoons() { return boons; }
    boolean hasBoon(SiegeBoon boon) { return boon != null && boons.contains(boon.id()); }
    List<String> getBoonOffer() { return boonOffer; }
    boolean isAwaitingBoonPick() { return awaitingBoonPick; }
    void setAwaitingBoonPick(boolean awaitingBoonPick) { this.awaitingBoonPick = awaitingBoonPick; }
    List<String> getSourceTeamIds() { return sourceTeamIds; }
    java.util.Set<String> getDiscoveredSieglingIds() { return discoveredSieglingIds; }
    java.util.Map<String, Object> getBossReveal() { return bossReveal; }
    void setBossReveal(java.util.Map<String, Object> bossReveal) { this.bossReveal = bossReveal; }
    long getScore() { return score; }
    void addScore(long points) { this.score = Math.max(0, this.score + points); }
    void setScore(long score) { this.score = Math.max(0, score); }
    int getLoop() { return loop; }
    void setLoop(int loop) { this.loop = Math.max(0, loop); }
    int getNodesCleared() { return nodesCleared; }
    void setNodesCleared(int nodesCleared) { this.nodesCleared = Math.max(0, nodesCleared); }
    int getBossKills() { return bossKills; }
    void setBossKills(int bossKills) { this.bossKills = Math.max(0, bossKills); }
    int getEnemiesDefeated() { return enemiesDefeated; }
    void setEnemiesDefeated(int enemiesDefeated) { this.enemiesDefeated = Math.max(0, enemiesDefeated); }
    int getGoldEarnedTotal() { return goldEarnedTotal; }
    void setGoldEarnedTotal(int goldEarnedTotal) { this.goldEarnedTotal = Math.max(0, goldEarnedTotal); }
    boolean isEndRewardsGranted() { return endRewardsGranted; }
    void setEndRewardsGranted(boolean endRewardsGranted) { this.endRewardsGranted = endRewardsGranted; }
    java.util.Map<String, Object> getEndRewards() { return endRewards; }
    void setEndRewards(java.util.Map<String, Object> endRewards) { this.endRewards = endRewards; }
    java.util.Map<String, Object> getLastXpRecap() { return lastXpRecap; }
    void setLastXpRecap(java.util.Map<String, Object> lastXpRecap) { this.lastXpRecap = lastXpRecap; }
    java.util.Map<String, Object> getPendingRecruit() { return pendingRecruit; }
    void setPendingRecruit(java.util.Map<String, Object> pendingRecruit) { this.pendingRecruit = pendingRecruit; }

    List<String> getInventory() { return inventory; }
    List<String> getKnightBag() { return knightBag; }

    boolean isInSmith() { return inSmith; }
    void setInSmith(boolean inSmith) { this.inSmith = inSmith; }
    List<CampOption> getSmithOptions() { return smithOptions; }

    boolean isInCaravan() { return inCaravan; }
    void setInCaravan(boolean inCaravan) { this.inCaravan = inCaravan; }
    List<CampOption> getCaravanOptions() { return caravanOptions; }

    boolean isInEvent() { return inEvent; }
    void setInEvent(boolean inEvent) { this.inEvent = inEvent; }
    String getEventTitle() { return eventTitle; }
    void setEventTitle(String eventTitle) { this.eventTitle = eventTitle == null ? "" : eventTitle; }
    String getEventPrompt() { return eventPrompt; }
    void setEventPrompt(String eventPrompt) { this.eventPrompt = eventPrompt == null ? "" : eventPrompt; }
    String getEventIcon() { return eventIcon; }
    void setEventIcon(String eventIcon) { this.eventIcon = eventIcon == null ? "" : eventIcon; }
    List<CampOption> getEventOptions() { return eventOptions; }

    boolean isInMinigame() { return inMinigame; }
    void setInMinigame(boolean inMinigame) { this.inMinigame = inMinigame; }
    String getMinigameType() { return minigameType; }
    void setMinigameType(String minigameType) { this.minigameType = minigameType == null ? "" : minigameType; }
    String getMinigameTitle() { return minigameTitle; }
    void setMinigameTitle(String minigameTitle) { this.minigameTitle = minigameTitle == null ? "" : minigameTitle; }
    String getMinigamePrompt() { return minigamePrompt; }
    void setMinigamePrompt(String minigamePrompt) { this.minigamePrompt = minigamePrompt == null ? "" : minigamePrompt; }
    String getMinigameIcon() { return minigameIcon; }
    void setMinigameIcon(String minigameIcon) { this.minigameIcon = minigameIcon == null ? "" : minigameIcon; }
    Object getMinigameState() { return minigameState; }
    void setMinigameState(Object minigameState) { this.minigameState = minigameState; }

    boolean isCheckpointSaved() { return checkpointSaved; }
    void setCheckpointSaved(boolean checkpointSaved) { this.checkpointSaved = checkpointSaved; }

    boolean isVeteranExtracted() { return veteranExtracted; }
    void setVeteranExtracted(boolean veteranExtracted) { this.veteranExtracted = veteranExtracted; }
    java.util.Map<String, Object> getVeteranTeam() { return veteranTeam; }
    void setVeteranTeam(java.util.Map<String, Object> veteranTeam) { this.veteranTeam = veteranTeam; }


    SiegeNode currentNode() {
        return nodeById(currentNodeId);
    }

    SiegeNode nodeById(int id) {
        for (SiegeNode n : map) {
            if (n.getId() == id) return n;
        }
        return null;
    }

    /** Node ids the party may travel to next (row-0 nodes before the first move). */
    List<Integer> reachableNodeIds() {
        List<Integer> out = new ArrayList<>();
        if (status != RunStatus.ACTIVE || battle != null || !pendingRewards.isEmpty()
                || inCamp || inCache || inBroker || inSmith || inCaravan || inEvent || inMinigame
                || pendingRecruit != null || awaitingBoonPick) return out;
        SiegeNode current = currentNode();
        if (current == null) {
            for (SiegeNode n : map) {
                if (n.getRow() == 0) out.add(n.getId());
            }
        } else {
            out.addAll(current.getNext());
        }
        return out;
    }

    boolean partyAlive() {
        for (Combatant c : party) {
            if (c.isAlive()) return true;
        }
        return false;
    }
}
