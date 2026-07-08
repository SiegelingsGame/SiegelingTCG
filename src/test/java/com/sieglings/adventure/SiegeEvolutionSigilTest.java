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
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class SiegeEvolutionSigilTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    @Autowired
    private SiegeCombatEngine engine;

    private String token;
    private String memberId;

    @BeforeEach
    void setUp() {
        TrainerCard knight = content.selectableKnights().getFirst();
        SieglingCard base = content.selectableSieglings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isPresent())
                .findFirst()
                .orElseGet(() -> content.selectableSiegelings().getFirst());
        Map<String, Object> run = siegeService.newRun(null, knight.getId(), List.of(base.getId()), "STANDARD");
        token = (String) run.get("token");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> party = (List<Map<String, Object>>) run.get("party");
        memberId = (String) party.getFirst().get("id");
    }

    @Test
    void evolutionSigilRequiresEvolutionPath() {
        Optional<SieglingCard> noEvo = content.selectableSiegelings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isEmpty())
                .findFirst();
        if (noEvo.isEmpty()) return;

        TrainerCard knight = content.selectableKnights().getFirst();
        Map<String, Object> run = siegeService.newRun(null, knight.getId(), List.of(noEvo.get().getId()), "STANDARD");
        String t = (String) run.get("token");
        @SuppressWarnings("unchecked")
        String id = ((List<Map<String, Object>>) run.get("party")).getFirst().get("id").toString();

        siegeService.lookup(t).ifPresent(r -> r.getInventory().add("evolution-sigil"));
        assertThrows(IllegalArgumentException.class,
                () -> siegeService.equipItem(t, "evolution-sigil", id));
    }

    @Test
    void evolution2SigilRequiresStage3Chain() {
        Optional<SieglingCard> noStage3 = content.selectableSiegelings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isPresent()
                        && !content.hasStage3EvolutionChain(s.getId()))
                .findFirst();
        if (noStage3.isEmpty()) return;

        TrainerCard knight = content.selectableKnights().getFirst();
        Map<String, Object> run = siegeService.newRun(null, knight.getId(), List.of(noStage3.get().getId()), "STANDARD");
        String t = (String) run.get("token");
        @SuppressWarnings("unchecked")
        String id = ((List<Map<String, Object>>) run.get("party")).getFirst().get("id").toString();

        siegeService.lookup(t).ifPresent(r -> r.getInventory().add("evolution-2-sigil"));
        assertThrows(IllegalArgumentException.class,
                () -> siegeService.equipItem(t, "evolution-2-sigil", id));
    }

    @Test
    void evolutionSigilEvolvesAtBattleStart() throws Exception {
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        run.getInventory().add("evolution-sigil");
        siegeService.equipItem(token, "evolution-sigil", memberId);

        Combatant ally = run.getParty().getFirst();
        String baseCardId = ally.getSourceCardId();
        SieglingCard next = content.evolutionOf(baseCardId).orElseThrow();

        invokeStartBattle(run, List.of(new Combatant("foe-0", "Raider", ally.getElement(), Side.ENEMY, 20, 4, null)));

        assertEquals(next.getId(), run.getParty().getFirst().getSourceCardId());
        assertNotEquals(baseCardId, run.getParty().getFirst().getSourceCardId());
        assertTrue(run.getBattle().getEvents().stream().anyMatch(e -> "evolve".equals(e.get("type"))));
    }

    private void invokeStartBattle(SiegeRun run, List<Combatant> enemies) throws Exception {
        Method m = SiegeCombatEngine.class.getDeclaredMethod(
                "startBattle", SiegeRun.class, NodeType.class, List.class, java.util.Random.class);
        m.setAccessible(true);
        m.invoke(engine, run, NodeType.BATTLE, enemies, new java.util.Random(42));
    }
}
