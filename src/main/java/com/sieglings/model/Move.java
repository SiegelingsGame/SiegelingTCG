package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;

/**
 * A universal move definition from the shared pool, convertible to {@link Ability} for the rules engine.
 */
public record Move(
        String id,
        String name,
        Element element,
        MoveCategory category,
        TargetType targetType,
        Element targetElement,
        Row targetRow,
        int targetCount,
        String effectType,
        int effectValue,
        int energyCost,
        String description,
        boolean isPassive,
        Element requiredElement,
        Reaction requiredReaction
) {
    public Move {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Move id is required.");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Move name is required.");
        }
        if (element == null) {
            throw new IllegalArgumentException("Move element is required.");
        }
        if (category == null) {
            throw new IllegalArgumentException("Move category is required.");
        }
        if (targetType == null) {
            throw new IllegalArgumentException("Move targetType is required.");
        }
        if (effectType == null || effectType.isBlank()) {
            throw new IllegalArgumentException("Move effectType is required.");
        }
        if (description == null) {
            description = "";
        }
    }

    public Ability toAbility() {
        Ability ability = new Ability(
                name,
                description,
                targetType,
                targetRow,
                targetCount,
                effectType,
                effectValue,
                isPassive || targetType == TargetType.PASSIVE
        );
        if (targetElement != null) {
            ability.setTargetElement(targetElement);
        }
        ability.setRequiredEnergy(Math.max(0, energyCost));
        if (requiredElement != null) {
            ability.setRequiredElement(requiredElement);
        }
        if (requiredReaction != null) {
            ability.setRequiredReaction(requiredReaction);
        }
        return ability;
    }
}
