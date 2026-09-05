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
    void speedLessonShipsTeamSpeedAdvantageAndACompleteKeyUnderFreshPins() throws IOException {
        String tutorial = Files.readString(TUTORIAL_JS);
        String html = Files.readString(ADVENTURE_HTML);

        assertTrue(tutorial.contains("<b>Team Speed</b>"));
        assertTrue(tutorial.contains("<b>Advantage key</b>"));
        assertTrue(tutorial.contains("fastest to slowest"));
        // These pins are asserted so a content change cannot ship without a
        // refresh. They had gone stale on main — adventure.css had moved to 89
        // and adventure.js to 92 while the assertions still named 88 and 91,
        // so the test was red for everyone. Brought back in line, with
        // siege-tutorial at 16 for the evolved-card fix.
        // 4 for the .tut-locked rule: Siege shares coach.css, so a stale pin
        // here would leave the Siege coach without it.
        assertTrue(html.contains("/css/coach.css?v=4"), "coach.css pin");
        assertTrue(html.contains("/css/adventure.css?v=89"), "adventure.css pin");
        assertTrue(html.contains("/js/siege-tutorial.js?v=16"), "siege-tutorial.js pin");
        assertTrue(html.contains("/js/adventure.js?v=92"), "adventure.js pin");
    }
}
