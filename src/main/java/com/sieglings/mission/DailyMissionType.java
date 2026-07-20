package com.sieglings.mission;

/**
 * Counter keys tracked per player for mission progress. The same keys are tracked
 * at daily, weekly, and lifetime scope (see {@link MissionPeriod}); daily and
 * weekly counters reset on their boundary while lifetime counters accumulate.
 */
public enum DailyMissionType {
    PVP_WINS,
    SOLO_WINS,
    PACK_OPENS,
    SIEGECOINS_EARNED,
    SPELLS_CAST,
    TRAPS_SPRUNG,
    SIEGELINGS_DEFEATED,
    MATCHES_PLAYED,
    // Siege / Adventure Expedition counters, fed by SiegeService end-of-run rewards.
    SIEGE_RUNS,
    SIEGE_WINS,
    SIEGE_BOSS_KILLS,
    SIEGE_NODES_CLEARED
}
