package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SiegeScoreTest {

    private static SiegeRun run() {
        SiegeRun run = new SiegeRun("score-test");
        run.getParty().add(new Combatant("ally-0", "Sprout", Element.EARTH, Side.PLAYER, 60, 6, null));
        run.getParty().add(new Combatant("ally-1", "Ember", Element.FIRE, Side.PLAYER, 50, 7, null));
        return run;
    }

    @SuppressWarnings("unchecked")
    private static long line(SiegeRun run, String key) {
        List<Map<String, Object>> lines = (List<Map<String, Object>>) run.getScoreTally().breakdown(run).get("lines");
        return lines.stream().filter(l -> key.equals(l.get("key"))).findFirst()
                .map(l -> ((Number) l.get("points")).longValue()).orElse(0L);
    }

    @Test
    void riskierRoutesScoreMore() {
        SiegeRun safe = run();
        safe.getScoreTally().nodeEntered(NodeType.REST);
        safe.getScoreTally().nodeEntered(NodeType.TREASURE);
        SiegeRun bold = run();
        bold.getScoreTally().nodeEntered(NodeType.ELITE);
        bold.getScoreTally().nodeEntered(NodeType.EVENT);
        assertEquals(15, line(safe, "route"));
        assertEquals(60, line(bold, "route"));
        assertTrue(bold.getScore() > safe.getScore());
    }

    @Test
    void flawlessAndSwiftWinsEarnMastery() {
        SiegeRun run = run();
        run.setBattle(new SiegeBattle(NodeType.BATTLE));
        run.getScoreTally().syncWarband(run);
        run.getScoreTally().battleWon(2, 3, 1, false, 0);
        assertEquals(2 * (10 + 3) + 5, line(run, "battles"));
        assertEquals(5 * SiegeScore.SWIFT_PER_ROUND + SiegeScore.FLAWLESS_BONUS, line(run, "mastery"));
    }

    @Test
    void fallsCostPointsAndRevivesEarnHalfBack() {
        SiegeRun run = run();
        run.setBattle(new SiegeBattle(NodeType.BATTLE));
        Combatant sprout = run.getParty().get(0);
        sprout.setHp(0);
        run.getScoreTally().syncWarband(run);
        run.getScoreTally().syncWarband(run); // idempotent: still one fall
        run.getScoreTally().battleWon(1, 1, 9, false, 0);
        assertEquals(1, run.getScoreTally().fallen());
        assertEquals(0, run.getScoreTally().flawlessWins(), "a battle with a fall is not flawless");
        assertEquals(-SiegeScore.FALL_PENALTY, line(run, "fallen"));

        run.setBattle(null);
        sprout.setHp(30);
        run.getScoreTally().syncWarband(run);
        assertEquals(1, run.getScoreTally().revived());
        assertEquals(SiegeScore.REVIVE_CREDIT, line(run, "revived"));
    }

    @Test
    void goldEarnedCountsFullAndSpentCountsHalf() {
        SiegeRun run = run();
        run.setGold(100);
        run.setGoldEarnedTotal(100);
        run.addGold(-60);
        run.addGold(-500); // a toll can only take what the purse holds
        assertEquals(100, run.getScoreTally().goldSpent());
        assertEquals(100, line(run, "goldEarned"));
        assertEquals(50, line(run, "goldSpent"));
    }

    @Test
    void victoryBonusAndBattlegroundsMultiplier() {
        SiegeRun run = run();
        run.setGoldEarnedTotal(100);
        run.setStatus(RunStatus.WON);
        assertEquals(100 + SiegeScore.VICTORY_BONUS, run.getFinalScore());
        run.setMode(RunMode.BATTLEGROUNDS);
        run.setBgTier(1);
        assertEquals(SiegeTuning.bgScore(run.getScore(), 1), run.getFinalScore());
        assertTrue(run.getFinalScore() > run.getScore());
    }

    @Test
    void scoreNeverGoesNegative() {
        SiegeRun run = run();
        run.getParty().forEach(c -> c.setHp(0));
        run.getScoreTally().syncWarband(run);
        assertEquals(0, run.getFinalScore());
    }

    @Test
    void checkpointRoundTripKeepsTheTally() {
        SiegeRun run = run();
        run.getScoreTally().nodeEntered(NodeType.ELITE);
        run.getParty().get(1).setHp(0);
        run.getScoreTally().syncWarband(run);
        run.setGold(40);
        run.addGold(-40);
        Map<String, Object> saved = run.getScoreTally().toMap();

        SiegeRun resumed = run();
        resumed.getParty().get(1).setHp(0);
        resumed.getScoreTally().restore(saved, 0);
        resumed.getScoreTally().syncWarband(resumed);
        assertEquals(1, resumed.getScoreTally().fallen(), "a member already down is not counted twice");
        assertEquals(run.getScoreTally().breakdown(run), resumed.getScoreTally().breakdown(resumed));
    }

    @Test
    void legacyCheckpointCarriesItsOldScore() {
        SiegeRun run = run();
        run.getScoreTally().restore(null, 730);
        assertEquals(730, line(run, "carried"));
        assertEquals(730, run.getScore());
    }
}
