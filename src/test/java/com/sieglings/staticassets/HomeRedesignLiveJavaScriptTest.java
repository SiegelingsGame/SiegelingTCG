package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The art-first hub is now the primary /home. Two contracts on its live-data
 * module were easy to get wrong and both look like "the account is empty":
 * progression gold lives under {@code .progression}, and saved decks arrive on
 * {@code /api/auth/me}, not a GET of the POST-only {@code /api/profile/decks}.
 */
class HomeRedesignLiveJavaScriptTest {

    private static String read(String path) throws Exception {
        return Files.readString(Path.of(path));
    }

    @Test
    void liveHubReadsNestedProgressionAndAuthMeDecks() throws Exception {
        String live = read("src/main/resources/static/js/home-redesign-live.js");
        String html = read("src/main/resources/static/home-next.html");

        assertTrue(live.contains("function unwrapProgression(payload)"),
                "gold/ownedCards live under .progression on both /api/auth/me and GET /api/player/progression");
        assertTrue(live.contains("unwrapProgression(me) || unwrapProgression(progressionPayload)"),
                "a signed-in /api/auth/me payload must supply gold even if the extra progression fetch lags");
        assertTrue(live.contains("savedDecks: (me && me.savedDecks) || null"),
                "saved decks must come from /api/auth/me; GET /api/profile/decks does not exist");
        assertTrue(live.contains("matchHistory: (me && me.matchHistory) || null"),
                "match history is on /api/auth/me, not on PlayerProgressionService.serialize()");
        assertFalse(live.contains("get('/api/profile/decks')"),
                "must not GET the POST-only deck save endpoint");
        assertTrue(html.contains("home-redesign-live.js?v=5"),
                "home-next.html must pin the live bundle that unwraps progression");
    }

    @Test
    void socialJoinIsARealLobbyLink() throws Exception {
        String js = read("src/main/resources/static/js/home-redesign.js");
        String html = read("src/main/resources/static/home-next.html");

        assertTrue(js.contains("function lobbyPath(room)")
                        && js.contains("'/social/lobby/' + encodeURIComponent(code)"),
                "an open table must navigate to the live lobby route the legacy hub still hosts");
        assertTrue(js.contains("var extra = href ? ' href=\"' + esc(href) + '\"' : '';"),
                "Join must be an href, not a span that looks tappable");
        assertTrue(js.contains("if (screen === 'social') mountSocial(app);")
                        && js.contains("data-join-code"),
                "Join code must prompt and route to /social/lobby/{code}");
        assertTrue(js.contains("href=\"/battle\"")
                        && js.contains("Host a table"),
                "Host a table must leave for the Battle loadout that actually creates rooms");
        assertTrue(html.contains("home-redesign.js?v=11"),
                "home-next.html must pin the Join-link bundle");
    }
}
