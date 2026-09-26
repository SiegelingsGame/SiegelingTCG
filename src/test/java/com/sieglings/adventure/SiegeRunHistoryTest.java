package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import com.sieglings.persistence.firestore.MatchReviewStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A finished run is written to Siege history once, with one entry per stop:
 * what was offered and picked, the outcome line, the purse and warband health
 * before and after, and for battles who was fought and how it ended.
 */
@SpringBootTest
class SiegeRunHistoryTest {

    @Autowired
    private SiegeService service;

    private final List<Map<String, Object>> saved = new ArrayList<>();
    private Object originalStore;

    @BeforeEach
    void setUp() throws Exception {
        originalStore = getField(service, "matchReviewStore");
        setField(service, "matchReviewStore", new MatchReviewStore() {
            @Override
            public void saveSiegeRun(String runId, Map<String, Object> payload) {
                assertTrue(runId.startsWith("siege-"));
                saved.add(payload);
            }
        });
    }

    @AfterEach
    void restoreStore() throws Exception {
        setField(service, "matchReviewStore", originalStore);
    }

    @Test
    void finishedRunRecordsEachStopWithPicksHealthAndFoes() throws Exception {
        SiegeRun run = runWithRestThenBattle("u-1");
        registerRun(run);
        Combatant ally = run.getParty().getFirst();
        ally.setHp(20);

        service.enterNode(run.getToken(), 0);
        String restId = run.getCampOptions().stream().filter(o -> "REST".equals(o.kind)).findFirst().orElseThrow().id;
        service.campChoose(run.getToken(), restId);
        service.campLeave(run.getToken());

        service.enterNode(run.getToken(), 1);
        assertNotNull(run.getBattle(), "the battle node starts a fight");
        run.getBattle().setPhase(BattlePhase.LOST);
        service.continueRun(run.getToken(), null);

        assertEquals(RunStatus.LOST, run.getStatus());
        assertEquals(1, saved.size(), "the run is recorded once");
        Map<String, Object> doc = saved.getFirst();
        assertEquals("u-1", doc.get("userId"));
        assertEquals("LOSS", doc.get("result"));
        assertEquals("Squire Bob", doc.get("knightName"));
        assertEquals(2, doc.get("floorReached"));
        assertEquals(2, ((List<?>) doc.get("map")).size());

        List<Map<String, Object>> stops = list(doc.get("stops"));
        assertEquals(2, stops.size());

        Map<String, Object> rest = stops.get(0);
        assertEquals("REST", rest.get("type"));
        assertEquals(1, rest.get("floor"));
        int hpBefore = hpOf(list(rest.get("partyBefore")), "Sprout");
        int hpAfter = hpOf(list(rest.get("partyAfter")), "Sprout");
        assertEquals(20, hpBefore);
        assertTrue(hpAfter > hpBefore, "resting shows up as HP gained across the stop");
        Map<String, Object> choice = list(rest.get("events")).getFirst();
        assertEquals("choice", choice.get("k"));
        assertEquals("REST", ((Map<?, ?>) choice.get("pick")).get("kind"));
        assertTrue(String.valueOf(choice.get("outcome")).startsWith("The party rests"));
        assertTrue(list(rest.get("offers")).stream().anyMatch(o -> Boolean.TRUE.equals(o.get("taken"))),
                "the offer list marks what was taken");

        Map<String, Object> fight = stops.get(1);
        assertEquals("BATTLE", fight.get("type"));
        Map<String, Object> battle = list(fight.get("events")).stream()
                .filter(e -> "battle".equals(e.get("k"))).findFirst().orElseThrow();
        assertEquals("LOSS", battle.get("result"));
        assertFalse(list(battle.get("foes")).isEmpty(), "the enemy warband is named");
        assertTrue(list(battle.get("allies")).stream().anyMatch(a -> "Sprout".equals(a.get("name"))));
        assertTrue(fight.containsKey("goldAfter"), "the last stop is closed when the run ends");

        // A second end-of-run pass (e.g. the rewards retry) does not record again.
        service.continueRun(run.getToken(), null);
        assertEquals(1, saved.size());
    }

    @Test
    void guestRunsAreNotRecorded() throws Exception {
        SiegeRun run = runWithRestThenBattle("");
        registerRun(run);
        service.enterNode(run.getToken(), 0);
        service.campLeave(run.getToken());
        service.enterNode(run.getToken(), 1);
        run.getBattle().setPhase(BattlePhase.LOST);
        service.continueRun(run.getToken(), null);

        assertEquals(RunStatus.LOST, run.getStatus());
        assertTrue(saved.isEmpty());
    }

    @Test
    void eventChoiceKeepsTheChoicesNotTaken() throws Exception {
        SiegeRun run = runWithRestThenBattle("u-1");
        registerRun(run);
        SiegeNode node = run.getMap().getFirst();
        run.setCurrentNodeId(node.getId());
        run.getJournal().open(run, node);
        run.setInEvent(true);
        run.getEventOptions().add(CampOption.event("e0", "GOLD", "Take the purse", "Coins glint.", 0, 12));
        run.getEventOptions().add(CampOption.event("e1", "LEAVE", "Walk on", "Nothing stirs.", 0, 0));

        service.eventChoose(run.getToken(), "e0");

        Map<String, Object> event = list(run.getJournal().stops().getFirst().get("events")).getFirst();
        assertEquals("event", event.get("k"));
        assertEquals("Take the purse", ((Map<?, ?>) event.get("pick")).get("title"));
        assertEquals(List.of("Take the purse", "Walk on"), event.get("choices"));
        assertTrue(String.valueOf(event.get("outcome")).contains("gold"));
    }

    @Test
    void journalRidesInTheCheckpoint() throws Exception {
        SiegeRun run = runWithRestThenBattle("u-1");
        run.getJournal().open(run, run.getMap().getFirst());
        Method snapshot = SiegeService.class.getDeclaredMethod("snapshotRun", SiegeRun.class);
        snapshot.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> snap = (Map<String, Object>) snapshot.invoke(service, run);
        assertEquals(1, ((List<?>) snap.get("journal")).size());

        SiegeRunJournal restored = new SiegeRunJournal();
        restored.restore(snap.get("journal"));
        assertEquals("REST", restored.stops().getFirst().get("type"));
    }

    private SiegeRun runWithRestThenBattle(String ownerId) {
        SiegeRun run = new SiegeRun("history-" + ownerId + System.nanoTime());
        run.setOwnerId(ownerId);
        run.setKnightId("squire-bob");
        run.setKnightName("Squire Bob");
        Combatant knight = new Combatant("knight", "Squire Bob", Element.FIRE, Side.PLAYER, 40, 5, null, true);
        run.setKnightUnit(knight);
        Combatant ally = new Combatant("ally-0", "Sprout", Element.EARTH, Side.PLAYER, 60, 6, null);
        ally.setSourceCardId("sproutling");
        ally.setPosition(0);
        run.getParty().add(ally);
        run.setGold(10);
        SiegeNode rest = new SiegeNode(0, 0, 1, NodeType.REST, "Camp");
        SiegeNode fight = new SiegeNode(1, 1, 1, NodeType.BATTLE, "Battle");
        rest.getNext().add(1);
        run.getMap().add(rest);
        run.getMap().add(fight);
        return run;
    }

    private static int hpOf(List<Map<String, Object>> party, String name) {
        return party.stream().filter(m -> name.equals(m.get("name")))
                .map(m -> ((Number) m.get("hp")).intValue()).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Object raw) {
        return (List<Map<String, Object>>) raw;
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
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }

    private static Object getField(Object target, String name) throws Exception {
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        return f.get(target);
    }
}
