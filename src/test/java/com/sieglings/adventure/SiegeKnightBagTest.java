package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Knight-bag consumables: starting loadout, revive at 50%, heal at 50%. */
class SiegeKnightBagTest {

    private SiegeService service;
    private SiegeContentService content;

    @BeforeEach
    void setUp() throws Exception {
        service = new SiegeService();
        content = new SiegeContentService();
        setField(service, "content", content);
        SiegeCombatEngine engine = new SiegeCombatEngine();
        setField(engine, "content", content);
        setField(service, "engine", engine);
        setField(service, "checkpoints", new SiegeCheckpointStore() {
            @Override
            boolean save(String token, Map<String, Object> snapshot) {
                return false;
            }
        });
    }

    @Test
    void startingKnightBagHasReviveCardAndHealingPotion() throws Exception {
        SiegeRun run = new SiegeRun("bag-test");
        invokePrivate(service, "seedStartingKnightBag", SiegeRun.class, run);

        assertEquals(2, run.getKnightBag().size());
        assertTrue(run.getKnightBag().contains("revive-card"));
        assertTrue(run.getKnightBag().contains("healing-potion"));
    }

    @Test
    void consumableDefinitionsUseFiftyPercentEffects() {
        SiegeItem revive = content.findItem("revive-card");
        SiegeItem potion = content.findItem("healing-potion");

        assertTrue(revive.consumable());
        assertTrue(potion.consumable());
        assertEquals("REVIVE", revive.kind());
        assertEquals("HEAL", potion.kind());
        assertEquals(50, revive.value());
        assertEquals(50, potion.value());
    }

    @Test
    void randomRewardItemsSkipKnightConsumablesWithoutThrowing() {
        java.util.List<SiegeItem> rewards = content.randomItems(6, new java.util.Random(1));

        assertEquals(6, rewards.size());
        assertTrue(rewards.stream().noneMatch(SiegeItem::consumable));
        assertEquals(rewards.size(), rewards.stream().map(SiegeItem::id).distinct().count());
    }

    @Test
    void treasureMapDigChoiceResolvesRandomItemReward() throws Exception {
        SiegeRun run = buildRunWithParty(100, 80);
        run.setInEvent(true);
        run.getEventOptions().add(CampOption.event("e0", "DIG_MAP", "Dig at the X", "You dig, dirt flying...", 0, 0));
        registerRun(run);

        service.eventChoose("bag-test", "e0");

        assertFalse(run.isInEvent());
        assertFalse(run.getInventory().isEmpty());
        assertTrue(run.getLastReward().startsWith("X marks the spot:"));
    }

    @Test
    void reviveCardRaisesFallenSiegelingToHalfHp() throws Exception {
        SiegeRun run = buildRunWithParty(100, 0);
        run.getKnightBag().add("revive-card");
        registerRun(run);

        service.useKnightItem("bag-test", "revive-card", "ally-0");

        assertEquals(50, run.getParty().getFirst().getHp());
        assertFalse(run.getKnightBag().contains("revive-card"));
    }

    @Test
    void healingPotionRestoresHalfMaxHp() throws Exception {
        SiegeRun run = buildRunWithParty(100, 40);
        run.getKnightBag().add("healing-potion");
        registerRun(run);

        service.useKnightItem("bag-test", "healing-potion", "ally-0");

        assertEquals(90, run.getParty().getFirst().getHp());
        assertFalse(run.getKnightBag().contains("healing-potion"));
    }

    @Test
    void cannotReviveLivingSiegeling() throws Exception {
        SiegeRun run = buildRunWithParty(100, 80);
        run.getKnightBag().add("revive-card");
        registerRun(run);

        assertThrows(IllegalArgumentException.class,
                () -> service.useKnightItem("bag-test", "revive-card", "ally-0"));
        assertTrue(run.getKnightBag().contains("revive-card"));
    }

    @Test
    void cannotHealFallenSiegeling() throws Exception {
        SiegeRun run = buildRunWithParty(100, 0);
        run.getKnightBag().add("healing-potion");
        registerRun(run);

        assertThrows(IllegalArgumentException.class,
                () -> service.useKnightItem("bag-test", "healing-potion", "ally-0"));
    }

    private SiegeRun buildRunWithParty(int maxHp, int hp) {
        SiegeRun run = new SiegeRun("bag-test");
        run.setKnightName("Test Knight");
        Combatant ally = new Combatant("ally-0", "Sprout", Element.EARTH, Side.PLAYER, maxHp, 6, null);
        ally.setHp(hp);
        run.getParty().add(ally);
        return run;
    }

    @SuppressWarnings("unchecked")
    private void registerRun(SiegeRun run) throws Exception {
        Map<String, Object> runs = (Map<String, Object>) getField(service, "runs");
        Class<?> sessionClass = Class.forName("com.sieglings.adventure.SiegeService$Session");
        Constructor<?> ctor = sessionClass.getDeclaredConstructor(SiegeRun.class);
        ctor.setAccessible(true);
        runs.put(run.getToken(), ctor.newInstance(run));
    }

    private static Object invokePrivate(Object target, String name, Class<?> paramType, Object arg) throws Exception {
        var m = target.getClass().getDeclaredMethod(name, paramType);
        m.setAccessible(true);
        return m.invoke(target, arg);
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field f = findField(target.getClass(), name);
        f.setAccessible(true);
        f.set(target, value);
    }

    private static Object getField(Object target, String name) throws Exception {
        Field f = findField(target.getClass(), name);
        f.setAccessible(true);
        return f.get(target);
    }

    private static Field findField(Class<?> type, String name) throws NoSuchFieldException {
        Class<?> c = type;
        while (c != null) {
            try {
                return c.getDeclaredField(name);
            } catch (NoSuchFieldException ignored) {
                c = c.getSuperclass();
            }
        }
        throw new NoSuchFieldException(name);
    }
}
