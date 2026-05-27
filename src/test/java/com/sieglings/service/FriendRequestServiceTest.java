package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.FriendRequestEntity;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.FriendRequestStore;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FriendRequestServiceTest {

    @Test
    void sendRequestCreatesPendingInvite() throws Exception {
        AccountUser alice = user("alice@example.com", "Alice");
        AccountUser bob = user("bob@example.com", "Bob");
        InMemoryUserStore userStore = new InMemoryUserStore(alice, bob);
        InMemoryRequestStore requestStore = new InMemoryRequestStore();
        FriendRequestService service = createService(requestStore, userStore);

        service.sendRequest(alice, "bob@example.com");

        assertEquals(1, requestStore.all.size());
        assertTrue(requestStore.findPending(alice.getId(), bob.getId()).isPresent());
    }

    @Test
    void acceptRequestLinksBothPlayers() throws Exception {
        AccountUser alice = user("alice@example.com", "Alice");
        AccountUser bob = user("bob@example.com", "Bob");
        InMemoryUserStore userStore = new InMemoryUserStore(alice, bob);
        InMemoryRequestStore requestStore = new InMemoryRequestStore();
        FriendRequestService service = createService(requestStore, userStore);

        service.sendRequest(alice, "bob@example.com");
        AccountUser updatedBob = service.acceptRequest(bob, alice.getId());

        assertTrue(FriendRequestService.areMutualFriends(updatedBob, userStore.findById(alice.getId()).orElseThrow()));
        assertTrue(requestStore.all.isEmpty());
    }

    @Test
    void sendRequestRejectsWhenIncomingRequestExists() throws Exception {
        AccountUser alice = user("alice@example.com", "Alice");
        AccountUser bob = user("bob@example.com", "Bob");
        InMemoryUserStore userStore = new InMemoryUserStore(alice, bob);
        InMemoryRequestStore requestStore = new InMemoryRequestStore();
        FriendRequestService service = createService(requestStore, userStore);

        service.sendRequest(alice, "bob@example.com");

        assertThrows(IllegalArgumentException.class, () -> service.sendRequest(bob, "alice@example.com"));
    }

    private FriendRequestService createService(FriendRequestStore requestStore, AccountUserStore userStore) throws Exception {
        FriendRequestService service = new FriendRequestService();
        setField(service, "requestStore", requestStore);
        setField(service, "userStore", userStore);
        return service;
    }

    private AccountUser user(String email, String displayName) {
        AccountUser user = new AccountUser();
        user.setId(email);
        user.setEmail(email);
        user.setDisplayName(displayName);
        user.setCreatedAt(Instant.now());
        return user;
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static class InMemoryUserStore extends AccountUserStore {
        private final Map<String, AccountUser> users = new LinkedHashMap<>();

        InMemoryUserStore(AccountUser... seeded) {
            for (AccountUser user : seeded) {
                users.put(user.getId(), user);
            }
        }

        @Override
        public Optional<AccountUser> findById(String id) {
            return Optional.ofNullable(users.get(id));
        }

        @Override
        public AccountUser save(AccountUser user) {
            users.put(user.getId(), user);
            return user;
        }
    }

    private static class InMemoryRequestStore extends FriendRequestStore {
        private final List<FriendRequestEntity> all = new ArrayList<>();

        @Override
        public Optional<FriendRequestEntity> findById(String id) {
            return all.stream().filter(request -> request.getId().equals(id)).findFirst();
        }

        @Override
        public Optional<FriendRequestEntity> findPending(String fromUserId, String toUserId) {
            return findById(FriendRequestEntity.buildId(fromUserId, toUserId));
        }

        @Override
        public FriendRequestEntity save(FriendRequestEntity request) {
            all.removeIf(existing -> existing.getId().equals(request.getId()));
            if (request.getId() == null || request.getId().isBlank()) {
                request.setId(FriendRequestEntity.buildId(request.getFromUserId(), request.getToUserId()));
            }
            all.add(request);
            return request;
        }

        @Override
        public void deleteById(String id) {
            all.removeIf(request -> request.getId().equals(id));
        }

        @Override
        public List<FriendRequestEntity> listIncoming(String toUserId) {
            return all.stream().filter(request -> toUserId.equals(request.getToUserId())).toList();
        }

        @Override
        public List<FriendRequestEntity> listOutgoing(String fromUserId) {
            return all.stream().filter(request -> fromUserId.equals(request.getFromUserId())).toList();
        }
    }
}
