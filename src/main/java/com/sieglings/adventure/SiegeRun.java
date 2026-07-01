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

    /** Persistent party — HP carries between battles. Cloned into each battle. */
    private final List<Combatant> party = new ArrayList<>();
    /** Deck templates (one card per Siegeling move, plus the knight active). */
    private final List<SiegeCard> deckTemplates = new ArrayList<>();

    private final List<SiegeNode> map = new ArrayList<>();
    private int currentIndex;
    private RunStatus status = RunStatus.ACTIVE;

    private SiegeBattle battle;
    private String lastReward = "";

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

    List<Combatant> getParty() { return party; }
    List<SiegeCard> getDeckTemplates() { return deckTemplates; }
    List<SiegeNode> getMap() { return map; }

    int getCurrentIndex() { return currentIndex; }
    void setCurrentIndex(int currentIndex) { this.currentIndex = currentIndex; }
    RunStatus getStatus() { return status; }
    void setStatus(RunStatus status) { this.status = status; }

    SiegeBattle getBattle() { return battle; }
    void setBattle(SiegeBattle battle) { this.battle = battle; }
    String getLastReward() { return lastReward; }
    void setLastReward(String lastReward) { this.lastReward = lastReward == null ? "" : lastReward; }

    SiegeNode currentNode() {
        return currentIndex >= 0 && currentIndex < map.size() ? map.get(currentIndex) : null;
    }

    boolean partyAlive() {
        for (Combatant c : party) {
            if (c.isAlive()) return true;
        }
        return false;
    }
}
