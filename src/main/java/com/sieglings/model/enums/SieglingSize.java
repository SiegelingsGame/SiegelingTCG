package com.sieglings.model.enums;

import java.util.Locale;

/**
 * Physical scale of a Siegling, used by presentation surfaces that draw the creature at
 * world scale (currently the Keep enclave cutouts) rather than as a fixed-size card.
 *
 * <p>Cards leave this unset by default; {@link #defaultFor(Rarity, int)} then supplies the
 * band so designers only have to touch the dashboard for genuine one-off exceptions.</p>
 */
public enum SieglingSize {
    SMALL,
    MEDIUM,
    LARGE,
    GIGANTIC;

    /**
     * The size a card falls into when the dashboard has not pinned one.
     *
     * <p>Rarity is the band, because in this catalog rarity already tracks how far along an
     * evolution line a card sits. Evolution depth only decides cards whose rarity is missing
     * (hand-authored overrides may omit it): base form small, second stage medium, final
     * stage large. Legendaries are gigantic regardless of where they sit in a line.</p>
     */
    public static SieglingSize defaultFor(Rarity rarity, int evolutionDepth) {
        if (rarity == null) {
            return evolutionDepth <= 0 ? SMALL : evolutionDepth == 1 ? MEDIUM : LARGE;
        }
        return switch (rarity) {
            case COMMON, UNCOMMON -> SMALL;
            case RARE -> MEDIUM;
            case EPIC -> LARGE;
            case LEGENDARY -> GIGANTIC;
        };
    }

    /** Lenient parse for dashboard/override JSON; unknown or blank values mean "use the default". */
    public static SieglingSize parse(String raw) {
        if (raw == null) {
            return null;
        }
        String normalized = raw.trim().toUpperCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return null;
        }
        for (SieglingSize size : values()) {
            if (size.name().equals(normalized)) {
                return size;
            }
        }
        return null;
    }
}
