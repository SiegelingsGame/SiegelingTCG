package com.sieglings.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.Notch;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

final class ManualSieglingCatalog {

    static final String RESOURCE_PATH = "cards/siegling-overrides.json";
    private static final Path PROJECT_RESOURCE_PATH = Path.of("src", "main", "resources", "cards", "siegling-overrides.json");

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private ManualSieglingCatalog() {}

    static List<SieglingCard> applyOverrides(Element element, List<SieglingCard> generatedCards) {
        return applyOverrides(element, generatedCards, loadDefinitions(), new MovesPoolService(OBJECT_MAPPER, null));
    }

    static List<SieglingCard> applyOverrides(Element element, List<SieglingCard> generatedCards, MovesPoolService movesPool) {
        return applyOverrides(element, generatedCards, loadDefinitions(), movesPool);
    }

    static List<SpellCard> applySpellOverrides(List<SpellCard> generatedCards) {
        return applySpellOverrides(generatedCards, loadDefinitions());
    }

    static List<TrapCard> applyTrapOverrides(List<TrapCard> generatedCards) {
        return applyTrapOverrides(generatedCards, loadDefinitions());
    }

    static OverrideFile buildOverrideFile(List<? extends Card> cards) {
        return new OverrideFile(cards.stream()
                .map(ManualSieglingCatalog::toDefinition)
                .toList(), List.of());
    }

    static List<SieglingCard> applyOverrides(Element element, List<SieglingCard> generatedCards,
                                             List<ManualSieglingDefinition> definitions) {
        return applyOverrides(element, generatedCards, definitions, new MovesPoolService(OBJECT_MAPPER, null));
    }

    static List<SieglingCard> applyOverrides(Element element, List<SieglingCard> generatedCards,
                                             List<ManualSieglingDefinition> definitions,
                                             MovesPoolService movesPool) {
        Objects.requireNonNull(movesPool, "movesPool");
        Map<String, SieglingCard> cardsById = generatedCards.stream()
                .map(ManualSieglingCatalog::copyCard)
                .collect(Collectors.toMap(
                        SieglingCard::getId,
                        card -> card,
                        (left, right) -> right,
                        LinkedHashMap::new
                ));

        for (ManualSieglingDefinition definition : definitions) {
            if (definitionType(definition) != CardType.SIEGLING) {
                continue;
            }
            String id = normalizeId(definition.id());
            if (id == null) {
                throw new IllegalStateException("Manual Siegling definitions require a non-blank id.");
            }

            SieglingCard generated = cardsById.get(id);
            boolean touchesExistingCard = generated != null;
            boolean targetsThisElement = definition.element() == element;
            if (!touchesExistingCard && !targetsThisElement) {
                continue;
            }

            SieglingCard merged = mergeDefinition(generated, id, definition, movesPool);
            if (merged.getElement() == element) {
                cardsById.put(id, merged);
            } else {
                cardsById.remove(id);
            }
        }

        resolveEvolutionNames(cardsById, definitions);

        for (SieglingCard card : cardsById.values()) {
            movesPool.hydrateGeneratedCard(card);
        }

        return cardsById.values().stream()
                .sorted(Comparator
                        .comparing(SieglingCard::getRarity, ManualSieglingCatalog::compareRarity)
                .thenComparing(SieglingCard::getName))
                .toList();
    }

    static List<SpellCard> applySpellOverrides(List<SpellCard> generatedCards,
                                               List<ManualSieglingDefinition> definitions) {
        Map<String, SpellCard> cardsById = generatedCards.stream()
                .map(SpellCard::copy)
                .collect(Collectors.toMap(
                        SpellCard::getId,
                        card -> card,
                        (left, right) -> right,
                        LinkedHashMap::new
                ));

        for (ManualSieglingDefinition definition : definitions) {
            if (definitionType(definition) != CardType.SPELL) {
                continue;
            }
            String id = normalizeId(definition.id());
            requireField(id != null, "<unknown>", "id");
            SpellCard merged = mergeSpellDefinition(cardsById.get(id), id, definition);
            cardsById.put(id, merged);
        }

        return cardsById.values().stream()
                .sorted(Comparator
                        .comparing(SpellCard::getElement)
                        .thenComparing(SpellCard::getRarity, ManualSieglingCatalog::compareRarity)
                        .thenComparing(SpellCard::getName))
                .toList();
    }

