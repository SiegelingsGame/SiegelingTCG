package com.sieglings.model;

import java.util.Set;

/**
 * Canonical ability effect keys used by card definitions, manual overrides, and effect resolution.
 */
public final class AbilityEffectKeys {

    public static final String DAMAGE = "damage";
    public static final String PLAYER_DAMAGE = "player_damage";
    public static final String DRAW = "draw";
    public static final String HEAL = "heal";
    public static final String SHIELD = "shield";
    public static final String FREEZE = "freeze";
    public static final String SPEED_ZERO = "speed_zero";
    public static final String SLOW = "slow";
    public static final String DAMAGE_BOOST = "damage_boost";
    public static final String HEALTH_BOOST = "health_boost";
    public static final String CONNECTED_ALLIES_DAMAGE_BOOST = "connected_allies_damage_boost";
    public static final String CONNECTED_ALLIES_HEALTH_BOOST = "connected_allies_health_boost";
    public static final String CONNECTED_ALLIES_SHIELD = "connected_allies_shield";
    public static final String SPEED_BOOST = "speed_boost";
    public static final String CONNECTED_ALLIES_SLOW = "connected_allies_slow";
    public static final String CONNECTED_ALLIES_SPEED_BOOST = "connected_allies_speed_boost";
    public static final String DESTROY = "destroy";
    public static final String MOVE_LINK = "move_link";

    private static final Set<String> ALL = Set.of(
            DAMAGE,
            PLAYER_DAMAGE,
            DRAW,
            HEAL,
            SHIELD,
            FREEZE,
            SPEED_ZERO,
            SLOW,
            DAMAGE_BOOST,
            HEALTH_BOOST,
            CONNECTED_ALLIES_DAMAGE_BOOST,
            CONNECTED_ALLIES_HEALTH_BOOST,
            CONNECTED_ALLIES_SHIELD,
            SPEED_BOOST,
            CONNECTED_ALLIES_SLOW,
            CONNECTED_ALLIES_SPEED_BOOST,
            DESTROY,
            MOVE_LINK
    );

    private AbilityEffectKeys() {}

    public static boolean isSupported(String effectKey) {
        return effectKey != null && ALL.contains(effectKey);
    }

    public static Set<String> all() {
        return ALL;
    }
}
