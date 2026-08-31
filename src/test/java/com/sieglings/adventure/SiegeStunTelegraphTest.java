package com.sieglings.adventure;

import com.sieglings.model.TrainerCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A stunned foe skips its action, so the notch it was aiming at is not under
 * threat. The battle payload has to say so, or the client draws a target ring
 * under a Siegeling nothing is going to hit.
 */
@SpringBootTest
class SiegeStunTelegraphTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private String startRun() {
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        List<String> warband = SiegeStarterTestSupport.starterIds(
                content, knight, content.selectableSieglings().getFirst());
        return (String) siegeService.newRun(null, knight.getId(), warband, "STANDARD").get("token");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> battleOf(Map<String, Object> state) {
        return (Map<String, Object>) state.get("battle");
    }

    @SuppressWarnings("unchecked")
    private List<Integer> targeted(Map<String, Object> battle) {
        return (List<Integer>) battle.get("targetedPositions");
    }

    @Test
    @SuppressWarnings("unchecked")
    void aStunnedFoeStopsThreateningTheNotchItAimedAt() {
        String token = startRun();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        int firstNode = run.reachableNodeIds().stream().findFirst().orElseThrow();
        Map<String, Object> battle = battleOf(siegeService.enterNode(token, firstNode));
        assertNotNull(battle, "entering a battle node starts a battle");

        SiegeBattle live = siegeService.lookup(token).orElseThrow().getBattle();
        // Only a foe telegraphing a swing can lose one to a stun; a squad that
        // happens to open on heals/shields has nothing to prove here.
        List<Combatant> swinging = live.living(Side.ENEMY).stream()
                .filter(f -> f.getIntent() != null && f.getIntent().effect() == Effect.DAMAGE)
                .toList();
        if (swinging.isEmpty()) return;
        assertFalse(targeted(battle).isEmpty() && !Boolean.TRUE.equals(battle.get("sweepIncoming")),
                "a telegraphed swing marks its notch before the stun");

        for (Combatant foe : live.living(Side.ENEMY)) foe.applyStatus(StatusKind.STUN, 1);
        Map<String, Object> after = battleOf(siegeService.state(token));
        assertTrue(targeted(after).isEmpty(), "a stunned squad threatens no notch");
        assertFalse(Boolean.TRUE.equals(after.get("sweepIncoming")), "and telegraphs no sweep");

        // The chip the client reads to write "Stunned" on the plate is still served.
        for (Map<String, Object> foe : (List<Map<String, Object>>) after.get("enemies")) {
            if (Boolean.TRUE.equals(foe.get("alive"))) {
                assertTrue(((List<String>) foe.get("statuses")).contains("STUN"),
                        "the foe still reports its STUN chip");
            }
        }
    }
}
