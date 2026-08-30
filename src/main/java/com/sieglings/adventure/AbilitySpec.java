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
 * @param rider        extra effect added by a level-up amplification ({@link AmpRider#NONE} normally)
 * @param riderValue   magnitude of {@link #rider}
 * @param durationRounds how many rounds a stat buff granted by this ability lasts;
 *                     0 means "no duration" — either the effect is not a buff, or the
 *                     buff is battle-long. Defaulted per effect by
 *                     {@link SiegeTuning#defaultBuffRounds} when a caller does not say.
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
        int riderValue,
        int durationRounds
) {
    /** Whether the stat buff this ability grants ever lapses on its own. */
    boolean buffExpires() {
        return durationRounds > 0;
    }

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

    /**
     * Convenience constructor for a spec with an amp rider but no explicit buff
     * duration — the duration falls back to the per-effect default.
     */
    AbilitySpec(String id, String name, Element element, Effect effect, int value,
                TargetKind target, int actionCost, String description,
                StatusKind status, int statusChance, AmpRider rider, int riderValue) {
        this(id, name, element, effect, value, target, actionCost, description,
                status, statusChance, rider, riderValue, SiegeTuning.defaultBuffRounds(effect));
    }

    boolean hasRider() {
        return rider != null && rider != AmpRider.NONE && riderValue > 0;
    }

    boolean needsExplicitTarget() {
        return target == TargetKind.ENEMY_SINGLE || target == TargetKind.ALLY_SINGLE;
    }
}
