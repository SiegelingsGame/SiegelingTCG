package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KeepStaticAssetsRegressionTest {

    private static final Path KEEP_HTML = Path.of("src/main/resources/static/keep.html");
    private static final Path KEEP_CSS = Path.of("src/main/resources/static/css/keep.css");

    @Test
    void accessOverlayAndSceneryGateUseDistinctSelectors() throws IOException {
        String markup = Files.readString(KEEP_HTML);
        String styles = Files.readString(KEEP_CSS);

        assertTrue(
                markup.contains("class=\"keep-gate hidden\" id=\"keepGate\"")
                        && styles.contains(".keep-loading,\n.keep-gate {")
                        && styles.contains("position: fixed;"),
                "The signed-out access gate must remain a full-viewport overlay."
        );
        assertTrue(
                markup.contains("<span class=\"keep-wall-gate\"><i></i></span>")
                        && styles.contains(".keep-wall-gate { position: absolute;"),
                "The Covenant wall gate must use its own scenery selector."
        );
        assertFalse(
                markup.contains("<span class=\"keep-gate\"><i></i></span>"),
                "Scenery must not reuse the access-overlay class and override its layout."
        );
    }
}
