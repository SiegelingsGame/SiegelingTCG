package com.sieglings.keep;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Designer-tunable numbers for My Keep, edited from the card dashboard's Keep page and
 * persisted by {@link KeepTuningService}. Every field is optional: a null or blank entry
 * means "use the value {@link KeepService} ships with", so an empty document reproduces
 * the shipped balance exactly. Accessors are null-tolerant on purpose — a half-filled
 * Firestore row from an older dashboard build must never break a live keep.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record KeepTuning(
        List<Building> buildings,
        List<Project> projects,
        Buffs buffs,
        List<Recipe> recipes,
        Tasks tasks
) {
    /** Per-workshop production overrides. Ids match {@code KeepService} facility ids. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Building(String id, Double ratePerMinute, Integer storage) { }

    /** Construction project cost/time overrides, keyed by build id (e.g. {@code build_enclave}). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Project(String id, Integer timberCost, Long seconds) { }

    /** Resident and building effect percentages. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Buffs(
            Integer facilityAffinityPercent,
            Integer facilityNeutralPercent,
            Integer woodlotAffinityPercent,
            Integer toolTierPercent,
            Integer elementalNetworkPercent,
            Map<String, Integer> favoritePercentByRarity,
            Integer rapportStepPercent,
            List<Integer> rapportThresholds
    ) { }

    /** Tool/decoration blueprint overrides — display copy and material costs. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Recipe(String id, String name, String bonusLabel, Map<String, Integer> costs) { }

    /** Enclave rapport tasks: element defaults plus per-Siegeling ladders that replace them. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Tasks(Map<String, List<Task>> elements, Map<String, List<Task>> residents) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Task(String id, String event, Integer goal, String name, String description,
                       Integer rapport, Integer gold, Integer remnants) { }

    // ── Shipped defaults ──────────────────────────────────────────────────────
    public static final int DEFAULT_FACILITY_AFFINITY_PERCENT = 20;
    public static final int DEFAULT_FACILITY_NEUTRAL_PERCENT = 5;
    public static final int DEFAULT_WOODLOT_AFFINITY_PERCENT = 15;
    public static final int DEFAULT_TOOL_TIER_PERCENT = 20;
    public static final int DEFAULT_ELEMENTAL_NETWORK_PERCENT = 10;
    public static final int DEFAULT_RAPPORT_STEP_PERCENT = 10;
    /** Points needed to reach rapport levels 0..5. Index is the level. */
    public static final List<Integer> DEFAULT_RAPPORT_THRESHOLDS = List.of(0, 5, 12, 22, 36, 55);
    public static final Map<String, Integer> DEFAULT_FAVORITE_PERCENT_BY_RARITY = Map.of(
            "COMMON", 5, "UNCOMMON", 8, "RARE", 12, "EPIC", 16, "LEGENDARY", 20);

    public static final KeepTuning EMPTY = new KeepTuning(List.of(), List.of(), null, List.of(), null);

    public static KeepTuning orEmpty(KeepTuning value) {
        return value == null ? EMPTY : value;
    }

    // ── Buildings ─────────────────────────────────────────────────────────────
    public double ratePerMinute(String facilityId, double shipped) {
        Building building = building(facilityId);
        Double value = building == null ? null : building.ratePerMinute();
        return value == null || !Double.isFinite(value) || value < 0 ? shipped : value;
    }

    public int storage(String facilityId, int shipped) {
        Building building = building(facilityId);
        Integer value = building == null ? null : building.storage();
        return value == null || value < 1 ? shipped : value;
    }

    private Building building(String facilityId) {
        if (buildings == null || facilityId == null) return null;
        for (Building building : buildings) {
            if (building != null && facilityId.equalsIgnoreCase(trim(building.id()))) return building;
        }
        return null;
    }

    // ── Projects ──────────────────────────────────────────────────────────────
    public int timberCost(String projectId, int shipped) {
        Project project = project(projectId);
        Integer value = project == null ? null : project.timberCost();
        return value == null || value < 0 ? shipped : value;
    }

    public long durationSeconds(String projectId, long shipped) {
        Project project = project(projectId);
        Long value = project == null ? null : project.seconds();
        return value == null || value < 1 ? shipped : value;
    }

    private Project project(String projectId) {
        if (projects == null || projectId == null) return null;
        for (Project project : projects) {
            if (project != null && projectId.equalsIgnoreCase(trim(project.id()))) return project;
        }
        return null;
    }

    // ── Buffs ─────────────────────────────────────────────────────────────────
    public int facilityAffinityPercent() {
        return positive(buffs == null ? null : buffs.facilityAffinityPercent(), DEFAULT_FACILITY_AFFINITY_PERCENT);
    }

    public int facilityNeutralPercent() {
        return positive(buffs == null ? null : buffs.facilityNeutralPercent(), DEFAULT_FACILITY_NEUTRAL_PERCENT);
    }

    public int woodlotAffinityPercent() {
        return positive(buffs == null ? null : buffs.woodlotAffinityPercent(), DEFAULT_WOODLOT_AFFINITY_PERCENT);
    }

    public int toolTierPercent() {
        return positive(buffs == null ? null : buffs.toolTierPercent(), DEFAULT_TOOL_TIER_PERCENT);
    }

    public int elementalNetworkPercent() {
        return positive(buffs == null ? null : buffs.elementalNetworkPercent(), DEFAULT_ELEMENTAL_NETWORK_PERCENT);
    }

    public int rapportStepPercent() {
        return positive(buffs == null ? null : buffs.rapportStepPercent(), DEFAULT_RAPPORT_STEP_PERCENT);
    }

    public int favoritePercent(String rarity) {
        String key = rarity == null || rarity.isBlank() ? "COMMON" : rarity.trim().toUpperCase(Locale.ROOT);
        Map<String, Integer> overrides = buffs == null ? null : buffs.favoritePercentByRarity();
        if (overrides != null) {
            Integer value = overrides.get(key);
            if (value != null && value >= 0) return value;
        }
        Integer shipped = DEFAULT_FAVORITE_PERCENT_BY_RARITY.get(key);
        return shipped == null ? DEFAULT_FAVORITE_PERCENT_BY_RARITY.get("COMMON") : shipped;
    }

    /**
     * Ascending point thresholds indexed by rapport level. Always starts at 0 and never
     * decreases, so a malformed dashboard row cannot produce an unreachable level.
     */
    public List<Integer> rapportThresholds() {
        List<Integer> configured = buffs == null ? null : buffs.rapportThresholds();
        if (configured == null || configured.size() < 2) return DEFAULT_RAPPORT_THRESHOLDS;
        List<Integer> out = new java.util.ArrayList<>();
        int previous = 0;
        for (int index = 0; index < configured.size(); index++) {
            Integer value = configured.get(index);
            int normalized = index == 0 ? 0 : Math.max(previous + 1, value == null ? previous + 1 : value);
            out.add(normalized);
            previous = normalized;
        }
        return List.copyOf(out);
    }

    public int rapportMaxLevel() {
        return rapportThresholds().size() - 1;
    }

    // ── Recipes ───────────────────────────────────────────────────────────────
    public String recipeName(String recipeId, String shipped) {
        Recipe recipe = recipe(recipeId);
        String value = recipe == null ? "" : trim(recipe.name());
        return value.isBlank() ? shipped : value;
    }

    public String recipeBonusLabel(String recipeId, String shipped) {
        Recipe recipe = recipe(recipeId);
        String value = recipe == null ? "" : trim(recipe.bonusLabel());
        return value.isBlank() ? shipped : value;
    }

    public Map<String, Integer> recipeCosts(String recipeId, Map<String, Integer> shipped) {
        Recipe recipe = recipe(recipeId);
        Map<String, Integer> costs = recipe == null ? null : recipe.costs();
        if (costs == null || costs.isEmpty()) return shipped;
        Map<String, Integer> out = new LinkedHashMap<>();
        costs.forEach((id, amount) -> {
            if (id != null && !id.isBlank() && amount != null && amount > 0) out.put(id.trim(), amount);
        });
        return out.isEmpty() ? shipped : Map.copyOf(out);
    }

    private Recipe recipe(String recipeId) {
        if (recipes == null || recipeId == null) return null;
        for (Recipe recipe : recipes) {
            if (recipe != null && recipeId.equalsIgnoreCase(trim(recipe.id()))) return recipe;
        }
        return null;
    }

    // ── Tasks ─────────────────────────────────────────────────────────────────
    public List<Task> residentTasks(String residentId) {
        Map<String, List<Task>> byResident = tasks == null ? null : tasks.residents();
        return lookupTasks(byResident, residentId);
    }

    public List<Task> elementTasks(String element) {
        Map<String, List<Task>> byElement = tasks == null ? null : tasks.elements();
        return lookupTasks(byElement, element);
    }

    private static List<Task> lookupTasks(Map<String, List<Task>> source, String key) {
        if (source == null || key == null || key.isBlank()) return List.of();
        for (Map.Entry<String, List<Task>> entry : source.entrySet()) {
            if (entry.getKey() != null && key.trim().equalsIgnoreCase(entry.getKey().trim())
                    && entry.getValue() != null && !entry.getValue().isEmpty()) {
                return entry.getValue().stream().filter(java.util.Objects::nonNull).toList();
            }
        }
        return List.of();
    }

    private static int positive(Integer value, int shipped) {
        return value == null || value < 0 ? shipped : value;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
