package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PackCatalogService {
    public record PackDefinition(
            String id,
            String name,
            String description,
            boolean active,
            int price,
            List<Element> elements,
            boolean starterEligible
    ) {}

    public record PackOpenResult(PackDefinition pack, List<Card> cards) {}

    @Autowired
    private CardDefinitionService cardDefinitionService;

    public List<PackDefinition> listPacks() {
        List<PackDefinition> packs = new ArrayList<>();
        for (Element element : LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER) {
            packs.add(new PackDefinition(
                    "pack_" + element.name().toLowerCase(Locale.ROOT),
                    formatElement(element) + " Starter Pack",
                    "Five " + formatElement(element) + " cards: 2-3 Siegelings, 1-2 traps, and 1-2 spells.",
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

        List<Card> pool = cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(card -> pack.elements().contains(card.getElement()))
                .toList();
        List<Card> sieglings = select(pool, CardType.SIEGLING, 3);
        List<Card> traps = select(pool, CardType.TRAP, 1);
        List<Card> spells = select(pool, CardType.SPELL, 1);
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
            List<Card> filler = pool.stream()
                    .filter(card -> cards.stream().noneMatch(existing -> existing.getId().equals(card.getId())))
                    .sorted(cardSort())
                    .toList();
            if (filler.isEmpty()) {
                throw new IllegalArgumentException("This pack cannot produce five unique cards from the current live pool.");
            }
            cards.add(filler.get(0));
        }
        return new PackOpenResult(pack, cards);
    }

    public List<Map<String, Object>> serializePacks() {
        return listPacks().stream().map(this::serializePack).toList();
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
        return out;
    }

    private List<Card> select(List<Card> pool, CardType type, int limit) {
        Set<String> seen = pool.stream().map(Card::getId).collect(Collectors.toSet());
        if (seen.isEmpty()) {
            return List.of();
        }
        return pool.stream()
                .filter(card -> card.getCardType() == type)
                .sorted(cardSort())
                .limit(limit)
                .toList();
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
