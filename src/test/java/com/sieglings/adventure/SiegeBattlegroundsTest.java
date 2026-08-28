package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Firestore-free coverage for Battlegrounds (Phase 3) core: rebuilding a squad
 * from banked veteran snapshots, validating picks against the user's own teams,
 * the difficulty scalar, recruit-drop suppression, and the reward multipliers.
 *
 * <p>The reconstruction ({@link SiegeService#buildBattlegroundsParty}) and the
 * tuning math are pure — no Spring beans, no Firestore — so a bare
 * {@code new SiegeService()} plus hand-built snapshot maps exercise them directly,
 * exactly the shape {@link SiegeService#buildVeteranSnapshot} banks.
 */
class SiegeBattlegroundsTest {

    // ---- Run builder: party + merged deck + levels -----------------------

    @Test
    void buildsSquadOfThreeAtExtractedLevelsWithMergedDeck() {
        SiegeService service = new SiegeService();
        Map<String, Object> teamA = team("A", "k1", "Warden", Element.FIRE, 6,
                member("s1", "Ember", Element.FIRE, 120),   // level 3
                member("s2", "Tide", Element.WATER, 50),    // level 2
                member("s3", "Cliff", Element.EARTH, 0));    // level 1
        Map<String, Object> teamB = team("B", "k2", "Marshal", Element.ICE, 9,
                member("s4", "Gale", Element.WIND, 220),    // level 4
                member("s5", "Dusk", Element.SHADOW, 0));

        List<Map<String, Object>> teams = List.of(teamA, teamB);
        // Mix across teams: two from A, one from B; knight from A.
        List<String[]> picks = List.of(
                new String[] { "A", "s1" },
                new String[] { "A", "s3" },
                new String[] { "B", "s4" });

        SiegeService.BgBuild build = service.buildBattlegroundsParty(teams, picks, "A");

        assertEquals(3, build.party.size());
        assertEquals(3, build.party.get(0).getLevel()); // Ember @120xp
        assertEquals(1, build.party.get(1).getLevel()); // Cliff @0xp
        assertEquals(4, build.party.get(2).getLevel()); // Gale @220xp
        // maxHp matches Phase-1 scaling from the stored base (base 40 for these).
        assertEquals(SiegeTuning.scaledMaxHp(40, 3), build.party.get(0).getMaxHp());
        // Average of 3, 1, 4 = 2.67 → rounds to 3.
        assertEquals(3, build.averageLevel);

        // Merged deck: one card per picked member (owner rebound to the new unit id)
        // plus the veteran knight's card from team A.
        assertEquals(4, build.deck.size());
        assertNotNull(build.knightUnit);
        assertTrue(build.deck.stream().anyMatch(c -> c.getOwnerId().equals("knight-k1")));
        assertTrue(build.deck.stream().anyMatch(c -> c.getOwnerId().equals(build.party.get(0).getId())));
        assertTrue(build.deck.stream().anyMatch(c -> c.getOwnerId().equals(build.party.get(2).getId())));
        // The knight combatant is rebuilt at its extracted level (k1 stored @0xp → L1).
        assertEquals(1, build.knightUnit.getLevel());
        assertTrue(build.knightUnit.isKnight());
    }

    // ---- Validation: picks must belong to the user's banked teams --------

    @Test
    void rejectsPicksNotInTheUsersBankedTeams() {
        SiegeService service = new SiegeService();
        Map<String, Object> teamA = team("A", "k1", "Warden", Element.FIRE, 6,
                member("s1", "Ember", Element.FIRE, 120),
                member("s2", "Tide", Element.WATER, 50),
                member("s3", "Cliff", Element.EARTH, 0));
        List<Map<String, Object>> teams = List.of(teamA);

        // A source card that isn't in team A.
        assertThrows(IllegalArgumentException.class, () -> service.buildBattlegroundsParty(teams,
                List.of(new String[] { "A", "s1" }, new String[] { "A", "s2" }, new String[] { "A", "ghost" }), "A"));
        // A team the user does not own.
        assertThrows(IllegalArgumentException.class, () -> service.buildBattlegroundsParty(teams,
                List.of(new String[] { "A", "s1" }, new String[] { "A", "s2" }, new String[] { "Z", "s3" }), "A"));
        // A knight team the user does not own.
        assertThrows(IllegalArgumentException.class, () -> service.buildBattlegroundsParty(teams,
                List.of(new String[] { "A", "s1" }, new String[] { "A", "s2" }, new String[] { "A", "s3" }), "Z"));
    }

    // ---- Difficulty scalar grows with average veteran level --------------

    @Test
    void difficultyScalarIncreasesWithAverageLevel() {
        double lowHp = SiegeTuning.bgEnemyHpScalar(2, SiegeTuning.BG_BASE_TIER_SCALAR);
        double highHp = SiegeTuning.bgEnemyHpScalar(8, SiegeTuning.BG_BASE_TIER_SCALAR);
        assertTrue(highHp > lowHp, "higher average level → tougher enemies");
        // +8% HP / +5% dmg per average level at the base tier.
        assertEquals(1.0 + 0.08 * 5, SiegeTuning.bgEnemyHpScalar(5, 1.0), 1e-9);
        assertEquals(1.0 + 0.05 * 5, SiegeTuning.bgEnemyDamageScalar(5, 1.0), 1e-9);
        // The tier scalar seam multiplies on top (Phase 4 raises it above 1.0).
        assertEquals(SiegeTuning.bgEnemyHpScalar(5, 1.0) * 2.0, SiegeTuning.bgEnemyHpScalar(5, 2.0), 1e-9);
    }

    // ---- Recruit drops disabled in Battlegrounds -------------------------

    @Test
    void recruitDropsSuppressedOnlyInBattlegrounds() {
        SiegeRun bg = new SiegeRun("t-bg");
        bg.setMode(RunMode.BATTLEGROUNDS);
        assertTrue(SiegeService.recruitsSuppressed(bg));

        SiegeRun standard = new SiegeRun("t-std");
        standard.setMode(RunMode.STANDARD);
        assertFalse(SiegeService.recruitsSuppressed(standard));

        SiegeRun endless = new SiegeRun("t-end");
        endless.setMode(RunMode.ENDLESS);
        assertFalse(SiegeService.recruitsSuppressed(endless));
    }

    // ---- Reward multipliers ----------------------------------------------

    @Test
    void goldAndScoreMultipliersApply() {
        assertEquals(2.5, SiegeTuning.BG_GOLD_MULT, 1e-9);
        assertEquals(3.0, SiegeTuning.BG_SCORE_MULT, 1e-9);
        assertEquals(250, SiegeTuning.bgGold(100));  // ×2.5
        assertEquals(100, SiegeTuning.bgGold(40));   // recruit-replacement windfall
        assertEquals(30L, SiegeTuning.bgScore(10));  // ×3
        assertEquals(3000L, SiegeTuning.bgScore(1000));
    }

    @Test
    void battlegroundsRebuildKeepsExtractedSwapRiders() {
        SiegeService service = new SiegeService();
        Map<String, Object> teamA = team("A", "k1", "Warden", Element.FIRE, 6,
                member("s1", "Ember", Element.FIRE, 120),
                member("s2", "Tide", Element.WATER, 50),
                member("s3", "Cliff", Element.EARTH, 0));

        AbilitySpec amped = new AbilitySpec("test-move-link", "Move Link ★", Element.NEUTRAL,
                Effect.SWAP, 0, TargetKind.ALLY_SINGLE, 1, "Trade notches.",
                null, 0, AmpRider.HEAL, SiegeTuning.AMP_SWAP_HEAL);
        String owner = "ally-0-s1";
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> deck = new ArrayList<>((List<Map<String, Object>>) teamA.get("deck"));
        deck.addAll(0, SiegeVeteranStore.deckOf(List.of(new SiegeCard(owner + "-swap", owner, amped))));
        teamA.put("deck", deck);

        SiegeService.BgBuild build = service.buildBattlegroundsParty(
                List.of(teamA),
                List.of(new String[] { "A", "s1" }, new String[] { "A", "s2" }, new String[] { "A", "s3" }),
                "A");
        AbilitySpec rebuilt = build.deck.stream()
                .filter(c -> c.getSpec().id().equals("test-move-link"))
                .findFirst().orElseThrow()
                .getSpec();
        assertEquals(AmpRider.HEAL, rebuilt.rider(), "extract → Battlegrounds must keep the swap rider");
        assertEquals(SiegeTuning.AMP_SWAP_HEAL, rebuilt.riderValue());
        assertTrue(rebuilt.hasRider());
    }

    // ---- Snapshot helpers (mimic SiegeService.buildVeteranSnapshot) ------

    private static Map<String, Object> team(String teamId, String knightId, String knightName,
                                             Element knightElement, int knightMaxHp, Map<String, Object>... members) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("teamId", teamId);
        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("knightId", knightId);
        knight.put("knightName", knightName);
        knight.put("element", knightElement.name());
        knight.put("passive", KnightPassive.SHIELD.name());
        knight.put("passiveValue", 6);
        knight.put("level", 1);
        knight.put("xp", 0);
        knight.put("maxHp", knightMaxHp);
        knight.put("baseMaxHp", knightMaxHp);
        t.put("knight", knight);

        List<Map<String, Object>> mem = new ArrayList<>();
        List<Map<String, Object>> deck = new ArrayList<>();
        int idx = 0;
        for (Map<String, Object> m : members) {
            mem.add(m);
            // One deck card per member, owned by the member's original combatant id.
            String owner = "ally-" + idx + "-" + m.get("sourceCardId");
            deck.add(deckCard(owner, "move-" + m.get("sourceCardId"), (String) m.get("name")));
            idx++;
        }
        // The knight contributes one card to the shared deck.
        deck.add(deckCard("knight-" + knightId, "knightcard", knightName + " active"));
        t.put("members", mem);
        t.put("deck", deck);
        return t;
    }

    private static Map<String, Object> member(String sourceCardId, String name, Element element, int xp) {
        // Build via the real Phase-2 helper so the snapshot shape matches production.
        Combatant c = new Combatant("seed", name, element, Side.PLAYER, 40, 6, null);
        c.setSourceCardId(sourceCardId);
        c.addXp(xp);
        return SiegeVeteranStore.membersOf(List.of(c)).get(0);
    }

    private static Map<String, Object> deckCard(String owner, String moveId, String name) {
        Map<String, Object> spec = new LinkedHashMap<>();
        spec.put("id", moveId);
        spec.put("name", name);
        spec.put("element", "FIRE");
        spec.put("effect", "DAMAGE");
        spec.put("value", 8);
        spec.put("target", "ENEMY_SINGLE");
        spec.put("cost", 1);
        spec.put("desc", "Deal 8");
        spec.put("status", null);
        spec.put("statusChance", 0);
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("iid", owner + "-c0");
        card.put("owner", owner);
        card.put("spec", spec);
        return card;
    }
}
