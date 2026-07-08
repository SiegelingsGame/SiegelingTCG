package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.lang.reflect.Method;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Guards the sprite-scaling fix: a Siegeling recruited at stage 2/3 must serialize a
 * matching {@code evoStage} (1/2) so the battle client grows its sprite, and an in-battle
 * evolution of a stage-1 unit must reach evoStage 1 without double-counting.
 */
@SpringBootTest
class SiegeRecruitScaleTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    @Test
    void stage2RecruitSerializesEvoStageOne() throws Exception {
        SieglingCard stage2 = content.evolutionOf(baseWithEvolution().getId()).orElseThrow();
        assertEquals(2, content.stageOf(stage2));
        Combatant c = content.toPartyCombatant(stage2, 0);
        assertEquals(1, evoStageOf(c), "stage-2 recruit should render one evolution taller");
    }

    @Test
    void stage3RecruitSerializesEvoStageTwo() throws Exception {
        SieglingCard base = content.selectableSieglings().stream()
                .filter(s -> content.hasStage3EvolutionChain(s.getId()))
                .findFirst()
                .orElseThrow();
        SieglingCard stage2 = content.evolutionOf(base.getId()).orElseThrow();
        SieglingCard stage3 = content.evolutionOf(stage2.getId()).orElseThrow();
        assertEquals(3, content.stageOf(stage3));
        Combatant c = content.toPartyCombatant(stage3, 0);
        assertEquals(2, evoStageOf(c), "stage-3 recruit should render two evolutions taller");
    }

    @Test
    void stageOneUnitBattleEvolvesToEvoStageOne() throws Exception {
        SieglingCard base = baseWithEvolution();
        SieglingCard stage2 = content.evolutionOf(base.getId()).orElseThrow();
        Combatant member = content.toPartyCombatant(base, 0);
        assertEquals(0, evoStageOf(member), "a stage-1 unit must stay at evoStage 0 before evolving");

        Combatant evolved = content.evolve(member, stage2);
        evolved.setEvolvedFrom(member);
        assertEquals(1, evoStageOf(evolved),
                "one in-battle evolution should reach evoStage 1 (no double-count with the evolvedFrom chain)");
    }

    private SieglingCard baseWithEvolution() {
        return content.selectableSieglings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isPresent())
                .findFirst()
                .orElseThrow();
    }

    /** Reflectively serializes the combatant and reads the {@code evoStage} the client scales by. */
    @SuppressWarnings("unchecked")
    private int evoStageOf(Combatant c) throws Exception {
        Method m = SiegeService.class.getDeclaredMethod("serializeCombatant", Combatant.class, boolean.class);
        m.setAccessible(true);
        Map<String, Object> serialized = (Map<String, Object>) m.invoke(siegeService, c, false);
        return ((Number) serialized.get("evoStage")).intValue();
    }
}
