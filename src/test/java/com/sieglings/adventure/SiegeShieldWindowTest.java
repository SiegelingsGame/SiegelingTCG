package com.sieglings.adventure;

import com.sieglings.model.TrainerCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A shield is a temporary effect on the battle table — the end of the battle
 * phase wipes it — so a Siege shield holds only until the shielded side opens
 * its next turn. This drives a real run to prove the lapse survives the whole
 * stack: engine → serialized battle → the {@code shieldExpired} event the client
 * plays back.
 */
@SpringBootTest
class SiegeShieldWindowTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> events(Map<String, Object> state) {
        Map<String, Object> battle = (Map<String, Object>) state.get("battle");
        assertNotNull(battle, "the response must still carry a battle");
        return (List<Map<String, Object>>) battle.get("events");
    }

    private String startRunInBattle() {
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        List<String> warband = SiegeStarterTestSupport.starterIds(
                content, knight, content.selectableSieglings().getFirst());
        String token = (String) siegeService.newRun(null, knight.getId(), warband, "STANDARD").get("token");
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        siegeService.enterNode(token, run.reachableNodeIds().stream().findFirst().orElseThrow());
        assertNotNull(run.getBattle(), "row 0 is a battle node");
        return token;
    }

    @Test
    void aShieldRaisedThisTurnIsGoneWhenTheNextTurnOpens() {
        String token = startRunInBattle();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        SiegeBattle battle = run.getBattle();

        Combatant ally = battle.living(Side.PLAYER).stream().filter(c -> !c.isKnight()).findFirst().orElseThrow();
        int round = battle.getRoundNumber();
        ally.addShield(11, round + 1);
        assertEquals(11, ally.getShield());

        // Ending the turn runs the enemy, then opens the party's next turn — the
        // moment the shield is meant to lapse.
        Map<String, Object> after = siegeService.endTurn(token);
        assertEquals(0, ally.getShield(), "the shield must not survive into the next turn");
        assertTrue(events(after).stream().anyMatch(e -> "shieldExpired".equals(e.get("type"))),
                "the client needs a shieldExpired event to show the shield going away");
    }

    @Test
    void aShieldRaisedForALaterTurnSurvivesTheTurnItWasCastOn() {
        String token = startRunInBattle();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        SiegeBattle battle = run.getBattle();

        Combatant ally = battle.living(Side.PLAYER).stream().filter(c -> !c.isKnight()).findFirst().orElseThrow();
        // Two turns out: cast now, still standing after one turn boundary.
        ally.addShield(11, battle.getRoundNumber() + 2);
        siegeService.endTurn(token);

        if (battle.isOver()) return; // a one-round wipe has nothing left to check
        assertEquals(11, ally.getShield(), "a shield with a later expiry must not lapse early");
    }
}
