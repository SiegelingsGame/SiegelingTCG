package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.AuthSession;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.AuthSessionStore;
import com.sieglings.persistence.firestore.DailyMissionProgressStore;
import com.sieglings.persistence.firestore.DirectMessageStore;
import com.sieglings.persistence.firestore.FriendRequestStore;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import com.sieglings.persistence.firestore.ProfileSettingsStore;
import com.sieglings.persistence.firestore.SavedDeckStore;
import com.sieglings.persistence.firestore.UserPresenceStore;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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

    @Test
    void deleteAccountRequiresExactConfirmation() throws Exception {
        AccountUser user = newUser("player@example.com");
        FakeAccountUserStore userStore = new FakeAccountUserStore(user);
        AccountService service = createDeletionService(userStore);

        assertThrows(IllegalArgumentException.class, () -> service.deleteAccount(user, "delete"));
        assertThrows(IllegalArgumentException.class, () -> service.deleteAccount(user, ""));
        assertThrows(IllegalArgumentException.class, () -> service.deleteAccount(user, null));
        assertFalse(userStore.deleted);
    }

    @Test
    void deleteAccountRemovesUserAndAssociatedDataWhenConfirmed() throws Exception {
        AccountUser user = newUser("player@example.com");
        FakeAccountUserStore userStore = new FakeAccountUserStore(user);
        FakeAuthSessionStore sessionStore = new FakeAuthSessionStore();
        AccountService service = createDeletionService(userStore);
        setField(service, "sessionStore", sessionStore);

        service.deleteAccount(user, "  DELETE  ");

        assertTrue(userStore.deleted);
        assertEquals("player@example.com", userStore.deletedId);
        assertTrue(sessionStore.deletedByUserId);
    }

    private AccountUser newUser(String email) {
        AccountUser user = new AccountUser();
        user.setId(email);
        user.setEmail(email);
        user.setDisplayName("Player");
        user.setPasswordHash(new BCryptPasswordEncoder().encode("oldpass1"));
        user.setCreatedAt(Instant.now());
        return user;
    }

    private AccountService createDeletionService(AccountUserStore userStore) throws Exception {
        AccountService service = new AccountService();
        setField(service, "userStore", userStore);
        setField(service, "sessionStore", new FakeAuthSessionStore());
        setField(service, "savedDeckStore", new SavedDeckStore() {
            @Override public void deleteByUserId(String userId) { }
        });
        setField(service, "matchHistoryStore", new MatchHistoryStore() {
            @Override public void deleteByUserId(String userId) { }
        });
        setField(service, "playerProgressionStore", new PlayerProgressionStore() {
            @Override public void deleteByUserId(String userId) { }
        });
        setField(service, "profileSettingsStore", new ProfileSettingsStore() {
            @Override public void deleteByUserId(String userId) { }
        });
        setField(service, "userPresenceStore", new UserPresenceStore() {
            @Override public void deleteByUserId(String userId) { }
        });
        setField(service, "dailyMissionProgressStore", new DailyMissionProgressStore() {
            @Override public void deleteByUserId(String userId) { }
        });
        setField(service, "friendRequestStore", new FriendRequestStore() {
            @Override public void deleteByUserId(String userId) { }
        });
        setField(service, "directMessageStore", new DirectMessageStore() {
            @Override public void deleteByUserId(String userId) { }
        });
        return service;
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
        private boolean deleted;
        private String deletedId;

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

        @Override
        public void deleteById(String id) {
            deleted = true;
            deletedId = id;
        }
    }

    private static class FakeAuthSessionStore extends AuthSessionStore {
        private boolean saved;
        private boolean deletedByUserId;

        @Override
        public AuthSession save(AuthSession session) {
            saved = true;
            return session;
        }

        @Override
        public void deleteByUserId(String userId) {
            deletedByUserId = true;
        }
    }
}
