package com.sieglings.adventure;

import java.util.ArrayList;
import java.util.List;

/**
 * Live state for a single Siege battle: the initiative timeline, the shared
 * action-point economy, and the card deck/hand/discard drawn from the player's
 * three Siegelings' moves.
 */
class SiegeBattle {
    static final double READY_THRESHOLD = 100.0;
    static final int ACTIONS_PER_TURN = 3;
    static final int HAND_SIZE = 5;

    private final NodeType nodeType;
    private final List<Combatant> combatants = new ArrayList<>(); // player Siegelings + enemies
    private final List<SiegeCard> deck = new ArrayList<>();
    private final List<SiegeCard> hand = new ArrayList<>();
    private final List<SiegeCard> discard = new ArrayList<>();
    private final List<String> log = new ArrayList<>();

    private BattlePhase phase = BattlePhase.PLAYER_INPUT;
    private int actionPoints = ACTIONS_PER_TURN;
    private int turnNumber = 1;
    /** Combatant id whose readiness opened the current player turn (the "lead"). */
    private String leadId;

    SiegeBattle(NodeType nodeType) {
        this.nodeType = nodeType;
    }

    NodeType getNodeType() { return nodeType; }
    List<Combatant> getCombatants() { return combatants; }
    List<SiegeCard> getDeck() { return deck; }
    List<SiegeCard> getHand() { return hand; }
    List<SiegeCard> getDiscard() { return discard; }
    List<String> getLog() { return log; }

    BattlePhase getPhase() { return phase; }
    void setPhase(BattlePhase phase) { this.phase = phase; }
    int getActionPoints() { return actionPoints; }
    void setActionPoints(int actionPoints) { this.actionPoints = Math.max(0, actionPoints); }
    int getTurnNumber() { return turnNumber; }
    void setTurnNumber(int turnNumber) { this.turnNumber = turnNumber; }
    String getLeadId() { return leadId; }
    void setLeadId(String leadId) { this.leadId = leadId; }

    void log(String message) {
        log.add(message);
        if (log.size() > 60) {
            log.remove(0);
        }
    }

    List<Combatant> living(Side side) {
        List<Combatant> out = new ArrayList<>();
        for (Combatant c : combatants) {
            if (c.getSide() == side && c.isAlive()) {
                out.add(c);
            }
        }
        return out;
    }

    Combatant findCombatant(String id) {
        if (id == null) return null;
        for (Combatant c : combatants) {
            if (c.getId().equals(id)) return c;
        }
        return null;
    }

    boolean isOver() {
        return phase == BattlePhase.WON || phase == BattlePhase.LOST;
    }
}
