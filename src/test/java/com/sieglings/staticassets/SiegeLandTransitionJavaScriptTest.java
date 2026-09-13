package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A Land used to change under the player with nothing but a repainted map
 * banner. The interstitial that announces it has three parts that can rot
 * independently — the markup it fills, the change detection that decides when to
 * play it, and the styles that make it a full-screen moment — so each is pinned
 * here.
 */
class SiegeLandTransitionJavaScriptTest {

    private static String read(String path) throws Exception {
        return Files.readString(Path.of(path));
    }

    @Test
    void landChangesPlayAnInterstitialThatCannotFireOnAFreshOrResumedRun() throws Exception {
        String html = read("src/main/resources/static/adventure.html");
        String js = read("src/main/resources/static/js/adventure.js");
        String css = read("src/main/resources/static/css/adventure.css");

        assertTrue(html.contains("id=\"landTransition\"") && html.contains("id=\"ltName\"")
                        && html.contains("id=\"ltEyebrow\"") && html.contains("id=\"ltSkip\""),
                "the Land interstitial markup must ship in adventure.html");

        // Both ways a run changes Land, told apart by the boss counter.
        assertTrue(js.contains("var wasBoss = segment > prev.segment;")
                        && js.contains("'Boss felled'") && js.contains("'The land shifts'"),
                "a boss transition and a Rift crossing must read differently");
        // The guard that keeps it from firing on a run that never left a Land:
        // a fresh run and a resumed save both arrive with no remembered Land.
        assertTrue(js.contains("if (!prev) { noteLandShown(run); return; }")
                        && js.contains("if (prev.id === land.id && prev.segment === segment) return;"),
                "the interstitial must only play on an actual change the player can see");
        assertTrue(js.contains("state.landView = null"),
                "starting or dropping a run must forget the previous run's Land");
        // It plays after renderLand, so the map behind it is already the new Land.
        assertTrue(js.indexOf("renderLand(run);\n    // After renderLand") > 0
                        && js.contains("maybeLandTransition(run);"),
                "the map under the interstitial must already show the new Land");
        assertTrue(js.contains("state.landTransition = true;") && js.contains("state.landTransition = false;")
                        && js.contains("return !!state.busy || !!state.landTransition;"),
                "the coach must hold its tips while the interstitial covers the map");
        assertTrue(js.contains("endLandTransition") && js.contains("LAND_TRANSITION_MS")
                        && js.contains("LAND_TRANSITION_REDUCED_MS"),
                "the interstitial must be skippable and must lift on its own");

        assertTrue(css.contains(".land-transition{position:fixed;inset:0;"),
                "the interstitial must cover the viewport instead of sitting inside a screen's flex column");
        assertTrue(css.contains("@keyframes ltEmblem") && css.contains("@keyframes ltName")
                        && css.contains("@keyframes ltArt"),
                "the Land reveal must actually be animated");
        // Reduced motion keeps the announcement and drops only the movement.
        assertTrue(css.contains(".land-transition,.land-transition.leaving,.land-transition .lt-art"),
                "prefers-reduced-motion must strip the animation without hiding the announcement");
    }
}
