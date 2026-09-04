package com.sieglings.service;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The Arena tutorial now states cost and evolution rules outright, and copy that
 * contradicts the engine is worse than no copy at all. These assertions pin the
 * two claims that are easy to get backwards, against the engine source itself.
 */
class TutorialRuleParityTest {

    private static String read(String path) throws Exception {
        return Files.readString(Path.of(path));
    }

    @Test
    void sieglingCostIsCheckedButNeverSpentWhileSpellsAndTrapsSpend() throws Exception {
        String gameService = read("src/main/java/com/sieglings/service/GameService.java");

        // A Siegling placement gates on canAfford...
        assertTrue(gameService.contains(
                        "energyService.canAfford(state, isPlayerSide, siegling.getCostElement(), siegling.getCostAmount())"),
                "Siegling placement must still gate on canAfford — the tutorial tells the player "
                        + "the cost has to be on tap.");

        // ...and never calls spendEnergy for one, which is exactly why the tip
        // says "it does not spend it" rather than "pay".
        assertTrue(!gameService.contains("spendEnergy(state, isPlayerSide, siegling."),
                "A Siegling's cost must stay a requirement, not a payment — the tutorial copy "
                        + "says placing does not spend it.");

        // Spells and traps do spend, which is the contrast the tip draws.
        assertTrue(gameService.contains(
                        "energyService.spendEnergy(state, isPlayerSide, spell.getCostElement(), spell.getCostAmount())"),
                "Spells must still spend energy — the tutorial contrasts them with Sieglings.");
        assertTrue(gameService.contains(
                        "energyService.spendEnergy(state, isPlayerSide, trap.getCostElement(), trap.getCostAmount())"),
                "Traps must still spend energy — the tutorial contrasts them with Sieglings.");
    }

    @Test
    void evolutionStillRequiresASurvivedBattlePhase() throws Exception {
        String gameService = read("src/main/java/com/sieglings/service/GameService.java");
        assertTrue(gameService.contains("getBattlePhasesSeen() <= 0"),
                "Evolution must still require a completed battle phase — the tutorial states it "
                        + "as one of the two preconditions.");
    }

    @Test
    void tutorialCopyMatchesThoseRules() throws Exception {
        String tutorial = read("src/main/resources/static/js/arena-tutorial.js");
        assertTrue(tutorial.contains("it does not drain it"),
                "The cost lesson must keep saying a Siegling's cost is not spent.");
        assertTrue(tutorial.contains("survived a full battle phase"),
                "The evolution lesson must keep naming the battle-phase requirement.");
        // Both link kinds are taught, and each waits on the payout it teaches.
        assertTrue(tutorial.contains("t2-link-same") && tutorial.contains("t3-link-combo"),
                "Both the same-element link and the combo link must be walked through — the "
                        + "matching link in round two, the combo in round three.");
        // One Setup affords one placement, so round two is link-then-evolve and the
        // combo (which needs a third Siegling) belongs to round three, where
        // GameService hoists the off-element partner onto the draw.
        assertTrue(tutorial.contains("{ id: 'gate-t3'"),
                "The combo/Strategy/Deception lessons must sit behind a round-three gate.");
        // The wait reads the BOARD, not the energy pool. An energy test cannot tell a
        // new link from a socket or an ability payout, so it either fired early or
        // waited on the wrong thing; counting the links themselves is exact.
        assertTrue(tutorial.contains("sameElementLinkCount() > linkBaseline || phase() !== 'SETUP'"),
                "The same-element lesson must wait on a new matching link appearing on the board, "
                        + "and must give that wait up when Setup ends so it cannot hold the match "
                        + "hostage.");
        assertTrue(tutorial.contains("comboCount() > 0 || phase() !== 'SETUP'"),
                "The combo lesson must wait on a real combo point, with the same escape.");
        // Neither link lesson may ask for a connection the board already has. The
        // placement step before each one commonly makes it outright, which left the
        // coach demanding something the player had just done.
        assertTrue(tutorial.contains("mine() < 2 || sameElementLinkCount() > 0"),
                "The same-element lesson must be skipped when a matching link already stands.");
        assertTrue(tutorial.contains("!seen.sawBattle2 || comboCount() > 0"),
                "The combo lesson must be skipped when a combo point has already been banked.");
    }

    /**
     * Evolving is a two-tap move onto an occupied cell, which reads as illegal
     * until you have done it once. The coach used to describe it and walk on,
     * so a player who did not work it out was carried past the lesson with the
     * evolution still in hand.
     */
    @Test
    void theEvolutionLessonGuidesBothTapsAndWaitsForEach() throws Exception {
        String tutorial = read("src/main/resources/static/js/arena-tutorial.js");

        assertTrue(tutorial.contains("{ id: 't2-evolve-pick'") && tutorial.contains("{ id: 't2-evolve-place'"),
                "The evolution lesson must guide both taps — picking the card up, then dropping it "
                        + "on its base — not just state the rule.");

        // Each half has to WAIT, or the script walks on to End Turn with the
        // evolution still in hand, which is the bug being fixed.
        assertTrue(tutorial.contains("return selectedIsEvolution() || !evolutionInHand() || phase() !== 'SETUP';"),
                "The pick step must wait for the evolution to actually be selected, and give that "
                        + "wait up when Setup ends so it cannot hold the match hostage.");
        assertTrue(tutorial.contains("return !evolutionInHand() || phase() !== 'SETUP';"),
                "The place step must wait for the evolution to leave the hand, with the same escape.");

        // Both halves are skipped unless the move is genuinely available, so the
        // coach never asks for a tap the engine would reject.
        assertTrue(tutorial.contains("turn() < 2 || !evolutionReady() || selectedIsEvolution()"),
                "The pick step must be skipped when there is no evolution the board can accept.");

        // The rings must mirror the engine's own legality rule for the cell they
        // point at — see GameService/game.js getEvolutionPlacements.
        assertTrue(tutorial.contains("cell.cardId !== evo.evolvesFromId")
                        && tutorial.contains("Number(cell.battlePhasesSeen || 0) > 0")
                        && tutorial.contains("hasCurse(cell)"),
                "The base cell the coach rings must satisfy the same conditions the game uses to "
                        + "allow the evolution: matching base, a survived battle phase, and no curse.");
    }

    @Test
    void evolutionBaseLegalityMatchesTheEngine() throws Exception {
        String gameJs = read("src/main/resources/static/js/game.js");
        assertTrue(gameJs.contains("cell.cardId === card.evolvesFromId")
                        && gameJs.contains("Number(cell.battlePhasesSeen || 0) > 0")
                        && gameJs.contains("!cellHasAffliction(cell, 'CURSE')"),
                "getEvolutionPlacements is the rule the tutorial's ring mirrors — if it changes, "
                        + "the coach's base-cell check has to change with it.");
    }
}
