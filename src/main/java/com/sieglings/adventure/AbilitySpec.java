package com.sieglings.adventure;

import com.sieglings.model.enums.Element;

/**
 * A resolved, combat-ready ability shape shared by player cards (built from a
 * Siegeling move) and enemy abilities. Immutable.
 *
 * @param id          stable identifier (move id or enemy-ability id)
 * @param name        display name
 * @param element     element used for weakness math and theming
 * @param effect      what the ability does
 * @param value       magnitude (damage, heal, shield, buff amount…)
 * @param target      who it can be aimed at
 * @param actionCost  action points a player card costs (1–3); ignored for enemies
 * @param description short human-readable text
 */
record AbilitySpec(
        String id,
        String name,
        Element element,
        Effect effect,
        int value,
        TargetKind target,
        int actionCost,
        String description
) {
    boolean needsExplicitTarget() {
        return target == TargetKind.ENEMY_SINGLE || target == TargetKind.ALLY_SINGLE;
    }
}
