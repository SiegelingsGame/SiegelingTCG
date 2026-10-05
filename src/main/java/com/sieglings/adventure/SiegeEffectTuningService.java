package com.sieglings.adventure;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.sieglings.service.CardOverrideStorageService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Live, dashboard-editable tuning for the knobs every Siege ability of a given
 * {@link Effect} shares — the value bonus a board move gains when it is
 * translated into Siege, the ceiling on that value, the AP floor, and how many
 * rounds a granted buff holds.
 *
 * <p>These lived as literals inside {@code SiegeContentService} and
 * {@link SiegeTuning}, which meant rebalancing one effect across every card that
 * uses it needed a deploy. The defaults here are exactly those literals, so an
 * empty override document behaves identically to the old hardcoded build.
 *
 * <p>Storage follows the same Firestore-with-local-file fallback as
 * {@code ShopPriceCatalogService}, reusing {@code CardOverrideStorageService} for
 * the client and publish plumbing, so the Siege effect settings live beside the
 * card overrides the dashboard already writes.
 */
@Service
public class SiegeEffectTuningService {

    /** One stored override row. Null fields mean "leave this knob at its default". */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record EffectOverride(
            String effect,
            Integer valueBonus,
            Integer valueCap,
            Integer minActionCost,
            Integer durationRounds
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GlobalOverride(
            Integer ultimateBuffRounds,
            Integer riderBuffRounds,
            Integer boonBuffRounds,
            Integer ampValueBonus,
            Integer ampCostReduction,
            Integer executeBossPercent
    ) {}

    /**
     * One move's Siege numbers, named by the designer instead of derived. A null
     * field means "keep deriving that one" — the per-effect bonus applied to the
     * printed board value — so a row may pin the damage and still let the AP
     * cost follow the card.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record MoveOverride(String moveId, Integer value, Integer actionCost) {}

    /**
     * A Signature Ultimate override — the card a fully evolved Siegeling carries
     * in place of its spent Evolution card. {@code key} is either
     * {@code element:FIRE} (the type-wide default every Fire Siegeling inherits)
     * or a Siegeling card id (that one individual). Every field is optional: null
     * means "inherit" — card row → element row → built-in element default — so a
     * designer can rename one Siegeling's ultimate and keep its type's numbers.
     * {@code status} "NONE" explicitly drops the inherited status.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SignatureOverride(String key, String name, String effect, Integer value, String target,
                                    Integer actionCost, String status, Integer statusChance,
                                    String description) {
        boolean isEmpty() {
            return name == null && effect == null && value == null && target == null && actionCost == null
                    && status == null && statusChance == null && description == null;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TuningFile(List<EffectOverride> effects, GlobalOverride globals, List<MoveOverride> moves,
                             List<SignatureOverride> signatures) {
        /** Documents written before Signature Ultimates existed carry no `signatures`. */
        public TuningFile(List<EffectOverride> effects, GlobalOverride globals, List<MoveOverride> moves) {
            this(effects, globals, moves, List.of());
        }

        @Override
        public List<SignatureOverride> signatures() {
            return signatures == null ? List.of() : signatures;
        }
    }

    /**
     * The knobs an effect actually uses. A row only offers the fields its effect
     * reads, so the dashboard cannot invite an edit that does nothing — a buff
     * duration on {@code DRAW} would be a promise the engine never keeps.
     */
    public record EffectRow(
            Effect effect,
            String label,
            List<String> fields,
            int defaultValueBonus,
            int defaultValueCap,
            int defaultMinActionCost,
            int defaultDurationRounds,
            Integer overrideValueBonus,
            Integer overrideValueCap,
            Integer overrideMinActionCost,
            Integer overrideDurationRounds,
            int valueBonus,
            int valueCap,
            int minActionCost,
            int durationRounds,
            boolean isOverride
    ) {}

    public record GlobalRow(
            String key,
            String label,
            String description,
            int defaultValue,
            Integer overrideValue,
            int value,
            boolean isOverride
    ) {}

    public record Snapshot(
            List<EffectRow> effects,
            List<GlobalRow> globals,
            CardOverrideStorageService.StorageBackend backend,
            String updatedBy,
            String updatedAt
    ) {}

    // ---- Field names an effect may expose ---------------------------------

    public static final String FIELD_VALUE_BONUS = "valueBonus";
    public static final String FIELD_VALUE_CAP = "valueCap";
    public static final String FIELD_MIN_ACTION_COST = "minActionCost";
    public static final String FIELD_DURATION_ROUNDS = "durationRounds";

    /** Per-move fields, distinct from the shared per-effect knobs above. */
    public static final String FIELD_MOVE_VALUE = "value";
    public static final String FIELD_MOVE_ACTION_COST = "actionCost";

    /** Guard rails: a dashboard typo must not be able to write an unplayable rule. */
    public static final int MIN_FIELD_VALUE = 0;
    public static final int MAX_VALUE_BONUS = 40;
    public static final int MAX_VALUE_CAP = 99;
    public static final int MAX_ACTION_COST = 5;
    public static final int MAX_DURATION_ROUNDS = 20;
    /** A pinned move magnitude: high enough for a Siegelord-killer, not a typo'd 900. */
    public static final int MAX_MOVE_VALUE = 99;

    private record Defaults(int valueBonus, int valueCap, int minActionCost, int durationRounds,
                            List<String> fields, String label) {}

    /**
     * Per-effect defaults, matching what the code did before this was editable:
     * damage +2, the healing family +3, buffs at their written value for
     * {@link SiegeTuning#BUFF_ATK_ROUNDS} rounds, draw and AP capped, execute
     * priced at a 3 AP floor.
     */
    private static final Map<Effect, Defaults> DEFAULTS = new EnumMap<>(Effect.class);

