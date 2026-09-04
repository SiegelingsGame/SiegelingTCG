package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The mulligan redraw turns the swapped cards face-down, lets the server's new
 * cards land behind the backs, turns them forward and holds a beat before the
 * board takes over.
 *
 * Every assertion here pins something that broke, or would silently break the
 * effect, while it was being built — not the shape of the code for its own sake.
 */
class MulliganRedrawRevealTest {

    private static String read(String path) throws Exception {
        return Files.readString(Path.of(path));
    }

    @Test
    void revealSurvivesTheStateUpdateThatEndsTheMulligan() throws Exception {
        String game = read("src/main/resources/static/js/game.js");

        // The server calls the mulligan over as soon as the redraw lands. There are
        // TWO places that hide the overlay on that signal, and a reveal that only
        // guarded one of them would be yanked off screen halfway through.
        assertTrue(game.contains("if (!gameState?.mulligan?.active && mulliganRevealHold)"),
                "renderMulliganOverlay must hold the overlay open while the reveal plays.");
        assertTrue(game.contains("if (!gameState?.mulligan?.active && !mulliganRevealHold)"),
                "syncEntryOverlays must honour the same hold — it is the second hide path.");

        // Slot classes come from state, not from a one-off DOM poke: the POST
        // resolving re-renders the whole preview, and in multiplayer the waiting
        // poll re-renders again on top of that.
        assertTrue(game.contains("flipping ? 'is-flipping' : ''")
                        && game.contains("flipping && mulliganFaceDown ? 'is-face-down' : ''"),
                "The flip classes must be rendered from mulliganFlipIndices/mulliganFaceDown so a "
                        + "re-render mid-animation cannot drop them.");

        // ...but the turn BACK has to be a class removal on the live nodes, because
        // a re-render hands back fresh elements already at rest and the CSS
        // transition never runs.
        assertTrue(game.contains("function revealMulliganFlippedSlots()")
                        && game.contains("slot.classList.remove('is-face-down')"),
                "The turn back must remove the class from the live slots so the transition runs.");

        // The banner is fixed at z-index 860 against the overlay's 70, so it would
        // punch through the reveal and announce a phase the player is not in yet.
        assertTrue(game.contains("if (mulliganRevealHold) {\n        return mulliganRevealSettled()"),
                "The phase transition banner must queue behind the reveal rather than draw over it.");

        // Quitting mid-reveal must not leave the hold latched, or the overlay pins
        // itself open over the loadout screen.
        assertTrue(game.split("clearMulliganReveal\\(\\);", -1).length - 1 >= 4,
                "clearMulliganReveal must run on the failure and quit paths, not just on success.");

        assertTrue(game.contains("const MULLIGAN_REVEAL_HOLD_MS = 1000"),
                "The new cards are held for a beat before the board takes over.");
    }

    @Test
    void theTurnItselfIsLayoutAgnostic() throws Exception {
        String css = read("src/main/resources/static/css/style.css");

        // The effect rides .mulligan-card-slot, the one box every layout already
        // sizes (phone, landscape and the compact grid all restyle it), so the turn
        // follows the card at every breakpoint without a per-layout rule.
        assertTrue(css.contains(".mulligan-card-slot.is-flipping {")
                        && css.contains(".mulligan-card-slot.is-flipping.is-face-down {"),
                "The flip must be driven from the slot, which every layout already sizes.");
        assertTrue(css.contains("transform: perspective(900px) rotateY(180deg)"),
                "perspective() belongs in the transform so nothing above the slot needs to know.");
        assertTrue(css.contains(".mulligan-card-slot.is-flipping::after"),
                "The card back is the slot's own back face.");

        // Without this the front stays visible through the turn and there is no flip.
        assertTrue(css.contains(".mulligan-card-slot.is-flipping .mulligan-card-face {")
                        && css.contains("backface-visibility: hidden"),
                "The face must hide once it turns past edge-on.");

        // The wrapper carries the geometry the card used to take from the slot, and
        // carries it always — sizing it only while flipping reflows the card the
        // instant the turn begins.
        assertTrue(css.contains(".mulligan-card-face {\n    display: flex;"),
                "The face wrapper needs its geometry outside the .is-flipping state too.");

        // A holographic card renders as a bare .binder-full-card-art; it now sits one
        // level deeper, and the rule that fills the slot has to follow it down.
        assertTrue(css.contains(".mulligan-card-slot .mulligan-card-face > .binder-full-card-art"),
                "Full-art mulligan cards must still fill the slot through the new wrapper.");

        assertTrue(css.contains("@media (prefers-reduced-motion: reduce)")
                        && css.contains(".mulligan-card-slot.is-flipping::after {\n        display: none;"),
                "The turn is decoration; reduced-motion users still get the new hand.");
    }
}
