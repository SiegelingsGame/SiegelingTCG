package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A card has to mean the same thing in Siege that its text promises on the
 * battle table. The old resolver only recognised a handful of effect keys and
 * fell through to "deal damage to whatever the card was pointed at", which
 * turned a self-targeted draw card into the caster hitting itself and left
 * connected-allies, slow, and destroy cards resolving as plain attacks.
 *
 * <p>{@code applyEffect}/{@code expireShields} are private, so the behaviour
 * half of this test (same package) reaches them by reflection rather than
 * widening the engine's surface.
 */
class SiegeCardEffectParityTest {

    private final SiegeContentService content = new SiegeContentService();
    private final SiegeCombatEngine engine = new SiegeCombatEngine();

    private Effect effect(String key) {
        return content.effectFor(key);
    }

    private TargetKind target(String key, TargetType boardTarget) {
        return content.targetFor(boardTarget, content.effectFor(key), key);
    }

    // ---- key -> effect parity -------------------------------------------

    @Test
    void everyBoardEffectKeyMapsToItsOwnSiegeEffect() {
        assertEquals(Effect.DAMAGE, effect("damage"));
        assertEquals(Effect.DAMAGE, effect("player_damage"));
        assertEquals(Effect.DRAW, effect("draw"));
        assertEquals(Effect.HEAL, effect("heal"));
        assertEquals(Effect.SHIELD, effect("shield"));
        assertEquals(Effect.MAX_HP_BOOST, effect("health_boost"));
        assertEquals(Effect.BUFF_ATK, effect("damage_boost"));
        assertEquals(Effect.BUFF_SPD, effect("speed_boost"));
        // Freeze skips a turn on the board, so it stuns; speed_zero/slow only
        // take Speed, which is what the Slow status does.
        assertEquals(Effect.STUN, effect("freeze"));
        assertEquals(Effect.SLOW, effect("speed_zero"));
        assertEquals(Effect.SLOW, effect("slow"));
        assertEquals(Effect.EXECUTE, effect("destroy"));
        assertEquals(Effect.SWAP, effect("move_link"));

        assertEquals(Effect.BUFF_ATK, effect("connected_allies_damage_boost"));
        assertEquals(Effect.MAX_HP_BOOST, effect("connected_allies_health_boost"));
        assertEquals(Effect.HEAL, effect("connected_allies_heal"));
        assertEquals(Effect.SHIELD, effect("connected_allies_shield"));
        assertEquals(Effect.BUFF_SPD, effect("connected_allies_speed_boost"));
        assertEquals(Effect.SLOW, effect("connected_allies_slow"));
    }

    @Test
    void connectedAlliesCardsReachTheWholeWarband() {
        // Written as SELF on the board because they walk the source's notch links;
        // Siege has no links, so the warband is the linked network.
        assertEquals(TargetKind.ALLY_ALL, target("connected_allies_damage_boost", TargetType.SELF));
        assertEquals(TargetKind.ALLY_ALL, target("connected_allies_health_boost", TargetType.SELF));
        assertEquals(TargetKind.ALLY_ALL, target("connected_allies_heal", TargetType.SELF));
        assertEquals(TargetKind.ALLY_ALL, target("connected_allies_shield", TargetType.SELF));
        assertEquals(TargetKind.ALLY_ALL, target("connected_allies_speed_boost", TargetType.SELF));
        assertEquals(TargetKind.ALLY_ALL, target("connected_allies_slow", TargetType.SELF));
    }

