package com.sieglings.adventure;

import com.sieglings.model.enums.Element;

import java.util.ArrayList;
import java.util.List;

/**
 * A single Siege roguelike run: the chosen SiegeKnight + three Siegelings, the
 * deck built from their moves, the map, and the currently-active battle.
 * Held in memory and scoped to an opaque token (like the base solo games).
 */
class SiegeRun {
    private final String token;

    // SiegeKnight (run leader — provides a deck card + a battle-start passive).
    private String knightId;
    private String knightName;
    private Element knightElement;
    private AbilitySpec knightActive;
    private String knightPassiveDesc;
    /** The knight's run-long leadership passive and its magnitude. */
    private KnightPassive knightPassive = KnightPassive.SHIELD;
    private int knightPassiveValue;
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
    private long score;
    private int loop;
    private int nodesCleared;
    private int bossKills;
    private int enemiesDefeated;
    private int goldEarnedTotal;
    private boolean endRewardsGranted;
    private java.util.Map<String, Object> endRewards;
    /** A just-joined Siegeling awaiting its gacha-style reveal (null when none). */
    private java.util.Map<String, Object> pendingRecruit;

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

    /** Whether the run's last idle checkpoint reached persistent storage. */
    private boolean checkpointSaved;

    SiegeRun(String token) {
        this.token = token;
    }

    String getToken() { return token; }

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

    boolean isCheckpointSaved() { return checkpointSaved; }
    void setCheckpointSaved(boolean checkpointSaved) { this.checkpointSaved = checkpointSaved; }


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
                || inCamp || inCache || inBroker || inSmith || inCaravan || inEvent
                || pendingRecruit != null) return out;
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
