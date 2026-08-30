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

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TuningFile(List<EffectOverride> effects, GlobalOverride globals) {}

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

    /** Guard rails: a dashboard typo must not be able to write an unplayable rule. */
    public static final int MIN_FIELD_VALUE = 0;
    public static final int MAX_VALUE_BONUS = 40;
    public static final int MAX_VALUE_CAP = 99;
    public static final int MAX_ACTION_COST = 5;
    public static final int MAX_DURATION_ROUNDS = 20;

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
     * Writes one effect's knobs. A null value in {@code fields} clears that knob
     * back to its default, so the dashboard can reset a single number without
     * discarding the rest of the row.
     */
    public Snapshot setEffect(Effect effect, Map<String, Integer> fields, String updatedByEmail) {
        if (effect == null) throw new IllegalArgumentException("An effect is required.");
        Defaults defaults = DEFAULTS.get(effect);
        if (defaults == null || defaults.fields().isEmpty()) {
            throw new IllegalArgumentException(effect.name() + " has no shared settings to edit.");
        }
        EffectOverride existing = findOverride(load().file(), effect);
        Integer valueBonus = merge(existing == null ? null : existing.valueBonus(), fields, FIELD_VALUE_BONUS,
                defaults, effect, MAX_VALUE_BONUS);
        Integer valueCap = merge(existing == null ? null : existing.valueCap(), fields, FIELD_VALUE_CAP,
                defaults, effect, MAX_VALUE_CAP);
        Integer minCost = merge(existing == null ? null : existing.minActionCost(), fields, FIELD_MIN_ACTION_COST,
                defaults, effect, MAX_ACTION_COST);
        Integer duration = merge(existing == null ? null : existing.durationRounds(), fields, FIELD_DURATION_ROUNDS,
                defaults, effect, MAX_DURATION_ROUNDS);

        List<EffectOverride> rows = new ArrayList<>();
        for (EffectOverride row : load().file().effects()) {
            if (!sameEffect(row, effect)) rows.add(row);
        }
        boolean empty = valueBonus == null && valueCap == null && minCost == null && duration == null;
        if (!empty) {
            rows.add(new EffectOverride(effect.name(), valueBonus, valueCap, minCost, duration));
        }
        return save(new TuningFile(rows, load().file().globals()), updatedByEmail);
    }

    /** Drops every override on one effect, returning it to the built-in defaults. */
    public Snapshot resetEffect(Effect effect, String updatedByEmail) {
        if (effect == null) throw new IllegalArgumentException("An effect is required.");
        List<EffectOverride> rows = new ArrayList<>();
        for (EffectOverride row : load().file().effects()) {
            if (!sameEffect(row, effect)) rows.add(row);
        }
        return save(new TuningFile(rows, load().file().globals()), updatedByEmail);
    }

    public Snapshot setGlobal(String key, Integer value, String updatedByEmail) {
        GlobalDef def = GLOBAL_DEFS.get(key);
        if (def == null) throw new IllegalArgumentException("Unknown setting: " + key);
        if (value != null && (value < MIN_FIELD_VALUE || value > def.max())) {
            throw new IllegalArgumentException(def.label() + " must be between "
                    + MIN_FIELD_VALUE + " and " + def.max() + ".");
        }
        GlobalOverride g = load().file().globals();
        GlobalOverride updated = new GlobalOverride(
                "ultimateBuffRounds".equals(key) ? value : overrideGlobal(g, "ultimateBuffRounds"),
                "riderBuffRounds".equals(key) ? value : overrideGlobal(g, "riderBuffRounds"),
                "boonBuffRounds".equals(key) ? value : overrideGlobal(g, "boonBuffRounds"),
                "ampValueBonus".equals(key) ? value : overrideGlobal(g, "ampValueBonus"),
                "ampCostReduction".equals(key) ? value : overrideGlobal(g, "ampCostReduction"),
                "executeBossPercent".equals(key) ? value : overrideGlobal(g, "executeBossPercent"));
        return save(new TuningFile(load().file().effects(), updated), updatedByEmail);
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
                            "globals", snapshot.get("globals") == null ? Map.of() : snapshot.get("globals"))))
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
            return new TuningFile(file.effects() == null ? List.of() : file.effects(), file.globals());
        } catch (Exception ex) {
            // Malformed stored data falls back to defaults instead of breaking
            // every Siege battle until someone fixes the document.
            return emptyFile();
        }
    }

    private static TuningFile emptyFile() {
        return new TuningFile(List.of(), null);
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
