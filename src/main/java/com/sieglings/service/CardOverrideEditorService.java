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

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CardOverrideEditorService {

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService storageService;
    private final CardEditorAuthService authService;

    public CardOverrideEditorService(ObjectMapper objectMapper,
                                     CardOverrideStorageService storageService,
                                     CardEditorAuthService authService) {
        this.objectMapper = objectMapper;
        this.storageService = storageService;
        this.authService = authService;
    }

    public Map<String, Object> loadEditorState(String editorToken) {
        CardOverrideStorageService.LoadSnapshot snapshot = storageService.loadSnapshot();
        return buildEditorState(snapshot, authService.describe(editorToken));
    }

    public Map<String, Object> saveEditorState(JsonNode data, String editorToken) {
        String updatedByEmail = null;
        if (storageService.isFirestoreReady()) {
            updatedByEmail = authService.requireEditor(editorToken).email();
        }
        CardOverrideStorageService.LoadSnapshot snapshot = storageService.saveSnapshot(data, updatedByEmail);
        return buildEditorState(snapshot, authService.describe(editorToken));
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

    private Map<String, Object> buildEditorState(CardOverrideStorageService.LoadSnapshot snapshot,
                                                 CardEditorAuthService.EditorAuthSnapshot authSnapshot) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("data", snapshot.data());
        response.put("filePath", snapshot.filePath());
        response.put("canSaveToProjectFile", snapshot.canWriteProjectFile());
        response.put("source", snapshot.backend().name());
        response.put("liveEditingEnabled", snapshot.backend() == CardOverrideStorageService.StorageBackend.FIRESTORE);
        response.put("updatedBy", snapshot.updatedBy());
        response.put("updatedAt", snapshot.updatedAt());
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
