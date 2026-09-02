package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A mid-battle checkpoint round-trip (snapshot → Firestore-shaped Map →
 * restore) must reproduce the battle exactly — HP, shields, statuses,
 * positions, enemy intents, and every card in hand/deck/discard — since a
 * player can close the app mid-fight and expect to land back exactly where
 * they left off. {@code snapshotBattle}/{@code restoreBattle} are private, so
 * this test (same package) reaches them via reflection rather than widening
 * their visibility.
 */
class SiegeBattleCheckpointTest {

    private static Object invokePrivate(Object target, String name, Class<?>[] types, Object... args) throws Exception {
        Method m = SiegeService.class.getDeclaredMethod(name, types);
        m.setAccessible(true);
        return m.invoke(target, args);
    }

    @SuppressWarnings("unchecked")
    @Test
    void snapshotThenRestoreReproducesBattleState() throws Exception {
        SiegeService service = new SiegeService();

        SiegeBattle battle = new SiegeBattle(NodeType.ELITE);
        battle.setPhase(BattlePhase.PLAYER_INPUT);
        battle.setActionPoints(3);
        battle.setRoundNumber(4);
        battle.setPlayerActsFirst(false);
        battle.setPlayerSpeed(21);
        battle.setEnemySpeed(9);
        battle.setKnightCharge(12);
        battle.setLeadId("ally-1");
        battle.getAdvantageOrder().addAll(java.util.List.of("foe-1", "ally-1"));
        battle.setAdvantageIndex(1);
        battle.setAdvantageCycle(3);
        battle.log("Round 4 begins.");

        Combatant ally = new Combatant("ally-1", "Cacty", Element.EARTH, Side.PLAYER, 86, 12, "/img/cacty.png");
        ally.setPosition(0);
        ally.setShield(5);
        ally.addAttackBuff(4);
        ally.setSourceCardId("cacty");
        ally.setApSpent(3);
        ally.applyStatus(StatusKind.SLOW, 2);
        ally.setHp(70);
        battle.getCombatants().add(ally);

        Combatant knight = new Combatant("knight-1", "Ser Bob", Element.FIRE, Side.PLAYER, 40, 5, "/img/knight.png", true);
        knight.setPosition(-1);
        knight.setHp(31);
        battle.getCombatants().add(knight);

        AbilitySpec enemyMove = new AbilitySpec("emberstrike", "Ember Strike", Element.FIRE, Effect.DAMAGE, 9,
                TargetKind.ENEMY_SINGLE, 0, "Deals 9 fire damage.", StatusKind.BURN, 25);
        Combatant foe = new Combatant("foe-1", "Ember Fiend", Element.FIRE, Side.ENEMY, 57, 8, "/img/foe.png");
        foe.setHp(26);
        foe.getAbilities().add(enemyMove);
        foe.setIntent(enemyMove);
        foe.setIntentPosition(1);
        foe.applyStatus(StatusKind.BURN, 99);
        battle.getCombatants().add(foe);

        AbilitySpec cardSpec = new AbilitySpec("spark", "Spark", Element.FIRE, Effect.DAMAGE, 4,
                TargetKind.ALL_ENEMIES, 0, "4 dmg to all enemies.");
        battle.getHand().add(new SiegeCard("c1", "ally-1", cardSpec));
        battle.getDeck().add(new SiegeCard("c2", "ally-1", cardSpec));
        battle.getDiscard().add(new SiegeCard("c3", "knight-legacy", cardSpec));
        battle.turnEntry("you", "Cacty", "Spark", 0, "Spark → Ember Fiend");

        Map<String, Object> snapshot = (Map<String, Object>) invokePrivate(
                service, "snapshotBattle", new Class<?>[]{SiegeBattle.class}, battle);

        // Firestore round-trips values as generic Objects (numbers may come back
        // as Long instead of Integer) — simulate that instead of reusing the
        // exact in-memory Map so the test also catches unboxing assumptions.
        Map<String, Object> roundTripped = simulateFirestoreRoundTrip(snapshot);

        SiegeBattle restored = (SiegeBattle) invokePrivate(
                service, "restoreBattle", new Class<?>[]{Map.class}, roundTripped);

        assertEquals(NodeType.ELITE, restored.getNodeType());
        assertEquals(BattlePhase.PLAYER_INPUT, restored.getPhase());
        assertEquals(3, restored.getActionPoints());
        assertEquals(4, restored.getRoundNumber());
        assertEquals(false, restored.isPlayerActsFirst());
        assertEquals(21, restored.getPlayerSpeed());
        assertEquals(9, restored.getEnemySpeed());
        assertEquals(12, restored.getKnightCharge());
        assertEquals("ally-1", restored.getLeadId());
        assertEquals(java.util.List.of("foe-1", "ally-1"), restored.getAdvantageOrder());
        assertEquals("ally-1", restored.getAdvantageHolderId());
        assertEquals(3, restored.getAdvantageCycle());
        assertTrue(restored.getLog().contains("Round 4 begins."));
        assertEquals(1, restored.getTurnLog().size());

        assertEquals(3, restored.getCombatants().size());
        Combatant restoredAlly = restored.findCombatant("ally-1");
        assertNotNull(restoredAlly);
        assertEquals(70, restoredAlly.getHp());
        assertEquals(86, restoredAlly.getMaxHp());
        assertEquals(5, restoredAlly.getShield());
        assertEquals(4, restoredAlly.getAttackBuff());
        assertEquals(0, restoredAlly.getPosition());
        assertEquals("cacty", restoredAlly.getSourceCardId());
        assertEquals(3, restoredAlly.getApSpent());
        assertTrue(restoredAlly.has(StatusKind.SLOW));
        assertEquals(12, restoredAlly.getBaseSpeed());

        Combatant restoredKnight = restored.findCombatant("knight-1");
        assertNotNull(restoredKnight);
        assertTrue(restoredKnight.isKnight());
        assertEquals(31, restoredKnight.getHp());

        Combatant restoredFoe = restored.findCombatant("foe-1");
        assertNotNull(restoredFoe);
        assertEquals(Side.ENEMY, restoredFoe.getSide());
        assertEquals(26, restoredFoe.getHp());
        assertTrue(restoredFoe.has(StatusKind.BURN));
        assertEquals(1, restoredFoe.getAbilities().size());
        assertEquals("Ember Strike", restoredFoe.getAbilities().get(0).name());
        assertNotNull(restoredFoe.getIntent());
        assertEquals("Ember Strike", restoredFoe.getIntent().name());
        assertEquals(1, restoredFoe.getIntentPosition());

        assertEquals(1, restored.getHand().size());
        assertEquals("ally-1", restored.getHand().get(0).getOwnerId());
        assertEquals(1, restored.getDeck().size());
        assertEquals(1, restored.getDiscard().size());
        assertEquals("Spark", restored.getHand().get(0).getSpec().name());
    }

    /** Mimics what a real Firestore document read hands back: ints become
     *  Longs, and nested maps/lists are plain generic collections. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> simulateFirestoreRoundTrip(Map<String, Object> in) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        in.forEach((k, v) -> out.put(k, coerce(v)));
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Object coerce(Object v) {
        if (v instanceof Integer i) return (long) i;
        if (v instanceof Map<?, ?> m) {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            m.forEach((k, val) -> out.put(String.valueOf(k), coerce(val)));
            return out;
        }
        if (v instanceof java.util.List<?> list) {
            java.util.List<Object> out = new java.util.ArrayList<>();
            for (Object item : list) out.add(coerce(item));
            return out;
        }
        return v;
    }
}