    static List<TrapCard> applyTrapOverrides(List<TrapCard> generatedCards,
                                             List<ManualSieglingDefinition> definitions) {
        Map<String, TrapCard> cardsById = generatedCards.stream()
                .map(TrapCard::copy)
                .collect(Collectors.toMap(
                        TrapCard::getId,
                        card -> card,
                        (left, right) -> right,
                        LinkedHashMap::new
                ));

        for (ManualSieglingDefinition definition : definitions) {
            if (definitionType(definition) != CardType.TRAP) {
                continue;
            }
            String id = normalizeId(definition.id());
            requireField(id != null, "<unknown>", "id");
            TrapCard merged = mergeTrapDefinition(cardsById.get(id), id, definition);
            cardsById.put(id, merged);
        }

        return cardsById.values().stream()
                .sorted(Comparator
                        .comparing(TrapCard::getElement)
                        .thenComparing(TrapCard::getRarity, ManualSieglingCatalog::compareRarity)
                        .thenComparing(TrapCard::getName))
                .toList();
    }

    private static SieglingCard mergeDefinition(SieglingCard baseCard, String id, ManualSieglingDefinition definition,
                                                MovesPoolService movesPool) {
        SieglingCard card = baseCard == null ? new SieglingCard() : copyCard(baseCard);

        if (baseCard == null) {
            requireField(hasText(definition.name()), id, "name");
            requireField(definition.element() != null, id, "element");
            requireField(definition.rarity() != null, id, "rarity");
            requireField(definition.health() != null, id, "health");
            requireField(definition.speed() != null, id, "speed");
        }

        card.setId(id);
        if (hasText(definition.name())) {
            card.setName(definition.name().trim());
        }
        if (definition.element() != null) {
            card.setElement(definition.element());
        }
        if (definition.rarity() != null) {
            card.setRarity(definition.rarity());
        }
        if (definition.health() != null) {
            card.setHealth(definition.health());
        }
        if (definition.speed() != null) {
            card.setSpeed(definition.speed());
        }
        if (definition.preferredRow() != null) {
            card.setPreferredRow(definition.preferredRow());
        }
        if (definition.notches() != null) {
            card.setNotches(definition.notches().stream()
                    .map(ManualSieglingCatalog::toNotch)
                    .toList());
        }
        applySieglingMoveDefinition(card, id, definition, movesPool);
        if (definition.costAmount() != null) {
            if (definition.costAmount() <= 0) {
                card.setCostAmount(0);
                card.setCostElement(null);
            } else {
                Element costElement = definition.costElement() != null ? definition.costElement() : card.getCostElement();
                requireField(costElement != null, id, "costElement");
                card.setCostElement(costElement);
                card.setCostAmount(definition.costAmount());
            }
        } else if (definition.costElement() != null && card.getCostAmount() > 0) {
            card.setCostElement(definition.costElement());
        }

        if (definition.evolvesFromId() != null) {
            card.setEvolvesFromId(normalizeId(definition.evolvesFromId()));
        }
        if (definition.evolvesFromName() != null) {
            card.setEvolvesFromName(normalizeBlank(definition.evolvesFromName()));
        }

        return card;
    }

