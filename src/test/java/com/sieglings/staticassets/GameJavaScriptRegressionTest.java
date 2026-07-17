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
    private static final Path HOME_HTML = Path.of("src/main/resources/static/home.html");
    private static final Path CARD_DASHBOARD_JS = Path.of("src/main/resources/static/js/card-dashboard.js");
    private static final Path STYLE_CSS = Path.of("src/main/resources/static/css/style.css");

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
    void loadoutOpeningHintsKeepZeroCostStartersOnly() throws IOException {
        String gameScript = readGameScript();
        String openingHints = extractFunction(gameScript, "function getDeckOpeningHandHints()");

        assertTrue(
                openingHints.contains("type === 'SIEGLING'")
                        && openingHints.contains("!card.evolvesFromId && !card.evolvesFromName")
                        && openingHints.contains("directCost <= 0"),
                "Opening hand keeps must be limited to 0-cost base-starter Siegelings, since only a free Siegling can be placed on turn one."
        );
        assertFalse(
                openingHints.contains("isFreeAction"),
                "Free non-Siegling utility cards (spells/traps) must no longer be listed as opening hand keeps."
        );
    }

    @Test
    void battleDeckPreviewUsesBinderCardTemplates() throws IOException {
        String gameScript = readGameScript();
        String deckPreview = extractFunction(gameScript, "function renderDesktopDeckPreview()");
        String deckCard = extractFunction(gameScript, "function renderDesktopDeckTemplateCard(card)");

        assertTrue(
                deckPreview.contains("renderDesktopDeckTemplateCard(row.card)")
                        && deckCard.contains("binderVisual.renderBinderCardTile(card"),
                "The Battle Table Deck tab must reuse the binder's painted card-template renderer."
        );
        assertFalse(
                deckPreview.contains("desktop-deck-icon-face") || deckPreview.contains("getDeckCardMonogram"),
                "The Deck tab must not fall back to the old monogram card design."
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
    void shopPackOpeningUsesPersistentIdempotencyKey() throws IOException {
        String homeScript = readHomeScript();
        String choosePack = extractFunction(homeScript, "async function choosePack(packId, count = 1)");
        String getOrCreateRequestId = extractFunction(homeScript, "function getOrCreatePackOpenRequestId(packId, count)");

        assertTrue(
                choosePack.contains("getOrCreatePackOpenRequestId(packId, packCount)")
                        && choosePack.contains("requestId"),
                "Shop pack opens must send a persistent request id so retries can be deduped."
        );
        assertFalse(
                choosePack.contains("if (!data?.timedOut) clearPackOpenRequestId(requestId);"),
                "Ambiguous pack-open failures must preserve the request id; the server may have charged before the response was lost."
        );
        assertTrue(
                homeScript.contains("timedOut: true"),
                "Timed-out pack opens must be distinguishable so the retry id is preserved."
        );
        assertTrue(
                getOrCreateRequestId.contains("...readPendingPackOpenRequests()"),
                "Creating one pending pack open must not overwrite unrelated pack/count retries."
        );
    }

    @Test
    void shopCardPreviewHasModalShellForRenderedDetails() throws IOException {
        String homeScript = readHomeScript();
        String homeMarkup = Files.readString(HOME_HTML);

        assertTrue(
                extractFunction(homeScript, "function renderShopCardPreviewModal()").contains("shopCardPreviewModal")
                        && homeMarkup.contains("id=\"shopCardPreviewModal\"")
                        && homeMarkup.contains("id=\"shopCardPreviewBody\""),
                "Shop Card View must include the modal and body nodes that renderShopCardPreviewModal() updates."
        );
        assertTrue(
                homeMarkup.contains("data-shop-card-preview-backdrop")
                        && homeMarkup.contains("data-close-shop-card-preview"),
                "Shop card preview modal must keep backdrop and close-button hooks so users can dismiss it."
        );
    }

    @Test
    void shopPacksCacheRejectsEmptyOrErroredPayloads() throws IOException {
        String homeScript = readHomeScript();
        String fetchCachedJson = extractFunction(homeScript, "async function fetchCachedJson(cacheKey, path, ttlMs, isValid = null)");
        String readCache = extractFunction(homeScript, "function readCache(cacheKey, ttlMs, isValid = null)");
        String shopValidator = extractFunction(homeScript, "function isValidShopPacksPayload(data)");

        assertTrue(
                homeScript.contains("fetchCachedJson('shopPacks', '/api/shop/packs', STATIC_CACHE_TTL_MS, isValidShopPacksPayload)"),
                "Shop packs must use a validator so an empty cached payload cannot pin the Shop to No packs available."
        );
        assertTrue(
                fetchCachedJson.contains("!data.error") && fetchCachedJson.contains("(!isValid || isValid(data))"),
                "Errored or invalid Shop pack responses must not be written to the one-day static cache."
        );
        assertTrue(
                readCache.contains("clearCache(cacheKey)") && shopValidator.contains("data?.packs") && shopValidator.contains("data.packs.length > 0"),
                "Invalid cached Shop pack payloads must be cleared before falling back to the network."
        );
    }

    @Test
    void closeHostLobbyDoesNotSendCookieSentinelAsBearerToken() throws IOException {
        String closeHostLobby = extractFunction(readHomeScript(), "async function closeHostLobby(lobby)");

        assertTrue(
                closeHostLobby.contains("isLegacyBearerToken(state.token)"),
                "Cookie-auth users must rely on the session cookie instead of sending Authorization: Bearer cookie."
        );
    }

    @Test
    void signedInGameOptionsBypassSharedGuestCache() throws IOException {
        String homeScript = readHomeScript();

        assertTrue(
                homeScript.contains("function gameOptionsCacheKey()")
                        && homeScript.contains("'gameOptions:signed-in'")
                        && homeScript.contains("'gameOptions:guest'")
                        && extractFunction(homeScript, "async function fetchGameOptions()").contains("if (!state.token)")
                        && extractFunction(homeScript, "async function submitAuth(mode)").contains("await refreshLiveCatalog()"),
                "Signed-in binder loads must not reuse the guest gameOptions cache."
        );
    }

    @Test
    void guestBinderUsesFullTrainerCatalogFromOptions() throws IOException {
        String homeScript = readHomeScript();

        assertTrue(
                homeScript.contains("const GUEST_TRAINER_IDS = new Set(['squire-bob', 'pyla', 'ser-airek'])")
                        && extractFunction(homeScript, "function isTrainerOwned(trainerId)").contains("GUEST_TRAINER_IDS.has"),
                "Guest binder browsing must use the full trainer catalog while play keeps starter knights only."
        );
    }

    @Test
    void dailyOfferCardUsesOfferArtWhenKnightMissingFromOptions() throws IOException {
        String homeScript = readHomeScript();

        assertTrue(
                extractFunction(homeScript, "function dailyOfferCard(offer)").contains("offer.cardArtUrl || knight?.cardArtUrl")
                        && extractFunction(homeScript, "function dailyOfferCard(offer)").contains("type: 'SIEGEKNIGHT'")
                        && extractFunction(homeScript, "function isDailyTrainerOffer(offer)").contains("TRAINER"),
                "Daily shop SiegeKnights must render from offer art when /api/game/options omits that knight."
        );
    }

    @Test
    void dashboardArtUploadsApplyToCapturedCatalogEntry() throws IOException {
        String dashboardScript = Files.readString(CARD_DASHBOARD_JS);

        assertTrue(
                dashboardScript.contains("mutateCardById(cardId, (selected) =>"),
                "Card art upload completions must update the card id captured when the upload started."
        );
        assertTrue(
                dashboardScript.contains("mutateTrainerById(trainerId, (selected) =>"),
                "SiegeKnight art upload completions must update the trainer id captured when the upload started."
        );
        assertFalse(
                dashboardScript.contains("mutateSelectedCard((selected) => {\n                    selected.cardArtUrl = hostedUrl;"),
                "Card art upload completions must not write to whichever card is selected when the request finishes."
        );
        assertFalse(
                dashboardScript.contains("mutateSelectedTrainer((selected) => {\n                    selected.cardArtUrl = hostedUrl;"),
                "SiegeKnight art upload completions must not write to whichever trainer is selected when the request finishes."
        );
    }

    @Test
    void holographicFullCardArtStaysOutOfBattleAndSupportsPublicComparison() throws IOException {
        String homeScript = readHomeScript();
        String dashboardScript = Files.readString(CARD_DASHBOARD_JS);
        String binderScript = Files.readString(Path.of("src/main/resources/static/js/card-binder-visual.js"));
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));
        String fullCardRenderer = extractFunction(binderScript, "function renderFullCardArt(");

        assertTrue(
                binderScript.contains("options.useHolographicFullCardArt")
                        && binderScript.contains("card?.holographicCardArtUrl")
                        && binderScript.contains("holographic-card-name")
                        && binderScript.contains("holographic-card-stats")
                        && binderScript.contains("holographic-card-stat-hp")
                        && binderScript.contains("holographic-card-stat-spd")
                        && binderScript.contains("renderHolographicNotches(card?.notches)")
                        && binderScript.contains("holographicCardArtScale"),
                "The full-card holographic asset must require an explicit binder-view option."
        );
        assertTrue(
                homeScript.contains("data-card-art-stack")
                        && homeScript.contains("data-card-art-toggle=\"HOLOGRAPHIC\"")
                        && homeScript.contains("detailArtSwipeStartX")
                        && homeScript.contains("return Boolean(String(card?.holographicCardArtUrl || '').trim());")
                        && homeScript.contains("LOCKED — Upgrade this card's holographic finish")
                        && homeScript.contains("holographic: variant === 'HOLOGRAPHIC'"),
                "Card detail must expose every available art variant while marking unowned holographic previews as locked."
        );
        assertTrue(
                dashboardScript.contains("selected.holographicCardArtUrl = hostedUrl")
                        && dashboardScript.contains("holographicCardArtScale")
                        && dashboardScript.contains("formData.append(\"artVariant\", artVariant)"),
                "Dashboard holographic uploads must save to their own catalog field and upload variant."
        );
        assertTrue(
                fullCardRenderer.indexOf("renderHolographicOverlay()")
                        < fullCardRenderer.indexOf("renderHolographicCardData(card, options)")
                        && fullCardRenderer.contains("isHolographic(card, options) && !usesHolographicArtwork"),
                "Custom holographic data must render above its foil, without a second outer foil layer."
        );
        assertTrue(
                homeCss.contains(".holographic-card-art-canvas > .card-holographic-overlay")
                        && homeCss.contains(".holographic-card-art-canvas > .binder-full-card-art-image")
                        && homeCss.contains("object-fit: contain")
                        && homeCss.contains("object-position: center")
                        && homeCss.contains("top: 10.6%")
                        && homeCss.contains("top: 69.8%")
                        && homeCss.contains("top: 74%")
                        && homeCss.contains(".holographic-card-stat-hp")
                        && homeCss.contains(".holographic-card-stat-spd")
                        && homeCss.contains(".holographic-card-notch-bottom-left")
                        && homeCss.contains(".holographic-card-notch-bottom-right")
                        && homeCss.contains("padding: 1px 3px")
                        && homeCss.contains("font-size: clamp(7px, 4.9cqi, 12px)"),
                "Custom holographic art must preserve its complete frame while labels stay in the template's name, stat, and description zones."
        );
    }

    @Test
    void minimizedMobileHudReturnsTheFullViewportToContent() throws IOException {
        String homeScript = readHomeScript();
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));

        assertTrue(
                homeScript.contains("style.setProperty('--bottom-hud-height', '0px')")
                        && homeCss.contains("body.hud-minimized .home-main")
                        && homeCss.contains("padding-bottom: var(--device-safe-bottom)")
                        && homeCss.contains("scroll-padding-bottom: var(--device-safe-bottom)"),
                "Minimizing the phone HUD must remove its reserved content and tray space."
        );
    }

    @Test
    void selectedLoadoutCommanderUsesUploadedCardArt() throws IOException {
        String gameScript = readGameScript();
        String commanderArt = extractFunction(gameScript, "function renderLoadoutCommanderArt(trainer)");
        String loadoutPreview = extractFunction(gameScript, "function renderSelectedLoadoutPreview()");

        assertTrue(
                commanderArt.contains("knightUploadedCardArtUrl(trainer)")
                        && commanderArt.contains("artMode === 'FULL_CARD'")
                        && commanderArt.contains("knightHudOverlayCardInnerHtml(trainer, artUrl)")
                        && commanderArt.contains("has-knight-back"),
                "Commander summaries must show uploaded full-card or overlay art and reserve the card back for the no-art fallback."
        );
        assertTrue(
                loadoutPreview.contains("renderLoadoutCommanderArt(trainer)"),
                "The selected loadout Commander section must use the real-art renderer."
        );
    }

    @Test
    void cardDragGhostKeepsTheCompactHandCardLayout() throws IOException {
        String style = Files.readString(STYLE_CSS);
        String dragSession = extractFunction(readGameScript(), "function activateCardDragSession()");

        assertTrue(
                style.contains(":is(.hand-tray, .card-drag-ghost) .hand-card-body { display: none; }")
                        && style.contains(":is(.hand-tray, .card-drag-ghost) .card-stat-pill"),
                "The detached drag clone must retain the hand card's compact text and stat layout."
        );
        assertTrue(
                style.contains("scale(var(--card-drag-source-scale, 1))")
                        && dragSession.contains("sourceEl.offsetWidth")
                        && dragSession.contains("sourceRect.width / sourceLayoutWidth")
                        && dragSession.contains("--card-drag-source-scale")
                        && dragSession.indexOf("syncDesktopHandSelectorCardScale();")
                            < dragSession.indexOf("const sourceEl = getHandCardSourceElement(handIndex);")
                        && !style.contains("translate(-50%, -58%) scale(1.06)"),
                "The drag clone must preserve the source layout dimensions and live scale instead of applying a fixed enlargement."
        );
    }

    private static String readGameScript() throws IOException {
        return Files.readString(GAME_JS);
    }

    private static String readHomeScript() throws IOException {
        return Files.readString(HOME_JS);
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
