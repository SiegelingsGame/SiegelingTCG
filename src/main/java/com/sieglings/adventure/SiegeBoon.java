package com.sieglings.adventure;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Run-wide Battlegrounds boons (the "amps/boons" analog): at run start the player
 * picks 1 of 3 offered boons; higher tiers (III+) grant a second pick after the
 * first boss. A boon amplifies the whole squad for the rest of the run and is only
 * ever active in a {@link RunMode#BATTLEGROUNDS} run.
 *
 * <p>Pure catalog + magnitudes so effects stay balanced from one file. Each boon's
 * effect is applied in the combat/AP code — see:
 * <ul>
 *   <li>{@link #FIRST_ROUND_AP} — {@code SiegeCombatEngine.openPlayerTurn} (round 1 AP)</li>
 *   <li>{@link #BOSS_AP_DISCOUNT} — {@code SiegeCombatEngine.effectiveCost} (boss battles)</li>
 *   <li>{@link #BATTLE_REVIVE} — {@code SiegeCombatEngine.strikeAlly} (first fall per battle)</li>
 * </ul>
 */
enum SiegeBoon {
    FIRST_ROUND_AP("first-round-ap", "Vanguard Rush", "⚡",
            "+2 AP on the first round of every battle."),
    BOSS_AP_DISCOUNT("boss-ap-discount", "Siegebreaker", "🛡️",
            "Moves cost 1 less AP during boss battles (min 0)."),
    BATTLE_REVIVE("battle-revive", "Second Wind", "❤️",
            "Revive the first fallen ally once per battle at 30% HP.");

    /** Extra AP granted on the first round of each battle by FIRST_ROUND_AP. */
    static final int FIRST_ROUND_AP_BONUS = 2;
    /** AP shaved off each move's cost during boss battles by BOSS_AP_DISCOUNT. */
    static final int BOSS_AP_DISCOUNT_AMOUNT = 1;
    /** Percentage of max HP a revived ally returns at (BATTLE_REVIVE). */
    static final int REVIVE_HP_PERCENT = 30;
    /** How many boons the server offers per pick. */
    static final int OFFER_SIZE = 3;

    private final String id;
    private final String name;
    private final String icon;
    private final String description;

    SiegeBoon(String id, String name, String icon, String description) {
        this.id = id;
        this.name = name;
        this.icon = icon;
        this.description = description;
    }

    String id() { return id; }
    String displayName() { return name; }
    String icon() { return icon; }
    String description() { return description; }

    /** The boon with this id, or {@code null} when unknown. */
    static SiegeBoon byId(String id) {
        if (id == null) return null;
        for (SiegeBoon b : values()) {
            if (b.id.equals(id)) return b;
        }
        return null;
    }

    /**
     * A fresh random offer of up to {@link #OFFER_SIZE} distinct boons, excluding any
     * the player has already taken. With the base three-boon catalog the first offer
     * is simply all three shuffled.
     */
    static List<SiegeBoon> offer(List<String> alreadyChosen, Random rng) {
        List<SiegeBoon> pool = new ArrayList<>();
        for (SiegeBoon b : values()) {
            if (alreadyChosen == null || !alreadyChosen.contains(b.id)) pool.add(b);
        }
        Collections.shuffle(pool, rng);
        return pool.size() > OFFER_SIZE ? new ArrayList<>(pool.subList(0, OFFER_SIZE)) : pool;
    }

    /** Serializes a boon for the client (id/name/icon/desc). */
    Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("name", name);
        m.put("icon", icon);
        m.put("desc", description);
        return m;
    }
}
