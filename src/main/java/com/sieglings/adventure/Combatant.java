package com.sieglings.adventure;

import com.sieglings.model.enums.Element;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * A living participant in a Siege battle — one of the player's Siegelings, the
 * SiegeKnight, or an enemy creature. Player Siegelings act through the shared
 * hand/action-point economy; enemies act through their own {@link #abilities}.
 *
 * <p>Player Siegelings stand on numbered positions (notches). Enemy attacks
 * are aimed at positions, not units — whoever stands on the targeted notch
 * when the blow lands takes the hit, so swapping positions dodges telegraphs.
 */
class Combatant {
    private final String id;
    private final String name;
    private final Element element;
    private final Side side;
    private final String artUrl;      // optional card art for the client
    private final boolean knight;     // the SiegeKnight: no notch, hit only when exposed

    private int maxHp;
    private int hp;
    private int shield;
    private int speed;                // base speed before status modifiers
    private final int baseSpeed;
    private int attackBuff;           // flat bonus added to this unit's damage
    private int position = -1;        // notch index for player Siegelings; -1 for others
    private String sourceCardId;      // catalog card this unit was built from (evolution lookups)
    /** Battle-scoped: the form this unit evolved from (evolution reverts after battle). */
    private Combatant evolvedFrom;

    /** Active elemental statuses → rounds remaining (BURN uses a battle-long duration). */
    private final Map<StatusKind, Integer> statuses = new EnumMap<>(StatusKind.class);

    /** Enemy-only: 1–3 abilities chosen by simple AI. Empty for player units. */
    private final List<AbilitySpec> abilities = new ArrayList<>();
    /** Enemy-only: the pre-declared next action shown to the player as a telegraph. */
    private AbilitySpec intent;
    /** Enemy-only: the notch the intent is aimed at (-1 = all notches / the knight). */
    private int intentPosition = -1;

    Combatant(String id, String name, Element element, Side side, int maxHp, int speed, String artUrl) {
        this(id, name, element, side, maxHp, speed, artUrl, false);
    }

    Combatant(String id, String name, Element element, Side side, int maxHp, int speed, String artUrl, boolean knight) {
        this.id = id;
        this.name = name;
        this.element = element;
        this.side = side;
        this.maxHp = Math.max(1, maxHp);
        this.hp = this.maxHp;
        this.speed = Math.max(1, speed);
        this.baseSpeed = this.speed;
        this.artUrl = artUrl;
        this.knight = knight;
    }

    String getId() { return id; }
    String getName() { return name; }
    Element getElement() { return element; }
    Side getSide() { return side; }
    String getArtUrl() { return artUrl; }
    boolean isKnight() { return knight; }

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
    int getPosition() { return position; }
    void setPosition(int position) { this.position = position; }
    String getSourceCardId() { return sourceCardId; }
    void setSourceCardId(String sourceCardId) { this.sourceCardId = sourceCardId; }
    Combatant getEvolvedFrom() { return evolvedFrom; }
    void setEvolvedFrom(Combatant evolvedFrom) { this.evolvedFrom = evolvedFrom; }

    List<AbilitySpec> getAbilities() { return abilities; }
    AbilitySpec getIntent() { return intent; }
    void setIntent(AbilitySpec intent) { this.intent = intent; }
    int getIntentPosition() { return intentPosition; }
    void setIntentPosition(int intentPosition) { this.intentPosition = intentPosition; }

    // ---- statuses ---------------------------------------------------------

    Map<StatusKind, Integer> getStatuses() { return statuses; }

    boolean has(StatusKind kind) { return statuses.getOrDefault(kind, 0) > 0; }

    void applyStatus(StatusKind kind, int rounds) {
        statuses.merge(kind, rounds, Math::max);
    }

    void clearStatus(StatusKind kind) { statuses.remove(kind); }

    void clearStatuses() { statuses.clear(); }

    /** Decrements every status by one round, dropping the expired ones. */
    void tickStatuses() {
        statuses.replaceAll((k, v) -> v - 1);
        statuses.values().removeIf(v -> v <= 0);
    }

    /** Speed after status modifiers (Slow: −2). Only living, unstunned units contribute. */
    int effectiveSpeed() {
        int s = speed;
        if (has(StatusKind.SLOW)) s -= 2;
        return Math.max(0, s);
    }

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
