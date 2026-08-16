package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
        // Cache pins only move forward, so this is a floor: pinning the exact version
        // made every later, unrelated Adventure bump red.
        Matcher pin = Pattern.compile("/js/adventure\\.js\\?v=(\\d+)")
                .matcher(Files.readString(ADVENTURE_HTML));
        assertTrue(pin.find(), "adventure.html must load adventure.js with a cache pin.");
        assertTrue(Integer.parseInt(pin.group(1)) >= 60,
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
