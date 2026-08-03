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
                        "At owner's Setup: take 1 damage per Burn stack, then Burn clears.",
                        ElementalAfflictionDef.TickPhase.OWNER_SETUP_START,
                        1, 5, 1, true, true, "BURN"),
                def(Element.ICE, ElementalAffliction.CHILL, "Chill", "Chill",
                        "−1 Speed per stack. At 3 stacks: Frozen until owner's next Setup, then clear.",
                        ElementalAfflictionDef.TickPhase.ON_STACK_THRESHOLD,
                        0, 3, 1, false, false, "SLOW"),
                def(Element.EARTH, ElementalAffliction.STAGGER, "Stagger", "Stagger",
                        "1 stack: no effect. 2 stacks: moved to the bottom of the battle queue.",
                        ElementalAfflictionDef.TickPhase.BATTLE_ACTION,
                        0, 2, 1, false, false, "STUN"),
                def(Element.WIND, ElementalAffliction.DISORIENT, "Disorient", "Disorient",
                        "+1 energy cost on this card's lowest-cost ability per stack (ties: ability order).",
                        ElementalAfflictionDef.TickPhase.BATTLE_ACTION,
                        0, 3, 1, false, false, "DISORIENT"),
                def(Element.WATER, ElementalAffliction.SOAK, "Soak", "Soak",
                        "Attacks against this Siegeling deal +1 damage per Soak stack.",
                        ElementalAfflictionDef.TickPhase.ON_HIT_TAKEN,
                        0, 5, 1, false, false, "SOAK"),
                def(Element.ELECTRIC, ElementalAffliction.SHOCK, "Shock", "Shock",
                        "This card may spend 1 less energy per Shock stack on its abilities (pool unchanged).",
                        ElementalAfflictionDef.TickPhase.BATTLE_ACTION,
                        0, 5, 1, false, false, "SHOCK"),
                def(Element.METAL, ElementalAffliction.RUST, "Rust", "Rust",
                        "Next Metal attack deals +1 per Rust stack, then Rust clears.",
                        ElementalAfflictionDef.TickPhase.ON_HIT_TAKEN,
                        0, 3, 1, false, false, "RUST"),
                def(Element.POISON, ElementalAffliction.TOXIN, "Toxin", "Toxin",
                        "Cannot be healed. Heals remove 1 Toxin per HP they would have restored.",
                        ElementalAfflictionDef.TickPhase.ON_HEAL,
                        0, 5, 1, false, false, "POISON"),
                def(Element.SHADOW, ElementalAffliction.CURSE, "Curse", "Curse",
                        "While Cursed: cannot be claimed and cannot evolve.",
                        ElementalAfflictionDef.TickPhase.PERSISTENT,
                        0, 2, 1, false, false, "CURSE"),
                def(Element.PSYCHIC, ElementalAffliction.INSIGHT, "Insight", "Insight",
                        "At 3 stacks: the inflicting player draws 1 card and all Insight on this target clears.",
                        ElementalAfflictionDef.TickPhase.ON_STACK_THRESHOLD,
                        0, 3, 1, true, false, "INSIGHT"),
                def(Element.LIGHT, ElementalAffliction.BLIND, "Blind", "Blind",
                        "This card's ability effect values are reduced by 1 per Blind stack.",
                        ElementalAfflictionDef.TickPhase.BATTLE_ACTION,
                        0, 3, 1, false, false, "BLIND"),
                def(Element.UNDEAD, ElementalAffliction.WITHER, "Wither", "Wither",
                        "At owner's Setup: −1 effective max HP per stack, then Wither clears.",
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
