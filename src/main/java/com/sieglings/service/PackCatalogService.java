package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.CardFinish;
import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Element;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.EnumMap;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PackCatalogService {
    /** Chance a normal pack also contains a SiegeKnight (very rare). Tunable balance knob. */
    public static final double TRAINER_DROP_CHANCE = 0.03;

    /**
     * Chance, per card acquired, that it arrives in each finish. Every tier is
     * rarer than the one below it, and every tier is rarer on a rarer card. GOLD
     * is a once-in-thousands event and GSP an act of god: about 1 in 20,000 on a
     * Common and 1 in 100,000 on a Legendary.
     */
    public static final Map<Rarity, Map<CardFinish, Double>> FINISH_DROP_CHANCE = new EnumMap<>(Map.of(
            Rarity.COMMON, finishOdds(0.06, 0.02, 0.008, 0.0005, 0.00005),
            Rarity.UNCOMMON, finishOdds(0.05, 0.016, 0.006, 0.00035, 0.000035),
            Rarity.RARE, finishOdds(0.04, 0.012, 0.0045, 0.00025, 0.000025),
            Rarity.EPIC, finishOdds(0.03, 0.009, 0.003, 0.00015, 0.000015),
            Rarity.LEGENDARY, finishOdds(0.02, 0.006, 0.002, 0.0001, 0.00001)
    ));

    private static Map<CardFinish, Double> finishOdds(double holo, double sp, double hsp, double gold, double gsp) {
        Map<CardFinish, Double> odds = new EnumMap<>(CardFinish.class);
        odds.put(CardFinish.HOLO, holo);
        odds.put(CardFinish.SP, sp);
        odds.put(CardFinish.HSP, hsp);
        odds.put(CardFinish.GOLD, gold);
        odds.put(CardFinish.GSP, gsp);
        return odds;
    }

    private final Random finishRandom = new Random();

    /**
     * The finish one acquired card arrives in, rolled rarest first against
     * {@link #FINISH_DROP_CHANCE}. An SP roll on a card with no holo art lands as
     * HOLO, since SP would show nothing new.
     */
    public CardFinish rollFinish(Card card) {
        if (card == null) {
            return CardFinish.STANDARD;
        }
        Map<CardFinish, Double> odds = FINISH_DROP_CHANCE.getOrDefault(card.getRarity(), Map.of());
        double roll = finishRandom.nextDouble();
        double threshold = 0;
        CardFinish[] rarestFirst = { CardFinish.GSP, CardFinish.GOLD, CardFinish.HSP, CardFinish.SP, CardFinish.HOLO };
        for (CardFinish finish : rarestFirst) {
            threshold += odds.getOrDefault(finish, 0.0);
            if (roll < threshold) {
                boolean hasHoloArt = card.getHolographicCardArtUrl() != null && !card.getHolographicCardArtUrl().isBlank();
                return finish == CardFinish.SP && !hasHoloArt ? CardFinish.HOLO : finish;
            }
        }
        return CardFinish.STANDARD;
    }

    public record PackDefinition(
            String id,
            String name,
            String description,
            boolean active,
            int price,
            List<Element> elements,
            boolean starterEligible
    ) {}

    /**
     * {@code finishes} is positional - one per card, in the same order - so two
     * copies of a card in one bundle can land in different finishes. Empty means
     * "not rolled yet": the grant rolls each card itself.
     */
    public record PackOpenResult(PackDefinition pack, List<Card> cards, TrainerCard bonusTrainer, List<CardFinish> finishes) {
        public PackOpenResult(PackDefinition pack, List<Card> cards) {
            this(pack, cards, null, List.of());
        }

        public PackOpenResult(PackDefinition pack, List<Card> cards, TrainerCard bonusTrainer) {
            this(pack, cards, bonusTrainer, List.of());
        }
    }

    public record DailyCardOffer(
            String id,
            String availableOn,
            int slot,
            int price,
            Card card
    ) {}

    /** Id prefix of the per-element Siegeling-only summons ({@code pack_siegeling_fire}, ...). */
    public static final String SIEGELING_SUMMON_PREFIX = "pack_siegeling_";

    @Autowired
    private CardDefinitionService cardDefinitionService;

    @Autowired(required = false)
    private ShopPriceCatalogService shopPriceCatalogService;

    @Autowired(required = false)
    private PackAvailabilityCatalogService packAvailabilityCatalogService;

    /**
     * Every pack this build knows about, with {@code active} resolved from the dashboard
     * availability overrides. Deactivated packs stay in this list so {@link #findPack} can
     * still resolve them and report "not currently available" instead of "not found".
     */
    public List<PackDefinition> listPacks() {
        List<PackDefinition> packs = new ArrayList<>();
        for (Element element : LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER) {
            packs.add(new PackDefinition(
                    "pack_" + element.name().toLowerCase(Locale.ROOT),
                    formatElement(element) + " Starter Pack",
                    "Five " + formatElement(element) + " cards: 2-3 Siegelings, 1-2 traps, and 1-2 spells. Includes a free " + formatElement(element) + " SiegeKnight.",
                    true,
                    100,
                    List.of(element),
                    true
            ));
        }
        packs.add(new PackDefinition("pack_molten_forge", "Molten Forge Pack",
                "Fire and Metal cards for armor-backed pressure.", true, 140,
                List.of(Element.FIRE, Element.METAL), false));
        packs.add(new PackDefinition("pack_eternal_night", "Eternal Night Pack",
                "Shadow and Undead cards for resilient pressure.", true, 140,
                List.of(Element.SHADOW, Element.UNDEAD), false));
        packs.add(new PackDefinition("pack_stormtide", "Stormtide Pack",
                "Water and Wind cards for control and tempo.", true, 140,
                List.of(Element.WATER, Element.WIND), false));
        List<Element> activeElements = activeGameplayElements();
        // One Siegeling-only summon per element, so the shop can offer a banner
        // the player points at an element instead of the random mix. An element
        // without five distinct live Siegelings is left out rather than listed
        // as a pack that would fail (or quietly pad with other elements) on open.
        Map<Element, Long> sieglingsByElement = cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(card -> card.getCardType() == CardType.SIEGLING && card.getElement() != null)
                .collect(Collectors.groupingBy(Card::getElement, Collectors.counting()));
        for (Element element : activeElements) {
            if (sieglingsByElement.getOrDefault(element, 0L) < 5) {
                continue;
            }
            packs.add(new PackDefinition(
                    SIEGELING_SUMMON_PREFIX + element.name().toLowerCase(Locale.ROOT),
                    formatElement(element) + " Siegeknight Pack",
                    "Five " + formatElement(element) + " Siegelings. Each pack has a chance to drop a SiegeKnight.",
                    true,
                    160,
                    List.of(element),
                    false
            ));
        }
        packs.add(new PackDefinition("pack_siegeling_random", "Siegeling Pack",
                "Five random Siegeling cards from a changing elemental mix.", true, 160,
                activeElements, false));
        // The Strategy, Deception and SiegeKnight packs are deliberately gone.
        // The first two split the very cards the mixed packs already deal, and
        // the third made knights a thing you bought outright rather than
        // something a pack could surprise you with — every pack now carries the
        // same slim TRAINER_DROP_CHANCE instead.
        return packs.stream()
                .filter(pack -> pack.elements().stream().map(Enum::name).allMatch(cardDefinitionService.getActiveLiveElementNames()::contains))
                .map(this::applyAvailability)
                .toList();
    }

    /** Packs a player may actually see and buy. */
    public List<PackDefinition> listAvailablePacks() {
        return listPacks().stream().filter(PackDefinition::active).toList();
    }

    private PackDefinition applyAvailability(PackDefinition pack) {
        if (packAvailabilityCatalogService == null || packAvailabilityCatalogService.isActive(pack.id())) {
            return pack;
        }
        return new PackDefinition(
                pack.id(),
                pack.name(),
                pack.description(),
                false,
                pack.price(),
                pack.elements(),
                pack.starterEligible()
        );
    }

    public Optional<PackDefinition> findPack(String packId) {
        String normalized = packId == null ? "" : packId.trim();
        return listPacks().stream().filter(pack -> pack.id().equals(normalized)).findFirst();
    }

    public PackOpenResult openPack(String packId, boolean starterOnly) {
        PackDefinition pack = findPack(packId)
                .orElseThrow(() -> new IllegalArgumentException("Pack not found."));
        if (!pack.active()) {
            throw new IllegalArgumentException("That pack is not currently available.");
        }
        if (starterOnly && !pack.starterEligible()) {
            throw new IllegalArgumentException("Choose a starter-eligible pack.");
        }

        List<Card> pool = cardPoolForPack(pack, !starterOnly);
        Optional<CardType> focusType = focusedType(pack.id());
        if (focusType.isPresent() && !pack.id().equals("pack_siegeling_random")) {
            // An element summon is strict: neutral filler would break the promise
            // on the banner, and listPacks only lists it with five to draw from.
            List<Card> focusCards = pool.stream()
                    .filter(card -> card.getCardType() == focusType.get() && card.getElement() == pack.elements().get(0))
                    .toList();
            List<Card> cards = selectRandom(focusCards, 5);
            if (cards.size() < 5) {
                throw new IllegalArgumentException("This summon does not have enough live " + formatElement(pack.elements().get(0)) + " Siegelings configured.");
            }
            return new PackOpenResult(pack, cards, rollBonusTrainer(pack), rollFinishes(cards));
        }
        if (focusType.isPresent()) {
            List<Card> focusCards = randomElementPool(pool, focusType.get()).stream()
                    .filter(card -> card.getCardType() == focusType.get())
                    .toList();
            if (focusCards.size() < 5) {
                focusCards = pool.stream()
                        .filter(card -> card.getCardType() == focusType.get())
                        .toList();
            }
            List<Card> cards = selectRandom(focusCards, 5);
            if (cards.size() < 5) {
                throw new IllegalArgumentException("This pack does not have enough live " + focusType.get().name().toLowerCase(Locale.ROOT) + " cards configured.");
            }
            return new PackOpenResult(pack, cards, rollBonusTrainer(pack), rollFinishes(cards));
        }

        List<Card> sieglings = selectRandom(pool, CardType.SIEGLING, 3);
        List<Card> traps = selectRandom(pool, CardType.TRAP, 1);
        List<Card> spells = selectRandom(pool, CardType.SPELL, 1);
        if (sieglings.size() < 2 || traps.isEmpty() || spells.isEmpty()) {
            throw new IllegalArgumentException("This pack does not have enough live cards configured. It needs at least 2 Siegelings, 1 trap, and 1 spell.");
        }

        List<Card> cards = new ArrayList<>();
        cards.addAll(sieglings.subList(0, Math.min(3, sieglings.size())));
        cards.add(traps.get(0));
        cards.add(spells.get(0));
        while (cards.size() > 5) {
            cards.remove(cards.size() - 1);
        }
        while (cards.size() < 5) {
            List<Card> filler = selectRandom(pool.stream()
                    .filter(card -> cards.stream().noneMatch(existing -> existing.getId().equals(card.getId())))
                    .toList(), 1);
            if (filler.isEmpty()) {
                throw new IllegalArgumentException("This pack cannot produce five unique cards from the current live pool.");
            }
            cards.add(filler.get(0));
        }
        return new PackOpenResult(pack, cards, rollBonusTrainer(pack), rollFinishes(cards));
    }

    /**
     * Rolls a SiegeKnight to include with a pack. Since the dedicated cache was retired every
     * pack rolls the same slim {@link #TRAINER_DROP_CHANCE}. Returns null when no knight drops.
     */
    private TrainerCard rollBonusTrainer(PackDefinition pack) {
        Random random = new Random();
        if (random.nextDouble() >= TRAINER_DROP_CHANCE) {
            return null;
        }
        List<TrainerCard> candidates = bonusTrainerCandidates(pack);
        if (candidates.isEmpty()) {
            return null;
        }
        return candidates.get(random.nextInt(candidates.size())).copy();
    }

    List<Card> cardPoolForPack(PackDefinition pack, boolean includeNeutralCards) {
        return cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(card -> pack.elements().contains(card.getElement())
                        || (includeNeutralCards && card.getElement() == Element.NEUTRAL))
                .toList();
    }

    List<TrainerCard> bonusTrainerCandidates(PackDefinition pack) {
        List<TrainerCard> trainers = cardDefinitionService.getTrainerOptions();
        List<TrainerCard> candidates = trainers.stream()
                .filter(trainer -> trainer.getElement() == null
                        || trainer.getElement() == Element.NEUTRAL
                        || pack.elements().contains(trainer.getElement()))
                .toList();
        return candidates.isEmpty() ? trainers : candidates;
    }

    /** One finish roll per pulled card, in pull order. */
    private List<CardFinish> rollFinishes(List<Card> cards) {
        List<CardFinish> finishes = new ArrayList<>();
        for (Card card : cards) {
            finishes.add(rollFinish(card));
        }
        return finishes;
    }

    /** Shop-facing listing: deactivated packs are omitted entirely. */
    public List<Map<String, Object>> serializePacks() {
        return listAvailablePacks().stream().map(this::serializePack).toList();
    }

    /** Dashboard-facing listing: includes deactivated packs so they can be switched back on. */
    public List<Map<String, Object>> serializeAllPacks() {
        return listPacks().stream().map(this::serializePack).toList();
    }

    public List<DailyCardOffer> listDailyOffers() {
        List<Card> cards = cardDefinitionService.getDeckBuilderCatalog().stream()
                .sorted(cardSort())
                .toList();
        if (cards.isEmpty()) {
            return List.of();
        }
        // SiegeKnights live outside the deck-builder catalog; pull them in so a
        // knight can headline the daily rotation.
        List<Card> trainers = cardDefinitionService.getTrainerOptions().stream()
                .map(trainer -> (Card) trainer)
                .toList();
        String date = java.time.LocalDate.now(java.time.ZoneId.systemDefault()).toString();
        List<DailyCardOffer> offers = new ArrayList<>();
        // Every daily rotation always offers a SiegeKnight (trainer), a
        // Strategy (spell), and a Deception (trap); the remaining two slots are
        // Siegelings so the creature roster headlines the shop.
        List<CardType> slots = new ArrayList<>(List.of(
                CardType.TRAINER, CardType.SPELL, CardType.TRAP,
                CardType.SIEGLING, CardType.SIEGLING));
        Set<String> selectedCardIds = new HashSet<>();
        for (int i = 0; i < slots.size(); i++) {
            CardType type = slots.get(i);
            List<Card> typePool = type == CardType.TRAINER ? trainers : cards;
            List<Card> candidates = typePool.stream()
                    .filter(card -> card.getCardType() == type)
                    .filter(card -> !selectedCardIds.contains(card.getId()))
                    .toList();
            if (candidates.isEmpty()) {
                // No live card of this type (e.g. trainers not configured) —
                // fall back to any unused deck-builder card so the slot fills.
                candidates = cards.stream()
                        .filter(card -> !selectedCardIds.contains(card.getId()))
                        .toList();
            }
            if (candidates.isEmpty()) {
                candidates = cards;
            }
            List<Card> shuffled = new ArrayList<>(candidates);
            Collections.shuffle(shuffled, new Random((date + ":" + type.name() + ":" + i).hashCode()));
            Card card = shuffled.get(0);
            selectedCardIds.add(card.getId());
            offers.add(new DailyCardOffer(
                    "daily_" + date + "_" + card.getId(),
                    date,
                    i + 1,
                    priceFor(card),
                    card
            ));
        }
        return offers;
    }

    public Optional<DailyCardOffer> findDailyOffer(String offerId) {
        String normalized = offerId == null ? "" : offerId.trim();
        return listDailyOffers().stream()
                .filter(offer -> offer.id().equals(normalized))
                .findFirst();
    }

    public List<Map<String, Object>> serializeDailyOffers() {
        return listDailyOffers().stream().map(this::serializeDailyOffer).toList();
    }

    public Map<String, Object> serializePack(PackDefinition pack) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", pack.id());
        out.put("name", pack.name());
        out.put("description", pack.description());
        out.put("active", pack.active());
        out.put("price", pack.price());
        out.put("elements", pack.elements().stream().map(Enum::name).toList());
        out.put("starterEligible", pack.starterEligible());
        Map<String, Object> odds = new LinkedHashMap<>();
        odds.put("siegeKnight", TRAINER_DROP_CHANCE);
        // Each knight the roll can pick, with its share of the knight chance
        // (rollBonusTrainer picks uniformly), so the odds sheet names them.
        List<TrainerCard> knights = bonusTrainerCandidates(pack);
        odds.put("siegeKnightPool", knights.stream().map(knight -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", knight.getId());
            row.put("name", knight.getName());
            row.put("element", knight.getElement() == null ? null : knight.getElement().name());
            row.put("rarity", knight.getRarity() == null ? null : knight.getRarity().name());
            row.put("chance", TRAINER_DROP_CHANCE / knights.size());
            return row;
        }).toList());
        // finishPerCard[rarity][finish] = chance per card; the shop's odds sheet reads it.
        Map<String, Map<String, Double>> finishPerCard = new LinkedHashMap<>();
        for (Rarity rarity : Rarity.values()) {
            Map<String, Double> row = new LinkedHashMap<>();
            FINISH_DROP_CHANCE.getOrDefault(rarity, Map.of()).forEach((finish, chance) -> row.put(finish.name(), chance));
            finishPerCard.put(rarity.name(), row);
        }
        odds.put("finishPerCard", finishPerCard);
        odds.put("cardsPerPack", 5);
        out.put("odds", odds);
        // The ×10 price the server will actually charge, so a client never
        // re-derives the bulk discount and drifts from it.
        Map<String, Object> bulk = new LinkedHashMap<>();
        bulk.put("count", PlayerProgressionService.MAX_BULK_PACK_COUNT);
        bulk.put("price", PlayerProgressionService.bulkPackCost(pack.price(), PlayerProgressionService.MAX_BULK_PACK_COUNT));
        out.put("bulk", bulk);
        return out;
    }

    public Map<String, Object> serializeDailyOffer(DailyCardOffer offer) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", offer.id());
        out.put("availableOn", offer.availableOn());
        out.put("slot", offer.slot());
        out.put("price", offer.price());
        Card card = offer.card();
        out.put("cardId", card.getId());
        out.put("cardName", card.getName());
        out.put("type", card.getCardType().name());
        out.put("element", elementName(card.getElement()));
        out.put("rarity", card.getRarity().name());
        appendCardArt(out, card);
        if (card instanceof TrainerCard trainer) {
            out.put("tier", trainer.getTier());
            out.put("oncePerGame", trainer.isOncePerGame());
            if (trainer.getAbility() != null) {
                out.put("passive", trainer.getAbility().getDescription());
            }
            if (trainer.getActiveAbility() != null) {
                out.put("active", trainer.getActiveAbility().getDescription());
            }
        }
        if (card.getDescription() != null && !card.getDescription().isBlank()) {
            out.put("description", card.getDescription());
        }
        return out;
    }

    private void appendCardArt(Map<String, Object> target, Card card) {
        if (card.getCardArtUrl() != null && !card.getCardArtUrl().isBlank()) {
            target.put("cardArtUrl", card.getCardArtUrl());
            if (card.getCardArtMode() != null && !card.getCardArtMode().isBlank()) {
                target.put("cardArtMode", card.getCardArtMode());
            }
            if (card.getCardArtOffsetX() != null) {
                target.put("cardArtOffsetX", card.getCardArtOffsetX());
            }
            if (card.getCardArtOffsetY() != null) {
                target.put("cardArtOffsetY", card.getCardArtOffsetY());
            }
            if (card.getCardArtOffsetXPct() != null) {
                target.put("cardArtOffsetXPct", card.getCardArtOffsetXPct());
            }
            if (card.getCardArtOffsetYPct() != null) {
                target.put("cardArtOffsetYPct", card.getCardArtOffsetYPct());
            }
            if (card.getCardArtScale() != null) {
                target.put("cardArtScale", card.getCardArtScale());
            }
            if (card.getCardArtRotation() != null) {
                target.put("cardArtRotation", card.getCardArtRotation());
            }
        }
        if (card instanceof TrainerCard knight && knight.getCardTemplate() != null) {
            target.put("cardTemplate", knight.getCardTemplate());
        }
        if (card.getHolographicCardArtUrl() != null && !card.getHolographicCardArtUrl().isBlank()) {
            target.put("holographicCardArtUrl", card.getHolographicCardArtUrl());
            if (card.getHolographicCardArtScale() != null) {
                target.put("holographicCardArtScale", card.getHolographicCardArtScale());
            }
            if (card.getHolographicCardArtMode() != null) {
                target.put("holographicCardArtMode", card.getHolographicCardArtMode());
            }
            if (card.getHolographicCardArtOffsetXPct() != null) {
                target.put("holographicCardArtOffsetXPct", card.getHolographicCardArtOffsetXPct());
            }
            if (card.getHolographicCardArtOffsetYPct() != null) {
                target.put("holographicCardArtOffsetYPct", card.getHolographicCardArtOffsetYPct());
            }
            if (card.getHolographicCardArtRotation() != null) {
                target.put("holographicCardArtRotation", card.getHolographicCardArtRotation());
            }
        }
        if (card.isHolographic()) {
            target.put("holographic", true);
        }
    }

    private List<Card> selectRandom(List<Card> pool, CardType type, int limit) {
        return selectRandom(pool.stream()
                .filter(card -> card.getCardType() == type)
                .toList(), limit);
    }

    private List<Card> selectRandom(List<Card> pool, int limit) {
        if (pool.isEmpty()) {
            return List.of();
        }
        List<Card> shuffled = new ArrayList<>(pool);
        Collections.shuffle(shuffled);
        return shuffled.stream().limit(limit).toList();
    }

    private List<Card> randomElementPool(List<Card> pool, CardType type) {
        List<Element> elements = pool.stream()
                .filter(card -> card.getCardType() == type)
                .map(Card::getElement)
                .distinct()
                .toList();
        if (elements.size() <= 1) {
            return pool;
        }
        List<Element> shuffled = new ArrayList<>(elements);
        Collections.shuffle(shuffled);
        int count = Math.min(shuffled.size(), 2 + new Random().nextInt(Math.min(2, shuffled.size() - 1) + 1));
        Set<Element> selected = shuffled.stream().limit(count).collect(Collectors.toSet());
        return pool.stream()
                .filter(card -> selected.contains(card.getElement()))
                .toList();
    }

    private Optional<CardType> focusedType(String packId) {
        return packId.startsWith(SIEGELING_SUMMON_PREFIX) ? Optional.of(CardType.SIEGLING) : Optional.empty();
    }

    private List<Element> activeGameplayElements() {
        return LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER.stream()
                .filter(element -> cardDefinitionService.getActiveLiveElementNames().contains(element.name()))
                .toList();
    }

    private int priceFor(Card card) {
        if (shopPriceCatalogService != null) {
            return shopPriceCatalogService.priceFor(card.getRarity(), card.getCardType());
        }
        // No override service wired (e.g. plain unit tests) — fall back to the default table.
        return ShopPriceCatalogService.defaultPriceFor(card.getRarity(), card.getCardType());
    }

    private Comparator<Card> cardSort() {
        return Comparator
                .comparing((Card card) -> elementName(card.getElement()), Comparator.nullsLast(String::compareTo))
                .thenComparing(card -> card.getRarity().ordinal())
                .thenComparing(Card::getName)
                .thenComparing(Card::getId);
    }

    private String elementName(Element element) {
        return element == null ? null : element.name();
    }

    private String formatElement(Element element) {
        String lower = element.name().toLowerCase(Locale.ROOT);
        return lower.substring(0, 1).toUpperCase(Locale.ROOT) + lower.substring(1);
    }
}
