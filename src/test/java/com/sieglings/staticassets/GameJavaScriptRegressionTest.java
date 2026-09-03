package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameJavaScriptRegressionTest {

    private static final Path GAME_JS = Path.of("src/main/resources/static/js/game.js");
    private static final Path ACTION_QUEUE_JS = Path.of("src/main/resources/static/js/action-queue.js");
    private static final Path HOME_JS = Path.of("src/main/resources/static/js/home.js");
    private static final Path HOME_HTML = Path.of("src/main/resources/static/home.html");
    private static final Path PLAY_HTML = Path.of("src/main/resources/static/play.html");
    private static final Path HELP_HTML = Path.of("src/main/resources/static/help.html");
    private static final Path CARD_DASHBOARD_HTML = Path.of("src/main/resources/static/card-dashboard.html");
    private static final Path CARD_BINDER_VISUAL_JS = Path.of("src/main/resources/static/js/card-binder-visual.js");
    private static final Path NOTCH_IMAGE_DIR = Path.of("src/main/resources/static/img/notches");
    private static final Path CARD_BACK_IMAGE_DIR = Path.of("src/main/resources/static/img/decks");
    private static final Path CARD_DASHBOARD_JS = Path.of("src/main/resources/static/js/card-dashboard.js");
    private static final Path STYLE_CSS = Path.of("src/main/resources/static/css/style.css");
    private static final Path KEEP_HTML = Path.of("src/main/resources/static/keep.html");
    private static final Path KEEP_CSS = Path.of("src/main/resources/static/css/keep.css");
    private static final Path KEEP_JS = Path.of("src/main/resources/static/js/keep.js");
    private static final Path ADVENTURE_CSS = Path.of("src/main/resources/static/css/adventure.css");
    private static final Path ADVENTURE_JS = Path.of("src/main/resources/static/js/adventure.js");
    private static final Path ADVENTURE_HTML = Path.of("src/main/resources/static/adventure.html");
    private static final Path SIEGE_MAPS_JS = Path.of("src/main/resources/static/js/siege-maps.js");
    private static final Path BATTLE_MAP_DIR = Path.of("src/main/resources/static/img/maps");

    private static final Path LANDING_JS = Path.of("src/main/resources/static/js/landing.js");

    /**
     * The session survives a full-page hop between modes only if every bundle keeps a
     * credential the backend can actually use. Discarding the localStorage token on
     * the strength of the client-readable `sgl_auth` cookie is what made a player who
     * had just signed in on the hub get asked to sign in all over again on My Keep:
     * Firebase Hosting forwards no cookie but `__session` to Cloud Run, so the cookie
     * the browser proudly stored never arrived. Only the server's `cookieSession`
     * verdict may retire the token.
     */
    @Test
    void noBundleDiscardsItsTokenOnAClientSideCookieGuess() throws IOException {
        for (Path bundle : new Path[] { GAME_JS, HOME_JS, KEEP_JS, LANDING_JS }) {
            String source = Files.readString(bundle);
            assertFalse(
                    source.contains("hasReadableAuthCookie() && !isStandalonePWA()"),
                    bundle.getFileName() + " must not treat a readable cookie as proof the session reaches the "
                            + "server; gate the migration on the server's cookieSession flag instead."
            );
            assertTrue(
                    source.contains("cookieAuthConfirmed"),
                    bundle.getFileName() + " must consult the server-confirmed cookie flag before dropping the token."
            );
        }

        String gameScript = readGameScript();
        assertTrue(
                gameScript.contains("data.cookieSession === true"),
                "game.js may only migrate to the cookie sentinel once /api/auth/me confirms the cookie arrived."
        );
        assertTrue(
                Files.readString(HOME_JS).contains("data.cookieSession === true"),
                "home.js may only migrate to the cookie sentinel once /api/auth/me confirms the cookie arrived."
        );
    }

    /**
     * The sentinel is the literal string "cookie". Testing it with an
     * {@code indexOf('cookie:')} prefix never matched, so every cookie-mode player
     * sent {@code Authorization: Bearer cookie} — a bogus header that beat the
     * server's cookie bridge and left expeditions unable to see the account.
     */
    @Test
    void siegeNeverSendsTheSentinelAsABearerToken() throws IOException {
        String adventureJs = Files.readString(ADVENTURE_JS);

        assertFalse(
                adventureJs.contains("indexOf('cookie:')"),
                "adventure.js must compare against the whole 'cookie' sentinel, not a 'cookie:' prefix."
        );
        assertTrue(
                adventureJs.contains("token !== COOKIE_SESSION_VALUE"),
                "adventure.js must skip the Authorization header when the token is the cookie sentinel."
        );
    }

    @Test
    void keepOffersRetryRatherThanASignInFormForTransientFailures() throws IOException {
        String keepJs = Files.readString(KEEP_JS);

        assertTrue(
                keepJs.contains("data.status === 401 ? 'signin' : 'retry'"),
                "My Keep must only show the sign-in gate for an authoritative 401; anything else gets a retry."
        );
    }

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
    void battleLoadoutHidesLockedPremadeDecks() throws IOException {
        String gameScript = readGameScript();
        String visibleDecks = extractFunction(gameScript, "function getVisibleLoadoutDecks()");
        String renderLoadout = extractFunction(gameScript, "function renderLoadoutOptions()");
        String renderSwaps = extractFunction(gameScript, "function renderLoadoutSwaps()");
        String lobbyWaiting = extractFunction(readHomeScript(), "function lobbyWaitingContext()");

        assertTrue(
                visibleDecks.contains("!isPremadeDeckLocked(deck)"),
                "Battle loadout must expose a helper that filters out locked premade decks."
        );
        assertTrue(
                renderLoadout.contains("getVisibleLoadoutDecks()")
                        && !renderLoadout.contains("is-locked")
                        && !renderLoadout.contains("Unlock for"),
                "Choose Your Deck must only render unlocked presets, with no locked-tile UI."
        );
        assertTrue(
                renderSwaps.contains("getVisibleLoadoutDecks()"),
                "Review-step deck swap must also omit locked presets."
        );
        assertTrue(
                lobbyWaiting.contains("decks.filter(deck => !isPremadeDeckLocked(deck))"),
                "Social lobby battle deck picks must omit locked presets."
        );
    }

    @Test
    void premadeDeckPurchaseUnlocksLiveStateBeforeElementalCelebration() throws IOException {
        String homeScript = readHomeScript();
        String homeMarkup = Files.readString(HOME_HTML);
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));
        String purchaseDeck = extractFunction(homeScript, "async function purchaseDeck(deckId)");
        String mergeUnlock = extractFunction(homeScript, "function progressionWithUnlockedDeck(progression, deckId)");
        String renderCelebration = extractFunction(homeScript, "function renderDeckUnlockCelebration()");

        assertTrue(
                purchaseDeck.contains("state.deckPurchasePendingId = deck.id")
                        && purchaseDeck.contains("applyProgressionUpdate(progressionWithUnlockedDeck(data.progression, deck.id))")
                        && purchaseDeck.contains("startDeckUnlockCelebration(deck)"),
                "A deck purchase must show in-flight feedback, publish the unlock to shared state, then celebrate it."
        );
        assertTrue(
                mergeUnlock.contains("purchasedDeckIds:")
                        && mergeUnlock.contains("unlockedDeckIds:")
                        && mergeUnlock.contains("[deckId]"),
                "The successful purchase must immediately add the deck to both client unlock lists, even with a stale response."
        );
        assertTrue(
                homeMarkup.contains("id=\"deckUnlockCelebrationHost\"")
                        && renderCelebration.contains("role=\"dialog\"")
                        && renderCelebration.contains("deckUnlockTheme(primary)")
                        && renderCelebration.contains("notchIconPath(primary)"),
                "Home must render an accessible element-themed celebration using the purchased deck's painted sigil."
        );
        assertTrue(
                homeCss.contains(".deck-unlock-celebration[data-element=\"water\"]")
                        && homeCss.contains(".deck-unlock-celebration[data-element=\"wind\"]")
                        && homeCss.contains(".deck-unlock-celebration[data-element=\"earth\"]")
                        && homeCss.contains(".deck-unlock-celebration[data-element=\"ice\"]")
                        && homeCss.contains("@media (prefers-reduced-motion: reduce)"),
                "Water, Wind, Earth and Ice need distinct particle silhouettes with a reduced-motion fallback."
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
        String recoverProgression = extractFunction(homeScript, "async function recoverProgressionSnapshot()");
        String recoverShop = extractFunction(homeScript, "async function recoverShopPackProgression(requestId, packId)");

        assertTrue(
                homeScript.contains("PACK_OPEN_TIMEOUT_MS = 60000")
                        && homeScript.contains("STARTER_PACK_TIMEOUT_MS = 60000")
                        && choosePack.contains("starterMode ? STARTER_PACK_TIMEOUT_MS : PACK_OPEN_TIMEOUT_MS"),
                "Shop and starter pack opens need a 60s timeout so cold Firestore grants can finish."
        );
        assertTrue(
                choosePack.contains("recoverStarterPackProgression()")
                        && recoverStarter.contains("recoverProgressionSnapshot()")
                        && recoverStarter.contains("starterChosen")
                        && recoverProgression.contains("/api/player/progression"),
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
    void profileDashboardTrimsBattlesFavoritesAndSocialTable() throws IOException {
        String homeScript = readHomeScript();
        String homeMarkup = Files.readString(HOME_HTML);
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));
        String battleList = extractFunction(homeScript, "function renderBattleHistoryList(view, reviewable = true)");
        String collection = extractFunction(homeScript, "function renderCollectionSnapshot(view)");
        String friends = extractFunction(homeScript, "function renderFriendsPanel(view)");
        String summary = extractFunction(homeScript, "function collectionSummary()");
        String profile = extractFunction(homeScript, "function renderProfile()");

        assertTrue(
                homeScript.contains("PROFILE_BATTLE_PREVIEW_MAX = 3")
                        && battleList.contains("battles.slice(0, PROFILE_BATTLE_PREVIEW_MAX)")
                        && battleList.contains("data-battle-history-open")
                        && homeMarkup.contains("id=\"battleHistoryModalHost\""),
                "Recent Battles must preview three matches and open the full scroll in a popup."
        );
        assertTrue(
                homeScript.contains("PROFILE_FAVORITE_CARD_MAX = 3")
                        && summary.contains("usingFavoriteCards")
                        && summary.contains("rarestSorted.slice(0, PROFILE_FAVORITE_CARD_MAX)")
                        && collection.contains("renderProfileShowcaseCard")
                        && collection.contains("data-favorite-cards-open")
                        && homeMarkup.contains("id=\"favoriteCardsModalHost\""),
                "Cards Owned must showcase up to three player favorites with real card art, defaulting to rarest owned."
        );
        assertTrue(
                homeScript.contains("PROFILE_FRIEND_PREVIEW_MAX = 3")
                        && homeScript.contains("PROFILE_LOBBY_PREVIEW_MAX = 3")
                        && friends.contains("friends.slice(0, PROFILE_FRIEND_PREVIEW_MAX)")
                        && friends.contains(".slice(0, PROFILE_LOBBY_PREVIEW_MAX)")
                        && friends.contains("profile-social-panel")
                        && friends.contains("is-compact")
                        && !friends.contains("friends-panel"),
                "Social Table must show three friends and three lobbies, and must not reuse the tall friends-modal panel class."
        );
        assertTrue(
                homeCss.contains(".battle-list-preview")
                        && homeCss.contains(".profile-social-panel")
                        && homeCss.contains(".mini-card-row-art")
                        && homeCss.contains(".profile-overview-stack")
                        && homeCss.contains(".profile-main-grid-bottom"),
                "Profile trim styles for battle preview, social shrink, and favorite card art must ship in home.css."
        );
        assertTrue(
                profile.contains("profile-main-grid-overview")
                        && profile.contains("profile-overview-stack")
                        && profile.indexOf("renderBattleRecordPanel(view)") < profile.indexOf("renderDeckSnapshot(view)")
                        && profile.indexOf("renderDeckSnapshot(view)") < profile.indexOf("renderFriendsPanel(view)")
                        && profile.indexOf("renderFriendsPanel(view)") < profile.indexOf("renderCollectionSnapshot(view)")
                        && profile.contains("profile-main-grid-bottom")
                        && profile.indexOf("renderBattleHistoryList(view)") < profile.indexOf("renderAchievementBadges(view)"),
                "Season Snapshot, Loadout Shelf, and Social Table must share the overview rail, with matches and badges paired below."
        );
        assertTrue(
                homeJsPin(homeMarkup) >= 142 && homeCssPin(homeMarkup) >= 130,
                "Cache-bust pins for the profile dashboard trim must advance on home.html."
        );
    }

    @Test
    void profileFavoriteElementIconsUseCircularNotchMedallions() throws IOException {
        String homeScript = readHomeScript();
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));
        String homeMarkup = Files.readString(HOME_HTML);
        String dashboardMarkup = Files.readString(CARD_DASHBOARD_HTML);
        String badge = extractFunction(homeScript, "function renderElementBadge(element)");
        String avatar = extractFunction(homeScript, "function renderPlayerAvatar(prefs = {}, className = 'friend-avatar')");

        assertTrue(
                badge.contains("notchIconPath(normalized)")
                        && avatar.contains("notchIconPath(normalizeProfileElement(prefs.favoriteElement))"),
                "Profile favorite-element badges and element-mode avatars must use painted notch medallions."
        );
        assertTrue(
                homeCss.contains(".player-avatar-element.profile-avatar")
                        && homeCss.contains(".friend-avatar-wrap .player-avatar-element.friend-avatar")
                        && homeCss.contains("border-radius: 50%")
                        && homeCss.contains("object-fit: cover")
                        && homeCss.contains("padding: 0"),
                "Element-mode profile and friend avatars must fill a circular frame."
        );
        assertTrue(
                homeCssPin(homeMarkup) >= 130
                        && homeJsPin(homeMarkup) >= 142
                        && homeCssPin(dashboardMarkup) >= 130,
                "Profile icon CSS and JavaScript cache pins must advance together."
        );
    }

    @Test
    void everyPaintedElementUsesItsDedicatedNotchMedallion() throws IOException {
        String gameScript = readGameScript();
        String homeScript = readHomeScript();
        String binderScript = Files.readString(CARD_BINDER_VISUAL_JS);
        Set<String> elements = Set.of(
                "fire", "earth", "wind", "water", "ice", "shadow",
                "electric", "metal", "undead", "psychic", "poison", "light", "neutral"
        );

        for (String element : elements) {
            String mapping = element.toUpperCase() + ": '/img/notches/notch-" + element + ".png";
            assertTrue(
                    gameScript.contains(mapping) && homeScript.contains(mapping) && binderScript.contains(mapping),
                    element + " must resolve to the same painted medallion in battle, Home, and binder views."
            );
            assertTrue(
                    Files.isRegularFile(NOTCH_IMAGE_DIR.resolve("notch-" + element + ".png"))
                            && Files.isRegularFile(NOTCH_IMAGE_DIR.resolve("notch-" + element + ".webp")),
                    element + " must ship both PNG and WebP medallion assets."
            );
        }

        String homeMarkup = Files.readString(HOME_HTML);
        String playMarkup = Files.readString(PLAY_HTML);
        String dashboardMarkup = Files.readString(CARD_DASHBOARD_HTML);
        assertTrue(
                styleCssPin(homeMarkup) >= 230
                        && gameJsPin(homeMarkup) >= 240
                        && cardBinderVisualPin(homeMarkup) >= 20
                        && homeJsPin(homeMarkup) >= 142
                        && styleCssPin(playMarkup) >= 230
                        && gameJsPin(playMarkup) >= 240
                        && styleCssPin(dashboardMarkup) >= 230
                        && gameJsPin(dashboardMarkup) >= 240
                        && cardBinderVisualPin(dashboardMarkup) >= 20,
                "Every surface must advance its cache pins with the complete painted-notch set."
        );
    }

    @Test
    void setupShieldPlaybackKeepsItsPersistentBadge() throws IOException {
        String gameScript = readGameScript();
        String actionQueueScript = Files.readString(ACTION_QUEUE_JS);
        String playMarkup = Files.readString(PLAY_HTML);

        assertTrue(
                gameScript.contains("window.SieglingsBoardCellState")
                        && gameScript.contains("gameState?.playerBoard")
                        && gameScript.contains("gameState?.enemyBoard"),
                "The action queue needs a live board-state bridge when it re-syncs a shield after playback."
        );
        assertTrue(
                actionQueueScript.contains("shieldHp: h.nextShield")
                        && actionQueueScript.contains("Number.isFinite(fallback) ? fallback")
                        && actionQueueScript.contains("Number.isFinite(renderedShieldHp) ? renderedShieldHp : 0"),
                "Shield playback must retain the server's final shield value instead of treating a missing bridge as zero."
        );
        assertTrue(
                actionQueuePin(playMarkup) >= 42,
                "The battle page must load the shield-persistence action queue instead of a cached pre-fix bundle."
        );
    }

    @Test
    void earthAfflictionRendersAsLeechInsteadOfStagger() throws IOException {
        String gameScript = readGameScript();
        String helpMarkup = Files.readString(HELP_HTML);

        assertTrue(
                gameScript.contains("LEECH:        '#8fbd58'")
                        && gameScript.contains("LEECH: {")
                        && gameScript.contains("name: 'Leech'")
                        && gameScript.contains("second Earth hit heals its attacker")
                        && gameScript.contains("id=\"sb-leech-bg\"")
                        && helpMarkup.contains("<strong>Leech</strong>")
                        && helpMarkup.contains("actual HP damage dealt, then clears"),
                "Earth's badge, effect key, dedicated art, and help copy must all describe Leech."
        );
        assertFalse(
                gameScript.contains("STAGGER:") || helpMarkup.contains("<strong>Stagger</strong>"),
                "The retired queue-demotion badge must not return."
        );
    }

    @Test
    void settingsGuideAndFieldGuideShipCurrentRulesAndVisualReferences() throws IOException {
        String homeScript = readHomeScript();
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));
        String homeMarkup = Files.readString(HOME_HTML);
        String dashboardMarkup = Files.readString(CARD_DASHBOARD_HTML);
        String helpMarkup = Files.readString(HELP_HTML);

        assertTrue(
                homeScript.contains("const GUIDE_AFFLICTIONS")
                        && homeScript.contains("element: 'Earth', status: 'Leech', cap: 2")
                        && homeScript.contains("element: 'Poison', status: 'Toxin', cap: 5")
                        && homeScript.contains("element: 'Light', status: 'Blind', cap: 3")
                        && homeScript.contains("Battle and Siege are both live")
                        && homeScript.contains("Siege does not use the Standard Battle weakness chart")
                        && homeScript.contains("data-options-help")
                        && !homeScript.contains("<strong>Siege</strong> (coming soon)"),
                "Settings Guide must cover every affinity, describe both live modes, and link to the full guide."
        );
        assertTrue(
                homeCss.contains(".options-panel.options-panel--guide")
                        && homeCss.contains(".guide-stat-grid")
                        && homeCss.contains(".guide-affliction-grid")
                        && homeCss.contains(".guide-mode-grid")
                        && homeCss.contains("@media (max-width: 620px)"),
                "The Settings Guide must ship its visual reference layouts and compact breakpoint."
        );
        assertTrue(
                helpMarkup.contains("<h3>Strategy</h3>")
                        && helpMarkup.contains("<h3>Deception</h3>")
                        && helpMarkup.contains("Poison and Light attacks still apply their afflictions")
                        && helpMarkup.contains("There is no elemental weakness chart in Siege")
                        && helpMarkup.contains("/css/help.css?v=3")
                        && !helpMarkup.contains("<h3>Spell</h3>")
                        && !helpMarkup.contains("<h3>Trap</h3>"),
                "The full Field Guide must use current card labels, energy exceptions, Siege rules, and fresh visuals."
        );
        assertTrue(
                homeCssPin(homeMarkup) >= 130
                        && homeJsPin(homeMarkup) >= 142
                        && homeCssPin(dashboardMarkup) >= 130,
                "Guide JavaScript and shared visual CSS pins must advance together."
        );
    }

    @Test
    void afflictionDamageBurnsAnElementalBorderInsteadOfFiringAProjectile() throws IOException {
        String actionQueueScript = Files.readString(ACTION_QUEUE_JS);
        String styles = Files.readString(STYLE_CSS);
        String adventureScript = Files.readString(ADVENTURE_JS);
        String adventureStyles = Files.readString(ADVENTURE_CSS);

        assertTrue(
                actionQueueScript.contains("function parseAfflictionTickFromLog")
                        && actionQueueScript.contains("burn: 'BURN'")
                        && actionQueueScript.contains("poison: 'TOXIN'")
                        && actionQueueScript.contains("withers"),
                "Burn/Toxin/Wither ticks must be recognised from the server's log wording."
        );
        assertTrue(
                actionQueueScript.contains("splitAfflictionTicks(damageOnPlayer, afflictionTicksOnPlayer)")
                        && actionQueueScript.contains("splitAfflictionTicks(damageOnEnemy, afflictionTicksOnEnemy)")
                        && actionQueueScript.contains("kind: 'AFFLICTION'"),
                "Affliction ticks must leave the damage diff before source resolution can invent an attacker."
        );
        assertTrue(
                sliceBetween(actionQueueScript,
                        "if (action.kind === 'AFFLICTION' && action.target)",
                        "// 2a-status. STATUS_APPLY / STATUS_SKIP")
                        .contains("spawnElementalBorder"),
                "Nothing attacked the card, so an affliction tick plays its border and never a projectile."
        );
        assertTrue(
                actionQueueScript.contains("POISON:   '#7ecb4d'")
                        && actionQueueScript.contains("LIGHT:    '#ffe59a'"),
                "Toxin and Blind need their elements in the queue's palette to colour their border."
        );
        assertTrue(
                styles.contains(".sgl-element-border")
                        && styles.contains("--sgl-border-color")
                        && styles.contains("@keyframes sgl-border-ring"),
                "The battle table must ship the element-coloured border."
        );
        assertTrue(
                adventureScript.contains("elementBorder(ev.targetId, 'FIRE')")
                        && adventureScript.contains("elementBorder(ev.targetId, 'POISON')")
                        && adventureStyles.contains(".sp-aura .sp-aura-ring"),
                "Siege status ticks light the same elemental border on the unit's sprite."
        );
    }

    @Test
    void projectilesAreReservedForAttacksAndEverythingElseGetsTheElementalBorder() throws IOException {
        String actionQueueScript = Files.readString(ACTION_QUEUE_JS);
        String gameScript = readGameScript();
        String adventureScript = Files.readString(ADVENTURE_JS);

        assertFalse(
                actionQueueScript.contains("_getFallbackProjectileOrigin")
                        || actionQueueScript.contains("attackBetween"),
                "Damage with no attacker must never invent a projectile origin to fire from."
        );

        // Trap / aura / effect damage on a single cell.
        assertTrue(
                sliceBetween(actionQueueScript,
                        "} else if (action.kind === 'ATTACK' && action.target) {",
                        "} else if (action.kind === 'DESTROY'")
                        .contains("spawnElementalBorder"),
                "Sourceless cell damage (traps, auras, effect ticks) plays the elemental border."
        );
        // Status applications are auras and riders, not attacks.
        String statusBranch = sliceBetween(actionQueueScript,
                "if ((action.kind === 'STATUS_APPLY' || action.kind === 'STATUS_SKIP') && action.target) {",
                "// 2a-heal. HEAL");
        assertTrue(
                statusBranch.contains("spawnElementalBorder") && !statusBranch.contains("attackCell"),
                "A status landing must light the border instead of firing a projectile at the card."
        );
        // Healing is not an attack either.
        String healBranch = sliceBetween(actionQueueScript,
                "if (action.kind === 'HEAL' && action.target) {",
                "// 2b. Direct attack on the enemy/player HP bar");
        assertTrue(
                healBranch.contains("spawnElementalBorder") && !healBranch.contains("attackCell"),
                "Heals bloom a green border on the healed card rather than launching a projectile."
        );
        // Every surviving projectile call must be gated on an identified attacker.
        assertTrue(
                actionQueueScript.contains("if (action.source && window.SieglingsFx?.attackCell) {")
                        && actionQueueScript.contains("action.kind === 'ATTACK' && action.source && action.target")
                        && actionQueueScript.contains("action.source && action.target?.healthBar"),
                "The remaining projectiles must all be attacks launched from a resolved source cell."
        );

        // Spells/traps have no board cell, so the queue asks the catalog what
        // element they are instead of falling back to the caster's knight.
        assertTrue(
                gameScript.contains("window.SieglingsCardElements")
                        && gameScript.contains("elementFor(name)"),
                "game.js must expose a card/ability name to element lookup for effect damage."
        );
        assertTrue(
                actionQueueScript.contains("function parseEffectCardFromLog")
                        && actionQueueScript.contains("springs\\s+trap")
                        && actionQueueScript.contains("effectElementForTarget(t.name"),
                "Trap and spell damage must colour its border from the card's own element."
        );

        assertTrue(
                adventureScript.contains("var STATUS_ELEMENT = {")
                        && adventureScript.contains("elementBorder(ev.targetId, STATUS_ELEMENT[ev.status]"),
                "Siege status applications light the inflicting element on the unit's border."
        );
    }

    /**
     * Chain damage has to read as a ricochet: the projectile strikes the Siegling the
     * ability targeted, and only once that hit lands do the arcs leave that card for
     * everything wired to it. Playing every victim as one simultaneous barrage — the
     * generic multi-target path — made a chain indistinguishable from an AoE and hid
     * the links the effect is entirely about.
     */
    @Test
    void chainDamageStrikesItsTargetBeforeArcingToTheLinkedSieglings() throws IOException {
        String actionQueueScript = Files.readString(ACTION_QUEUE_JS);
        String effectService = Files.readString(
                Path.of("src/main/java/com/sieglings/service/EffectService.java"));

        // The board diff arrives in row/col order, so the arc log lines are the only
        // thing that identifies which victim was actually targeted.
        assertTrue(
                actionQueueScript.contains("function parseChainArcFromLog")
                        && actionQueueScript.contains("\\s+arcs\\s+through\\s+")
                        && actionQueueScript.contains("\\s+finds\\s+no\\s+links\\s+on\\s+"),
                "The queue must recognise the chain arc log lines to tell the struck target from the bounces."
        );
        assertTrue(
                effectService.contains("\" arcs through \"")
                        && effectService.contains("\" finds no links on \""),
                "EffectService must keep the chain log wording the playback parser is coupled to."
        );

        String chainPlayback = sliceBetween(actionQueueScript,
                "async function playChainAttack(",
                "function buildCardDestroyedToast(");
        assertTrue(
                chainPlayback.contains("await playHop(action.source, [step.primary]);")
                        && chainPlayback.contains("for (const link of step.links) {")
                        && chainPlayback.contains("await playHop(step.primary, [link], ARC_SPEED_SCALE);"),
                "Chain playback must fire attacker to primary first, then arc to each link one at a time."
        );
        // A victim killed by its hop stays on screen until every arc has left it —
        // otherwise the bounce would originate from an already-empty cell.
        assertTrue(
                chainPlayback.contains("queue.applyLethalImpactHealth(")
                        && chainPlayback.indexOf("destroyBoardCard(")
                                > chainPlayback.indexOf("for (const step of action.chainSteps)"),
                "A lethal chain victim must keep its card until the hops finish, then come apart."
        );

        assertTrue(
                actionQueueScript.indexOf("action.kind === 'ATTACK' && Array.isArray(action.chainSteps)")
                        < actionQueueScript.indexOf("action.kind === 'ATTACK' && Array.isArray(action.targets) && action.targets.length > 1"),
                "The chain branch must be reached before the generic simultaneous barrage."
        );
        assertTrue(
                actionQueueScript.contains("const chainSteps = buildChainSteps(actionTargets);")
                        && actionQueueScript.contains("chainSteps,"),
                "Multi-target attacks must carry their chain hop structure into playback."
        );
    }

    /**
     * Chain attribution is matched by target name against the damage log lines, and
     * EffectService appends several trailing groups before the HP one — "(weakness +1)
     * (soak +2) (rust +1) (HP: 6)". A parser that strips only the last group reads the
     * target as "Sundile (weakness +1)", no victim matches, buildChainSteps bails, and
     * the whole chain silently degrades to a barrage fired from the attacker. Any
     * weakness hit — which is most chains — was enough to trigger it.
     */
    @Test
    void damageLogParserStripsEveryTrailingAnnotationFromTheTargetName() throws IOException {
        String actionQueueScript = Files.readString(ACTION_QUEUE_JS);
        assertTrue(
                actionQueueScript.contains(
                        "/^(.+?)\\s+deals\\s+(\\d+)\\s+damage\\s+to\\s+(.+?)(?:\\s*\\([^)]*\\))*\\.?$/i"),
                "The damage log parser must strip ALL trailing parentheticals, not just one."
        );
        String effectService = Files.readString(
                Path.of("src/main/java/com/sieglings/service/EffectService.java"));
        assertTrue(
                effectService.contains("\" (weakness +1)\"")
                        && effectService.contains("\" (HP: \""),
                "EffectService must keep emitting the annotated damage wording the parser strips."
        );
    }

    /** Slice a playback branch out of the queue so a test can assert on it alone. */
    private static String sliceBetween(String source, String startMarker, String endMarker) {
        int start = source.indexOf(startMarker);
        int end = source.indexOf(endMarker, start + 1);
        assertTrue(start >= 0 && end > start,
                "Expected to find the block between \"" + startMarker + "\" and \"" + endMarker + "\".");
        return source.substring(start, end);
    }

    @Test
    void callWellsRemainVisibleWithoutAConnectedSiegling() throws IOException {
        String gameScript = readGameScript();
        assertTrue(
                gameScript.contains("gameState?.playerCallWells")
                        && gameScript.contains("gameState?.enemyCallWells")
                        && gameScript.contains("rememberedWells[socket.key] || activeSocket?.element")
                        && gameScript.contains("appendExternalEnergyPoint(out, point, callWellElement")
                        && gameScript.contains("Call well: 1"),
                "Battle rendering must use the persistent call-well state after the attached card disappears."
        );
        assertFalse(
                gameScript.contains("externalSocketElementMemory[memorySide] = Object.create(null)"),
                "Board refreshes must not erase call wells activated earlier in the match."
        );
    }

    @Test
    void everyStatusEffectHasItsOwnBadgeArtAndKeyEntry() throws IOException {
        String gameScript = readGameScript();
        Set<String> statusKinds = Set.of(
                "MAX_HEALTH", "HEALTH_BOOST", "DAMAGE_BOOST", "SPEED_BOOST",
                "STRONG", "WEAK", "FREEZE", "SPEED_ZERO",
                "BURN", "CHILL", "LEECH", "DISORIENT", "SOAK", "SHOCK",
                "RUST", "TOXIN", "CURSE", "INSIGHT", "BLIND", "WITHER"
        );

        String badgeArt = extractObjectLiteral(gameScript, "const STATUS_BADGE_SVG = {");
        String effectKey = extractObjectLiteral(gameScript, "const STATUS_EFFECT_KEY = {");
        for (String kind : statusKinds) {
            assertTrue(
                    badgeArt.contains("\n    " + kind + ": `<svg"),
                    kind + " must ship its own badge silhouette instead of borrowing another status' art."
            );
            assertTrue(
                    effectKey.contains("\n    " + kind + ": {"),
                    kind + " must have a player-facing entry in the effect key."
            );
        }

        // The old fallback painted every unmapped affliction with Burn's flame,
        // so a Wind badge read as Fire on the board.
        assertFalse(
                gameScript.contains("STATUS_BADGE_SVG.BURN"),
                "No status may fall back to Burn's flame; unmapped kinds use the neutral sigil."
        );
        assertTrue(
                gameScript.contains("const STATUS_BADGE_SVG_GENERIC = ")
                        && gameScript.contains("|| (STATUS_BADGE_PALETTE[kind] || STATUS_EFFECT_KEY[kind] ? STATUS_BADGE_SVG_GENERIC : null)"),
                "Unmapped statuses must fall back to the element-neutral sigil."
        );

        assertTrue(
                gameScript.contains("onclick=\"openEffectKey('${escapeHtmlAttribute(e.kind)}', event)\"")
                        && gameScript.contains("onclick=\"openAllEffectsKey(event)\"")
                        && gameScript.contains("function showAllEffectsKey(event)"),
                "Card preview buff pills must open the effect explanation and the full effect key."
        );

        String playMarkup = Files.readString(PLAY_HTML);
        assertTrue(
                playMarkup.contains("id=\"effectKeyOverlay\"")
                        && playMarkup.contains("id=\"btnEffectKeyAll\"")
                        && playMarkup.contains("onclick=\"toggleEffectKeyView(event)\""),
                "Play must host the effect key overlay with its All Effects toggle."
        );

        String styles = Files.readString(STYLE_CSS);
        assertTrue(
                styles.contains(".effect-key-modal") && styles.contains(".effect-key-row"),
                "The effect key needs its modal and row styling."
        );

        // Speed Boost is a shoe, not a bolt: it used to be indistinguishable
        // from Shock's electric bolt at board size.
        assertFalse(
                badgeArt.contains("sb-sp-bolt"),
                "Speed Boost must use the shoe silhouette, not the old lightning bolt."
        );
        assertTrue(
                badgeArt.contains("sb-sp-shoe"),
                "Speed Boost must paint the shoe gradient."
        );
    }

    /**
     * Badge art is centred on (42,42) inside a disc of radius 34, so a glyph
     * painting past that rim hangs off the coin. Only foreground art is held to
     * this: the r=40 {@code .sb-pulse} halo and the {@code .sb-behind} starburst
     * are drawn under the disc and are meant to bleed out.
     */
    @Test
    void badgeGlyphsStayInsideTheirDisc() throws IOException {
        String badgeArt = extractObjectLiteral(readGameScript(), "const STATUS_BADGE_SVG = {");
        String foreground = badgeArt
                .replaceAll("<circle[^>]*class=\"sb-pulse\"[^>]*/>", "")
                .replaceAll("<circle cx=\"42\" cy=\"42\" r=\"34\"[^>]*/>", "")
                .replaceAll("<g[^>]*class=\"[^\"]*sb-behind[^\"]*\"[^>]*>.*?</g>", "");

        // Line endpoints and circle centres are exact, so they can be checked
        // statically; curve control points are covered by the headless raster
        // sweep, which measures the farthest painted pixel from the centre.
        Matcher matcher = Pattern.compile("\\b(cx|cy|x1|y1|x2|y2)=\"(-?[\\d.]+)\"").matcher(foreground);
        while (matcher.find()) {
            double value = Double.parseDouble(matcher.group(2));
            assertTrue(
                    value >= 10 && value <= 74,
                    "Badge " + matcher.group(1) + "=" + value + " falls outside the disc bounds (10..74)."
            );
        }

        assertFalse(
                badgeArt.contains("translate(60 60)"),
                "The matchup arrow must sit inside the disc, not hang off the rim."
        );
    }

    @Test
    void remainingElementsUseTheirDedicatedCardBacks() throws IOException {
        String gameScript = readGameScript();
        String homeScript = readHomeScript();
        Set<String> elements = Set.of(
                "water", "electric", "metal", "poison",
                "undead", "psychic", "shadow", "light"
        );

        assertTrue(
                homeScript.contains("const ELEMENTAL_CARD_BACK_VERSION = 6")
                        && gameScript.contains("const DECK_ART_ASSET_VERSION = 6"),
                "Home and battle must cache-bust the expanded elemental card-back set together."
        );
        assertTrue(
                homeScript.contains("const key = elements.find(element => DECK_ASSET_KEYS.includes(element))")
                        && gameScript.contains("const key = elements.find(element => DECK_ART_ASSET_KEYS.includes(element))"),
                "Mixed decks must choose the first configured element's dedicated card back."
        );

        for (String element : elements) {
            String asset = "/img/decks/card-back-" + element + ".png";
            assertTrue(
                    homeScript.contains(asset) && gameScript.contains(asset),
                    element + " must resolve to the same card back in Home/shop and battle views."
            );
            assertTrue(
                    Files.isRegularFile(CARD_BACK_IMAGE_DIR.resolve("card-back-" + element + ".png"))
                            && Files.isRegularFile(CARD_BACK_IMAGE_DIR.resolve("card-back-" + element + ".webp")),
                    element + " must ship both PNG and WebP card-back assets."
            );
        }

        assertTrue(
                homeScript.contains("Tidal Sigil")
                        && homeScript.contains("Storm Sigil")
                        && homeScript.contains("Iron Sigil")
                        && homeScript.contains("Venom Sigil")
                        && homeScript.contains("Spectral Sigil")
                        && homeScript.contains("Mind Sigil")
                        && homeScript.contains("Umbral Sigil")
                        && homeScript.contains("Radiant Sigil"),
                "All eight expanded card backs must be available in the profile picker."
        );
    }

    @Test
    void shopPacksCacheRejectsEmptyOrErroredPayloads() throws IOException {
        String homeScript = readHomeScript();
        String fetchCachedJson = extractFunction(homeScript, "async function fetchCachedJson(cacheKey, path, ttlMs, isValid = null)");
        String readCache = extractFunction(homeScript, "function readCache(cacheKey, ttlMs, isValid = null)");
        String shopValidator = extractFunction(homeScript, "function isValidShopPacksPayload(data)");

        assertTrue(
                homeScript.contains("fetchCachedJson('shopPacks', '/api/shop/packs', PACK_CACHE_TTL_MS, isValidShopPacksPayload)"),
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
    void shopPackFailureKeepsValidStateAndOffersAForcedRetry() throws IOException {
        String homeScript = readHomeScript();
        String applyPayload = extractFunction(homeScript, "function applyShopPacksPayload(data)");
        String ensureLoaded = extractFunction(homeScript, "async function ensurePacksLoaded(force = false)");

        assertTrue(
                applyPayload.contains("if (!isValidShopPacksPayload(data))")
                        && !applyPayload.substring(0, applyPayload.indexOf("return false;")).contains("state.packs ="),
                "A failed or empty response must not wipe a previously valid in-memory pack catalog."
        );
        assertTrue(
                ensureLoaded.contains("if (force) clearCache('shopPacks')")
                        && homeScript.contains("data-retry-shop-packs")
                        && homeScript.contains("ensurePacksLoaded(true)"),
                "The Shop error state must expose a Retry action that bypasses the stale pack cache."
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
    void signedInGameOptionsUseIdentityScopedCache() throws IOException {
        String homeScript = readHomeScript();
        String fetchGameOptions = extractFunction(homeScript, "async function fetchGameOptions()");

        assertTrue(
                homeScript.contains("function gameOptionsCacheKey()")
                        && homeScript.contains("'gameOptions:signed-in'")
                        && homeScript.contains("'gameOptions:guest'")
                        && fetchGameOptions.contains("const cached = readCache(cacheKey, STATIC_CACHE_TTL_MS);")
                        && fetchGameOptions.contains("if (cached && hasCardCatalog(cached)) return cached;")
                        && !fetchGameOptions.contains("if (!state.token)")
                        && extractFunction(homeScript, "async function submitAuth(mode)").contains("await refreshLiveCatalog()"),
                "Guest and signed-in binder loads must use separate identity-scoped caches, "
                        + "and both may paint from a warm cache without waiting on /api/game/options."
        );
    }

    @Test
    void cardPreviewDrawerSwipesBetweenSummaryAndBattleMoves() throws IOException {
        String gameScript = readGameScript();
        String styleCss = Files.readString(Path.of("src/main/resources/static/css/style.css"));
        String updateSelectedInfo = extractFunction(gameScript, "function updateSelectedInfo(card, msg)");
        String bindPager = extractFunction(gameScript, "function bindSelectedPreviewPager(root)");
        String movesPage = extractFunction(gameScript, "function renderSelectedPreviewMovesPage(card)");

        assertTrue(
                updateSelectedInfo.contains("selected-preview-pager")
                        && updateSelectedInfo.contains("data-selected-preview-page=\"summary\"")
                        && updateSelectedInfo.contains("data-selected-preview-page=\"moves\"")
                        && updateSelectedInfo.contains("bindSelectedPreviewPager(el)")
                        && movesPage.contains("renderSelectedCardBattlePreview(card")
                        && bindPager.contains("syncSelectedPreviewDrawerTitle")
                        && bindPager.contains("Swipe for moves"),
                "Selecting a card must open a two-page Card Preview pager: summary plus battle-action moves."
        );
        assertTrue(
                styleCss.contains(".selected-preview-pages")
                        && styleCss.contains("grid-auto-columns: 100%")
                        && styleCss.contains("scroll-snap-type: x mandatory")
                        && styleCss.contains(".selected-preview-dot")
                        && gameScript.contains("target.closest('[data-selected-preview-pages]')"),
                "The pager must scroll-snap horizontally, show page dots, and not fight drawer drag-to-close."
        );
        assertTrue(
                !styleCss.contains("min(58vh, 420px)")
                        && styleCss.contains("var(--mobile-action-bar-height) + 168px")
                        && styleCss.contains("#drawerSelected .selected-preview-pager"),
                "Card Preview with the pager must keep the compact action-bar tray height, not half the viewport."
        );
    }

    @Test
    void guestBinderPagesFullCatalogInsteadOfMountingEveryTile() throws IOException {
        String homeScript = readHomeScript();
        String renderCards = extractFunction(homeScript, "function renderCards()");
        String logout = extractFunction(homeScript, "async function logout()");

        assertTrue(
                homeScript.contains("const BINDER_PAGE_SIZE = 24")
                        && homeScript.contains("binderVisibleLimit: 24")
                        && renderCards.contains("data-binder-load-more")
                        && renderCards.contains("visibleCards.map(renderCardTile)"),
                "Guest Show-unowned binders must page the card grid instead of mounting the full catalog at once."
        );
        assertTrue(
                logout.contains("writeCache('gameOptions:guest', catalog)")
                        && !logout.contains("clearGameOptionsCaches()")
                        && logout.contains("removeItem(HUB_CACHE_PREFIX + 'gameOptions:signed-in')"),
                "Logout must keep the live catalog as the guest cache rather than wiping every options key."
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
                        && ownedDataLoading.contains("hasOwnedCards")
                        && ownedDataLoading.contains("Object.keys(ownedCards)")
                        && !ownedDataLoading.contains("!state.profile;"),
                "An empty or missing cached ownedCards map must keep the binder loading until sync confirms the collection."
        );
        assertTrue(
                renderCards.contains("panelLoadingMarkup('Loading your card binder…')")
                        && renderCards.contains("grid.setAttribute('aria-busy', 'true')")
                        && renderCards.contains("allCount.textContent = 'Loading cards…'"),
                "The binder load race must show a visible and accessible loading status instead of zero owned cards."
        );
    }

    /**
     * A failed /api/game/options used to hand applyGameOptions null, which installed
     * an empty-but-truthy catalog over the cached one. Every owned card then filtered
     * away and the binder reported "0 owned cards" to a player whose collection was
     * sitting in localStorage — the signed-in path is the exposed one when a live
     * fetch fails after the identity-scoped cache was skipped or emptied.
     */
    @Test
    void failedCatalogFetchNeverEmptiesTheBinder() throws IOException {
        String homeScript = readHomeScript();
        String applyGameOptions = extractFunction(homeScript, "function applyGameOptions(options)");
        String fetchGameOptions = extractFunction(homeScript, "async function fetchGameOptions()");
        String renderCards = extractFunction(homeScript, "function renderCards()");
        String renderDecks = extractFunction(homeScript, "function renderDecks()");

        assertTrue(
                homeScript.contains("function hasCardCatalog(options)")
                        && applyGameOptions.contains("if (!hasCardCatalog(options) && hasCardCatalog(state.options)) return;"),
                "A catalog-less options payload must not replace a populated catalog."
        );
        assertTrue(
                fetchGameOptions.contains("return readCache(cacheKey, STATIC_CACHE_TTL_MS);"),
                "A failed options fetch must fall back to the cached catalog for this identity, "
                        + "not resolve null."
        );
        // renderDecks routes the same check through decksLoading(), which the saved-deck
        // pane shares so both halves of the page agree on when data is still in flight.
        assertTrue(
                homeScript.contains("function decksLoading()")
                        && extractFunction(homeScript, "function decksLoading()")
                                .contains("!hasCardCatalog(state.options) || ownedDataLoading()"),
                "decksLoading() must gate on both an empty catalog and in-flight owned data."
        );
        assertTrue(
                renderCards.contains("if (!hasCardCatalog(state.options) || ownedDataLoading())")
                        && renderDecks.contains("if (decksLoading())"),
                "An empty card catalog means the payload never arrived, so the binder and deck grids "
                        + "must show their loading status rather than an authoritative empty state."
        );
    }

    @Test
    void shopShowsLoadingStatusUntilPacksAndProgressionArrive() throws IOException {
        String homeScript = readHomeScript();
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));
        String shopDataLoading = extractFunction(homeScript, "function shopDataLoading()");
        String renderShop = extractFunction(homeScript, "function renderShop()");
        String applyShopPacksPayload = extractFunction(homeScript, "function applyShopPacksPayload(data)");
        String ensurePacksLoaded = extractFunction(homeScript, "async function ensurePacksLoaded(force = false)");

        assertTrue(
                homeScript.contains("shopPacksLoading: true")
                        && ensurePacksLoaded.contains("state.shopPacksLoading = true")
                        && applyShopPacksPayload.contains("state.shopPacksLoading = false"),
                "The shop must start out loading and clear the flag however the pack catalog attempt resolves."
        );
        assertTrue(
                shopDataLoading.contains("state.shopPacksLoading && !state.packs.length")
                        && shopDataLoading.contains("!state.profileSynced")
                        && shopDataLoading.contains("!state.progression"),
                "A missing pack catalog or an unsynced signed-in progression snapshot must both count as shop loading."
        );
        assertTrue(
                renderShop.contains("if (shopDataLoading())")
                        && renderShop.contains("panelLoadingMarkup('Loading the shop…')")
                        && renderShop.contains("grid.setAttribute('aria-busy', 'true')")
                        && renderShop.contains("goldLabel.textContent = 'Loading…'"),
                "The shop must show the spinner and loading bar instead of an empty pack panel while data is in flight."
        );
        assertTrue(
                homeCss.contains(".panel-loading-spinner")
                        && homeCss.contains(".panel-loading-bar")
                        && homeCss.contains("animation: panel-spin")
                        && homeCss.contains("animation: panel-loading-slide"),
                "The shared panel loading spinner and bar styles must ship in home.css."
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
    void siegeKnightCardShieldsDoNotRenderElementalEmblems() throws IOException {
        String homeScript = readHomeScript();
        String gameScript = readGameScript();
        String style = Files.readString(STYLE_CSS);
        String binderCard = extractFunction(homeScript, "function renderKnightBinderCard(");
        String loadout = extractFunction(gameScript, "function renderLoadoutOptions(");
        String hudCard = extractFunction(gameScript, "function knightHudOverlayCardInnerHtml(");

        assertFalse(
                binderCard.contains("knight-shield-element")
                        || loadout.contains("knight-shield-element")
                        || hudCard.contains("knight-shield-element"),
                "Binder, loadout, and battle HUD cards must leave the painted shield center empty."
        );
        assertFalse(
                style.contains("--knight-element-icon") || style.contains(".knight-shield-element"),
                "Shared card CSS must not reintroduce an elemental image over the painted shield."
        );
    }

    @Test
    void cardDragGhostKeepsTheCompactHandCardLayout() throws IOException {
        String style = Files.readString(STYLE_CSS);
        String dragSession = extractFunction(readGameScript(), "function activateCardDragSession()");

        assertTrue(
                selectorCovers(style, "\\.hand-card-body \\{ display: none; \\}", ".card-drag-ghost")
                        && selectorCovers(style, "\\.card-stat-pill", ".card-drag-ghost"),
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
    void keepInteriorsDrawUniqueFurnishingsAndWalkRoomToRoom() throws IOException {
        String keepHtml = Files.readString(KEEP_HTML);
        String keepCss = Files.readString(KEEP_CSS);
        String keepJs = Files.readString(KEEP_JS);

        Matcher placeable = Pattern.compile("data-decoration-art=\"([a-z_]+)\" data-decor-slot=").matcher(keepHtml);
        Set<String> decorationIds = new LinkedHashSet<>();
        while (placeable.find()) decorationIds.add(placeable.group(1));
        assertTrue(decorationIds.size() >= 35, "Every production room should expose its six placeable furnishings.");
        for (String id : decorationIds) {
            assertTrue(
                    keepCss.contains("[data-decoration-art=\"" + id + "\"]"),
                    id + " has no art of its own — interiors must not share one recoloured decoration template."
            );
        }
        assertFalse(
                keepCss.contains(".room-decoration-set [data-decor-slot="),
                "Decoration geometry keyed by slot number makes every workshop read as the same room in a new hue."
        );
        assertTrue(
                keepHtml.contains("data-decoration-art=\"coppice_storewall\"")
                        && keepHtml.contains("data-decoration-art=\"provision_pantry\"")
                        && keepJs.contains("<small>Local storage</small>")
                        && keepJs.contains("roomDecorations.filter((item) => item.crafted).length}/${decorationTotal}")
                        && keepJs.contains("recipe.type === 'DECORATION' ? roomDecorations.length : tools.length"),
                "The sixth room furnishing must have unique location art and expose its storage effect in the upgrade summary."
        );
        assertTrue(
                keepJs.contains("function stepInterior(") && keepJs.contains("INTERIOR_TOUR")
                        && keepJs.contains("data-interior-goto=") && keepHtml.contains("data-interior-step=\"-1\"")
                        && keepCss.contains(".interior-arrow"),
                "Players must be able to move between interiors without stepping back out to the grounds."
        );
    }

    /**
     * A Siegeling's size band has to mean the same thing in every room it can stand in.
     * The band shipped Enclave-only, so a Gigantic legendary towered over the huts and then
     * shrank back to a stock silhouette the moment it was posted to a workshop.
     */
    @Test
    void everyRoomThatDrawsAResidentAtWorldScaleHonoursItsSizeBand() throws IOException {
        String keepCss = Files.readString(KEEP_CSS);

        for (String responsiveBase : new String[] {
                "--keep-resident-cutout-width: clamp(", "--keep-resident-cutout-height: clamp(",
                "--keep-enclave-cutout-width: clamp(", "--keep-enclave-cutout-height: clamp(",
                "--keep-worker-cutout-width: clamp(", "--keep-worker-cutout-height: clamp(" }) {
            assertTrue(
                    keepCss.contains(responsiveBase),
                    responsiveBase + " must grow world residents with the desktop viewport."
            );
        }

        for (String holder : new String[] {
                ".enclave-residents b", ".enclave-interior-residents b",
                ".resident-worker > span", ".lodge-resident > span", ".hall-favorite-resident > span",
                ".facility-room-resident > span" }) {
            for (String band : new String[] { "SMALL", "MEDIUM", "LARGE", "GIGANTIC" }) {
                assertTrue(
                        keepCss.contains(holder + "[data-size=\"" + band + "\"]"),
                        holder + " must take the " + band + " size band, or a resident changes height "
                                + "just by being reassigned to that room."
                );
            }
        }
        // Every cutout dimension in those rooms must actually consume the scale.
        for (String sized : new String[] {
                ".resident-worker > span.has-overlay-art", ".lodge-resident > span.has-overlay-art",
                ".hall-favorite-resident > span.has-overlay-art",
                ".facility-room-resident > span.has-overlay-art" }) {
            int at = keepCss.indexOf(sized);
            assertTrue(at >= 0, sized + " is missing from keep.css");
            String block = keepCss.substring(at, Math.min(keepCss.length(), at + 260));
            assertTrue(
                    block.contains("var(--cutout-scale)"),
                    sized + " sets a fixed size, so its room ignores the Siegeling's size band."
            );
        }
        // The Covenant Hall favorite is #hallFavoriteResident. The older .shrine-art rules are
        // orphaned — #favoriteShrine is no longer in keep.html — so scaling them would only make
        // dead CSS look maintained.
        assertFalse(
                keepCss.contains(".shrine-art[data-size="),
                "#favoriteShrine is gone from keep.html; scale .hall-favorite-resident instead of dead CSS."
        );
    }

    @Test
    void enclaveSwapsResidentsByPortraitAndTheDashboardCanTuneTheKeep() throws IOException {
        String keepJs = Files.readString(KEEP_JS);
        String keepCss = Files.readString(KEEP_CSS);
        String dashboardHtml = Files.readString(CARD_DASHBOARD_HTML);
        String dashboardJs = Files.readString(CARD_DASHBOARD_JS);
        String keepAdminJs = Files.readString(Path.of("src/main/resources/static/js/keep-admin.js"));

        assertTrue(
                keepJs.contains("data-enclave-picker=") && keepJs.contains("enclave-portrait")
                        && keepJs.contains("state.enclavePickerSlot") && keepCss.contains(".enclave-portrait"),
                "Tapping an Enclave portrait must reopen the assign menu."
        );
        assertFalse(
                keepJs.contains(">Clear</button>"),
                "The Enclave remove button was replaced by the tappable portrait; a stray Clear button reintroduces two ways to do one thing."
        );
        assertTrue(
                keepJs.contains("!choice.assignment?.assigned") && keepJs.contains("reassign-tag")
                        && keepCss.contains(".enclave-resident-choice .reassign-tag"),
                "The assign menu must offer unassigned Siegelings first and tag anyone already posted as a reassignment."
        );
        assertTrue(
                keepJs.contains("function rapportMeterMarkup(") && keepJs.contains("function enclaveTasksMarkup(")
                        && keepCss.contains(".rapport-block"),
                "Enclave residents must show their rapport and the tasks that raise it."
        );
        assertTrue(
                keepJs.contains("enclaveOpenSlot: -1") && keepJs.contains("function enclaveSpaceButtonMarkup(")
                        && keepJs.contains("data-enclave-space=\"${index}\"")
                        && keepJs.contains("data-enclave-space=\"-1\"")
                        && keepJs.contains("function collapseEnclaveSpaces(")
                        && keepCss.contains(".enclave-space-grid") && keepCss.contains(".enclave-collapse"),
                "Enclave spaces must collapse to a grid of Siegeling buttons that open one space at a time and close back to the grid."
        );
        assertTrue(
                dashboardHtml.contains("data-editor-page=\"KEEP\"") && dashboardHtml.contains("id=\"keepTuningPanel\"")
                        && dashboardHtml.contains("/js/keep-admin.js?v=1")
                        && dashboardJs.contains("state.editorPage === \"KEEP\"")
                        && keepAdminJs.contains("/api/keep/tuning"),
                "The dashboard needs a Keep page wired to the Keep tuning endpoints."
        );
        assertTrue(
                keepAdminJs.contains("Building Output") && keepAdminJs.contains("Siegeling Buffs")
                        && keepAdminJs.contains("Decorations & Tools") && keepAdminJs.contains("Enclave Tasks"),
                "Keep tuning must cover building effects, resident buffs, decorations, and Enclave tasks."
        );
    }

    @Test
    void keeperJourneyOpensOnTheCurrentChapterAndScrollsItsListVertically() throws IOException {
        String keepHtml = Files.readString(KEEP_HTML);
        String keepCss = Files.readString(KEEP_CSS);
        String keepJs = Files.readString(KEEP_JS);

        assertTrue(
                keepHtml.contains("id=\"journeyToggle\"")
                        && keepJs.contains("journeyShowAllChapters = false")
                        && keepJs.contains("journeyShowAllChapters || !currentChapter ? chapters : [currentChapter]")
                        && keepJs.contains("`All ${chapters.length} chapters`"),
                "The Keeper's Journey must open focused on the current chapter, with a toggle that reveals the full list."
        );
        assertTrue(
                keepCss.contains(".journey-track { flex: 1 1 auto; min-height: 0;")
                        && keepCss.contains("grid-template-columns: repeat(auto-fill, minmax(118px, 1fr))")
                        && !keepCss.contains("scroll-snap-type: x proximity"),
                "The chapter list must own the card's leftover height and wrap its levels into rows, so nothing is clipped in landscape."
        );
    }

    @Test
    void keepersFavorPicksACharacterCellAndConfirmsBeforeHonoring() throws IOException {
        String keepHtml = Files.readString(KEEP_HTML);
        String keepCss = Files.readString(KEEP_CSS);
        String keepJs = Files.readString(KEEP_JS);

        assertTrue(
                keepJs.contains("function favorCellMarkup(") && keepJs.contains("data-favor-open")
                        && keepJs.contains("is-silhouette") && keepJs.contains("FAVOR_SILHOUETTE"),
                "The Keeper's Favor must lead with one cell holding the current favorite, or a silhouette when none is honored."
        );
        assertTrue(
                keepJs.contains("function favorTileMarkup(") && keepJs.contains("data-favor-candidate")
                        && keepJs.contains("state.favorPickerOpen") && keepCss.contains(".favor-grid { display: grid;"),
                "Tapping the honored cell must open a grid of Siegeling portrait cells."
        );
        assertTrue(
                keepHtml.contains("id=\"favorOverlay\"") && keepHtml.contains("data-favor-approve")
                        && keepHtml.contains("data-favor-deny") && keepHtml.contains("id=\"favorConfirmArt\"")
                        && keepJs.contains("function renderFavorConfirm(") && keepJs.contains("function approveFavorCandidate(")
                        && keepCss.contains(".favor-confirm-card"),
                "Picking a portrait must raise a confirm sheet with the paper cutout, the effect line, and approve/deny."
        );
        assertFalse(
                keepJs.contains("data-set-favorite") || keepCss.contains(".favorite-choice"),
                "The old one-tap favorite list must be gone, or a portrait could still change the keep-wide bonus without confirmation."
        );
        assertTrue(
                keepJs.contains("resident.favoriteBonusPercent"),
                "The confirm sheet must quote the server's per-Siegeling bonus so the preview cannot drift from the boost applied."
        );
    }

    @Test
    void enteringABuildingUnderConstructionShowsItsSiteAndAConstructionHudMenu() throws IOException {
        String keepHtml = Files.readString(KEEP_HTML);
        String keepCss = Files.readString(KEEP_CSS);
        String keepJs = Files.readString(KEEP_JS);

        assertTrue(
                keepHtml.contains("id=\"interiorBuildToggle\"")
                        && keepHtml.contains("id=\"interiorBuildKind\"")
                        && keepHtml.contains("id=\"interiorBuildClock\"")
                        && keepHtml.contains("id=\"interiorBuildMenu\"")
                        && keepHtml.contains("id=\"interiorBuildArt\"")
                        && keepCss.contains(".interior-build-toggle {")
                        && keepCss.contains(".interior-build-menu {"),
                "The interior HUD must carry a construction toggle, its menu, and the work-site drawing."
        );
        assertTrue(
                keepJs.contains("function interiorConstruction(")
                        && keepJs.contains("function constructionRoomId(")
                        && keepJs.contains("function renderInteriorConstruction(")
                        && keepJs.contains("target === 'hall' ? 'great_hall' : target"),
                "Entering a room must resolve the crew working on that specific building."
        );
        assertTrue(
                keepJs.contains("function constructionKindLabel(")
                        && keepJs.contains("'Keep rank'") && keepJs.contains("'Storage annex'")
                        && keepJs.contains("'Expansion'") && keepJs.contains("'New building'")
                        && keepJs.contains("data-live-interior-time")
                        && keepJs.contains("function formatCompletionTime(")
                        && keepJs.contains("timeSaverMarkup(construction, true)"),
                "The menu must name the construction type, tick its clock, state when it finishes, and reuse the shared time savers."
        );
        assertTrue(
                keepJs.contains("const BUILD_ART = {")
                        && keepJs.contains("function buildArtMarkup(")
                        && keepJs.contains("data-phase-min=\"3\"")
                        && keepCss.contains(".build-art-svg > g.is-raised")
                        && java.util.stream.Stream.of("great_hall:", "woodlot:", "archive:", "garden:", "forge:",
                                "fridge:", "generator:", "quarry:", "kitchen:", "enclave:").allMatch(keepJs::contains),
                "Every walkable room needs its own work-site drawing whose groups raise as the project advances."
        );
        assertTrue(
                keepJs.contains("if (state.interior) renderInterior();")
                        && keepJs.contains("else openPanel('projects');"),
                "Buying time from inside a building must leave the player in the room, not throw them into the Projects panel."
        );
    }

    @Test
    void leaderboardPanelSeparatesAFailedFetchFromAnEmptyBoard() throws IOException {
        String homeJs = Files.readString(HOME_JS);

        assertTrue(
                homeJs.contains("function applyLeaderboardsPayload(")
                        && homeJs.contains("state.leaderboards = failed ? null : payload;")
                        && !homeJs.contains("state.leaderboards = leaderboards || null;"),
                "A { error } response must not be stored as the leaderboard payload, or a failed fetch renders as an empty board."
        );
        assertTrue(
                homeJs.contains("function retryLeaderboards(")
                        && homeJs.contains("data-home-lb-retry")
                        && homeJs.contains("class=\"home-lb-error\""),
                "The failed state needs its own markup and a retry, so a cold-start blip is recoverable without reloading the hub."
        );
    }

    @Test
    void leaderboardPanelShowsLoadingBeforeTheFirstFetchLands() throws IOException {
        String homeJs = Files.readString(HOME_JS);

        // The dashboard paints before loadAll() has asked for anything, so an
        // unset payload is not a failure: a 25s cold start used to greet every
        // player with the retry banner for a board that was still on its way.
        assertTrue(
                homeJs.contains("leaderboardsLoading: true,")
                        && homeJs.contains("state.leaderboardsRetrying || state.leaderboardsLoading")
                        && homeJs.contains("state.leaderboardsLoading = false;"),
                "The pre-fetch state must render as loading, not as a failed fetch."
        );
        assertTrue(
                homeJs.contains("const leaderboardsLoad = loadLeaderboardsWithRetry()"),
                "Leaderboards must settle on their own promise, so a sibling hub fetch cannot strand the panel loading."
        );
        assertTrue(
                homeJs.contains("readCache('leaderboards', LEADERBOARD_CACHE_TTL_MS)"),
                "A cached board within its TTL should paint on the first frame instead of a loading emblem."
        );
        // A warming Cloud Run instance recovers in seconds, and the only thing the
        // Retry button did was ask again — so the load makes those attempts itself.
        assertTrue(
                homeJs.contains("const LEADERBOARD_RETRY_DELAYS_MS = [")
                        && homeJs.contains("async function loadLeaderboardsWithRetry()")
                        && homeJs.contains("const leaderboardsLoad = loadLeaderboardsWithRetry()"),
                "A cold-start failure must retry on its own before the panel asks the player to click Retry."
        );
        assertTrue(
                homeJs.contains("panelLoadingMarkup('Loading leaderboards…', true)")
                        && Files.readString(Path.of("src/main/resources/static/css/home.css"))
                                .contains(".panel-loading.compact"),
                "The leaderboard's waiting state needs the shared spinner markup and its compact sizing."
        );
    }

    @Test
    void notificationPanelClearsTheTopSafeArea() throws IOException {
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));

        // The panel is bottom-anchored and grows upward, so its max-height is what
        // decides whether a full list runs under the clock and the Dynamic Island.
        assertTrue(
                homeCss.contains("max-height: calc(100dvh - var(--hud-clearance) - env(safe-area-inset-top, 0px) - 40px);")
                        && !homeCss.contains("max-height: calc(100vh - 240px - env(safe-area-inset-bottom, 0px));"),
                "The notification panel's ceiling must subtract the top safe-area inset, not just the bottom one."
        );
    }

    @Test
    void popupsAnchorAboveTheDockedHudFromOneMeasuredClearance() throws IOException {
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));
        String homeJs = Files.readString(HOME_JS);

        assertTrue(
                homeCss.contains("--hud-clearance: calc(var(--bottom-hud-height, 205px) + 8px);"),
                "Popups need one shared clearance token derived from the measured HUD height."
        );
        // Constants stood in for the HUD's height and were all shorter than it
        // actually is, so each of these popups overlapped the dock.
        assertTrue(
                !homeCss.contains("bottom: calc(200px + env(safe-area-inset-bottom, 0px));")
                        && !homeCss.contains("padding: 10px 10px calc(194px + env(safe-area-inset-bottom, 0px));")
                        && !homeCss.contains("var(--bottom-hud-height, 170px)"),
                "No popup may guess the docked HUD's height with a constant."
        );
        assertTrue(
                homeJs.contains("function observeBottomHud(")
                        && homeJs.contains("new window.ResizeObserver(() => measureBottomHud()).observe(nav)")
                        && homeJs.contains("observeBottomHud();"),
                "The HUD grows when signing in adds action buttons, and no resize event fires — the nav itself must be observed or every anchored popup drifts back under it."
        );
    }

    @Test
    void keepTeamsPillCountsDownFromFullCapacity() throws IOException {
        String keepHtml = Files.readString(KEEP_HTML);
        String keepJs = Files.readString(KEEP_JS);

        assertTrue(
                keepJs.contains("const availableTeams = Math.max(0, teamCapacity - activeTeams);")
                        && keepJs.contains("text('constructionTeamAmount', `${availableTeams}/${teamCapacity}`);")
                        && !keepJs.contains("text('constructionTeamAmount', `${activeTeams}/${teamCapacity}`);"),
                "The Teams pill reads as idle crews on hand: it starts full and drops as projects claim teams."
        );
        assertTrue(
                keepHtml.contains("id=\"constructionTeamAmount\">1/1<"),
                "The pre-snapshot placeholder must match the free-teams reading, not the old active-teams one."
        );
    }

    @Test
    void keepBuildingsAndRoomsUseLayeredPaperTreatments() throws IOException {
        String keepHtml = Files.readString(KEEP_HTML);
        String keepCss = Files.readString(KEEP_CSS);
        String keepJs = Files.readString(KEEP_JS);

        assertTrue(
                keepHtml.contains("class=\"paper-building-shell\"")
                        && keepHtml.contains("/css/keep.css?v=54")
                        && keepHtml.contains("/js/keep.js?v=54")
                        && keepHtml.contains("id=\"hallFavoriteResident\"")
                        && keepHtml.contains("id=\"productionReady\"")
                        && keepHtml.contains("id=\"collectOverlay\"")
                        && keepJs.contains("constructionBannerSignature")
                        && keepJs.contains("data-live-banner-time=")
                        && keepJs.contains("hallFavoriteResident")
                        && keepJs.contains("favorite?.resident")
                        && keepJs.contains("function offlineCapacityRow")
                        && keepJs.contains("offline-capacity-list")
                        && keepJs.contains("woodlotCapacity <= 0 || available < woodlotCapacity")
                        && keepJs.contains("function collectAllReady(")
                        && keepJs.contains("repeatableProjects?.projects")
                        && keepJs.contains("Voice of Sanctuary")
                        && keepJs.contains("stationId: 'all'")
                        && keepJs.contains("function projectedTotalReady(")
                        && keepJs.contains("`${totalReady} ready`")
                        && keepJs.contains("function openCollectPopup(")
                        && keepJs.contains("collect-meter-gain")
                        && keepCss.contains(".collect-overlay")
                        && keepCss.contains(".collect-meter-was")
                        && keepCss.contains(".collect-meter-gain")
                        && !keepJs.contains("productionReady')?.classList.toggle('hidden', available <= 0)")
                        && !keepJs.contains("+${constructions.length - 1} more")
                        && !keepJs.contains("Storage reached capacity\", `${name} stopped until collected`"),
                "Keep architecture must retain its paper building hooks, refresh both asset cache pins, show the favorite in Covenant Hall, collapse storage-capacity offline alerts into one multi-line card, gate the Woodlot Collect bubble to a full stockpile, collect from every ready production point, and show a collect storage popup."
        );
        assertTrue(
                keepCss.contains(".hall-hotspot .building-label")
                        && keepCss.contains("left: -66px;")
                        && keepCss.contains("top: -6px;")
                        && keepCss.contains("bottom: auto;"),
                "The phone Covenant Hall label must stay in the open upper-left sky instead of covering the gatehouse."
        );
        assertTrue(
                keepJs.contains("/api/keep/construction/speedup")
                        && keepJs.contains("function timeSaverMarkup(")
                        && keepJs.contains("data-speedup-payment=\"MATERIALS\"")
                        && keepJs.contains("data-speedup-payment=\"SIEGECOINS\"")
                        && keepCss.contains(".time-saver-options")
                        && keepCss.contains(".time-saver-choice"),
                "Every active Keep project must expose material and Siegecoin time savers in the Projects popup."
        );
        assertTrue(
                keepJs.contains("/api/keep/build/purchase")
                        && keepJs.contains("data-toggle-instant-buy=")
                        && keepJs.contains("data-purchase-build=")
                        && keepJs.contains("This skips the timber, materials, construction crew, and wait")
                        && keepCss.contains(".instant-buy-button")
                        && keepCss.contains(".instant-purchase-confirm"),
                "Available projects must offer a deliberate Siegecoin instant-purchase confirmation in the shared popup."
        );
        assertTrue(
                keepCss.contains(".construction-team-pill {")
                        && keepCss.contains("grid-template-columns: auto minmax(0, 1fr);")
                        && keepCss.contains("column-gap: 12px;")
                        && keepCss.contains("column-gap: 10px;")
                        && keepCss.contains("position: static;")
                        && keepCss.contains("min-width: 112px;")
                        && keepCss.contains("min-width: 100px;"),
                "The Teams resource pill must lay the hammer beside counts with a real column gap so the glyph cannot overlay N/N."
        );
        assertTrue(
                keepHtml.contains("id=\"frontReturn\"")
                        && keepHtml.contains("Return to Keep")
                        && keepHtml.contains("id=\"frontManage\"")
                        && keepJs.contains("function enterAkharsFront()")
                        && keepJs.contains("function exitAkharsFront()")
                        && keepJs.contains("state.frontView ? 'akhars_front' : 'keep'")
                        && keepJs.contains("Occupied Siegelings can be moved here")
                        && keepJs.contains("assignmentType: resident.assignment?.type || ''")
                        && keepCss.contains(".keep-app.front-view-active .keep-dock")
                        && keepCss.contains(".building-hotspot:not(.front-hotspot)")
                        && keepCss.contains(".front-battle { position: absolute; inset: 0 0 33px; display: none;")
                        && keepHtml.contains("class=\"front-torches\"")
                        && keepCss.contains("linear-gradient(180deg, #170b2d 0%, #32113c 35%, #66233e 55%, #281829 100%)")
                        && keepCss.contains("@keyframes front-torch-flicker")
                        && keepCss.contains(".keep-app.front-view-active .front-battle { display: block;"),
                "Akhar's Front must remain a compact map destination, reveal its responsive night battle and torches only after entry, name occupied reassignment locations, and provide a tested route back to the Keep grounds."
        );
        assertTrue(
                keepHtml.contains("data-front-src=\"/audio/sieglings-battle-theme.mp3?v=1\"")
                        && Files.exists(Path.of("src/main/resources/static/audio/sieglings-battle-theme.mp3"))
                        && keepJs.contains("function syncMusicForLocation()")
                        && keepJs.contains("track: state.frontView ? 'battle' : 'keep'")
                        && keepCss.contains(".front-view-toolbar { top: calc(52px + var(--safe-top));")
                        && !keepCss.contains(".keep-app.front-view-active .keep-resource-bar")
                        && !keepCss.contains(".keep-app.front-view-active .keep-header-actions"),
                "The Wall must retain the complete Keep HUD, place its phone toolbar below the resources, and switch the shared music control to the supplied battle theme."
        );
        assertTrue(
                keepHtml.contains("data-front-raider=\"0\"")
                        && keepHtml.contains("class=\"front-raider-health\"")
                        && keepHtml.contains("id=\"frontProjectiles\"")
                        && keepHtml.contains("id=\"frontCoinBurst\"")
                        && keepJs.contains("function advanceFrontCombat(ms)")
                        && keepJs.contains("function defeatFrontRaider(enemy)")
                        && keepJs.contains("combat.coinsEarned +=")
                        && keepJs.contains("combatRatePerMinute")
                        && keepJs.contains("defeatsThisVisit")
                        && keepCss.contains(".front-raider-health")
                        && keepHtml.contains("class=\"raider-art\"><span class=\"front-raider-health\"")
                        && keepJs.contains("art.innerHTML = `<span class=\"front-raider-health\"")
                        && keepCss.contains(".front-raiders i .raider-art svg { display: block; width: 100%; height: auto;")
                        && keepCss.contains("top: -9px;")
                        && keepCss.contains(".front-projectile::after")
                        && keepCss.contains(".front-coin-burst.is-visible"),
                "Akhar's Front combat must march health-bearing dark Siegelings toward the wall, fire elemental projectiles, and surface a coin award for every defeat."
        );
        assertTrue(
                keepCss.contains(".building-illustration svg.paper-building-shell")
                        && keepCss.contains("drop-shadow(0 1px 0 #ead8ad)")
                        && keepCss.contains(".int-backwall::after")
                        && keepCss.contains("mix-blend-mode: soft-light")
                        && keepCss.contains(".hall-favorite-resident")
                        && keepCss.contains(".favor-cell {")
                        && keepCss.contains(".offline-capacity-list"),
                "Exterior silhouettes and room shells must retain their cardstock edges and print grain, with the hall favorite cutout, the honored favor cell, and offline capacity list."
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
        assertTrue(
                keepCss.contains(".lodge-resident > span[data-size=\"GIGANTIC\"]")
                        && keepCss.contains(".facility-room-resident > span[data-size=\"GIGANTIC\"]")
                        && keepCss.contains("width: calc(var(--keep-resident-cutout-width) * var(--cutout-scale))")
                        && keepCss.contains("height: calc(var(--keep-resident-cutout-height) * var(--cutout-scale))")
                        && keepCss.contains("width: calc(62px * var(--cutout-scale))")
                        && keepCss.contains("height: calc(78px * var(--cutout-scale))")
                        && keepJs.contains("node.dataset.size = residentSize(resident)"),
                "The size band must scale resident cutouts in the Woodlot and every staffed workshop interior at desktop and phone layouts."
        );
        assertTrue(
                keepCss.contains("width: min(calc(var(--keep-exterior-cutout-width) * var(--cutout-scale)), 15%)")
                        && keepCss.contains("animation-name: enclave-exterior-bob")
                        && keepCss.contains(".exterior-enclave-residents b:nth-child(1) { left: 10%; }")
                        && keepCss.contains(".exterior-enclave-residents b:nth-child(5) { left: 90%;")
                        && keepCss.contains(".scene-zoom { right: calc(6px + var(--safe-right)); top: 28%; }"),
                "All five exterior Enclave residents need separate width-bounded lanes without horizontal wandering or zoom controls covering them."
        );
        assertTrue(
                keepCss.contains(".keep-dock .collect-button { width: min(166px, 22vw); margin: 0 5px;")
                        && !keepCss.contains(".keep-dock .collect-button { margin-top: -10px;"),
                "Collect must align inside the dock instead of using a negative top margin that overlaps the Keep map."
        );
        // Locked scenery ("Unlock from Projects") and several panels send the player to Projects by
        // name, so the dock must keep a control that carries that name — the Teams pill counts crews,
        // not projects, and leaves those instructions pointing at nothing.
        assertTrue(
                keepHtml.contains("<button type=\"button\" data-open-panel=\"projects\">")
                        && keepHtml.contains("<strong>Projects</strong>"),
                "The Keep dock must keep its named Projects button so every 'Unlock from Projects' hint has a visible destination."
        );
    }

    @Test
    void keepInteractionNpcsSurfaceAffinityAndDistantSpectrum() throws IOException {
        String keepHtml = Files.readString(KEEP_HTML);
        String keepCss = Files.readString(KEEP_CSS);
        String keepJs = Files.readString(KEEP_JS);

        assertTrue(
                keepJs.contains("kind === 'INTERACTION'")
                        && keepJs.contains("Returns · affinity")
                        && keepJs.contains("Affinity +")
                        && keepJs.contains("return 'Distant'")
                        && keepJs.contains("<i>Distant</i><i>Acquainted</i><i>Trusted</i><i>Bonded</i>")
                        && keepHtml.contains("id=\"dialogueAffinity\"")
                        && keepCss.contains(".dialogue-affinity")
                        && keepCss.contains(".conversation-card.is-interaction"),
                "Interaction NPCs must show recurring affinity feedback on the Distant→Bonded Voices spectrum."
        );
        assertFalse(
                keepJs.contains("return 'Wary'"),
                "The zero-trust Voices stage is Distant, matching the spectrum labels."
        );
    }

    @Test
    void keepSetbacksExposeTimedAndCoinRepairsWithBadChoiceFollowups() throws IOException {
        String keepHtml = Files.readString(KEEP_HTML);
        String keepCss = Files.readString(KEEP_CSS);
        String keepJs = Files.readString(KEEP_JS);

        assertTrue(
                keepHtml.contains("id=\"keepEventOverlay\"")
                        && keepHtml.contains("data-keep-event-repair=\"TIME\"")
                        && keepHtml.contains("data-keep-event-repair=\"SIEGECOINS\"")
                        && keepJs.contains("/api/keep/event/repair")
                        && keepJs.contains("function renderKeepEvent()")
                        && keepJs.contains("function keepEventRemaining()")
                        && keepJs.contains("class=\"notice-repair-card\"")
                        && keepJs.contains("function keepActivityBadgeCount()")
                        && keepJs.contains("status: snapshot.activeKeepEvent.repairInProgress ? 'underway' : 'action_needed'")
                        && keepJs.contains("activeKeepEvent:")
                        && keepJs.contains("function roomDamageNoticeMarkup(")
                        && keepJs.contains("Offline until repaired")
                        && keepJs.contains("data-live-repair-timer")
                        && keepJs.contains("function isProductionStationDamaged(")
                        && keepCss.contains(".keep-event-overlay")
                        && keepCss.contains(".notice-repair-card")
                        && keepCss.contains(".is-damaged")
                        && keepCss.contains(".interior-damage-card")
                        && keepCss.contains(".interior-damage-timer"),
                "Keep setbacks need an activity-menu repair cue, repair sheet, live timer, coin route, damaged-interior notice, and debug snapshot state."
        );
        assertFalse(
                keepHtml.contains("id=\"keepEventAlert\"")
                        || keepCss.contains(".keep-event-alert")
                        || keepJs.contains("nextEventId !== previousEventId"),
                "Repairs belong in Keep activity and must not render or automatically open a separate map-covering alert."
        );
        assertTrue(
                keepCss.contains(".repair-scaffold")
                        && keepJs.contains("function raiseRepairScaffold(")
                        && keepJs.contains("scaffold repair-scaffold"),
                "Damage must read as scaffolding raised over the building illustration."
        );
        assertFalse(
                keepCss.contains("content: \"REPAIR\""),
                "Damage must not print a badge on .is-damaged::after: that is the same box as the "
                        + ".building-hotspot::after hover ring, so it inherits the ring's inset and "
                        + "stretches into a slab covering the whole building."
        );
        assertTrue(
                keepJs.contains("data-dialogue-followup=")
                        && keepJs.contains("Face what follows")
                        && keepJs.contains("This answer caused a new Interaction."),
                "A bad Voice answer must lead directly into its one-time consequence Interaction."
        );
    }

    @Test
    void keepListsSeparateUnreadEntriesFromReadOnes() throws IOException {
        String keepCss = Files.readString(KEEP_CSS);
        String keepJs = Files.readString(KEEP_JS);

        assertTrue(
                keepJs.contains("listSection('Unread'") && keepJs.contains("listSection('Read'")
                        && keepJs.contains("listSection('New'") && keepJs.contains("listSection('Earlier'")
                        && keepCss.contains(".list-section-heading"),
                "The Chronicle and the notice tray must file unread entries above read ones under their own dividers."
        );
        assertTrue(
                keepJs.contains("at: nowMs(), read: false") && keepJs.contains("function markNoticesRead()")
                        && keepJs.contains("function unreadNoticeCount()")
                        && keepCss.contains(".notice-item.unread") && keepCss.contains(".notice-item.is-read"),
                "Messages must carry their own read state so the New group and the header badge agree."
        );
        assertFalse(
                keepJs.contains("state.noticeUnread"),
                "The tray badge must derive from per-message read state, not a counter that zeroes on open."
        );
        assertTrue(
                keepJs.contains("state.sessionReadLoreIds"),
                "An entry read during a Chronicle visit must hold its place until the panel is reopened."
        );
    }

    @Test
    void siegeLocationsFillTheWholeDeviceScreenWithoutOneLargeGlassPanel() throws IOException {
        String adventureCss = Files.readString(ADVENTURE_CSS).replace("\r\n", "\n");
        String adventureHtml = Files.readString(ADVENTURE_HTML);

        assertTrue(
                adventureCss.contains("body[data-screen=\"campScreen\"] .siege-app,")
                        && adventureCss.contains("body[data-screen=\"rewardScreen\"] .siege-app{\n"
                                + "  position:relative; max-width:none; width:100%;\n"
                                // --siege-vh is the visual viewport height (dvh is the fallback):
                                // a zoomed or mid-rotation layout viewport does not match the glass.
                                + "  height:var(--siege-vh,100dvh); min-height:0; overflow:hidden; padding:0;"),
                "Location screens must run edge to edge — no max-width box and no page padding around the scene."
        );
        assertTrue(
                adventureCss.contains(".location-stage{\n"
                        + "  position:relative; flex:1 1 auto; width:100%; height:100%; min-height:0;\n"
                        + "  overflow:hidden; isolation:isolate; border:0; border-radius:0;"),
                "The scene fills its screen instead of sitting in a rounded, inset card."
        );
        assertTrue(
                adventureCss.contains(".location-overlay{\n"
                        + "  position:absolute; inset:0; z-index:8; pointer-events:none;")
                        && adventureCss.contains(".location-overlay > *{pointer-events:auto;}"),
                "The overlay must be a transparent layout layer over the whole stage, not a docked panel."
        );
        assertFalse(
                adventureCss.contains("background:linear-gradient(180deg,rgba(8,12,18,.26),rgba(7,10,15,.54));")
                        || adventureCss.contains("backdrop-filter:blur(5px) saturate(1.08);"),
                "The single large glass box behind every decision is gone; the blur now lives on the individual pieces."
        );
        assertTrue(
                adventureCss.contains("calc(env(safe-area-inset-top, 0px) + 46px)")
                        && adventureCss.contains("calc(12px + env(safe-area-inset-bottom, 0px))"),
                "Art bleeds under the notch and home indicator while controls stay inset by the safe area."
        );
        assertTrue(
                adventureCssPin(adventureHtml) >= 56,
                "adventure.css must be cache-busted after the full-bleed location rework."
        );
    }

    /**
     * A hired mercenary makes a fourth body on .ally-line (warband caps at 3). The
     * plates used to keep their min-content width when the sprites shrank, so the
     * stat row painted over the neighbouring unit and the outermost plate was pushed
     * outside the overflow:hidden stage — clipped HP in portrait, overlapping plates
     * in landscape. tests/siege-merc-party-layout-check.cjs measures the result; these
     * pin the three declarations it depends on.
     */
    @Test
    void siegeUnitPlatesSurviveAFourthUnitOnTheLine() throws IOException {
        String adventureCss = Files.readString(ADVENTURE_CSS).replace("\r\n", "\n");
        String adventureJs = Files.readString(ADVENTURE_JS);

        assertTrue(
                adventureCss.contains(".sprite{position:relative; --sprite-scale:1; flex:0 1 auto; min-width:0;"),
                "A sprite must be allowed to shrink past its own name plate, or a four-unit "
                        + "line overflows the arena."
        );
        assertTrue(
                adventureCss.contains(".sprite .sp-tags{display:flex; flex-wrap:wrap;"),
                "The stat row has no ellipsis to fall back on, so it must wrap rather than "
                        + "spill over the next unit."
        );
        assertTrue(
                adventureJs.contains("<span class=\"sp-merc\">Merc</span>")
                        && adventureCss.contains(".sprite.merc .sp-plate{"),
                "A rental badges its role and tints its plate instead of spending plate width "
                        + "on a \" (Merc)\" suffix."
        );
    }

    @Test
    void siegeBattleMapsStayStaticSmallAndOrientationMatched() throws IOException {
        String adventureCss = Files.readString(ADVENTURE_CSS).replace("\r\n", "\n");
        String adventureHtml = Files.readString(ADVENTURE_HTML);
        String adventureJs = Files.readString(ADVENTURE_JS);
        String mapCatalog = Files.readString(SIEGE_MAPS_JS);

        assertTrue(
                adventureHtml.indexOf("/js/siege-maps.js?v=3") < adventureHtml.indexOf("/js/adventure.js?v=")
                        && adventureHtml.contains("<div class=\"battle-map\" id=\"battleMap\" aria-hidden=\"true\"></div>"),
                "The map catalog must load before adventure.js and the decorative layer must ship inside the stage."
        );
        assertTrue(
                adventureCss.contains("background-image:var(--map-landscape)")
                        && adventureCss.contains("@media (orientation: portrait){\n  .battle-map{ background-image:var(--map-portrait); }")
                        && adventureCss.contains("background-size:cover")
                        && adventureCss.contains("contain:paint"),
                "One paint-contained map layer must switch compositions with the arena orientation."
        );
        assertTrue(
                adventureCss.contains("flex-flow:row nowrap; gap:var(--arena-unit-gap)")
                        && adventureCss.contains("left:var(--arena-side-inset-left); right:auto;")
                        && adventureCss.contains("right:var(--arena-side-inset-right); left:auto; flex-direction:row-reverse;")
                        && adventureCss.contains("--arena-unit-bottom-clearance")
                        && adventureCss.contains("body[data-screen=\"battleScreen\"] .siege-app{\n    max-width:none;\n    width:100%;\n    padding:0;\n  }"),
                "Landscape allies and foes must occupy mirrored horizontal lanes between the top chrome and AP HUD, with the arena shell padding-free so art reaches the glass under the notch."
        );
        assertTrue(
                adventureJs.contains("function battleMapId(node)")
                        && adventureJs.contains("pool[hashPick(node.id, pool.length)]")
                        && adventureJs.contains("matchMedia('(orientation: landscape)').matches")
                        && adventureJs.contains("'.svg?v=' + MAP_ASSET_V"),
                "Map selection must be deterministic and preload only the current orientation's SVG."
        );

        String[] ids = {
                "muster-field", "ash-road", "tourney-yard",
                "moat-crossing", "rampart-breach", "gatehouse",
                "keep-hall", "umbral-vault", "throne-of-the-siegelord"
        };
        Set<String> delivered = new LinkedHashSet<>();
        try (var files = Files.list(BATTLE_MAP_DIR)) {
            files.filter(path -> path.getFileName().toString().endsWith(".svg"))
                    .forEach(path -> delivered.add(path.getFileName().toString()));
        }
        assertTrue(delivered.size() == 18, "Siege must deliver exactly nine landscape/portrait SVG pairs.");
        assertTrue(mapCatalog.contains("bySegment") && mapCatalog.contains("boss"),
                "The segment and boss map pools must ship with the compositions.");

        for (String id : ids) {
            for (String orientation : new String[] { "landscape", "portrait" }) {
                String name = id + "-" + orientation + ".svg";
                Path file = BATTLE_MAP_DIR.resolve(name);
                assertTrue(delivered.contains(name), "Missing battle-map composition " + name);
                assertTrue(Files.size(file) <= 5 * 1024, name + " exceeds the 5KB raw budget.");
                String svg = Files.readString(file);
                String viewBox = orientation.equals("landscape")
                        ? "viewBox=\"0 0 1200 680\""
                        : "viewBox=\"0 0 900 800\"";
                assertTrue(svg.contains(viewBox), name + " has the wrong crop-safe composition ratio.");
                assertFalse(svg.contains("<text") || svg.contains("<image") || svg.contains("@keyframes")
                                || svg.contains("<animate") || svg.contains("feTurbulence")
                                || svg.contains("feGaussianBlur"),
                        name + " must remain decorative, self-contained, and free of continuous repaint effects.");
                Matcher shapes = Pattern.compile("<(?:path|rect|circle|ellipse|g)\\b").matcher(svg);
                int shapeCount = 0;
                while (shapes.find()) shapeCount++;
                assertTrue(shapeCount <= 45, name + " exceeds the 45-shape rendering budget.");
            }
        }
    }

    @Test
    void siegeRunMenuSavesBeforeQuitAndRestartsOnlyAfterServerAbandon() throws IOException {
        String adventureHtml = Files.readString(ADVENTURE_HTML);
        String adventureJs = Files.readString(ADVENTURE_JS);

        assertTrue(adventureHtml.contains("id=\"runMenuSave\"")
                        && adventureHtml.contains("id=\"runMenuRestart\"")
                        && adventureHtml.contains("id=\"runMenuQuit\"")
                        && adventureCssPin(adventureHtml) >= 56
                        && adventureJsPin(adventureHtml) >= 62,
                "The active-run menu and both cache-busted bundles must ship together.");
        String restartRun = extractFunction(adventureJs, "function restartRun(");
        assertTrue(adventureJs.contains("api('/api/siege/run/save'")
                        && adventureJs.contains("if (!run.checkpoint) throw new Error")
                        && restartRun.contains("api('/api/siege/run/abandon'")
                        && restartRun.indexOf("api('/api/siege/run/abandon'") < restartRun.indexOf("state.run = null"),
                "Save/Quit must require a durable checkpoint and Restart must abandon server state before clearing local state.");
        // The resume prompt can abandon the OTHER mode's save, so the device token is
        // only cleared when it is the one that was just dropped, and what remains is
        // re-read rather than assumed gone.
        assertTrue(restartRun.contains("if (t === token()) setToken(null);")
                        && restartRun.contains("resumeOrRoster()"),
                "Abandoning one save must not clear a token pointing at the other mode's run.");
        assertFalse(adventureJs.contains("resetPageScroll"),
                "The menu port must not revive the stale PR's superseded map-scroll implementation.");
    }

    @Test
    void siegeBootPrefersTheSignedInAccountsExpeditionAcrossDevices() throws IOException {
        String adventureJs = Files.readString(ADVENTURE_JS);
        String resume = extractFunction(adventureJs, "function resumeOrRoster()");

        assertTrue(extractFunction(adventureJs, "function boot()").contains("resumeOrRoster()")
                        && resume.contains("api('/api/siege/run/active')")
                        && resume.contains("bootFromLocalToken"),
                "Signed-in players must resume their account checkpoint before a device-local token, with guest fallback.");
        // An account holds one save per mode, so the boot check reads the whole list —
        // taking only `run` would hide whichever mode was not saved last.
        assertTrue(resume.contains("active.runs")
                        && resume.contains("renderResumePrompt(saves)"),
                "The boot check must offer every saved mode, not just the most recent run.");
        assertTrue(adventureJs.contains("function runSlotBadgeText(run)")
                        && adventureJs.contains("run.slot === 'BATTLEGROUNDS'"),
                "Siege and Battlegrounds must be labelled apart wherever a run is shown.");
    }

    @Test
    void dashboardPublishesLoadedCatalogVersion() throws IOException {
        String dashboardScript = Files.readString(CARD_DASHBOARD_JS);
        String applyServerPayload = extractFunction(dashboardScript, "function applyServerPayload(payload)");
        String buildExportData = extractFunction(dashboardScript, "function buildExportData()");

        assertTrue(
                dashboardScript.contains("catalogVersion: 0"),
                "Dashboard state should track the loaded catalog revision."
        );
        assertTrue(
                applyServerPayload.contains("state.catalogVersion = Number(payload.catalogVersion) || 0;"),
                "Dashboard loads must remember the server catalog revision."
        );
        assertTrue(
                buildExportData.contains("catalogVersion: state.catalogVersion"),
                "Live publish payloads must include their base catalog revision to prevent stale full-snapshot overwrites."
        );
    }

    private static String readGameScript() throws IOException {
        return Files.readString(GAME_JS);
    }

    private static String readHomeScript() throws IOException {
        return Files.readString(HOME_JS);
    }

    private static String readHomePage() throws IOException {
        return Files.readString(HOME_HTML);
    }

    /**
     * Slices a top-level object literal by brace depth. Template-literal SVG art
     * contains braces of its own, so a naive indexOf("};") would truncate.
     */
    private static String extractObjectLiteral(String source, String declaration) {
        int start = source.indexOf(declaration);
        assertTrue(start >= 0, "Could not find " + declaration);

        int braceStart = start + declaration.length() - 1;
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

        throw new AssertionError("Could not find end of " + declaration);
    }

    /**
     * An overcharge — the surge an active energy buff puts on a side's pool for its next
     * Setup and Battle phase — must never be a silent number change. The energy view and
     * the portrait HUD's energy number both have to say the pool is running hot.
     */
    @Test
    void overchargedEnergyIsAnnouncedInTheEnergyViewAndThePortraitHud() throws IOException {
        String gameScript = Files.readString(GAME_JS);
        String styleCss = Files.readString(STYLE_CSS);
        String playMarkup = Files.readString(PLAY_HTML);

        String panel = extractFunction(gameScript, "function renderEnergyDetailPanel()");
        assertTrue(
                panel.contains("energyDetailOverchargeBlock(p)")
                        && panel.contains("energyDetailOverchargeBlock(e)")
                        && panel.contains("classList.toggle('is-overcharged', anyOvercharged)"),
                "The energy view must render the overcharge banner for both sides and flag the panel."
        );

        String rows = extractFunction(gameScript, "function energyDetailElementRows(playerData)");
        assertTrue(
                rows.contains("getOverchargeEnergyAmount(playerData, key)")
                        && rows.contains("is-overcharged"),
                "Overcharged element rows must be marked so the breakdown explains the bigger pool."
        );

        String hudSide = extractFunction(gameScript, "function updateMobileHudSide(label, playerData, ids)");
        assertTrue(
                hudSide.contains("syncOverchargeCue(ids.energyId, playerData)"),
                "The portrait HUD energy number must pick up the overcharge cue."
        );

        assertTrue(
                styleCss.contains(".energy-overcharge-banner")
                        && styleCss.contains(".energy-detail-row.is-overcharged")
                        && styleCss.contains(".m-counts strong.is-overcharged")
                        && styleCss.contains("@keyframes overcharge-pulse"),
                "The energy view and portrait HUD both need the overcharge styling."
        );
        assertTrue(
                styleCss.contains("@media (prefers-reduced-motion: reduce) {\n    .energy-overcharge-banner,\n"
                        + "    .m-counts strong.is-overcharged {\n        animation: none;\n    }\n}"),
                "The overcharge pulse must stop for players who ask for reduced motion."
        );
        assertTrue(
                styleCssPin(playMarkup) >= 230 && gameJsPin(playMarkup) >= 240,
                "The overcharge cue ships only if both cache pins advance together."
        );
    }

    /**
     * `getEvolutionBaseCells` returns board cells, not [row, col] pairs. Destructuring
     * them as pairs threw a TypeError out of the hand lock check, and because the hand
     * is built as one string and assigned only at the end, that throw left the entire
     * hand frozen on its previous contents - a card the player had just played onto its
     * precursor stayed on screen. The lock check is also wrapped so no future throw in
     * it can freeze the hand again.
     */
    @Test
    void evolutionLockCheckReadsBaseCellsAsCellsAndCannotFreezeTheHand() throws IOException {
        String source = Files.readString(GAME_JS);

        String baseCells = extractFunction(source, "function getEvolutionBaseCells(");
        assertTrue(
                baseCells.contains("cells.push(cell)"),
                "getEvolutionBaseCells is expected to yield board cells; update the callers below if that changes."
        );

        String lockReason = extractFunction(source, "function computeHandCardLockReason(");
        assertFalse(
                lockReason.contains("baseCells.some(([r, c])"),
                "Evolution base cells are cell objects, not [row, col] pairs - destructuring them throws out of renderHand."
        );
        assertTrue(
                lockReason.contains("baseCells.some((cell) => cellHasAffliction(cell, 'CURSE'))"),
                "The cursed-base check must read the cell it was handed."
        );

        String guarded = extractFunction(source, "function getHandCardLockReason(");
        assertTrue(
                guarded.contains("computeHandCardLockReason(card)") && guarded.contains("catch"),
                "One card's lock check must never abort renderHand and strand the hand on stale markup."
        );
    }

    /**
     * The pin only ever moves forward, so cache-pin guards assert a floor rather than an
     * exact number - pinning the exact version made every later, unrelated bump red.
     */
    private static int gameJsPin(String markup) {
        return assetPin(markup, "game\\.js");
    }

    private static int styleCssPin(String markup) {
        return assetPin(markup, "style\\.css");
    }

    @Test
    void emptyFeaturedMissionsFallThroughToFullDailyList() throws IOException {
        String homeScript = readHomeScript();
        String homeMarkup = Files.readString(HOME_HTML);
        String homeDailyMissions = extractFunction(homeScript, "function homeDailyMissions()");

        assertTrue(
                homeDailyMissions.contains("featured && featured.length ? featured : all"),
                "An empty featured array is truthy in JS and must not blank the Daily tab "
                        + "when the full missions snapshot is present."
        );
        assertTrue(
                homeJsPin(homeMarkup) >= 139,
                "Mission featured-fallback fix must bump the home.js cache pin."
        );
    }

    // Asserts a rule targeting the given subject also applies to the wanted
    // selector, without pinning the exact :is() list — that list legitimately
    // grows as new surfaces reuse the rule.
    @Test
    void mulliganLeaveMatchForfeitsStartedOnlineGames() throws IOException {
        String gameScript = readGameScript();
        String playMarkup = Files.readString(PLAY_HTML);
        String leaveOnlineMatch = extractFunction(gameScript, "async function leaveOnlineMatch(");

        assertTrue(
                playMarkup.contains("onclick=\"leaveOnlineMatch()\"")
                        && playMarkup.contains("id=\"mulliganWaitActions\""),
                "The mulligan wait UI must keep exposing Leave match."
        );
        assertTrue(
                leaveOnlineMatch.contains("/api/match/forfeit")
                        && leaveOnlineMatch.contains("wins by forfeit")
                        && leaveOnlineMatch.indexOf("/api/match/forfeit")
                        < leaveOnlineMatch.indexOf("openLoadoutSelector()"),
                "Leave match during an active multiplayer game must forfeit before clearing local session."
        );
        assertTrue(
                leaveOnlineMatch.contains("gameState?.multiplayer")
                        && leaveOnlineMatch.contains("/api/match/close"),
                "Unstarted lobby teardown may still close; started matches must take the forfeit branch first."
        );
        assertTrue(
                gameJsPin(playMarkup) >= 241,
                "Play must load the forfeiting leaveOnlineMatch bundle."
        );
    }

    @Test
    void playAuthProfileMergesPreserveProgressionWhenOmitted() throws IOException {
        String playHudScript = Files.readString(Path.of("src/main/resources/static/js/play-hud.js"));
        String gameScript = readGameScript();
        String applyProfile = extractFunction(playHudScript, "function applyProfileResponse(data)");
        String syncAuth = extractFunction(gameScript, "async function syncAuthProfileNow(silent = false)");

        assertTrue(
                applyProfile.contains("previous.progression")
                        && applyProfile.contains("!data.progression")
                        && applyProfile.contains("saveCachedAuthProfile(merged)"),
                "Play HUD friend responses must merge a missing progression onto the prior same-user snapshot before caching."
        );
        assertTrue(
                syncAuth.contains("previous.progression")
                        && syncAuth.contains("!data.progression")
                        && syncAuth.contains("saveCachedAuthProfile(merged)"),
                "Play /api/auth/me refresh must not overwrite sieglingsAuthProfile with a progression-less authenticated body."
        );
        assertFalse(
                applyProfile.contains("saveCachedAuthProfile(data)")
                        || syncAuth.contains("saveCachedAuthProfile(data)"),
                "Progression-less profile payloads must not be written straight into the shared auth cache."
        );
    }

    @Test
    void playHudJoinWithCodeForfeitsActiveMatchBeforeClearingLocalSession() throws IOException {
        Path playHudJs = Path.of("src/main/resources/static/js/play-hud.js");
        String playHud = Files.readString(playHudJs);
        String playMarkup = Files.readString(PLAY_HTML);
        String abandon = extractFunction(playHud, "async function abandonActiveMatchForJoinCode()");
        String openJoin = extractFunction(playHud, "async function openJoinWithCode()");

        assertTrue(
                assetPin(playMarkup, "play-hud\\.js") >= 3,
                "Play must cache-bust play-hud.js after the Join With Code forfeit fix."
        );
        assertTrue(
                openJoin.contains("await abandonActiveMatchForJoinCode()")
                        && openJoin.contains("openLoadoutSelector"),
                "Join With Code must abandon the live match before openLoadoutSelector clears local session state."
        );
        assertTrue(
                abandon.contains("/api/match/forfeit")
                        && abandon.contains("/api/game/forfeit")
                        && abandon.contains("X-Player-Token")
                        && abandon.contains("X-Solo-Token")
                        && abandon.contains("wins by forfeit"),
                "Leaving via Join With Code must forfeit online and solo matches server-side, matching Quit Match."
        );
        assertFalse(
                abandon.contains("openLoadoutSelector"),
                "The abandon helper must not clear the local session itself; forfeit first, then open the loadout."
        );
    }

    private static boolean selectorCovers(String css, String subjectPattern, String wanted) {
        Matcher matcher = Pattern.compile("(:is\\([^)]*\\))\\s*" + subjectPattern).matcher(css);
        while (matcher.find()) {
            if (matcher.group(1).contains(wanted)) {
                return true;
            }
        }
        return false;
    }

    private static int homeJsPin(String markup) {
        return assetPin(markup, "home\\.js");
    }

    private static int homeCssPin(String markup) {
        return assetPin(markup, "home\\.css");
    }

    private static int cardBinderVisualPin(String markup) {
        return assetPin(markup, "card-binder-visual\\.js");
    }

    private static int actionQueuePin(String markup) {
        return assetPin(markup, "action-queue\\.js");
    }

    private static int adventureJsPin(String markup) {
        return assetPin(markup, "adventure\\.js");
    }

    private static int adventureCssPin(String markup) {
        return assetPin(markup, "adventure\\.css");
    }

    // Cache pins only ever move forward, so assert a floor rather than an exact
    // value — a literal pin turns every unrelated asset edit into a red test.
    private static int assetPin(String markup, String assetPattern) {
        Matcher matcher = Pattern.compile(assetPattern + "\\?v=(\\d+)").matcher(markup);
        assertTrue(matcher.find(), "Markup does not load " + assetPattern + " with a cache pin.");
        return Integer.parseInt(matcher.group(1));
    }

    /**
     * Save failures used to surface as a bare alert() that named neither the offending
     * control nor, for a server rejection, anything the player could act on. Every deck
     * rejection now raises the in-builder callout, which scrolls to and highlights the
     * field the error is tagged with.
     */
    @Test
    void deckSaveFailuresPointAtTheControlToFix() throws IOException {
        String homeScript = readHomeScript();
        String saveCustomDeck = extractFunction(homeScript, "async function saveCustomDeck()");

        assertFalse(saveCustomDeck.contains("alert("),
                "Deck save rejections must use the builder callout, not a bare alert().");
        assertTrue(saveCustomDeck.contains("setBuilderIssue(data?.error")
                        && saveCustomDeck.contains("data?.field"),
                "A server rejection must carry its message and field tag into the callout.");
        assertTrue(extractFunction(homeScript, "function focusBuilderIssueTarget()").contains("needs-fix"),
                "The callout must highlight the control the player has to fix.");
        assertTrue(extractFunction(homeScript, "function renderDeckBuilderPage()").contains("renderBuilderIssueBanner()"),
                "The builder page must render the issue banner.");
    }

    /**
     * A custom loadout whose card ids are missing from this page's catalog was silently
     * shortened, so a saved 30-card deck reached /api/game/new as a stub and came back
     * rejected as if it were empty. The start path now refuses and names the cards.
     */
    @Test
    void unknownCustomDeckCardsBlockTheStartInsteadOfShrinkingTheDeck() throws IOException {
        String startSelectedGame = extractFunction(readGameScript(), "async function startSelectedGame()");

        assertTrue(startSelectedGame.contains("getUnknownLoadoutCardIds(Object.keys(builderCounts))"),
                "A builder loadout must be checked for cards missing from the catalog before starting.");
        assertTrue(startSelectedGame.contains("getUnknownLoadoutCardIds(savedDeck.customDeckCards || [])"),
                "A saved custom deck must be checked for cards missing from the catalog before starting.");
        assertTrue(startSelectedGame.contains("unknownLoadoutCardMessage(missing)"),
                "The player must be told which cards are missing rather than seeing a short deck rejected.");
    }

    /**
     * The tile's delete used to arm on the first tap and fire on the second, with no
     * visible commit step and a timer that disarmed it — on a phone that read as
     * "Delete -> Delete? -> nothing happened". It now asks once in a dialog, and a
     * binder full of duplicates can be cleared in one batch.
     */
    @Test
    void savedDeckTilesDeleteBehindAConfirmDialogAndClearTheActiveSelection() throws IOException {
        String homeScript = readHomeScript();
        String deleteSavedDecks = extractFunction(homeScript, "async function deleteSavedDecks(deckIds)");
        String renderSavedDecks = extractFunction(homeScript, "function renderSavedDecks()");

        assertFalse(homeScript.contains("armSavedDeckDelete("),
                "The two-tap arming must be gone, not merely bypassed.");
        assertTrue(renderSavedDecks.contains("deleteSavedDeck(btn.dataset.deleteCustomDeck || '')"),
                "One tap on a tile's Delete must start the deletion.");
        assertTrue(deleteSavedDecks.contains("if (!await confirmDeckDelete(doomed)) return;"),
                "Deleting must be confirmed in the dialog before anything is removed.");
        assertTrue(deleteSavedDecks.contains("'/api/profile/decks/delete'"),
                "Deleting must go through the existing saved-deck delete endpoint.");
        assertTrue(deleteSavedDecks.contains("ids.length === 1 ? { id: ids[0] } : { ids }"),
                "A batch must go out as one request rather than one call per deck.");
        assertTrue(deleteSavedDecks.contains("if (ids.includes(state.selectedDeckId)) state.selectedDeckId = '';"),
                "The active loadout must not keep pointing at a deleted deck.");
        assertTrue(deleteSavedDecks.contains("state.savedDeckNotice = data?.error"),
                "A failed delete must surface the server's reason on the decks screen.");
        assertTrue(deleteSavedDecks.contains("if (deckAlreadyGone(data)) {"),
                "A deck the server no longer has must not be restored as an undeletable tile.");
        // game.js renders the Play page's saved-deck list from this same cache.
        assertTrue(deleteSavedDecks.contains("saveCachedAuthProfile(data)")
                        && extractFunction(homeScript, "async function saveCustomDeck()").contains("saveCachedAuthProfile(data)"),
                "Saving and deleting must both refresh the shared profile cache, "
                        + "or the change is lost on the next load and on the Play page.");
    }

    /**
     * Mobile Safari holds a tap ~300ms waiting for a possible double-tap zoom, and
     * the body's pan-x/pan-y does not release it — only touch-action:manipulation on
     * the element does. The battle screen opted in long ago; the hub had not, so
     * every button there felt like it needed a second tap.
     */
    @Test
    void hubControlsOptOutOfMobileSafarisTapDelay() throws IOException {
        String homeCss = Files.readString(Path.of("src/main/resources/static/css/home.css"));
        assertTrue(homeCss.contains(":where(button, a, summary, label, input, select, "
                        + "[role=\"button\"], [role=\"checkbox\"], [role=\"tab\"]) {")
                        && homeCss.contains("touch-action: manipulation;"),
                "Hub controls must opt out of the double-tap-zoom wait.");
        assertTrue(homeCss.contains(":where(.primary-btn, .ghost-btn, .deck-delete-btn):active {"),
                "A press must be acknowledged before any handler or request runs.");
    }

    /** The confirm dialog and the bulk controls have to exist in the page it runs on. */
    @Test
    void savedDeckDeleteDialogAndBulkControlsShipInTheHubMarkup() throws IOException {
        String home = readHomePage();
        assertTrue(home.contains("id=\"deckDeleteConfirmModal\"") && home.contains("id=\"deckDeleteConfirmGo\"")
                        && home.contains("id=\"deckDeleteConfirmCancel\""),
                "The delete confirm dialog shell must be in home.html.");
        assertTrue(home.contains("id=\"selectDecksBtn\"") && home.contains("id=\"selectAllDecksBtn\"")
                        && home.contains("id=\"deleteSelectedDecksBtn\""),
                "Selecting decks and deleting the selection must be reachable from the saved-deck header.");
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
