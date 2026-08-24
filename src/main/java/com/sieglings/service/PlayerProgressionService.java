package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collection;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

@Service
public class PlayerProgressionService {
    private static final Logger logger = LoggerFactory.getLogger(PlayerProgressionService.class);

    public static final int STARTING_GOLD = 100;
    public static final int CUSTOM_DECK_UNLOCK_COPIES = 30;
    /** Flat Siegecoin price for any premade deck that isn't free. */
    public static final int PREMADE_DECK_PRICE = 500;
    /**
     * Premade decks built purely from these elements are free for everyone; the
     * deck matching the player's starter pack element is free on top of them.
     */
    public static final Set<Element> FREE_DECK_ELEMENTS =
            Collections.unmodifiableSet(EnumSet.of(Element.FIRE, Element.ICE, Element.EARTH, Element.WIND));
    public static final int SOLO_WIN_GOLD = 10;
    public static final int ONLINE_WIN_GOLD = 5;
    public static final int WIN_STREAK_GOLD = 2;
    public static final int PACK_OPEN_REMNANTS = 40;
    public static final double BULK_PACK_DISCOUNT = 0.05;
    public static final int MAX_BULK_PACK_COUNT = 10;
    public static final int TUTORIAL_GOLD_REWARD = 250;
    public static final int SOLO_WIN_REMNANTS = 20;
    public static final int ONLINE_WIN_REMNANTS = 30;
    private static final int PACK_OPEN_LOCK_STRIPES = 64;
    private static final int COMPLETED_PACK_OPEN_REQUEST_LIMIT = 500;

    // SiegeKnight leveling / combining (tunable balance knobs).
    public static final int TRAINER_MAX_LEVEL = 5;
    public static final int TRAINER_DUP_POINTS = 1;
    /** Siegecoins per XP point; scales with current knight level (cost = level × this value). */
    public static final int TRAINER_XP_COIN_COST_PER_LEVEL = 50;

    public record CardGrantOutcome(Card card, boolean grantedCopy, int remnantsAwarded, int ownedAfter) {}

    public record TrainerGrantOutcome(String trainerId, String trainerName, String element, String rarity, String tier,
                                      boolean newlyOwned, boolean leveledUp, int level, int points, int pointsForNext) {}

    private final Object[] packOpenLocks = createLockStripes();

    @Autowired
    private PlayerProgressionStore store;

    @Autowired
    private PackCatalogService packCatalogService;

    @Autowired
    private CardDefinitionService cardDefinitionService;

    @Autowired(required = false)
    private DailyMissionService dailyMissionService;

    @Autowired(required = false)
    private PlayerTitleService playerTitleService;

    private static Object[] createLockStripes() {
        Object[] locks = new Object[PACK_OPEN_LOCK_STRIPES];
        for (int i = 0; i < locks.length; i++) {
            locks[i] = new Object();
        }
        return locks;
    }