    private static void applySieglingMoveDefinition(SieglingCard card, String id,
                                                    ManualSieglingDefinition definition,
                                                    MovesPoolService movesPool) {
        if (definition.moveIds() != null) {
            card.setMoveIds(definition.moveIds());
            card.setAbility(null);
            return;
        }
        if (definition.abilities() != null) {
            if (definition.abilities().isEmpty()) {
                card.setMoveIds(List.of());
                card.setAbility(null);
                return;
            }
            List<String> ids = new ArrayList<>();
            List<ManualAbilityDefinition> abs = definition.abilities();
            for (int i = 0; i < abs.size(); i++) {
                String mid = "legacy:" + id + ":" + i;
                movesPool.registerLegacyManualMove(mid, abs.get(i), card.getElement());
                ids.add(mid);
            }
            card.setMoveIds(ids);
            card.setAbility(null);
            return;
        }
        if (definition.ability() != null) {
            String mid = "legacy:" + id + ":0";
            movesPool.registerLegacyManualMove(mid, definition.ability(), card.getElement());
            card.setMoveIds(List.of(mid));
            card.setAbility(null);
        }
    }

    private static SpellCard mergeSpellDefinition(SpellCard baseCard, String id, ManualSieglingDefinition definition) {
        SpellCard card = baseCard == null ? new SpellCard() : baseCard.copy();

        if (baseCard == null) {
            requireField(hasText(definition.name()), id, "name");
            requireField(definition.element() != null, id, "element");
            requireField(definition.rarity() != null, id, "rarity");
        }

        card.setId(id);
        if (hasText(definition.name())) {
            card.setName(definition.name().trim());
        }
        if (definition.element() != null) {
            card.setElement(definition.element());
        }
        if (definition.rarity() != null) {
            card.setRarity(definition.rarity());
        }

        applyStandardCost(card, id, definition.costElement(), definition.costAmount());
        if (definition.requiredReaction() != null) {
            card.setRequiredReaction(definition.requiredReaction());
        }
        if (definition.requiredComboSize() != null) {
            card.setRequiredComboSize(definition.requiredComboSize());
            if (definition.requiredComboSize() <= 0) {
                card.setRequiredComboSignature(null);
            }
        }
        if (definition.requiredComboSignature() != null) {
            card.setRequiredComboSignature(normalizeBlank(definition.requiredComboSignature()));
        }

        ManualAbilityDefinition abilityDefinition = primaryAbilityDefinition(definition);
        if (abilityDefinition != null) {
            card.setAbility(mergeAbility(card.getAbility(), abilityDefinition));
        }

        return card;
    }

    private static TrapCard mergeTrapDefinition(TrapCard baseCard, String id, ManualSieglingDefinition definition) {
        TrapCard card = baseCard == null ? new TrapCard() : baseCard.copy();

        if (baseCard == null) {
            requireField(hasText(definition.name()), id, "name");
            requireField(definition.element() != null, id, "element");
            requireField(definition.rarity() != null, id, "rarity");
        }

        card.setId(id);
        if (hasText(definition.name())) {
            card.setName(definition.name().trim());
        }
        if (definition.element() != null) {
            card.setElement(definition.element());
        }
        if (definition.rarity() != null) {
            card.setRarity(definition.rarity());
        }

        Element triggerElement = definition.trapBucketElement() != null
                ? definition.trapBucketElement()
                : definition.costElement();
        Integer triggerAmount = definition.trapBucketAmount() != null
                ? definition.trapBucketAmount()
                : definition.costAmount();
        applyStandardCost(card, id, triggerElement, triggerAmount);

        ManualAbilityDefinition abilityDefinition = primaryAbilityDefinition(definition);
        if (abilityDefinition != null) {
            card.setAbility(mergeAbility(card.getAbility(), abilityDefinition));
        }

        return card;
    }

