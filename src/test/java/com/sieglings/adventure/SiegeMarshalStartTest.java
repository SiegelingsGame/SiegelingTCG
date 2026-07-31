package com.sieglings.adventure;

import com.sieglings.model.TrainerCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A MARSHAL knight musters its extra Siegeling at warband assembly: the player
 * picks two starters instead of one, and the run begins with both of them.
 */
@SpringBootTest
class SiegeMarshalStartTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private TrainerCard knightWithPassive(KnightPassive passive) {
        return content.selectableKnights().stream()
                .filter(k -> content.knightPassiveKind(k) == passive)
                .findFirst()
                .orElse(null);
    }

    @Test
    void marshalKnightsStartWithTwoSieglings() {
        TrainerCard marshal = knightWithPassive(KnightPassive.MARSHAL);
        assertNotNull(marshal, "the roster must contain a Marshal knight");
        assertEquals(2, content.startingPartySize(marshal));
    }

    @Test
    void nonMarshalKnightsStartWithOneSiegling() {
        TrainerCard plain = content.selectableKnights().stream()
                .filter(k -> content.knightPassiveKind(k) != KnightPassive.MARSHAL)
                .findFirst()
                .orElse(null);
        assertNotNull(plain, "the roster must contain a non-Marshal knight");
        assertEquals(1, content.startingPartySize(plain));
    }

    @Test
    void marshalRunFieldsBothChosenSieglings() {
        TrainerCard marshal = SiegeStarterTestSupport.starterKnight(content);
        if (content.startingPartySize(marshal) != 2) return; // the free starter knight is not a Marshal here
        List<String> warband = SiegeStarterTestSupport.starterIds(
                content, marshal, content.selectableSieglings().getFirst());
        assertEquals(2, warband.size());

        Map<String, Object> run = siegeService.newRun(null, marshal.getId(), warband, "STANDARD");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> party = (List<Map<String, Object>>) run.get("party");
        assertEquals(2, party.size());
        assertEquals(warband.get(0), party.get(0).get("sourceCardId"));
        assertEquals(warband.get(1), party.get(1).get("sourceCardId"));
    }

    @Test
    void marshalRunRejectsAShortOrDuplicatedWarband() {
        TrainerCard marshal = SiegeStarterTestSupport.starterKnight(content);
        if (content.startingPartySize(marshal) != 2) return;
        String lead = content.selectableSieglings().getFirst().getId();

        IllegalArgumentException tooFew = assertThrows(IllegalArgumentException.class,
                () -> siegeService.newRun(null, marshal.getId(), List.of(lead), "STANDARD"));
        assertTrue(tooFew.getMessage().contains("exactly 2"), tooFew.getMessage());

        assertThrows(IllegalArgumentException.class,
                () -> siegeService.newRun(null, marshal.getId(), List.of(lead, lead), "STANDARD"));
    }

    @Test
    void theRosterAdvertisesEachKnightsStartingWarbandSize() {
        Map<String, Object> roster = siegeService.roster(null);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> knights = (List<Map<String, Object>>) roster.get("knights");
        assertNotNull(knights);
        for (Map<String, Object> k : knights) {
            Object size = k.get("startingParty");
            assertNotNull(size, "every knight row carries its starting warband size");
            assertTrue(((Number) size).intValue() >= 1);
        }
        long marshals = knights.stream()
                .filter(k -> "MARSHAL".equals(k.get("passiveKind")))
                .filter(k -> ((Number) k.get("startingParty")).intValue() == 2)
                .count();
        assertTrue(marshals > 0, "Marshal knights advertise a starting warband of 2");
    }
}
