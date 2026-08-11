package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AdventureLinePuzzleJavaScriptTest {

    private static final Path ADVENTURE_JS = Path.of("src/main/resources/static/js/adventure.js");
    private static final Path ADVENTURE_HTML = Path.of("src/main/resources/static/adventure.html");

    @Test
    void linePuzzleStopsDrawingAtTheMatchingRune() throws IOException {
        String lineMove = extractFunction(Files.readString(ADVENTURE_JS), "function lineMove(e, st)");
        int completePath = lineMove.indexOf("path.push([r, c]);");
        int stopDrawing = lineMove.indexOf("st.drawing = null;", completePath);

        assertTrue(completePath >= 0 && stopDrawing > completePath,
                "A line path must lock as soon as it reaches its twin so pointer drift cannot extend it.");
    }

    @Test
    void endpointLockShipsWithAFreshCachePin() throws IOException {
        assertTrue(Files.readString(ADVENTURE_HTML).contains("/js/adventure.js?v=61"),
                "The endpoint-lock client fix must ship under a fresh Adventure bundle URL.");
    }

    private static String extractFunction(String source, String signature) {
        int start = source.indexOf(signature);
        assertTrue(start >= 0, "Could not find " + signature);
        int braceStart = source.indexOf('{', source.indexOf(')', start));
        int depth = 0;
        for (int i = braceStart; i < source.length(); i++) {
            char current = source.charAt(i);
            if (current == '{') depth++;
            else if (current == '}' && --depth == 0) return source.substring(braceStart, i + 1);
        }
        throw new AssertionError("Could not find end of " + signature);
    }
}