    @Test
    void supportCardsAreNeverAimedAtTheCaster() {
        // The regression: a SELF-targeted draw card used to resolve as DAMAGE on
        // its own owner because "draw" was not a recognised key.
        assertEquals(Effect.DRAW, effect("draw"));
        assertEquals(TargetKind.SELF, target("draw", TargetType.SELF));

        // An unregistered key still falls back to DAMAGE, but a damaging card can
        // no longer be pointed at your own side.
        assertEquals(Effect.DAMAGE, effect("some_future_key"));
        assertEquals(TargetKind.ENEMY_SINGLE, target("some_future_key", TargetType.SELF));
        assertEquals(TargetKind.ENEMY_SINGLE, target("some_future_key", TargetType.SINGLE_ALLY));
        assertEquals(TargetKind.ALL_ENEMIES, target("some_future_key", TargetType.ALL_ALLIES));

        // ...and a healing card can no longer be pointed at the enemy line.
        assertEquals(TargetKind.ALLY_ALL, target("heal", TargetType.ENEMY_PLAYER));
        assertEquals(TargetKind.ALLY_SINGLE, target("heal", TargetType.SINGLE_ENEMY));
        assertEquals(TargetKind.ALL_ENEMIES, target("player_damage", TargetType.ENEMY_PLAYER));
    }

    @Test
    void rowAndSweepAttacksHitEveryEnemy() {
        assertEquals(TargetKind.ALL_ENEMIES, target("damage", TargetType.ROW_ENEMIES));
        assertEquals(TargetKind.ALL_ENEMIES, target("damage", TargetType.ROW_SELECT_ENEMIES));
        assertEquals(TargetKind.ALL_ENEMIES, target("damage", TargetType.ALL_ENEMIES));
        assertEquals(TargetKind.ALLY_ALL, target("heal", TargetType.ROW_ALLIES));
        // A destroy card is single-target however the board printed it: wiping a
        // whole enemy line at once is not something Siege can survive.
        assertEquals(TargetKind.ENEMY_SINGLE, target("destroy", TargetType.ALL_ENEMIES));
    }

    // ---- resolution behaviour -------------------------------------------

    private static final class Fixture {
        SiegeBattle battle;
        Combatant ally;
        Combatant mate;
        Combatant foe;
    }

