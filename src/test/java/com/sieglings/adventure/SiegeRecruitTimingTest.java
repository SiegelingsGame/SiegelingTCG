package com.sieglings.adventure;

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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

@SpringBootTest
class SiegeRecruitTimingTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private TrainerCard starterKnight;
    private List<String> starterSieglingIds;

    @BeforeEach
    void setUp() {
        starterKnight = SiegeStarterTestSupport.starterKnight(content);
        starterSieglingIds = SiegeStarterTestSupport.starterIds(
                content, starterKnight, content.selectableSieglings().getFirst());
    }

    @Test
    void newRunStartsWithTheKnightsMusterAndNoJoinReveal() {
        Map<String, Object> run = siegeService.newRun(null, starterKnight.getId(), starterSieglingIds, "STANDARD");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> party = (List<Map<String, Object>>) run.get("party");
        assertEquals(content.startingPartySize(starterKnight), party.size());
        assertNull(run.get("recruit"));
    }

    @Test
    void wildRecruitDoesNotFireBeforeFirstCombat() throws Exception {
        SiegeRun run = new SiegeRun("recruit-timing");
        run.getParty().add(new Combatant("ally-0", "Sprout", Element.EARTH, Side.PLAYER, 40, 6, null));

        invokeJoinStagedRecruit(run, " emerges from the battlefield and joins the warband!", false);

        assertEquals(1, run.getParty().size());
        assertNull(run.getPendingRecruit());
    }

    @Test
    void postCombatRecruitCanFireAfterFirstVictory() throws Exception {
        SiegeRun run = new SiegeRun("recruit-timing");
        run.getParty().add(new Combatant("ally-0", "Sprout", Element.EARTH, Side.PLAYER, 40, 6, null));
        run.setEnemiesDefeated(1);
        run.getPendingRewards().add(RewardOption.card(
                "r0", "Spark", "A new move", Element.FIRE,
                new AbilitySpec("spark", "Spark", Element.FIRE, Effect.DAMAGE, 4,
                        TargetKind.ENEMY_SINGLE, 1, "Deal 4 damage.", null, 0),
                "ally-0"));

        invokeJoinStagedRecruit(run, " emerges from the battlefield and joins the warband!", true);

        assertEquals(2, run.getParty().size());
        assertNotNull(run.getPendingRecruit());
        assertEquals(1, run.getPendingRewards().size());
    }

    private void invokeJoinStagedRecruit(SiegeRun run, String flavor, boolean afterCombat) throws Exception {
        Method method = SiegeService.class.getDeclaredMethod(
                "joinStagedRecruit", SiegeRun.class, String.class, boolean.class);
        method.setAccessible(true);
        method.invoke(siegeService, run, flavor, afterCombat);
    }

    private void invokeJoinStagedRecruit(SiegeRun run, String flavor) throws Exception {
        invokeJoinStagedRecruit(run, flavor, false);
    }
}
