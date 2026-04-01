package com.sieglings.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CardOverrideEditorService {

    private final ObjectMapper objectMapper;

    public CardOverrideEditorService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> loadEditorState() {
        Path projectPath = ManualSieglingCatalog.resolveProjectResourcePath();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("data", readCurrentData());
        response.put("filePath", projectPath.toString());
        response.put("canSaveToProjectFile", canSaveToProjectFile(projectPath));
        response.put("source", Files.isRegularFile(projectPath) ? "PROJECT_FILE" : "CLASSPATH_RESOURCE");
        response.put("metadata", buildMetadata());
        return response;
    }

    public Map<String, Object> saveEditorState(JsonNode data) {
        Path projectPath = ManualSieglingCatalog.resolveProjectResourcePath();
        if (!canSaveToProjectFile(projectPath)) {
            throw new IllegalStateException("This runtime cannot write to the project resource file. Download the JSON instead.");
        }

        ManualSieglingCatalog.OverrideFile file = parseOverrideFile(data);
        ManualSieglingCatalog.validateDefinitions(file.cards());

        try {
            Files.createDirectories(projectPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(projectPath.toFile(), file);
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to save manual Siegling definitions to " + projectPath, ex);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("saved", true);
        response.put("filePath", projectPath.toString());
        response.put("canSaveToProjectFile", true);
        response.put("source", "PROJECT_FILE");
        response.put("data", objectMapper.valueToTree(file));
        response.put("metadata", buildMetadata());
        return response;
    }

    private JsonNode readCurrentData() {
        Path projectPath = ManualSieglingCatalog.resolveProjectResourcePath();
        try {
            if (Files.isRegularFile(projectPath)) {
                try (InputStream stream = Files.newInputStream(projectPath)) {
                    return objectMapper.readTree(stream);
                }
            }
            try (InputStream stream = getClass().getClassLoader().getResourceAsStream(ManualSieglingCatalog.RESOURCE_PATH)) {
                if (stream == null) {
                    var empty = objectMapper.createObjectNode();
                    empty.putArray("cards");
                    return empty;
                }
                return objectMapper.readTree(stream);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load manual Siegling definitions for the editor.", ex);
        }
    }

    private ManualSieglingCatalog.OverrideFile parseOverrideFile(JsonNode data) {
        try {
            ManualSieglingCatalog.OverrideFile file = objectMapper.treeToValue(data, ManualSieglingCatalog.OverrideFile.class);
            if (file == null) {
                throw new IllegalArgumentException("The submitted JSON is empty.");
            }
            if (file.cards() == null) {
                throw new IllegalArgumentException("The JSON must contain a top-level 'cards' array.");
            }
            return file;
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("The submitted JSON does not match the Sieglings override format.", ex);
        }
    }

    private boolean canSaveToProjectFile(Path projectPath) {
        return projectPath.getParent() != null && Files.isDirectory(projectPath.getParent());
    }

    private Map<String, Object> buildMetadata() {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("elements", enumNames(Element.values()));
        metadata.put("rarities", enumNames(Rarity.values()));
        metadata.put("rows", enumNames(Row.values()));
        metadata.put("targetTypes", enumNames(TargetType.values()));
        metadata.put("notchDirections", enumNames(NotchDirection.values()));
        metadata.put("reactions", enumNames(Reaction.values()));
        metadata.put("effectTypes", buildEffectTypes());
        metadata.put("targetRules", buildTargetRules());
        return metadata;
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
                effect(AbilityEffectKeys.MOVE_LINK, "Move Link", "Moves the source card to an open linked point.", List.of("SELF"))
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
}
