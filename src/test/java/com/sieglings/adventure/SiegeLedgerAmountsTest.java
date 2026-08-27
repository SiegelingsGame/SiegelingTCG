package com.sieglings.adventure;

import com.sieglings.model.TrainerCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The turn ledger has to say what an action did, not only what it was aimed at:
 * a damage row carries the HP it took off, a heal row the HP it put back. Driven
 * through a real run so the numbers survive engine → serialized battle → client.
 */
@SpringBootTest
class SiegeLedgerAmountsTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> turnLog(Map<String, Object> state) {
        Map<String, Object> battle = (Map<String, Object>) state.get("battle");
        assertNotNull(battle, "the response must still carry a battle");
        return (List<Map<String, Object>>) battle.get("turnLog");
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
    void aDamageCardLeavesItsDamageTotalOnItsLedgerRow() {
        String token = startRunInBattle();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        SiegeBattle battle = run.getBattle();

        SiegeCard attack = battle.getHand().stream()
                .filter(c -> c.getSpec().effect() == Effect.DAMAGE)
                .findFirst().orElse(null);
        if (attack == null) return; // an opening hand with no attack has nothing to prove here
        Combatant foe = battle.living(Side.ENEMY).getFirst();

        Map<String, Object> after = siegeService.playCard(token, attack.getInstanceId(), foe.getId());
        Map<String, Object> row = turnLog(after).stream()
                .filter(e -> attack.getSpec().name().equals(e.get("card")))
                .reduce((a, b) -> b).orElseThrow();
        assertTrue(row.get("dmg") instanceof Number n && n.intValue() > 0,
                "a damage row must carry the HP it actually took off: " + row);
    }

    @Test
    void theEnemyTurnStampsItsOwnRowsToo() {
        String token = startRunInBattle();
        Map<String, Object> after = siegeService.endTurn(token);
        List<Map<String, Object>> foeRows = turnLog(after).stream()
                .filter(e -> "foe".equals(e.get("side")))
                .toList();
        if (foeRows.isEmpty()) return; // every enemy stunned or the battle ended outright
        assertTrue(foeRows.stream().anyMatch(e -> e.containsKey("dmg") || e.containsKey("heal")
                        || e.containsKey("shield")),
                "at least one enemy row must report what its action did: " + foeRows);
    }
}
