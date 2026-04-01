package com.sieglings.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.Notch;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

final class ManualSieglingCatalog {

    static final String RESOURCE_PATH = "cards/siegling-overrides.json";

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final List<ManualSieglingDefinition> LOADED_DEFINITIONS = loadDefinitions();

    private ManualSieglingCatalog() {}

    static List<SieglingCard> applyOverrides(Element element, List<SieglingCard> generatedCards) {
        return applyOverrides(element, generatedCards, LOADED_DEFINITIONS);
    }

    static List<SieglingCard> applyOverrides(Element element, List<SieglingCard> generatedCards,
                                             List<ManualSieglingDefinition> definitions) {
        Map<String, SieglingCard> cardsById = generatedCards.stream()
                .map(ManualSieglingCatalog::copyCard)
                .collect(Collectors.toMap(
                        SieglingCard::getId,
                        card -> card,
                        (left, right) -> right,
                        LinkedHashMap::new
                ));

        for (ManualSieglingDefinition definition : definitions) {
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

            SieglingCard merged = mergeDefinition(generated, id, definition);
            if (merged.getElement() == element) {
                cardsById.put(id, merged);
            } else {
                cardsById.remove(id);
            }
        }

        resolveEvolutionNames(cardsById, definitions);

        return cardsById.values().stream()
                .sorted(Comparator
                        .comparing(SieglingCard::getRarity, ManualSieglingCatalog::compareRarity)
                        .thenComparing(SieglingCard::getName))
                .toList();
    }

    private static SieglingCard mergeDefinition(SieglingCard baseCard, String id, ManualSieglingDefinition definition) {
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
        if (definition.abilities() != null) {
            card.setAbilities(definition.abilities().stream()
                    .map(abilityDefinition -> mergeAbility(null, abilityDefinition))
                    .toList());
        } else if (definition.ability() != null) {
            card.setAbility(mergeAbility(card.getAbility(), definition.ability()));
        }
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
            ability.setEffectType(definition.effectType());
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
        if (source.hasExplicitAbilityLoadout()) {
            card.setAbilities(source.getAbilities());
        } else {
            card.setAbility(source.getAbility() == null ? null : source.getAbility().copy());
        }
        return card;
    }

    private static Notch toNotch(ManualNotchDefinition definition) {
        if (definition.direction() == null || definition.element() == null) {
            throw new IllegalStateException("Manual notch definitions require both direction and element.");
        }
        return new Notch(definition.direction(), definition.element());
    }

    private static List<ManualSieglingDefinition> loadDefinitions() {
        try (InputStream stream = ManualSieglingCatalog.class.getClassLoader().getResourceAsStream(RESOURCE_PATH)) {
            if (stream == null) {
                return List.of();
            }
            OverrideFile file = OBJECT_MAPPER.readValue(stream, OverrideFile.class);
            return file == null || file.cards() == null ? List.of() : List.copyOf(file.cards());
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load manual Siegling definitions from " + RESOURCE_PATH, ex);
        }
    }

    private static void requireField(boolean valid, String id, String fieldName) {
        if (!valid) {
            throw new IllegalStateException("Manual Siegling definition '" + id + "' is missing required field '" + fieldName + "'.");
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

    @JsonIgnoreProperties(ignoreUnknown = true)
    record OverrideFile(List<ManualSieglingDefinition> cards) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ManualSieglingDefinition(
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
