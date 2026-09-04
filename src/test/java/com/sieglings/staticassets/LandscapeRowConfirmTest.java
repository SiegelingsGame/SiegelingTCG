package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Compact landscape targeting dropped Confirm from the battle dock so the board
 * overlay could hold it. The overlay then hid itself whenever targeting was
 * active — which is the only moment a row ability needs Confirm — so a phone
 * in landscape could pick a row and never fire it.
 */
class LandscapeRowConfirmTest {

    private static final Path GAME_JS = Path.of("src/main/resources/static/js/game.js");

    @Test
    void compactLandscapeDockDoesNotCarryTheRowConfirmButtons() throws IOException {
        String tray = extractFunction(Files.readString(GAME_JS), "function renderBattleTargetingTray(");
        int compact = tray.indexOf("if (isCompactLandscapeLayout())");
        assertTrue(compact >= 0, "compact landscape still has its own targeting tray");
        int compactReturn = tray.indexOf("return compactHtml;", compact);
        assertTrue(compactReturn > compact, "compact landscape must return its own tray markup");
        String compactBranch = tray.substring(compact, compactReturn);
        assertFalse(compactBranch.contains("renderRowSelectBattleConfirm()"),
                "the compact dock must not be the confirm surface — that is the overlay's job");
        assertTrue(tray.substring(compactReturn).contains("renderRowSelectBattleConfirm()"),
                "portrait/desktop trays must still render Confirm in the dock");
    }

    @Test
    void overlayShowsConfirmWhileLandscapeRowTargetingIsActive() throws Exception {
        String overlay = extractFunction(Files.readString(GAME_JS), "function renderRowSelectBattleOverlay(");
        assertTrue(overlay.contains("isCompactLandscapeLayout()"),
                "the overlay is the compact-landscape confirm surface");
        assertTrue(overlay.contains("isBattleTargetSelectionActive()"),
                "it must key off targeting being active, not hide because of it");
        assertFalse(
                overlay.contains("if (isBattleTargetSelectionActive())")
                        && overlay.indexOf("hidden") < overlay.indexOf("renderRowSelectBattleConfirm()"),
                "hiding the overlay because targeting is active is the reported bug");

        String script = overlay + "\n"
                + "let compact = false, targeting = false, rowSelect = false, selected = false;\n"
                + "function isCompactLandscapeLayout() { return compact; }\n"
                + "function isBattleTargetSelectionActive() { return targeting; }\n"
                + "function isRowSelectBattleTargetContext() { return rowSelect; }\n"
                + "function renderRowSelectBattleConfirm() {\n"
                + "  return selected ? '<div class=\"battle-row-confirm\"><button class=\"battle-row-confirm-primary\">Confirm</button></div>' : '';\n"
                + "}\n"
                + "function run(c, t, r, s) {\n"
                + "  compact = c; targeting = t; rowSelect = r; selected = s;\n"
                + "  const overlayEl = { className: 'battle-row-confirm-overlay hidden', innerHTML: '' };\n"
                + "  global.document = { getElementById: () => overlayEl };\n"
                + "  renderRowSelectBattleOverlay();\n"
                + "  const visible = overlayEl.className === 'battle-row-confirm-overlay'\n"
                + "      && overlayEl.innerHTML.includes('battle-row-confirm-primary');\n"
                + "  return visible ? 'SHOW' : 'HIDE';\n"
                + "}\n"
                + "const cases = [\n"
                + "  run(true, true, true, true),\n"   // landscape + targeting + row picked
                + "  run(true, true, true, false),\n"  // landscape + targeting, no row yet
                + "  run(false, true, true, true),\n"  // portrait: tray owns Confirm
                + "  run(true, false, true, true),\n"  // not targeting
                + "  run(true, true, false, true)\n"   // single-cell targeting, not a row
                + "];\n"
                + "console.log(cases.join(','));\n";

        assertEquals("SHOW,HIDE,HIDE,HIDE,HIDE", node(script).trim(),
                "Confirm must appear on the board overlay only for compact-landscape row targeting after a row is picked");
    }

    private String extractFunction(String source, String signature) {
        int start = source.indexOf(signature);
        assertTrue(start >= 0, "game.js still declares: " + signature);
        int depth = 0;
        int brace = source.indexOf('{', start);
        for (int i = brace; i < source.length(); i++) {
            char ch = source.charAt(i);
            if (ch == '{') {
                depth++;
            } else if (ch == '}') {
                depth--;
                if (depth == 0) {
                    return source.substring(start, i + 1);
                }
            }
        }
        throw new AssertionError("unbalanced braces reading " + signature);
    }

    private String node(String script) throws IOException, InterruptedException {
        Path tmp = Files.createTempFile("landscape-row-confirm-", ".js");
        try {
            Files.writeString(tmp, script);
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
}
