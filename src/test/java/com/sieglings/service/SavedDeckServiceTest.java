package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.SavedDeckEntity;
import com.sieglings.persistence.firestore.SavedDeckStore;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards the two faults behind a binder that fills with identical decks and then
 * refuses to delete some of them: a create retried after a lost response used to
 * bank a second copy, and deleting a deck that was already gone was reported as
 * an error, which stranded a tile the player could never remove.
 */
class SavedDeckServiceTest {

    private static final String CLIENT_ID = "11111111-2222-4333-8444-555555555555";

    @Test
    void retryingACreateWithTheSameClientIdUpdatesInsteadOfDuplicating() throws Exception {
        FakeStore store = new FakeStore();
        SavedDeckService service = createService(store);
        AccountUser user = user("player@example.com");

        SavedDeckEntity first = service.saveDeck(user, null, "pyla", cards(), "Mini Flame", null, CLIENT_ID);
        SavedDeckEntity retry = service.saveDeck(user, null, "pyla", cards(), "Mini Flame", null, CLIENT_ID);

        assertEquals(CLIENT_ID, first.getId(), "the builder's own id should name the document");
        assertEquals(first.getId(), retry.getId());
        assertEquals(1, store.docs.size(), "a retried create must not bank a second copy");
    }

    @Test
    void createsWithoutAClientIdStillGetDistinctDecks() throws Exception {
        FakeStore store = new FakeStore();
        SavedDeckService service = createService(store);
        AccountUser user = user("player@example.com");

        SavedDeckEntity first = service.saveDeck(user, null, "pyla", cards(), "Mini Flame", null, null);
        SavedDeckEntity second = service.saveDeck(user, null, "pyla", cards(), "Mini Flame", null, null);

        assertNotEquals(first.getId(), second.getId());
        assertEquals(2, store.docs.size());
    }

    @Test
    void aClientIdNamingAnotherPlayersDeckIsRefused() throws Exception {
        FakeStore store = new FakeStore();
        SavedDeckService service = createService(store);
        service.saveDeck(user("owner@example.com"), null, "pyla", cards(), "Theirs", null, CLIENT_ID);

        AccountUser attacker = user("attacker@example.com");
        assertThrows(IllegalArgumentException.class,
                () -> service.saveDeck(attacker, null, "pyla", cards(), "Mine", null, CLIENT_ID));
        assertEquals("owner@example.com", store.docs.get(CLIENT_ID).getUserId(),
                "the original owner's deck must be untouched");
    }

    @Test
    void aMalformedClientIdFallsBackToAServerMintedId() throws Exception {
        FakeStore store = new FakeStore();
        SavedDeckService service = createService(store);

        SavedDeckEntity deck = service.saveDeck(user("player@example.com"), null, "pyla", cards(),
                "Mini Flame", null, "../appConfig/cardOverrides");

        assertNotEquals("../appConfig/cardOverrides", deck.getId());
        assertEquals(1, store.docs.size());
        assertTrue(store.docs.containsKey(deck.getId()));
    }

    @Test
    void deletingADeckThatIsAlreadyGoneReportsNoDeletionRatherThanFailing() throws Exception {
        FakeStore store = new FakeStore();
        SavedDeckService service = createService(store);
        AccountUser user = user("player@example.com");
        SavedDeckEntity deck = service.saveDeck(user, null, "pyla", cards(), "Mini Flame", null, CLIENT_ID);

        assertTrue(service.deleteDeck(user, deck.getId()), "the first delete removes the deck");
        assertFalse(service.deleteDeck(user, deck.getId()), "deleting it again is a no-op, not an error");
        assertFalse(service.deleteDeck(user, "never-existed"));
        assertTrue(store.docs.isEmpty());
    }

