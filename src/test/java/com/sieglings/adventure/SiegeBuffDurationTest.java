package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Stat buffs run a clock. They used to last the whole battle, so a repeatable
 * buff card compounded every round and every later attack cashed the whole
 * stack; these tests pin the window, the expiry, and the stacking rule — copies
 * add up, but each lapses on its own clock instead of compounding forever.
 */
class SiegeBuffDurationTest {

    private final SiegeCombatEngine engine = new SiegeCombatEngine();

    private SiegeBattle battle() {
        SiegeBattle b = new SiegeBattle(NodeType.BATTLE);
        b.setRoundNumber(1);
        b.setPhase(BattlePhase.PLAYER_INPUT);
        b.setActionPoints(5);
        return b;
    }

    private Combatant ally() {
        Combatant c = new Combatant("ally-1", "Cacty", Element.EARTH, Side.PLAYER, 60, 10, null);
        c.setPosition(0);
        return c;
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

    private void expireBuffs(SiegeBattle battle, Side side) {
        try {
            Method m = SiegeCombatEngine.class.getDeclaredMethod("expireBuffs", SiegeBattle.class, Side.class);
            m.setAccessible(true);
            m.invoke(engine, battle, side);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private AbilitySpec buffCard(String id, Effect effect, int value) {
        return new AbilitySpec(id, "Rally", Element.EARTH, effect, value, TargetKind.ALLY_SINGLE, 1, "");
    }

    @Test
    void attackBuffLapsesAfterItsDuration() {
        SiegeBattle b = battle();
        Combatant ally = ally();
        b.getCombatants().add(ally);

        apply(b, ally, buffCard("rally", Effect.BUFF_ATK, 4), List.of(ally));
        assertEquals(4, ally.getAttackBuff(), "buff applies on the round it is played");
        assertEquals(SiegeTuning.BUFF_ATK_ROUNDS, ally.buffRoundsLeft(Combatant.BuffStat.ATTACK, 1));

        // Still standing while the window is open.
        b.setRoundNumber(2);
        expireBuffs(b, Side.PLAYER);
        assertEquals(4, ally.getAttackBuff(), "buff holds inside its window");

        // Gone once the side opens the round it expires on.
        b.setRoundNumber(1 + SiegeTuning.BUFF_ATK_ROUNDS);
        expireBuffs(b, Side.PLAYER);
        assertEquals(0, ally.getAttackBuff(), "buff lapses when its duration runs out");
        assertTrue(b.getLog().stream().anyMatch(l -> l.contains("attack fades")),
                "the fade is announced, not silent");
    }

    @Test
    void speedBuffLapsesAndLeavesBaseSpeedIntact() {
        SiegeBattle b = battle();
        Combatant ally = ally();
        b.getCombatants().add(ally);
        int base = ally.effectiveSpeed();

        apply(b, ally, buffCard("gust", Effect.BUFF_SPD, 3), List.of(ally));
        assertEquals(base + 3, ally.effectiveSpeed());

        b.setRoundNumber(1 + SiegeTuning.BUFF_SPD_ROUNDS);
        expireBuffs(b, Side.PLAYER);
        assertEquals(base, ally.effectiveSpeed(), "speed returns to base, not below it");
    }

    @Test
    void replayingTheSameCardStacksAmountAndKeepsItsOwnClock() {
        SiegeBattle b = battle();
        Combatant ally = ally();
        b.getCombatants().add(ally);
        AbilitySpec rally = buffCard("rally", Effect.BUFF_ATK, 4);

        apply(b, ally, rally, List.of(ally));
        apply(b, ally, rally, List.of(ally));
        assertEquals(8, ally.getAttackBuff(), "a second copy of the same card stacks on the first");

        // The later copy runs its own clock, so the stack decays a grant at a time.
        b.setRoundNumber(2);
        apply(b, ally, rally, List.of(ally));
        assertEquals(12, ally.getAttackBuff(), "a third copy stacks again");
        assertEquals(SiegeTuning.BUFF_ATK_ROUNDS + 1, ally.buffRoundsLeft(Combatant.BuffStat.ATTACK, 1),
                "the newest grant carries the window further out");

        b.setRoundNumber(1 + SiegeTuning.BUFF_ATK_ROUNDS);
        expireBuffs(b, Side.PLAYER);
        assertEquals(4, ally.getAttackBuff(), "the round-1 grants lapse together, the round-2 one holds");

        b.setRoundNumber(2 + SiegeTuning.BUFF_ATK_ROUNDS);
        expireBuffs(b, Side.PLAYER);
        assertEquals(0, ally.getAttackBuff(), "and the last grant lapses on its own round");

        // A different card is a different grant, and stacks the same way.
        apply(b, ally, buffCard("warcry", Effect.BUFF_ATK, 2), List.of(ally));
        apply(b, ally, rally, List.of(ally));
        assertEquals(6, ally.getAttackBuff(), "distinct buff sources stack too");
    }

    @Test
    void loadoutBuffsStayBattleLong() {
        Combatant ally = ally();
        // The knight ATTACK passive and carried items take the untimed path.
        ally.addAttackBuff(3);
        assertEquals(0, ally.buffRoundsLeft(Combatant.BuffStat.ATTACK, 1),
                "a loadout bonus has no countdown to show");
        SiegeBattle b = battle();
        b.getCombatants().add(ally);
        b.setRoundNumber(9);
        expireBuffs(b, Side.PLAYER);
        assertEquals(3, ally.getAttackBuff(), "loadout bonuses last the whole battle");
    }

    @Test
    void everyBuffAbilityCarriesADuration() {
        // A spec authored without a duration must not fall back to "forever".
        for (Effect effect : List.of(Effect.BUFF_ATK, Effect.BUFF_SPD)) {
            AbilitySpec spec = buffCard("auth-" + effect, effect, 2);
            assertTrue(spec.buffExpires(), effect + " must default to a bounded window");
            assertEquals(SiegeTuning.defaultBuffRounds(effect), spec.durationRounds());
        }
    }
}