    static {
        DEFAULTS.put(Effect.DAMAGE, new Defaults(2, 0, 0, 0,
                List.of(FIELD_VALUE_BONUS), "Damage"));
        DEFAULTS.put(Effect.HEAL, new Defaults(3, 0, 0, 0,
                List.of(FIELD_VALUE_BONUS), "Heal"));
        DEFAULTS.put(Effect.SHIELD, new Defaults(3, 0, 0, 1,
                List.of(FIELD_VALUE_BONUS, FIELD_DURATION_ROUNDS), "Shield"));
        DEFAULTS.put(Effect.MAX_HP_BOOST, new Defaults(3, 0, 0, 0,
                List.of(FIELD_VALUE_BONUS), "Max HP boost"));
        DEFAULTS.put(Effect.BUFF_ATK, new Defaults(0, 0, 0, SiegeTuning.BUFF_ATK_ROUNDS,
                List.of(FIELD_VALUE_BONUS, FIELD_DURATION_ROUNDS), "Attack buff"));
        DEFAULTS.put(Effect.BUFF_SPD, new Defaults(0, 0, 0, SiegeTuning.BUFF_SPD_ROUNDS,
                List.of(FIELD_VALUE_BONUS, FIELD_DURATION_ROUNDS), "Speed buff"));
        DEFAULTS.put(Effect.SLOW, new Defaults(0, 0, 0, 0,
                List.of(FIELD_VALUE_BONUS), "Slow"));
        DEFAULTS.put(Effect.STUN, new Defaults(0, 0, 0, 0, List.of(), "Stun"));
        DEFAULTS.put(Effect.DRAW, new Defaults(0, 3, 0, 0,
                List.of(FIELD_VALUE_CAP), "Draw"));
        DEFAULTS.put(Effect.GAIN_AP, new Defaults(0, 2, 0, 0,
                List.of(FIELD_VALUE_CAP), "Gain AP"));
        DEFAULTS.put(Effect.EXECUTE, new Defaults(0, 0, 3, 0,
                List.of(FIELD_MIN_ACTION_COST), "Execute"));
        DEFAULTS.put(Effect.SWAP, new Defaults(0, 0, 0, 0, List.of(), "Swap notches"));
        DEFAULTS.put(Effect.EVOLVE, new Defaults(0, 0, 0, 0, List.of(), "Evolve"));
    }

    private record GlobalDef(String label, String description, int defaultValue, int max) {}

    private static final Map<String, GlobalDef> GLOBAL_DEFS = new LinkedHashMap<>();

    static {
        GLOBAL_DEFS.put("ultimateBuffRounds", new GlobalDef("Ultimate buff rounds",
                "How long the buff half of a Knight Ultimate holds.",
                SiegeTuning.ULTIMATE_BUFF_ROUNDS, MAX_DURATION_ROUNDS));
        GLOBAL_DEFS.put("riderBuffRounds", new GlobalDef("Amp rider buff rounds",
                "How long the ATTACK rider on an amplified swap move holds.",
                SiegeTuning.RIDER_BUFF_ROUNDS, MAX_DURATION_ROUNDS));
        GLOBAL_DEFS.put("boonBuffRounds", new GlobalDef("Mercenary Boon rounds",
                "How long a hired mercenary's signature Boon buff holds.",
                SiegeTuning.BOON_BUFF_ROUNDS, MAX_DURATION_ROUNDS));
        GLOBAL_DEFS.put("ampValueBonus", new GlobalDef("Amp value bonus",
                "Magnitude a level-up amplification adds to a move.",
                SiegeTuning.AMP_VALUE_BONUS, MAX_VALUE_BONUS));
        GLOBAL_DEFS.put("ampCostReduction", new GlobalDef("Amp cost reduction",
                "AP a cost-amplified move saves; never below 0 AP.",
                SiegeTuning.AMP_COST_REDUCTION, MAX_ACTION_COST));
        GLOBAL_DEFS.put("executeBossPercent", new GlobalDef("Execute vs elite/boss (%)",
                "Percent of max HP an execute deals to an elite or Siegelord instead of killing it.",
                (int) Math.round(SiegeCombatEngine.EXECUTE_BOSS_FRACTION * 100), 100));
    }

    private static final long CACHE_TTL_MILLIS = 60_000L;
    static final String RESOURCE_PATH = "cards/siege-effect-tuning.json";
    private static final Path PROJECT_RESOURCE_PATH =
            Path.of("src", "main", "resources", "cards", "siege-effect-tuning.json");

    /** What storage holds right now, independent of when it was read. */
    public record StoredData(TuningFile file, CardOverrideStorageService.StorageBackend backend,
                             String updatedBy, String updatedAt) {}

    private record CacheEntry(StoredData stored, long loadedAtMillis) {}

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService storage;
    private final String firestoreCollection;
    private final String firestoreDocument;

    private volatile CacheEntry cacheEntry;

    public SiegeEffectTuningService(
            ObjectMapper objectMapper,
            CardOverrideStorageService storage,
            @Value("${app.card-editor.firestore-collection:appConfig}") String firestoreCollection,
            @Value("${app.card-editor.firestore-siege-effects-document:siegeEffectTuning}") String firestoreDocument) {
        this.objectMapper = objectMapper;
        this.storage = storage;
        this.firestoreCollection = firestoreCollection;
        this.firestoreDocument = firestoreDocument;
    }

    // ---- Read side (what the engine and content service ask) --------------

    /** Extra magnitude an effect's board value gains when translated into Siege. */
    public int valueBonus(Effect effect) {
        return resolve(effect, FIELD_VALUE_BONUS);
    }

    /** Ceiling on an effect's magnitude, or 0 when the effect is uncapped. */
    public int valueCap(Effect effect) {
        return resolve(effect, FIELD_VALUE_CAP);
    }

    /** AP floor an effect's cards may never price below, or 0 when there is none. */
    public int minActionCost(Effect effect) {
        return resolve(effect, FIELD_MIN_ACTION_COST);
    }

    /**
     * Rounds a buff from this effect holds. 0 means the effect grants nothing
     * that expires (or, for {@code MAX_HP_BOOST}, that it lasts the battle).
     */
    public int durationRounds(Effect effect) {
        return resolve(effect, FIELD_DURATION_ROUNDS);
    }

    /**
     * The damage/heal/shield magnitude a designer pinned on this move, or null
     * when the move still derives its value from the board card.
     */
    public Integer moveValue(String moveId) {
        MoveOverride o = findMove(load().file(), moveId);
        return o == null ? null : o.value();
    }

    /** The AP cost a designer pinned on this move, or null when it derives. */
    public Integer moveActionCost(String moveId) {
        MoveOverride o = findMove(load().file(), moveId);
        return o == null ? null : o.actionCost();
    }

