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
    private static final Path KEEP_HTML = Path.of("src/main/resources/static/keep.html");
    private static final Path KEEP_CSS = Path.of("src/main/resources/static/css/keep.css");
    private static final Path KEEP_JS = Path.of("src/main/resources/static/js/keep.js");

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
    void starterPackSelectionRecoversAndReturnsHomeAfterGacha() throws IOException {
        String homeScript = readHomeScript();
        String choosePack = extractFunction(homeScript, "async function choosePack(packId, count = 1)");
        String clearPackResult = extractFunction(homeScript, "function clearPackResult()");
        String recoverStarter = extractFunction(homeScript, "async function recoverStarterPackProgression()");
        String recoverShop = extractFunction(homeScript, "async function recoverShopPackProgression(requestId, packId)");

        assertTrue(
                homeScript.contains("PACK_OPEN_TIMEOUT_MS = 60000")
                        && homeScript.contains("STARTER_PACK_TIMEOUT_MS = 60000")
                        && choosePack.contains("starterMode ? STARTER_PACK_TIMEOUT_MS : PACK_OPEN_TIMEOUT_MS"),
                "Shop and starter pack opens need a 60s timeout so cold Firestore grants can finish."
        );
        assertTrue(
                choosePack.contains("recoverStarterPackProgression()")
                        && recoverStarter.contains("/api/player/progression")
                        && recoverStarter.contains("starterChosen"),
                "If the starter POST errors/times out after the grant, the client must recover from progression."
        );
        assertTrue(
                choosePack.contains("recoverShopPackProgression(requestId, packId)")
                        && recoverShop.contains("requestId")
                        && recoverShop.contains("packHistory"),
                "Timed-out shop pack opens must recover the reveal from progression via the idempotency request id."
        );
        assertTrue(
                clearPackResult.contains("source")
                        && clearPackResult.contains("STARTER")
                        && clearPackResult.contains("navigateHub('home'")
                        && clearPackResult.contains("maybeStartOnboardingTour()"),
                "Dismissing the starter gacha must land on Home and start the onboarding tour."
        );
    }

    @Test
    void dailyOfferPurchaseShowsImmediateConfirmModal() throws IOException {
        String homeScript = readHomeScript();
        String homeMarkup = Files.readString(HOME_HTML);
        String purchaseDaily = extractFunction(homeScript, "async function purchaseDailyOffer(offerId)");
        String confirmDaily = extractFunction(homeScript, "function confirmDailyOfferPurchase(offer)");

        assertTrue(
                homeMarkup.contains("id=\"shopPurchaseConfirmModal\"")
                        && homeMarkup.contains("data-shop-purchase-confirm")
                        && homeMarkup.contains("data-shop-purchase-cancel"),
                "Daily card buys need a confirm modal shell so the tap can show feedback before the POST."
        );
        assertTrue(
                purchaseDaily.contains("confirmDailyOfferPurchase(offer)")
                        && confirmDaily.contains("shopPurchaseConfirmModal")
                        && confirmDaily.contains("shopPurchaseConfirmResolver = resolve"),
                "Daily offer taps must open the confirm modal synchronously before awaiting the purchase API."
        );
        assertTrue(
                purchaseDaily.contains("Buying…")
                        && purchaseDaily.contains("dailyOfferPurchasePending"),
                "After confirm, the buy button must show an in-flight Buying state."
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
    void binderWaitsForOwnedCardSnapshotWhenCachedProfileIsPartial() throws IOException {
        String homeScript = readHomeScript();
        String ownedDataLoading = extractFunction(homeScript, "function ownedDataLoading()");
        String renderCards = extractFunction(homeScript, "function renderCards()");

        assertTrue(
                ownedDataLoading.contains("state.progression?.ownedCards")
                        && ownedDataLoading.contains("!state.profileSynced")
                        && !ownedDataLoading.contains("!state.profile;"),
                "A cached identity without progression must keep the binder loading until ownedCards arrives."
        );
        assertTrue(
                renderCards.contains("binderLoadingMarkup('Loading your card binder…')")
                        && renderCards.contains("grid.setAttribute('aria-busy', 'true')")
                        && renderCards.contains("allCount.textContent = 'Loading cards…'"),
                "The binder load race must show a visible and accessible loading status instead of zero owned cards."
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
    void holographicFullCardArtRendersInBattleAndSupportsPublicComparison() throws IOException {
        String homeScript = readHomeScript();
        String gameScript = readGameScript();
        String dashboardScript = Files.readString(CARD_DASHBOARD_JS);
        String binderScript = Files.readString(Path.of("src/main/resources/static/js/card-binder-visual.js"));
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));
        String holographicCss = Files.readString(Path.of("src/main/resources/static/css/holographic.css"));
        String fullCardRenderer = extractFunction(binderScript, "function renderFullCardArt(");

        assertTrue(
                binderScript.contains("options.useHolographicFullCardArt")
                        && binderScript.contains("card?.holographicCardArtUrl")
                        && binderScript.contains("holographic-card-name")
                        && binderScript.contains("holographic-card-stats")
                        && binderScript.contains("holographic-card-stat-hp")
                        && binderScript.contains("holographic-card-stat-spd")
                        && binderScript.contains("renderHolographicNotches(card?.notches)"),
                "The full-card holographic asset must require an explicit binder-view option."
        );
        assertFalse(
                binderScript.contains("holographicCardArtScale")
                        || homeCss.contains("--holographic-card-art-scale"),
                "Holographic source artwork must never scale the live name, stats, copy, foil, or notch layers."
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
                        && dashboardScript.contains("normalizeHolographicCardArtFile(file, cardId)")
                        && dashboardScript.contains("HOLOGRAPHIC_CARD_TEMPLATE_WIDTH = 638")
                        && dashboardScript.contains("HOLOGRAPHIC_CARD_TEMPLATE_HEIGHT = 919")
                        && dashboardScript.contains("clearConnectedHolographicBackground")
                        && dashboardScript.contains("delete selected.holographicCardArtScale")
                        && dashboardScript.contains("formData.append(\"artVariant\", artVariant)"),
                "Dashboard holographic uploads must normalize only the source image to the shared template before saving its own catalog variant."
        );
        assertFalse(
                dashboardScript.contains("holographicCardArtScaleInput")
                        || dashboardScript.contains("syncHolographicCardArtScaleControls"),
                "The dashboard must not expose per-card holo scaling now that uploads normalize automatically."
        );
        assertTrue(
                fullCardRenderer.indexOf("renderHolographicOverlay()")
                        < fullCardRenderer.indexOf("renderHolographicCardData(card, options)")
                        && fullCardRenderer.contains("isHolographic(card, options) && !usesHolographicArtwork"),
                "Custom holographic data must render above its foil, without a second outer foil layer."
        );
        // The full-art holo component now lives in the shared holographic.css so
        // both the binder (home.css) and the Battle Table (style.css) import it.
        assertTrue(
                holographicCss.contains(".holographic-card-art-canvas > .card-holographic-overlay")
                        && holographicCss.contains(".holographic-card-art-canvas > .binder-full-card-art-image")
                        && holographicCss.contains("object-fit: contain")
                        && holographicCss.contains("object-position: center")
                        && holographicCss.contains("top: 10.6%")
                        && holographicCss.contains("top: 69.8%")
                        && holographicCss.contains("top: 74%")
                        && holographicCss.contains(".holographic-card-stat-hp")
                        && holographicCss.contains(".holographic-card-stat-spd")
                        && holographicCss.contains(".holographic-card-notch-bottom-left")
                        && holographicCss.contains(".holographic-card-notch-bottom-right")
                        && holographicCss.contains("padding: 1px 3px")
                        && holographicCss.contains("font-size: clamp(7px, 4.9cqi, 12px)"),
                "Custom holographic art must preserve its complete frame while labels stay in the template's name, stat, and description zones."
        );
        // Battle Table binder view mirrors the binder: the card-tile stat override
        // stays in home.css, and the shared holographic.css is @imported by style.css.
        assertTrue(
                homeCss.contains(".card-tile .holographic-card-stats .holographic-card-stat")
                        && homeCss.contains("font-size: inherit"),
                "The binder tile must still tame its holographic HP/SPD pills."
        );
        assertTrue(
                Files.readString(STYLE_CSS).contains("holographic.css"),
                "style.css must import the shared holographic component styles for the Battle Table."
        );
        // The mulligan and hand tray swap a holographic card's framed showcase for
        // the complete painted face, gated on the same explicit binder-view option.
        assertTrue(
                gameScript.contains("function renderHolographicFullArtFace(")
                        && gameScript.contains("useHolographicFullCardArt: true")
                        && gameScript.contains("imageLoading: 'eager'")
                        && gameScript.contains("preloadArtUrl(artUrl)")
                        && gameScript.contains("preloadArtUrl(String(card?.holographicCardArtUrl || '').trim())")
                        && gameScript.contains("renderHolographicFullArtFace(card,")
                        && gameScript.contains("has-holo-full-art"),
                "Holographic cards with full-card art must render and eagerly preload their painted face in the mulligan and hand."
        );
        assertTrue(
                binderScript.contains("options.imageLoading === 'eager'")
                        && fullCardRenderer.contains("loading=\"${imageLoading}\"")
                        && fullCardRenderer.contains("decoding=\"async\""),
                "Battle surfaces must be able to opt full-card art out of lazy loading."
        );
        String toggleMulligan = extractFunction(gameScript, "function toggleMulliganCard(");
        String updateMulligan = extractFunction(gameScript, "function updateMulliganSelectionUI(");
        assertTrue(
                toggleMulligan.contains("updateMulliganSelectionUI()")
                        && !toggleMulligan.contains("renderMulliganOverlay()")
                        && updateMulligan.contains("slot.classList.toggle('is-selected', isSelected)")
                        && updateMulligan.contains("slot.setAttribute('aria-pressed'")
                        && updateMulligan.contains("mulligan-redraw-badge")
                        && updateMulligan.contains("redrawBtn.textContent"),
                "Mulligan selection must update in place so existing card image nodes are never replaced or flashed."
        );
        String selectTrainer = extractFunction(gameScript, "function selectTrainerOption(");
        String updateTrainer = extractFunction(gameScript, "function updateTrainerSelectionUI(");
        String renderLoadout = extractFunction(gameScript, "function renderLoadoutOptions(");
        assertTrue(
                selectTrainer.contains("updateTrainerSelectionUI()")
                        && !selectTrainer.contains("renderLoadoutOptions()")
                        && updateTrainer.contains(".knight-card[data-trainer-id]")
                        && updateTrainer.contains("card.classList.toggle('selected', selected)")
                        && updateTrainer.contains("card.setAttribute('aria-pressed'")
                        && updateTrainer.contains("knight-selected-ribbon")
                        && renderLoadout.contains("preloadArtUrl(knightUploadedCardArtUrl(trainer))")
                        && renderLoadout.contains("data-trainer-id=\"${escapeHtmlAttribute(trainer.id)}\"")
                        && renderLoadout.contains("loading=\"eager\" decoding=\"async\""),
                "SiegeKnight selection must preserve and eagerly preload every commander image while updating selection chrome in place."
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

    @Test
    void portraitMulliganUsesAHeightFillingTwoTwoOneGrid() throws IOException {
        String style = Files.readString(STYLE_CSS).replace("\r\n", "\n");

        assertTrue(
                style.contains("grid-template-columns: repeat(2, minmax(0, 1fr));")
                        && style.contains("grid-template-rows: repeat(3, minmax(0, 1fr));")
                        && style.contains(".mulligan-card-slot:nth-child(5)")
                        && style.contains("grid-column: 1 / -1;"),
                "Portrait Mulligan must keep five cards in a centered 2-2-1 grid."
        );
        assertTrue(
                style.contains(".mulligan-card-slot {\n        width: auto;\n        height: 100%;")
                        && !style.contains("--mulligan-portrait-card-width"),
                "Portrait Mulligan cards must size from the hand area's live row height instead of a fixed card-width cap."
        );
    }

    @Test
    void ownedHolographicCardsUseTheirDedicatedArtworkInBattle() throws IOException {
        String gameScript = readGameScript();
        String artResolver = extractFunction(gameScript, "function getDashboardCardArtMeta(card)");
        String artRenderer = extractFunction(gameScript, "function renderCardArt(card, variant, fallbackLabel = '')");
        String style = Files.readString(STYLE_CSS);

        assertTrue(
                artResolver.contains("cardShowsPlayerHolographic(card)")
                        && artResolver.contains("card.holographicCardArtUrl")
                        && artResolver.contains("mode: 'HOLOGRAPHIC_FULL_CARD'"),
                "Battle art selection must use dedicated holo art only when that card instance displays the player's holographic finish."
        );
        assertTrue(
                artRenderer.contains("game-holographic-full-card-art")
                        && style.contains(".hand-card .card-art.game-holographic-full-card-art img")
                        && style.contains("object-fit: fill !important;"),
                "Dedicated holo art must fill the shared card box the same way the painted element frame does "
                        + "(background-size 100% 100%), so no letterbox exposes the standard frame behind it on the board or in previews."
        );
    }

    @Test
    void keepBuildingsAndRoomsUseLayeredPaperTreatments() throws IOException {
        String keepHtml = Files.readString(KEEP_HTML);
        String keepCss = Files.readString(KEEP_CSS);
        String keepJs = Files.readString(KEEP_JS);

        assertTrue(
                keepHtml.contains("class=\"paper-building-shell\"")
                        && keepHtml.contains("/css/keep.css?v=19")
                        && keepHtml.contains("/js/keep.js?v=20"),
                "Keep architecture must retain its paper building hooks and refresh both asset cache pins."
        );
        assertTrue(
                keepCss.contains(".building-illustration svg.paper-building-shell")
                        && keepCss.contains("drop-shadow(0 1px 0 #ead8ad)")
                        && keepCss.contains(".int-backwall::after")
                        && keepCss.contains("mix-blend-mode: soft-light"),
                "Exterior silhouettes and room shells must retain their cardstock edges and print grain."
        );
        assertFalse(
                keepHtml.contains("id=\"paper-prop-cutout\"")
                        || keepHtml.contains("id=\"paper-building-cutout\"")
                        || keepCss.contains("filter: url(\"#paper-prop-cutout\")")
                        || keepCss.contains("filter: url(\"#paper-building-cutout\")"),
                "Keep architecture must not use expensive SVG filters for animated props or large building silhouettes."
        );
        assertTrue(
                keepCss.contains(".room-tool-set.has-installed-tools")
                        && keepCss.contains(".crafted-decoration { display: none; z-index: 2; }")
                        && keepJs.contains("rack.classList.toggle('has-installed-tools'")
                        && keepJs.contains("setGroundsSuppressed(true)")
                        && keepCss.contains("content-visibility: hidden"),
                "Empty tool racks must stay hidden, decorations must layer above them, and open interiors must suspend grounds painting."
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
