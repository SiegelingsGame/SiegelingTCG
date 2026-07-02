package com.sieglings.adventure;

import com.sieglings.model.enums.Element;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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

    /** Battle wins per party member id — drives automatic evolution. */
    private final Map<String, Integer> winsByMember = new HashMap<>();

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

    Map<String, Integer> getWinsByMember() { return winsByMember; }

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
                || inCamp || inCache) return out;
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
