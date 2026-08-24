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
     * <p>Rarity and evolution depth are both bands and the larger one wins, so a late-stage
     * form never draws smaller than its own precursor: base form small, second stage medium,
     * final stage large, on top of common/uncommon small, rare medium, epic large, legendary
     * gigantic. Rarity alone was not enough — a stage-3 form printed at RARE (Generoot) stood
     * the same height as the stage-1 starters beside it.</p>
     */
    public static SieglingSize defaultFor(Rarity rarity, int evolutionDepth) {
        SieglingSize byDepth = evolutionDepth <= 0 ? SMALL : evolutionDepth == 1 ? MEDIUM : LARGE;
        if (rarity == null) {
            return byDepth;
        }
        SieglingSize byRarity = switch (rarity) {
            case COMMON, UNCOMMON -> SMALL;
            case RARE -> MEDIUM;
            case EPIC -> LARGE;
            case LEGENDARY -> GIGANTIC;
        };
        return byRarity.ordinal() >= byDepth.ordinal() ? byRarity : byDepth;
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
