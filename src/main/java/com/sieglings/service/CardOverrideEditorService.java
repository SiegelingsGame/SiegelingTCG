package com.sieglings.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sieglings.model.Card;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class CardOverrideEditorService {

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService storageService;
    private final PresetDeckCatalogService presetDeckCatalogService;
    private final TrainerCatalogService trainerCatalogService;
    private final CardEditorAuthService authService;
    private final CardDefinitionService cardDefinitionService;
    private final LiveElementCatalogService liveElementCatalogService;

    public CardOverrideEditorService(ObjectMapper objectMapper,
                                     CardOverrideStorageService storageService,
                                     PresetDeckCatalogService presetDeckCatalogService,
                                     TrainerCatalogService trainerCatalogService,
                                     CardEditorAuthService authService,
                                     CardDefinitionService cardDefinitionService,
                                     LiveElementCatalogService liveElementCatalogService) {
        this.objectMapper = objectMapper;
        this.storageService = storageService;
        this.presetDeckCatalogService = presetDeckCatalogService;
        this.trainerCatalogService = trainerCatalogService;
        this.authService = authService;
        this.cardDefinitionService = cardDefinitionService;
        this.liveElementCatalogService = liveElementCatalogService;
    }

    public Map<String, Object> loadEditorState(String editorToken) {
        CardOverrideStorageService.LoadSnapshot cardSnapshot = storageService.loadSnapshot();
        PresetDeckCatalogService.LoadSnapshot deckSnapshot = presetDeckCatalogService.loadSnapshot();
        TrainerCatalogService.LoadSnapshot trainerSnapshot = trainerCatalogService.loadSnapshot();
        LiveElementCatalogService.LoadSnapshot liveSnapshot = liveElementCatalogService.loadSnapshot();
        return buildEditorState(cardSnapshot, deckSnapshot, trainerSnapshot, liveSnapshot, authService.describe(editorToken));
    }

    public Map<String, Object> saveEditorState(JsonNode data, String editorToken) {
        String updatedByEmail = null;
        if (storageService.isFirestoreReady()) {
            updatedByEmail = authService.requireEditor(editorToken).email();
        }
        CardOverrideStorageService.LoadSnapshot currentCardSnapshot = storageService.loadSnapshot();
        PresetDeckCatalogService.LoadSnapshot currentDeckSnapshot = presetDeckCatalogService.loadSnapshot();
        TrainerCatalogService.LoadSnapshot currentTrainerSnapshot = trainerCatalogService.loadSnapshot();
        LiveElementCatalogService.LoadSnapshot currentLiveSnapshot = liveElementCatalogService.loadSnapshot();
        JsonNode cardsData = extractCardsData(data, currentCardSnapshot.data());
        JsonNode decksData = extractDecksData(data, currentDeckSnapshot.data());
        JsonNode trainersData = extractTrainersData(data, currentTrainerSnapshot.data());
        JsonNode liveElementsData = extractLiveElementsData(data, currentLiveSnapshot.data());
        List<TrainerCatalogService.TrainerDefinition> trainerDefinitions = validateTrainerDefinitions(trainersData);
        validateLiveElements(liveElementsData);
        Set<String> activeLiveElementNames = activeLiveElementNames(liveElementsData);
        validateDeckDefinitions(decksData, cardsData, trainerDefinitions, activeLiveElementNames);
        CardOverrideStorageService.LoadSnapshot cardSnapshot = storageService.saveSnapshot(cardsData, updatedByEmail);
        PresetDeckCatalogService.LoadSnapshot deckSnapshot = presetDeckCatalogService.saveSnapshot(decksData, updatedByEmail);
        TrainerCatalogService.LoadSnapshot trainerSnapshot = trainerCatalogService.saveSnapshot(trainersData, updatedByEmail);
        LiveElementCatalogService.LoadSnapshot liveSnapshot = liveElementCatalogService.saveSnapshot(liveElementsData, updatedByEmail);
        return buildEditorState(cardSnapshot, deckSnapshot, trainerSnapshot, liveSnapshot, authService.describe(editorToken));
    }

    public Map<String, Object> bootstrapEditor(String email, String password, String displayName) {
        CardEditorAuthService.EditorAuthResponse response = authService.bootstrap(email, password, displayName);
        return buildAuthResponse(response);
    }

    public Map<String, Object> loginEditor(String email, String password) {
        CardEditorAuthService.EditorAuthResponse response = authService.login(email, password);
        return buildAuthResponse(response);
    }

    public Map<String, Object> logoutEditor(String editorToken) {
        authService.logout(editorToken);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("auth", authService.describe(null));
        return response;
    }

    private Map<String, Object> buildEditorState(CardOverrideStorageService.LoadSnapshot cardSnapshot,
                                                 PresetDeckCatalogService.LoadSnapshot deckSnapshot,
                                                 TrainerCatalogService.LoadSnapshot trainerSnapshot,
                                                 LiveElementCatalogService.LoadSnapshot liveSnapshot,
                                                 CardEditorAuthService.EditorAuthSnapshot authSnapshot) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("data", buildEditorData());
        response.put("filePath", buildFilePath(cardSnapshot, deckSnapshot, trainerSnapshot, liveSnapshot));
        response.put("canSaveToProjectFile", cardSnapshot.canWriteProjectFile()
                && deckSnapshot.canWriteProjectFile()
                && trainerSnapshot.canWriteProjectFile()
                && liveSnapshot.canWriteProjectFile());
        response.put("source", resolveSource(cardSnapshot, deckSnapshot, trainerSnapshot, liveSnapshot));
        response.put("liveEditingEnabled", cardSnapshot.backend() == CardOverrideStorageService.StorageBackend.FIRESTORE
                && deckSnapshot.backend() == CardOverrideStorageService.StorageBackend.FIRESTORE
                && trainerSnapshot.backend() == CardOverrideStorageService.StorageBackend.FIRESTORE
                && liveSnapshot.backend() == CardOverrideStorageService.StorageBackend.FIRESTORE);
        response.put("updatedBy", coalesce(trainerSnapshot.updatedBy(), deckSnapshot.updatedBy(), cardSnapshot.updatedBy(), liveSnapshot.updatedBy()));
        response.put("updatedAt", coalesce(trainerSnapshot.updatedAt(), deckSnapshot.updatedAt(), cardSnapshot.updatedAt(), liveSnapshot.updatedAt()));
        response.put("firestoreAvailable", storageService.isFirestoreReady());
        response.put("firestoreError", storageService.getFirestoreInitializationError());
        response.put("auth", authSnapshot);
        response.put("metadata", buildMetadata());
        return response;
    }

    private Map<String, Object> buildAuthResponse(CardEditorAuthService.EditorAuthResponse authResponse) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("token", authResponse.token());
        response.put("auth", authResponse.auth());
        response.put("firestoreAvailable", storageService.isFirestoreReady());
        response.put("firestoreError", storageService.getFirestoreInitializationError());
        return response;
    }

    private Map<String, Object> buildMetadata() {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("elements", enumNames(Element.values()));
        metadata.put("cardTypes", List.of("SIEGLING", "SPELL", "TRAP"));
        metadata.put("rarities", enumNames(Rarity.values()));
        metadata.put("rows", enumNames(Row.values()));
        metadata.put("targetTypes", enumNames(TargetType.values()));
        metadata.put("notchDirections", enumNames(NotchDirection.values()));
        metadata.put("reactions", enumNames(Reaction.values()));
        metadata.put("trainers", buildTrainers());
        metadata.put("deckRules", buildDeckRules());
        metadata.put("effectTypes", buildEffectTypes());
        metadata.put("targetRules", buildTargetRules());
        return metadata;
    }

    private JsonNode buildEditorData() {
        ObjectNode data = objectMapper.createObjectNode();
        data.set("cards", objectMapper.valueToTree(ManualSieglingCatalog.buildOverrideFile(cardDefinitionService.getDeckBuilderCatalog()).cards()));
        data.set("decks", objectMapper.valueToTree(buildDeckEditorData()));
        data.set("trainers", objectMapper.valueToTree(cardDefinitionService.getStoredTrainerDefinitions()));
        ObjectNode live = objectMapper.createObjectNode();
        live.set("elements", objectMapper.valueToTree(liveElementCatalogService.buildEditorPayload()));
        data.set("liveElements", live);
        return data;
    }

    private List<Map<String, Object>> buildDeckEditorData() {
        return cardDefinitionService.getStoredDeckDefinitions().stream()
                .map(definition -> {
                    List<String> resolvedCardIds = definition.cardIds() == null || definition.cardIds().isEmpty()
                            ? cardDefinitionService.buildDeckById(definition.id()).stream().map(Card::getId).toList()
                            : definition.cardIds();
                    Map<String, Object> deck = new LinkedHashMap<>();
                    deck.put("id", definition.id());
                    deck.put("name", definition.name());
                    deck.put("description", definition.description());
                    deck.put("elements", (definition.elements() == null ? List.<Element>of() : definition.elements()).stream().map(Enum::name).toList());
                    deck.put("recommendedTrainerId", definition.recommendedTrainerId());
                    deck.put("active", definition.active() == null || definition.active());
                    deck.put("cardIds", resolvedCardIds);
                    deck.put("usesGeneratedPreset", definition.cardIds() == null || definition.cardIds().isEmpty());
                    return deck;
                })
                .toList();
    }

    private Map<String, Object> buildDeckRules() {
        Map<String, Object> deckRules = new LinkedHashMap<>();
        deckRules.put("minDeckSize", cardDefinitionService.getDeckBuilderMinSize());
        deckRules.put("maxCopies", cardDefinitionService.getDeckBuilderMaxCopies());
        deckRules.put("recommendedPresetSize", 40);
        return deckRules;
    }

    private List<Map<String, Object>> buildTrainers() {
        return cardDefinitionService.getStoredTrainerDefinitions().stream()
                .map(definition -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", definition.id());
                    item.put("name", definition.name());
                    item.put("element", definition.element() == null ? null : definition.element().name());
                    item.put("rarity", definition.rarity() == null ? null : definition.rarity().name());
                    item.put("tier", definition.tier());
                    item.put("active", definition.active() == null || definition.active());
                    item.put("oncePerGame", definition.oncePerGame() != null && definition.oncePerGame());
                    return item;
                })
                .toList();
    }

    private List<String> enumNames(Enum<?>[] values) {
        return Arrays.stream(values).map(Enum::name).toList();
    }

    private List<Map<String, Object>> buildEffectTypes() {
        return List.of(
                effect(AbilityEffectKeys.DAMAGE, "Damage", "Deals damage to the resolved target or targets.", List.of("SINGLE_ENEMY", "ROW_ENEMIES", "ALL_ENEMIES", "ENEMY_PLAYER")),
                effect(AbilityEffectKeys.PLAYER_DAMAGE, "Player Damage", "Deals direct damage to the opposing player.", List.of("ENEMY_PLAYER")),
                effect(AbilityEffectKeys.HEAL, "Heal", "Restores health up to the target's max health.", List.of("SINGLE_ALLY", "ALL_ALLIES", "ROW_ALLIES", "SELF")),
                effect(AbilityEffectKeys.FREEZE, "Freeze", "Applies the freeze status.", List.of("SINGLE_ENEMY", "ROW_ENEMIES", "ALL_ENEMIES")),
                effect(AbilityEffectKeys.SPEED_ZERO, "Speed Zero", "Sets effective Speed to 0 for the turn.", List.of("SINGLE_ENEMY", "ROW_ENEMIES", "ALL_ENEMIES")),
                effect(AbilityEffectKeys.DAMAGE_BOOST, "Damage Boost", "Adds temporary attack damage.", List.of("SINGLE_ALLY", "ALL_ALLIES", "ROW_ALLIES", "PASSIVE")),
                effect(AbilityEffectKeys.HEALTH_BOOST, "Health Boost", "Adds temporary max health and heals by the same amount.", List.of("SINGLE_ALLY", "ALL_ALLIES", "ROW_ALLIES", "PASSIVE")),
                effect(AbilityEffectKeys.CONNECTED_ALLIES_DAMAGE_BOOST, "Connected Allies Damage Boost", "Buffs every allied Siegling connected to the source card through active links.", List.of("SELF")),
                effect(AbilityEffectKeys.CONNECTED_ALLIES_HEALTH_BOOST, "Connected Allies Health Boost", "Gives connected allied Sieglings extra max health.", List.of("SELF")),
                effect(AbilityEffectKeys.SPEED_BOOST, "Speed Boost", "Adds temporary speed.", List.of("SINGLE_ALLY", "ALL_ALLIES", "ROW_ALLIES", "PASSIVE")),
                effect(AbilityEffectKeys.CONNECTED_ALLIES_SPEED_BOOST, "Connected Allies Speed Boost", "Gives connected allied Sieglings extra speed.", List.of("SELF")),
                effect(AbilityEffectKeys.DESTROY, "Destroy", "Defeats the resolved target immediately.", List.of("SINGLE_ENEMY")),
                effect(AbilityEffectKeys.MOVE_LINK, "Move Link", "SELF: move along links. Spell/trap + SINGLE_ENEMY: move that enemy to any empty cell on its board (client sends destRow/destCol).", List.of("SELF", "SINGLE_ENEMY"))
        );
    }

    private Map<String, Object> effect(String key, String label, String description, List<String> targetHints) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("key", key);
        info.put("label", label);
        info.put("description", description);
        info.put("targetHints", targetHints);
        return info;
    }

    private Map<String, Object> buildTargetRules() {
        Map<String, Object> rules = new LinkedHashMap<>();
        rules.put(TargetType.SINGLE_ENEMY.name(), targetRule(false, 1, "Pick one enemy."));
        rules.put(TargetType.ALL_ENEMIES.name(), targetRule(false, 0, "Hits every enemy, so no extra target fields are needed."));
        rules.put(TargetType.ROW_ENEMIES.name(), targetRule(true, 0, "Choose which enemy row the ability hits."));
        rules.put(TargetType.SINGLE_ALLY.name(), targetRule(false, 1, "Pick one ally."));
        rules.put(TargetType.ALL_ALLIES.name(), targetRule(false, 0, "Affects every ally, so no target count is needed."));
        rules.put(TargetType.ROW_ALLIES.name(), targetRule(true, 0, "Choose which allied row the ability affects."));
        rules.put(TargetType.ENEMY_PLAYER.name(), targetRule(false, 0, "Targets the opposing player directly."));
        rules.put(TargetType.SELF.name(), targetRule(false, 0, "The card affects itself."));
        rules.put(TargetType.PASSIVE.name(), targetRule(false, 0, "Always active with no manual targeting."));
        return rules;
    }

    private Map<String, Object> targetRule(boolean requiresRow, int fixedTargetCount, String helperText) {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("requiresRow", requiresRow);
        rule.put("fixedTargetCount", fixedTargetCount);
        rule.put("helperText", helperText);
        return rule;
    }

    private JsonNode extractCardsData(JsonNode submittedData, JsonNode fallbackData) {
        if (submittedData != null && submittedData.get("cards") != null) {
            ObjectNode node = objectMapper.createObjectNode();
            node.set("cards", submittedData.get("cards"));
            return node;
        }
        return fallbackData.deepCopy();
    }

    private JsonNode extractDecksData(JsonNode submittedData, JsonNode fallbackData) {
        if (submittedData != null && submittedData.get("decks") != null) {
            ObjectNode node = objectMapper.createObjectNode();
            node.set("decks", submittedData.get("decks"));
            return node;
        }
        return fallbackData.deepCopy();
    }

    private JsonNode extractTrainersData(JsonNode submittedData, JsonNode fallbackData) {
        if (submittedData != null && submittedData.get("trainers") != null) {
            ObjectNode node = objectMapper.createObjectNode();
            node.set("trainers", submittedData.get("trainers"));
            return node;
        }
        return fallbackData.deepCopy();
    }

    private JsonNode extractLiveElementsData(JsonNode submittedData, JsonNode fallbackData) {
        if (submittedData != null && submittedData.get("liveElements") != null) {
            JsonNode live = submittedData.get("liveElements");
            if (live.get("elements") != null) {
                ObjectNode node = objectMapper.createObjectNode();
                node.set("elements", live.get("elements"));
                return node;
            }
        }
        return fallbackData.deepCopy();
    }

    private void validateLiveElements(JsonNode liveData) {
        try {
            LiveElementCatalogService.LiveElementsFile file = objectMapper.treeToValue(liveData, LiveElementCatalogService.LiveElementsFile.class);
            if (file == null || file.elements() == null) {
                throw new IllegalArgumentException("Live element data must include an 'elements' array.");
            }
            if (LiveElementCatalogService.resolveActiveElements(file.elements()).isEmpty()) {
                throw new IllegalArgumentException("Keep at least one live element active for gameplay.");
            }
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("The submitted live element roster is invalid.", ex);
        }
    }

    private Set<String> activeLiveElementNames(JsonNode liveData) {
        try {
            LiveElementCatalogService.LiveElementsFile file = objectMapper.treeToValue(liveData, LiveElementCatalogService.LiveElementsFile.class);
            if (file == null || file.elements() == null) {
                return Set.of();
            }
            return LiveElementCatalogService.resolveActiveElements(file.elements()).stream()
                    .map(Enum::name)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
        } catch (Exception ex) {
            return Set.of();
        }
    }

    private List<TrainerCatalogService.TrainerDefinition> validateTrainerDefinitions(JsonNode trainersData) {
        try {
            TrainerCatalogService.TrainerFile file = objectMapper.treeToValue(trainersData, TrainerCatalogService.TrainerFile.class);
            if (file == null || file.trainers() == null) {
                throw new IllegalArgumentException("The dashboard data must contain a top-level 'trainers' array.");
            }

            Set<String> seenTrainerIds = new LinkedHashSet<>();
            boolean hasActiveTrainer = false;
            for (TrainerCatalogService.TrainerDefinition definition : file.trainers()) {
                String trainerId = normalizeLower(definition.id());
                if (trainerId == null) {
                    throw new IllegalArgumentException("Every SiegeKnight needs a non-blank id.");
                }
                if (!seenTrainerIds.add(trainerId)) {
                    throw new IllegalArgumentException("Duplicate SiegeKnight id '" + trainerId + "'.");
                }
                if (normalizeText(definition.name()) == null) {
                    throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' needs a name.");
                }
                if (definition.element() == null) {
                    throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' needs an element.");
                }
                if (definition.rarity() == null) {
                    throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' needs a rarity.");
                }
                if (normalizeText(definition.tier()) == null) {
                    throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' needs a tier.");
                }
                if (definition.active() == null || definition.active()) {
                    hasActiveTrainer = true;
                }

                validateTrainerAbility(trainerId, "passive", definition.passiveAbility(), true);
                validateTrainerAbility(trainerId, "active", definition.activeAbility(), false);
            }

            if (!hasActiveTrainer) {
                throw new IllegalArgumentException("Keep at least one SiegeKnight active in the live game.");
            }
            return file.trainers();
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("The submitted SiegeKnight data does not match the dashboard trainer format.", ex);
        }
    }

    private void validateDeckDefinitions(JsonNode decksData,
                                         JsonNode cardsData,
                                         List<TrainerCatalogService.TrainerDefinition> trainerDefinitions,
                                         Set<String> activeLiveElementNames) {
        try {
            PresetDeckCatalogService.PresetDeckFile file = objectMapper.treeToValue(decksData, PresetDeckCatalogService.PresetDeckFile.class);
            if (file == null || file.decks() == null) {
                throw new IllegalArgumentException("The dashboard data must contain a top-level 'decks' array.");
            }

            Set<String> availableCardIds = extractCardIds(cardsData);
            Set<String> trainerIds = trainerDefinitions.stream()
                    .map(TrainerCatalogService.TrainerDefinition::id)
                    .map(this::normalizeLower)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            Set<String> activeTrainerIds = trainerDefinitions.stream()
                    .filter(definition -> definition.active() == null || definition.active())
                    .map(TrainerCatalogService.TrainerDefinition::id)
                    .map(this::normalizeLower)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            Set<String> seenDeckIds = new LinkedHashSet<>();
            boolean hasActiveDeck = false;

            for (PresetDeckCatalogService.PresetDeckDefinition definition : file.decks()) {
                String deckId = normalizeLower(definition.id());
                if (deckId == null) {
                    throw new IllegalArgumentException("Every preset deck needs a non-blank id.");
                }
                if (!seenDeckIds.add(deckId)) {
                    throw new IllegalArgumentException("Duplicate preset deck id '" + deckId + "'.");
                }
                if (normalizeText(definition.name()) == null) {
                    throw new IllegalArgumentException("Preset deck '" + deckId + "' needs a name.");
                }
                String trainerId = normalizeLower(definition.recommendedTrainerId());
                if (trainerId == null || !trainerIds.contains(trainerId)) {
                    throw new IllegalArgumentException("Preset deck '" + deckId + "' must use a valid recommended trainer id.");
                }

                boolean active = definition.active() == null || definition.active();
                if (active) {
                    if (!activeTrainerIds.contains(trainerId)) {
                        throw new IllegalArgumentException("Active preset deck '" + deckId + "' must use an active recommended trainer.");
                    }
                    if (definition.elements() != null) {
                        for (Element element : definition.elements()) {
                            if (element == null || element == Element.NEUTRAL) {
                                continue;
                            }
                            if (!activeLiveElementNames.contains(element.name())) {
                                throw new IllegalArgumentException("Active preset deck '" + deckId
                                        + "' references inactive live element '" + element.name() + "'.");
                            }
                        }
                    }
                    hasActiveDeck = true;
                }

                List<String> cardIds = normalizeCardIds(definition.cardIds());
                if (!cardIds.isEmpty()) {
                    Map<String, Long> countsById = cardIds.stream()
                            .collect(Collectors.groupingBy(cardId -> cardId, LinkedHashMap::new, Collectors.counting()));
                    for (Map.Entry<String, Long> entry : countsById.entrySet()) {
                        if (!availableCardIds.contains(entry.getKey())) {
                            throw new IllegalArgumentException("Preset deck '" + deckId + "' contains unknown card id '" + entry.getKey() + "'.");
                        }
                        if (entry.getValue() > cardDefinitionService.getDeckBuilderMaxCopies()) {
                            throw new IllegalArgumentException("Preset deck '" + deckId + "' uses more than "
                                    + cardDefinitionService.getDeckBuilderMaxCopies() + " copies of '" + entry.getKey() + "'.");
                        }
                    }
                    if (active && cardIds.size() < cardDefinitionService.getDeckBuilderMinSize()) {
                        throw new IllegalArgumentException("Active preset deck '" + deckId + "' must contain at least "
                                + cardDefinitionService.getDeckBuilderMinSize() + " cards.");
                    }
                } else if (active && (definition.elements() == null || definition.elements().isEmpty())) {
                    throw new IllegalArgumentException("Active preset deck '" + deckId + "' needs cards or at least one seed element.");
                }
            }

            if (!hasActiveDeck) {
                throw new IllegalArgumentException("Keep at least one preset deck active in the game.");
            }
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("The submitted preset decks do not match the dashboard deck format.", ex);
        }
    }

    private Set<String> extractCardIds(JsonNode cardsData) {
        JsonNode cardsNode = cardsData == null ? null : cardsData.get("cards");
        if (cardsNode == null || !cardsNode.isArray()) {
            return Set.of();
        }
        Set<String> ids = new LinkedHashSet<>();
        for (JsonNode cardNode : cardsNode) {
            String normalized = normalizeLower(cardNode.path("id").asText(null));
            if (normalized != null) {
                ids.add(normalized);
            }
        }
        return ids;
    }

    private List<String> normalizeCardIds(List<String> cardIds) {
        if (cardIds == null) {
            return List.of();
        }
        return cardIds.stream()
                .map(this::normalizeLower)
                .filter(value -> value != null)
                .toList();
    }

    private void validateTrainerAbility(String trainerId,
                                        String slot,
                                        ManualSieglingCatalog.ManualAbilityDefinition ability,
                                        boolean shouldBePassive) {
        if (ability == null) {
            throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' needs a " + slot + " ability.");
        }
        if (normalizeText(ability.name()) == null) {
            throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' " + slot + " ability needs a name.");
        }
        if (normalizeText(ability.description()) == null) {
            throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' " + slot + " ability needs a description.");
        }
        if (ability.targetType() == null) {
            throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' " + slot + " ability needs a target type.");
        }
        if (getTargetRule(ability.targetType()).requiresRow() && ability.targetRow() == null) {
            throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' " + slot + " ability needs a target row.");
        }
        String effectType = normalizeLower(ability.effectType());
        if (effectType == null || !AbilityEffectKeys.isSupported(effectType)) {
            throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' " + slot + " ability uses an unsupported effect type.");
        }
        if (ability.requiredEnergy() != null && ability.requiredEnergy() < 0) {
            throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' " + slot + " ability cannot require negative energy.");
        }
        if (ability.passive() != null && ability.passive() != shouldBePassive) {
            throw new IllegalArgumentException("SiegeKnight '" + trainerId + "' " + slot + " ability has the wrong passive flag.");
        }
    }

    private TargetRule getTargetRule(TargetType targetType) {
        return switch (targetType) {
            case SINGLE_ENEMY -> new TargetRule(false, 1);
            case ALL_ENEMIES, ENEMY_PLAYER, SELF, PASSIVE, ALL_ALLIES -> new TargetRule(false, 0);
            case ROW_ENEMIES, ROW_ALLIES -> new TargetRule(true, 0);
            case SINGLE_ALLY -> new TargetRule(false, 1);
        };
    }

    private String normalizeLower(String value) {
        String normalized = normalizeText(value);
        return normalized == null ? null : normalized.toLowerCase();
    }

    private String normalizeText(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isBlank() ? null : normalized;
    }

    private String buildFilePath(CardOverrideStorageService.LoadSnapshot cardSnapshot,
                                 PresetDeckCatalogService.LoadSnapshot deckSnapshot,
                                 TrainerCatalogService.LoadSnapshot trainerSnapshot,
                                 LiveElementCatalogService.LoadSnapshot liveSnapshot) {
        return "Cards: " + cardSnapshot.filePath()
                + " | Decks: " + deckSnapshot.filePath()
                + " | SiegeKnights: " + trainerSnapshot.filePath()
                + " | Live elements: " + liveSnapshot.filePath();
    }

    private String resolveSource(CardOverrideStorageService.LoadSnapshot cardSnapshot,
                                 PresetDeckCatalogService.LoadSnapshot deckSnapshot,
                                 TrainerCatalogService.LoadSnapshot trainerSnapshot,
                                 LiveElementCatalogService.LoadSnapshot liveSnapshot) {
        Set<String> backends = new LinkedHashSet<>();
        backends.add(cardSnapshot.backend().name());
        backends.add(deckSnapshot.backend().name());
        backends.add(trainerSnapshot.backend().name());
        backends.add(liveSnapshot.backend().name());
        return String.join(" + ", backends);
    }

    private String coalesce(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private record TargetRule(boolean requiresRow, int fixedTargetCount) {}
}
