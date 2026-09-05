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
        // This guard exists so the copy cannot contradict the engine, and the
        // copy no longer makes the "checks the pool, does not drain it" claim
        // at all — it was cut when the cost lesson was shortened, leaving the
        // assertion pinning a phrase that had stopped existing (red on clean
        // origin/main). Re-keyed to the requirement the lesson still states.
        // The engine half of that contract is asserted directly, above.
        assertTrue(tutorial.contains("ask for energy of their element"),
                "The cost lesson must keep stating that heavier Sieglings require energy of "
                        + "their own element.");
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
        assertTrue(tutorial.contains("title: 'Little icons, big deal',\n        target: badgeSelector, highlight: badgeHighlight,"),
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
        // The badge chapter is three taps now — open the card view, read the chip
        // inside it, open the full reference — and each beat waits for its own.
        // It used to state all of it and walk on: `status` had no `until` at all,
        // so Got it went straight past, and the spotlight never left the board.
        assertTrue(tutorial.contains("{ id: 'status', hint: 'Tap the card wearing a <b>badge</b>'")
                        && tutorial.contains("until: function () { return cardViewOpen() || !visible('.sb-badge'); } },"),
                "The badge lesson must ask for the tap that opens the card view and wait for it — "
                        + "with an escape for the badge expiring, since a badge is transient and the "
                        + "board re-renders under it.");
        assertTrue(tutorial.contains("{ id: 'badge-chip'") && tutorial.contains("{ id: 'badge-all'"),
                "The chip and the full reference must be their own beats.");
        assertTrue(tutorial.contains("target: function () { return chipButton() || allEffectsSelector(); },"),
                "The chip lesson must ring the chip itself — the card view also carries the card's "
                        + "stats and its whole move list.");
        assertTrue(tutorial.contains("until: function () { return allEffectsOpen() || (!cardViewOpen() && !effectKeyOpen()); } },"),
                "The All Effects beat must wait for the REFERENCE specifically, not merely for the "
                        + "overlay — the single-affliction sheet uses the same element.");
        assertTrue(tutorial.contains("function allEffectsOpen()") && tutorial.contains("/reference/i.test(k.textContent"),
                "Reference-vs-affliction must be read off the kicker the overlay swaps, since both "
                        + "views share one element.");
        // The two layouts offer different controls, and the coach decides whether
        // a step waits from whether `until` exists — which one step cannot vary.
        assertTrue(tutorial.contains("{ id: 'badge-chip-read'")
                        && tutorial.contains("skipIf: function () { return !!chipButton() || !previewChipSelector(); } },"),
                "The desktop panel's pills are spans, not buttons, so the chip lesson needs a "
                        + "read-and-continue twin that runs when there is nothing to tap — otherwise "
                        + "the waiting version either strands that player or skips the lesson.");
        assertTrue(tutorial.contains("function chipButton()")
                        && tutorial.contains("firstOf2(['.selected-copy-buffs .buff-pill:not(.buff-pill-all)'])"),
                "Tappability must be decided by the button the phone actually renders.");

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
        // The Advanced chapter is offered on the WIN screen and runs on a FRESH
        // match: shields, afflictions and the HUD-in-use all need a live board,
        // and swapping the script over a finished match left it a slideshow.
        String game = read("src/main/resources/static/js/game.js");
        assertTrue(game.contains("async function startAdvancedTutorialMatch()")
                        && game.contains("setMatchMode('tutorial')"),
                "The end screen must be able to deal a fresh tutorial match for the advanced run.");
        assertTrue(game.contains("btnAdvanced.hidden = !(tutorialMatchActive && result === 'WIN');"),
                "The advanced offer belongs on a tutorial WIN only — offering it after a loss "
                        + "reads as a taunt, and outside the tutorial it makes no sense.");
        assertTrue(game.contains("sessionStorage.getItem(ADVANCED_TUTORIAL_KEY)"),
                "The request must survive the match restart, which rebuilds this page state.");
        assertTrue(tutorial.contains("startAdvanced: startAdvancedFromFreshMatch,"),
                "The tutorial must expose an entry that opens the advanced script from turn one.");
        assertTrue(tutorial.contains("{ id: 'adv-open-place'") && tutorial.contains("{ id: 'gate-adv'"),
                "The advanced chapter must PLAY: it deals a fresh board, so it needs the opening "
                        + "beats and a gate before the lessons that require a fought round.");

        // Advising a card is not enough on the two steps whose choice the rest
        // of the script is built on. A player who taps the card NEXT to the
        // named one places the wrong Siegeling, and every following lesson
        // reasons about a board that was never built.
        String coach = read("src/main/resources/static/js/coach.js");
        assertTrue(coach.contains("function applyLock(s, open)") && coach.contains("'tut-locked'"),
                "The coach must be able to shut the non-recommended members of a candidate set, "
                        + "not merely mark the recommended one.");
        assertTrue(coach.contains("if (!sel || !open) { if (locked.length) clearLock(); return; }"),
                "A lock with nothing recommended must be inert — locking a set with no open member "
                        + "would trap the player with no legal tap.");
        assertTrue(coach.contains("clearLock();\n    if (layer) layer.classList.add('hidden');"),
                "Stopping the coach must hand every locked element back.");
        String coachCss = read("src/main/resources/static/css/coach.css");
        assertTrue(coachCss.contains(".tut-locked") && coachCss.contains("pointer-events:none !important;"),
                "The lock has to actually block the tap, not just look shut.");

        assertTrue(tutorial.contains("recommend: partnerTarget,\n        lock: HAND_CARDS,"),
                "The round-two pick must mark AND lock the hand to the partner it names.");
        // The evolution pick is the third step whose choice the script is built
        // on, and the worst one to get wrong: the lesson is "an evolution lands
        // ON TOP OF its base", and picking any other card lights a set of empty
        // cells and demonstrates the opposite.
        assertTrue(tutorial.contains("recommend: function () { return handCardTarget(evolutionInHand()); },\n"
                        + "        lock: function () { return handCardTarget(evolutionInHand()) ? HAND_CARDS : null; },"),
                "The evolution pick must mark and lock the hand to the evolution, gated on that card "
                        + "being findable — its target falls back to the whole hand.");
        assertTrue(tutorial.contains("lock: function () { return handCardTarget(openerCard()) ? HAND_CARDS : null; },"),
                "The opener pick must lock too, but only when the named card is actually findable "
                        + "— openerTarget falls back to the FIRST hand card, and locking every other "
                        + "card to an arbitrary slot is worse than not locking at all.");
        // One reader behind the copy, the mark and the lock. They used to be
        // computed separately, with different exclusions, so the tip could name
        // one card while a different one was the open answer.
        assertTrue(tutorial.contains("function partnerCard()")
                        && tutorial.contains("var mate = partnerCard();")
                        && !tutorial.contains("var mate = partnerSiegling();"),
                "The round-two hint and body must both read the partner through partnerCard(), so "
                        + "the named card and the unlocked card cannot disagree.");

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
