package com.sieglings.adventure;

import com.sieglings.model.enums.Element;

/**
 * A resolved, combat-ready ability shape shared by player cards (built from a
 * Siegeling move) and enemy abilities. Immutable.
 *
 * <p>Elements carry no strengths or weaknesses — they only provide status
 * effects. A damaging ability may apply {@link #status} to each target with a
 * {@link #statusChance} percent roll; the chance is written on the card.
 *
 * @param id           stable identifier (move id or enemy-ability id)
 * @param name         display name
 * @param element      element used for status flavor and theming
 * @param effect       what the ability does
 * @param value        magnitude (damage, heal, shield, buff amount…)
 * @param target       who it can be aimed at
 * @param actionCost   action points a player card costs (0–3); ignored for enemies
 * @param description  short human-readable text
 * @param status       elemental status this ability can inflict, or null
 * @param statusChance percent chance (0–100) to inflict {@link #status} per target
 */
record AbilitySpec(
        String id,
        String name,
        Element element,
        Effect effect,
        int value,
        TargetKind target,
        int actionCost,
        String description,
        StatusKind status,
        int statusChance
) {
    /** Convenience constructor for abilities with no status rider. */
    AbilitySpec(String id, String name, Element element, Effect effect, int value,
                TargetKind target, int actionCost, String description) {
        this(id, name, element, effect, value, target, actionCost, description, null, 0);
    }

    boolean needsExplicitTarget() {
        return target == TargetKind.ENEMY_SINGLE || target == TargetKind.ALLY_SINGLE;
    }
}
