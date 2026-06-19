package com.sieglings.controller;

import com.sieglings.config.SessionCookieService;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.SavedDeckEntity;
import com.sieglings.service.AccountService;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.MatchHistoryService;
import com.sieglings.service.SavedDeckService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

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

        Map<String, Object> response = controller.me("Bearer token", new MockHttpServletResponse());

        assertEquals(true, response.get("authenticated"));
        assertFalse(response.containsKey("token"));
        assertEquals(List.of(), response.get("savedDecks"));
        assertEquals(List.of(), response.get("matchHistory"));
        assertEquals(List.of(), response.get("incomingFriendRequests"));
        assertEquals(List.of(), response.get("outgoingFriendRequests"));
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
