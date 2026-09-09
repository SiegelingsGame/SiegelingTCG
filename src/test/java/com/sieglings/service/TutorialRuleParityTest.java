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

    private static int countOf(String haystack, String needle) {
        int n = 0;
        for (int i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length())) {
            n++;
        }
        return n;
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
        String tutorial = read("src/main/resources/static/js/arena-tutorial.js").replace("\r\n", "\n");
        // This guard exists so the copy cannot contradict the engine, and the
        // copy no longer makes the "checks the pool, does not drain it" claim
        // at all — it was cut when the cost lesson was shortened, leaving the
        // assertion pinning a phrase that had stopped existing (red on clean
        // origin/main). Re-keyed to the requirement the lesson still states.
        // The engine half of that contract is asserted directly, above.
        assertTrue(tutorial.contains("require energy of their element"),
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
        // points at nothing in particular. It now prefers opponent Burn (the Fire
        // hit the student just landed), then any enemy badge, then the player's,
        // through one shared reader so the opener and the tap lesson cannot point
        // at different things.
        assertTrue(tutorial.contains("function badgeSelector()")
                        && tutorial.contains("'#enemyGrid .sb-badge[data-status=\"BURN\"]'")
                        && tutorial.contains("'#enemyGrid .sb-badge'")
                        && tutorial.contains("'#playerGrid .sb-badge'"),
                "The badge target must prefer opponent Burn, then any enemy badge, then the player's.");
        assertTrue(tutorial.matches("(?s).*\\{ id: 'status',[^\\r\\n]*\\R        target: badgeSelector, highlight: badgeHighlight,.*"),
                "The badge lesson must ring the badge itself, not the whole board area.");

        // Ringing badge + grid together was still the whole grid, because the union
        // of the two IS the grid. The spotlight closes onto the CELL holding the
        // badge instead — 14% of the grid on a phone, down from 113%.
        assertTrue(tutorial.contains("function badgeCellSelector()")
                        && tutorial.contains("grid + ' .board-cell[data-row=\"' + r + '\"][data-col=\"' + c + '\"]'"),
                "The badge highlight must resolve the cell wearing the badge, by selector, so the "
                        + "coach can re-look it up on every frame.");
        // Step 17 (first-stack) opens on the opponent Burn card and waits for the
        // card view; the Burn tag / All Effects beats follow immediately so the
        // Fire element tag and burn sheet are reached from that card. `status`
        // remains as a fallback when the view is not already open.
        assertTrue(tutorial.contains("{ id: 'first-stack', hint: 'Tap the <b>opponent</b> card'")
                        && tutorial.contains("until: function () { return cardViewOpen() || !firstStackTarget(); } },"),
                "The first-stack Burn lesson must ask for the opponent-card tap and wait for the "
                        + "card view — with an escape when the Burn badge is gone.");
        assertTrue(tutorial.contains("function enemyBurnCellSelector()")
                        && tutorial.contains("function firstStackCopy()")
                        && tutorial.contains("opponent card"),
                "first-stack must resolve opponent Burn on the board and name that card in copy.");
        assertTrue(tutorial.contains("{ id: 'status', hint: 'Tap the card wearing a <b>badge</b>'")
                        && tutorial.contains("until: function () { return cardViewOpen() || !visible('.sb-badge'); } },"),
                "The badge lesson must ask for the tap that opens the card view and wait for it — "
                        + "with an escape for the badge expiring, since a badge is transient and the "
                        + "board re-renders under it.");
        assertTrue(tutorial.contains("{ id: 'badge-chip'") && tutorial.contains("{ id: 'badge-all'"),
                "The chip and the full reference must be their own beats.");
        assertTrue(tutorial.contains("hint: 'Tap the <b>Burn</b> tag'")
                        && tutorial.contains("Fire</b> element tag"),
                "The chip beat must name the Burn tag and the Fire element tag.");
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
        assertTrue(tutorial.contains("skipIf: function () { return !actingRowAbility(); },"),
                "The row lesson must skip when whoever is acting has no row move.");

        // The battle phase is NOT a cutscene — the player picks a move and then
        // a row for every Siegeling. The lesson used to describe the row move
        // and walk on to "Now watch" while the board was still waiting on both
        // choices, which is what the report was about.
        String game = read("src/main/resources/static/js/game.js");
        assertTrue(game.contains("battleTargeting: () => isBattleTargetSelectionActive(),"),
                "The coach needs to be able to tell 'pick your move' from 'pick a target'.");
        assertTrue(tutorial.contains("recommend: rowMoveButton,")
                        && tutorial.contains("lock: function () { return rowMoveButton() ? MOVE_BTNS : null; },"),
                "The row lesson must mark and lock the move panel to the row move — the single-target "
                        + "move sits right beside it.");
        assertTrue(tutorial.contains("until: function () { return battleTargeting() || !actingRowAbility() || battleTwoDone(); } },"),
                "It must wait for the move to actually be chosen, and let go when the actor loses the "
                        + "floor or the battle ends.");
        assertTrue(tutorial.contains("{ id: 'row-target'") && tutorial.contains("recommend: fullestRowTarget,"),
                "Choosing the row is its own beat, and the coach must mark the row worth choosing.");
        assertTrue(tutorial.contains("function fullestEnemyRow()")
                        && tutorial.contains("if (n > 0 && (!best || n > best.count)) best = { row: r, count: n };"),
                "The row must be computed from the enemies actually standing there — a fixed 'middle' "
                        + "is wrong the moment the board differs.");
        assertTrue(tutorial.contains("'The marked row has <b>' + n + '</b> '"),
                "The copy must say how many the swing catches, read from the board — that number is "
                        + "the point of the lesson.");
        assertTrue(tutorial.contains("until: function () { return rowPicked() || !battleTargeting() || battleTwoDone(); } },"),
                "Picking the row only arms the Confirm prompt, so the target beat must hand over to it "
                        + "rather than waiting for the attack to resolve.");

        // A row move costs two taps: mark the row, then confirm it. The coach
        // used to hold "tap a card in the marked row" over a board that was
        // already showing Confirm / Change Row.
        assertTrue(game.contains("battleRowPicked: () => isRowSelectBattleTargetContext() && getRowSelectSelectedRow() >= 0,"),
                "The coach needs to be able to tell 'pick a row' from 'confirm the row'.");
        assertTrue(game.contains("battleRowConfirmText: () => (isRowSelectBattleTargetContext() && getRowSelectSelectedRow() >= 0"),
                "The confirm copy must come from the button's own wording, not a second guess at it.");
        assertTrue(tutorial.contains("{ id: 'row-confirm'") && tutorial.contains("recommend: rowConfirmButton,"),
                "Confirming the swing must be its own beat, marked on the Confirm button.");
        assertTrue(tutorial.contains("lock: function () { return rowConfirmButton() ? ROW_CONFIRM_BTNS : null; },"),
                "The confirm beat must lock to the confirm pair — Confirm and Change Row are the only "
                        + "moves left on the board.");
        assertTrue(tutorial.contains("skipIf: function () { return !rowPicked(); },")
                        && tutorial.contains("until: function () { return !rowPicked() || !battleTargeting() || battleTwoDone(); } },"),
                "The confirm beat must only run while a row is marked, and let go the moment it is not.");

        // Burn payoff: a Fire hit is worth more than its printed damage, and the
        // lesson is to spend the swing where weakness + burn already add up to a
        // kill. The plan is COMPUTED — a hard-coded "hit Cozycub" would be wrong
        // the moment the board differs.
        assertTrue(game.contains("function getBattleBurnKillPlan()")
                        && game.contains("burnKillPlan: () => getBattleBurnKillPlan(),"),
                "The coach needs the burn-kill plan, computed in game.js off the same helpers the "
                        + "move panel prints.");
        assertTrue(game.contains("const weak = isElementWeakTo(element, cell.element);")
                        && game.contains("const hit = base + (weak ? 1 : 0);"),
                "Weakness must come from the shared chart and add the same +1 the panel previews.");
        assertTrue(game.contains("if (left <= 0) continue;"),
                "A target the swing kills outright is not this lesson — it teaches nothing about burn.");
        assertTrue(game.contains("if (left > stacks) continue;"),
                "The plan must only claim a kill the burn tick actually completes.");
        assertTrue(tutorial.contains("{ id: 'burn-kill'") && tutorial.contains("{ id: 'burn-target'")
                        && tutorial.contains("{ id: 'gate-burn'"),
                "Picking the move and picking the victim are separate beats, and they must be gated "
                        + "until a Fire attacker with such a play takes the floor.");
        assertTrue(tutorial.contains("recommend: burnMoveButton,")
                        && tutorial.contains("lock: function () { return burnMoveButton() ? MOVE_BTNS : null; },")
                        && tutorial.contains("recommend: burnTargetCell,"),
                "Both beats must mark what to tap — the bigger Fire move, then the card the numbers "
                        + "finish.");
        assertTrue(tutorial.contains("function burnMathSentence(plan)")
                        && tutorial.contains("', leaving <b>' + plan.left + ' HP</b>. <b>Burn</b> deals <b>' + plan.burn +")
                        && tutorial.contains("at the start of its owner’s next Setup"),
                "The copy must say the arithmetic — hit, weakness, burn tick, HP — read from the "
                        + "board rather than baked into the prose.");
        assertTrue(tutorial.contains("skipIf: function () { return !burnPlan(); },"),
                "The burn lesson must stay out of the way when no such play exists.");
        // Found by the printed move NAME, not the panel's ability index: that
        // index comes from a different walk than this file does.
        assertTrue(tutorial.contains("function rowMoveButton()")
                        && tutorial.contains(".battle-ability-move-name"),
                "The row move's button must be matched on the name the player can read.");
        assertTrue(!tutorial.contains("{ id: 't2-battle', title: 'Now watch'"),
                "'Now watch' alone was misleading — the rest of the battle still asks for a move per "
                        + "Siegeling.");

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
        assertTrue(tutorial.contains("{ id: 'adv-welcome'")
                        && tutorial.contains("{ id: 'adv-cast-deception'")
                        && tutorial.contains("{ id: 'adv-wait-action'"),
                "The advanced chapter must PLAY: it opens a prepared board, casts a Deception, "
                        + "then waits for a real battle action before teaching the action panel.");

        // Advising a card is not enough on the two steps whose choice the rest
        // of the script is built on. A player who taps the card NEXT to the
        // named one places the wrong Siegeling, and every following lesson
        // reasons about a board that was never built.
        String coach = read("src/main/resources/static/js/coach.js").replace("\r\n", "\n");
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
        // Both halves, not just the pick: 't2-evolve' names the evolution while
        // lighting the whole hand behind it, so it was the one place left where
        // the player could still take the wrong card.
        assertTrue(countOf(tutorial,
                        "lock: function () { return handCardTarget(evolutionInHand()) ? HAND_CARDS : null; },") == 2,
                "Both the evolve lesson and the pick that follows it must lock the hand.");

        // The reader behind every evolution lesson must mean "playable now".
        // Returning the first evolution in hand regardless stranded the chapter:
        // the tutorial hand holds two (Raydile over Sundile, Flora Knight over
        // Squire Bud), so once Raydile was played the place step's `until` kept
        // waiting on Flora Knight — whose base is not on the board — with no
        // cell able to light for it and no way forward.
        assertTrue(tutorial.contains("return c && c.type === 'SIEGLING' && c.evolvesFromId && evolutionBaseCells(c).length > 0;"),
                "evolutionInHand must only return an evolution that has a legal base on the board — "
                        + "a lesson about a move must only name a move the game would allow.");
        assertTrue(!tutorial.contains("return hand().filter(function (c) { return c && c.type === 'SIEGLING' && c.evolvesFromId; })[0] || null;"),
                "The unfiltered reader must be gone.");
        // The round-one lesson names a base still in HAND, so it keeps its own
        // scan — filtering it by board cells would break it.
        assertTrue(tutorial.contains("function baseOfEvolutionInHand()")
                        && tutorial.contains("var evo = h.filter(function (c) { return c && c.type === 'SIEGLING' && c.evolvesFromId; })[0];"),
                "baseOfEvolutionInHand must keep its own unfiltered scan — in round one the base is "
                        + "in hand and no board cell exists yet.");
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

        // A gate whose escape is already true when the coach arrives is not a
        // gate. `seen.sawBattle2` is set on round two's FIRST battle frame —
        // the same signal `t2-end` releases on — so the gate opened on arrival
        // every time, before anyone had taken the floor, and row-attack's skipIf
        // then found no actor and dropped the lesson for good. The escape has to
        // be strictly later than the moment it is reached.
        assertTrue(tutorial.contains("gate: function () { return !!actingRowAbility() || battleTwoDone(); } },"),
                "The row gate must wait out the battle, not open on the signal that the battle "
                        + "started.");
        assertTrue(tutorial.contains("function battleTwoDone()")
                        && tutorial.contains("return phase() !== 'BATTLE' || turn() >= 3;"),
                "'Round two's battle is over' must mean the phase has left BATTLE or the round has "
                        + "moved on — not seen.sawBattle2, which means it began.");
        assertTrue(!tutorial.contains("gate: function () { return !!actingRowAbility() || seen.sawBattle2 || seen.ended; } },"),
                "The self-defeating escape must be gone.");
        // Keyed to the wait, not the copy: the copy has since been reworded and
        // pinning a whole prose block makes every edit look like a regression.
        assertTrue(tutorial.contains("        skipIf: function () { return !seen.sawBattle; },\n"
                        + "        until: function () { return battleTwoDone(); } },"),
                "The round-two battle step had the same defect — it resolved on the first frame of "
                        + "the battle it was asking the player to play out.");

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
