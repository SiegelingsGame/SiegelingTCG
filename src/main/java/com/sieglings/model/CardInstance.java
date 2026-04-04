package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.StatusEffect;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Runtime instance of a Siegling on the board with mutable state.
 */
public class CardInstance {
    private String instanceId;
    private SieglingCard card;
    private int currentHealth;
    private int currentSpeed;
    private int temporaryHealthBuff;
    private int temporaryDamageBuff;
    private Set<StatusEffect> statusEffects = new HashSet<>();
    private int boardRow;
    private int boardCol;
    private int placementOrder;
    private int battlePhasesSeen;
    private boolean owner; // true = player, false = enemy

    public CardInstance() {}

    public CardInstance(SieglingCard card, int row, int col, boolean owner) {
        this.instanceId = UUID.randomUUID().toString().substring(0, 8);
        this.card = card;
        this.currentHealth = card.getHealth();
        this.currentSpeed = card.getSpeed();
        this.boardRow = row;
        this.boardCol = col;
        this.owner = owner;
    }

    public boolean isAlive() {
        return currentHealth > 0;
    }

    public boolean isFrozen() {
        return statusEffects.contains(StatusEffect.FREEZE);
    }

    public boolean isSpeedZero() {
        return statusEffects.contains(StatusEffect.SPEED_ZERO);
    }

    public int getEffectiveSpeed() {
        if (isSpeedZero()) return 0;
        return currentSpeed;
    }

    public int getEffectiveMaxHealth() {
        int maxHealth = card.getHealth() + temporaryHealthBuff;
        if (temporaryHealthBuff == 0 && statusEffects.contains(StatusEffect.HEALTH_BOOST)) maxHealth += 1;
        return maxHealth;
    }

    public int getDamageBoost() {
        int damageBoost = temporaryDamageBuff;
        if (temporaryDamageBuff == 0 && statusEffects.contains(StatusEffect.DAMAGE_BOOST)) damageBoost += 1;
        return damageBoost;
    }

    public void addDamageBuff(int amount) {
        if (amount <= 0) return;
        temporaryDamageBuff += amount;
        statusEffects.add(StatusEffect.DAMAGE_BOOST);
    }

    public void addHealthBuff(int amount) {
        if (amount <= 0) return;
        temporaryHealthBuff += amount;
        currentHealth += amount;
        statusEffects.add(StatusEffect.HEALTH_BOOST);
    }

    public void takeRawDamage(int amount) {
        currentHealth = Math.max(0, currentHealth - amount);
    }

    public void healDamage(int amount) {
        currentHealth = Math.min(getEffectiveMaxHealth(), currentHealth + amount);
    }

    public void clearTemporaryEffects() {
        temporaryDamageBuff = 0;
        temporaryHealthBuff = 0;
        statusEffects.remove(StatusEffect.HEALTH_BOOST);
        statusEffects.remove(StatusEffect.DAMAGE_BOOST);
        currentHealth = Math.min(currentHealth, card.getHealth());
    }

    public void recordBattlePhaseSeen() {
        battlePhasesSeen++;
    }

    // Getters and setters
    public String getInstanceId() { return instanceId; }
    public SieglingCard getCard() { return card; }
    public int getCurrentHealth() { return currentHealth; }
    public void setCurrentHealth(int currentHealth) { this.currentHealth = currentHealth; }
    public int getCurrentSpeed() { return currentSpeed; }
    public void setCurrentSpeed(int currentSpeed) { this.currentSpeed = currentSpeed; }
    public int getTemporaryHealthBuff() { return temporaryHealthBuff; }
    public int getTemporaryDamageBuff() { return temporaryDamageBuff; }
    public Set<StatusEffect> getStatusEffects() { return statusEffects; }
    public int getBoardRow() { return boardRow; }
    public void setBoardRow(int boardRow) { this.boardRow = boardRow; }
    public int getBoardCol() { return boardCol; }
    public void setBoardCol(int boardCol) { this.boardCol = boardCol; }
    public int getPlacementOrder() { return placementOrder; }
    public void setPlacementOrder(int placementOrder) { this.placementOrder = placementOrder; }
    public int getBattlePhasesSeen() { return battlePhasesSeen; }
    public void setBattlePhasesSeen(int battlePhasesSeen) { this.battlePhasesSeen = battlePhasesSeen; }
    public boolean isOwner() { return owner; }
    public Element getElement() { return card.getElement(); }
    public String getName() { return card.getName(); }
    public List<Notch> getNotches() { return card.getNotches(); }
}
