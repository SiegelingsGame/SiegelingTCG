package com.sieglings.adventure;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.lang.reflect.Method;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class SiegeRiftTest {
    @Autowired SiegeService service;
    @Autowired SiegeContentService content;

    @Test
    void riftIsARareMapStopAndLabel() {
        assertTrue(Arrays.asList(NodeType.values()).contains(NodeType.RIFT));
        boolean saw = false;
        for (long seed = 1; seed <= 400; seed++) {
            List<SiegeNode> map = content.generateMap(new Random(seed));
            if (map.stream().anyMatch(n -> n.getType() == NodeType.RIFT)) {
                saw = true;
                assertTrue(map.stream().anyMatch(n -> n.getType() == NodeType.RIFT && "Rift".equals(n.getLabel())));
                break;
            }
        }
        assertTrue(saw, "Rifts should appear in ordinary map generation");
    }

    @Test
    void crossingARiftChangesLandWithoutABossKillAndIsDeterministic() throws Exception {
        SiegeRun run = newRun("STANDARD");
        String before = run.getLand().id();
        int bosses = run.getBossKills();
        int history = run.getLandHistory().size();

        SiegeNode rift = placeRift(run);
        run.setCurrentNodeId(rift.getId());
        invoke("openRift", new Class<?>[]{SiegeRun.class}, run);
        assertTrue(run.isInRift());
        assertTrue(run.reachableNodeIds().isEmpty());

        Map<?, ?> first = service.riftCross(run.getToken());
        assertFalse(run.isInRift());
        assertTrue(rift.isCleared());
        assertEquals(bosses, run.getBossKills(), "a Rift is not a boss");
        assertEquals(history + 1, run.getLandHistory().size());
        assertNotEquals(before, run.getLand().id());
        assertEquals(run.getLand().id(), ((Map<?, ?>) first.get("land")).get("id"));
        assertTrue(String.valueOf(first.get("lastReward")).contains(run.getLand().name()));

        // Replaying the same history seed must not reroll a different destination.
        String landed = run.getLand().id();
        run.setLand(SiegeLand.byId(before));
        run.getLandHistory().removeLast();
        rift.setCleared(false);
        run.setInRift(true);
        run.setCurrentNodeId(rift.getId());
        service.riftCross(run.getToken());
        assertEquals(landed, run.getLand().id());
    }

    @Test
    void passingARiftClearsTheStopWithoutChangingLand() throws Exception {
        SiegeRun run = newRun("STANDARD");
        String before = run.getLand().id();
        int history = run.getLandHistory().size();
        SiegeNode rift = placeRift(run);
        run.setCurrentNodeId(rift.getId());
        invoke("openRift", new Class<?>[]{SiegeRun.class}, run);
        assertTrue(run.isInRift());

        Map<?, ?> out = service.riftPass(run.getToken());
        assertFalse(run.isInRift());
        assertTrue(rift.isCleared());
        assertEquals(before, run.getLand().id());
        assertEquals(history, run.getLandHistory().size());
        assertEquals(before, ((Map<?, ?>) out.get("land")).get("id"));
        assertTrue(String.valueOf(out.get("lastReward")).contains("travel past"));
        assertTrue(String.valueOf(out.get("lastReward")).contains(run.getLand().name()));
        assertNull(out.get("rift"));
    }

    @Test
    void riftRethemesOnlyUnclearedNodesInTheCurrentSegment() throws Exception {
        SiegeRun run = newRun("STANDARD");
        SiegeNode rift = placeRift(run);
        // Clear an early node so theming must leave it alone.
        SiegeNode first = run.getMap().stream().filter(n -> n.getRow() == 0).findFirst().orElseThrow();
        first.setCleared(true);
        NodeType firstType = first.getType();
        String firstLabel = first.getLabel();

        run.setCurrentNodeId(rift.getId());
        invoke("openRift", new Class<?>[]{SiegeRun.class}, run);
        String before = run.getLand().id();
        service.riftCross(run.getToken());
        assertNotEquals(before, run.getLand().id());
        assertEquals(firstType, first.getType());
        assertEquals(firstLabel, first.getLabel());
        assertEquals(NodeType.BOSS, run.getMap().stream().filter(n -> n.getRow() % 8 == 7).findFirst().orElseThrow().getType());
        assertEquals(NodeType.REST, run.getMap().stream().filter(n -> n.getRow() % 8 == 6).findFirst().orElseThrow().getType());
    }

    private SiegeNode placeRift(SiegeRun run) {
        // Replace a mid-segment battle with a Rift so enter/cross can be exercised
        // without depending on the RNG that built this particular map.
        SiegeNode host = run.getMap().stream()
                .filter(n -> n.getRow() > 0 && n.getRow() % 8 < 6 && n.getType() == NodeType.BATTLE)
                .findFirst().orElseThrow();
        SiegeNode rift = new SiegeNode(host.getId(), host.getRow(), host.getCol(), NodeType.RIFT, "Rift");
        rift.getNext().addAll(host.getNext());
        int idx = run.getMap().indexOf(host);
        run.getMap().set(idx, rift);
        return rift;
    }

    private SiegeRun newRun(String mode) throws Exception {
        var knight = SiegeStarterTestSupport.starterKnight(content);
        var ids = SiegeStarterTestSupport.starterIds(content, knight, content.selectableSieglings().getFirst());
        var response = service.newRun(null, knight.getId(), ids, mode);
        return (SiegeRun) invoke("require", new Class<?>[]{String.class}, response.get("token"));
    }

    private Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        Method m = SiegeService.class.getDeclaredMethod(name, types);
        m.setAccessible(true);
        return m.invoke(service, args);
    }
}
