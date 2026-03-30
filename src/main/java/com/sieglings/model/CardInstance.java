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
    private int currentAttack;
    private int currentDefense;
    private int currentSpeed;
    private Set<StatusEffect> statusEffects = new HashSet<>();
    private int boardRow;
    private int boardCol;
    private int placementOrder;
    private boolean owner; // true = player, false = enemy

    public CardInstance() {}

    public CardInstance(SieglingCard card, int row, int col, boolean owner) {
        this.instanceId = UUID.randomUUID().toString().substring(0, 8);
        this.card = card;
        this.currentHealth = card.getHealth();
        this.currentAttack = card.getAttack();
        this.currentDefense = card.getDefense();
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

    public int getEffectiveAttack() {
        int atk = currentAttack;
        if (statusEffects.contains(StatusEffect.ATK_BOOST)) atk += 1;
        return atk;
    }

    public int getEffectiveDefense() {
        int def = currentDefense;
        if (statusEffects.contains(StatusEffect.DEF_BOOST)) def += 1;
        return def;
    }

    public void takeDamage(int amount) {
        int effectiveDmg = Math.max(0, amount - getEffectiveDefense());
        currentHealth = Math.max(0, currentHealth - effectiveDmg);
    }

    public void takeRawDamage(int amount) {
        currentHealth = Math.max(0, currentHealth - amount);
    }

    public void healDamage(int amount) {
        currentHealth = Math.min(card.getHealth(), currentHealth + amount);
    }

    public void clearTemporaryEffects() {
        statusEffects.remove(StatusEffect.DEF_BOOST);
        statusEffects.remove(StatusEffect.ATK_BOOST);
    }

    // Getters and setters
    public String getInstanceId() { return instanceId; }
    public SieglingCard getCard() { return card; }
    public int getCurrentHealth() { return currentHealth; }
    public void setCurrentHealth(int currentHealth) { this.currentHealth = currentHealth; }
    public int getCurrentAttack() { return currentAttack; }
    public void setCurrentAttack(int currentAttack) { this.currentAttack = currentAttack; }
    public int getCurrentDefense() { return currentDefense; }
    public void setCurrentDefense(int currentDefense) { this.currentDefense = currentDefense; }
    public int getCurrentSpeed() { return currentSpeed; }
    public void setCurrentSpeed(int currentSpeed) { this.currentSpeed = currentSpeed; }
    public Set<StatusEffect> getStatusEffects() { return statusEffects; }
    public int getBoardRow() { return boardRow; }
    public void setBoardRow(int boardRow) { this.boardRow = boardRow; }
    public int getBoardCol() { return boardCol; }
    public void setBoardCol(int boardCol) { this.boardCol = boardCol; }
    public int getPlacementOrder() { return placementOrder; }
    public void setPlacementOrder(int placementOrder) { this.placementOrder = placementOrder; }
    public boolean isOwner() { return owner; }
    public Element getElement() { return card.getElement(); }
    public String getName() { return card.getName(); }
    public List<Notch> getNotches() { return card.getNotches(); }
}
