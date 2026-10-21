package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Removing the welcome screen left the battle picker as the only Play screen.
 * Two layers that used to sit in the right order relative to that welcome
 * screen then covered the controls the player has to touch.
 */
class PlayEntryStackingTest {

    @Test
    void startupVeilStaysUnderTheLoadoutAndSignInStaysOverIt() throws Exception {
        String css = Files.readString(Path.of("src/main/resources/static/css/style.css"));
        int veil = zIndex(css, "html.play-startup body::before");
        int loadout = zIndex(css, ".loadout-overlay {");
        int playAuth = zIndex(css, "#authPopupOverlay {");
        int sharedAuth = zIndex(css, ".auth-popup-overlay {");

        assertTrue(veil < loadout,
                "The startup veil (z-index " + veil + ") must stay under the loadout ("
                        + loadout + "), or /play is a blank screen until game options return.");
        assertTrue(playAuth > loadout,
                "Play's sign-in popup (z-index " + playAuth + ") must sit over the loadout ("
                        + loadout + "), or Sign In opens where it cannot be clicked.");
        assertTrue(sharedAuth < loadout,
                "The shared auth class stays at " + sharedAuth
                        + " so the hub modal is not lifted with the Play popup.");
        assertTrue(css.contains("html.play-startup body > :not(#loadoutOverlay):not(#authPopupOverlay)"),
                "The startup hide rule must leave the sign-in popup visible. It is a sibling of "
                        + "the loadout, so hiding every other body child blanks the form the player just opened.");
    }

    private static int zIndex(String css, String marker) {
        int from = 0;
        while (from < css.length()) {
            int at = css.indexOf(marker, from);
            if (at < 0) {
                throw new AssertionError("missing " + marker);
            }
            int end = css.indexOf('}', at);
            Matcher matcher = Pattern.compile("z-index:\\s*(\\d+)").matcher(css.substring(at, end));
            if (matcher.find()) {
                return Integer.parseInt(matcher.group(1));
            }
            from = end + 1;
        }
        throw new AssertionError("no z-index after " + marker);
    }
}
