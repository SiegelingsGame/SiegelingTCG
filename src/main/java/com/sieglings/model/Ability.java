package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;

/**
 * Universal ability/effect definition used by Sieglings, Spells, and Trainers.
 */
public class Ability {
    private String name;
    private String description;
    private TargetType targetType;
    /** Optional element filter for targets (e.g. ALL_ALLIES but only ICE). */
    private Element targetElement;
    private Row targetRow;          // null = any row
    private int targetCount;        // number of targets (0 = all matching)
    private String effectType;      // See AbilityEffectKeys and ABILITY_EFFECT_KEYS.md
    private int effectValue;
    private boolean passive;

    // Cost requirements
    private Element requiredElement;
    private int requiredEnergy;
    private Reaction requiredReaction;

    /** True when this battle-queue option was converted from a printed passive Siegling ability (UI only). */
    private boolean battleOptionFromPrintedPassive;

    public Ability() {}

    public Ability(String name, String description, TargetType targetType, Row targetRow,
                   int targetCount, String effectType, int effectValue, boolean passive) {
        this.name = name;
        this.description = description;
        this.targetType = targetType;
        this.targetRow = targetRow;
        this.targetCount = targetCount;
        this.effectType = effectType;
        this.effectValue = effectValue;
        this.passive = passive;
    }

    // Static factory methods for common ability patterns
    public static Ability damage(String name, String desc, TargetType target, Row row, int count, int value) {
        return new Ability(name, desc, target, row, count, AbilityEffectKeys.DAMAGE, value, false);
    }

    public static Ability heal(String name, String desc, TargetType target, Row row, int count, int value) {
        return new Ability(name, desc, target, row, count, AbilityEffectKeys.HEAL, value, false);
    }

    public static Ability freeze(String name, String desc, TargetType target, Row row, int count) {
        return new Ability(name, desc, target, row, count, AbilityEffectKeys.FREEZE, 1, false);
    }

    public static Ability passive(String name, String desc, String effectType, int value) {
        return new Ability(name, desc, TargetType.PASSIVE, null, 0, effectType, value, true);
    }

    public static Ability passiveRow(String name, String desc, String effectType, int value, Row row, TargetType target) {
        return new Ability(name, desc, target, row, 0, effectType, value, true);
    }

    public static Ability connectedAlliesHealthBoost(String name, String desc, int value) {
        return new Ability(name, desc, TargetType.SELF, null, 0, AbilityEffectKeys.CONNECTED_ALLIES_HEALTH_BOOST, value, false);
    }

    // Trainer (SiegeKnight) passive form: continuously grants connected allied
    // Sieglings extra max health. Marked passive so the per-turn trainer-passive
    // recalculation in GameService picks it up.
    public static Ability passiveConnectedAlliesHealthBoost(String name, String desc, int value) {
        return new Ability(name, desc, TargetType.PASSIVE, null, 0, AbilityEffectKeys.CONNECTED_ALLIES_HEALTH_BOOST, value, true);
    }

    public static Ability connectedAlliesShield(String name, String desc, int value) {
        return new Ability(name, desc, TargetType.SELF, null, 0, AbilityEffectKeys.CONNECTED_ALLIES_SHIELD, value, false);
    }

    public static Ability connectedAlliesDamageBoost(String name, String desc, int value) {
        return new Ability(name, desc, TargetType.SELF, null, 0, AbilityEffectKeys.CONNECTED_ALLIES_DAMAGE_BOOST, value, false);
    }

    public static Ability connectedAlliesSpeedBoost(String name, String desc, int value) {
        return new Ability(name, desc, TargetType.SELF, null, 0, AbilityEffectKeys.CONNECTED_ALLIES_SPEED_BOOST, value, false);
    }

    public static Ability connectedAlliesSlow(String name, String desc, int value) {
        return new Ability(name, desc, TargetType.SELF, null, 0, AbilityEffectKeys.CONNECTED_ALLIES_SLOW, value, false);
    }

    public Ability copy() {
        Ability copy = new Ability(name, description, targetType, targetRow, targetCount, effectType, effectValue, passive);
        copy.setTargetElement(targetElement);
        copy.setRequiredElement(requiredElement);
        copy.setRequiredEnergy(requiredEnergy);
        copy.setRequiredReaction(requiredReaction);
        copy.setBattleOptionFromPrintedPassive(battleOptionFromPrintedPassive);
        return copy;
    }

    // Getters and setters
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public TargetType getTargetType() { return targetType; }
    public void setTargetType(TargetType targetType) { this.targetType = targetType; }
    public Element getTargetElement() { return targetElement; }
    public void setTargetElement(Element targetElement) { this.targetElement = targetElement; }
    public Row getTargetRow() { return targetRow; }
    public void setTargetRow(Row targetRow) { this.targetRow = targetRow; }
    public int getTargetCount() { return targetCount; }
    public void setTargetCount(int targetCount) { this.targetCount = targetCount; }
    public String getEffectType() { return effectType; }
    public void setEffectType(String effectType) { this.effectType = effectType; }
    public int getEffectValue() { return effectValue; }
    public void setEffectValue(int effectValue) { this.effectValue = effectValue; }
    public boolean isPassive() { return passive; }
    public void setPassive(boolean passive) { this.passive = passive; }
    public Element getRequiredElement() { return requiredElement; }
    public void setRequiredElement(Element requiredElement) { this.requiredElement = requiredElement; }
    public int getRequiredEnergy() { return requiredEnergy; }
    public void setRequiredEnergy(int requiredEnergy) { this.requiredEnergy = requiredEnergy; }
    public Reaction getRequiredReaction() { return requiredReaction; }
    public void setRequiredReaction(Reaction requiredReaction) { this.requiredReaction = requiredReaction; }
    public boolean isBattleOptionFromPrintedPassive() { return battleOptionFromPrintedPassive; }
    public void setBattleOptionFromPrintedPassive(boolean battleOptionFromPrintedPassive) {
        this.battleOptionFromPrintedPassive = battleOptionFromPrintedPassive;
    }
}
