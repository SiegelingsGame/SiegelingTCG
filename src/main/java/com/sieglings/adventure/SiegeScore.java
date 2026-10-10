package com.sieglings.adventure;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The run's score, kept as a tally of what happened rather than a single
 * number, so the end screen, the history review and the leaderboard can all
 * show where the points came from.
 *
 * <p>Six sources, each a line in {@link #breakdown}:
 * <ul>
 *   <li><b>Route</b> — every node the player chose to enter. Risky stops (elites,
 *       bosses, events) are worth more than safe ones (camps, shops), so the
 *       path itself is a scoring decision.</li>
 *   <li><b>Battles</b> — each victory, scaled by foes and depth, plus a growing
 *       bonus per boss.</li>
 *   <li><b>Mastery</b> — quick wins (few rounds) and flawless wins (no Siegeling
 *       fell).</li>
 *   <li><b>Fallen / Revived</b> — a penalty per Siegeling that falls, half of
 *       which a revive earns back: rescuing an ally is good, never losing it is
 *       better.</li>
 *   <li><b>Gold</b> — earned at full value and spent at half, so a run that
 *       invests its purse is not worse than one that hoards it.</li>
 *   <li><b>Victory</b> — a flat bonus for finishing a fixed expedition.</li>
 * </ul>
 * Battlegrounds multiplies the total (see {@link SiegeTuning#bgScore}).
 *
 * <p>Falls and revives are found by diffing the warband against the set of
 * members last seen down ({@link #syncWarband}), not by hooking every damage
 * and heal site: any path that kills or raises a Siegeling — combat, traps,
 * events, camp, revive cards — is counted the next time the run is serialized.
 */
final class SiegeScore {

    static final int SWIFT_ROUNDS = 5;
    static final int SWIFT_PER_ROUND = 10;
    static final int FLAWLESS_BONUS = 25;
    static final int FALL_PENALTY = 40;
    static final int REVIVE_CREDIT = 20;
    static final int VICTORY_BONUS = 500;
    /** Endless only: points per floor reached, standing in for the victory bonus. */
    static final int DEPTH_PER_FLOOR = 20;

    static int routePoints(NodeType type) {
        if (type == null) return 0;
        return switch (type) {
            case BOSS -> 60;
            case ELITE -> 40;
            case EVENT, RIFT -> 20;
            case BATTLE -> 15;
            case TREASURE, BROKER, SMITH, CARAVAN -> 10;
            case REST -> 5;
        };
    }

    private final Map<String, Integer> nodesEntered = new LinkedHashMap<>();
    private long battlePoints;
    private int battlesWon;
    private long swiftPoints;
    private int flawlessWins;
    private int fallen;
    private int revived;
    private int goldSpent;
    /** Points a run had before this tally existed (a checkpoint from an older build). */
    private long carried;
    private int fallenThisBattle;
    private final Set<String> down = new HashSet<>();

    void nodeEntered(NodeType type) {
        if (type != null) nodesEntered.merge(type.name(), 1, Integer::sum);
    }

    void spent(int gold) {
        if (gold > 0) goldSpent += gold;
    }

    /**
     * Credits a won battle. Falls during it must already be synced, which
     * {@link SiegeService} does before calling this, so "flawless" is exact.
     */
    void battleWon(int foes, int depth, int rounds, boolean boss, int bossKillsSoFar) {
        battlesWon++;
        battlePoints += foes * (10L + depth) + 5;
        if (boss) battlePoints += 100L + 50L * bossKillsSoFar;
        swiftPoints += (long) Math.max(0, SWIFT_ROUNDS - Math.max(1, rounds) + 1) * SWIFT_PER_ROUND;
        if (fallenThisBattle == 0) flawlessWins++;
        fallenThisBattle = 0;
    }

    void battleLost() {
        fallenThisBattle = 0;
    }

    /** Counts warband members that fell or rose since the last sync. Idempotent. */
    void syncWarband(SiegeRun run) {
        for (Combatant member : run.getParty()) {
            String id = member.getId();
            if (!member.isAlive()) {
                if (down.add(id)) {
                    fallen++;
                    if (run.getBattle() != null) fallenThisBattle++;
                }
            } else if (down.remove(id)) {
                revived++;
            }
        }
    }

    int fallen() { return fallen; }
    int revived() { return revived; }
    int goldSpent() { return goldSpent; }
    int battlesWon() { return battlesWon; }
    int flawlessWins() { return flawlessWins; }

    /** Each line's points by key, for the journal to diff a stop's share of the score. */
    Map<String, Long> pointsByKey(SiegeRun run) {
        Map<String, Long> out = new LinkedHashMap<>();
        for (Map<String, Object> line : lines(run)) {
            out.put(String.valueOf(line.get("key")), ((Number) line.get("points")).longValue());
        }
        return out;
    }

    /** The unmultiplied total; never negative. */
    long base(SiegeRun run) {
        long total = 0;
        for (Map<String, Object> line : lines(run)) total += ((Number) line.get("points")).longValue();
        return Math.max(0, total);
    }

    /** The score the run is ranked by: the base, scaled for Battlegrounds. */
    long total(SiegeRun run) {
        long base = base(run);
        return run.isBattlegrounds() ? SiegeTuning.bgScore(base, run.getBgTier()) : base;
    }

    /**
     * {total, base, multiplier, lines:[{key,label,detail,points}]} — the shape
     * the end screen, history document and review all render.
     */
    Map<String, Object> breakdown(SiegeRun run) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", total(run));
        out.put("base", base(run));
        out.put("multiplier", run.isBattlegrounds()
                ? SiegeTuning.BG_SCORE_MULT * SiegeTuning.bgTierRewardMult(run.getBgTier()) : 1.0);
        out.put("lines", lines(run));
        return out;
    }

    private List<Map<String, Object>> lines(SiegeRun run) {
        List<Map<String, Object>> out = new ArrayList<>();
        long route = 0;
        int stops = 0;
        for (Map.Entry<String, Integer> e : nodesEntered.entrySet()) {
            route += (long) routePoints(NodeType.valueOf(e.getKey())) * e.getValue();
            stops += e.getValue();
        }
        out.add(line("route", "Route", stops + " stop" + (stops == 1 ? "" : "s") + " chosen", route));
        out.add(line("battles", "Battles", battlesWon + " won"
                + (run.getBossKills() > 0 ? " · " + run.getBossKills() + " boss" + (run.getBossKills() == 1 ? "" : "es") : ""),
                battlePoints));
        out.add(line("mastery", "Mastery", flawlessWins + " flawless", swiftPoints + (long) flawlessWins * FLAWLESS_BONUS));
        out.add(line("fallen", "Fallen", fallen + " Siegeling" + (fallen == 1 ? "" : "s"), -(long) fallen * FALL_PENALTY));
        out.add(line("revived", "Revived", revived + " rescued", (long) revived * REVIVE_CREDIT));
        out.add(line("goldEarned", "Gold earned", run.getGoldEarnedTotal() + "g", run.getGoldEarnedTotal()));
        out.add(line("goldSpent", "Gold spent", goldSpent + "g invested", goldSpent / 2));
        if (run.getMode() == RunMode.ENDLESS) {
            // Endless has no victory; depth is what it ranks, and it pays the same
            // whether the run was ended or the warband fell.
            int floor = run.floorReached();
            out.add(line("depth", "Depth", "Floor " + floor, (long) floor * DEPTH_PER_FLOOR));
        } else if (run.getStatus() == RunStatus.WON) {
            out.add(line("victory", "Victory", "Expedition won", VICTORY_BONUS));
        }
        if (carried > 0) {
            out.add(line("carried", "Earlier", "Before scoring", carried));
        }
        return out;
    }

    private static Map<String, Object> line(String key, String label, String detail, long points) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("label", label);
        m.put("detail", detail);
        m.put("points", points);
        return m;
    }

    Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("nodes", new LinkedHashMap<>(nodesEntered));
        m.put("battlePoints", battlePoints);
        m.put("battlesWon", battlesWon);
        m.put("swiftPoints", swiftPoints);
        m.put("flawlessWins", flawlessWins);
        m.put("fallen", fallen);
        m.put("revived", revived);
        m.put("goldSpent", goldSpent);
        m.put("carried", carried);
        m.put("fallenThisBattle", fallenThisBattle);
        m.put("down", new ArrayList<>(down));
        return m;
    }

    /**
     * Restores from a checkpoint. A checkpoint without a tally predates this
     * class: its old running score is carried as one line so a resumed run
     * does not lose what it had.
     */
    void restore(Object raw, long legacyScore) {
        nodesEntered.clear();
        down.clear();
        if (!(raw instanceof Map<?, ?> m)) {
            battlePoints = swiftPoints = 0;
            battlesWon = flawlessWins = fallen = revived = goldSpent = fallenThisBattle = 0;
            carried = Math.max(0, legacyScore);
            return;
        }
        if (m.get("nodes") instanceof Map<?, ?> nodes) {
            nodes.forEach((k, v) -> {
                try {
                    NodeType.valueOf(String.valueOf(k));
                    nodesEntered.put(String.valueOf(k), num(v));
                } catch (IllegalArgumentException ignored) {
                    // a node type retired since the save is worth nothing
                }
            });
        }
        battlePoints = num(m.get("battlePoints"));
        battlesWon = num(m.get("battlesWon"));
        swiftPoints = num(m.get("swiftPoints"));
        flawlessWins = num(m.get("flawlessWins"));
        fallen = num(m.get("fallen"));
        revived = num(m.get("revived"));
        goldSpent = num(m.get("goldSpent"));
        carried = num(m.get("carried"));
        fallenThisBattle = num(m.get("fallenThisBattle"));
        if (m.get("down") instanceof List<?> ids) {
            for (Object id : ids) down.add(String.valueOf(id));
        }
    }

    private static int num(Object v) {
        return v instanceof Number n ? (int) Math.max(0, n.longValue()) : 0;
    }
}