    /** Every stored move override, keyed by move id — for the dashboard listing. */
    public Map<String, MoveOverride> moveOverrides() {
        Map<String, MoveOverride> out = new LinkedHashMap<>();
        for (MoveOverride row : load().file().moves()) {
            String id = normalizeMoveId(row == null ? null : row.moveId());
            if (id != null) out.put(id, row);
        }
        return out;
    }

    private static String normalizeMoveId(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static MoveOverride findMove(TuningFile file, String moveId) {
        String id = normalizeMoveId(moveId);
        if (id == null) return null;
        for (MoveOverride row : file.moves()) {
            if (row != null && id.equalsIgnoreCase(normalizeMoveId(row.moveId()))) return row;
        }
        return null;
    }

    public int globalValue(String key) {
        GlobalDef def = GLOBAL_DEFS.get(key);
        if (def == null) return 0;
        Integer override = overrideGlobal(load().file().globals(), key);
        return override != null ? override : def.defaultValue();
    }

    /** Fraction of max HP an execute takes off an elite or Siegelord. */
    public double executeBossFraction() {
        return globalValue("executeBossPercent") / 100.0;
    }

    private int resolve(Effect effect, String field) {
        Defaults defaults = DEFAULTS.get(effect);
        if (defaults == null) return 0;
        if (!defaults.fields().contains(field)) return fieldOf(defaults, field);
        Integer override = overrideField(findOverride(load().file(), effect), field);
        return override != null ? override : fieldOf(defaults, field);
    }

    private static int fieldOf(Defaults d, String field) {
        return switch (field) {
            case FIELD_VALUE_BONUS -> d.valueBonus();
            case FIELD_VALUE_CAP -> d.valueCap();
            case FIELD_MIN_ACTION_COST -> d.minActionCost();
            case FIELD_DURATION_ROUNDS -> d.durationRounds();
            default -> 0;
        };
    }

    private static Integer overrideField(EffectOverride o, String field) {
        if (o == null) return null;
        return switch (field) {
            case FIELD_VALUE_BONUS -> o.valueBonus();
            case FIELD_VALUE_CAP -> o.valueCap();
            case FIELD_MIN_ACTION_COST -> o.minActionCost();
            case FIELD_DURATION_ROUNDS -> o.durationRounds();
            default -> null;
        };
    }

    private static Integer overrideGlobal(GlobalOverride g, String key) {
        if (g == null) return null;
        return switch (key) {
            case "ultimateBuffRounds" -> g.ultimateBuffRounds();
            case "riderBuffRounds" -> g.riderBuffRounds();
            case "boonBuffRounds" -> g.boonBuffRounds();
            case "ampValueBonus" -> g.ampValueBonus();
            case "ampCostReduction" -> g.ampCostReduction();
            case "executeBossPercent" -> g.executeBossPercent();
            default -> null;
        };
    }

    // ---- Dashboard side ---------------------------------------------------

    public Snapshot buildSnapshot() {
        StoredData stored = load();
        return new Snapshot(buildRows(stored.file()), buildGlobals(stored.file()),
                stored.backend(), stored.updatedBy(), stored.updatedAt());
    }

    /**
     * One effect's pending edit: the knobs to write (a null value clears that one
     * knob back to its default), or {@code reset} to drop the whole row.
     */
    public record EffectPatch(Effect effect, Map<String, Integer> fields, boolean reset) {}

    /**
     * One move's pending edit. Same shape as {@link EffectPatch}: a field mapped
     * to null clears that number back to derived, {@code reset} drops the row.
     */
    public record MovePatch(String moveId, Map<String, Integer> fields, boolean reset) {}

    /**
     * Applies any number of effect and global edits in a single write. The
     * dashboard edits a whole screen of settings at once, and saving each one
     * separately meant a storage round trip per number and a window where half
     * the change was live; everything is validated first, then written once.
     */
    public Snapshot applyChanges(List<EffectPatch> patches, Map<String, Integer> globals, String updatedByEmail) {
        return applyChanges(patches, globals, List.of(), updatedByEmail);
    }

    /** Writes only per-move numbers, leaving the shared effect knobs alone. */
    public Snapshot applyMoveChanges(List<MovePatch> movePatches, String updatedByEmail) {
        return applyChanges(List.of(), Map.of(), movePatches, updatedByEmail);
    }

    /**
     * Applies effect, global and per-move edits in one write, validating all of
     * them first so a typo in the last row cannot leave the earlier ones already
     * published.
     */
    public Snapshot applyChanges(List<EffectPatch> patches, Map<String, Integer> globals,
                                 List<MovePatch> movePatches, String updatedByEmail) {
        List<EffectPatch> effectPatches = patches == null ? List.of() : patches;
        Map<String, Integer> globalPatches = globals == null ? Map.of() : globals;
        List<MovePatch> movePatchList = movePatches == null ? List.of() : movePatches;
        if (effectPatches.isEmpty() && globalPatches.isEmpty() && movePatchList.isEmpty()) {
            throw new IllegalArgumentException("No settings were sent.");
        }

        TuningFile current = load().file();
        Map<Effect, EffectOverride> merged = new LinkedHashMap<>();
        for (EffectOverride row : current.effects()) {
            Effect effect = effectOf(row);
            if (effect != null) merged.put(effect, row);
        }

        // Validate every patch before touching storage: a typo in the last tile
        // must not leave the first twelve already published.
        for (EffectPatch patch : effectPatches) {
            if (patch == null || patch.effect() == null) {
                throw new IllegalArgumentException("An effect is required.");
            }
            Effect effect = patch.effect();
            if (patch.reset()) {
                merged.remove(effect);
                continue;
            }
            Defaults defaults = DEFAULTS.get(effect);
            if (defaults == null || defaults.fields().isEmpty()) {
                throw new IllegalArgumentException(effect.name() + " has no shared settings to edit.");
            }
            EffectOverride existing = merged.get(effect);
            Map<String, Integer> fields = patch.fields() == null ? Map.of() : patch.fields();
            Integer valueBonus = merge(existing == null ? null : existing.valueBonus(), fields,
                    FIELD_VALUE_BONUS, defaults, effect, MAX_VALUE_BONUS);
            Integer valueCap = merge(existing == null ? null : existing.valueCap(), fields,
                    FIELD_VALUE_CAP, defaults, effect, MAX_VALUE_CAP);
            Integer minCost = merge(existing == null ? null : existing.minActionCost(), fields,
                    FIELD_MIN_ACTION_COST, defaults, effect, MAX_ACTION_COST);
            Integer duration = merge(existing == null ? null : existing.durationRounds(), fields,
                    FIELD_DURATION_ROUNDS, defaults, effect, MAX_DURATION_ROUNDS);
            if (valueBonus == null && valueCap == null && minCost == null && duration == null) {
                merged.remove(effect); // every knob is back at its default
            } else {
                merged.put(effect, new EffectOverride(effect.name(), valueBonus, valueCap, minCost, duration));
            }
        }

        GlobalOverride globalsOut = current.globals();
        for (Map.Entry<String, Integer> entry : globalPatches.entrySet()) {
            globalsOut = withGlobal(globalsOut, entry.getKey(), entry.getValue());
        }

        // Move ids are matched case-insensitively but stored as the dashboard
        // sent them, so a row keeps the id the catalog prints.
        Map<String, MoveOverride> mergedMoves = new LinkedHashMap<>();
        for (MoveOverride row : current.moves()) {
            String id = normalizeMoveId(row == null ? null : row.moveId());
            if (id != null) mergedMoves.put(id.toLowerCase(Locale.ROOT), row);
        }
        for (MovePatch patch : movePatchList) {
            String id = normalizeMoveId(patch == null ? null : patch.moveId());
            if (id == null) throw new IllegalArgumentException("A move id is required.");
            String key = id.toLowerCase(Locale.ROOT);
            if (patch.reset()) {
                mergedMoves.remove(key);
                continue;
            }
            MoveOverride existing = mergedMoves.get(key);
            Map<String, Integer> fields = patch.fields() == null ? Map.of() : patch.fields();
            Integer value = mergeMoveField(existing == null ? null : existing.value(), fields,
                    FIELD_MOVE_VALUE, MAX_MOVE_VALUE);
            Integer cost = mergeMoveField(existing == null ? null : existing.actionCost(), fields,
                    FIELD_MOVE_ACTION_COST, MAX_ACTION_COST);
            if (value == null && cost == null) {
                mergedMoves.remove(key); // both numbers are derived again
            } else {
                mergedMoves.put(key, new MoveOverride(id, value, cost));
            }
        }

        return save(new TuningFile(List.copyOf(merged.values()), globalsOut,
                List.copyOf(mergedMoves.values()), current.signatures()), updatedByEmail);
    }

    private Integer mergeMoveField(Integer current, Map<String, Integer> fields, String field, int max) {
        if (!fields.containsKey(field)) return current;
        Integer value = fields.get(field);
        if (value == null) return null; // explicit reset of this one number
        if (value < MIN_FIELD_VALUE || value > max) {
            throw new IllegalArgumentException(field + " must be between " + MIN_FIELD_VALUE + " and " + max + ".");
        }
        return value;
    }

    /** Writes one effect's knobs. Kept for callers editing a single row. */
    public Snapshot setEffect(Effect effect, Map<String, Integer> fields, String updatedByEmail) {
        if (effect == null) throw new IllegalArgumentException("An effect is required.");
        return applyChanges(List.of(new EffectPatch(effect, fields, false)), Map.of(), updatedByEmail);
    }

    /** Drops every override on one effect, returning it to the built-in defaults. */
    public Snapshot resetEffect(Effect effect, String updatedByEmail) {
        if (effect == null) throw new IllegalArgumentException("An effect is required.");
        return applyChanges(List.of(new EffectPatch(effect, Map.of(), true)), Map.of(), updatedByEmail);
    }

    public Snapshot setGlobal(String key, Integer value, String updatedByEmail) {
        Map<String, Integer> one = new LinkedHashMap<>();
        one.put(key, value);
        return applyChanges(List.of(), one, updatedByEmail);
    }

    /** Validates one cross-effect setting and returns the globals with it applied. */
    private GlobalOverride withGlobal(GlobalOverride g, String key, Integer value) {
        GlobalDef def = key == null ? null : GLOBAL_DEFS.get(key);
        if (def == null) throw new IllegalArgumentException("Unknown setting: " + key);
        if (value != null && (value < MIN_FIELD_VALUE || value > def.max())) {
            throw new IllegalArgumentException(def.label() + " must be between "
                    + MIN_FIELD_VALUE + " and " + def.max() + ".");
        }
        return new GlobalOverride(
                "ultimateBuffRounds".equals(key) ? value : overrideGlobal(g, "ultimateBuffRounds"),
                "riderBuffRounds".equals(key) ? value : overrideGlobal(g, "riderBuffRounds"),
                "boonBuffRounds".equals(key) ? value : overrideGlobal(g, "boonBuffRounds"),
                "ampValueBonus".equals(key) ? value : overrideGlobal(g, "ampValueBonus"),
                "ampCostReduction".equals(key) ? value : overrideGlobal(g, "ampCostReduction"),
                "executeBossPercent".equals(key) ? value : overrideGlobal(g, "executeBossPercent"));
    }

    /** The effect a stored row names, or null when the row is unreadable. */
    private static Effect effectOf(EffectOverride row) {
        if (row == null || row.effect() == null) return null;
        try {
            return Effect.valueOf(row.effect().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private Integer merge(Integer current, Map<String, Integer> fields, String field,
                          Defaults defaults, Effect effect, int max) {
        if (fields == null || !fields.containsKey(field)) return current;
        if (!defaults.fields().contains(field)) {
            throw new IllegalArgumentException(effect.name() + " does not use " + field + ".");
        }
        Integer value = fields.get(field);
        if (value == null) return null; // explicit reset of this one knob
        if (value < MIN_FIELD_VALUE || value > max) {
            throw new IllegalArgumentException(field + " must be between " + MIN_FIELD_VALUE + " and " + max + ".");
        }
        return value;
    }

    private List<EffectRow> buildRows(TuningFile file) {
        List<EffectRow> rows = new ArrayList<>();
        for (Effect effect : Effect.values()) {
            Defaults d = DEFAULTS.get(effect);
            if (d == null) continue;
            EffectOverride o = findOverride(file, effect);
            Integer oBonus = overrideField(o, FIELD_VALUE_BONUS);
            Integer oCap = overrideField(o, FIELD_VALUE_CAP);
            Integer oCost = overrideField(o, FIELD_MIN_ACTION_COST);
            Integer oDuration = overrideField(o, FIELD_DURATION_ROUNDS);
            rows.add(new EffectRow(effect, d.label(), d.fields(),
                    d.valueBonus(), d.valueCap(), d.minActionCost(), d.durationRounds(),
                    oBonus, oCap, oCost, oDuration,
                    oBonus != null ? oBonus : d.valueBonus(),
                    oCap != null ? oCap : d.valueCap(),
                    oCost != null ? oCost : d.minActionCost(),
                    oDuration != null ? oDuration : d.durationRounds(),
                    oBonus != null || oCap != null || oCost != null || oDuration != null));
        }
        return rows;
    }

    private List<GlobalRow> buildGlobals(TuningFile file) {
        List<GlobalRow> rows = new ArrayList<>();
        GLOBAL_DEFS.forEach((key, def) -> {
            Integer override = overrideGlobal(file.globals(), key);
            rows.add(new GlobalRow(key, def.label(), def.description(), def.defaultValue(), override,
                    override != null ? override : def.defaultValue(), override != null));
        });
        return rows;
    }

    private static boolean sameEffect(EffectOverride row, Effect effect) {
        return row != null && row.effect() != null
                && row.effect().trim().equalsIgnoreCase(effect.name());
    }

    private static EffectOverride findOverride(TuningFile file, Effect effect) {
        for (EffectOverride row : file.effects()) {
            if (sameEffect(row, effect)) return row;
        }
        return null;
    }

    /** Parses an effect name from the dashboard, rejecting anything unknown. */
    public static Effect parseEffect(Object raw) {
        String value = raw == null ? "" : String.valueOf(raw).trim();
        try {
            return Effect.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unknown effect: " + raw);
        }
    }

    // ---- Signature Ultimates ---------------------------------------------

    /** Guard rails for the Signature Ultimate editor. */
    public static final int MAX_SIGNATURE_NAME = 40;
    public static final int MAX_SIGNATURE_DESCRIPTION = 220;

    /** A fully resolved Signature Ultimate, before it becomes a card. */
    public record SignatureSpec(String name, Effect effect, int value, TargetKind target, int actionCost,
                                StatusKind status, int statusChance, String description) {}

    /**
     * Effects a Signature may use. EVOLVE has nowhere left to go on a final form,
     * and SWAP has no magnitude to make it feel like an ultimate.
     */
    public static final List<Effect> SIGNATURE_EFFECTS = List.of(
            Effect.DAMAGE, Effect.HEAL, Effect.SHIELD, Effect.MAX_HP_BOOST, Effect.BUFF_ATK,
            Effect.BUFF_SPD, Effect.SLOW, Effect.STUN, Effect.DRAW, Effect.GAIN_AP, Effect.EXECUTE);

    /**
     * The built-in, type-wide ultimates. Each leans on its element's status so the
     * type reads at a glance — and each is bigger than any ordinary move, since it
     * is once a battle and gated behind a full gauge.
     */
    private static final Map<com.sieglings.model.enums.Element, SignatureSpec> SIGNATURE_DEFAULTS =
            new EnumMap<>(com.sieglings.model.enums.Element.class);

    static {
        sig(com.sieglings.model.enums.Element.FIRE, "Inferno Crown", Effect.DAMAGE, 9, TargetKind.ALL_ENEMIES, 2,
                StatusKind.BURN, 100, "Engulfs every foe in flame — all of them catch fire.");
        sig(com.sieglings.model.enums.Element.WATER, "Tidal Requiem", Effect.DAMAGE, 8, TargetKind.ALL_ENEMIES, 2,
                StatusKind.SOAK, 100, "A crashing wave soaks the whole enemy line.");
        sig(com.sieglings.model.enums.Element.ICE, "Absolute Zero", Effect.DAMAGE, 8, TargetKind.ALL_ENEMIES, 2,
                StatusKind.SLOW, 100, "A killing frost slows every foe.");
        sig(com.sieglings.model.enums.Element.WIND, "Skybreaker Gale", Effect.DAMAGE, 8, TargetKind.ALL_ENEMIES, 2,
                StatusKind.DISORIENT, 100, "A cyclone that leaves every foe reeling.");
        sig(com.sieglings.model.enums.Element.EARTH, "Worldroot Bastion", Effect.SHIELD, 12, TargetKind.ALLY_ALL, 2,
                null, 0, "The earth rises to wall in the whole warband.");
        sig(com.sieglings.model.enums.Element.ELECTRIC, "Thunderlord's Verdict", Effect.DAMAGE, 16,
                TargetKind.ENEMY_SINGLE, 2, StatusKind.SHOCK, 100, "One colossal bolt, aimed true.");
        sig(com.sieglings.model.enums.Element.METAL, "Iron Judgement", Effect.DAMAGE, 16, TargetKind.ENEMY_SINGLE, 2,
                StatusKind.RUST, 100, "A crushing strike that rusts the target's armor — it cannot gain Shield.");
        sig(com.sieglings.model.enums.Element.POISON, "Plague Bloom", Effect.DAMAGE, 7, TargetKind.ALL_ENEMIES, 2,
                StatusKind.POISON, 100, "Toxic spores choke the enemy line — their next heals are wasted.");
        sig(com.sieglings.model.enums.Element.PSYCHIC, "Mindstorm", Effect.DAMAGE, 8, TargetKind.ALL_ENEMIES, 2,
                StatusKind.INSIGHT, 100, "A psychic tempest that lays every mind bare.");
        sig(com.sieglings.model.enums.Element.LIGHT, "Radiant Dawn", Effect.HEAL, 12, TargetKind.ALLY_ALL, 2,
                null, 0, "A blinding sunrise that mends the whole warband.");
        sig(com.sieglings.model.enums.Element.SHADOW, "Eclipse", Effect.DAMAGE, 15, TargetKind.ENEMY_SINGLE, 2,
                StatusKind.CURSE, 100, "Swallows one foe in darkness — its Advantage is cursed.");
        sig(com.sieglings.model.enums.Element.UNDEAD, "Grave Tide", Effect.DAMAGE, 8, TargetKind.ALL_ENEMIES, 2,
                StatusKind.WITHER, 100, "The dead rise and wither every foe.");
        sig(com.sieglings.model.enums.Element.NEUTRAL, "Final Form", Effect.BUFF_ATK, 3, TargetKind.ALLY_ALL, 2,
                null, 0, "Rallies the whole warband to strike harder.");
    }

    private static void sig(com.sieglings.model.enums.Element element, String name, Effect effect, int value,
                            TargetKind target, int cost, StatusKind status, int chance, String description) {
        SIGNATURE_DEFAULTS.put(element, new SignatureSpec(name, effect, value, target, cost, status, chance,
                description));
    }

    public static String elementKey(com.sieglings.model.enums.Element element) {
        return "element:" + (element == null ? com.sieglings.model.enums.Element.NEUTRAL : element).name();
    }

    /** The built-in ultimate for a type, before any dashboard edit. */
    public static SignatureSpec builtInSignature(com.sieglings.model.enums.Element element) {
        SignatureSpec spec = SIGNATURE_DEFAULTS.get(element == null ? com.sieglings.model.enums.Element.NEUTRAL : element);
        return spec != null ? spec : SIGNATURE_DEFAULTS.get(com.sieglings.model.enums.Element.NEUTRAL);
    }

    /** The stored override for a key (element key or card id), or null. */
    public SignatureOverride signatureOverride(String key) {
        String id = normalizeMoveId(key);
        if (id == null) return null;
        for (SignatureOverride row : load().file().signatures()) {
            if (row != null && id.equalsIgnoreCase(normalizeMoveId(row.key()))) return row;
        }
        return null;
    }

    /** The type-wide ultimate after the element row's edits. */
    public SignatureSpec elementSignature(com.sieglings.model.enums.Element element) {
        return overlay(builtInSignature(element), signatureOverride(elementKey(element)));
    }

    /**
     * One Siegeling's ultimate: its type's (edited) ultimate, renamed after the
     * Siegeling so no two individuals share a card name, then that Siegeling's
     * own edits on top.
     */
    public SignatureSpec signatureFor(com.sieglings.model.enums.Element element, String cardId, String cardName) {
        SignatureSpec type = elementSignature(element);
        SignatureSpec individual = new SignatureSpec(defaultIndividualName(cardName, type.name()), type.effect(),
                type.value(), type.target(), type.actionCost(), type.status(), type.statusChance(),
                type.description());
        return overlay(individual, signatureOverride(cardId));
    }

    public static String defaultIndividualName(String cardName, String typeName) {
        if (cardName == null || cardName.isBlank()) return typeName;
        return cardName.trim() + "'s " + typeName;
    }

    /** Applies one override row's non-null fields onto a base spec. */
    private static SignatureSpec overlay(SignatureSpec base, SignatureOverride o) {
        if (o == null) return base;
        Effect effect = o.effect() == null ? base.effect() : parseSignatureEffect(o.effect(), base.effect());
        TargetKind target = o.target() == null ? base.target() : parseTarget(o.target(), base.target());
        if (o.effect() != null && o.target() == null && !targetFits(effect, target)) {
            // Changing a heal into a strike must not leave it aimed at the warband.
            target = defaultTargetFor(effect);
        }
        StatusKind status = base.status();
        if (o.status() != null) status = parseStatus(o.status());
        int chance = o.statusChance() != null ? o.statusChance() : base.statusChance();
        if (o.status() != null && o.statusChance() == null && status != null && chance == 0) chance = 100;
        return new SignatureSpec(
                o.name() != null && !o.name().isBlank() ? o.name().trim() : base.name(),
                effect,
                o.value() != null ? o.value() : base.value(),
                target,
                o.actionCost() != null ? o.actionCost() : base.actionCost(),
                status,
                status == null ? 0 : chance,
                o.description() != null && !o.description().isBlank() ? o.description().trim() : base.description());
    }

    private static Effect parseSignatureEffect(String raw, Effect fallback) {
        try {
            Effect e = Effect.valueOf(raw.trim().toUpperCase(Locale.ROOT));
            return SIGNATURE_EFFECTS.contains(e) ? e : fallback;
        } catch (IllegalArgumentException ex) {
            return fallback;
        }
    }

    private static TargetKind parseTarget(String raw, TargetKind fallback) {
        try {
            return TargetKind.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return fallback;
        }
    }

    private static StatusKind parseStatus(String raw) {
        String v = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (v.isEmpty() || v.equals("NONE")) return null;
        try {
            return StatusKind.valueOf(v);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    /** Whether a target makes sense for an effect: strikes go at foes, blessings at friends. */
    public static boolean targetFits(Effect effect, TargetKind target) {
        if (effect == null || target == null) return false;
        return switch (effect) {
            case DAMAGE, SLOW, STUN, EXECUTE -> target == TargetKind.ENEMY_SINGLE || target == TargetKind.ALL_ENEMIES;
            case DRAW, GAIN_AP -> target == TargetKind.SELF;
            default -> target == TargetKind.ALLY_SINGLE || target == TargetKind.ALLY_ALL || target == TargetKind.SELF;
        };
    }

    public static TargetKind defaultTargetFor(Effect effect) {
        return switch (effect) {
            case DAMAGE, SLOW, STUN, EXECUTE -> TargetKind.ALL_ENEMIES;
            case DRAW, GAIN_AP -> TargetKind.SELF;
            default -> TargetKind.ALLY_ALL;
        };
    }

    /** Every stored signature row — for the dashboard listing. */
    public List<SignatureOverride> signatureOverrides() {
        return load().file().signatures();
    }

    /**
     * One signature's pending edit. A field present with a null/blank value
     * clears it back to inherited; {@code reset} drops the whole row.
     */
    public record SignaturePatch(String key, Map<String, Object> fields, boolean reset) {}

    public static final List<String> SIGNATURE_FIELDS = List.of(
            "name", "effect", "value", "target", "actionCost", "status", "statusChance", "description");

    /**
     * Writes Signature Ultimate edits in one save, validating every row first so
     * a bad target in the last row cannot half-publish the batch.
     */
    public Snapshot applySignatureChanges(List<SignaturePatch> patches, String updatedByEmail) {
        if (patches == null || patches.isEmpty()) throw new IllegalArgumentException("No signatures were sent.");
        // A publish replaces the whole tuning document. Combat may cache the empty
        // local fallback when a Firestore read fails; merging onto that and saving
        // would delete every effect, global and move pin.
        TuningFile current = loadForPublish().file();
        Map<String, SignatureOverride> merged = new LinkedHashMap<>();
        for (SignatureOverride row : current.signatures()) {
            String id = normalizeMoveId(row == null ? null : row.key());
            if (id != null) merged.put(id.toLowerCase(Locale.ROOT), row);
        }
        for (SignaturePatch patch : patches) {
            String key = normalizeMoveId(patch == null ? null : patch.key());
            if (key == null) throw new IllegalArgumentException("A signature key is required.");
            if (key.toLowerCase(Locale.ROOT).startsWith("element:")) {
                String el = key.substring("element:".length()).trim().toUpperCase(Locale.ROOT);
                try {
                    key = elementKey(com.sieglings.model.enums.Element.valueOf(el));
                } catch (IllegalArgumentException ex) {
                    throw new IllegalArgumentException("Unknown element: " + el);
                }
            }
            String lower = key.toLowerCase(Locale.ROOT);
            if (patch.reset()) {
                merged.remove(lower);
                continue;
            }
            SignatureOverride existing = merged.get(lower);
            Map<String, Object> f = patch.fields() == null ? Map.of() : patch.fields();
            SignatureOverride next = new SignatureOverride(key,
                    textField(f, "name", existing == null ? null : existing.name(), MAX_SIGNATURE_NAME),
                    enumField(f, "effect", existing == null ? null : existing.effect(), true),
                    intField(f, "value", existing == null ? null : existing.value(), MAX_MOVE_VALUE),
                    enumField(f, "target", existing == null ? null : existing.target(), false),
                    intField(f, "actionCost", existing == null ? null : existing.actionCost(), MAX_ACTION_COST),
                    statusField(f, existing == null ? null : existing.status()),
                    intField(f, "statusChance", existing == null ? null : existing.statusChance(), 100),
                    textField(f, "description", existing == null ? null : existing.description(),
                            MAX_SIGNATURE_DESCRIPTION));
            if (next.target() != null) {
                // The effect a row ends up with may be inherited, so check the pair
                // against what the row will actually resolve to.
                Effect effect = next.effect() != null ? Effect.valueOf(next.effect())
                        : existing != null && existing.effect() != null ? Effect.valueOf(existing.effect()) : null;
                if (effect != null && !targetFits(effect, TargetKind.valueOf(next.target()))) {
                    throw new IllegalArgumentException(effect.name() + " cannot target " + next.target() + ".");
                }
            }
            if (next.isEmpty()) merged.remove(lower);
            else merged.put(lower, next);
        }
        return save(new TuningFile(current.effects(), current.globals(), current.moves(),
                List.copyOf(merged.values())), updatedByEmail);
    }

    private static String textField(Map<String, Object> f, String field, String current, int max) {
        if (!f.containsKey(field)) return current;
        Object raw = f.get(field);
        String v = raw == null ? "" : String.valueOf(raw).trim();
        if (v.isEmpty()) return null;
        if (v.length() > max) throw new IllegalArgumentException(field + " must be at most " + max + " characters.");
        return v;
    }

    private static Integer intField(Map<String, Object> f, String field, Integer current, int max) {
        if (!f.containsKey(field)) return current;
        Object raw = f.get(field);
        if (raw == null || String.valueOf(raw).isBlank()) return null;
        int v;
        try {
            v = raw instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(raw).trim());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException(field + " must be a whole number.");
        }
        if (v < MIN_FIELD_VALUE || v > max) {
            throw new IllegalArgumentException(field + " must be between " + MIN_FIELD_VALUE + " and " + max + ".");
        }
        return v;
    }

    private static String enumField(Map<String, Object> f, String field, String current, boolean effect) {
        if (!f.containsKey(field)) return current;
        Object raw = f.get(field);
        String v = raw == null ? "" : String.valueOf(raw).trim().toUpperCase(Locale.ROOT);
        if (v.isEmpty()) return null;
        try {
            if (effect) {
                Effect e = Effect.valueOf(v);
                if (!SIGNATURE_EFFECTS.contains(e)) {
                    throw new IllegalArgumentException(e.name() + " cannot be a Signature Ultimate.");
                }
            } else {
                TargetKind.valueOf(v);
            }
        } catch (IllegalArgumentException ex) {
            if (ex.getMessage() != null && ex.getMessage().contains("Signature")) throw ex;
            throw new IllegalArgumentException("Unknown " + field + ": " + v);
        }
        return v;
    }

    private static String statusField(Map<String, Object> f, String current) {
        if (!f.containsKey("status")) return current;
        Object raw = f.get("status");
        String v = raw == null ? "" : String.valueOf(raw).trim().toUpperCase(Locale.ROOT);
        if (v.isEmpty()) return null;
        if (v.equals("NONE")) return v;
        try {
            StatusKind.valueOf(v);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unknown status: " + v);
        }
        return v;
    }

    // ---- Storage ----------------------------------------------------------

    private StoredData load() {
        CacheEntry cached = cacheEntry;
        if (cached != null && System.currentTimeMillis() - cached.loadedAtMillis() < CACHE_TTL_MILLIS) {
            return cached.stored();
        }
        StoredData stored = loadStored();
        cacheEntry = new CacheEntry(stored, System.currentTimeMillis());
        return stored;
    }

    /**
     * The document a publish merges onto. Combat reads may fall back to the
     * shipped defaults when Firestore blips, but a publish rewrites the whole
     * tuning document, so that fallback must never be what gets saved — it is
     * empty in production (there is no classpath copy of the live overrides)
     * and would erase every effect, global and move pin.
     */
    private StoredData loadForPublish() {
        CacheEntry cached = cacheEntry;
        if (cached != null && publishesToFirestore()
                && cached.stored().backend() != CardOverrideStorageService.StorageBackend.FIRESTORE) {
            // A combat read already cached the fallback. Drop it and try the
            // live document once more so a recovered Firestore still publishes.
            cacheEntry = null;
        }
        StoredData loaded = load();
        if (publishesToFirestore()
                && loaded.backend() != CardOverrideStorageService.StorageBackend.FIRESTORE) {
            throw new IllegalStateException(
                    "Siege tuning could not be read from Firestore, so the change was not published.");
        }
        return loaded;
    }

    /** True when a publish replaces the Firestore document rather than a local file. */
    protected boolean publishesToFirestore() {
        return storage != null && storage.isFirestoreReady();
    }

    /** Overridable for tests: reads the stored overrides from Firestore or the local file. */
    protected StoredData loadStored() {
        return storage.isFirestoreReady() ? loadFirestore() : loadLocal();
    }

    /** Overridable for tests: persists the overrides to Firestore or the local file. */
    protected StoredData saveStored(TuningFile file, String updatedByEmail) {
        return storage.isFirestoreReady() ? saveFirestore(file, updatedByEmail) : saveLocal(file);
    }

    private StoredData loadFirestore() {
        try {
            DocumentReference docRef = docRef();
            DocumentSnapshot snapshot = docRef.get().get(10, TimeUnit.SECONDS);
            TuningFile file = snapshot.exists()
                    ? parse(objectMapper.valueToTree(Map.of(
                            "effects", snapshot.get("effects") == null ? List.of() : snapshot.get("effects"),
                            "globals", snapshot.get("globals") == null ? Map.of() : snapshot.get("globals"),
                            // A document written before per-move tuning existed has
                            // no `moves` field; that reads as "nothing pinned".
                            "moves", snapshot.get("moves") == null ? List.of() : snapshot.get("moves"),
                            "signatures", snapshot.get("signatures") == null ? List.of() : snapshot.get("signatures"))))
                    : emptyFile();
            return new StoredData(file, CardOverrideStorageService.StorageBackend.FIRESTORE,
                    snapshot.getString("updatedBy"), resolveTimestamp(snapshot));
        } catch (Exception ex) {
            // A Firestore hiccup must not take Siege combat down with it: the
            // defaults are the shipped balance, so fall back rather than throw.
            return loadLocal();
        }
    }

    private StoredData loadLocal() {
        Path projectPath = PROJECT_RESOURCE_PATH.toAbsolutePath().normalize();
        boolean hasProjectFile = Files.isRegularFile(projectPath);
        TuningFile file;
        try {
            if (hasProjectFile) {
                try (InputStream stream = Files.newInputStream(projectPath)) {
                    file = parse(objectMapper.readTree(stream));
                }
            } else {
                try (InputStream stream = getClass().getClassLoader().getResourceAsStream(RESOURCE_PATH)) {
                    file = stream == null ? emptyFile() : parse(objectMapper.readTree(stream));
                }
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load Siege effect tuning.", ex);
        }
        return new StoredData(file,
                hasProjectFile ? CardOverrideStorageService.StorageBackend.PROJECT_FILE
                        : CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE,
                null, null);
    }

    private Snapshot save(TuningFile file, String updatedByEmail) {
        StoredData stored = saveStored(file, updatedByEmail);
        cacheEntry = new CacheEntry(stored, System.currentTimeMillis());
        return new Snapshot(buildRows(stored.file()), buildGlobals(stored.file()),
                stored.backend(), stored.updatedBy(), stored.updatedAt());
    }

    private StoredData saveFirestore(TuningFile file, String updatedByEmail) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("effects", objectMapper.convertValue(file.effects(), Object.class));
            payload.put("globals", objectMapper.convertValue(file.globals(), Object.class));
            payload.put("moves", objectMapper.convertValue(file.moves(), Object.class));
            payload.put("signatures", objectMapper.convertValue(file.signatures(), Object.class));
            String by = updatedByEmail == null || updatedByEmail.isBlank()
                    ? "unknown" : updatedByEmail.trim().toLowerCase(Locale.ROOT);
            payload.put("updatedBy", by);
            payload.put("updatedAt", Timestamp.now());
            docRef().set(payload).get(10, TimeUnit.SECONDS);
            return new StoredData(file, CardOverrideStorageService.StorageBackend.FIRESTORE,
                    by, Instant.now().toString());
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save Siege effect tuning to Firestore.", ex);
        }
    }

    private StoredData saveLocal(TuningFile file) {
        Path projectPath = PROJECT_RESOURCE_PATH.toAbsolutePath().normalize();
        if (projectPath.getParent() == null || !Files.isDirectory(projectPath.getParent())) {
            throw new IllegalStateException("This runtime cannot write the Siege effect tuning file.");
        }
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(projectPath.toFile(), file);
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to save Siege effect tuning to " + projectPath, ex);
        }
        return new StoredData(file, CardOverrideStorageService.StorageBackend.PROJECT_FILE,
                null, Instant.now().toString());
    }

    private TuningFile parse(JsonNode data) {
        try {
            TuningFile file = objectMapper.treeToValue(data, TuningFile.class);
            if (file == null) return emptyFile();
            return new TuningFile(file.effects() == null ? List.of() : file.effects(), file.globals(),
                    file.moves() == null ? List.of() : file.moves(), file.signatures());
        } catch (Exception ex) {
            // Malformed stored data falls back to defaults instead of breaking
            // every Siege battle until someone fixes the document.
            return emptyFile();
        }
    }

    private static TuningFile emptyFile() {
        return new TuningFile(List.of(), null, List.of(), List.of());
    }

    private DocumentReference docRef() {
        Firestore firestore = storage.requireFirestore();
        return firestore.collection(firestoreCollection).document(firestoreDocument);
    }

    private String resolveTimestamp(DocumentSnapshot snapshot) {
        Object updatedAt = snapshot.get("updatedAt");
        if (updatedAt instanceof Timestamp ts) {
            return Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()).toString();
        }
        return null;
    }

    /** Test seam: drops the cached document so the next read re-loads it. */
    public void invalidateCache() {
        cacheEntry = null;
    }
}
