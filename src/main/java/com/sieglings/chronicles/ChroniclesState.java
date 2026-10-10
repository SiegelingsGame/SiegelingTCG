package com.sieglings.chronicles;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One Siegeknight's whole save. Persisted as a single JSON document, so new fields
 * only need a default here; times are epoch millis to keep the JSON plain.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class ChroniclesState {
    public int schema = 1;
    public long version;
    public String userId = "";
    public String knightName = "";
    public long seed;
    public long createdAt;
    public long updatedAt;

    public long rankXp;
    public Map<String, Long> skillXp = new LinkedHashMap<>();
    /** Keyed by {@code Element.name()}. */
    public Map<String, Long> affinityXp = new LinkedHashMap<>();
    /** Keyed by class name (Guardian, Bruiser, ...). */
    public Map<String, Long> masteryXp = new LinkedHashMap<>();
    /** Keyed by weapon discipline id (sword, spear, ...). */
    public Map<String, Long> weaponXp = new LinkedHashMap<>();

    public Map<String, Integer> inventory = new LinkedHashMap<>();
    public String weaponId = "squires_sword";
    public String armorId = "travelers_coat";
    public String relicId = "";

    public List<Companion> companions = new ArrayList<>();
    public int nextCompanionNo = 1;
    /** Ordered FRONT, FLANK, REAR; "" marks an empty slot. */
    public List<String> party = new ArrayList<>();
    public String reserveId = "";
    public String helperId = "";

    public Tactics tactics = new Tactics();
    public ActivityRun activity;
    public Expedition expedition;
    public List<Sighting> sightings = new ArrayList<>();
    public AwayReport away;

    public int expeditionsCompleted;
    public int tamedCount;
    public int sightingCounter;
    public List<String> processedRequestIds = new ArrayList<>();

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Companion {
        public String id = "";
        public String speciesId = "";
        public String nickname = "";
        public String origin = "tamed";
        public int level = 1;
        public long xp;
        public long bond;
        public long joinedAt;
        public int expeditions;
        public int battlesWon;
        public String treatsDay = "";
        public int treatsToday;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Tactics {
        /** Retreat once the company's remaining health falls below this percent (0 = never). */
        public int retreatAt = 20;
        /** Give a potion to a Siegeling below this percent health (0 = never). */
        public int potionAt = 40;
        /** When the knight's command fires; null uses the weapon's default. */
        public String trigger;
        /** Prepared Familiarity technique id, or "". */
        public String techniqueId = "";
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ActivityRun {
        /** "gather" or "craft". */
        public String kind = "gather";
        public String id = "";
        public long startedAt;
        public long lastTickAt;
        public long remainderMs;
        public long actions;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Expedition {
        public String routeId = "";
        public long startedAt;
        public long plannedEndAt;
        public long completesAt;
        public String outcome = "complete";
        public List<String> partyIds = new ArrayList<>();
        public String reserveId = "";
        public String techniqueId = "";
        public String trigger = "";
        public Map<String, Integer> supplies = new LinkedHashMap<>();
        public Map<String, Integer> suppliesLeft = new LinkedHashMap<>();
        public List<TimelineEvent> timeline = new ArrayList<>();
        public Rewards rewards = new Rewards();
        public int encountersWon;
        public int encountersTotal;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TimelineEvent {
        public long atMs;
        public String kind = "";
        public String text = "";
        public String tone = "";

        public TimelineEvent() {}

        public TimelineEvent(long atMs, String kind, String text, String tone) {
            this.atMs = atMs;
            this.kind = kind;
            this.text = text;
            this.tone = tone;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Rewards {
        public Map<String, Integer> items = new LinkedHashMap<>();
        public Map<String, Long> companionXp = new LinkedHashMap<>();
        public Map<String, Long> bond = new LinkedHashMap<>();
        public Map<String, Integer> battles = new LinkedHashMap<>();
        public Map<String, Long> affinityXp = new LinkedHashMap<>();
        public Map<String, Long> masteryXp = new LinkedHashMap<>();
        public Map<String, Long> weaponXp = new LinkedHashMap<>();
        public Map<String, Long> skillXp = new LinkedHashMap<>();
        public long rankXp;
        public List<Sighting> sightings = new ArrayList<>();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Sighting {
        public String id = "";
        public String speciesId = "";
        public int level = 1;
        public String routeId = "";
        public String behavior = "gentle";
        public long foundAt;
        public long expiresAt;
        public long seed;
    }

    /** Gains from the knight's activity since the player last dismissed the report. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class AwayReport {
        public long fromAt;
        public long toAt;
        public String activityName = "";
        public long actions;
        public boolean capped;
        public String stoppedReason = "";
        public Map<String, Integer> items = new LinkedHashMap<>();
        public Map<String, Integer> consumed = new LinkedHashMap<>();
        public Map<String, Long> skillXp = new LinkedHashMap<>();
    }
}
