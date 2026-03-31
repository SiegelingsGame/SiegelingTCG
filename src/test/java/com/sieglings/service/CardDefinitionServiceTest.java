package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CardDefinitionServiceTest {

    private final CardDefinitionService cardDefinitions = new CardDefinitionService();

    @Test
    void everyPresetDeckUsesBalancedPresetComposition() {
        Map<String, SieglingCard> sieglingsById = cardDefinitions.getDeckBuilderCatalog().stream()
                .filter(SieglingCard.class::isInstance)
                .map(SieglingCard.class::cast)
                .collect(Collectors.toMap(Card::getId, card -> card, (left, right) -> left, LinkedHashMap::new));
        Map<String, Set<String>> lineIdsByRoot = buildLineIdsByRoot(sieglingsById);

        for (CardDefinitionService.DeckOption option : cardDefinitions.getDeckOptions()) {
            List<Card> deck = cardDefinitions.buildDeckById(option.id());
            Map<String, Long> countsById = deck.stream()
                    .collect(Collectors.groupingBy(Card::getId, LinkedHashMap::new, Collectors.counting()));

            assertEquals(40, deck.size(), option.name() + " should contain exactly 40 cards.");
            assertEquals(20, deck.stream().filter(SieglingCard.class::isInstance).count(),
                    option.name() + " should contain exactly 20 Sieglings.");
            assertEquals(10, deck.stream().filter(SpellCard.class::isInstance).count(),
                    option.name() + " should contain exactly 10 spells.");
            assertEquals(10, deck.stream().filter(TrapCard.class::isInstance).count(),
                    option.name() + " should contain exactly 10 traps.");

            countsById.forEach((cardId, count) ->
                    assertTrue(count <= cardDefinitions.getDeckBuilderMaxCopies(),
                            option.name() + " should not include more than 3 copies of " + cardId + "."));

            Map<String, Long> sieglingCounts = deck.stream()
                    .filter(SieglingCard.class::isInstance)
                    .map(SieglingCard.class::cast)
                    .collect(Collectors.groupingBy(card -> resolveLineRoot(card, sieglingsById), Collectors.counting()));

            for (Map.Entry<String, Long> entry : sieglingCounts.entrySet()) {
                Set<String> expectedLineIds = lineIdsByRoot.get(entry.getKey());
                List<String> missingIds = expectedLineIds.stream()
                        .filter(cardId -> !countsById.containsKey(cardId))
                        .sorted()
                        .toList();
                assertTrue(missingIds.isEmpty(),
                        option.name() + " should include the full evolution tree for line " + entry.getKey()
                                + " but is missing " + missingIds + ".");
            }
        }
    }

    private Map<String, Set<String>> buildLineIdsByRoot(Map<String, SieglingCard> sieglingsById) {
        Map<String, List<SieglingCard>> byRoot = new HashMap<>();
        for (SieglingCard card : sieglingsById.values()) {
            byRoot.computeIfAbsent(resolveLineRoot(card, sieglingsById), ignored -> new ArrayList<>()).add(card);
        }

        return byRoot.entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        entry -> entry.getValue().stream()
                                .sorted(Comparator.comparing(Card::getId))
                                .map(Card::getId)
                                .collect(Collectors.toCollection(java.util.LinkedHashSet::new))
                ));
    }

    private String resolveLineRoot(SieglingCard card, Map<String, SieglingCard> sieglingsById) {
        SieglingCard current = card;
        while (current.getEvolvesFromId() != null && sieglingsById.containsKey(current.getEvolvesFromId())) {
            current = sieglingsById.get(current.getEvolvesFromId());
        }
        return current.getId();
    }
}
