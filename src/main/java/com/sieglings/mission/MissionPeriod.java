package com.sieglings.mission;

/**
 * Scope of a mission objective. Daily objectives reset each calendar day, weekly
 * objectives reset each ISO week, and lifetime objectives never reset — their
 * counters accumulate forever and each reward is claimable exactly once.
 */
public enum MissionPeriod {
    DAILY,
    WEEKLY,
    LIFETIME
}
