package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.ElementalAffliction;

import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Source of truth for elemental damage → negative status badges.
 * See {@code docs/ELEMENTAL_STATUS_EFFECTS.md}.
 *
 * <p>Battle and Siege both read this table. Only rows with
 * {@link ElementalAfflictionDef#battleEnabled()} inflict/tick on the battle
 * table today; Siege uses {@link ElementalAfflictionDef#siegeStatusKind()} when
 * that enum value exists in adventure mode.
 */
public final class ElementalAfflictionCatalog {

    private static final Map<Element, ElementalAfflictionDef> BY_ELEMENT;
    private static final Map<ElementalAffliction, ElementalAfflictionDef> BY_AFFLICTION;

    static {
        List<ElementalAfflictionDef> rows = List.of(
                def(Element.FIRE, ElementalAffliction.BURN, "Burn", "Burn",
                        "Takes flat damage per Burn badge at the start of its owner's Setup, then Burn clears.",
                        ElementalAfflictionDef.TickPhase.OWNER_SETUP_START,
                        1, 5, 1, true, true, "BURN"),
                def(Element.ICE, ElementalAffliction.CHILL, "Chill", "Chill",
                        "−1 Speed per Chill badge. At cap, also skips its next battle action.",
                        ElementalAfflictionDef.TickPhase.PERSISTENT,
                        0, 3, 1, false, false, "SLOW"),
                def(Element.EARTH, ElementalAffliction.STAGGER, "Stagger", "Stagger",
                        "Acts last while staggered; at cap, skips its next battle action.",
                        ElementalAfflictionDef.TickPhase.BATTLE_ACTION,
                        0, 2, 1, false, false, "STUN"),
                def(Element.WIND, ElementalAffliction.DISORIENT, "Disorient", "Disorient",
                        "Next ability costs +1 energy per badge, then loses 1 Disorient.",
                        ElementalAfflictionDef.TickPhase.OWNER_SETUP_START,
                        0, 3, 1, false, false, "SHOCK"),
                def(Element.WATER, ElementalAffliction.SOAK, "Soak", "Soak",
                        "Takes +1 from Electric/Ice per badge; Burn damage against it is reduced by 1 (min 1).",
                        ElementalAfflictionDef.TickPhase.PERSISTENT,
                        0, 3, 1, false, false, "SOAK"),
                def(Element.ELECTRIC, ElementalAffliction.SHOCK, "Shock", "Shock",
                        "At Setup, drains 1 energy from its owner (or forces act-last), then loses 1 Shock.",
                        ElementalAfflictionDef.TickPhase.OWNER_SETUP_START,
                        0, 3, 1, false, false, "SHOCK"),
                def(Element.METAL, ElementalAffliction.RUST, "Rust", "Rust",
                        "Takes +1 damage per Rust badge from the next damaging hit, then loses 1 Rust.",
                        ElementalAfflictionDef.TickPhase.ON_HIT_TAKEN,
                        0, 3, 1, false, false, "RUST"),
                def(Element.POISON, ElementalAffliction.TOXIN, "Toxin", "Toxin",
                        "Takes flat damage per Toxin badge at the start of its owner's Setup; stacks persist.",
                        ElementalAfflictionDef.TickPhase.OWNER_SETUP_START,
                        1, 5, 1, false, false, "POISON"),
                def(Element.SHADOW, ElementalAffliction.CURSE, "Curse", "Curse",
                        "Cannot be claimed for temp energy this Setup; loses 1 Curse after Setup.",
                        ElementalAfflictionDef.TickPhase.OWNER_SETUP_START,
                        0, 2, 1, false, false, "CURSE"),
                def(Element.PSYCHIC, ElementalAffliction.DAZE, "Daze", "Daze",
                        "Abilities cost +1 energy; at cap, the next ability picks a random legal target.",
                        ElementalAfflictionDef.TickPhase.BATTLE_ACTION,
                        0, 2, 1, false, false, "DAZE"),
                def(Element.LIGHT, ElementalAffliction.BLIND, "Blind", "Blind",
                        "Next damaging ability deals −1 per Blind badge (min 1), then Blind clears.",
                        ElementalAfflictionDef.TickPhase.BATTLE_ACTION,
                        0, 3, 1, true, false, "BLIND"),
                def(Element.UNDEAD, ElementalAffliction.WITHER, "Wither", "Wither",
                        "−1 effective max HP per badge during Setup, then Wither clears.",
                        ElementalAfflictionDef.TickPhase.OWNER_SETUP_START,
                        0, 3, 1, true, false, "WITHER")
        );

        Map<Element, ElementalAfflictionDef> byElement = new EnumMap<>(Element.class);
        Map<ElementalAffliction, ElementalAfflictionDef> byAffliction = new EnumMap<>(ElementalAffliction.class);
        for (ElementalAfflictionDef row : rows) {
            byElement.put(row.element(), row);
            byAffliction.put(row.affliction(), row);
        }
        BY_ELEMENT = Collections.unmodifiableMap(byElement);
        BY_AFFLICTION = Collections.unmodifiableMap(byAffliction);
    }

    private ElementalAfflictionCatalog() {}

    private static ElementalAfflictionDef def(
            Element element,
            ElementalAffliction affliction,
            String displayName,
            String shortLabel,
            String battleSummary,
            ElementalAfflictionDef.TickPhase tickPhase,
            int damagePerStack,
            int stackCap,
            int stacksPerHit,
            boolean clearsOnTick,
            boolean battleEnabled,
            String siegeStatusKind
    ) {
        return new ElementalAfflictionDef(
                element, affliction, displayName, shortLabel, battleSummary,
                tickPhase, damagePerStack, stackCap, stacksPerHit,
                clearsOnTick, battleEnabled, siegeStatusKind
        );
    }

    public static Optional<ElementalAfflictionDef> forElement(Element element) {
        if (element == null || element == Element.NEUTRAL) {
            return Optional.empty();
        }
        return Optional.ofNullable(BY_ELEMENT.get(element));
    }

    public static Optional<ElementalAfflictionDef> forAffliction(ElementalAffliction affliction) {
        if (affliction == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(BY_AFFLICTION.get(affliction));
    }

    /** All designed rows (including battle-disabled placeholders). */
    public static List<ElementalAfflictionDef> all() {
        return List.copyOf(BY_ELEMENT.values());
    }

    public static List<ElementalAfflictionDef> battleEnabled() {
        return BY_ELEMENT.values().stream().filter(ElementalAfflictionDef::battleEnabled).toList();
    }
}
