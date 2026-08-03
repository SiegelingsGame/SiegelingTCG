package com.sieglings.model;

/**
 * Master on/off switch for battle-table elemental afflictions (Burn, Chill, …).
 * Flipped from {@code app.battle.elemental-afflictions-enabled} at startup;
 * tests may call {@link #setEnabled(boolean)} directly.
 */
public final class ElementalAfflictions {

    private static volatile boolean enabled = true;

    private ElementalAfflictions() {}

    public static boolean isEnabled() {
        return enabled;
    }

    public static void setEnabled(boolean value) {
        enabled = value;
    }
}
