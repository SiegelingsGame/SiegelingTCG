package com.sieglings.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.SavedDeckEntity;
import com.sieglings.persistence.firestore.SavedDeckStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class SavedDeckService {

    private static final Pattern CLIENT_DECK_ID = Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

    @Autowired
    private SavedDeckStore savedDeckStore;

    @Autowired
    private CardDefinitionService cardDefinitionService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PlayerProgressionService playerProgressionService;

    public List<SavedDeckEntity> listDecks(AccountUser user) {
        return savedDeckStore.findByUserOrderByUpdatedAtDesc(user.getId());
    }

    public SavedDeckEntity saveDeck(AccountUser user, String deckId, String trainerId,
                                    List<String> customDeckCards, String name, String existingId) {
        return saveDeck(user, deckId, trainerId, customDeckCards, name, existingId, null);
    }

    /**
     * clientDeckId makes creating a deck idempotent. A save that reached Firestore
     * but whose response never reached the phone used to be retried as a brand new
     * deck, which is how a binder fills with identical copies. The builder mints one
     * id per deck it is composing and the retry lands on that same document.
     */
    public SavedDeckEntity saveDeck(AccountUser user, String deckId, String trainerId,
                                    List<String> customDeckCards, String name, String existingId,
                                    String clientDeckId) {
        String normalizedName = normalizeName(name);
        validateLoadout(user, deckId, trainerId, customDeckCards);
        playerProgressionService.validateCustomDeckOwnership(user, customDeckCards);

        SavedDeckEntity deck = existingId == null || existingId.isBlank()
                ? newOrRetriedDeck(user, clientDeckId)
                : savedDeckStore.findByIdAndUser(existingId, user.getId())
                        .orElseThrow(() -> new IllegalArgumentException("Saved deck not found."));

        if (deck.getId() == null) {
            deck.setId(usableClientDeckId(clientDeckId) ? clientDeckId : UUID.randomUUID().toString());
            deck.setCreatedAt(Instant.now());
        }

        deck.setUserId(user.getId());
        deck.setName(normalizedName);
        deck.setPresetDeckId(customDeckCards == null || customDeckCards.isEmpty() ? deckId : null);
        deck.setTrainerId(trainerId);
        deck.setCustomDeckCardsJson(serializeCards(customDeckCards));
        deck.setUpdatedAt(Instant.now());
        return savedDeckStore.save(deck);
    }

    // Idempotent: a deck that is already gone is the state the caller asked for.
    // Reporting that as an error stranded ghost tiles in the binder — the client
    // restored a row it could never delete, and every retry failed the same way.
    // Returns true when this call removed a deck, false when there was none.
    public boolean deleteDeck(AccountUser user, String deckId) {
        Optional<SavedDeckEntity> deck = savedDeckStore.findByIdAndUser(deckId, user.getId());
        if (deck.isEmpty()) {
            return false;
        }
        savedDeckStore.delete(deck.get());
        return true;
    }

    /**
     * Deletes every named deck the player owns and reports how many were actually
     * removed. Unknown ids are skipped rather than failing the batch, so one stale
     * row in the binder cannot block the rest of a "delete all" from going through.
     */
    public int deleteDecks(AccountUser user, List<String> deckIds) {
        if (deckIds == null || deckIds.isEmpty()) {
            return 0;
        }
        int removed = 0;
        for (String deckId : deckIds) {
            if (deleteDeck(user, deckId)) {
                removed++;
            }
        }
        return removed;
    }

    // A create carrying a client id that already names one of this player's decks is
    // a retry of that same create, so it updates in place instead of duplicating.
    // An id that names somebody else's deck is refused outright rather than
    // overwriting it, and an unusable id simply falls back to a server-minted one.
    private SavedDeckEntity newOrRetriedDeck(AccountUser user, String clientDeckId) {
        if (!usableClientDeckId(clientDeckId)) {
            return new SavedDeckEntity();
        }
        Optional<SavedDeckEntity> mine = savedDeckStore.findByIdAndUser(clientDeckId, user.getId());
        if (mine.isPresent()) {
            return mine.get();
        }
        // The id is free only when no document holds it. One that belongs to another
        // account must never be written through, whatever the client claims.
        if (savedDeckStore.findOwnerId(clientDeckId).isPresent()) {
            throw new IllegalArgumentException("That deck id is already taken.");
        }
        return new SavedDeckEntity();
    }

    private boolean usableClientDeckId(String clientDeckId) {
        if (clientDeckId == null) {
            return false;
        }
        // Only accept the shape the builder mints, so a client id can never be a
        // path fragment or collide with an unrelated document naming scheme.
        return CLIENT_DECK_ID.matcher(clientDeckId).matches();
    }

    public List<String> readCustomDeckCards(SavedDeckEntity deck) {
        if (deck.getCustomDeckCardsJson() == null || deck.getCustomDeckCardsJson().isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(deck.getCustomDeckCardsJson(), new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private void validateLoadout(AccountUser user, String deckId, String trainerId, List<String> customDeckCards) {
        if (trainerId == null || trainerId.isBlank()) {
            throw new DeckValidationException("trainer", "Choose a SiegeKnight before saving.");
        }
        if (!cardDefinitionService.hasTrainer(trainerId)) {
            throw new DeckValidationException("trainer", "Unknown SiegeKnight selection.");
        }
        if (!cardDefinitionService.isTrainerActive(trainerId)) {
            throw new DeckValidationException("trainer", "Choose an active SiegeKnight before saving.");
        }
        if (!playerProgressionService.ownsTrainer(user, trainerId)) {
            throw new DeckValidationException("trainer", "You haven't unlocked that SiegeKnight yet. Pull it from a pack first.");
        }

        if (customDeckCards != null && !customDeckCards.isEmpty()) {
            cardDefinitionService.buildCustomDeck(customDeckCards);
            return;
        }

        if (deckId == null || deckId.isBlank()) {
            throw new DeckValidationException("cards", "Choose a preset deck or build a custom list before saving.");
        }
        cardDefinitionService.getDeckOption(deckId)
                .orElseThrow(() -> new DeckValidationException("cards", "Unknown deck selection."));
    }

    private String normalizeName(String name) {
        String normalized = name == null ? "" : name.trim();
        if (normalized.isBlank()) {
            throw new DeckValidationException("name", "Give this saved deck a name.");
        }
        if (normalized.length() > 40) {
            throw new DeckValidationException("name", "Saved deck names must be 40 characters or fewer.");
        }
        return normalized;
    }

    private String serializeCards(List<String> customDeckCards) {
        List<String> safeCards = customDeckCards == null ? Collections.emptyList() : customDeckCards;
        try {
            return objectMapper.writeValueAsString(safeCards);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Unable to save this deck right now.");
        }
    }
}