    private Fixture fixture(NodeType type) {
        Fixture f = new Fixture();
        f.battle = new SiegeBattle(type);
        f.battle.setRoundNumber(1);
        f.battle.setPhase(BattlePhase.PLAYER_INPUT);
        f.ally = new Combatant("ally-1", "Cacty", Element.EARTH, Side.PLAYER, 60, 10, null);
        f.ally.setPosition(0);
        f.mate = new Combatant("ally-2", "Vane", Element.WIND, Side.PLAYER, 60, 8, null);
        f.mate.setPosition(1);
        f.foe = new Combatant("foe-1", "Cinder Husk", Element.FIRE, Side.ENEMY, 40, 7, null);
        f.battle.getCombatants().add(f.ally);
        f.battle.getCombatants().add(f.mate);
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

    private void expireShields(SiegeBattle battle, Side side) {
        try {
            Method m = SiegeCombatEngine.class.getDeclaredMethod("expireShields", SiegeBattle.class, Side.class);
            m.setAccessible(true);
            m.invoke(engine, battle, side);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void shieldLastsUntilTheBeginningOfYourNextTurn() {
        Fixture f = fixture(NodeType.BATTLE);
        AbilitySpec bulwark = new AbilitySpec("shield", "Bulwark", Element.EARTH, Effect.SHIELD, 9,
                TargetKind.ALLY_ALL, 1, "Shield the warband.");
        apply(f.battle, f.ally, bulwark, List.of(f.ally, f.mate));
        assertEquals(9, f.ally.getShield());

        // Still standing for the rest of the turn it was cast on.
        expireShields(f.battle, Side.PLAYER);
        assertEquals(9, f.ally.getShield());

        // Gone the moment the party opens its next turn.
        f.battle.setRoundNumber(2);
        expireShields(f.battle, Side.PLAYER);
        assertEquals(0, f.ally.getShield());
        assertEquals(0, f.mate.getShield());
        assertTrue(f.battle.getEvents().stream()
                .anyMatch(e -> "shieldExpired".equals(e.get("type"))));
    }

    @Test
    void healthBoostRaisesMaxHpAndHealsForTheBattle() {
        Fixture f = fixture(NodeType.BATTLE);
        f.ally.setHp(40);
        AbilitySpec bolster = new AbilitySpec("health_boost", "Bolster", Element.EARTH, Effect.MAX_HP_BOOST, 12,
                TargetKind.ALLY_SINGLE, 1, "Raise max HP.");
        apply(f.battle, f.ally, bolster, List.of(f.ally));

        assertEquals(72, f.ally.getMaxHp());
        assertEquals(52, f.ally.getHp());

        // The boost is battle-scoped, exactly like the board's temporary effects.
        f.ally.setBattleMaxHpBonus(0);
        assertEquals(60, f.ally.getMaxHp());
    }

    @Test
    void attackBoostOnlyStrengthensTheSieglingsTheCardNamed() {
        Fixture f = fixture(NodeType.BATTLE);
        AbilitySpec sharpen = new AbilitySpec("damage_boost", "Sharpen", Element.EARTH, Effect.BUFF_ATK, 4,
                TargetKind.ALLY_SINGLE, 1, "One ally hits harder.");
        apply(f.battle, f.ally, sharpen, List.of(f.ally));

        assertEquals(4, f.ally.getAttackBuff());
        assertEquals(0, f.mate.getAttackBuff(), "a single-ally boost must not spill onto the warband");
    }

    @Test
    void drawCardPullsCardsInsteadOfHittingItsOwner() {
        Fixture f = fixture(NodeType.BATTLE);
        AbilitySpec spec = new AbilitySpec("draw", "Fisher", Element.WATER, Effect.DRAW, 2,
                TargetKind.SELF, 1, "Draw 2 cards.");
        AbilitySpec filler = new AbilitySpec("f", "Filler", Element.WATER, Effect.DAMAGE, 3,
                TargetKind.ENEMY_SINGLE, 1, "");
        for (int i = 0; i < 4; i++) f.battle.getDeck().add(new SiegeCard("c" + i, "ally-1", filler));

        int hpBefore = f.ally.getHp();
        apply(f.battle, f.ally, spec, List.of(f.ally));

        assertEquals(2, f.battle.getHand().size());
        assertEquals(2, f.battle.getDeck().size());
        assertEquals(hpBefore, f.ally.getHp(), "a draw card must never damage its own caster");
    }

    @Test
    void destroyKillsARankAndFileFoeButOnlyDentsABoss() {
        Fixture normal = fixture(NodeType.BATTLE);
        AbilitySpec spec = new AbilitySpec("destroy", "Unmake", Element.SHADOW, Effect.EXECUTE, 0,
                TargetKind.ENEMY_SINGLE, 3, "Destroy 1 enemy.");
        normal.foe.addShield(10, 99);
        apply(normal.battle, normal.ally, spec, List.of(normal.foe));
        assertEquals(0, normal.foe.getHp());

        Fixture boss = fixture(NodeType.BOSS);
        apply(boss.battle, boss.ally, spec, List.of(boss.foe));
        assertEquals(30, boss.foe.getHp(), "a Siegelord takes a quarter of its max HP, not a free death");
    }

    @Test
    void freezeStunsAndSlowOnlyTakesSpeed() {
        Fixture f = fixture(NodeType.BATTLE);
        AbilitySpec freeze = new AbilitySpec("freeze", "Rime Lock", Element.ICE, Effect.STUN, 0,
                TargetKind.ENEMY_SINGLE, 2, "Freeze 1 enemy.");
        apply(f.battle, f.ally, freeze, List.of(f.foe));
        assertTrue(f.foe.has(StatusKind.STUN));

        Fixture g = fixture(NodeType.BATTLE);
        AbilitySpec slow = new AbilitySpec("slow", "Drag", Element.ICE, Effect.SLOW, 2,
                TargetKind.ENEMY_SINGLE, 1, "Slow 1 enemy.");
        List<Combatant> targets = new ArrayList<>(List.of(g.foe));
        apply(g.battle, g.ally, slow, targets);
        assertTrue(g.foe.has(StatusKind.SLOW));
        assertTrue(g.foe.effectiveSpeed() < g.foe.getSpeed());
    }
}
