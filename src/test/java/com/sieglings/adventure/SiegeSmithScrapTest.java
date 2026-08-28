package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Scrapping a deck card at the Smith must remap remaining chisel offers.
 * Otherwise a later forge still uses the pre-scrap templateIndex and upgrades
 * the wrong card after the deck shifts.
 */
class SiegeSmithScrapTest {

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
    void scrapThenChiselUpgradesTheCardTheOfferNamed() throws Exception {
        SiegeRun run = new SiegeRun("smith-scrap-test");
        run.setInSmith(true);
        run.addGold(100);

        AbilitySpec spark = new AbilitySpec("spark", "Spark", Element.FIRE, Effect.DAMAGE, 4,
                TargetKind.ENEMY_SINGLE, 1, "4 fire damage.");
        AbilitySpec tide = new AbilitySpec("tide", "Tide", Element.WATER, Effect.DAMAGE, 5,
                TargetKind.ENEMY_SINGLE, 1, "5 water damage.");
        AbilitySpec quake = new AbilitySpec("quake", "Quake", Element.EARTH, Effect.DAMAGE, 6,
                TargetKind.ALL_ENEMIES, 2, "6 earth damage to all.");
        AbilitySpec gust = new AbilitySpec("gust", "Gust", Element.WIND, Effect.DAMAGE, 3,
                TargetKind.ENEMY_SINGLE, 1, "3 wind damage.");

        run.getDeckTemplates().add(new SiegeCard("c-spark", "ally-0", spark));
        run.getDeckTemplates().add(new SiegeCard("c-tide", "ally-0", tide));
        run.getDeckTemplates().add(new SiegeCard("c-quake", "ally-0", quake));
        run.getDeckTemplates().add(new SiegeCard("c-gust", "ally-0", gust));

        // Offers baked against pre-scrap indices: Sparks at 0, Quake at 2, Gust at 3.
        AbilitySpec sparkUp = content.upgradeSpec(spark);
        AbilitySpec quakeUp = content.upgradeSpec(quake);
        AbilitySpec gustUp = content.upgradeSpec(gust);
        run.getSmithOptions().add(CampOption.smith("s0", "CHISEL",
                "Chisel Spark", "Spark → " + sparkUp.name(), Element.FIRE, 0, 30));
        run.getSmithOptions().add(CampOption.smith("s1", "CHISEL",
                "Chisel Quake", "Quake → " + quakeUp.name(), Element.EARTH, 2, 30));
        run.getSmithOptions().add(CampOption.smith("s2", "CHISEL",
                "Chisel Gust", "Gust → " + gustUp.name(), Element.WIND, 3, 30));
        registerRun(run);

        // Scrap Tide (index 1). Quake/Gust shift down; Spark stays at 0.
        // No chisel offer pointed at Tide, so all three offers remain with remapped indices.
        service.smithChoose("smith-scrap-test", null, 1);

        assertEquals(3, run.getDeckTemplates().size());
        assertEquals("c-spark", run.getDeckTemplates().get(0).getInstanceId());
        assertEquals("c-quake", run.getDeckTemplates().get(1).getInstanceId());
        assertEquals("c-gust", run.getDeckTemplates().get(2).getInstanceId());
        assertEquals(3, run.getSmithOptions().size());
        CampOption sparkOffer = run.getSmithOptions().stream()
                .filter(o -> "s0".equals(o.id)).findFirst().orElseThrow();
        CampOption quakeOffer = run.getSmithOptions().stream()
                .filter(o -> "s1".equals(o.id)).findFirst().orElseThrow();
        CampOption gustOffer = run.getSmithOptions().stream()
                .filter(o -> "s2".equals(o.id)).findFirst().orElseThrow();
        assertEquals(0, sparkOffer.templateIndex);
        assertEquals(1, quakeOffer.templateIndex);
        assertEquals(2, gustOffer.templateIndex);

        // Chisel Quake — must upgrade Quake, not Gust (the card now at old index 2).
        service.smithChoose("smith-scrap-test", "s1", null);

        assertEquals(70, run.getGold());
        assertEquals(quakeUp.name(), run.getDeckTemplates().get(1).getSpec().name());
        assertEquals("c-quake", run.getDeckTemplates().get(1).getInstanceId());
        assertEquals("Gust", run.getDeckTemplates().get(2).getSpec().name());
        assertEquals("Spark", run.getDeckTemplates().get(0).getSpec().name());
        assertTrue(quakeOffer.used);
        assertFalse(gustOffer.used);
        assertFalse(sparkOffer.used);
        assertTrue(run.getLastReward().contains("Quake"));
    }

