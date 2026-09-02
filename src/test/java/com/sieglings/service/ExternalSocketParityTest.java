package com.sieglings.service;

import com.sieglings.model.enums.NotchDirection;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The Arena tutorial recommends an opening cell by working out where the
 * selected card's notches would reach a perimeter socket. That is a *server*
 * rule ({@link PlacementService#resolveExternalSocketKey}) mirrored in
 * js/arena-tutorial.js, and CLAUDE.md's parity rule says both halves have to
 * move together — a coach that rings a cell the server does not score teaches
 * a rule the game does not have.
 *
 * <p>So this does not grep the JavaScript for a phrase: it <em>runs</em> it.
 * Every (row, col, direction) the board can produce goes through the real
 * Java method and through the real JS function in Node, and the two verdicts
 * must agree on all 72 of them.
 */
class ExternalSocketParityTest {

    private static final Path ARENA_TUTORIAL = Path.of("src/main/resources/static/js/arena-tutorial.js");

    @Test
    void socketRecommendationAgreesWithTheServerOnEveryCell() throws Exception {
        String js = Files.readString(ARENA_TUTORIAL);
        String fn = extractFunction(js, "function socketScore(card, r, c) {");

        PlacementService placement = new PlacementService();
        List<String> cases = new ArrayList<>();
        List<Boolean> javaSays = new ArrayList<>();
        for (int row = 0; row <= 2; row++) {
            for (int col = 0; col <= 2; col++) {
                for (NotchDirection dir : NotchDirection.values()) {
                    // The player's side is the only one the coach ever advises on.
                    boolean opens = placement.resolveExternalSocketKey(row, col, true, dir) != null;
                    cases.add(row + "," + col + "," + dir.name());
                    javaSays.add(opens);
                }
            }
        }

        List<Boolean> jsSays = runInNode(fn, cases);
        assertEquals(cases.size(), jsSays.size(), "the JS harness answered every case");
        for (int i = 0; i < cases.size(); i++) {
            assertEquals(javaSays.get(i), jsSays.get(i),
                    "row,col,direction " + cases.get(i)
                            + ": PlacementService says " + (javaSays.get(i) ? "socket" : "no socket")
                            + " but the tutorial's socketScore disagrees");
        }
        assertTrue(javaSays.contains(Boolean.TRUE), "the sweep actually covers some sockets");
    }

    @Test
    void aNeutralNotchOpensNoCallWell() throws Exception {
        // EnergyService.collectExternalSocketTouches skips NEUTRAL, so a neutral
        // notch on the edge is not a reason to recommend that cell.
        String fn = extractFunction(Files.readString(ARENA_TUTORIAL), "function socketScore(card, r, c) {");
        String script = fn + "\nconst card = { notches: [{ direction: 'LEFT', element: 'NEUTRAL' }] };\n"
                + "console.log(socketScore(card, 0, 0) === 0 ? 'OK' : 'FAIL');\n";
        assertEquals("OK", node(script).trim(), "a NEUTRAL edge notch must score zero");
    }

    /** Runs the extracted function over every case, one verdict per line. */
    private List<Boolean> runInNode(String fn, List<String> cases) throws Exception {
        StringBuilder script = new StringBuilder(fn).append("\nconst cases = [\n");
        for (String c : cases) {
            String[] parts = c.split(",");
            script.append("  [").append(parts[0]).append(",").append(parts[1])
                  .append(",'").append(parts[2]).append("'],\n");
        }
        script.append("];\nfor (const [r, c, dir] of cases) {\n")
              .append("  const card = { notches: [{ direction: dir, element: 'FIRE' }] };\n")
              .append("  console.log(socketScore(card, r, c) > 0 ? 'true' : 'false');\n}\n");

        List<Boolean> out = new ArrayList<>();
        for (String line : node(script.toString()).split("\\R")) {
            if (line.isBlank()) continue;
            out.add(Boolean.parseBoolean(line.trim()));
        }
        return out;
    }

    private String node(String script) throws IOException, InterruptedException {
        Path tmp = Files.createTempFile("socket-parity", ".js");
        try {
            Files.writeString(tmp, script, StandardCharsets.UTF_8);
            Process p = new ProcessBuilder("node", tmp.toString())
                    .redirectErrorStream(true)
                    .start();
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(p.waitFor(60, TimeUnit.SECONDS), "node finished");
            assertEquals(0, p.exitValue(), "node ran the extracted function cleanly:\n" + out);
            return out;
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    /** Slices one top-level function out of the IIFE by brace balance. */
    private String extractFunction(String source, String signature) {
        int start = source.indexOf(signature);
        assertTrue(start >= 0, "arena-tutorial.js still declares: " + signature);
        int depth = 0;
        for (int i = source.indexOf('{', start); i < source.length(); i++) {
            char ch = source.charAt(i);
            if (ch == '{') depth++;
            else if (ch == '}') {
                depth--;
                if (depth == 0) return source.substring(start, i + 1);
            }
        }
        throw new AssertionError("unbalanced braces reading " + signature);
    }
}
