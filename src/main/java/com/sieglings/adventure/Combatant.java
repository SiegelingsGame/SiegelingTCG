package com.sieglings.adventure;

import com.sieglings.model.enums.Element;

import java.util.ArrayList;
import java.util.List;

/**
 * A living participant in a Siege battle — one of the player's Siegelings or an
 * enemy creature. Player Siegelings act through the shared hand/action-point
 * economy; enemies act through their own {@link #abilities}.
 */
class Combatant {
    private final String id;
    private final String name;
    private final Element element;
    private final Side side;
    private final String artUrl;      // optional card art for the client

    private int maxHp;
    private int hp;
    private int shield;
    private int speed;                // effective speed (base + buffs)
    private final int baseSpeed;
    private int attackBuff;           // flat bonus added to this unit's damage
    private double initiative;        // ATB accumulator; unit acts when it crosses the threshold

    /** Enemy-only: 1–3 abilities chosen by simple AI. Empty for player Siegelings. */
    private final List<AbilitySpec> abilities = new ArrayList<>();

    Combatant(String id, String name, Element element, Side side, int maxHp, int speed, String artUrl) {
        this.id = id;
        this.name = name;
        this.element = element;
        this.side = side;
        this.maxHp = Math.max(1, maxHp);
        this.hp = this.maxHp;
        this.speed = Math.max(1, speed);
        this.baseSpeed = this.speed;
        this.artUrl = artUrl;
    }

    String getId() { return id; }
    String getName() { return name; }
    Element getElement() { return element; }
    Side getSide() { return side; }
    String getArtUrl() { return artUrl; }

    int getMaxHp() { return maxHp; }
    void setMaxHp(int maxHp) { this.maxHp = Math.max(1, maxHp); }
    int getHp() { return hp; }
    void setHp(int hp) { this.hp = Math.max(0, Math.min(hp, maxHp)); }
    int getShield() { return shield; }
    void setShield(int shield) { this.shield = Math.max(0, shield); }
    int getSpeed() { return speed; }
    void setSpeed(int speed) { this.speed = Math.max(0, speed); }
    int getBaseSpeed() { return baseSpeed; }
    int getAttackBuff() { return attackBuff; }
    void addAttackBuff(int amount) { this.attackBuff = Math.max(0, this.attackBuff + amount); }
    double getInitiative() { return initiative; }
    void setInitiative(double initiative) { this.initiative = initiative; }
    void addInitiative(double amount) { this.initiative += amount; }

    List<AbilitySpec> getAbilities() { return abilities; }

    boolean isAlive() { return hp > 0; }

    /** Applies raw damage through the shield first, then HP. Returns damage dealt to HP. */
    int takeDamage(int amount) {
        int dmg = Math.max(0, amount);
        if (shield > 0) {
            int absorbed = Math.min(shield, dmg);
            shield -= absorbed;
            dmg -= absorbed;
        }
        setHp(hp - dmg);
        return dmg;
    }

    void heal(int amount) { setHp(hp + Math.max(0, amount)); }
}
