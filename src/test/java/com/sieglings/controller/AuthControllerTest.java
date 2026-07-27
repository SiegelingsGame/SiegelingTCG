package com.sieglings.controller;

import com.sieglings.config.SessionCookieAuthFilter;
import com.sieglings.config.SessionCookieService;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.SavedDeckEntity;
import com.sieglings.service.AccountService;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.MatchHistoryService;
import com.sieglings.service.SavedDeckService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthControllerTest {

    @Test
    void meKeepsSessionWhenProfileCollectionsAreUnavailable() throws Exception {
        AccountUser user = testUser();
        AuthController controller = createController(new AccountService() {
            @Override
            public AccountUser findUser(String authorizationHeader) {
                return user;
            }
        });

        Map<String, Object> response = controller.me(
                "Bearer token", new MockHttpServletRequest(), new MockHttpServletResponse());

        assertEquals(true, response.get("authenticated"));
        assertFalse(response.containsKey("token"));
        assertEquals(List.of(), response.get("savedDecks"));
        assertEquals(List.of(), response.get("matchHistory"));
        assertEquals(List.of(), response.get("incomingFriendRequests"));
        assertEquals(List.of(), response.get("outgoingFriendRequests"));
    }

    /**
     * Clients drop their localStorage Bearer token only when this flag is true, so a
     * request whose session cookie never arrived (Firebase Hosting forwards nothing
     * but {@code __session}) must report false — otherwise the credential is thrown
     * away and the next page load demands a fresh sign-in.
     */
    @Test
    void meReportsNoCookieSessionWhenTheRequestCarriedNoSessionCookie() throws Exception {
        AccountUser user = testUser();
        AuthController controller = createController(new AccountService() {
            @Override
            public AccountUser findUser(String authorizationHeader) {
                return user;
            }
        });

        Map<String, Object> response = controller.me(
                "Bearer token", new MockHttpServletRequest(), new MockHttpServletResponse());

        assertEquals(true, response.get("authenticated"));
        assertEquals(false, response.get("cookieSession"));
    }

    @Test
    void meReportsCookieSessionWhenTheSessionCookieAuthenticatedTheRequest() throws Exception {
        AccountUser user = testUser();
        AuthController controller = createController(new AccountService() {
            @Override
            public AccountUser findUser(String authorizationHeader) {
                return user;
            }
        });

        // The filter bridges the cookie onto the Authorization header, so the header
        // and the recorded cookie token are the same value.
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute(SessionCookieAuthFilter.SESSION_COOKIE_TOKEN_ATTRIBUTE, "session-token");

        Map<String, Object> response = controller.me(
                "Bearer session-token", request, new MockHttpServletResponse());

        assertEquals(true, response.get("authenticated"));
        assertEquals(true, response.get("cookieSession"));
    }

    @Test
    void unauthenticatedMeReportsNoCookieSession() throws Exception {
        AuthController controller = createController(new AccountService() {
            @Override
            public AccountUser findUser(String authorizationHeader) {
                return null;
            }
        });

        Map<String, Object> response = controller.me(
                null, new MockHttpServletRequest(), new MockHttpServletResponse());

        assertEquals(false, response.get("authenticated"));
        assertEquals(false, response.get("cookieSession"));
    }

    @Test
    void sessionCookieUsesTheOnlyNameFirebaseHostingForwards() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        new SessionCookieService(true).setSession(response, "session-token");

        List<String> setCookies = response.getHeaders("Set-Cookie");
        String session = setCookies.stream()
                .filter(header -> header.startsWith(SessionCookieService.SESSION_COOKIE + "="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No session cookie was set: " + setCookies));

        assertEquals("__session", SessionCookieService.SESSION_COOKIE);
        assertTrue(session.contains("session-token"), session);
        assertTrue(session.contains("HttpOnly"), session);
        assertTrue(session.contains("Secure"), session);
        // Scoped to the API so it never becomes part of the Hosting cache key for
        // static assets.
        assertTrue(session.contains("Path=/api"), session);
    }

    @Test
    void authFilterBridgesTheSessionCookieAndRecordsIt() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(SessionCookieService.SESSION_COOKIE, "session-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> seenHeader = new AtomicReference<>();

        new SessionCookieAuthFilter().doFilter(request, response, (req, res) ->
                seenHeader.set(((jakarta.servlet.http.HttpServletRequest) req).getHeader("Authorization")));

        assertEquals("Bearer session-token", seenHeader.get());
        assertEquals("session-token", request.getAttribute(SessionCookieAuthFilter.SESSION_COOKIE_TOKEN_ATTRIBUTE));
    }

    @Test
    void authFilterStillAcceptsThePreRenameSessionCookie() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(SessionCookieService.LEGACY_SESSION_COOKIE, "legacy-token"));
        AtomicReference<String> seenHeader = new AtomicReference<>();

        new SessionCookieAuthFilter().doFilter(request, new MockHttpServletResponse(), (req, res) ->
                seenHeader.set(((jakarta.servlet.http.HttpServletRequest) req).getHeader("Authorization")));

        assertEquals("Bearer legacy-token", seenHeader.get());
    }

    @Test
    void loginReturnsSessionTokenWhenProfileCollectionsAreUnavailable() throws Exception {
        AccountUser user = testUser();
        AuthController controller = createController(new AccountService() {
            @Override
            public AccountService.SessionView login(String email, String password) {
                return new AccountService.SessionView(user, "session-token");
            }
        });

        Map<String, Object> response = controller.login(Map.of(
                "email", user.getEmail(),
                "password", "password1"
        ), new MockHttpServletResponse());

        assertEquals(true, response.get("authenticated"));
        assertEquals("session-token", response.get("token"));
        assertEquals(List.of(), response.get("savedDecks"));
        assertEquals(List.of(), response.get("matchHistory"));
        assertEquals(List.of(), response.get("incomingFriendRequests"));
        assertEquals(List.of(), response.get("outgoingFriendRequests"));
    }

    private AuthController createController(AccountService accountService) throws Exception {
        AuthController controller = new AuthController();
        setField(controller, "accountService", accountService);
        setField(controller, "savedDeckService", new ThrowingSavedDeckService());
        setField(controller, "matchHistoryService", new ThrowingMatchHistoryService());
        setField(controller, "cardDefinitionService", new CardDefinitionService());
        setField(controller, "sessionCookieService", new SessionCookieService(true));
        return controller;
    }

    private AccountUser testUser() {
        AccountUser user = new AccountUser();
        user.setId("player@example.com");
        user.setEmail("player@example.com");
        user.setDisplayName("Player");
        return user;
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static class ThrowingSavedDeckService extends SavedDeckService {
        @Override
        public List<SavedDeckEntity> listDecks(AccountUser user) {
            throw new IllegalStateException("Firestore saved decks unavailable");
        }
    }

    private static class ThrowingMatchHistoryService extends MatchHistoryService {
        @Override
        public List<MatchHistoryEntity> listRecent(AccountUser user) {
            throw new IllegalStateException("Firestore match history unavailable");
        }
    }
}
