package com.sieglings.keep;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.service.CardEditorAuthService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Dashboard endpoints for the Keep page: building output, resident buff percentages,
 * decoration/tool blueprints, and the Enclave rapport tasks. Reads are open (the dashboard
 * shows the current values before sign-in); writes require the same editor token the Siege
 * and Shop admin endpoints use.
 */
@RestController
public class KeepTuningController {

    private static final String EDITOR_TOKEN_HEADER = "X-Card-Editor-Token";

    private final KeepTuningService keepTuningService;
    private final CardEditorAuthService editorAuth;
    private final ObjectMapper objectMapper;

    public KeepTuningController(KeepTuningService keepTuningService, CardEditorAuthService editorAuth,
                                 ObjectMapper objectMapper) {
        this.keepTuningService = keepTuningService;
        this.editorAuth = editorAuth;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/api/keep/tuning")
    public Map<String, Object> load() {
        return serialize(keepTuningService.loadSnapshot());
    }

    @PostMapping("/api/keep/tuning")
    public Map<String, Object> save(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        String email = editorAuth.requireEditor(editorToken).email();
        Object tuningNode = body == null ? null : body.get("tuning");
        if (tuningNode == null) throw new IllegalArgumentException("A 'tuning' object is required.");
        KeepTuning tuning = keepTuningService.parse(objectMapper.valueToTree(tuningNode));
        return serialize(keepTuningService.save(tuning, email));
    }

    @PostMapping("/api/keep/tuning/reset")
    public Map<String, Object> reset(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken) {
        String email = editorAuth.requireEditor(editorToken).email();
        return serialize(keepTuningService.reset(email));
    }

    private Map<String, Object> serialize(KeepTuningService.LoadSnapshot snapshot) {
        KeepTuning tuning = KeepTuning.orEmpty(snapshot.tuning());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tuning", tuning);
        out.put("source", snapshot.backend() == null ? "UNKNOWN" : snapshot.backend().name());
        out.put("filePath", snapshot.filePath());
        out.put("updatedBy", snapshot.updatedBy());
        out.put("updatedAt", snapshot.updatedAt());
        out.put("defaults", defaults());
        return out;
    }

    /** Everything the dashboard needs to render an "unset means this" placeholder. */
    private Map<String, Object> defaults() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("buildings", KeepService.shippedBuildingDefaults());
        out.put("projects", KeepService.shippedProjectDefaults());
        out.put("recipes", KeepService.shippedRecipeDefaults());
        Map<String, Object> buffs = new LinkedHashMap<>();
        buffs.put("facilityAffinityPercent", KeepTuning.DEFAULT_FACILITY_AFFINITY_PERCENT);
        buffs.put("facilityNeutralPercent", KeepTuning.DEFAULT_FACILITY_NEUTRAL_PERCENT);
        buffs.put("woodlotAffinityPercent", KeepTuning.DEFAULT_WOODLOT_AFFINITY_PERCENT);
        buffs.put("toolTierPercent", KeepTuning.DEFAULT_TOOL_TIER_PERCENT);
        buffs.put("elementalNetworkPercent", KeepTuning.DEFAULT_ELEMENTAL_NETWORK_PERCENT);
        buffs.put("favoritePercentByRarity", KeepTuning.DEFAULT_FAVORITE_PERCENT_BY_RARITY);
        buffs.put("rapportStepPercent", KeepTuning.DEFAULT_RAPPORT_STEP_PERCENT);
        buffs.put("rapportThresholds", KeepTuning.DEFAULT_RAPPORT_THRESHOLDS);
        out.put("buffs", buffs);
        out.put("taskEvents", KeepEnclaveTaskCatalog.EVENT_TYPES.stream().sorted().toList());
        Map<String, Object> elementTasks = new LinkedHashMap<>();
        KeepEnclaveTaskCatalog.shippedElementTasks()
                .forEach((element, tasks) -> elementTasks.put(element, serializeTasks(tasks)));
        out.put("elementTasks", elementTasks);
        out.put("bondTasks", serializeTasks(KeepEnclaveTaskCatalog.shippedBondTasks()));
        return out;
    }

    private List<Map<String, Object>> serializeTasks(List<KeepEnclaveTaskCatalog.TaskDefinition> tasks) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (KeepEnclaveTaskCatalog.TaskDefinition task : tasks) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", task.id());
            item.put("event", task.event());
            item.put("goal", task.goal());
            item.put("name", task.name());
            item.put("description", task.description());
            item.put("rapport", task.rapport());
            item.put("gold", task.gold());
            item.put("remnants", task.remnants());
            out.add(item);
        }
        return out;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error",
                ex.getMessage() == null ? "Keep tuning request failed." : ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleServerError(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error",
                ex.getMessage() == null ? "Keep tuning could not be saved." : ex.getMessage()));
    }
}
