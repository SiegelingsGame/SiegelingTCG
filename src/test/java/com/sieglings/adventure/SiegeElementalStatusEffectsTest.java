package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Siege elemental status riders — each element from
 * {@link SiegeContentService#statusFor} must do something in combat, not only
 * paint a chip. Every status does the same thing to a Siegeling and to a foe,
 * so the symmetric tests below check both sides.
 */
class SiegeElementalStatusEffectsTest {

    private final SiegeCombatEngine engine = new SiegeCombatEngine();

    private static final class Fixture {
        SiegeBattle battle;
        Combatant ally;
        Combatant foe;
    }

    private Fixture fixture() {
        Fixture f = new Fixture();
        f.battle = new SiegeBattle(NodeType.BATTLE);
        f.battle.setRoundNumber(1);
        f.battle.setPhase(BattlePhase.PLAYER_INPUT);
        f.battle.setActionPoints(5);
        f.ally = new Combatant("ally-1", "Cacty", Element.EARTH, Side.PLAYER, 60, 10, null);
        f.ally.setPosition(0);
        f.foe = new Combatant("foe-1", "Cinder Husk", Element.FIRE, Side.ENEMY, 40, 7, null);
        f.battle.getCombatants().add(f.ally);
        f.battle.getCombatants().add(f.foe);
        return f;
    }

    private void apply(SiegeBattle battle, Combatant attacker, AbilitySpec spec, List<Combatant> targets) {
        try {
            Method m = SiegeCombatEngine.class.getDeclaredMethod("applyEffect",
                    SiegeBattle.class, Combatant.class, AbilitySpec.class, List.class, Random.class);
            m.setAccessible(true);
            m.invoke(engine, battle, attacker, spec, targets, new Random(7));
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private void applyStatus(SiegeBattle battle, Combatant target, StatusKind status,
                             Combatant inflicter, Random rng) {
        try {
            Method m = SiegeCombatEngine.class.getDeclaredMethod("applyStatus",
                    SiegeBattle.class, Combatant.class, StatusKind.class, Combatant.class, Random.class);
            m.setAccessible(true);
            m.invoke(engine, battle, target, status, inflicter, rng);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private void tickWither(SiegeBattle battle, Combatant c) {
        try {
            Method m = SiegeCombatEngine.class.getDeclaredMethod("tickWither",
                    SiegeBattle.class, Combatant.class);
            m.setAccessible(true);
            m.invoke(engine, battle, c);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void soakAddsOneIncomingDamage() {
        Fixture f = fixture();
        f.foe.applyStatus(StatusKind.SOAK, 2);
        AbilitySpec hit = new AbilitySpec("hit", "Strike", Element.EARTH, Effect.DAMAGE, 5,
                TargetKind.ENEMY_SINGLE, 1, "Hit.");
        int hpBefore = f.foe.getHp();
        apply(f.battle, f.ally, hit, List.of(f.foe));
        assertEquals(hpBefore - 6, f.foe.getHp(), "Soak should add +1 to the attack");
    }

    @Test
    void blindReducesOutgoingDamage() {
        Fixture f = fixture();
        f.ally.applyStatus(StatusKind.BLIND, 2);
        AbilitySpec hit = new AbilitySpec("hit", "Strike", Element.EARTH, Effect.DAMAGE, 5,
                TargetKind.ENEMY_SINGLE, 1, "Hit.");
        int hpBefore = f.foe.getHp();
        apply(f.battle, f.ally, hit, List.of(f.foe));
        assertEquals(hpBefore - 4, f.foe.getHp());
    }

    @Test
    void blindAlsoReducesAttackAndSpeedBuffValues() {
        Fixture f = fixture();
        f.ally.applyStatus(StatusKind.BLIND, 2);
        AbilitySpec attack = new AbilitySpec("warcry", "Warcry", Element.LIGHT, Effect.BUFF_ATK, 3,
                TargetKind.SELF, 1, "Buff.");
        AbilitySpec speed = new AbilitySpec("haste", "Haste", Element.LIGHT, Effect.BUFF_SPD, 3,
                TargetKind.SELF, 1, "Buff.");
        apply(f.battle, f.ally, attack, List.of(f.ally));
        apply(f.battle, f.ally, speed, List.of(f.ally));
        assertEquals(2, f.ally.getAttackBuff());
        // Card speed buffs are timed and ride outside the unit's base speed, so the
        // buffed value is the effective one initiative is read from.
        assertEquals(12, f.ally.effectiveSpeed());
    }

    @Test
    void poisonBlocksHealAndClears() {
        Fixture f = fixture();
        f.ally.setHp(40);
        f.ally.applyStatus(StatusKind.POISON, 99);
        AbilitySpec heal = new AbilitySpec("heal", "Mend", Element.WATER, Effect.HEAL, 8,
                TargetKind.ALLY_SINGLE, 1, "Heal.");
        apply(f.battle, f.ally, heal, List.of(f.ally));
        assertEquals(40, f.ally.getHp());
        assertFalse(f.ally.has(StatusKind.POISON));
    }

    // ---- Foe-side meanings: every status must do something to an enemy -----

    private void enemyAct(SiegeBattle battle, Combatant foe, AbilitySpec spec, Random rng) {
        try {
            Method m = SiegeCombatEngine.class.getDeclaredMethod("executeEnemyAbility",
                    SiegeBattle.class, Combatant.class, AbilitySpec.class, int.class, Random.class);
            m.setAccessible(true);
            m.invoke(engine, battle, foe, spec, 0, rng);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private void enemyTurn(SiegeRun run, Random rng) {
        try {
            Method m = SiegeCombatEngine.class.getDeclaredMethod("resolveEnemyTurn", SiegeRun.class, Random.class);
            m.setAccessible(true);
            m.invoke(engine, run, rng);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void slowReapplyFreezesWithStun() {
        Fixture f = fixture();
        applyStatus(f.battle, f.foe, StatusKind.SLOW, f.ally, new Random(1));
        assertTrue(f.foe.has(StatusKind.SLOW));
        assertFalse(f.foe.has(StatusKind.STUN));
        applyStatus(f.battle, f.foe, StatusKind.SLOW, f.ally, new Random(1));
        assertTrue(f.foe.has(StatusKind.SLOW));
        assertTrue(f.foe.has(StatusKind.STUN), "second Slow is a Freeze");
    }

    @Test
    void leechHealsForDamageDealtOnTheTriggeringEarthHit() {
        Fixture f = fixture();
        f.ally.setHp(48);
        AbilitySpec hit = new AbilitySpec("root-bite", "Root Bite", Element.EARTH, Effect.DAMAGE, 5,
                TargetKind.ENEMY_SINGLE, 1, "Hit.", StatusKind.LEECH, 100);

        apply(f.battle, f.ally, hit, List.of(f.foe));
        assertFalse(f.foe.has(StatusKind.LEECH));
        assertEquals(53, f.ally.getHp(), "Leech restores the HP damage from the hit that triggered it");
    }

    // ---- One territory per status, identical on both sides ----------------

    private Object call(String name, Class<?>[] types, Object... args) {
        try {
            Method m = SiegeCombatEngine.class.getDeclaredMethod(name, types);
            m.setAccessible(true);
            return m.invoke(engine, args);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private void afterUnitActs(SiegeBattle battle, Combatant actor) {
        call("afterUnitActs", new Class<?>[]{SiegeBattle.class, Combatant.class}, battle, actor);
    }

    private void rollStatus(SiegeBattle battle, AbilitySpec spec, Combatant target, Combatant inflicter) {
        call("rollStatus", new Class<?>[]{SiegeBattle.class, AbilitySpec.class, Combatant.class, Combatant.class,
                Random.class, int.class}, battle, spec, target, inflicter, new Random(1), 3);
    }

    @SuppressWarnings("unchecked")
    private List<Combatant> disorientRetarget(SiegeBattle battle, Combatant actor, AbilitySpec spec,
                                              List<Combatant> chosen, Random rng) {
        return (List<Combatant>) call("disorientRetarget", new Class<?>[]{SiegeBattle.class, Combatant.class,
                AbilitySpec.class, List.class, Random.class}, battle, actor, spec, chosen, rng);
    }

    private boolean advantageFires(SiegeBattle battle, Combatant unit) {
        return (Boolean) call("advantageFires", new Class<?>[]{SiegeBattle.class, Combatant.class}, battle, unit);
    }

    @Test
    void rustBlocksShieldOnBothSidesAndNoLongerAddsDamage() {
        Fixture f = fixture();
        f.ally.applyStatus(StatusKind.RUST, 2);
        apply(f.battle, f.ally, new AbilitySpec("ward", "Ward", Element.METAL, Effect.SHIELD, 5,
                TargetKind.SELF, 1, "Shield."), List.of(f.ally));
        assertEquals(0, f.ally.getShield(), "a rusted Siegeling cannot gain Shield");

        f.foe.applyStatus(StatusKind.RUST, 2);
        enemyAct(f.battle, f.foe, new AbilitySpec("brace", "Brace", Element.FIRE, Effect.SHIELD, 6,
                TargetKind.SELF, 0, "Shield."), new Random(1));
        assertEquals(0, f.foe.getShield(), "a rusted foe cannot gain Shield");

        int hpBefore = f.foe.getHp();
        apply(f.battle, f.ally, new AbilitySpec("metal", "Cleaver", Element.METAL, Effect.DAMAGE, 4,
                TargetKind.ENEMY_SINGLE, 1, "Metal hit."), List.of(f.foe));
        assertEquals(hpBefore - 4, f.foe.getHp(), "Rust no longer adds damage — that is Soak's territory");
    }

    @Test
    void shockBacklashesOnBothSidesWhenTheyAct() {
        Fixture f = fixture();
        f.ally.applyStatus(StatusKind.SHOCK, 2);
        f.foe.applyStatus(StatusKind.SHOCK, 2);
        int allyHp = f.ally.getHp(), foeHp = f.foe.getHp();
        afterUnitActs(f.battle, f.ally);
        afterUnitActs(f.battle, f.foe);
        assertEquals(allyHp - SiegeCombatEngine.SHOCK_BACKLASH, f.ally.getHp());
        assertEquals(foeHp - SiegeCombatEngine.SHOCK_BACKLASH, f.foe.getHp());
        assertFalse(f.ally.has(StatusKind.SHOCK));
        assertFalse(f.foe.has(StatusKind.SHOCK));
        assertEquals(5, f.battle.getActionPoints(), "Shock no longer drains AP");
    }

    @Test
    void shockNoLongerWeakensAFoesAction() {
        Fixture f = fixture();
        f.foe.setHp(20);
        f.foe.applyStatus(StatusKind.SHOCK, 2);
        enemyAct(f.battle, f.foe, new AbilitySpec("mend", "Mend", Element.FIRE, Effect.HEAL, 6,
                TargetKind.SELF, 0, "Heal."), new Random(1));
        assertEquals(26, f.foe.getHp(), "output is Blind's territory, not Shock's");
    }

    @Test
    void disorientScattersSingleTargetActionsOnBothSides() {
        AbilitySpec hit = new AbilitySpec("hit", "Strike", Element.WIND, Effect.DAMAGE, 5,
                TargetKind.ENEMY_SINGLE, 1, "Hit.");
        java.util.Set<String> allyHits = new java.util.HashSet<>();
        java.util.Set<String> foeHits = new java.util.HashSet<>();
        for (int seed = 0; seed < 30; seed++) {
            Fixture f = fixture();
            Combatant foe2 = new Combatant("foe-2", "Ember Imp", Element.FIRE, Side.ENEMY, 40, 5, null);
            Combatant ally2 = new Combatant("ally-2", "Sleaf", Element.EARTH, Side.PLAYER, 60, 5, null);
            ally2.setPosition(1);
            f.battle.getCombatants().add(foe2);
            f.battle.getCombatants().add(ally2);

            f.ally.applyStatus(StatusKind.DISORIENT, 2);
            List<Combatant> landed = disorientRetarget(f.battle, f.ally, hit, List.of(f.foe),
                    new Random(seed * 1_000_003L + 17));
            allyHits.add(landed.get(0).getId());
            assertFalse(f.ally.has(StatusKind.DISORIENT), "spent on the Siegeling's next single-target action");

            f.foe.getAbilities().add(hit);
            f.foe.setIntent(hit);
            f.foe.setIntentPosition(0);
            f.foe.applyStatus(StatusKind.DISORIENT, 2);
            SiegeRun run = new SiegeRun("t");
            run.setBattle(f.battle);
            f.battle.setPhase(BattlePhase.ENEMY_RESOLVING);
            enemyTurn(run, new Random(seed * 1_000_003L + 17));
            if (f.ally.getHp() < f.ally.getMaxHp()) foeHits.add(f.ally.getId());
            if (ally2.getHp() < ally2.getMaxHp()) foeHits.add(ally2.getId());
            assertFalse(f.foe.has(StatusKind.DISORIENT), "spent on the foe's next single-target action");
        }
        assertEquals(2, allyHits.size(), "a disoriented Siegeling's strike can land on either foe");
        assertEquals(2, foeHits.size(), "a disoriented foe's strike can land on either Siegeling");
        Fixture f = fixture();
        f.ally.applyStatus(StatusKind.DISORIENT, 2);
        assertEquals(1, engine.effectiveCost(f.battle, hit, f.ally), "Disorient no longer touches AP cost");
    }

    @Test
    void curseSuppressesAdvantageOnBothSides() {
        Fixture f = fixture();
        f.battle.getAdvantageOrder().add(f.ally.getId());
        f.battle.getAdvantageOrder().add(f.foe.getId());
        f.battle.setAdvantageIndex(0);
        assertTrue(advantageFires(f.battle, f.ally));
        f.ally.applyStatus(StatusKind.CURSE, 2);
        assertFalse(advantageFires(f.battle, f.ally), "a cursed Siegeling's Advantage fizzles");
        f.battle.setAdvantageIndex(1);
        assertTrue(advantageFires(f.battle, f.foe));
        f.foe.applyStatus(StatusKind.CURSE, 2);
        assertFalse(advantageFires(f.battle, f.foe), "a cursed foe's Advantage fizzles");
    }

    @Test
    void curseNoLongerBlocksAFoesRecovery() {
        Fixture f = fixture();
        f.foe.setHp(20);
        f.foe.applyStatus(StatusKind.CURSE, 2);
        enemyAct(f.battle, f.foe, new AbilitySpec("mend", "Mend", Element.FIRE, Effect.HEAL, 6,
                TargetKind.SELF, 0, "Heal."), new Random(1));
        assertEquals(26, f.foe.getHp(), "healing is Poison's territory, not Curse's");
    }

    @Test
    void insightStopsTheNextActionInflictingStatusesOnBothSides() {
        Fixture f = fixture();
        AbilitySpec burnAlly = new AbilitySpec("b", "Ember", Element.FIRE, Effect.DAMAGE, 3,
                TargetKind.ENEMY_SINGLE, 1, "", StatusKind.BURN, 100);
        f.ally.applyStatus(StatusKind.INSIGHT, 2);
        rollStatus(f.battle, burnAlly, f.foe, f.ally);
        assertFalse(f.foe.has(StatusKind.BURN), "an insighted Siegeling inflicts no status");
        f.foe.applyStatus(StatusKind.INSIGHT, 2);
        rollStatus(f.battle, burnAlly, f.ally, f.foe);
        assertFalse(f.ally.has(StatusKind.BURN), "an insighted foe inflicts no status");

        afterUnitActs(f.battle, f.ally);
        afterUnitActs(f.battle, f.foe);
        assertFalse(f.ally.has(StatusKind.INSIGHT));
        assertFalse(f.foe.has(StatusKind.INSIGHT));
        rollStatus(f.battle, burnAlly, f.foe, f.ally);
        assertTrue(f.foe.has(StatusKind.BURN), "once the action passes, statuses land again");
    }

    @Test
    void witherShrinksMaxHpOnBothSides() {
        Fixture f = fixture();
        int allyMax = f.ally.getMaxHp(), foeMax = f.foe.getMaxHp();
        f.ally.applyStatus(StatusKind.WITHER, 2);
        f.foe.applyStatus(StatusKind.WITHER, 2);
        tickWither(f.battle, f.ally);
        tickWither(f.battle, f.foe);
        assertEquals(allyMax - SiegeCombatEngine.WITHER_MAX_HP, f.ally.getMaxHp());
        assertEquals(foeMax - SiegeCombatEngine.WITHER_MAX_HP, f.foe.getMaxHp());
        assertEquals(f.ally.getMaxHp(), f.ally.getHp(), "current HP clamps to the shrunken max");
        assertFalse(f.ally.has(StatusKind.WITHER));
        assertFalse(f.foe.has(StatusKind.WITHER));
    }
}