    @Test
    void scrapDropsChiselOfferForTheRemovedCard() throws Exception {
        SiegeRun run = new SiegeRun("smith-scrap-drop");
        run.setInSmith(true);
        run.addGold(100);

        AbilitySpec spark = new AbilitySpec("spark", "Spark", Element.FIRE, Effect.DAMAGE, 4,
                TargetKind.ENEMY_SINGLE, 1, "4 fire damage.");
        AbilitySpec tide = new AbilitySpec("tide", "Tide", Element.WATER, Effect.DAMAGE, 5,
                TargetKind.ENEMY_SINGLE, 1, "5 water damage.");
        AbilitySpec quake = new AbilitySpec("quake", "Quake", Element.EARTH, Effect.DAMAGE, 6,
                TargetKind.ALL_ENEMIES, 2, "6 earth damage to all.");
        AbilitySpec gust = new AbilitySpec("gust", "Gust", Element.WIND, Effect.DAMAGE, 3,
                TargetKind.ENEMY_SINGLE, 1, "3 wind damage.");

        run.getDeckTemplates().add(new SiegeCard("c-spark", "ally-0", spark));
        run.getDeckTemplates().add(new SiegeCard("c-tide", "ally-0", tide));
        run.getDeckTemplates().add(new SiegeCard("c-quake", "ally-0", quake));
        run.getDeckTemplates().add(new SiegeCard("c-gust", "ally-0", gust));

        AbilitySpec tideUp = content.upgradeSpec(tide);
        AbilitySpec quakeUp = content.upgradeSpec(quake);
        run.getSmithOptions().add(CampOption.smith("s-tide", "CHISEL",
                "Chisel Tide", "Tide → " + tideUp.name(), Element.WATER, 1, 30));
        run.getSmithOptions().add(CampOption.smith("s-quake", "CHISEL",
                "Chisel Quake", "Quake → " + quakeUp.name(), Element.EARTH, 2, 30));
        registerRun(run);

        service.smithChoose("smith-scrap-drop", null, 1);

        assertEquals(1, run.getSmithOptions().size());
        CampOption remaining = run.getSmithOptions().getFirst();
        assertEquals("s-quake", remaining.id);
        assertEquals(1, remaining.templateIndex);
    }

    @Test
    void upgradeSpecKeepsALevelUpSwapRider() {
        AbilitySpec amped = new AbilitySpec("test-move-link", "Move Link ★", Element.NEUTRAL,
                Effect.SWAP, 0, TargetKind.ALLY_SINGLE, 1, "Trade notches.",
                null, 0, AmpRider.HEAL, SiegeTuning.AMP_SWAP_HEAL);
        AbilitySpec upgraded = content.upgradeSpec(amped);
        assertEquals(AmpRider.HEAL, upgraded.rider(),
                "a smith / spoil upgrade must not strip the level-up rider");
        assertEquals(SiegeTuning.AMP_SWAP_HEAL, upgraded.riderValue());
        assertTrue(upgraded.hasRider());
        assertTrue(upgraded.name().contains("+"));
    }

    @SuppressWarnings("unchecked")
    private void registerRun(SiegeRun run) throws Exception {
        Map<String, Object> runs = (Map<String, Object>) getField(service, "runs");
        Class<?> sessionClass = Class.forName("com.sieglings.adventure.SiegeService$Session");
        Constructor<?> ctor = sessionClass.getDeclaredConstructor(SiegeRun.class);
        ctor.setAccessible(true);
        runs.put(run.getToken(), ctor.newInstance(run));
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
        Class<?> cursor = type;
        while (cursor != null) {
            try {
                return cursor.getDeclaredField(name);
            } catch (NoSuchFieldException ignored) {
                cursor = cursor.getSuperclass();
            }
        }
        throw new NoSuchFieldException(name);
    }
}
