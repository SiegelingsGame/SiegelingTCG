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
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Standalone Broker nodes sell permanent recruits when the warband has room
 * (plus one mercenary rental). Serialization must not hard-code the stall as
 * merc-only, or the client labels permanent hires as temporary rentals.
 */
@SpringBootTest
class SiegeBrokerSerializeTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private String starterKnightId;
    private List<String> starterWarband;

    @BeforeEach
    void setUp() {
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        SieglingCard siegling = content.selectableSieglings().getFirst();
        starterKnightId = knight.getId();
        starterWarband = SiegeStarterTestSupport.starterIds(content, knight, siegling);
    }

    @Test
    void openBrokerWithRoomSerializesHireOffersNotMercOnlyStall() throws Exception {
        Map<String, Object> started = siegeService.newRun(
                null, starterKnightId, starterWarband, "STANDARD");
        String token = (String) started.get("token");
        assertNotNull(token);

        SiegeRun run = siegeService.lookup(token).orElseThrow();
        assertTrue(run.getParty().size() < content.partyMax());

        invokeOpenBroker(run);
        Map<String, Object> state = siegeService.state(token);

        @SuppressWarnings("unchecked")
        Map<String, Object> broker = (Map<String, Object>) state.get("broker");
        assertNotNull(broker);
        assertEquals(Boolean.FALSE, broker.get("merc"), "stall with open slots is not merc-only");
        assertEquals(Boolean.FALSE, broker.get("partyFull"));
        assertEquals(45, ((Number) broker.get("hireCost")).intValue());
        assertEquals(25, ((Number) broker.get("swapCost")).intValue());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> offers = (List<Map<String, Object>>) broker.get("offers");
        assertNotNull(offers);
        assertFalse(offers.isEmpty());

        long permanent = offers.stream().filter(o -> "BROKER".equals(o.get("kind"))).count();
        long mercs = offers.stream().filter(o -> "MERC".equals(o.get("kind"))).count();
        assertTrue(permanent >= 1, "expected permanent recruit offers, got " + offers);
        assertEquals(1, mercs, "open stalls always include one merc alternative");

        for (Map<String, Object> offer : offers) {
            assertNotNull(offer.get("kind"));
            assertNotNull(offer.get("cost"));
            assertEquals("MERC".equals(offer.get("kind")), offer.get("merc"));
            if ("BROKER".equals(offer.get("kind"))) {
                assertEquals(45, ((Number) offer.get("cost")).intValue());
            } else {
                assertEquals(55, ((Number) offer.get("cost")).intValue());
            }
        }
    }

    @Test
    void openBrokerWhenFullSerializesMercOnlyStall() throws Exception {
        Map<String, Object> started = siegeService.newRun(
                null, starterKnightId, starterWarband, "STANDARD");
        String token = (String) started.get("token");
        SiegeRun run = siegeService.lookup(token).orElseThrow();

        // Fill the warband to party max so the stall is rental-only.
        List<SieglingCard> fillers = content.selectableSieglings().stream()
                .filter(s -> !starterWarband.contains(s.getId()))
                .toList();
        int fillerIdx = 0;
        while (run.getParty().size() < content.partyMax()) {
            SieglingCard recruit = fillers.get(fillerIdx % Math.max(1, fillers.size()));
            fillerIdx++;
            Combatant member = content.toPartyCombatant(recruit, run.getParty().size());
            member.setPosition(run.getParty().size());
            run.getParty().add(member);
        }

        invokeOpenBroker(run);
        Map<String, Object> state = siegeService.state(token);

        @SuppressWarnings("unchecked")
        Map<String, Object> broker = (Map<String, Object>) state.get("broker");
        assertNotNull(broker);
        assertEquals(Boolean.TRUE, broker.get("merc"));
        assertEquals(Boolean.TRUE, broker.get("partyFull"));
        assertEquals(55, ((Number) broker.get("hireCost")).intValue());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> offers = (List<Map<String, Object>>) broker.get("offers");
        assertFalse(offers.isEmpty());
        assertTrue(offers.stream().allMatch(o -> "MERC".equals(o.get("kind"))));
    }

    private void invokeOpenBroker(SiegeRun run) throws Exception {
        Method method = SiegeService.class.getDeclaredMethod("openBroker", SiegeRun.class);
        method.setAccessible(true);
        method.invoke(siegeService, run);
    }
}