    private static Ability mergeAbility(Ability baseAbility, ManualAbilityDefinition definition) {
        Ability ability = baseAbility == null ? new Ability() : baseAbility.copy();

        if (definition.name() != null) {
            ability.setName(definition.name());
        }
        if (definition.description() != null) {
            ability.setDescription(definition.description());
        }
        if (definition.targetType() != null) {
            ability.setTargetType(definition.targetType());
        }
        if (definition.targetRow() != null) {
            ability.setTargetRow(definition.targetRow());
        }
        if (definition.targetCount() != null) {
            ability.setTargetCount(definition.targetCount());
        }
        if (definition.effectType() != null) {
            ability.setEffectType(normalizeEffectKey(definition.effectType()));
        }
        if (definition.effectValue() != null) {
            ability.setEffectValue(definition.effectValue());
        }
        if (definition.passive() != null) {
            ability.setPassive(definition.passive());
        }
        if (definition.requiredElement() != null) {
            ability.setRequiredElement(definition.requiredElement());
        }
        if (definition.requiredEnergy() != null) {
            ability.setRequiredEnergy(definition.requiredEnergy());
        }
        if (definition.requiredReaction() != null) {
            ability.setRequiredReaction(definition.requiredReaction());
        }
        if (ability.getEffectType() != null && !AbilityEffectKeys.isSupported(ability.getEffectType())) {
            throw new IllegalStateException("Unsupported ability effect key: " + ability.getEffectType());
        }

        return ability;
    }

    private static void applyStandardCost(Card card, String id, Element costElement, Integer costAmount) {
        if (costAmount != null) {
            if (costAmount <= 0) {
                card.setCostAmount(0);
                card.setCostElement(null);
            } else {
                requireField(costElement != null, id, "costElement");
                card.setCostElement(costElement);
                card.setCostAmount(costAmount);
            }
        } else if (costElement != null && card.getCostAmount() > 0) {
            card.setCostElement(costElement);
        }
    }

    private static ManualAbilityDefinition primaryAbilityDefinition(ManualSieglingDefinition definition) {
        if (definition.ability() != null) {
            return definition.ability();
        }
        if (definition.abilities() != null && !definition.abilities().isEmpty()) {
            return definition.abilities().get(0);
        }
        return null;
    }

    private static void resolveEvolutionNames(Map<String, SieglingCard> cardsById, List<ManualSieglingDefinition> definitions) {
        Map<String, String> manualNamesById = definitions.stream()
                .filter(definition -> hasText(definition.id()) && hasText(definition.name()))
                .collect(Collectors.toMap(
                        definition -> normalizeId(definition.id()),
                        ManualSieglingDefinition::name,
                        (left, right) -> right,
                        LinkedHashMap::new
                ));

        for (SieglingCard card : cardsById.values()) {
            if (!hasText(card.getEvolvesFromId()) || hasText(card.getEvolvesFromName())) {
                continue;
            }
            String evolvesFromId = normalizeId(card.getEvolvesFromId());
            SieglingCard localParent = cardsById.get(evolvesFromId);
            if (localParent != null) {
                card.setEvolvesFromName(localParent.getName());
                continue;
            }
            String manualName = manualNamesById.get(evolvesFromId);
            if (manualName != null) {
                card.setEvolvesFromName(manualName);
                continue;
            }
            card.setEvolvesFromName(GeneratedCreatureCatalog.creatureName(evolvesFromId));
        }
    }

    private static SieglingCard copyCard(SieglingCard source) {
        SieglingCard card = new SieglingCard(
                source.getId(),
                source.getName(),
                source.getElement(),
                source.getRarity(),
                source.getHealth(),
                source.getSpeed(),
                source.getNotches() == null ? new ArrayList<>() : new ArrayList<>(source.getNotches()),
                source.getPreferredRow()
        );
        card.setCostElement(source.getCostElement());
        card.setCostAmount(source.getCostAmount());
        card.setEvolvesFromId(source.getEvolvesFromId());
        card.setEvolvesFromName(source.getEvolvesFromName());
        card.setMoveIds(source.getMoveIds() == null ? new ArrayList<>() : new ArrayList<>(source.getMoveIds()));
        card.setAbility(source.getAbility() == null ? null : source.getAbility().copy());
        return card;
    }

