package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.TargetType;

/**
 * Runtime battle choice exposed to the UI for one acting Siegling.
 */
public class BattleAbilityOption {
    private int index;
    private Ability ability;
    private Element requiredElement;
    private int requiredEnergy;
    private boolean affordable;

    public BattleAbilityOption(int index, Ability ability, Element requiredElement, int requiredEnergy, boolean affordable) {
        this.index = index;
        this.ability = ability;
        this.requiredElement = requiredElement;
        this.requiredEnergy = requiredEnergy;
        this.affordable = affordable;
    }

    public int getIndex() { return index; }
    public Ability getAbility() { return ability; }
    public Element getRequiredElement() { return requiredElement; }
    public int getRequiredEnergy() { return requiredEnergy; }
    public boolean isAffordable() { return affordable; }
    public TargetType getTargetType() { return ability.getTargetType(); }
}
