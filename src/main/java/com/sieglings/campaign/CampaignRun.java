package com.sieglings.campaign;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Durable campaign save. Arena fights hand off to the Battle Table via {@link #battleToken};
 * wild captures live in {@code CampaignWildSupport} keyed by this run's token.
 */
public class CampaignRun {

    public enum Phase {
        NEW_GAME,
        WORLD,
        LAND,
        WILD_BATTLE,
        ARENA_BATTLE,
        RALLY,
        AKHAR_READY,
        VICTORY,
        DEFEAT,
        OVER
    }

    public enum ArenaKind {
        RIVAL,
        KNIGHT,
        AKHAR,
        /** A roaming wild Siegeling met in the open world; winning captures it. */
        WILD,
        /** A Land's elemental Legendary at its shrine; winning earns that element's Sigil. */
        LEGENDARY
    }

    /** Most Siegelings either side fields in a campaign Arena battle. */
    public static final int ARENA_PARTY_MAX = 3;

    public String token;
    public String ownerUserId = "";
    public String playerName = "Squire";
    public Phase phase = Phase.NEW_GAME;
    public long savedAtMillis = System.currentTimeMillis();

    /** Chosen starter card id (sundile / cacty / fawny / breezee). */
    public String starterId;
    public String starterElement;
    /** Always squire-bob for campaign. */
    public String trainerId = "squire-bob";

    /** Owned Siegeling card ids (campaign roster). */
    public List<String> roster = new ArrayList<>();
    /** Up to {@link #ARENA_PARTY_MAX} card ids that take the field in Arena battles. */
    public List<String> arenaPreset = new ArrayList<>();
    /** Board cell (row * 3 + col on the player's half; row 0 is the front line) per preset card. */
    public Map<String, Integer> presetCells = new LinkedHashMap<>();

    /** Where Bob is walking: "sanctuary", "wildlands", or a Land id. Battles return here. */
    public String area = "sanctuary";

    /** Squire Bob's SiegeKnight level and experience toward the next one. */
    public int level = 1;
    public int xp;

    /** Unequipped campaign items (ids from {@link CampaignItems}); duplicates allowed. */
    public List<String> items = new ArrayList<>();
    /** Item held by each roster Siegeling. */
    public Map<String, String> equipped = new LinkedHashMap<>();

    /** Element ids whose Legendary has been defeated (one Sigil each). */
    public Set<String> sigils = new LinkedHashSet<>();
    /** Card ids met in battle; caught ones live in {@link #roster}. Drives the CoDex. */
    public Set<String> seen = new LinkedHashSet<>();
    /** Newest-last quest journal: {at, kind, text}. */
    public List<Map<String, Object>> journal = new ArrayList<>();

    /** The wild Siegeling an Arena WILD battle is for (captured on a win). */
    public String pendingWildCardId;
    public String pendingArenaArea;

    public String currentLandId;
    public Set<String> unlockedLandIds = new LinkedHashSet<>();
    public Set<String> ralliedLandIds = new LinkedHashSet<>();
    public Set<String> clearedRivalLandIds = new LinkedHashSet<>();

    public int gold;
    public String lastMessage = "";
    public String battleToken;
    public ArenaKind pendingArenaKind;
    public String pendingArenaLandId;
    public boolean lastBattleWon;
    public String lastBattleEncounter;

    public String pendingCaptureCardId;
    public String pendingCaptureName;

    public int maxPresetSize() {
        return Math.min(ARENA_PARTY_MAX, Math.max(1, roster.size()));
    }

    public static int xpToNext(int level) {
        return 100 * Math.max(1, level);
    }

    public static final int MAX_LEVEL = 10;
}
