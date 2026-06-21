package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameJavaScriptRegressionTest {

    private static final Path GAME_JS = Path.of("src/main/resources/static/js/game.js");
    private static final Path HOME_JS = Path.of("src/main/resources/static/js/home.js");
    private static final Path CARD_DASHBOARD_JS = Path.of("src/main/resources/static/js/card-dashboard.js");

    @Test
    void onlineStartDoesNotFallBackToSoloBattle() throws IOException {
        String startSelectedGame = extractFunction(readGameScript(), "async function startSelectedGame()");

        assertFalse(
                startSelectedGame.contains("matchMode = 'solo';"),
                "Online match startup must not silently switch to solo/PvE when room resume or join fails."
        );
        assertTrue(
                startSelectedGame.contains("await createRoom();") && startSelectedGame.contains("await joinRoom();"),
                "Online startup should explicitly route through online room create/join flows."
        );
    }

    @Test
    void hiddenOnlineLoadoutDoesNotClearSocialInviteMode() throws IOException {
        String gameScript = readGameScript();

        assertTrue(
                gameScript.contains("if (hideOnlineLoadout && matchMode === 'online' && !multiplayerSession?.roomId && !inviteFlow)"),
                "Social invite launches must keep online mode even when the standalone Play online UI is hidden."
        );
    }

    @Test
    void homePlayLoadoutUsesSelectedAndSavedDecks() throws IOException {
        String homeScript = readHomeScript();
        String selectedDeckId = extractFunction(homeScript, "function selectedDeckId()");
        String queuePlayLoadout = extractFunction(homeScript, "function queuePlayLoadout(payload = {})");

        assertTrue(
                selectedDeckId.contains("state.selectedDeckId"),
                "Home deck selection must be honored instead of always using the default deck."
        );
        assertTrue(
                selectedDeckId.contains("selectedSavedDeck()"),
                "Saved preset deck selections should resolve to their saved preset id."
        );
        assertTrue(
                queuePlayLoadout.contains("savedDeck?.custom") && queuePlayLoadout.contains("customDeckCards"),
                "Saved custom decks must carry their custom card list into the Play loadout payload."
        );
    }

    @Test
    void packOpeningPurchaseDoesNotAbortAfterServerMayHaveCommitted() throws IOException {
        String choosePack = extractFunction(readHomeScript(), "async function choosePack(packId, count = 1)");

        assertFalse(
                choosePack.contains("timeoutMs"),
                "Pack opening is a non-idempotent purchase; client aborts can hide a successful charge and invite retry."
        );
        assertTrue(
                choosePack.contains("packOpenRequestFor(packId, packCount)"),
                "Shop pack opening should create or reuse an idempotency key before posting."
        );
        assertTrue(
                choosePack.contains("requestId: packRequest?.requestId"),
                "The idempotency key must be sent to the server with the pack-open request."
        );
        assertTrue(
                choosePack.contains("clearPackOpenRequest(packRequest.requestId)"),
                "The idempotency key should only be cleared after a confirmed server response."
        );
    }

    @Test
    void dashboardArtUploadsApplyToOriginalSelection() throws IOException {
        String dashboardScript = readCardDashboardScript();

        assertTrue(
                dashboardScript.contains("const uploadedCard = findCardById(cardId);"),
                "Card art upload completion must update the card id captured when the upload started."
        );
        assertTrue(
                dashboardScript.contains("const uploadedTrainer = findTrainerById(trainerId);"),
                "SiegeKnight art upload completion must update the trainer id captured when the upload started."
        );
        assertFalse(
                dashboardScript.contains("mutateSelectedCard((selected) => {\n                    selected.cardArtUrl = hostedUrl;"),
                "Card art upload completion must not write the hosted URL onto the current selection."
        );
        assertFalse(
                dashboardScript.contains("mutateSelectedTrainer((selected) => {\n                    selected.cardArtUrl = hostedUrl;"),
                "SiegeKnight art upload completion must not write the hosted URL onto the current selection."
        );
    }

    private static String readGameScript() throws IOException {
        return Files.readString(GAME_JS);
    }

    private static String readHomeScript() throws IOException {
        return Files.readString(HOME_JS);
    }

    private static String readCardDashboardScript() throws IOException {
        return Files.readString(CARD_DASHBOARD_JS);
    }

    private static String extractFunction(String source, String signature) {
        int start = source.indexOf(signature);
        assertTrue(start >= 0, "Could not find " + signature);

        int paramsEnd = source.indexOf(')', start);
        assertTrue(paramsEnd >= 0, "Could not find function parameters for " + signature);

        int braceStart = source.indexOf('{', paramsEnd);
        assertTrue(braceStart >= 0, "Could not find function body for " + signature);

        int depth = 0;
        for (int i = braceStart; i < source.length(); i++) {
            char current = source.charAt(i);
            if (current == '{') {
                depth++;
            } else if (current == '}') {
                depth--;
                if (depth == 0) {
                    return source.substring(braceStart, i + 1);
                }
            }
        }

        throw new AssertionError("Could not find end of function body for " + signature);
    }
}