    private Object packOpenLock(AccountUser user) {
        String userId = user == null ? "" : String.valueOf(user.getId());
        return packOpenLocks[Math.floorMod(userId.hashCode(), packOpenLocks.length)];
    }

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
            if (progression.getStarterPackId().equals(packId)) {
                return progression;
            }
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
        addPackHistory(progression, result, outcomes, trainerOutcome, 0, "STARTER", null);
        progression.setUpdatedAt(Instant.now());
        PlayerProgressionEntity saved = store.save(progression);
        recordPackOpenedAsync(saved.getUserId());
        return saved;
    }

    /**
     * Grants the one-time tutorial rewards: a free re-open of the player's
     * starter pack plus bonus Siegecoins. Guarded by the tutorialCompleted
     * flag so it can only ever be claimed once per account.
     */
    public PlayerProgressionEntity completeTutorial(AccountUser user) {
        PlayerProgressionEntity progression = getOrCreate(user);
        if (progression.isTutorialCompleted()) {
            throw new IllegalArgumentException("Tutorial rewards have already been claimed.");
        }
        String packId = progression.getStarterPackId();
        if (packId == null || packId.isBlank()) {
            throw new IllegalArgumentException("Choose a starter pack before claiming the tutorial reward.");
        }
        PackCatalogService.PackOpenResult result = packCatalogService.openPack(packId, true);
        List<CardGrantOutcome> outcomes = grantCardsWithCap(progression, result.cards());
        grantRemnants(progression, PACK_OPEN_REMNANTS);
        progression.setGold(progression.getGold() + TUTORIAL_GOLD_REWARD);
        progression.setTutorialCompleted(true);
        addPackHistory(progression, result, outcomes, null, 0, "TUTORIAL", null);
        progression.setUpdatedAt(Instant.now());
        PlayerProgressionEntity saved = store.save(progression);
        recordPackOpenedAsync(saved.getUserId());
        return saved;
    }

    public PlayerProgressionEntity openPack(AccountUser user, String packId) {
        return openPack(user, packId, null);
    }

    public PlayerProgressionEntity openPack(AccountUser user, String packId, String requestId) {
        synchronized (packOpenLock(user)) {
            return openPackInternal(user, packId, normalizePackOpenRequestId(requestId));
        }
    }

    private PlayerProgressionEntity openPackInternal(AccountUser user, String packId, String requestId) {
        PlayerProgressionEntity progression = getOrCreate(user);
        if (progression.getStarterPackId() == null || progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Choose a starter pack before buying more packs.");
        }
        if (hasCompletedPackOpenRequest(progression, requestId)) {
            return progression;
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
        addPackHistory(progression, result, outcomes, trainerOutcome, result.pack().price(), "SHOP", requestId);
        progression.setUpdatedAt(Instant.now());
        PlayerProgressionEntity saved = store.save(progression);
        recordPackOpenedAsync(saved.getUserId());
        return saved;
    }

    /** Total Siegecoin cost for {@code count} copies of a pack, applying the bulk discount for multi-buys. */
    public static int bulkPackCost(int unitPrice, int count) {
        long gross = (long) unitPrice * Math.max(1, count);
        if (count <= 1) {
            return (int) gross;
        }
        return (int) Math.round(gross * (1.0 - BULK_PACK_DISCOUNT));
    }

    /**
     * Opens {@code count} copies of a pack in a single transaction, charging the discounted bundle price.
     * All pulled cards are combined into one pack-history entry so the reveal shows the full bundle at once.
     */
    public PlayerProgressionEntity openPacks(AccountUser user, String packId, int count) {
        return openPacks(user, packId, count, null);
    }

    public PlayerProgressionEntity openPacks(AccountUser user, String packId, int count, String requestId) {
        synchronized (packOpenLock(user)) {
            return openPacksInternal(user, packId, count, normalizePackOpenRequestId(requestId));
        }
    }

    private PlayerProgressionEntity openPacksInternal(AccountUser user, String packId, int count, String requestId) {
        int safeCount = Math.max(1, Math.min(count, MAX_BULK_PACK_COUNT));
        if (safeCount == 1) {
            return openPackInternal(user, packId, requestId);
        }
        PlayerProgressionEntity progression = getOrCreate(user);
        if (progression.getStarterPackId() == null || progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Choose a starter pack before buying more packs.");
        }
        if (hasCompletedPackOpenRequest(progression, requestId)) {
            return progression;
        }
        PackCatalogService.PackDefinition pack = packCatalogService.findPack(packId)
                .orElseThrow(() -> new IllegalArgumentException("Pack not found."));
        int totalCost = bulkPackCost(pack.price(), safeCount);
        if (progression.getGold() < totalCost) {
            throw new IllegalArgumentException("Not enough Siegecoins for that bundle.");
        }
        progression.setGold(progression.getGold() - totalCost);

        List<Card> allCards = new ArrayList<>();
        List<String> allHoloIds = new ArrayList<>();
        List<CardGrantOutcome> allOutcomes = new ArrayList<>();
        TrainerGrantOutcome firstTrainerOutcome = null;
        PackCatalogService.PackDefinition openedPack = pack;
        for (int i = 0; i < safeCount; i++) {
            PackCatalogService.PackOpenResult result = packCatalogService.openPack(packId, false);
            openedPack = result.pack();
            allOutcomes.addAll(grantCardsWithCap(progression, result.cards()));
            grantRemnants(progression, PACK_OPEN_REMNANTS);
            if (result.bonusTrainer() != null) {
                TrainerGrantOutcome trainerOutcome = grantTrainer(progression, result.bonusTrainer());
                if (firstTrainerOutcome == null) {
                    firstTrainerOutcome = trainerOutcome;
                }
            }
            allCards.addAll(result.cards());
            if (result.holoCardIds() != null) {
                allHoloIds.addAll(result.holoCardIds());
            }
        }
        PackCatalogService.PackOpenResult combined =
                new PackCatalogService.PackOpenResult(openedPack, allCards, null, allHoloIds);
        addPackHistory(progression, combined, allOutcomes, firstTrainerOutcome, totalCost, "SHOP", requestId);
        progression.setUpdatedAt(Instant.now());
        PlayerProgressionEntity saved = store.save(progression);
        recordPackOpenedAsync(saved.getUserId());
        return saved;
    }

    /**
     * Premade decks the player can take into a match: the main-four elements are
     * free for everyone, the starter pack's element comes with the starter
     * choice, and anything else has to be bought.
     */
    public boolean isPremadeDeckUnlocked(PlayerProgressionEntity progression, CardDefinitionService.DeckOption deck) {
        if (deck == null) {
            return false;
        }
        if (progression != null && progression.getPurchasedDeckIds() != null
                && progression.getPurchasedDeckIds().contains(deck.id())) {
            return true;
        }
        return isFreePremadeDeck(progression, deck);
    }

    /** True when every element in the deck is free for this player (no purchase involved). */
    public boolean isFreePremadeDeck(PlayerProgressionEntity progression, CardDefinitionService.DeckOption deck) {
        List<Element> elements = deck == null ? null : deck.elements();
        if (elements == null || elements.isEmpty()) {
            return false;
        }
        return freeDeckElements(progression).containsAll(elements);
    }

    /** Guests and brand-new accounts (no starter yet) get the main four only. */
    private Set<Element> freeDeckElements(PlayerProgressionEntity progression) {
        EnumSet<Element> elements = EnumSet.copyOf(FREE_DECK_ELEMENTS);
        Element starter = progression == null ? null : starterElementForPack(progression.getStarterPackId());
        if (starter != null) {
            elements.add(starter);
        }
        return elements;
    }

    /**
     * Match-start gate. Unknown deck ids pass through so custom/legacy ids keep
     * whatever handling they had; a null user is treated as a guest.
     */
    public boolean isPremadeDeckUnlockedForUser(AccountUser user, String deckId) {
        CardDefinitionService.DeckOption deck = cardDefinitionService.getDeckOption(deckId).orElse(null);
        if (deck == null) {
            return true;
        }
        return isPremadeDeckUnlocked(user == null ? null : getOrCreate(user), deck);
    }

    public List<String> unlockedPremadeDeckIds(PlayerProgressionEntity progression) {
        return cardDefinitionService.getDeckOptions().stream()
                .filter(deck -> isPremadeDeckUnlocked(progression, deck))
                .map(CardDefinitionService.DeckOption::id)
                .toList();
    }

    public PlayerProgressionEntity purchaseDeck(AccountUser user, String deckId) {
        PlayerProgressionEntity progression = getOrCreate(user);
        CardDefinitionService.DeckOption deck = cardDefinitionService.getDeckOption(deckId)
                .orElseThrow(() -> new IllegalArgumentException("Deck not found."));
        if (progression.getPurchasedDeckIds().contains(deck.id()) || isFreePremadeDeck(progression, deck)) {
            return progression;
        }
        if (progression.getGold() < PREMADE_DECK_PRICE) {
            throw new IllegalArgumentException("Not enough Siegecoins for that premade deck.");
        }
        progression.setGold(progression.getGold() - PREMADE_DECK_PRICE);
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
        // SiegeKnight offers unlock/level the trainer; everything else is a
        // normal card grant.
        if (offer.card() instanceof TrainerCard trainer) {
            grantTrainer(progression, trainer);
        } else {
            grantCardsWithCap(progression, List.of(offer.card()));
        }
        List<String> purchased = new ArrayList<>(progression.getPurchasedDailyOfferIds());
        purchased.add(0, offer.id());
        progression.setPurchasedDailyOfferIds(purchased.stream().limit(90).toList());
        progression.setUpdatedAt(Instant.now());
        return store.save(progression);
    }

    public PlayerProgressionEntity purchaseHolographicFinish(AccountUser user, String cardId) {
        PlayerProgressionEntity progression = getOrCreate(user);
        if (progression.getStarterPackId() == null || progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Choose a starter pack before upgrading cards.");
        }
        String normalizedId = normalizeCardId(cardId);
        if (!ownsHolographicTarget(progression, normalizedId)) {
            throw new IllegalArgumentException("You must own this card before applying a holographic finish.");
        }
        if (hasHolographicFinish(progression, normalizedId)) {
            throw new IllegalArgumentException("This card already has a holographic finish.");
        }
        Card card = findHolographicTarget(normalizedId);
        if (card.isHolographic()) {
            throw new IllegalArgumentException("This card already ships with a holographic finish.");
        }
        int cost = holographicCost(card);
        if (progression.getRemnants() < cost) {
            throw new IllegalArgumentException("Not enough Remnants for a holographic finish on " + card.getName() + ".");
        }
        progression.setRemnants(progression.getRemnants() - cost);
        List<String> holographicIds = new ArrayList<>(
                progression.getHolographicCardIds() == null ? List.of() : progression.getHolographicCardIds());
        holographicIds.add(normalizedId);
        progression.setHolographicCardIds(holographicIds);
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
        progression.setCraftCount(progression.getCraftCount() + 1);
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

    /**
     * Describes the rewards tied to a finished match for the end screen.
     *
     * <p>For a logged-in winner these are the rewards actually granted (the real
     * win streak is already applied by {@link #awardMatchGold}). For a guest (no
     * account) we still return what they <em>could</em> have earned so the end
     * screen can nudge them to sign in, flagged via {@code guestPreview} /
     * {@code rewardsClaimed} so the UI can frame it as potential rather than
     * banked rewards.
     */
    public Map<String, Object> describeEarnedRewards(AccountUser user, String matchType, String result) {
        Map<String, Object> rewards = new LinkedHashMap<>();
        boolean win = "WIN".equalsIgnoreCase(result);
        boolean online = "ONLINE".equalsIgnoreCase(matchType);
        int base = online ? ONLINE_WIN_GOLD : SOLO_WIN_GOLD;
        int remnants = online ? ONLINE_WIN_REMNANTS : SOLO_WIN_REMNANTS;

        if (!win) {
            rewards.put("goldEarned", 0);
            rewards.put("remnantsEarned", 0);
            rewards.put("streakBonus", 0);
            rewards.put("rewardsClaimed", false);
            rewards.put("guestPreview", false);
            return rewards;
        }

        if (user == null) {
            // Guest winner: show the baseline win reward (no streak history) as a
            // preview of what signing in would have earned them.
            rewards.put("goldEarned", base);
            rewards.put("remnantsEarned", remnants);
            rewards.put("streakBonus", 0);
            rewards.put("rewardsClaimed", false);
            rewards.put("guestPreview", true);
            return rewards;
        }

        PlayerProgressionEntity progression = getOrCreate(user);
        int streak = online ? progression.getOnlineWinStreak() : progression.getSoloWinStreak();
        int streakBonus = WIN_STREAK_GOLD * streak;
        rewards.put("goldEarned", base + streakBonus);
        rewards.put("remnantsEarned", remnants);
        rewards.put("streakBonus", streakBonus);
        rewards.put("rewardsClaimed", true);
        rewards.put("guestPreview", false);
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
        return serialize(progression, null);
    }

    public Map<String, Object> serialize(PlayerProgressionEntity progression, AccountUser user) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("gold", progression.getGold());
        out.put("remnants", progression.getRemnants());
        out.put("ownedCards", progression.getOwnedCards());
        out.put("ownedTotal", ownedTotal(progression));
        out.put("ownedTrainers", serializeOwnedTrainers(progression));
        out.put("tutorialCompleted", progression.isTutorialCompleted());
        out.put("customDeckUnlocked", ownedTotal(progression) >= CUSTOM_DECK_UNLOCK_COPIES);
        out.put("customDeckUnlockCopies", CUSTOM_DECK_UNLOCK_COPIES);
        out.put("starterPackId", progression.getStarterPackId());
        out.put("starterChosen", progression.getStarterPackId() != null && !progression.getStarterPackId().isBlank());
        out.put("purchasedDeckIds", progression.getPurchasedDeckIds());
        out.put("unlockedDeckIds", unlockedPremadeDeckIds(progression));
        out.put("premadeDeckPrice", PREMADE_DECK_PRICE);
        out.put("purchasedDailyOfferIds", progression.getPurchasedDailyOfferIds());
        out.put("packHistory", progression.getPackHistory().stream().limit(12).toList());
        out.put("soloWinStreak", progression.getSoloWinStreak());
        out.put("onlineWinStreak", progression.getOnlineWinStreak());
        out.put("craftCount", progression.getCraftCount());
        List<String> holographicCards = progression.getHolographicCardIds() == null
                ? List.of()
                : progression.getHolographicCardIds();
        out.put("holographicCards", holographicCards.stream()
                .map(this::normalizeCardId)
                .filter(id -> id != null && !id.isBlank())
                .distinct()
                .toList());
        if (playerTitleService != null) {
            out.put("playerTitles", playerTitleService.serializeTitlesForUser(user, progression));
        } else {
            out.put("playerTitles", List.of());
        }
        out.put("purchasedTitleIds", progression.getPurchasedTitleIds());
        out.put("siegeUnlockedKnights", progression.getSiegeUnlockedKnights());
        out.put("siegeRuns", progression.getSiegeRuns());
        out.put("siegeWins", progression.getSiegeWins());
        out.put("siegeBossKills", progression.getSiegeBossKills());
        out.put("siegeNodesCleared", progression.getSiegeNodesCleared());
        out.put("siegeBestScore", progression.getSiegeBestScore());
        out.put("keepFounded", progression.isKeepFounded());
        out.put("keepTimberCollected", progression.getKeepTimberCollected());
        out.put("keepProjectsCompleted", progression.getKeepProjectsCompleted());
        out.put("keepLoreRead", progression.getKeepLoreRead());
        out.put("keepConversationsCompleted", progression.getKeepConversationsCompleted());
        return out;
    }

    public PlayerProgressionEntity purchaseTitle(AccountUser user, String titleId) {
        if (playerTitleService == null) {
            throw new IllegalStateException("Title purchases are unavailable.");
        }
        PlayerProgressionEntity progression = getOrCreate(user);
        progression = playerTitleService.applyTitlePurchase(user, progression, titleId);
        progression.setUpdatedAt(Instant.now());
        return store.save(progression);
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
            trainer.put("nextXpCoinCost", trainerXpCoinCost(level));
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

    /** Siegecoin cost to buy one XP point at the given knight level. */
    public static int trainerXpCoinCost(int level) {
        if (level >= TRAINER_MAX_LEVEL) {
            return 0;
        }
        return TRAINER_XP_COIN_COST_PER_LEVEL * Math.max(1, level);
    }

    public PlayerProgressionEntity buyTrainerXp(AccountUser user, String trainerId) {
        PlayerProgressionEntity progression = getOrCreate(user);
        if (progression.getStarterPackId() == null || progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Choose a starter pack before buying knight XP.");
        }
        String id = normalizeTrainerId(trainerId);
        if (id == null || !progression.getTrainerLevels().containsKey(id)) {
            throw new IllegalArgumentException("You don't own that SiegeKnight.");
        }
        int level = Math.max(1, progression.getTrainerLevels().get(id));
        if (level >= TRAINER_MAX_LEVEL) {
            throw new IllegalArgumentException("This SiegeKnight is already at max level.");
        }
        int cost = trainerXpCoinCost(level);
        if (progression.getGold() < cost) {
            throw new IllegalArgumentException("Not enough Siegecoins for knight XP.");
        }
        progression.setGold(progression.getGold() - cost);

        Map<String, Integer> levels = new LinkedHashMap<>(progression.getTrainerLevels());
        Map<String, Integer> points = new LinkedHashMap<>(progression.getTrainerPoints());
        int progress = Math.max(0, points.getOrDefault(id, 0)) + TRAINER_DUP_POINTS;
        while (level < TRAINER_MAX_LEVEL && progress >= pointsForNextLevel(level)) {
            progress -= pointsForNextLevel(level);
            level++;
        }
        if (level >= TRAINER_MAX_LEVEL) {
            progress = 0;
        }
        levels.put(id, level);
        points.put(id, progress);
        progression.setTrainerLevels(levels);
        progression.setTrainerPoints(points);
        progression.setUpdatedAt(Instant.now());
        return store.save(progression);
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

    public boolean isSiegeKnightUnlocked(PlayerProgressionEntity progression, String trainerId) {
        if (progression == null || trainerId == null || trainerId.isBlank()) {
            return false;
        }
        String id = normalizeTrainerId(trainerId);
        return progression.getSiegeUnlockedKnights().stream()
                .anyMatch(stored -> id.equals(normalizeTrainerId(stored)));
    }

    public void unlockSiegeKnight(PlayerProgressionEntity progression, String trainerId) {
        if (progression == null || trainerId == null || trainerId.isBlank()) {
            throw new IllegalArgumentException("SiegeKnight id is required.");
        }
        String id = normalizeTrainerId(trainerId);
        if (isSiegeKnightUnlocked(progression, id)) {
            throw new IllegalArgumentException("That SiegeKnight is already unlocked for expeditions.");
        }
        if (!progression.getTrainerLevels().containsKey(id)) {
            throw new IllegalArgumentException("Own this SiegeKnight card before unlocking them for expeditions.");
        }
        List<String> unlocked = new ArrayList<>(progression.getSiegeUnlockedKnights());
        unlocked.add(id);
        progression.setSiegeUnlockedKnights(unlocked);
    }

    public boolean isSiegeSieglingUnlocked(PlayerProgressionEntity progression, String cardId) {
        if (progression == null || cardId == null || cardId.isBlank()) {
            return false;
        }
        String id = normalizeTrainerId(cardId);
        return progression.getSiegeUnlockedSieglings().stream()
                .anyMatch(stored -> id.equals(normalizeTrainerId(stored)));
    }

    /**
     * Banks Siegelings found on an expedition as permanent starter unlocks.
     * Ids already unlocked are skipped rather than rejected — a run routinely
     * re-finds cards you own, and that is not an error.
     *
     * @return the ids newly added, in the order supplied (empty when nothing is new)
     */
    public List<String> unlockSiegeSieglings(PlayerProgressionEntity progression, Collection<String> cardIds) {
        if (progression == null || cardIds == null || cardIds.isEmpty()) {
            return List.of();
        }
        List<String> unlocked = new ArrayList<>(progression.getSiegeUnlockedSieglings());
        List<String> added = new ArrayList<>();
        for (String cardId : cardIds) {
            if (cardId == null || cardId.isBlank() || isSiegeSieglingUnlocked(progression, cardId)) {
                continue;
            }
            String id = normalizeTrainerId(cardId);
            unlocked.add(id);
            added.add(id);
        }
        if (!added.isEmpty()) {
            progression.setSiegeUnlockedSieglings(unlocked);
        }
        return added;
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

    public int holographicCost(Card card) {
        return craftCost(card) * 4;
    }

    public boolean hasHolographicFinish(PlayerProgressionEntity progression, String cardId) {
        if (progression == null) {
            return false;
        }
        String normalizedId = normalizeCardId(cardId);
        if (normalizedId == null) {
            return false;
        }
        List<String> holographicCards = progression.getHolographicCardIds();
        if (holographicCards == null || holographicCards.isEmpty()) {
            return false;
        }
        return holographicCards.stream()
                .map(this::normalizeCardId)
                .anyMatch(normalizedId::equals);
    }

    private boolean ownsHolographicTarget(PlayerProgressionEntity progression, String cardId) {
        String normalizedId = normalizeCardId(cardId);
        if (normalizedId == null) {
            return false;
        }
        for (Map.Entry<String, Integer> entry : progression.getOwnedCards().entrySet()) {
            if (entry.getValue() != null && entry.getValue() > 0
                    && normalizedId.equals(normalizeCardId(entry.getKey()))) {
                return true;
            }
        }
        if (progression.getTrainerLevels().containsKey(normalizedId)) {
            return true;
        }
        return progression.getTrainerLevels().keySet().stream()
                .anyMatch(key -> normalizedId.equals(normalizeTrainerId(key)));
    }

    private Card findHolographicTarget(String cardId) {
        return cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(card -> cardId.equals(normalizeCardId(card.getId())))
                .findFirst()
                .orElseGet(() -> cardDefinitionService.getActiveTrainerById(cardId)
                        .orElseThrow(() -> new IllegalArgumentException("Card not found.")));
    }

    private String normalizeCardId(String cardId) {
        if (cardId == null) {
            return null;
        }
        String normalized = cardId.trim().toLowerCase(java.util.Locale.ROOT);
        return normalized.isBlank() ? null : normalized;
    }

    private String normalizePackOpenRequestId(String requestId) {
        if (requestId == null) {
            return null;
        }
        String normalized = requestId.trim();
        if (normalized.isBlank()) {
            return null;
        }
        return normalized.length() > 120 ? normalized.substring(0, 120) : normalized;
    }

    private boolean hasCompletedPackOpenRequest(PlayerProgressionEntity progression, String requestId) {
        if (requestId == null || progression == null) {
            return false;
        }
        if (progression.getCompletedPackOpenRequestIds().contains(requestId)) {
            return true;
        }
        return progression.getPackHistory() != null && progression.getPackHistory().stream()
                .anyMatch(entry -> entry != null && requestId.equals(entry.get("requestId")));
    }

    private void recordCompletedPackOpenRequest(PlayerProgressionEntity progression, String requestId) {
        if (progression == null || requestId == null || requestId.isBlank()) {
            return;
        }
        List<String> completed = new ArrayList<>();
        completed.add(requestId);
        for (String existing : progression.getCompletedPackOpenRequestIds()) {
            if (existing != null && !existing.isBlank() && !existing.equals(requestId)) {
                completed.add(existing);
            }
        }
        progression.setCompletedPackOpenRequestIds(completed.stream()
                .limit(COMPLETED_PACK_OPEN_REQUEST_LIMIT)
                .toList());
    }

    /** Records pack-dropped holographic finishes on the player's collection. */
    private void applyHolographicDrops(PlayerProgressionEntity progression, PackCatalogService.PackOpenResult result) {
        if (result.holoCardIds() == null || result.holoCardIds().isEmpty()) {
            return;
        }
        if (progression.getHolographicCardIds() == null) {
            progression.setHolographicCardIds(new ArrayList<>());
        }
        for (String cardId : result.holoCardIds()) {
            if (!progression.getHolographicCardIds().contains(cardId)) {
                progression.getHolographicCardIds().add(cardId);
            }
        }
    }

    private void addPackHistory(PlayerProgressionEntity progression,
                                PackCatalogService.PackOpenResult result,
                                List<CardGrantOutcome> outcomes,
                                TrainerGrantOutcome trainerOutcome,
                                int price,
                                String source,
                                String requestId) {
        applyHolographicDrops(progression, result);
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("packId", result.pack().id());
        entry.put("packName", result.pack().name());
        entry.put("source", source);
        entry.put("price", price);
        if (requestId != null) {
            entry.put("requestId", requestId);
            recordCompletedPackOpenRequest(progression, requestId);
        }
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
            cardEntry.put("holo", result.holoCardIds() != null && result.holoCardIds().contains(card.getId()));
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
    }

    private void recordPackOpenedAsync(String userId) {
        if (dailyMissionService == null || userId == null || userId.isBlank()) {
            return;
        }
        CompletableFuture.runAsync(() -> {
            try {
                dailyMissionService.recordPackOpened(userId);
            } catch (Exception ex) {
                logger.warn("Could not record pack-open daily mission progress for user {}.", userId, ex);
            }
        });
    }
}
