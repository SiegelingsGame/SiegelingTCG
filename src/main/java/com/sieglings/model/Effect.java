package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.StatusEffect;
import com.sieglings.model.enums.TargetType;

/**
 * Universal effect structure used by abilities, spells, and trainers.
 */
public class Effect {
    private final String description;
    private final TargetType targetType;
    private final Row targetRow;       // null = any row
    private final int targetCount;     // 0 = all matching targets
    private final int damage;
    private final int healing;
    private final int attackBuff;
    private final int defenseBuff;
    private final int healthBuff;
    private final int speedBuff;
    private final StatusEffect appliesStatus;
    private final boolean isPassive;

    // Energy/reaction requirements for this effect
    private final Element requiredElement;
    private final int requiredEnergy;
    private final Reaction requiredReaction;

    private Effect(Builder b) {
        this.description = b.description;
        this.targetType = b.targetType;
        this.targetRow = b.targetRow;
        this.targetCount = b.targetCount;
        this.damage = b.damage;
        this.healing = b.healing;
        this.attackBuff = b.attackBuff;
        this.defenseBuff = b.defenseBuff;
        this.healthBuff = b.healthBuff;
        this.speedBuff = b.speedBuff;
        this.appliesStatus = b.appliesStatus;
        this.isPassive = b.isPassive;
        this.requiredElement = b.requiredElement;
        this.requiredEnergy = b.requiredEnergy;
        this.requiredReaction = b.requiredReaction;
    }

    public static Builder builder(String description) {
        return new Builder(description);
    }

    // Getters
    public String getDescription() { return description; }
    public TargetType getTargetType() { return targetType; }
    public Row getTargetRow() { return targetRow; }
    public int getTargetCount() { return targetCount; }
    public int getDamage() { return damage; }
    public int getHealing() { return healing; }
    public int getAttackBuff() { return attackBuff; }
    public int getDefenseBuff() { return defenseBuff; }
    public int getHealthBuff() { return healthBuff; }
    public int getSpeedBuff() { return speedBuff; }
    public StatusEffect getAppliesStatus() { return appliesStatus; }
    public boolean isPassive() { return isPassive; }
    public Element getRequiredElement() { return requiredElement; }
    public int getRequiredEnergy() { return requiredEnergy; }
    public Reaction getRequiredReaction() { return requiredReaction; }

    public static class Builder {
        private String description;
        private TargetType targetType = TargetType.SINGLE_ENEMY;
        private Row targetRow;
        private int targetCount = 1;
        private int damage;
        private int healing;
        private int attackBuff;
        private int defenseBuff;
        private int healthBuff;
        private int speedBuff;
        private StatusEffect appliesStatus;
        private boolean isPassive;
        private Element requiredElement;
        private int requiredEnergy;
        private Reaction requiredReaction;

        Builder(String description) { this.description = description; }

        public Builder targetType(TargetType t) { this.targetType = t; return this; }
        public Builder targetRow(Row r) { this.targetRow = r; return this; }
        public Builder targetCount(int c) { this.targetCount = c; return this; }
        public Builder damage(int d) { this.damage = d; return this; }
        public Builder healing(int h) { this.healing = h; return this; }
        public Builder attackBuff(int a) { this.attackBuff = a; return this; }
        public Builder defenseBuff(int d) { this.defenseBuff = d; return this; }
        public Builder healthBuff(int h) { this.healthBuff = h; return this; }
        public Builder speedBuff(int s) { this.speedBuff = s; return this; }
        public Builder appliesStatus(StatusEffect s) { this.appliesStatus = s; return this; }
        public Builder passive(boolean p) { this.isPassive = p; return this; }
        public Builder requiredElement(Element e) { this.requiredElement = e; return this; }
        public Builder requiredEnergy(int e) { this.requiredEnergy = e; return this; }
        public Builder requiredReaction(Reaction r) { this.requiredReaction = r; return this; }

        public Effect build() { return new Effect(this); }
    }
}
