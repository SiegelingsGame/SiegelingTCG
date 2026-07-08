package com.sieglings.adventure;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Live state for a single Siege battle.
 *
 * <p>Rounds are decided by team Speed: the side whose living, active units sum
 * to the higher Speed acts first (recomputed every round; ties are a coin
 * flip). The player's turn spends a shared pool of {@value #ACTIONS_PER_TURN}
 * action points; unused AP converts into SiegeKnight Ultimate Charge.
 *
 * <p>The battle also accumulates a stream of presentation {@link #events} —
 * attacks, statuses, KOs, round banners — that the client plays back as
 * projectiles and action moments, then drains on each serialization.
 */
class SiegeBattle {
    static final int ACTIONS_PER_TURN = 5;
    static final int HAND_START = 6;
    static final int HAND_MAX = 8;
    static final int KNIGHT_ULT_COST = 20;
    /** AP a Siegeling must spend on its own moves before its Evolution card unlocks. */
    static final int EVOLVE_GAUGE = 5;
    /** Rounds a fresh Burn lasts — effectively "until the battle ends". */
    static final int BURN_ROUNDS = 99;
    static final int SLOW_ROUNDS = 2;

    private final NodeType nodeType;
    private final List<Combatant> combatants = new ArrayList<>(); // knight + Siegelings + enemies
    private final List<SiegeCard> deck = new ArrayList<>();
    private final List<SiegeCard> hand = new ArrayList<>();
    private final List<SiegeCard> discard = new ArrayList<>();
    private final List<String> log = new ArrayList<>();
    private final List<Map<String, Object>> events = new ArrayList<>();
    /** Structured turn ledger: every action with the card behind it, grouped by round. */
    private final List<Map<String, Object>> turnLog = new ArrayList<>();
    /**
     * Kills landed this battle, keyed by the combatant id that struck the blow.
     * Drained at battle-won time to hand out the killing-blow XP bonus. Keyed by
     * id so it survives evolution (which keeps the unit's id).
     */
    private final Map<String, Integer> killCredit = new LinkedHashMap<>();

    private BattlePhase phase = BattlePhase.PLAYER_INPUT;
    private int actionPoints = ACTIONS_PER_TURN;
    private int roundNumber = 0;
    private boolean playerActsFirst = true;
    private int playerSpeed;
    private int enemySpeed;
    private int knightCharge;
    /** Combatant id of the fastest ready Siegeling (cosmetic "lead" for the UI). */
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
    List<Map<String, Object>> getEvents() { return events; }

    BattlePhase getPhase() { return phase; }
    void setPhase(BattlePhase phase) { this.phase = phase; }
    int getActionPoints() { return actionPoints; }
    void setActionPoints(int actionPoints) { this.actionPoints = Math.max(0, actionPoints); }
    int getRoundNumber() { return roundNumber; }
    void setRoundNumber(int roundNumber) { this.roundNumber = roundNumber; }
    boolean isPlayerActsFirst() { return playerActsFirst; }
    void setPlayerActsFirst(boolean playerActsFirst) { this.playerActsFirst = playerActsFirst; }
    int getPlayerSpeed() { return playerSpeed; }
    void setPlayerSpeed(int playerSpeed) { this.playerSpeed = playerSpeed; }
    int getEnemySpeed() { return enemySpeed; }
    void setEnemySpeed(int enemySpeed) { this.enemySpeed = enemySpeed; }
    int getKnightCharge() { return knightCharge; }
    void setKnightCharge(int knightCharge) { this.knightCharge = Math.max(0, knightCharge); }
    void addKnightCharge(int amount) { setKnightCharge(knightCharge + amount); }
    String getLeadId() { return leadId; }
    void setLeadId(String leadId) { this.leadId = leadId; }

    void log(String message) {
        log.add(message);
        if (log.size() > 60) {
            log.remove(0);
        }
    }

    List<Map<String, Object>> getTurnLog() { return turnLog; }

    /** Records that {@code unitId} landed a killing blow this battle. */
    void creditKill(String unitId) {
        if (unitId == null) return;
        killCredit.merge(unitId, 1, Integer::sum);
    }

    /** Kills landed per combatant id this battle (for killing-blow XP). */
    Map<String, Integer> getKillCredit() { return killCredit; }

    /** Records a ledger step: who acted, with which card, and what happened. */
    void turnEntry(String side, String actor, String card, int cost, String text) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("round", roundNumber);
        e.put("side", side);        // "you" | "foe" | "sys"
        e.put("actor", actor);
        e.put("card", card);        // card/ability name, or null for system steps
        e.put("cost", cost);        // AP cost, -1 when not applicable
        e.put("text", text);
        turnLog.add(e);
        if (turnLog.size() > 120) {
            turnLog.remove(0);
        }
    }

    /** Records a presentation event for client playback (varargs key/value pairs). */
    void event(String type, Object... kv) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("type", type);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            e.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        events.add(e);
        if (events.size() > 80) {
            events.remove(0);
        }
    }

    /** Living non-knight units on a side (the ones standing on notches). */
    List<Combatant> living(Side side) {
        List<Combatant> out = new ArrayList<>();
        for (Combatant c : combatants) {
            if (c.getSide() == side && c.isAlive() && !c.isKnight()) {
                out.add(c);
            }
        }
        return out;
    }

    Combatant knight() {
        for (Combatant c : combatants) {
            if (c.isKnight()) return c;
        }
        return null;
    }

    Combatant findCombatant(String id) {
        if (id == null) return null;
        for (Combatant c : combatants) {
            if (c.getId().equals(id)) return c;
        }
        return null;
    }

    /** The living player Siegeling standing on a notch, if any. */
    Combatant atPosition(int position) {
        for (Combatant c : living(Side.PLAYER)) {
            if (c.getPosition() == position) return c;
        }
        return null;
    }

    boolean isOver() {
        return phase == BattlePhase.WON || phase == BattlePhase.LOST;
    }
}
