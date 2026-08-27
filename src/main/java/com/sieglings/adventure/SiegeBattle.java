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
    private boolean tallying;
    private int tallyDamage;
    private int tallyHeal;
    private int tallyShield;
    private int tallyKo;
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
    /** Active run-wide Battlegrounds boon ids for this battle (empty outside Battlegrounds). */
    private java.util.Set<String> boons = java.util.Set.of();
    /** Whether the BATTLE_REVIVE boon has already fired this battle (once per battle). */
    private boolean boonReviveUsed;

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
    void setBoons(java.util.Collection<String> boonIds) {
        this.boons = boonIds == null ? java.util.Set.of() : new java.util.HashSet<>(boonIds);
    }
    boolean hasBoon(SiegeBoon boon) { return boon != null && boons.contains(boon.id()); }
    boolean isBoonReviveUsed() { return boonReviveUsed; }
    void setBoonReviveUsed(boolean boonReviveUsed) { this.boonReviveUsed = boonReviveUsed; }

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
    Map<String, Object> turnEntry(String side, String actor, String card, int cost, String text) {
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
        return e;
    }

    /**
     * Opens a tally window: presentation events fired from here on add their
     * magnitudes up, so a ledger row can carry what the action actually did
     * rather than only what it was aimed at. Bracketed explicitly (rather than
     * riding on the newest ledger row) because between-action ticks — poison,
     * wither, shield lapses — fire events too and must not be credited to
     * whoever acted last.
     */
    void beginTally() {
        tallying = true;
        tallyDamage = 0;
        tallyHeal = 0;
        tallyShield = 0;
        tallyKo = 0;
    }

    /** Closes the tally window and writes its non-zero totals onto {@code entry}. */
    void stampTally(Map<String, Object> entry) {
        tallying = false;
        if (entry == null) return;
        if (tallyDamage > 0) entry.put("dmg", tallyDamage);
        if (tallyHeal > 0) entry.put("heal", tallyHeal);
        if (tallyShield > 0) entry.put("shield", tallyShield);
        if (tallyKo > 0) entry.put("ko", tallyKo);
    }

    private void tally(Map<String, Object> e) {
        if (!tallying) return;
        int amount = e.get("amount") instanceof Number n ? n.intValue() : 0;
        switch (String.valueOf(e.get("type"))) {
            case "hit", "knightHit" -> {
                tallyDamage += Math.max(0, amount);
                if (Boolean.TRUE.equals(e.get("ko"))) tallyKo++;
            }
            case "heal", "revive" -> tallyHeal += Math.max(0, amount);
            case "shield" -> tallyShield += Math.max(0, amount);
            default -> { }
        }
    }

    /**
     * Event keys naming a combatant whose vitals this event changes. Deliberately
     * excludes {@code sourceId}: an attacker's own HP moves on its own event
     * (leech, recoil), and stamping it here would leak that change into the hit.
     */
    private static final String[] VITAL_KEYS = { "targetId", "aId", "bId" };

    /** Records a presentation event for client playback (varargs key/value pairs). */
    void event(String type, Object... kv) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("type", type);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            e.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        // The whole turn resolves server-side before the client sees anything, so
        // the run state it renders from already holds post-turn HP — bars snapped
        // to their end value before the first projectile even flew. Stamping each
        // event with its targets' vitals *as of this moment* lets the client hold
        // the old numbers and step them forward exactly when the hit, tick or heal
        // lands on screen.
        List<Map<String, Object>> vitals = new ArrayList<>();
        for (String key : VITAL_KEYS) {
            if (!(e.get(key) instanceof String id)) continue;
            for (Combatant c : combatants) {
                if (!c.getId().equals(id)) continue;
                Map<String, Object> v = new LinkedHashMap<>();
                v.put("id", c.getId());
                v.put("hp", c.getHp());
                v.put("maxHp", c.getMaxHp());
                v.put("shield", c.getShield());
                v.put("alive", c.isAlive());
                vitals.add(v);
                break;
            }
        }
        if (!vitals.isEmpty()) e.put("vitals", vitals);
        tally(e);
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
