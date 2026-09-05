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

        // The badge lesson used to ring #boardArea — 71% of a phone screen, which
        // points at nothing in particular. It rings the badge on the player's OWN
        // Siegling now, through one shared reader so the lesson that explains a
        // badge and the lesson that opens one cannot point at different things.
        assertTrue(tutorial.contains("function badgeSelector()")
                        && tutorial.contains("'#playerGrid .sb-badge', '#enemyGrid .sb-badge'"),
                "The badge target must prefer the player's own badge, then the enemy's.");
        assertTrue(tutorial.contains("{ id: 'status', title: 'Little icons, big deal',\n        target: badgeSelector, highlight: badgeHighlight,"),
                "The badge lesson must ring the badge itself, not the whole board area.");
        assertTrue(!tutorial.contains("title: 'Little icons, big deal', target: '#boardArea'"),
                "The badge lesson must no longer spotlight the entire board.");

        // Ringing badge + grid together was still the whole grid, because the union
        // of the two IS the grid. The spotlight closes onto the CELL holding the
        // badge instead — 14% of the grid on a phone, down from 113%.
        assertTrue(tutorial.contains("function badgeCellSelector()")
                        && tutorial.contains("grid + ' .board-cell[data-row=\"' + r + '\"][data-col=\"' + c + '\"]'"),
                "The badge highlight must resolve the cell wearing the badge, by selector, so the "
                        + "coach can re-look it up on every frame.");
        assertTrue(tutorial.contains("var cell = badgeCellSelector();\n    if (cell) return [cell];"),
                "The badge highlight must ring that cell alone, not the cell plus its grid.");

        // Round two: name the cell that actually connects. Ringing every legal cell
        // left the player to guess which of three makes the link.
        assertTrue(tutorial.contains("function linkCell()") && tutorial.contains("recommend: linkCell,"),
                "The round-two placement must recommend the cell where the selected card "
                        + "would actually link, not just spotlight every legal cell.");
        assertTrue(tutorial.contains("score = Math.max(score, same ? 2 : 1);"),
                "A same-element pairing must outrank a mixed one — the lesson that follows the "
                        + "placement is the same-element link.");

        // The row-attack lesson exists and stays out of the way for a single-target
        // attacker, so it fires on Pylook and not on Sundile.
        assertTrue(tutorial.contains("{ id: 'row-attack'") && tutorial.contains("function actingRowAbility()"),
                "The multi-target lesson must exist and read the acting Siegeling's row move.");
        assertTrue(tutorial.contains("t === 'ROW_ENEMIES' || t === 'ROW_SELECT_ENEMIES'"),
                "A row move must be identified by its target type, not by card name.");
        assertTrue(tutorial.contains("skipIf: function () { return !actingRowAbility(); } },"),
                "The row lesson must skip when whoever is acting has no row move.");

        // It has to live in ROUND TWO's battle. Filed in round one it was skipped
        // permanently on arrival — only Sundile is down then, so actingRowAbility()
        // was null and skipIf fires once. Pylook is placed in round two.
        assertTrue(tutorial.indexOf("{ id: 'row-attack'") > tutorial.indexOf("{ id: 'gate-t2'"),
                "The row lesson must sit after the round-two gate — Pylook is not on the board "
                        + "during round one, so a round-one placement is skipped forever.");
        assertTrue(tutorial.indexOf("{ id: 'row-attack'") < tutorial.indexOf("{ id: 't2-battle'"),
                "It must come BEFORE the round-two battle wrap-up, which waits for the battle to "
                        + "finish — after it, Pylook has already swung.");
        assertTrue(tutorial.contains("{ id: 'gate-row', skipTo: 't2-battle',"),
                "It must be GATED, not skipped: the gate waits for a row attacker to take the "
                        + "floor instead of giving up the first time it is evaluated.");
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
