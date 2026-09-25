package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import com.sieglings.persistence.firestore.MatchReviewStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** A review is visible to exactly the viewers who can see the match on the profile. */
class MatchReviewServiceTest {

    private final AccountUser owner = user("owner@example.com", List.of("friend@example.com"));
    private final AccountUser friend = user("friend@example.com", List.of("owner@example.com"));
    private final AccountUser stranger = user("stranger@example.com", List.of());
    private MatchReviewService service;

    @BeforeEach
    void setUp() throws Exception {
        MatchHistoryEntity match = new MatchHistoryEntity();
        match.setId("m1-player");
        match.setUserId(owner.getId());
        match.setResult("WIN");
        match.setHasReplay(true);
        MatchHistoryEntity legacy = new MatchHistoryEntity();
        legacy.setId("old-player");
        legacy.setUserId(owner.getId());
        legacy.setResult("LOSS");

        service = new MatchReviewService();
        set(service, "matchHistoryStore", new MatchHistoryStore() {
            @Override
            public Optional<MatchHistoryEntity> findById(String id) {
                return "m1-player".equals(id) ? Optional.of(match)
                        : "old-player".equals(id) ? Optional.of(legacy) : Optional.empty();
            }
        });
        set(service, "matchReviewStore", new MatchReviewStore() {
            @Override
            public Optional<Map<String, Object>> findReplay(String historyId) {
                return Optional.of(Map.of("id", historyId, "userId", owner.getId(), "frames", List.of()));
            }

            @Override
            public Optional<Map<String, Object>> findSiegeRun(String runId) {
                return "siege-1".equals(runId)
                        ? Optional.of(Map.of("id", runId, "userId", owner.getId(), "result", "LOSS"))
                        : Optional.empty();
            }
        });
        set(service, "accountService", new AccountService() {
            @Override
            public AccountUser findById(String id) {
                return owner.getId().equals(id) ? owner : null;
            }
        });
    }

    @Test
    void ownerAndMutualFriendCanOpenAReplay() {
        Map<String, Object> mine = service.review(owner, "m1-player");
        assertEquals("BATTLE", mine.get("kind"));
        @SuppressWarnings("unchecked")
        Map<String, Object> replay = (Map<String, Object>) mine.get("replay");
        assertFalse(replay.containsKey("userId"), "the owner's account email is not sent to viewers");

        assertEquals("BATTLE", service.review(friend, "m1-player").get("kind"));
    }

    @Test
    void strangersAndSignedOutViewersGetNotFound() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.review(stranger, "m1-player"));
        assertEquals(MatchReviewService.NOT_FOUND, ex.getMessage(), "no different answer that would confirm the id exists");
        assertThrows(IllegalArgumentException.class, () -> service.review(null, "m1-player"));
        assertThrows(IllegalArgumentException.class, () -> service.review(owner, "missing"));
    }

    @Test
    void matchesRecordedBeforeReplaysServeTheLogOnly() {
        Map<String, Object> review = service.review(owner, "old-player");
        assertNull(review.get("replay"));
    }

    @Test
    void siegeIdsResolveToTheRunUnderTheSameRule() {
        assertEquals("SIEGE", service.review(friend, "siege-1").get("kind"));
        assertThrows(IllegalArgumentException.class, () -> service.review(stranger, "siege-1"));
    }

    private static AccountUser user(String id, List<String> friends) {
        AccountUser user = new AccountUser();
        user.setId(id);
        user.setEmail(id);
        user.setFriendEmails(friends);
        return user;
    }

    private static void set(Object target, String name, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }
}
