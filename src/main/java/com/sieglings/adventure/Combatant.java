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
    /**
     * Round at which {@link #shield} lapses. Shields are temporary on the board
     * (the battle phase clears them) and temporary here: whatever is left when
     * this unit's side opens the round is gone.
     */
    private int shieldExpiryRound;
    private int speed;                // base speed before status modifiers
    private int baseSpeed;
    /**
     * Battle-long flat damage bonus: the Knight's ATTACK leadership passive and
     * carried ATTACK items, which are loadout rather than plays. Card-granted
     * buffs go into {@link #timedBuffs} so they lapse.
     */
    private int attackBuff;
    /**
     * Buffs granted by played abilities, each with the round it lapses on. Kept
     * as a list rather than one running total because durations differ per card
     * and each grant has to expire on its own clock.
     */
    private final List<TimedBuff> timedBuffs = new ArrayList<>();
    /**
     * Battle-scoped max-HP gain from {@code health_boost} cards. Kept apart from
     * {@link #baseMaxHp} (which is run-permanent) so {@link #applyLevel()} can stay
     * derived-from-base, and so the boost is dropped when the battle ends.
     */
    private int battleMaxHpBonus;

    // ---- Leveling (in-run progression; see SiegeTuning) -------------------
    private int level = 1;            // 1..SiegeTuning.MAX_LEVEL
    private int xp;                   // cumulative XP earned this run
    /**
     * Pre-level "base" max HP: the value all level scaling is derived FROM.
     * Permanent additive bonuses (knight HEALTH passive, VITALITY items, cache
     * growth elixirs) fold into this base via {@link #addBaseMaxHp(int)}, so
     * {@link #applyLevel()} can always recompute {@link #maxHp} from a single
     * base and never compound across repeated calls.
     */
    private int baseMaxHp;
    /** Set when a level-up happened since the last battle start (drives the "LEVEL UP!" UI). */
    private boolean leveledRecently;
    private int position = -1;        // notch index for player Siegelings; -1 for others
    private String sourceCardId;      // catalog card this unit was built from (evolution lookups)
    /**
     * Enemy-only: the catalog Siegeling this foe is a corrupted copy of. {@link #name}
     * already reads "Shade of X"; this carries the bare X so the battlefield plate can
     * show a compact SHADE badge plus the creature's own name — at phone sizes the
     * prefix alone eats the plate and every foe truncates to "Shade of Shell…".
     */
    private String shadeOf;
    /**
     * Card the sprite art was drawn from, when that card is NOT {@link #sourceCardId}.
     * Appearance only — it drives the evolution-stage sprite scale and nothing else.
     * Shades and mercs are built from a real catalog Siegeling but deliberately carry
     * no sourceCardId (foes have no evolution chain; mercs must not be offered
     * evolution cards), and without this a shade of a stage-3 Siegeling renders at
     * stage-1 size — a Siegelord boss the same height as the sapling it ate.
     */
    private String artCardId;
    /** Battle-scoped: the form this unit evolved from (evolution reverts after battle). */
    private Combatant evolvedFrom;
    /** Battle-scoped evolution gauge: AP spent on this unit's own moves. */
    private int apSpent;

    /** Equipped item id (one carried item per Siegeling), or null. */
    private String itemId;

    /** Active elemental statuses → rounds remaining (BURN uses a battle-long duration). */
    private final Map<StatusKind, Integer> statuses = new EnumMap<>(StatusKind.class);

    /**
     * Enemy-only: this unit is the boss/elite the rest of the squad escorts. Every
     * encounter fields 2–3 foes, so the client needs this to tell the headline foe
     * apart from its minions.
     */
    private boolean leader;

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
        this.baseMaxHp = this.maxHp;
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
    int getShieldExpiryRound() { return shieldExpiryRound; }
    void setShieldExpiryRound(int round) { this.shieldExpiryRound = Math.max(0, round); }

    /**
     * Grants shield that lapses when this unit's side opens round
     * {@code expiryRound}. A later grant never shortens an existing shield.
     */
    void addShield(int amount, int expiryRound) {
        if (amount <= 0) return;
        this.shield = Math.max(0, this.shield + amount);
        this.shieldExpiryRound = Math.max(this.shieldExpiryRound, Math.max(0, expiryRound));
    }
    int getSpeed() { return speed; }
    void setSpeed(int speed) { this.speed = Math.max(0, speed); }
    int getBaseSpeed() { return baseSpeed; }
    void setBaseSpeed(int baseSpeed) { this.baseSpeed = Math.max(1, baseSpeed); }
    /** Total attack bonus in play: the battle-long loadout bonus plus every live timed buff. */
    int getAttackBuff() { return Math.max(0, attackBuff + timedBonus(BuffStat.ATTACK)); }
    /** The battle-long part alone — what a fresh battle resets and what evolution carries over. */
    int getBaseAttackBuff() { return attackBuff; }
    void addAttackBuff(int amount) { this.attackBuff = Math.max(0, this.attackBuff + amount); }
    int getPosition() { return position; }
    void setPosition(int position) { this.position = position; }
    String getSourceCardId() { return sourceCardId; }
    void setSourceCardId(String sourceCardId) { this.sourceCardId = sourceCardId; }
    String getShadeOf() { return shadeOf; }
    void setShadeOf(String shadeOf) { this.shadeOf = shadeOf; }
    String getArtCardId() { return artCardId; }
    void setArtCardId(String artCardId) { this.artCardId = artCardId; }
    /** The card this unit's silhouette should be sized from: its own card, else the art's. */
    String getDisplayCardId() { return sourceCardId != null ? sourceCardId : artCardId; }
    boolean isLeader() { return leader; }
    void setLeader(boolean leader) { this.leader = leader; }
    String getItemId() { return itemId; }
    void setItemId(String itemId) { this.itemId = itemId; }
    Combatant getEvolvedFrom() { return evolvedFrom; }
    void setEvolvedFrom(Combatant evolvedFrom) { this.evolvedFrom = evolvedFrom; }
    int getApSpent() { return apSpent; }
    void setApSpent(int apSpent) { this.apSpent = Math.max(0, apSpent); }
    void addApSpent(int amount) { setApSpent(apSpent + amount); }

    // ---- Leveling ---------------------------------------------------------

    int getLevel() { return level; }
    int getXp() { return xp; }
    int getBaseMaxHp() { return baseMaxHp; }
    void setBaseMaxHp(int baseMaxHp) { this.baseMaxHp = Math.max(1, baseMaxHp); }
    boolean isLeveledRecently() { return leveledRecently; }
    void setLeveledRecently(boolean leveledRecently) { this.leveledRecently = leveledRecently; }

    /** Speed a fresh battle resets this unit to: its persistent base plus level milestones. */
    int leveledBaseSpeed() {
        return Math.max(0, baseSpeed + (knight ? 0 : SiegeTuning.speedBonus(level)));
    }

    /**
     * Grants XP and levels up as thresholds are crossed. Returns the number of
     * levels gained (0 if none). Derived stats are recomputed from base via
     * {@link #applyLevel()} on every level-up, and the gained max HP is healed.
     *
     * <p>A level-up also pays {@link SiegeTuning#LEVELUP_BONUS_HP} of flat base
     * max HP per level and restores the unit to full — the reward for surviving
     * the fight, and the reason a level-up is worth pushing one more node for.
     */
    int addXp(int amount) {
        if (amount <= 0) return 0;
        int before = level;
        xp = Math.max(0, xp + amount);
        int now = SiegeTuning.levelForXp(xp);
        if (now != level) {
            level = now;
            applyLevel();
        }
        int gained = level - before;
        if (gained > 0) {
            leveledRecently = true;
            // The HP itself came from applyLevel() above — SiegeTuning.scaledMaxHp
            // carries the flat per-level bonus so every route to a level agrees.
            // What a live level-up adds is the full heal.
            healToFull();
        }
        return gained;
    }

    /** Restores this unit to its (possibly just-raised) max HP. */
    void healToFull() {
        if (hp <= 0) return; // a fallen unit is revived by its own effects, not by XP
        hp = maxHp;
    }

    /**
     * Restores leveling from a checkpoint: XP is the source of truth, the level
     * is re-derived from it, and derived stats are recomputed from base. Safe to
     * call after {@link #setBaseMaxHp(int)} — it never compounds.
     */
    void loadLeveling(int xp) {
        this.xp = Math.max(0, xp);
        this.level = SiegeTuning.levelForXp(this.xp);
        this.leveledRecently = false;
        applyLevel();
    }

    /**
     * Copies leveling identity (level + XP) from another unit WITHOUT recomputing
     * max HP. Used by battle-scoped evolution, whose max HP is derived separately
     * from the evolved form's stats; the level is still needed for move scaling.
     */
    void copyLevelingFrom(Combatant src) {
        if (src == null) return;
        this.level = src.getLevel();
        this.xp = src.getXp();
    }

    /**
     * Permanently adjusts the pre-level base max HP (positive to add, negative
     * to remove) and recomputes the leveled {@link #maxHp}, healing any gain.
     * Used for run rewards/items that raise max HP for the whole run.
     */
    void addBaseMaxHp(int delta) {
        setBaseMaxHp(baseMaxHp + delta);
        applyLevel();
    }

    int getBattleMaxHpBonus() { return battleMaxHpBonus; }

    /**
     * Battle-table {@code health_boost}: raises max HP and heals the same amount.
     * {@link #applyLevel()} does the healing, since the boost widens the derived max.
     */
    void addBattleMaxHp(int amount) {
        if (amount <= 0) return;
        battleMaxHpBonus += amount;
        applyLevel();
    }

    /** Drops any {@code health_boost} gain; the boost only ever lasts one battle. */
    void setBattleMaxHpBonus(int amount) {
        int next = Math.max(0, amount);
        if (next == battleMaxHpBonus) return;
        battleMaxHpBonus = next;
        applyLevel();
    }

    /**
     * Recomputes {@link #maxHp} (and the resting {@link #speed}) from the base
     * stats and the current level. Idempotent: always derived from base, never
     * compounded. Any increase in max HP is healed onto current HP; a decrease
     * clamps HP down.
     */
    void applyLevel() {
        int oldMax = maxHp;
        maxHp = Math.max(1, (knight
                ? SiegeTuning.scaledKnightMaxHp(baseMaxHp, level)
                : SiegeTuning.scaledMaxHp(baseMaxHp, level)) + battleMaxHpBonus);
        int delta = maxHp - oldMax;
        if (delta > 0) hp = Math.min(maxHp, hp + delta);
        else if (hp > maxHp) hp = maxHp;
        // Outside battle, surface the leveled resting speed; battles reset to it too.
        this.speed = leveledBaseSpeed();
    }

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

    /** Speed after timed buffs and status modifiers (Slow: −2). Only living, unstunned units contribute. */
    int effectiveSpeed() {
        int s = speed + timedBonus(BuffStat.SPEED);
        if (has(StatusKind.SLOW)) s -= 2;
        return Math.max(0, s);
    }

    // ---- Timed buffs ------------------------------------------------------

    /** Which stat a {@link TimedBuff} raises. */
    enum BuffStat { ATTACK, SPEED }

    /**
     * One buff grant: {@code amount} on {@code stat} until this unit's side opens
     * round {@code expiryRound}. Measured the same way as {@link #shieldExpiryRound}
     * so "for 2 rounds" means the same thing for a shield and for an attack buff.
     */
    record TimedBuff(BuffStat stat, int amount, int expiryRound, String sourceId) {}

    List<TimedBuff> getTimedBuffs() { return timedBuffs; }

    /**
     * Grants a buff that lapses after {@code rounds} of this unit's turns.
     * Every grant stacks: playing the same buff card twice is worth twice the
     * bonus, and each copy runs its own clock, so the later copy keeps the
     * unit buffed after the earlier one lapses. {@code sourceId} is kept for
     * checkpoint round-tripping and event attribution, not for de-duplication.
     */
    void addTimedBuff(BuffStat stat, int amount, int rounds, int currentRound, String sourceId) {
        if (amount <= 0 || rounds <= 0) return;
        int expiry = Math.max(1, currentRound) + rounds;
        timedBuffs.add(new TimedBuff(stat, amount, expiry, sourceId));
    }

    /** Restores a buff verbatim from a checkpoint (expiry already absolute). */
    void loadTimedBuff(TimedBuff buff) {
        if (buff != null && buff.amount() > 0) timedBuffs.add(buff);
    }

    int timedBonus(BuffStat stat) {
        int total = 0;
        for (TimedBuff b : timedBuffs) {
            if (b.stat() == stat) total += b.amount();
        }
        return total;
    }

    /** Rounds left on the longest-lived buff of this stat, or 0 if none is running. */
    int buffRoundsLeft(BuffStat stat, int currentRound) {
        int most = 0;
        for (TimedBuff b : timedBuffs) {
            if (b.stat() == stat) most = Math.max(most, b.expiryRound() - currentRound);
        }
        return Math.max(0, most);
    }

    /**
     * Drops every buff that has reached its expiry round. Returns the amount lost
     * per stat so the caller can log and animate the fade.
     */
    Map<BuffStat, Integer> expireBuffs(int currentRound) {
        Map<BuffStat, Integer> lost = new EnumMap<>(BuffStat.class);
        timedBuffs.removeIf(b -> {
            if (currentRound < b.expiryRound()) return false;
            lost.merge(b.stat(), b.amount(), Integer::sum);
            return true;
        });
        return lost;
    }

    void clearTimedBuffs() { timedBuffs.clear(); }

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
