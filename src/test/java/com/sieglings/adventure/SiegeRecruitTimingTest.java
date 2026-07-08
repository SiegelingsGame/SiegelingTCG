package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

@SpringBootTest
class SiegeRecruitTimingTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private String starterKnightId;
    private String starterSieglingId;

    @BeforeEach
    void setUp() {
        TrainerCard knight = content.selectableKnights().stream()
                .filter(k -> "squire-bob".equalsIgnoreCase(k.getId()))
                .findFirst()
                .orElseGet(() -> content.selectableKnights().getFirst());
        SieglingCard siegling = content.selectableSieglings().getFirst();
        starterKnightId = knight.getId();
        starterSieglingId = siegling.getId();
    }

    @Test
    void newRunStartsWithOneSiegelingAndNoJoinReveal() {
        Map<String, Object> run = siegeService.newRun(null, starterKnightId, List.of(starterSieglingId), "STANDARD");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> party = (List<Map<String, Object>>) run.get("party");
        assertEquals(1, party.size());
        assertNull(run.get("recruit"));
    }

    @Test
    void wildRecruitDoesNotFireBeforeFirstCombat() throws Exception {
        SiegeRun run = new SiegeRun("recruit-timing");
        run.getParty().add(new Combatant("ally-0", "Sprout", Element.EARTH, Side.PLAYER, 40, 6, null));

        invokeJoinStagedRecruit(run, " emerges from the battlefield and joins the warband!");

        assertEquals(1, run.getParty().size());
        assertNull(run.getPendingRecruit());
    }

    private void invokeJoinStagedRecruit(SiegeRun run, String flavor) throws Exception {
        Method method = SiegeService.class.getDeclaredMethod("joinStagedRecruit", SiegeRun.class, String.class);
        method.setAccessible(true);
        method.invoke(siegeService, run, flavor);
    }
}
