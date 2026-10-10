package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A full warband is never locked out of a recruit: brokers sell swaps, camps
 * offer a swap or a temporary ally, and a wanderer met on an event road can be
 * swapped in, brought along for one battle, or left for its parting gift.
 */
@SpringBootTest
class SiegeFullWarbandRecruitTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private String token;
    private SiegeRun run;
    private SieglingCard stranger;

    @BeforeEach
    void setUp() {
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        SieglingCard siegling = content.selectableSieglings().getFirst();
        List<String> warband = SiegeStarterTestSupport.starterIds(content, knight, siegling);
        token = (String) siegeService.newRun(null, knight.getId(), warband, "STANDARD").get("token");
        run = siegeService.lookup(token).orElseThrow();
        List<SieglingCard> fillers = content.selectableSieglings().stream()
                .filter(s -> !warband.contains(s.getId())).toList();
        int i = 0;
        while (run.getParty().size() < content.partyMax()) {
            Combatant member = content.toPartyCombatant(fillers.get(i++), run.getParty().size());
            member.setPosition(run.getParty().size());
            run.getParty().add(member);
        }
        List<String> names = run.getParty().stream().map(Combatant::getName).toList();
        stranger = content.selectableSieglings().stream()
                .filter(s -> !names.contains(s.getName())).findFirst().orElseThrow();
        run.setGold(0);
    }

    @Test
    void wandererSwapsInForFreeAndSpendsTheAllyOffer() throws Exception {
        openWanderer();
        Map<String, Object> state = siegeService.state(token);
        @SuppressWarnings("unchecked")
        Map<String, Object> broker = (Map<String, Object>) state.get("broker");
        assertEquals(Boolean.TRUE, broker.get("encounter"));
        assertEquals(0, ((Number) broker.get("swapCost")).intValue());

        Combatant leaving = run.getParty().get(0);
        String recruitOffer = optionId("BROKER");
        assertThrows(IllegalArgumentException.class, () -> siegeService.brokerHire(token, recruitOffer, null),
                "a full warband cannot add without a swap");
        siegeService.brokerHire(token, recruitOffer, leaving.getId());

        assertEquals(content.partyMax(), run.getParty().size());
        assertTrue(run.getParty().stream().anyMatch(m -> m.getName().equals(stranger.getName())));
        assertFalse(run.getParty().contains(leaving));
        assertTrue(run.getDeckTemplates().stream().noneMatch(c -> c.getOwnerId().equals(leaving.getId())));
        assertTrue(run.getBrokerOptions().stream().allMatch(o -> o.used), "the wanderer only goes one way");

        int items = run.getInventory().size();
        siegeService.brokerLeave(token);
        assertEquals(items, run.getInventory().size(), "no parting gift after taking the wanderer");
        assertFalse(run.isInBroker());
    }

    @Test
    void wandererCanFightOneBattleAsTemporaryAlly() throws Exception {
        openWanderer();
        siegeService.brokerHire(token, optionId("MERC"), null);
        assertNotNull(run.getMercenary());
        assertFalse(run.getMercCards().isEmpty());
        assertEquals(content.partyMax(), run.getParty().size());
        assertEquals(0, run.getGold());
    }

    @Test
    void walkingAwayFromWandererLeavesAGift() throws Exception {
        openWanderer();
        int items = run.getInventory().size();
        siegeService.brokerLeave(token);
        assertEquals(items + 1, run.getInventory().size());
        assertNull(run.getMercenary());
    }

    @Test
    void campSwapReplacesTheChosenMember() {
        run.setInCamp(true);
        run.getCampOptions().clear();
        run.getCampOptions().add(CampOption.brokerSwap("c9", stranger.getName(), stranger.getElement(),
                stranger.getCardArtUrl(), stranger.getId(), 25));
        run.setGold(25);
        assertThrows(IllegalArgumentException.class, () -> siegeService.campChoose(token, "c9", null),
                "the leaver must be named");
        assertEquals(25, run.getGold());

        Combatant leaving = run.getParty().get(1);
        siegeService.campChoose(token, "c9", leaving.getId());
        assertEquals(0, run.getGold());
        assertFalse(run.getParty().contains(leaving));
        assertTrue(run.getParty().stream().anyMatch(m -> m.getName().equals(stranger.getName())));
        assertEquals(content.partyMax(), run.getParty().size());
    }

    private void openWanderer() throws Exception {
        Method m = SiegeService.class.getDeclaredMethod("openWandererEncounter", SiegeRun.class, SieglingCard.class);
        m.setAccessible(true);
        m.invoke(siegeService, run, stranger);
    }

    private String optionId(String kind) {
        return run.getBrokerOptions().stream().filter(o -> kind.equals(o.kind)).findFirst().orElseThrow().id;
    }
}