    private static Notch toNotch(ManualNotchDefinition definition) {
        if (definition.direction() == null || definition.element() == null) {
            throw new IllegalStateException("Manual notch definitions require both direction and element.");
        }
        return new Notch(definition.direction(), definition.element());
    }

    private static List<ManualSieglingDefinition> loadDefinitions() {
        return CardOverrideStorageService.loadDefinitionsForGame(OBJECT_MAPPER);
    }

    static void validateDefinitions(List<ManualSieglingDefinition> definitions) {
        validateDefinitions(new OverrideFile(definitions == null ? List.of() : definitions, List.of()));
    }

    static void validateDefinitions(OverrideFile file) {
        List<ManualSieglingDefinition> safeDefinitions = file.cards() == null ? List.of() : List.copyOf(file.cards());
        MovesPoolService pool = new MovesPoolService(OBJECT_MAPPER, null);
        pool.reloadClasspathAndOverlayEditor(file.moves());
        Set<String> ids = new LinkedHashSet<>();
        for (ManualSieglingDefinition definition : safeDefinitions) {
            String id = normalizeId(definition.id());
            requireField(id != null, "<unknown>", "id");
            if (!ids.add(id)) {
                throw new IllegalStateException("Duplicate manual Siegling definition id '" + id + "'.");
            }
        }

        for (Element element : Element.values()) {
            applyOverrides(element, GeneratedCreatureCatalog.createGeneratedForElement(element), safeDefinitions, pool);
        }
        applySpellOverrides(GeneratedSpellCatalog.createSpells(), safeDefinitions);
        applyTrapOverrides(CardDefinitionService.createBaseTraps(), safeDefinitions);
    }

    static Path resolveProjectResourcePath() {
        return PROJECT_RESOURCE_PATH.toAbsolutePath().normalize();
    }

    private static void requireField(boolean valid, String id, String fieldName) {
        if (!valid) {
            throw new IllegalStateException("Manual card definition '" + id + "' is missing required field '" + fieldName + "'.");
        }
    }

    private static String normalizeId(String raw) {
        if (raw == null) {
            return null;
        }
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        return normalized.isBlank() ? null : normalized;
    }

    private static String normalizeBlank(String raw) {
        if (raw == null) {
            return null;
        }
        String normalized = raw.trim();
        return normalized.isBlank() ? null : normalized;
    }

