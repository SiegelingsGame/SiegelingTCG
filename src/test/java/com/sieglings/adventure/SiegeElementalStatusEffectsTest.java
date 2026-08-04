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
 * paint a chip.
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
    void rustAmplifiesNextMetalHitThenClears() {
        Fixture f = fixture();
        f.foe.applyStatus(StatusKind.RUST, 2);
        AbilitySpec metal = new AbilitySpec("metal", "Cleaver", Element.METAL, Effect.DAMAGE, 4,
                TargetKind.ENEMY_SINGLE, 1, "Metal hit.");
        int hpBefore = f.foe.getHp();
        apply(f.battle, f.ally, metal, List.of(f.foe));
        assertEquals(hpBefore - 5, f.foe.getHp());
        assertFalse(f.foe.has(StatusKind.RUST));
    }

    @Test
    void rustIgnoresNonMetalHits() {
        Fixture f = fixture();
        f.foe.applyStatus(StatusKind.RUST, 2);
        AbilitySpec fire = new AbilitySpec("fire", "Ember", Element.FIRE, Effect.DAMAGE, 4,
                TargetKind.ENEMY_SINGLE, 1, "Fire hit.");
        int hpBefore = f.foe.getHp();
        apply(f.battle, f.ally, fire, List.of(f.foe));
        assertEquals(hpBefore - 4, f.foe.getHp());
        assertTrue(f.foe.has(StatusKind.RUST));
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

    @Test
    void disorientRaisesCardApCost() {
        Fixture f = fixture();
        f.ally.applyStatus(StatusKind.DISORIENT, 2);
        AbilitySpec hit = new AbilitySpec("hit", "Strike", Element.EARTH, Effect.DAMAGE, 5,
                TargetKind.ENEMY_SINGLE, 1, "Hit.");
        assertEquals(2, engine.effectiveCost(f.battle, hit, f.ally));
        assertEquals(1, engine.effectiveCost(f.battle, hit, f.foe));
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
    void leechSecondEarthHitHealsForDamageDealtAndClears() {
        Fixture f = fixture();
        f.ally.setHp(48);
        AbilitySpec hit = new AbilitySpec("root-bite", "Root Bite", Element.EARTH, Effect.DAMAGE, 5,
                TargetKind.ENEMY_SINGLE, 1, "Hit.", StatusKind.LEECH, 100);

        apply(f.battle, f.ally, hit, List.of(f.foe));
        assertTrue(f.foe.has(StatusKind.LEECH));
        assertEquals(48, f.ally.getHp(), "first Earth hit only marks");

        apply(f.battle, f.ally, hit, List.of(f.foe));
        assertFalse(f.foe.has(StatusKind.LEECH));
        assertEquals(53, f.ally.getHp(), "second hit restores the 5 HP dealt");
    }

    @Test
    void insightSecondHitDrawsForPlayer() {
        Fixture f = fixture();
        AbilitySpec filler = new AbilitySpec("f", "Filler", Element.PSYCHIC, Effect.DAMAGE, 3,
                TargetKind.ENEMY_SINGLE, 1, "");
        for (int i = 0; i < 3; i++) f.battle.getDeck().add(new SiegeCard("c" + i, "ally-1", filler));
        applyStatus(f.battle, f.foe, StatusKind.INSIGHT, f.ally, new Random(1));
        assertTrue(f.foe.has(StatusKind.INSIGHT));
        assertEquals(0, f.battle.getHand().size());
        applyStatus(f.battle, f.foe, StatusKind.INSIGHT, f.ally, new Random(1));
        assertFalse(f.foe.has(StatusKind.INSIGHT));
        assertEquals(1, f.battle.getHand().size());
    }

    @Test
    void witherTicksOneHpThenClears() {
        Fixture f = fixture();
        f.ally.setHp(40);
        f.ally.applyStatus(StatusKind.WITHER, 2);
        tickWither(f.battle, f.ally);
        assertEquals(39, f.ally.getHp());
        assertFalse(f.ally.has(StatusKind.WITHER));
    }

    @Test
    void curseIsTrackedForEvolveGate() {
        Fixture f = fixture();
        f.ally.applyStatus(StatusKind.CURSE, 2);
        assertTrue(f.ally.has(StatusKind.CURSE));
        // playCard evolve gate is covered by integration; here we pin the badge
        // that SiegeService/playCard both read.
        f.ally.clearStatus(StatusKind.CURSE);
        assertFalse(f.ally.has(StatusKind.CURSE));
    }
}
