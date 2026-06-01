package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
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
    public static final int SOLO_WIN_GOLD = 10;
    public static final int ONLINE_WIN_GOLD = 5;
    public static final int WIN_STREAK_GOLD = 2;
    public static final int PACK_OPEN_REMNANTS = 40;
    public static final int SOLO_WIN_REMNANTS = 20;
    public static final int ONLINE_WIN_REMNANTS = 30;

    // SiegeKnight leveling / combining (tunable balance knobs).
    public static final int TRAINER_MAX_LEVEL = 5;
    public static final int TRAINER_DUP_POINTS = 1;

    public record CardGrantOutcome(Card card, boolean grantedCopy, int remnantsAwarded, int ownedAfter) {}

    public record TrainerGrantOutcome(String trainerId, String trainerName, String element, String rarity, String tier,
                                      boolean newlyOwned, boolean leveledUp, int level, int points, int pointsForNext) {}

    @Autowired
    private PlayerProgressionStore store;

    @Autowired
    private PackCatalogService packCatalogService;

    @Autowired
    private CardDefinitionService cardDefinitionService;

    @Autowired(required = false)
    private DailyMissionService dailyMissionService;

    public PlayerProgressionEntity getOrCreate(AccountUser user) {
        PlayerProgressionEntity progression = store.findByUserId(user.getId()).orElseGet(() -> {
            PlayerProgressionEntity created = new PlayerProgressionEntity();
            created.setUserId(user.getId());
            created.setGold(STARTING_GOLD);
            return store.save(created);
        });
        if (ensureStarterTrainer(progression)) {
            progression.setUpdatedAt(Instant.now());
            store.save(progression);
        }
        return progression;
    }

    /**
     * Existing players who chose a starter before SiegeKnights were earnable should still
     * own the knight matching their starting element. Returns true if a grant was applied.
     */
    private boolean ensureStarterTrainer(PlayerProgressionEntity progression) {
        if (progression.getStarterPackId() == null || progression.getStarterPackId().isBlank()) {
            return false;
        }
        if (!progression.getTrainerLevels().isEmpty()) {
            return false;
        }
        TrainerCard starterTrainer = starterTrainerForPack(progression.getStarterPackId());
        if (starterTrainer == null) {
            return false;
        }
        grantTrainer(progression, starterTrainer);
        return true;
    }

    private TrainerCard starterTrainerForPack(String packId) {
        Element element = starterElementForPack(packId);
        return element == null ? null : cardDefinitionService.getTrainer(element);
    }

    /** Starter packs are named {@code pack_<element>}; derive the element directly from the id. */
    private Element starterElementForPack(String packId) {
        String prefix = "pack_";
        if (packId == null || !packId.startsWith(prefix)) {
            return null;
        }
        String name = packId.substring(prefix.length()).trim().toUpperCase(java.util.Locale.ROOT);
        try {
            return Element.valueOf(name);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    public PlayerProgressionEntity chooseStarterPack(AccountUser user, String packId) {
        PlayerProgressionEntity progression = getOrCreate(user);
        if (progression.getStarterPackId() != null && !progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Starter pack has already been chosen.");
        }
        PackCatalogService.PackOpenResult result = packCatalogService.openPack(packId, true);
        List<CardGrantOutcome> outcomes = grantCardsWithCap(progression, result.cards());
        grantRemnants(progression, PACK_OPEN_REMNANTS);
        progression.setStarterPackId(result.pack().id());
        // Grant the SiegeKnight matching the player's starting element for free.
        TrainerGrantOutcome trainerOutcome = null;
        TrainerCard starterTrainer = starterTrainerForPack(result.pack().id());
        if (starterTrainer != null) {
            progression.setTrainerLevels(new LinkedHashMap<>());
            progression.setTrainerPoints(new LinkedHashMap<>());
            trainerOutcome = grantTrainer(progression, starterTrainer);
        }
        addPackHistory(progression, result, outcomes, trainerOutcome, 0, "STARTER");
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
            throw new IllegalArgumentException("Not enough Siegecoins for that pack.");
        }
        progression.setGold(progression.getGold() - result.pack().price());
        List<CardGrantOutcome> outcomes = grantCardsWithCap(progression, result.cards());
        grantRemnants(progression, PACK_OPEN_REMNANTS);
        TrainerGrantOutcome trainerOutcome = result.bonusTrainer() == null
                ? null
                : grantTrainer(progression, result.bonusTrainer());
        addPackHistory(progression, result, outcomes, trainerOutcome, result.pack().price(), "SHOP");
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
            throw new IllegalArgumentException("Not enough Siegecoins for that premade deck.");
        }
        progression.setGold(progression.getGold() - price);
        List<String> purchased = new ArrayList<>(progression.getPurchasedDeckIds());
        purchased.add(deck.id());
        progression.setPurchasedDeckIds(purchased);
        progression.setUpdatedAt(Instant.now());
        return store.save(progression);
    }

    public PlayerProgressionEntity purchaseDailyOffer(AccountUser user, String offerId) {
        PlayerProgressionEntity progression = getOrCreate(user);
        if (progression.getStarterPackId() == null || progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Choose a starter pack before buying daily cards.");
        }
        PackCatalogService.DailyCardOffer offer = packCatalogService.findDailyOffer(offerId)
                .orElseThrow(() -> new IllegalArgumentException("Daily card offer not found."));
        if (progression.getPurchasedDailyOfferIds().contains(offer.id())) {
            return progression;
        }
        if (progression.getGold() < offer.price()) {
            throw new IllegalArgumentException("Not enough Siegecoins for that daily card.");
        }
        progression.setGold(progression.getGold() - offer.price());
        grantCardsWithCap(progression, List.of(offer.card()));
        List<String> purchased = new ArrayList<>(progression.getPurchasedDailyOfferIds());
        purchased.add(0, offer.id());
        progression.setPurchasedDailyOfferIds(purchased.stream().limit(90).toList());
        progression.setUpdatedAt(Instant.now());
        return store.save(progression);
    }

    public PlayerProgressionEntity craftCard(AccountUser user, String cardId) {
        PlayerProgressionEntity progression = getOrCreate(user);
        if (progression.getStarterPackId() == null || progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Choose a starter pack before crafting cards.");
        }
        Card card = findCraftableCard(cardId);
        int cost = craftCost(card);
        if (progression.getRemnants() < cost) {
            throw new IllegalArgumentException("Not enough Remnants to craft " + card.getName() + ".");
        }
        int owned = progression.getOwnedCards().getOrDefault(card.getId(), 0);
        if (owned >= cardDefinitionService.getDeckBuilderMaxCopies()) {
            throw new IllegalArgumentException("You already own the maximum copies of " + card.getName() + ".");
        }
        progression.setRemnants(progression.getRemnants() - cost);
        grantCardsWithCap(progression, List.of(card));
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
        int reward = calculateMatchReward(progression, history);
        progression.setGold(progression.getGold() + reward);
        if (reward > 0) {
            progression.setRemnants(progression.getRemnants() + calculateMatchRemnants(history));
        }
        List<String> rewarded = new ArrayList<>(progression.getRewardedMatchIds());
        rewarded.add(history.getId());
        progression.setRewardedMatchIds(rewarded);
        progression.setUpdatedAt(Instant.now());
        store.save(progression);
        if (dailyMissionService != null) {
            dailyMissionService.recordMatch(history, reward);
        }
    }

    public Map<String, Integer> describeEarnedRewards(AccountUser user, String matchType, String result) {
        Map<String, Integer> rewards = new LinkedHashMap<>();
        rewards.put("goldEarned", 0);
        rewards.put("remnantsEarned", 0);
        rewards.put("streakBonus", 0);
        if (user == null || result == null || !"WIN".equalsIgnoreCase(result)) {
            return rewards;
        }
        PlayerProgressionEntity progression = getOrCreate(user);
        boolean online = "ONLINE".equalsIgnoreCase(matchType);
        int streak = online ? progression.getOnlineWinStreak() : progression.getSoloWinStreak();
        int base = online ? ONLINE_WIN_GOLD : SOLO_WIN_GOLD;
        int streakBonus = WIN_STREAK_GOLD * streak;
        rewards.put("goldEarned", base + streakBonus);
        rewards.put("remnantsEarned", online ? ONLINE_WIN_REMNANTS : SOLO_WIN_REMNANTS);
        rewards.put("streakBonus", streakBonus);
        return rewards;
    }

    private int calculateMatchReward(PlayerProgressionEntity progression, MatchHistoryEntity history) {
        boolean online = "ONLINE".equalsIgnoreCase(history.getMatchType());
        boolean win = "WIN".equalsIgnoreCase(history.getResult());
        if (!win) {
            if (online) {
                progression.setOnlineWinStreak(0);
            } else {
                progression.setSoloWinStreak(0);
            }
            return 0;
        }
        if (online) {
            int streak = progression.getOnlineWinStreak() + 1;
            progression.setOnlineWinStreak(streak);
            return ONLINE_WIN_GOLD + (WIN_STREAK_GOLD * streak);
        }
        int streak = progression.getSoloWinStreak() + 1;
        progression.setSoloWinStreak(streak);
        return SOLO_WIN_GOLD + (WIN_STREAK_GOLD * streak);
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
        out.put("remnants", progression.getRemnants());
        out.put("ownedCards", progression.getOwnedCards());
        out.put("ownedTotal", ownedTotal(progression));
        out.put("ownedTrainers", serializeOwnedTrainers(progression));
        out.put("customDeckUnlocked", ownedTotal(progression) >= CUSTOM_DECK_UNLOCK_COPIES);
        out.put("customDeckUnlockCopies", CUSTOM_DECK_UNLOCK_COPIES);
        out.put("starterPackId", progression.getStarterPackId());
        out.put("starterChosen", progression.getStarterPackId() != null && !progression.getStarterPackId().isBlank());
        out.put("purchasedDeckIds", progression.getPurchasedDeckIds());
        out.put("purchasedDailyOfferIds", progression.getPurchasedDailyOfferIds());
        out.put("packHistory", progression.getPackHistory().stream().limit(12).toList());
        out.put("soloWinStreak", progression.getSoloWinStreak());
        out.put("onlineWinStreak", progression.getOnlineWinStreak());
        return out;
    }

    private int ownedTotal(PlayerProgressionEntity progression) {
        return progression.getOwnedCards().values().stream().mapToInt(Integer::intValue).sum();
    }

    private List<Map<String, Object>> serializeOwnedTrainers(PlayerProgressionEntity progression) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, Integer> levels = progression.getTrainerLevels();
        Map<String, Integer> points = progression.getTrainerPoints();
        for (Map.Entry<String, Integer> entry : levels.entrySet()) {
            int level = Math.max(1, entry.getValue());
            int progress = Math.max(0, points.getOrDefault(entry.getKey(), 0));
            Map<String, Object> trainer = new LinkedHashMap<>();
            trainer.put("id", entry.getKey());
            trainer.put("level", level);
            trainer.put("maxLevel", TRAINER_MAX_LEVEL);
            trainer.put("points", progress);
            trainer.put("pointsForNext", pointsForNextLevel(level));
            trainer.put("abilityBonus", trainerAbilityBonus(level));
            out.add(trainer);
        }
        return out;
    }

    /** Bonus added to a knight's passive and active ability effect values at the given level. */
    public static int trainerAbilityBonus(int level) {
        return Math.max(0, level - 1);
    }

    public List<CardGrantOutcome> grantCardsWithCap(PlayerProgressionEntity progression, List<Card> cards) {
        int maxCopies = cardDefinitionService.getDeckBuilderMaxCopies();
        Map<String, Integer> owned = new LinkedHashMap<>(progression.getOwnedCards());
        List<CardGrantOutcome> outcomes = new ArrayList<>();
        int remnantsFromDuplicates = 0;
        for (Card card : cards) {
            String cardId = card.getId();
            int current = owned.getOrDefault(cardId, 0);
            if (current < maxCopies) {
                int next = current + 1;
                owned.put(cardId, next);
                outcomes.add(new CardGrantOutcome(card, true, 0, next));
            } else {
                int remnants = duplicateRemnantValue(card);
                remnantsFromDuplicates += remnants;
                outcomes.add(new CardGrantOutcome(card, false, remnants, current));
            }
        }
        progression.setOwnedCards(owned);
        grantRemnants(progression, remnantsFromDuplicates);
        return outcomes;
    }

    public int duplicateRemnantValue(Card card) {
        return Math.max(25, craftCost(card) / 5);
    }

    /**
     * Unlocks a SiegeKnight (level 1) on first acquisition, or feeds combine points toward the
     * next level on a duplicate. Leveling up grants a bonus to the knight's ability effects.
     */
    public TrainerGrantOutcome grantTrainer(PlayerProgressionEntity progression, TrainerCard trainer) {
        String trainerId = normalizeTrainerId(trainer.getId());
        Map<String, Integer> levels = new LinkedHashMap<>(progression.getTrainerLevels());
        Map<String, Integer> points = new LinkedHashMap<>(progression.getTrainerPoints());

        boolean newlyOwned = !levels.containsKey(trainerId);
        boolean leveledUp = false;
        int level = Math.max(1, levels.getOrDefault(trainerId, 0));
        int progress = Math.max(0, points.getOrDefault(trainerId, 0));

        if (newlyOwned) {
            level = 1;
            progress = 0;
        } else {
            progress += TRAINER_DUP_POINTS;
            while (level < TRAINER_MAX_LEVEL && progress >= pointsForNextLevel(level)) {
                progress -= pointsForNextLevel(level);
                level++;
                leveledUp = true;
            }
            if (level >= TRAINER_MAX_LEVEL) {
                progress = 0;
            }
        }

        levels.put(trainerId, level);
        points.put(trainerId, progress);
        progression.setTrainerLevels(levels);
        progression.setTrainerPoints(points);

        return new TrainerGrantOutcome(trainerId, trainer.getName(), trainer.getElement().name(), trainer.getRarity().name(), trainer.getTier(), newlyOwned, leveledUp,
                level, progress, pointsForNextLevel(level));
    }

    /** Duplicate copies required to advance from {@code level} to the next level. */
    public int pointsForNextLevel(int level) {
        if (level >= TRAINER_MAX_LEVEL) {
            return 0;
        }
        return Math.max(1, level);
    }

    public boolean ownsTrainer(AccountUser user, String trainerId) {
        if (user == null || trainerId == null || trainerId.isBlank()) {
            return false;
        }
        return getOrCreate(user).getTrainerLevels().containsKey(normalizeTrainerId(trainerId));
    }

    public int getTrainerLevel(AccountUser user, String trainerId) {
        if (user == null || trainerId == null || trainerId.isBlank()) {
            return 1;
        }
        return getTrainerLevel(getOrCreate(user), trainerId);
    }

    public int getTrainerLevel(PlayerProgressionEntity progression, String trainerId) {
        if (progression == null || trainerId == null) {
            return 1;
        }
        return Math.max(1, progression.getTrainerLevels().getOrDefault(normalizeTrainerId(trainerId), 1));
    }

    private String normalizeTrainerId(String trainerId) {
        return trainerId == null ? null : trainerId.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private void grantRemnants(PlayerProgressionEntity progression, int amount) {
        progression.setRemnants(progression.getRemnants() + Math.max(0, amount));
    }

    private int calculateMatchRemnants(MatchHistoryEntity history) {
        return "ONLINE".equalsIgnoreCase(history.getMatchType()) ? ONLINE_WIN_REMNANTS : SOLO_WIN_REMNANTS;
    }

    private Card findCraftableCard(String cardId) {
        if (cardId == null || cardId.isBlank()) {
            throw new IllegalArgumentException("Card id is required.");
        }
        return cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(card -> card.getId().equals(cardId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Card not found."));
    }

    public int craftCost(Card card) {
        return switch (card.getRarity()) {
            case COMMON -> 500;
            case UNCOMMON -> 1000;
            case RARE -> 2000;
            case EPIC -> 4000;
            case LEGENDARY -> 8000;
        };
    }

    private void addPackHistory(PlayerProgressionEntity progression,
                                PackCatalogService.PackOpenResult result,
                                List<CardGrantOutcome> outcomes,
                                TrainerGrantOutcome trainerOutcome,
                                int price,
                                String source) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("packId", result.pack().id());
        entry.put("packName", result.pack().name());
        entry.put("source", source);
        entry.put("price", price);
        entry.put("openedAt", Instant.now().toString());
        int remnantsFromDuplicates = outcomes.stream().mapToInt(CardGrantOutcome::remnantsAwarded).sum();
        entry.put("remnantsFromDuplicates", remnantsFromDuplicates);
        if (trainerOutcome != null) {
            Map<String, Object> trainerEntry = new LinkedHashMap<>();
            trainerEntry.put("id", trainerOutcome.trainerId());
            trainerEntry.put("name", trainerOutcome.trainerName());
            trainerEntry.put("element", trainerOutcome.element());
            trainerEntry.put("rarity", trainerOutcome.rarity());
            trainerEntry.put("tier", trainerOutcome.tier());
            trainerEntry.put("newlyOwned", trainerOutcome.newlyOwned());
            trainerEntry.put("leveledUp", trainerOutcome.leveledUp());
            trainerEntry.put("level", trainerOutcome.level());
            trainerEntry.put("points", trainerOutcome.points());
            trainerEntry.put("pointsForNext", trainerOutcome.pointsForNext());
            entry.put("trainer", trainerEntry);
        }
        entry.put("cards", outcomes.stream().map(outcome -> {
            Card card = outcome.card();
            Map<String, Object> cardEntry = new LinkedHashMap<>();
            cardEntry.put("id", card.getId());
            cardEntry.put("name", card.getName());
            cardEntry.put("type", card.getCardType().name());
            cardEntry.put("element", card.getElement().name());
            cardEntry.put("rarity", card.getRarity().name());
            cardEntry.put("granted", outcome.grantedCopy());
            cardEntry.put("duplicateAtCap", !outcome.grantedCopy());
            cardEntry.put("remnantsAwarded", outcome.remnantsAwarded());
            cardEntry.put("ownedAfter", outcome.ownedAfter());
            return cardEntry;
        }).toList());
        List<Map<String, Object>> history = new ArrayList<>();
        history.add(entry);
        history.addAll(progression.getPackHistory());
        progression.setPackHistory(history.stream().limit(20).toList());
        if (dailyMissionService != null) {
            dailyMissionService.recordPackOpened(progression.getUserId());
        }
    }
}
