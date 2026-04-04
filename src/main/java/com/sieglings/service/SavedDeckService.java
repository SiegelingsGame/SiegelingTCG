package com.sieglings.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.SavedDeckEntity;
import com.sieglings.persistence.repo.SavedDeckRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Service
public class SavedDeckService {

    @Autowired
    private SavedDeckRepository savedDeckRepository;

    @Autowired
    private CardDefinitionService cardDefinitionService;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public List<SavedDeckEntity> listDecks(AccountUser user) {
        return savedDeckRepository.findByUser_IdOrderByUpdatedAtDesc(user.getId());
    }

    @Transactional
    public SavedDeckEntity saveDeck(AccountUser user, String deckId, String trainerId,
                                    List<String> customDeckCards, String name, String existingId) {
        String normalizedName = normalizeName(name);
        validateLoadout(deckId, trainerId, customDeckCards);

        SavedDeckEntity deck = existingId == null || existingId.isBlank()
                ? new SavedDeckEntity()
                : savedDeckRepository.findByIdAndUser_Id(existingId, user.getId())
                        .orElseThrow(() -> new IllegalArgumentException("Saved deck not found."));

        if (deck.getId() == null) {
            deck.setId(UUID.randomUUID().toString());
            deck.setCreatedAt(Instant.now());
        }

        deck.setUser(user);
        deck.setName(normalizedName);
        deck.setPresetDeckId(customDeckCards == null || customDeckCards.isEmpty() ? deckId : null);
        deck.setTrainerId(trainerId);
        deck.setCustomDeckCardsJson(serializeCards(customDeckCards));
        deck.setUpdatedAt(Instant.now());
        return savedDeckRepository.save(deck);
    }

    @Transactional
    public void deleteDeck(AccountUser user, String deckId) {
        SavedDeckEntity deck = savedDeckRepository.findByIdAndUser_Id(deckId, user.getId())
                .orElseThrow(() -> new IllegalArgumentException("Saved deck not found."));
        savedDeckRepository.delete(deck);
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

    private void validateLoadout(String deckId, String trainerId, List<String> customDeckCards) {
        if (trainerId == null || trainerId.isBlank()) {
            throw new IllegalArgumentException("Choose a SiegeKnight before saving.");
        }
        if (!cardDefinitionService.hasTrainer(trainerId)) {
            throw new IllegalArgumentException("Unknown SiegeKnight selection.");
        }
        if (!cardDefinitionService.isTrainerActive(trainerId)) {
            throw new IllegalArgumentException("Choose an active SiegeKnight before saving.");
        }

        if (customDeckCards != null && !customDeckCards.isEmpty()) {
            cardDefinitionService.buildCustomDeck(customDeckCards);
            return;
        }

        if (deckId == null || deckId.isBlank()) {
            throw new IllegalArgumentException("Choose a preset deck or build a custom list before saving.");
        }
        cardDefinitionService.getDeckOption(deckId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown deck selection."));
    }

    private String normalizeName(String name) {
        String normalized = name == null ? "" : name.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("Give this saved deck a name.");
        }
        if (normalized.length() > 40) {
            throw new IllegalArgumentException("Saved deck names must be 40 characters or fewer.");
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
