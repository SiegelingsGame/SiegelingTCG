package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class SiegeAdvantageTutorialJavaScriptTest {

    private static final Path ADVENTURE_JS = Path.of("src/main/resources/static/js/adventure.js");
    private static final Path TUTORIAL_JS = Path.of("src/main/resources/static/js/siege-tutorial.js");
    private static final Path ADVENTURE_HTML = Path.of("src/main/resources/static/adventure.html");

    @Test
    void everySieglingCardSheetExplainsItsAdvantageRider() throws IOException {
        String source = Files.readString(ADVENTURE_JS);

        for (String element : new String[] {
                "FIRE", "EARTH", "WIND", "WATER", "ICE",
                "ELECTRIC", "METAL", "SHADOW", "UNDEAD", "PSYCHIC"
        }) {
            assertTrue(source.contains(element + ": ["), element + " needs friendly and hostile Advantage copy.");
        }
        assertTrue(source.contains("function advantageRiderText(spec)"));
        assertTrue(source.contains("um-card-advantage"), "The shared unit modal must render the rider for every card surface.");
    }

    @Test
    void tutorialBuildsAndAdvancesTheAdvantageQueueAndAppliesSearDamage() throws IOException {
        String source = Files.readString(TUTORIAL_JS);

        assertTrue(source.contains("rebuildAdvantage(false);"), "The first battle must start with the fastest holder.");
        assertTrue(source.contains("advanceAdvantage(events);"), "Advantage must pass between team turns.");
        assertTrue(source.contains("damage(target, 2, events, owner.id, c.element);"),
                "Fire's tutorial rider must deal its additional two damage.");
        assertTrue(source.contains("triggerAdvantage(owner, c, marks, events);"),
                "Damage cards must resolve their Advantage rider after their base hit.");
    }

    @Test
    void anAdvantagedShadePrintsItsRiderInsideItsIntentWindow() throws IOException {
        String adventure = Files.readString(ADVENTURE_JS);
        String tutorial = Files.readString(TUTORIAL_JS);

        // The plate derives the rider from the telegraphed intent when the state
        // does not spell it out, so a shade holding Advantage never shows a bare
        // intent while its card sheet explains a rider.
        assertTrue(adventure.contains("u.advantaged || u.id === b.advantageHolderId"),
                "The plate must treat the Advantage holder as advantaged.");
        assertTrue(adventure.contains("(u.advantageText || advantageRiderText(u.intent))"),
                "The plate must fall back to the shared rider table for a shade's intent.");
        assertTrue(adventure.contains("advantageRiderText: function (spec)"),
                "The rider wording must be shared with the tutorial sim, not copied.");

        // The tutorial's shades telegraph element and target, which is what the
        // rider text is derived from, and they resolve every element's rider.
        assertTrue(tutorial.contains("element: ability.element || f.element, target: 'ENEMY_SINGLE',"),
                "Tutorial intents must carry the element and target their rider reads.");
        assertTrue(tutorial.contains("u.advantageText = u.advantaged && u.intent ? riderTextFor(u.intent) : null;"),
                "An advantaged tutorial shade must publish its rider text.");
        for (String element : new String[] {
                "FIRE", "EARTH", "WIND", "WATER", "ICE",
                "ELECTRIC", "METAL", "SHADOW", "UNDEAD", "PSYCHIC"
        }) {
            assertTrue(tutorial.contains("case '" + element + "':"),
                    element + " needs a resolved Advantage rider in the tutorial sim.");
        }
    }

    @Test
    void aBattleStepWaitsForItsOwnProjectileBeforeTheNextTipOpens() throws IOException {
        String adventure = Files.readString(ADVENTURE_JS);
        String tutorial = Files.readString(TUTORIAL_JS);

        assertTrue(adventure.contains("presentationBusy: function () { return !!state.busy; }"),
                "The coach needs a reader for playback still running.");
        assertTrue(tutorial.contains("function settled(condition)"),
                "Battle waits must be wrapped so a tip cannot open over a projectile.");
        assertTrue(tutorial.contains("window.SiegeClient.presentationBusy()"),
                "The wrapper must consult the live presentation, not a timer.");
        // Every in-battle wait releases on an action whose animation is still
        // playing when the sim resolves it.
        assertTrue(tutorial.contains("until: settled(function () { return flags.played > 0; }) },"),
                "The targeting step must outlast the attack it asked for.");
        assertTrue(tutorial.contains("until: settled(function () { return M.battle && M.battle.roundNumber > 1; }) },"),
                "The end-turn step must outlast the foes' answering blows.");
        assertTrue(tutorial.contains("until: settled(function () { return flags.ulted; }),"),
                "The Ultimate step must outlast its own cinematic.");
        assertTrue(tutorial.contains("until: settled(function () { return !M.battle || M.battle.phase === 'WON'; }) },"),
                "The free-play step must outlast the killing blow.");
    }

    @Test
    void speedLessonShipsTeamSpeedAdvantageAndACompleteKeyUnderFreshPins() throws IOException {
        String tutorial = Files.readString(TUTORIAL_JS);
        String html = Files.readString(ADVENTURE_HTML);

        assertTrue(tutorial.contains("<b>Team Speed</b>"));
        assertTrue(tutorial.contains("<b>Advantage key</b>"));
        assertTrue(tutorial.contains("fastest to slowest"));

        // The SiegeKnight lesson told the player to tap the plate and then walked
        // straight on, so the sheet it was describing never opened and the two
        // effects it named were never seen. It waits for the tap, and the lesson
        // that explains them rings the effect cards inside the sheet.
        assertTrue(tutorial.contains("{ id: 'passive', hint: 'Tap your <b>SiegeKnight</b>'"),
                "The knight step must ask for the tap, not just mention it.");
        assertTrue(tutorial.contains("{ id: 'passive', hint: 'Tap your <b>SiegeKnight</b>', title: 'Passive and Ultimate', "
                        + "target: '#knightPlate',\n        body: 'Your SiegeKnight does not attack."
                        + " He gives a <b>passive</b> that is always running, and charges an <b>Ultimate</b>"
                        + " on the bar under his HP. <b>Tap the plate</b> to read both.',\n"
                        + "        until: function () { return !hidden('unitModal'); } },"),
                "It must WAIT for the sheet to open — without the wait, Got it skips the lesson that "
                        + "explains what the tap was for.");
        assertTrue(tutorial.contains("{ id: 'passive-cards'")
                        && tutorial.contains("target: '.um-effects', highlight: ['.um-effects'], avoid: '#unitModalClose',"),
                "The explanation must ring the two effect cards themselves. The sheet also lists the "
                        + "knight's own cards, so spotlighting the whole sheet points at the wrong half.");
        assertTrue(tutorial.contains("<b>' + esc(k.passiveName) + '</b> is the <b>passive</b>")
                        && tutorial.contains("<b>' + esc(k.ultimateName) +\n          '</b> is the <b>Ultimate</b>"),
                "Both effects must be named from the knight data the sheet itself renders from, so the "
                        + "copy cannot name something the player is not looking at.");
        // .um-effects is what adventure.js actually emits; a rename there would
        // leave the coach ringing nothing, silently.
        String adventureJs = Files.readString(Path.of("src/main/resources/static/js/adventure.js"));
        assertTrue(adventureJs.contains("<div class=\"um-cards-title\">Active effects</div><div class=\"um-effects\">"),
                "The unit sheet must still render its effects into .um-effects — that is the element "
                        + "the knight lesson spotlights.");
        // These pins are asserted so a content change cannot ship without a
        // refresh. They had gone stale on main — adventure.css had moved to 89
        // and adventure.js to 92 while the assertions still named 88 and 91,
        // so the test was red for everyone. Brought back in line, with
        // siege-tutorial at 16 for the evolved-card fix.
        // 4 for the .tut-locked rule: Siege shares coach.css, so a stale pin
        // here would leave the Siege coach without it.
        assertTrue(html.contains("/css/coach.css?v=4"), "coach.css pin");
        assertTrue(html.contains("/css/adventure.css?v=90"), "adventure.css pin");
        // 19, not 18: main bumped to 18 for its own siege-tutorial change and
        // this branch edits the same file, so the merged bytes need a number
        // neither side has shipped.
        assertTrue(html.contains("/js/siege-tutorial.js?v=19"), "siege-tutorial.js pin");
        assertTrue(html.contains("/js/adventure.js?v=94"), "adventure.js pin");
    }
}
