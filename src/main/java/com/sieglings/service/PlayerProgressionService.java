package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PlayerProgressionService {
    public static final int STARTING_GOLD = 100;
    public static final int CUSTOM_DECK_UNLOCK_COPIES = 30;
    public static final int WIN_GOLD = 75;
    public static final int COMPLETED_MATCH_GOLD = 30;

    @Autowired
    private PlayerProgressionStore store;

    @Autowired
    private PackCatalogService packCatalogService;

    @Autowired
    private CardDefinitionService cardDefinitionService;

    public PlayerProgressionEntity getOrCreate(AccountUser user) {
        PlayerProgressionEntity progression = store.findByUserId(user.getId()).orElseGet(() -> {
            PlayerProgressionEntity created = new PlayerProgressionEntity();
            created.setUserId(user.getId());
            created.setGold(STARTING_GOLD);
            return created;
        });
        return store.save(progression);
    }

    public PlayerProgressionEntity chooseStarterPack(AccountUser user, String packId) {
        PlayerProgressionEntity progression = getOrCreate(user);
        if (progression.getStarterPackId() != null && !progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Starter pack has already been chosen.");
        }
        PackCatalogService.PackOpenResult result = packCatalogService.openPack(packId, true);
        grantCards(progression, result.cards());
        progression.setStarterPackId(result.pack().id());
        addPackHistory(progression, result, 0, "STARTER");
        progression.setUpdatedAt(Instant.now());
        return store.save(progression);
    }

    public PlayerProgressionEntity openPack(AccountUser user, String packId) {
        PlayerProgressionEntity progression = getOrCreate(user);
        if (progression.getStarterPackId() == null || progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Choose a starter pack before buying more packs.");
        }
        PackCatalogService.PackOpenResult result = packCatalogService.openPack(packId, false);
        if (progression.getGold() < result.pack().price()) {
            throw new IllegalArgumentException("Not enough Coins for that pack.");
        }
        progression.setGold(progression.getGold() - result.pack().price());
        grantCards(progression, result.cards());
        addPackHistory(progression, result, result.pack().price(), "SHOP");
        progression.setUpdatedAt(Instant.now());
        return store.save(progression);
    }

    public PlayerProgressionEntity purchaseDeck(AccountUser user, String deckId) {
        PlayerProgressionEntity progression = getOrCreate(user);
        CardDefinitionService.DeckOption deck = cardDefinitionService.getDeckOption(deckId)
                .orElseThrow(() -> new IllegalArgumentException("Deck not found."));
        int price = deck.elements().size() <= 1 ? 300 : deck.elements().size() >= 4 ? 700 : 450;
        if (progression.getPurchasedDeckIds().contains(deck.id())) {
            return progression;
        }
        if (progression.getGold() < price) {
            throw new IllegalArgumentException("Not enough Coins for that premade deck.");
        }
        progression.setGold(progression.getGold() - price);
        List<String> purchased = new ArrayList<>(progression.getPurchasedDeckIds());
        purchased.add(deck.id());
        progression.setPurchasedDeckIds(purchased);
        progression.setUpdatedAt(Instant.now());
        return store.save(progression);
    }

    public void awardMatchGold(MatchHistoryEntity history) {
        if (history == null || history.getUserId() == null || history.getId() == null) {
            return;
        }
        PlayerProgressionEntity progression = store.findByUserId(history.getUserId()).orElseGet(() -> {
            PlayerProgressionEntity created = new PlayerProgressionEntity();
            created.setUserId(history.getUserId());
            created.setGold(STARTING_GOLD);
            return created;
        });
        if (progression.getRewardedMatchIds().contains(history.getId())) {
            return;
        }
        int reward = "WIN".equalsIgnoreCase(history.getResult()) ? WIN_GOLD : COMPLETED_MATCH_GOLD;
        progression.setGold(progression.getGold() + reward);
        List<String> rewarded = new ArrayList<>(progression.getRewardedMatchIds());
        rewarded.add(history.getId());
        progression.setRewardedMatchIds(rewarded);
        progression.setUpdatedAt(Instant.now());
        store.save(progression);
    }

    public void validateCustomDeckOwnership(AccountUser user, List<String> customDeckCards) {
        if (customDeckCards == null || customDeckCards.isEmpty()) {
            return;
        }
        PlayerProgressionEntity progression = getOrCreate(user);
        if (ownedTotal(progression) < CUSTOM_DECK_UNLOCK_COPIES) {
            throw new IllegalArgumentException("Own 30 total card copies to build custom decks.");
        }
        Map<String, Integer> requested = new LinkedHashMap<>();
        for (String cardId : customDeckCards) {
            requested.merge(cardId, 1, Integer::sum);
        }
        for (Map.Entry<String, Integer> entry : requested.entrySet()) {
            if (entry.getValue() > cardDefinitionService.getDeckBuilderMaxCopies()) {
                throw new IllegalArgumentException("You can only use up to 3 copies of one card in a custom deck.");
            }
            int owned = progression.getOwnedCards().getOrDefault(entry.getKey(), 0);
            if (entry.getValue() > owned) {
                throw new IllegalArgumentException("You do not own enough copies of " + entry.getKey() + ".");
            }
        }
    }

    public Map<String, Object> serialize(PlayerProgressionEntity progression) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("gold", progression.getGold());
        out.put("ownedCards", progression.getOwnedCards());
        out.put("ownedTotal", ownedTotal(progression));
        out.put("customDeckUnlocked", ownedTotal(progression) >= CUSTOM_DECK_UNLOCK_COPIES);
        out.put("customDeckUnlockCopies", CUSTOM_DECK_UNLOCK_COPIES);
        out.put("starterPackId", progression.getStarterPackId());
        out.put("starterChosen", progression.getStarterPackId() != null && !progression.getStarterPackId().isBlank());
        out.put("purchasedDeckIds", progression.getPurchasedDeckIds());
        out.put("packHistory", progression.getPackHistory().stream().limit(12).toList());
        return out;
    }

    private int ownedTotal(PlayerProgressionEntity progression) {
        return progression.getOwnedCards().values().stream().mapToInt(Integer::intValue).sum();
    }

    private void grantCards(PlayerProgressionEntity progression, List<Card> cards) {
        Map<String, Integer> owned = new LinkedHashMap<>(progression.getOwnedCards());
        for (Card card : cards) {
            owned.merge(card.getId(), 1, Integer::sum);
        }
        progression.setOwnedCards(owned);
    }

    private void addPackHistory(PlayerProgressionEntity progression, PackCatalogService.PackOpenResult result, int price, String source) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("packId", result.pack().id());
        entry.put("packName", result.pack().name());
        entry.put("source", source);
        entry.put("price", price);
        entry.put("openedAt", Instant.now().toString());
        entry.put("cards", result.cards().stream().map(card -> Map.of(
                "id", card.getId(),
                "name", card.getName(),
                "type", card.getCardType().name(),
                "element", card.getElement().name(),
                "rarity", card.getRarity().name()
        )).toList());
        List<Map<String, Object>> history = new ArrayList<>();
        history.add(entry);
        history.addAll(progression.getPackHistory());
        progression.setPackHistory(history.stream().limit(20).toList());
    }
}
