package com.sieglings.adventure;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What happened at each stop of a run, for the profile's Siege review.
 *
 * <p>A stop opens when the party enters a node and closes when it enters the
 * next one (or the run ends). Opening and closing each snapshot the purse and
 * the warband's health, so gold spent or earned and HP healed or lost fall out
 * of the difference without every handler having to report them. Handlers add
 * only what the snapshots cannot show: who was fought, what was picked from an
 * offer and what was passed over.
 *
 * <p>Everything is plain maps and lists so the run checkpoint can store the
 * journal as-is and a resumed run keeps its history.
 */
final class SiegeRunJournal {

    /** Bounds an Endless run's journal; the review shows the most recent stops. */
    static final int MAX_STOPS = 120;

    private final List<Map<String, Object>> stops = new ArrayList<>();

    List<Map<String, Object>> stops() {
        return stops;
    }

    void open(SiegeRun run, SiegeNode node) {
        close(run);
        Map<String, Object> stop = new LinkedHashMap<>();
        stop.put("nodeId", node.getId());
        stop.put("floor", node.getRow() + 1);
        stop.put("type", node.getType().name());
        stop.put("title", node.getLabel());
        SiegeLand land = run.getLand();
        if (land != null) {
            stop.put("land", land.name());
            stop.put("landId", land.id());
        }
        stop.put("goldBefore", run.getGold());
        stop.put("partyBefore", partySnapshot(run));
        stop.put("events", new ArrayList<Map<String, Object>>());
        stops.add(stop);
        if (stops.size() > MAX_STOPS) {
            stops.remove(0);
        }
    }

    /** Idempotent: a stop closes once, when the next opens or the run ends. */
    void close(SiegeRun run) {
        Map<String, Object> stop = current();
        if (stop == null || stop.containsKey("goldAfter")) {
            return;
        }
        stop.put("goldAfter", run.getGold());
        stop.put("partyAfter", partySnapshot(run));
    }

    void event(Map<String, Object> event) {
        Map<String, Object> stop = current();
        if (stop == null || event == null) {
            return;
        }
        events(stop).add(event);
    }

    /** Sets a readable title once the stop knows it (an event's name, a boss). */
    void retitle(String title) {
        Map<String, Object> stop = current();
        if (stop != null && title != null && !title.isBlank()) {
            stop.put("title", title);
        }
    }

    /**
     * Records the offer list a stop presented, marking what was taken. Called
     * as the player leaves, so the list reflects every pick made there.
     */
    void offers(List<CampOption> options) {
        Map<String, Object> stop = current();
        if (stop == null || options == null || options.isEmpty()) {
            return;
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (CampOption option : options) {
            out.add(option(option));
        }
        stop.put("offers", out);
    }

    static Map<String, Object> option(CampOption option) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("kind", option.kind);
        m.put("title", option.title);
        m.put("desc", option.desc);
        m.put("cost", option.cost);
        if (option.element != null) m.put("element", option.element.name());
        if (option.artUrl != null && !option.artUrl.isBlank()) m.put("art", option.artUrl);
        m.put("taken", option.used);
        return m;
    }

    static Map<String, Object> combatant(Combatant c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", c.getName());
        m.put("element", c.getElement() == null ? "NEUTRAL" : c.getElement().name());
        m.put("hp", Math.max(0, c.getHp()));
        m.put("maxHp", c.getMaxHp());
        if (c.getArtUrl() != null && !c.getArtUrl().isBlank()) m.put("art", c.getArtUrl());
        if (c.isKnight()) m.put("knight", true);
        return m;
    }

    private static List<Map<String, Object>> partySnapshot(SiegeRun run) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (run.getKnightUnit() != null) {
            out.add(combatant(run.getKnightUnit()));
        }
        for (Combatant member : run.getParty()) {
            out.add(combatant(member));
        }
        return out;
    }

    private Map<String, Object> current() {
        return stops.isEmpty() ? null : stops.get(stops.size() - 1);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> events(Map<String, Object> stop) {
        Object events = stop.get("events");
        if (events instanceof List<?> list) {
            return (List<Map<String, Object>>) list;
        }
        List<Map<String, Object>> fresh = new ArrayList<>();
        stop.put("events", fresh);
        return fresh;
    }

    /** Restores from a checkpoint; entries are copied so the snapshot map is not aliased. */
    @SuppressWarnings("unchecked")
    void restore(Object raw) {
        stops.clear();
        if (!(raw instanceof List<?> list)) {
            return;
        }
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> stop = new LinkedHashMap<>((Map<String, Object>) map);
                Object events = stop.get("events");
                stop.put("events", events instanceof List<?> l ? new ArrayList<>((List<Map<String, Object>>) l) : new ArrayList<>());
                stops.add(stop);
            }
        }
    }
}
