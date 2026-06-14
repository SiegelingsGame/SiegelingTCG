package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.TrainerCard;
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
     * Chance for each pulled card to drop with a holographic finish. Higher
     * rarities are rarer as holos, so the shiniest pulls stay special.
     */
    public static final Map<Rarity, Double> HOLO_DROP_CHANCE = new EnumMap<>(Map.of(
            Rarity.COMMON, 0.08,
            Rarity.UNCOMMON, 0.06,
            Rarity.RARE, 0.04,
            Rarity.EPIC, 0.02,
            Rarity.LEGENDARY, 0.01
    ));
    /** Dedicated, expensive pack that always contains a SiegeKnight. */
    public static final String SIEGEKNIGHT_PACK_ID = "pack_siegeknight";

    public record PackDefinition(
            String id,
            String name,
            String description,
            boolean active,
            int price,
            List<Element> elements,
            boolean starterEligible
    ) {}

    public record PackOpenResult(PackDefinition pack, List<Card> cards, TrainerCard bonusTrainer, List<String> holoCardIds) {
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

    @Autowired
    private CardDefinitionService cardDefinitionService;

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
        packs.add(new PackDefinition("pack_siegeling_random", "Siegeling Pack",
                "Five random Siegeling cards from a changing elemental mix.", true, 160,
                activeElements, false));
        packs.add(new PackDefinition("pack_spell_random", "Strategy Pack",
                "Five random Strategy cards from a changing elemental mix.", true, 120,
                activeElements, false));
        packs.add(new PackDefinition("pack_trap_random", "Deception Pack",
                "Five random Deception cards from a changing elemental mix.", true, 120,
                activeElements, false));
        packs.add(new PackDefinition(SIEGEKNIGHT_PACK_ID, "SiegeKnight Cache",
                "A premium cache that always contains a rare SiegeKnight plus five cards. Duplicates level up your knight.",
                true, 1200, activeElements, false));
        return packs.stream()
                .filter(pack -> pack.elements().stream().map(Enum::name).allMatch(cardDefinitionService.getActiveLiveElementNames()::contains))
                .toList();
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
            return new PackOpenResult(pack, cards, rollBonusTrainer(pack), rollHolographicDrops(cards));
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
        return new PackOpenResult(pack, cards, rollBonusTrainer(pack), rollHolographicDrops(cards));
    }

    /**
     * Rolls a SiegeKnight to include with a pack. The dedicated SiegeKnight Cache always yields one;
     * other packs only yield one rarely ({@link #TRAINER_DROP_CHANCE}). Returns null when no knight drops.
     */
    private TrainerCard rollBonusTrainer(PackDefinition pack) {
        boolean guaranteed = SIEGEKNIGHT_PACK_ID.equals(pack.id());
        Random random = new Random();
        if (!guaranteed && random.nextDouble() >= TRAINER_DROP_CHANCE) {
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

    /** Rolls each pulled card against its rarity's holo chance. */
    private List<String> rollHolographicDrops(List<Card> cards) {
        Random random = new Random();
        List<String> holo = new ArrayList<>();
        for (Card card : cards) {
            if (card.isHolographic()) {
                continue;
            }
            double chance = HOLO_DROP_CHANCE.getOrDefault(card.getRarity(), 0.0);
            if (random.nextDouble() < chance) {
                holo.add(card.getId());
            }
        }
        return holo;
    }

    public List<Map<String, Object>> serializePacks() {
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
        // Guarantee one of every card type, then a fifth slot of a random type
        // (stable for the day) so the rotation always covers the full roster.
        CardType[] everyType = { CardType.TRAINER, CardType.SIEGLING, CardType.SPELL, CardType.TRAP };
        List<CardType> slots = new ArrayList<>(List.of(everyType));
        slots.add(everyType[Math.floorMod((date + ":extra").hashCode(), everyType.length)]);
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
        odds.put("siegeKnight", SIEGEKNIGHT_PACK_ID.equals(pack.id()) ? 1.0 : TRAINER_DROP_CHANCE);
        Map<String, Double> holoPerCard = new LinkedHashMap<>();
        for (Rarity rarity : Rarity.values()) {
            holoPerCard.put(rarity.name(), HOLO_DROP_CHANCE.getOrDefault(rarity, 0.0));
        }
        odds.put("holoPerCard", holoPerCard);
        odds.put("cardsPerPack", 5);
        out.put("odds", odds);
        return out;
    }

    public Map<String, Object> serializeDailyOffer(DailyCardOffer offer) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", offer.id());
        out.put("availableOn", offer.availableOn());
        out.put("slot", offer.slot());
        out.put("price", offer.price());
        out.put("cardId", offer.card().getId());
        out.put("cardName", offer.card().getName());
        out.put("type", offer.card().getCardType().name());
        out.put("element", offer.card().getElement().name());
        out.put("rarity", offer.card().getRarity().name());
        return out;
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
        return switch (packId) {
            case "pack_siegeling_random" -> Optional.of(CardType.SIEGLING);
            case "pack_spell_random" -> Optional.of(CardType.SPELL);
            case "pack_trap_random" -> Optional.of(CardType.TRAP);
            default -> Optional.empty();
        };
    }

    private List<Element> activeGameplayElements() {
        return LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER.stream()
                .filter(element -> cardDefinitionService.getActiveLiveElementNames().contains(element.name()))
                .toList();
    }

    private int priceFor(Card card) {
        return switch (card.getRarity()) {
            case COMMON -> 60;
            case UNCOMMON -> 95;
            case RARE -> 140;
            case EPIC -> 210;
            case LEGENDARY -> 320;
        };
    }

    private Comparator<Card> cardSort() {
        return Comparator
                .comparing((Card card) -> card.getElement().name())
                .thenComparing(card -> card.getRarity().ordinal())
                .thenComparing(Card::getName)
                .thenComparing(Card::getId);
    }

    private String formatElement(Element element) {
        String lower = element.name().toLowerCase(Locale.ROOT);
        return lower.substring(0, 1).toUpperCase(Locale.ROOT) + lower.substring(1);
    }
}
