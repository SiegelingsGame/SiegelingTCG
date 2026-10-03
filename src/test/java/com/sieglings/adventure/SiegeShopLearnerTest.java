package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * A universal (NEUTRAL) move sold at the camp trader or caravan is not pre-bound
 * to a random Siegeling: the buyer names the learner when paying. Element moves
 * keep the owner they were rolled for.
 */
@SpringBootTest
class SiegeShopLearnerTest {

    @Autowired
    private SiegeService service;

    private static final AbilitySpec UNIVERSAL = new AbilitySpec("neutral-gen-1", "Guard Pulse", Element.NEUTRAL,
            Effect.SHIELD, 5, TargetKind.ALLY_SINGLE, 1, "A universal technique any Siegeling can learn.");
    private static final AbilitySpec EMBER = new AbilitySpec("ember", "Ember", Element.FIRE,
            Effect.DAMAGE, 4, TargetKind.ENEMY_SINGLE, 1, "Deal 4 damage.");

    @Test
    void universalCampMoveIsTaughtToThePickedSiegeling() throws Exception {
        SiegeRun run = campRun();
        run.getCampOptions().add(CampOption.shopCard("c1", UNIVERSAL, "ally-0", "Sprout", 25));
        registerRun(run);

        Map<String, Object> offer = campOption(service.state(run.getToken()), "c1");
        assertEquals(Boolean.TRUE, offer.get("chooseLearner"));
        assertFalse(((String) offer.get("desc")).contains("learned by"));

        assertThrows(IllegalArgumentException.class, () -> service.campChoose(run.getToken(), "c1", null),
                "a universal move needs a learner");
        assertThrows(IllegalArgumentException.class, () -> service.campChoose(run.getToken(), "c1", "ghost"));
        assertThrows(IllegalArgumentException.class, () -> service.campChoose(run.getToken(), "c1", "ally-2"),
                "a fallen Siegeling cannot learn it");
        assertEquals(60, run.getGold(), "a rejected pick costs nothing");
        assertEquals(0, run.getDeckTemplates().size());

        service.campChoose(run.getToken(), "c1", "ally-1");
        assertEquals(35, run.getGold());
        assertEquals(1, run.getDeckTemplates().size());
        assertEquals("ally-1", run.getDeckTemplates().getFirst().getOwnerId());
        assertEquals("Fawny learned Guard Pulse.", run.getLastReward());
    }

    @Test
    void elementCampMoveKeepsItsRolledOwnerAndIgnoresAPick() throws Exception {
        SiegeRun run = campRun();
        run.getCampOptions().add(CampOption.shopCard("c1", EMBER, "ally-0", "Sprout", 25));
        registerRun(run);

        Map<String, Object> state = service.campChoose(run.getToken(), "c1", "ally-1");
        assertNull(campOption(state, "c1").get("chooseLearner"));
        assertEquals("ally-0", run.getDeckTemplates().getFirst().getOwnerId());
    }

    @Test
    void universalCaravanMoveIsTaughtToThePickedSiegeling() throws Exception {
        SiegeRun run = campRun();
        run.setInCamp(false);
        run.setInCaravan(true);
        run.getCaravanOptions().add(CampOption.shopCard("v1", UNIVERSAL, "ally-0", "Sprout", 30));
        registerRun(run);

        assertThrows(IllegalArgumentException.class, () -> service.caravanBuy(run.getToken(), "v1", null));
        assertEquals(60, run.getGold());

        service.caravanBuy(run.getToken(), "v1", "ally-1");
        assertEquals(30, run.getGold());
        assertEquals("ally-1", run.getDeckTemplates().getFirst().getOwnerId());
    }

    private SiegeRun campRun() {
        SiegeRun run = new SiegeRun("shop-learner-" + System.nanoTime());
        run.setKnightUnit(new Combatant("knight", "Squire Bob", Element.FIRE, Side.PLAYER, 40, 5, null, true));
        run.getParty().add(new Combatant("ally-0", "Sprout", Element.EARTH, Side.PLAYER, 40, 6, null));
        run.getParty().add(new Combatant("ally-1", "Fawny", Element.ICE, Side.PLAYER, 40, 6, null));
        Combatant fallen = new Combatant("ally-2", "Draco", Element.FIRE, Side.PLAYER, 40, 6, null);
        fallen.setHp(0);
        run.getParty().add(fallen);
        run.setGold(60);
        run.setInCamp(true);
        return run;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> campOption(Map<String, Object> state, String id) {
        return ((List<Map<String, Object>>) ((Map<String, Object>) state.get("camp")).get("options")).stream()
                .filter(o -> id.equals(o.get("id"))).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private void registerRun(SiegeRun run) throws Exception {
        Field f = SiegeService.class.getDeclaredField("runs");
        f.setAccessible(true);
        Map<String, Object> runs = (Map<String, Object>) f.get(service);
        Class<?> sessionClass = Class.forName("com.sieglings.adventure.SiegeService$Session");
        Constructor<?> ctor = sessionClass.getDeclaredConstructor(SiegeRun.class);
        ctor.setAccessible(true);
        runs.put(run.getToken(), ctor.newInstance(run));
    }
}
