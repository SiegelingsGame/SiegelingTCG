package com.sieglings.adventure;

import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The run's opening fight is a fixed yardstick: the same difficulty for every
 * warband, whatever its size. Only from the second fight on do encounters scale
 * off warband size and depth again.
 */
@SpringBootTest
class SiegeOpeningFightTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    /** An encounter's difficulty as a comparable tuple — element and name are flavour. */
    private record Shape(int foes, int totalHp, int topDamage, int speed, int abilities) { }

    private static final Shape PINNED = new Shape(
            SiegeTuning.OPENING_FIGHT_FOES,
            SiegeTuning.OPENING_FIGHT_FOES * SiegeTuning.OPENING_FIGHT_HP,
            SiegeTuning.OPENING_FIGHT_DAMAGE,
            SiegeTuning.OPENING_FIGHT_SPEED,
            1);

    private Shape shapeOf(List<Combatant> enemies) {
        return new Shape(
                enemies.size(),
                enemies.stream().mapToInt(Combatant::getMaxHp).sum(),
                enemies.stream().flatMap(e -> e.getAbilities().stream())
                        .mapToInt(AbilitySpec::value).max().orElse(0),
                enemies.stream().mapToInt(Combatant::getSpeed).max().orElse(0),
                enemies.stream().mapToInt(e -> e.getAbilities().size()).max().orElse(0));
    }

    private String startRun() {
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        List<String> warband = SiegeStarterTestSupport.starterIds(
                content, knight, content.selectableSieglings().getFirst());
        return (String) siegeService.newRun(null, knight.getId(), warband, "STANDARD").get("token");
    }

    private List<Combatant> enterFirstBattle(String token) {
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        int firstNode = run.reachableNodeIds().stream().findFirst().orElseThrow();
        assertEquals(NodeType.BATTLE, run.nodeById(firstNode).getType(), "row 0 is always a battle");
        siegeService.enterNode(token, firstNode);
        SiegeBattle battle = run.getBattle();
        assertNotNull(battle, "entering a battle node starts a battle");
        return battle.getCombatants().stream().filter(c -> c.getSide() == Side.ENEMY).toList();
    }

    @Test
    void aRunsFirstBattleUsesTheFixedOpener() {
        assertEquals(PINNED, shapeOf(enterFirstBattle(startRun())));
    }

    /** The whole point: the opener never rolls easier or harder from run to run. */
    @Test
    void repeatedRunsOpenOnAnIdenticalFight() {
        Set<Shape> shapes = new LinkedHashSet<>();
        for (int i = 0; i < 8; i++) shapes.add(shapeOf(enterFirstBattle(startRun())));
        assertEquals(Set.of(PINNED), shapes, "every run must open on the same difficulty");
    }

    /**
     * Party size must not move the opener. The free starter knight fixes the legal
     * warband size, so the second run is trimmed to a single Siegeling before the
     * fight is generated — the difference {@code generateEnemies} would react to.
     */
    @Test
    void warbandSizeDoesNotChangeTheOpener() {
        String big = startRun();
        Shape asStarted = shapeOf(enterFirstBattle(big));

        String small = startRun();
        SiegeRun trimmed = siegeService.lookup(small).orElseThrow();
        while (trimmed.getParty().size() > 1) trimmed.getParty().removeLast();
        Shape asSolo = shapeOf(enterFirstBattle(small));

        assertEquals(asStarted, asSolo, "the opening fight must ignore warband size");
        assertEquals(PINNED, asSolo);
    }

    /**
     * After the opener the curve resumes: the same node, entered once a fight has
     * been won, produces scaled — and therefore varying — encounters.
     */
    @Test
    void laterFightsScaleAgain() {
        Set<Shape> shapes = new LinkedHashSet<>();
        for (int i = 0; i < 12; i++) {
            String token = startRun();
            // Pretend the opener is already behind us, then walk into a battle node.
            siegeService.lookup(token).orElseThrow().setEnemiesDefeated(1);
            shapes.add(shapeOf(enterFirstBattle(token)));
        }
        assertTrue(shapes.size() > 1 || !shapes.contains(PINNED),
                "post-opener fights must come from the scaling calculation, got " + shapes);
    }

    /** Warband size still drives difficulty for the scaled (non-opening) fights. */
    @Test
    void theScalingCalculationStillGrowsWithWarbandSize() {
        List<Element> palette = content.defaultPalette();
        int soloHp = content.generateEnemies(NodeType.BATTLE, 3, 1, 0, new Random(7), palette)
                .stream().mapToInt(Combatant::getMaxHp).sum();
        int trioHp = content.generateEnemies(NodeType.BATTLE, 3, 3, 0, new Random(7), palette)
                .stream().mapToInt(Combatant::getMaxHp).sum();
        assertTrue(trioHp > soloHp, "bigger warbands still meet stronger foes (" + soloHp + " -> " + trioHp + ")");
    }

    /** Elites and bosses are never pinned — only the run's opening battle is. */
    @Test
    void onlyTheOpeningBattleIsPinned() {
        List<Element> palette = content.defaultPalette();
        Shape elite = shapeOf(content.generateEnemies(NodeType.ELITE, 1, 1, 0, new Random(3), palette));
        Shape boss = shapeOf(content.generateEnemies(NodeType.BOSS, 1, 1, 0, new Random(3), palette));
        assertTrue(elite.totalHp() > PINNED.totalHp(), "elites stay above the opener, got " + elite);
        assertTrue(boss.totalHp() > PINNED.totalHp(), "bosses stay above the opener, got " + boss);
    }
}
