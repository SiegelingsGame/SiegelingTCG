package com.sieglings.adventure;

import com.sieglings.model.enums.Element;

import java.util.LinkedHashMap;
import java.util.Map;

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
 * @param rider        extra effect added by a level-up amplification ({@link AmpRider#NONE} normally)
 * @param riderValue   magnitude of {@link #rider}
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
        int statusChance,
        AmpRider rider,
        int riderValue
) {
    /** Convenience constructor for abilities with no status rider. */
    AbilitySpec(String id, String name, Element element, Effect effect, int value,
                TargetKind target, int actionCost, String description) {
        this(id, name, element, effect, value, target, actionCost, description, null, 0);
    }

    /** Convenience constructor for abilities with a status rider but no amp. */
    AbilitySpec(String id, String name, Element element, Effect effect, int value,
                TargetKind target, int actionCost, String description,
                StatusKind status, int statusChance) {
        this(id, name, element, effect, value, target, actionCost, description,
                status, statusChance, AmpRider.NONE, 0);
    }

    boolean hasRider() {
        return rider != null && rider != AmpRider.NONE && riderValue > 0;
    }

    boolean needsExplicitTarget() {
        return target == TargetKind.ENEMY_SINGLE || target == TargetKind.ALLY_SINGLE;
    }

    /**
     * Checkpoint / veteran snapshot shape. One writer so a new field (amp
     * riders, …) cannot survive a mid-run save and then vanish when the team
     * is extracted for Battlegrounds.
     */
    Map<String, Object> toSnapshot() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("id", id);
        s.put("name", name);
        s.put("element", element == null ? null : element.name());
        s.put("effect", effect.name());
        s.put("value", value);
        s.put("target", target.name());
        s.put("cost", actionCost);
        s.put("desc", description);
        s.put("status", status == null ? null : status.name());
        s.put("statusChance", statusChance);
        if (hasRider()) {
            s.put("rider", rider.name());
            s.put("riderValue", riderValue);
        }
        return s;
    }
}
