package com.sieglings.adventure;

import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A notch swap is telegraphed before it happens: the client spins both units
 * from the moment the move starts and stops when they land, which it can only
 * do if a wind-up event arrives BEFORE the positions change.
 */
@SpringBootTest
class SiegeSwapWindupTest {

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

    @Test
    void aSwapWindsUpBeforeThePositionsChange() {
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        List<String> warband = SiegeStarterTestSupport.starterIds(
                content, knight, content.selectableSieglings().getFirst());
        String token = (String) siegeService.newRun(null, knight.getId(), warband, "STANDARD").get("token");
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        siegeService.enterNode(token, run.reachableNodeIds().stream().findFirst().orElseThrow());
        SiegeBattle battle = run.getBattle();
        assertNotNull(battle, "row 0 is a battle node");

        List<Combatant> allies = battle.living(Side.PLAYER);
        if (allies.size() < 2) return; // a solo warband has nobody to trade notches with
        Combatant mover = allies.get(0), partner = allies.get(1);
        int moverAt = mover.getPosition(), partnerAt = partner.getPosition();

        // Deal the mover a swap card so the move is guaranteed to be in hand.
        AbilitySpec swap = new AbilitySpec("test-swap", "Move Link", Element.NEUTRAL,
                Effect.SWAP, 0, TargetKind.ALLY_SINGLE, 0, "Trade notches with an ally.");
        SiegeCard card = new SiegeCard("swap-card-1", mover.getId(), swap);
        battle.getHand().add(card);

        Map<String, Object> after = siegeService.playCard(token, card.getInstanceId(), partner.getId());

        List<String> types = events(after).stream().map(e -> String.valueOf(e.get("type"))).toList();
        int windup = types.lastIndexOf("swapStart");
        int landed = types.lastIndexOf("swap");
        assertTrue(windup >= 0, "the swap must be telegraphed with a swapStart event: " + types);
        assertTrue(windup < landed, "the wind-up must arrive before the swap lands: " + types);

        Map<String, Object> start = events(after).get(windup);
        assertEquals(mover.getId(), start.get("aId"), "the wind-up names the mover");
        assertEquals(partner.getId(), start.get("bId"), "the wind-up names its partner");
        assertEquals(partnerAt, mover.getPosition(), "the mover ends on its partner's notch");
        assertEquals(moverAt, partner.getPosition(), "the partner ends on the mover's notch");
    }
}
