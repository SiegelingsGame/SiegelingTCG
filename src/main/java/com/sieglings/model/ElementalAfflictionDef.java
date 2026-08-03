package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.ElementalAffliction;

/**
 * One row of the elemental affliction table. Immutable design data — runtime
 * stacks live on {@link CardInstance}.
 */
public record ElementalAfflictionDef(
        Element element,
        ElementalAffliction affliction,
        String displayName,
        String shortLabel,
        String battleSummary,
        TickPhase battleTickPhase,
        int damagePerStack,
        int stackCap,
        int stacksPerHit,
        boolean clearsOnTick,
        boolean battleEnabled,
        /** Matching Siege {@code StatusKind} name, or null when Siege has no mapping yet. */
        String siegeStatusKind
) {
    public enum TickPhase {
        /** Resolve when the afflicted Siegeling's owner enters Setup. */
        OWNER_SETUP_START,
        /** Resolve / modify behaviour when the unit acts or pays for an ability. */
        BATTLE_ACTION,
        /** Passive while stacks remain (Speed, soak, claim blocks, etc.). */
        PERSISTENT,
        /** Checked when the unit takes an attack hit. */
        ON_HIT_TAKEN,
        /** Intercepts heal resolution (Toxin). */
        ON_HEAL,
        /** Fires when stacks reach the cap (Insight draw, Ice freeze). */
        ON_STACK_THRESHOLD,
        NONE
    }

    public boolean hasSiegeMapping() {
        return siegeStatusKind != null && !siegeStatusKind.isBlank();
    }
}
