package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.AuthSession;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.AuthSessionStore;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccountServiceTest {

    @Test
    void resetPasswordRequiresConfiguredOwnerCode() throws Exception {
        AccountService service = createService(new FakeAccountUserStore(null), new FakeAuthSessionStore(), "");

        assertThrows(IllegalArgumentException.class,
                () -> service.resetPassword("player@example.com", "secret", "newpass1"));
    }

    @Test
    void resetPasswordReplacesHashAndCreatesSession() throws Exception {
        AccountUser user = new AccountUser();
        user.setId("player@example.com");
        user.setEmail("player@example.com");
        user.setDisplayName("Player");
        user.setPasswordHash(new BCryptPasswordEncoder().encode("oldpass1"));
        user.setCreatedAt(Instant.now());

        FakeAccountUserStore userStore = new FakeAccountUserStore(user);
        FakeAuthSessionStore sessionStore = new FakeAuthSessionStore();

        AccountService service = createService(userStore, sessionStore, "owner-code");
        service.resetPassword("PLAYER@example.com", "owner-code", "newpass1");

        assertTrue(userStore.saved);
        assertTrue(sessionStore.saved);
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        assertTrue(encoder.matches("newpass1", user.getPasswordHash()));
    }

    private AccountService createService(AccountUserStore userStore, AuthSessionStore sessionStore, String resetCode) throws Exception {
        AccountService service = new AccountService();
        setField(service, "userStore", userStore);
        setField(service, "sessionStore", sessionStore);
        setField(service, "passwordResetCode", resetCode);
        return service;
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static class FakeAccountUserStore extends AccountUserStore {
        private final AccountUser user;
        private boolean saved;

        FakeAccountUserStore(AccountUser user) {
            this.user = user;
        }

        @Override
        public Optional<AccountUser> findById(String id) {
            return user != null && user.getId().equals(id) ? Optional.of(user) : Optional.empty();
        }

        @Override
        public AccountUser save(AccountUser user) {
            saved = true;
            return user;
        }
    }

    private static class FakeAuthSessionStore extends AuthSessionStore {
        private boolean saved;

        @Override
        public AuthSession save(AuthSession session) {
            saved = true;
            return session;
        }
    }
}