    @Test
    void deletingAnotherPlayersDeckRemovesNothing() throws Exception {
        FakeStore store = new FakeStore();
        SavedDeckService service = createService(store);
        service.saveDeck(user("owner@example.com"), null, "pyla", cards(), "Theirs", null, CLIENT_ID);

        assertFalse(service.deleteDeck(user("attacker@example.com"), CLIENT_ID));
        assertEquals(1, store.docs.size());
    }

    @Test
    void deletingABatchRemovesEveryDeckAndSkipsTheStaleIds() throws Exception {
        FakeStore store = new FakeStore();
        SavedDeckService service = createService(store);
        AccountUser user = user("player@example.com");
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            ids.add(service.saveDeck(user, null, "pyla", cards(), "Copy " + i, null, null).getId());
        }
        ids.add("already-deleted");

        assertEquals(5, service.deleteDecks(user, ids), "only the decks that existed count as removed");
        assertTrue(store.docs.isEmpty(), "one stale id must not block the rest of the batch");
    }

    @Test
    void aBatchOnlyRemovesTheCallersOwnDecks() throws Exception {
        FakeStore store = new FakeStore();
        SavedDeckService service = createService(store);
        AccountUser mine = user("player@example.com");
        String ownDeck = service.saveDeck(mine, null, "pyla", cards(), "Mine", null, null).getId();
        service.saveDeck(user("owner@example.com"), null, "pyla", cards(), "Theirs", null, CLIENT_ID);

        assertEquals(1, service.deleteDecks(mine, List.of(ownDeck, CLIENT_ID)));
        assertEquals(1, store.docs.size());
        assertEquals("owner@example.com", store.docs.get(CLIENT_ID).getUserId());
    }

    private SavedDeckService createService(FakeStore store) throws Exception {
        SavedDeckService service = new SavedDeckService();
        setField(service, "savedDeckStore", store);
        setField(service, "objectMapper", new ObjectMapper());
        setField(service, "cardDefinitionService", new PermissiveCardDefinitions());
        setField(service, "playerProgressionService", new PermissiveProgression());
        return service;
    }

    private List<String> cards() {
        List<String> cards = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            cards.add("fire-ember");
        }
        return cards;
    }

    private AccountUser user(String id) {
        AccountUser user = new AccountUser();
        user.setId(id);
        user.setEmail(id);
        user.setDisplayName(id);
        return user;
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }

    /** In-memory stand-in keyed by document id, the way Firestore stores these. */
    private static class FakeStore extends SavedDeckStore {
        private final Map<String, SavedDeckEntity> docs = new LinkedHashMap<>();

        @Override
        public Optional<SavedDeckEntity> findByIdAndUser(String id, String userId) {
            SavedDeckEntity deck = id == null ? null : docs.get(id);
            if (deck == null || !deck.getUserId().equals(userId)) {
                return Optional.empty();
            }
            return Optional.of(deck);
        }

        @Override
        public Optional<String> findOwnerId(String id) {
            SavedDeckEntity deck = id == null ? null : docs.get(id);
            return deck == null ? Optional.empty() : Optional.ofNullable(deck.getUserId());
        }

        @Override
        public SavedDeckEntity save(SavedDeckEntity deck) {
            docs.put(deck.getId(), deck);
            return deck;
        }

        @Override
        public void delete(SavedDeckEntity deck) {
            docs.remove(deck.getId());
        }
    }

    private static class PermissiveCardDefinitions extends CardDefinitionService {
        @Override
        public boolean hasTrainer(String trainerId) {
            return true;
        }

        @Override
        public boolean isTrainerActive(String trainerId) {
            return true;
        }

        @Override
        public List<com.sieglings.model.Card> buildCustomDeck(List<String> cardIds) {
            return List.of();
        }
    }

    private static class PermissiveProgression extends PlayerProgressionService {
        @Override
        public void validateCustomDeckOwnership(AccountUser user, List<String> cardIds) {
        }

        @Override
        public boolean ownsTrainer(AccountUser user, String trainerId) {
            return true;
        }
    }
}