    private static String normalizeEffectKey(String raw) {
        if (raw == null) {
            return null;
        }
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        return normalized.isBlank() ? null : normalized;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static int compareRarity(Rarity left, Rarity right) {
        return Integer.compare(rarityTier(left), rarityTier(right));
    }

    private static int rarityTier(Rarity rarity) {
        return switch (Objects.requireNonNull(rarity, "rarity")) {
            case COMMON -> 0;
            case UNCOMMON -> 1;
            case RARE -> 2;
            case EPIC -> 3;
            case LEGENDARY -> 4;
        };
    }

    private static ManualSieglingDefinition toDefinition(Card card) {
        if (card instanceof SieglingCard siegling) {
            List<String> moveIds = siegling.getMoveIds() == null || siegling.getMoveIds().isEmpty()
                    ? null
                    : List.copyOf(siegling.getMoveIds());
            return new ManualSieglingDefinition(
                    CardType.SIEGLING,
                    siegling.getId(),
                    siegling.getName(),
                    siegling.getElement(),
                    siegling.getRarity(),
                    siegling.getHealth(),
                    siegling.getSpeed(),
                    siegling.getNotches() == null ? List.of() : siegling.getNotches().stream()
                            .map(notch -> new ManualNotchDefinition(notch.direction(), notch.element()))
                            .toList(),
                    siegling.getPreferredRow(),
                    siegling.getEvolvesFromId(),
                    siegling.getEvolvesFromName(),
                    siegling.getCostElement(),
                    siegling.getCostAmount() > 0 ? siegling.getCostAmount() : null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    moveIds,
                    null
            );
        }
        if (card instanceof SpellCard spell) {
            return new ManualSieglingDefinition(
                    CardType.SPELL,
                    spell.getId(),
                    spell.getName(),
                    spell.getElement(),
                    spell.getRarity(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    spell.getCostElement(),
                    spell.getCostAmount() > 0 ? spell.getCostAmount() : null,
                    spell.getAbility() == null ? null : toAbilityDefinition(spell.getAbility()),
                    null,
                    null,
                    spell.getRequiredReaction(),
                    spell.getRequiredComboSize() > 0 ? spell.getRequiredComboSize() : null,
                    normalizeBlank(spell.getRequiredComboSignature()),
                    null,
                    List.of()
            );
        }
        if (card instanceof TrapCard trap) {
            return new ManualSieglingDefinition(
                    CardType.TRAP,
                    trap.getId(),
                    trap.getName(),
                    trap.getElement(),
                    trap.getRarity(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    trap.getAbility() == null ? null : toAbilityDefinition(trap.getAbility()),
                    trap.getCostElement(),
                    trap.getCostAmount() > 0 ? trap.getCostAmount() : null,
                    null,
                    null,
                    null,
                    null,
                    List.of()
            );
        }
        throw new IllegalStateException("Unsupported card type for override export: " + card.getClass().getSimpleName());
    }

    private static ManualAbilityDefinition toAbilityDefinition(Ability ability) {
        return new ManualAbilityDefinition(
                ability.getName(),
                ability.getDescription(),
                ability.getTargetType(),
                ability.getTargetRow(),
                ability.getTargetCount(),
                ability.getEffectType(),
                ability.getEffectValue(),
                ability.isPassive(),
                ability.getRequiredElement(),
                ability.getRequiredEnergy(),
                ability.getRequiredReaction()
        );
    }

    private static CardType definitionType(ManualSieglingDefinition definition) {
        if (definition.type() != null) {
            return definition.type();
        }
        String normalizedId = normalizeId(definition.id());
        if (normalizedId != null) {
            if (normalizedId.startsWith("spell_")) {
                return CardType.SPELL;
            }
            if (normalizedId.startsWith("trap")) {
                return CardType.TRAP;
            }
        }
        if (definition.trapBucketElement() != null || definition.trapBucketAmount() != null) {
            return CardType.TRAP;
        }
        if (definition.requiredComboSize() != null || definition.requiredComboSignature() != null || definition.requiredReaction() != null) {
            return CardType.SPELL;
        }
        return CardType.SIEGLING;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record OverrideFile(
            List<ManualSieglingDefinition> cards,
            List<MovesPoolService.MoveDefinition> moves
    ) {
        OverrideFile {
            cards = cards == null ? List.of() : cards;
            moves = moves == null ? List.of() : moves;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ManualSieglingDefinition(
            @JsonProperty("type") CardType type,
            String id,
            String name,
            Element element,
            Rarity rarity,
            Integer health,
            Integer speed,
            List<ManualNotchDefinition> notches,
            Row preferredRow,
            String evolvesFromId,
            String evolvesFromName,
            Element costElement,
            Integer costAmount,
            ManualAbilityDefinition ability,
            Element trapBucketElement,
            Integer trapBucketAmount,
            Reaction requiredReaction,
            Integer requiredComboSize,
            String requiredComboSignature,
            List<String> moveIds,
            List<ManualAbilityDefinition> abilities
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ManualNotchDefinition(NotchDirection direction, Element element) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ManualAbilityDefinition(
            String name,
            String description,
            TargetType targetType,
            Row targetRow,
            Integer targetCount,
            String effectType,
            Integer effectValue,
            Boolean passive,
            Element requiredElement,
            Integer requiredEnergy,
            Reaction requiredReaction
    ) {}
}
