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
        /** Resolve / modify behaviour when the unit acts in Battle. */
        BATTLE_ACTION,
        /** Passive while stacks remain (checked on hits or continuously). */
        PERSISTENT,
        /** Consume on the next damaging hit the unit takes. */
        ON_HIT_TAKEN,
        NONE
    }

    public boolean hasSiegeMapping() {
        return siegeStatusKind != null && !siegeStatusKind.isBlank();
    }
}
