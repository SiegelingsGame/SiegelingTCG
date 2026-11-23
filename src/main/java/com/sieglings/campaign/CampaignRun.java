package com.sieglings.campaign;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
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
        AKHAR
    }

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
    /** Up to 5 card ids for Arena presets; first N used per fight. */
    public List<String> arenaPreset = new ArrayList<>();

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
        return Math.min(5, Math.max(1, roster.size()));
    }
}
