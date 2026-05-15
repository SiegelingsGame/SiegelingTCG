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
    private int trainerPassiveHealthBuff;
    private int trainerPassiveDamageBuff;
    private int trainerPassiveSpeedBuff;
    /** Passive team-aura attack damage from allied Sieglings on the board (recomputed when the board changes). */
    private int auraDamageBoost;
    private Set<StatusEffect> statusEffects = new HashSet<>();
    private int boardRow;
    private int boardCol;
    private int placementOrder;
    private int battlePhasesSeen;
    private boolean owner; // true = player, false = enemy

    public CardInstance() {}

    public CardInstance(SieglingCard card, int row, int col, boolean owner) {
        // IDs must be globally unique: instanceId is used as a stable identity in battle queues,
        // connected-network traversal, and UI diffing. Shortened UUIDs can collide and cause
        // unrelated Sieglings to "disappear" when one is defeated.
        this.instanceId = UUID.randomUUID().toString();
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
        return Math.max(0, currentSpeed + trainerPassiveSpeedBuff);
    }

    public int getEffectiveMaxHealth() {
        int maxHealth = card.getHealth() + temporaryHealthBuff + trainerPassiveHealthBuff;
        if (temporaryHealthBuff == 0 && trainerPassiveHealthBuff == 0 && statusEffects.contains(StatusEffect.HEALTH_BOOST)) maxHealth += 1;
        return maxHealth;
    }

    public int getDamageBoost() {
        int damageBoost = temporaryDamageBuff + trainerPassiveDamageBuff + auraDamageBoost;
        if (temporaryDamageBuff == 0 && trainerPassiveDamageBuff == 0 && auraDamageBoost == 0 && statusEffects.contains(StatusEffect.DAMAGE_BOOST)) {
            damageBoost += 1;
        }
        return damageBoost;
    }

    public int getAuraDamageBoost() {
        return auraDamageBoost;
    }

    public void setAuraDamageBoost(int auraDamageBoost) {
        this.auraDamageBoost = Math.max(0, auraDamageBoost);
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

    public void setTrainerPassiveHealthBuff(int amount) {
        int next = Math.max(0, amount);
        int delta = next - trainerPassiveHealthBuff;
        trainerPassiveHealthBuff = next;
        if (delta > 0) {
            currentHealth += delta;
        }
        currentHealth = Math.min(currentHealth, getEffectiveMaxHealth());
        if (trainerPassiveHealthBuff > 0) {
            statusEffects.add(StatusEffect.HEALTH_BOOST);
        } else if (temporaryHealthBuff == 0) {
            statusEffects.remove(StatusEffect.HEALTH_BOOST);
        }
    }

    public void setTrainerPassiveDamageBuff(int amount) {
        trainerPassiveDamageBuff = Math.max(0, amount);
        if (trainerPassiveDamageBuff > 0) {
            statusEffects.add(StatusEffect.DAMAGE_BOOST);
        } else if (temporaryDamageBuff == 0 && auraDamageBoost == 0) {
            statusEffects.remove(StatusEffect.DAMAGE_BOOST);
        }
    }

    public void setTrainerPassiveSpeedBuff(int amount) {
        trainerPassiveSpeedBuff = Math.max(0, amount);
        if (trainerPassiveSpeedBuff > 0) {
            statusEffects.add(StatusEffect.SPEED_BOOST);
        } else {
            statusEffects.remove(StatusEffect.SPEED_BOOST);
        }
    }

    public void clearTrainerPassiveEffects() {
        setTrainerPassiveHealthBuff(0);
        setTrainerPassiveDamageBuff(0);
        setTrainerPassiveSpeedBuff(0);
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
        if (trainerPassiveHealthBuff == 0) {
            statusEffects.remove(StatusEffect.HEALTH_BOOST);
        }
        if (trainerPassiveDamageBuff == 0 && auraDamageBoost == 0) {
            statusEffects.remove(StatusEffect.DAMAGE_BOOST);
        }
        currentHealth = Math.min(currentHealth, getEffectiveMaxHealth());
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
    public void setCurrentSpeed(int currentSpeed) { this.currentSpeed = Math.max(0, currentSpeed); }
    public int getTemporaryHealthBuff() { return temporaryHealthBuff; }
    public int getTemporaryDamageBuff() { return temporaryDamageBuff; }
    public int getTrainerPassiveHealthBuff() { return trainerPassiveHealthBuff; }
    public int getTrainerPassiveDamageBuff() { return trainerPassiveDamageBuff; }
    public int getTrainerPassiveSpeedBuff() { return trainerPassiveSpeedBuff; }
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
