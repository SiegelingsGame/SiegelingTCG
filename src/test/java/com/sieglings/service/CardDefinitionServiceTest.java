package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertIterableEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CardDefinitionServiceTest {

    private final CardDefinitionService cardDefinitions = new CardDefinitionService();

    @Test
    void deckOptionsLeadWithTheMainFourElements() {
        List<CardDefinitionService.DeckOption> options = cardDefinitions.getDeckOptions();
        List<Element> leadingSingletons = options.stream()
                .filter(option -> option.elements().size() == 1)
                .map(option -> option.elements().get(0))
                .distinct()
                .toList();

        assertEquals(
                List.of(Element.FIRE, Element.ICE, Element.EARTH, Element.WIND),
                leadingSingletons.subList(0, 4),
                "Fire, Ice, Earth, and Wind singleton decks must lead the list."
        );
        assertTrue(
                options.stream().limit(4).allMatch(option -> option.elements().size() == 1
                        && PlayerProgressionService.FREE_DECK_ELEMENTS.contains(option.elements().get(0))),
                "The first four options should be the free main-four singletons, not mixed Fire decks."
        );
        List<Element> leadingElements = options.stream()
                .map(option -> option.elements().get(0))
                .distinct()
                .toList();
        assertIterableEquals(
                LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER.stream()
                        .filter(leadingElements::contains)
                        .toList(),
                leadingElements,
                "Deck order follows the canonical roster order among leading elements."
        );
    }

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

    @Test
    void inactivePresetDecksAreHiddenAndDefaultFallsBackToFirstActiveDeck() {
        CardDefinitionService service = serviceWithPresetDecks(List.of(
                new PresetDeckCatalogService.PresetDeckDefinition(
                        "deck_fire_earth",
                        "Ashen Roots",
                        "Disabled default deck.",
                        List.of(Element.FIRE, Element.EARTH),
                        "trainer05",
                        false,
                        List.of()
                ),
                new PresetDeckCatalogService.PresetDeckDefinition(
                        "custom_active",
                        "Active Custom",
                        "Shown in game options.",
                        List.of(Element.WATER),
                        "trainer04",
                        true,
                        List.of()
                )
        ));

        List<CardDefinitionService.DeckOption> deckOptions = service.getDeckOptions();

        assertEquals(List.of("custom_active"), deckOptions.stream().map(CardDefinitionService.DeckOption::id).toList());
        assertEquals("custom_active", service.getDefaultDeckOption().orElseThrow().id());
    }

    @Test
    void explicitPresetDeckCardListsBuildExactDeckContents() {
        List<String> seedIds = cardDefinitions.getDeckBuilderCatalog().stream()
                .limit(10)
                .map(Card::getId)
                .toList();
        List<String> explicitDeck = new ArrayList<>();
        for (String cardId : seedIds) {
            explicitDeck.add(cardId);
            explicitDeck.add(cardId);
            explicitDeck.add(cardId);
        }

        CardDefinitionService service = serviceWithPresetDecks(List.of(
                new PresetDeckCatalogService.PresetDeckDefinition(
                        "exact_list",
                        "Exact List",
                        "Uses explicit cards.",
                        List.of(Element.EARTH),
                        "trainer05",
                        true,
                        explicitDeck
                )
        ));

        List<Card> builtDeck = service.buildDeckById("exact_list");

        assertEquals(30, builtDeck.size());
        assertIterableEquals(explicitDeck, builtDeck.stream().map(Card::getId).toList());
    }

    @Test
    void liveElementRosterHidesDecksAndCatalogEntriesForInactiveElements() {
        CardDefinitionService service = serviceWithLiveElements(Set.of(Element.FIRE, Element.EARTH, Element.WATER, Element.WIND));
        assertTrue(service.getDeckOptions().stream().noneMatch(deck -> deck.id().equals("deck_ice")));
        assertTrue(service.getActiveLiveElementNames().containsAll(List.of("FIRE", "WATER")));
        assertTrue(service.getActiveLiveElementNames().stream().noneMatch(name -> name.equals("ICE")));
        assertTrue(service.getDeckBuilderCatalog().stream().noneMatch(card -> card.getElement() == Element.ICE));
    }

    @Test
    void inactiveTrainerDefinitionsAreHiddenFromTrainerOptionsButStillResolvableById() {
        CardDefinitionService service = serviceWithTrainerDefinitions(List.of(
                new TrainerCatalogService.TrainerDefinition(
                        "trainer_active",
                        "Active Marshal",
                        Element.FIRE,
                        Rarity.RARE,
                        "SiegeKnight",
                        true,
                        false,
                        new ManualSieglingCatalog.ManualAbilityDefinition(
                                "Battle Orders",
                                "All Fire allies gain +1 attack damage",
                                TargetType.PASSIVE,
                                null,
                                0,
                                "damage_boost",
                                1,
                                true,
                                null,
                                0,
                                null
                        ),
                        new ManualSieglingCatalog.ManualAbilityDefinition(
                                "Flare Call",
                                "Deal 3 damage to 1 enemy",
                                TargetType.SINGLE_ENEMY,
                                null,
                                1,
                                "damage",
                                3,
                                false,
                                Element.FIRE,
                                1,
                                null
                        )
                ),
                new TrainerCatalogService.TrainerDefinition(
                        "trainer_inactive",
                        "Retired Marshal",
                        Element.WATER,
                        Rarity.RARE,
                        "SiegeKnight",
                        false,
                        false,
                        new ManualSieglingCatalog.ManualAbilityDefinition(
                                "Old Guard",
                                "All Water allies gain +1 max Health",
                                TargetType.PASSIVE,
                                null,
                                0,
                                "health_boost",
                                1,
                                true,
                                null,
                                0,
                                null
                        ),
                        new ManualSieglingCatalog.ManualAbilityDefinition(
                                "Tidal Seal",
                                "Freeze 1 enemy",
                                TargetType.SINGLE_ENEMY,
                                null,
                                1,
                                "freeze",
                                1,
                                false,
                                Element.WATER,
                                1,
                                null
                        )
                )
        ));

        List<String> trainerOptionIds = service.getTrainerOptions().stream().map(Card::getId).toList();
        assertEquals(List.of("trainer_active", "squire-bob", "pyla", "ser-airek"), trainerOptionIds);
        assertEquals("Retired Marshal", service.getTrainerById("trainer_inactive").getName());
        assertEquals(true, service.hasTrainer("trainer_inactive"));
        assertEquals(false, service.isTrainerActive("trainer_inactive"));
    }

    @Test
    void customDeckResolvesEditorCopySuffixesOnCardIds() {
        List<String> seedIds = cardDefinitions.getDeckBuilderCatalog().stream()
                .map(Card::getId)
                .filter(id -> !"trap03".equals(id))
                .limit(9)
                .toList();
        assertEquals(9, seedIds.size(), "Need 9 catalog cards other than trap03 for a 30-card deck.");

        List<String> deck = new ArrayList<>();
        for (String id : seedIds) {
            deck.add(id);
            deck.add(id);
            deck.add(id);
        }
        deck.add("trap03");
        deck.add("trap03-copy");
        deck.add("trap03-copy-copy");

        List<Card> built = cardDefinitions.buildCustomDeck(deck);
        assertEquals(30, built.size());
        assertEquals(3, built.stream().filter(c -> "trap03".equals(c.getId())).count());
    }

    @Test
    void customDeckRejectsUnknownIdsAfterCopySuffixStripping() {
        List<String> seedIds = cardDefinitions.getDeckBuilderCatalog().stream()
                .map(Card::getId)
                .limit(10)
                .toList();
        List<String> deck = new ArrayList<>();
        for (String cardId : seedIds) {
            deck.add(cardId);
            deck.add(cardId);
            deck.add(cardId);
        }
        deck.set(deck.size() - 1, "not-a-real-card-copy");

        assertThrows(IllegalArgumentException.class, () -> cardDefinitions.buildCustomDeck(deck));
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

    private CardDefinitionService serviceWithPresetDecks(List<PresetDeckCatalogService.PresetDeckDefinition> definitions) {
        CardDefinitionService service = new CardDefinitionService();
        PresetDeckCatalogService presetDeckCatalogService = new PresetDeckCatalogService(
                new ObjectMapper(),
                new CardOverrideStorageService(new ObjectMapper(), false, "", "", "(default)", "appConfig", "cardOverrides"),
                "appConfig",
                "presetDecks"
        ) {
            @Override
            public List<PresetDeckDefinition> loadDefinitionsForGame() {
                return definitions;
            }
        };

        try {
            Field field = CardDefinitionService.class.getDeclaredField("presetDeckCatalogService");
            field.setAccessible(true);
            field.set(service, presetDeckCatalogService);
            return service;
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException("Unable to inject preset deck catalog service for test setup.", ex);
        }
    }

    private CardDefinitionService serviceWithLiveElements(Set<Element> active) {
        CardDefinitionService service = new CardDefinitionService();
        CardOverrideStorageService storage = new CardOverrideStorageService(
                new ObjectMapper(),
                false,
                "",
                "",
                "(default)",
                "appConfig",
                "cardOverrides"
        );
        LiveElementCatalogService liveCatalog = new LiveElementCatalogService(
                new ObjectMapper(),
                storage,
                "appConfig",
                "liveElements"
        ) {
            @Override
            public Set<Element> loadActiveElementsForGame() {
                return new LinkedHashSet<>(active);
            }
        };
        try {
            Field field = CardDefinitionService.class.getDeclaredField("liveElementCatalogService");
            field.setAccessible(true);
            field.set(service, liveCatalog);
            return service;
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException("Unable to inject live element catalog for test setup.", ex);
        }
    }

    private CardDefinitionService serviceWithTrainerDefinitions(List<TrainerCatalogService.TrainerDefinition> definitions) {
        CardDefinitionService service = new CardDefinitionService();
        TrainerCatalogService trainerCatalogService = new TrainerCatalogService(
                new ObjectMapper(),
                new CardOverrideStorageService(new ObjectMapper(), false, "", "", "(default)", "appConfig", "cardOverrides"),
                "appConfig",
                "trainerCards"
        ) {
            @Override
            public List<TrainerDefinition> loadDefinitionsForGame() {
                return definitions;
            }
        };

        try {
            Field field = CardDefinitionService.class.getDeclaredField("trainerCatalogService");
            field.setAccessible(true);
            field.set(service, trainerCatalogService);
            return service;
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException("Unable to inject trainer catalog service for test setup.", ex);
        }
    }
}
