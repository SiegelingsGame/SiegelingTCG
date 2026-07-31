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
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        SieglingCard base = content.selectableSieglings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isPresent())
                .findFirst()
                .orElseGet(() -> content.selectableSieglings().getFirst());
        Map<String, Object> run = siegeService.newRun(
                null, knight.getId(), SiegeStarterTestSupport.starterIds(content, knight, base), "STANDARD");
        token = (String) run.get("token");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> party = (List<Map<String, Object>>) run.get("party");
        memberId = (String) party.getFirst().get("id");
    }

    @Test
    void evolutionSigilRequiresEvolutionPath() {
        Optional<SieglingCard> noEvo = content.selectableSieglings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isEmpty())
                .findFirst();
        if (noEvo.isEmpty()) return;

        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        Map<String, Object> run = siegeService.newRun(null, knight.getId(),
                SiegeStarterTestSupport.starterIds(content, knight, noEvo.get()), "STANDARD");
        String t = (String) run.get("token");
        @SuppressWarnings("unchecked")
        String id = ((List<Map<String, Object>>) run.get("party")).getFirst().get("id").toString();

        siegeService.lookup(t).ifPresent(r -> r.getInventory().add("evolution-sigil"));
        assertThrows(IllegalArgumentException.class,
                () -> siegeService.equipItem(t, "evolution-sigil", id));
    }

    @Test
    void evolution2SigilRequiresStage3Chain() {
        Optional<SieglingCard> noStage3 = content.selectableSieglings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isPresent()
                        && !content.hasStage3EvolutionChain(s.getId()))
                .findFirst();
        if (noStage3.isEmpty()) return;

        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        Map<String, Object> run = siegeService.newRun(null, knight.getId(),
                SiegeStarterTestSupport.starterIds(content, knight, noStage3.get()), "STANDARD");
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

    /**
     * A run resumed from a mid-battle checkpoint used to keep the evolved form
     * for good: the snapshot dropped the {@code evolvedFrom} link, so the
     * post-battle revert had no base form to walk back to.
     */
    @Test
    void evolutionRevertsAfterBattleEvenWhenTheRunWasResumed() throws Exception {
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        run.getInventory().add("evolution-sigil");
        siegeService.equipItem(token, "evolution-sigil", memberId);

        String baseCardId = run.getParty().getFirst().getSourceCardId();
        SieglingCard next = content.evolutionOf(baseCardId).orElseThrow();
        invokeStartBattle(run, List.of(
                new Combatant("foe-0", "Raider", run.getParty().getFirst().getElement(), Side.ENEMY, 20, 4, null)));
        assertEquals(next.getId(), run.getParty().getFirst().getSourceCardId());

        // Round-trip the live battle exactly the way a checkpoint resume does,
        // then rebuild the party from the restored combatants (SiegeService#resume).
        SiegeBattle restored = roundTripBattle(run.getBattle());
        Combatant restoredMember = restored.findCombatant(memberId);
        assertNotNull(restoredMember, "the evolved member survives the round trip");
        assertNotNull(restoredMember.getEvolvedFrom(), "the pre-evolution form survives the round trip");
        assertEquals("evolution-sigil", restoredMember.getItemId(), "the equipped sigil survives the round trip");
        run.setBattle(restored);
        run.getParty().clear();
        for (Combatant c : restored.getCombatants()) {
            if (c.getSide() == Side.PLAYER && !c.isKnight()) run.getParty().add(c);
            if (c.getSide() == Side.PLAYER && c.isKnight()) run.setKnightUnit(c);
        }

        // Win the fight: the party must come home in its base form.
        for (Combatant foe : restored.living(Side.ENEMY)) foe.setHp(0);
        invokeCheckEnd(run);

        assertEquals(BattlePhase.WON, restored.getPhase());
        assertEquals(baseCardId, run.getParty().getFirst().getSourceCardId(),
                "evolution is battle-scoped and must revert after the battle");
    }

    /**
     * Evolved forms copy level/XP without re-deriving max HP from base. A naive
     * restore that always calls {@code loadLeveling} would re-scale the already
     * elevated evolve pool and inflate HP after every mid-battle resume.
     */
    @Test
    void leveledEvolutionKeepsSnapshottedHpAcrossCheckpointRestore() throws Exception {
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        Combatant ally = run.getParty().getFirst();
        ally.addXp(SiegeTuning.xpForLevel(3));
        assertTrue(ally.getLevel() >= 3, "precondition: ally must be leveled before evolving");

        run.getInventory().add("evolution-sigil");
        siegeService.equipItem(token, "evolution-sigil", memberId);
        invokeStartBattle(run, List.of(
                new Combatant("foe-0", "Raider", ally.getElement(), Side.ENEMY, 20, 4, null)));

        Combatant evolved = run.getParty().getFirst();
        assertNotNull(evolved.getEvolvedFrom());
        int maxBefore = evolved.getMaxHp();
        int hpBefore = evolved.getHp();

        SiegeBattle restored = roundTripBattle(run.getBattle());
        Combatant restoredMember = restored.findCombatant(memberId);
        assertNotNull(restoredMember);
        assertEquals(maxBefore, restoredMember.getMaxHp(),
                "evolved max HP must not be re-scaled by loadLeveling on resume");
        assertEquals(hpBefore, restoredMember.getHp(),
                "evolved current HP must match the checkpoint");
    }

    @SuppressWarnings("unchecked")
    private SiegeBattle roundTripBattle(SiegeBattle battle) throws Exception {
        Method snap = SiegeService.class.getDeclaredMethod("snapshotBattle", SiegeBattle.class);
        snap.setAccessible(true);
        Map<String, Object> snapshot = (Map<String, Object>) snap.invoke(siegeService, battle);
        Method restore = SiegeService.class.getDeclaredMethod("restoreBattle", Map.class);
        restore.setAccessible(true);
        return (SiegeBattle) restore.invoke(siegeService, snapshot);
    }

    private void invokeCheckEnd(SiegeRun run) throws Exception {
        Method m = SiegeCombatEngine.class.getDeclaredMethod("checkEnd", SiegeRun.class);
        m.setAccessible(true);
        m.invoke(engine, run);
    }

    private void invokeStartBattle(SiegeRun run, List<Combatant> enemies) throws Exception {
        Method m = SiegeCombatEngine.class.getDeclaredMethod(
                "startBattle", SiegeRun.class, NodeType.class, List.class, java.util.Random.class);
        m.setAccessible(true);
        m.invoke(engine, run, NodeType.BATTLE, enemies, new java.util.Random(42));
    }
}
