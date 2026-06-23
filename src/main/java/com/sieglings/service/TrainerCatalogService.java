package com.sieglings.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.sieglings.model.Ability;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

@Service
public class TrainerCatalogService {

    public record LoadSnapshot(
            JsonNode data,
            CardOverrideStorageService.StorageBackend backend,
            String filePath,
            boolean canWriteProjectFile,
            String updatedBy,
            String updatedAt
    ) {}

    private record CacheEntry(LoadSnapshot snapshot, long loadedAtMillis, long publishVersion) {}

    // Trainer definitions are consulted repeatedly during loadout + match start. A longer cache
    // avoids re-blocking gameplay on remote config while still allowing save actions to invalidate.
    private static final long CACHE_TTL_MILLIS = 5 * 60_000L;
    static final String RESOURCE_PATH = "cards/trainers.json";
    private static final Path PROJECT_RESOURCE_PATH = Path.of("src", "main", "resources", "cards", "trainers.json");

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService cardOverrideStorageService;
    private final String firestoreCollection;
    private final String firestoreDocument;

    private volatile CacheEntry cacheEntry;

    public TrainerCatalogService(
            ObjectMapper objectMapper,
            CardOverrideStorageService cardOverrideStorageService,
            @Value("${app.card-editor.firestore-collection:appConfig}") String firestoreCollection,
            @Value("${app.card-editor.firestore-trainers-document:trainerCards}") String firestoreDocument
    ) {
        this.objectMapper = objectMapper;
        this.cardOverrideStorageService = cardOverrideStorageService;
        this.firestoreCollection = firestoreCollection;
        this.firestoreDocument = firestoreDocument;
    }

    public LoadSnapshot loadSnapshot() {
        if (cardOverrideStorageService.isFirestoreReady()) {
            try {
                return loadFirestoreSnapshot();
            } catch (RuntimeException ignored) {
                // Fall back to local storage when Firestore trainer config cannot be loaded.
            }
        }
        return loadLocalSnapshot();
    }

    public LoadSnapshot saveSnapshot(JsonNode data, String updatedByEmail) {
        TrainerFile file = parseTrainerFile(data);
        if (cardOverrideStorageService.isFirestoreReady()) {
            return saveToFirestore(file, updatedByEmail);
        }
        return saveToProjectFile(file);
    }

    public List<TrainerDefinition> loadDefinitionsForGame() {
        return normalizeDefinitions(parseTrainerFile(loadSnapshot().data()).trainers());
    }

    public static List<TrainerDefinition> defaultDefinitions() {
        return List.of(
                definition("trainer01", "Fire Marshal", Element.FIRE, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Vanguard Drill", "Front Row allies gain +1 attack damage", "damage_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        Ability.damage("Kindle Shot", "Deal 2 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 2),
                        false),
                fullCardDefinition("squire-bob", "Squire Bob", Element.NEUTRAL, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Shield Practice", "Front Row allies gain +1 max Health", "health_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        Ability.heal("Pep Talk", "Heal 1 ally for 2", TargetType.SINGLE_ALLY, null, 1, 2),
                        false,
                        "/img/knights/squire-bob-full-card.png",
                        true),
                definition("trainer02", "Flame Tactician", Element.FIRE, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Battle Focus", "All Fire allies gain +1 attack damage", "damage_boost", 1),
                        new Ability("Ignite", "Grant +2 attack damage to 1 ally this turn", TargetType.SINGLE_ALLY, null, 1, "damage_boost", 2, false),
                        false),
                definition("trainer10", "Inferno Lord", Element.FIRE, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Scorch Banner", "All Fire allies gain +2 attack damage", "damage_boost", 2),
                        Ability.damage("Solar Break", "Deal 4 damage to all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0, 4),
                        true),

                definition("trainer12", "Root Herald", Element.EARTH, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Stone Line", "Back Row allies gain +1 max Health", "health_boost", 1, Row.BACK, TargetType.ROW_ALLIES),
                        new Ability("Mend Wall", "Grant +1 max Health to 1 ally", TargetType.SINGLE_ALLY, null, 1, "health_boost", 1, false),
                        false),
                definition("trainer05", "Stone Warden", Element.EARTH, Rarity.RARE, "SiegeKnight",
                        Ability.passiveConnectedAlliesHealthBoost("Linked Bulwark", "Connected allies gain +1 max Health", 1),
                        Ability.heal("Earthen Shelter", "Heal 1 ally for 4", TargetType.SINGLE_ALLY, null, 1, 4),
                        false),
                definition("trainer13", "Mountain Regent", Element.EARTH, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Citadel Heart", "All Earth allies gain +2 max Health", "health_boost", 2),
                        new Ability("Granite Oath", "All allies gain +2 max Health", TargetType.ALL_ALLIES, null, 0, "health_boost", 2, false),
                        true),

                definition("trainer14", "Gale Page", Element.WIND, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Wing Screen", "Front Row allies gain +1 Speed", "speed_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        new Ability("Tailwind Mark", "Increase 1 ally's Speed by 2 this turn", TargetType.SINGLE_ALLY, null, 1, "speed_boost", 2, false),
                        false),
                definition("trainer06", "Sky Caller", Element.WIND, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Gale Rhythm", "All Wind allies gain +2 Speed", "speed_boost", 2),
                        new Ability("Downdraft", "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false),
                        false),
                definition("trainer15", "Tempest Regent", Element.WIND, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Storm March", "All Wind allies gain +3 Speed", "speed_boost", 3),
                        new Ability("Skyfall Decree", "Set all enemies in Front Row's Speed to 0 this turn", TargetType.ROW_ENEMIES, Row.FRONT, 0, "speed_zero", 1, false),
                        true),

                definition("trainer03", "Tide Caller", Element.WATER, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Harbor Screen", "Back Row allies gain +1 max Health", "health_boost", 1, Row.BACK, TargetType.ROW_ALLIES),
                        Ability.heal("Soothing Tide", "Heal 1 ally for 3", TargetType.SINGLE_ALLY, null, 1, 3),
                        false),
                definition("trainer04", "Frost Sage", Element.WATER, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Frost Flow", "All Water allies gain +1 max Health", "health_boost", 1),
                        Ability.freeze("Deep Freeze", "Freeze 1 enemy", TargetType.SINGLE_ENEMY, null, 1),
                        false),
                definition("trainer11", "Abyss Sovereign", Element.WATER, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Tidal Bastion", "All Water allies gain +2 max Health", "health_boost", 2),
                        new Ability("Royal Undertow", "Heal all allies for 4", TargetType.ALL_ALLIES, null, 0, "heal", 4, false),
                        true),

                definition("trainer20", "Rime Scout", Element.ICE, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Cold Screen", "Back Row allies gain +1 max Health", "health_boost", 1, Row.BACK, TargetType.ROW_ALLIES),
                        new Ability("Chill Order", "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false),
                        false),
                definition("trainer09", "Rime Marshal", Element.ICE, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Winter Bulwark", "All Ice allies gain +1 max Health", "health_boost", 1),
                        Ability.freeze("Whiteout Order", "Freeze 1 enemy", TargetType.SINGLE_ENEMY, null, 1),
                        false),
                definition("trainer21", "Glacier Monarch", Element.ICE, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Permafrost Crown", "All Ice allies gain +2 max Health", "health_boost", 2),
                        Ability.freeze("Absolute Zero", "Freeze all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0),
                        true),

                definition("trainer16", "Dusk Acolyte", Element.SHADOW, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Veil Skirmish", "Front Row allies gain +1 attack damage", "damage_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        Ability.damage("Needle Hex", "Deal 2 direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 2),
                        false),
                definition("trainer07", "Night Regent", Element.SHADOW, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Veil of Hunger", "All Shadow allies gain +1 attack damage", "damage_boost", 1),
                        Ability.damage("Soul Rend", "Deal 3 direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 3),
                        false),
                definition("trainer17", "Void Sovereign", Element.SHADOW, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Crown of Hunger", "All Shadow allies gain +2 attack damage", "damage_boost", 2),
                        new Ability("Eclipse Verdict", "Destroy 1 enemy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false),
                        true),

                definition("trainer18", "Spark Courier", Element.ELECTRIC, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passive("Static Step", "All Electric allies gain +1 Speed", "speed_boost", 1),
                        Ability.damage("Arc Jab", "Deal 2 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 2),
                        false),
                definition("trainer08", "Volt Shepherd", Element.ELECTRIC, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Static Tempo", "All Electric allies gain +2 Speed", "speed_boost", 2),
                        new Ability("Overcharge", "Increase 1 ally's Speed by 3 this turn", TargetType.SINGLE_ALLY, null, 1, "speed_boost", 3, false),
                        false),
                definition("trainer19", "Storm Chancellor", Element.ELECTRIC, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Grid Dominion", "All Electric allies gain +3 Speed", "speed_boost", 3),
                        Ability.damage("Chain Burst", "Deal 3 damage to all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0, 3),
                        true),

                definition("trainer22", "Forge Apprentice", Element.METAL, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Plated Line", "Front Row allies gain +1 max Health", "health_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        new Ability("Temper", "Grant +2 max Health to 1 ally", TargetType.SINGLE_ALLY, null, 1, "health_boost", 2, false),
                        false),
                definition("trainer23", "Iron Warden", Element.METAL, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Steel Resolve", "All Metal allies gain +1 max Health", "health_boost", 1),
                        Ability.damage("Slag Hammer", "Deal 3 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 3),
                        false),
                definition("trainer24", "Titan Forgemaster", Element.METAL, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Adamant Aegis", "All Metal allies gain +2 max Health", "health_boost", 2),
                        new Ability("Fortress Protocol", "All allies gain +3 max Health", TargetType.ALL_ALLIES, null, 0, "health_boost", 3, false),
                        true),

                definition("trainer25", "Grave Initiate", Element.UNDEAD, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Death March", "Front Row allies gain +1 attack damage", "damage_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        Ability.damage("Corpse Bolt", "Deal 2 direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 2),
                        false),
                definition("trainer26", "Crypt Commander", Element.UNDEAD, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Undying Will", "All Undead allies gain +1 attack damage", "damage_boost", 1),
                        Ability.damage("Soul Drain", "Deal 3 direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 3),
                        false),
                definition("trainer27", "Lich Sovereign", Element.UNDEAD, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Deathless Throne", "All Undead allies gain +2 attack damage", "damage_boost", 2),
                        new Ability("Raise Legion", "All allies gain +2 attack damage this turn", TargetType.ALL_ALLIES, null, 0, "damage_boost", 2, false),
                        true),

                definition("trainer28", "Mind Acolyte", Element.PSYCHIC, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Thought Shield", "Back Row allies gain +1 max Health", "health_boost", 1, Row.BACK, TargetType.ROW_ALLIES),
                        new Ability("Confuse", "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false),
                        false),
                definition("trainer29", "Astral Sage", Element.PSYCHIC, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Psychic Field", "All Psychic allies gain +1 attack damage", "damage_boost", 1),
                        new Ability("Mind Crush", "Grant +3 attack damage to 1 ally this turn", TargetType.SINGLE_ALLY, null, 1, "damage_boost", 3, false),
                        false),
                definition("trainer30", "Cosmic Overlord", Element.PSYCHIC, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Third Eye", "All Psychic allies gain +2 attack damage", "damage_boost", 2),
                        new Ability("Psychic Storm", "Deal 4 damage to all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0, "damage", 4, false),
                        true)
        );
    }

    static Path resolveProjectResourcePath() {
        return PROJECT_RESOURCE_PATH.toAbsolutePath().normalize();
    }

    private LoadSnapshot loadFirestoreSnapshot() {
        CacheEntry cached = cacheEntry;
        long now = System.currentTimeMillis();
        Long publishVersion = cardOverrideStorageService.getCurrentPublishVersion();
        if (cached != null && now - cached.loadedAtMillis() < CACHE_TTL_MILLIS
                && (publishVersion == null || cached.publishVersion() == publishVersion.longValue())) {
            return cached.snapshot();
        }

        synchronized (this) {
            cached = cacheEntry;
            now = System.currentTimeMillis();
            publishVersion = cardOverrideStorageService.getCurrentPublishVersion();
            if (cached != null && now - cached.loadedAtMillis() < CACHE_TTL_MILLIS
                    && (publishVersion == null || cached.publishVersion() == publishVersion.longValue())) {
                return cached.snapshot();
            }

            try {
                DocumentReference docRef = fireStoreDocRef();
                DocumentSnapshot snapshot = docRef.get().get(10, TimeUnit.SECONDS);
                LoadSnapshot loadSnapshot;
                if (!snapshot.exists() || snapshot.get("trainers") == null) {
                    loadSnapshot = persistFirestoreData(docRef, new TrainerFile(defaultDefinitions()), "system@bootstrap");
                } else {
                    ObjectNode data = objectMapper.createObjectNode();
                    data.set("trainers", objectMapper.valueToTree(snapshot.get("trainers")));
                    loadSnapshot = new LoadSnapshot(
                            data,
                            CardOverrideStorageService.StorageBackend.FIRESTORE,
                            docRef.getPath(),
                            false,
                            snapshot.getString("updatedBy"),
                            resolveTimestamp(snapshot)
                    );
                }
                cacheEntry = new CacheEntry(
                        cloneSnapshot(loadSnapshot),
                        System.currentTimeMillis(),
                        publishVersion == null ? 0L : publishVersion
                );
                return loadSnapshot;
            } catch (Exception ex) {
                throw new IllegalStateException("Unable to load trainer data from Firestore.", ex);
            }
        }
    }

    private LoadSnapshot saveToFirestore(TrainerFile file, String updatedByEmail) {
        try {
            LoadSnapshot snapshot = persistFirestoreData(fireStoreDocRef(), file, updatedByEmail);
            Long publishVersion = cardOverrideStorageService.getCurrentPublishVersion();
            cacheEntry = new CacheEntry(
                    cloneSnapshot(snapshot),
                    System.currentTimeMillis(),
                    publishVersion == null ? 0L : publishVersion
            );
            return snapshot;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save trainer data to Firestore.", ex);
        }
    }

    private LoadSnapshot persistFirestoreData(DocumentReference docRef,
                                              TrainerFile file,
                                              String updatedByEmail) throws Exception {
        JsonNode data = objectMapper.valueToTree(new TrainerFile(normalizeDefinitions(file.trainers())));
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("trainers", objectMapper.convertValue(data.get("trainers"), Object.class));
        payload.put("updatedBy", updatedByEmail == null || updatedByEmail.isBlank() ? "unknown" : updatedByEmail.trim().toLowerCase(Locale.ROOT));
        payload.put("updatedAt", Timestamp.now());
        docRef.set(payload).get(10, TimeUnit.SECONDS);

        return new LoadSnapshot(
                data,
                CardOverrideStorageService.StorageBackend.FIRESTORE,
                docRef.getPath(),
                false,
                (String) payload.get("updatedBy"),
                Instant.now().toString()
        );
    }

    private LoadSnapshot loadLocalSnapshot() {
        JsonNode data = readLocalData();
        Path projectPath = resolveProjectResourcePath();
        boolean hasProjectFile = Files.isRegularFile(projectPath);
        return new LoadSnapshot(
                data,
                hasProjectFile ? CardOverrideStorageService.StorageBackend.PROJECT_FILE : CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE,
                hasProjectFile ? projectPath.toString() : RESOURCE_PATH,
                projectPath.getParent() != null && Files.isDirectory(projectPath.getParent()),
                null,
                null
        );
    }

    private LoadSnapshot saveToProjectFile(TrainerFile file) {
        Path projectPath = resolveProjectResourcePath();
        if (projectPath.getParent() == null || !Files.isDirectory(projectPath.getParent())) {
            throw new IllegalStateException("This runtime cannot write to the trainer project file.");
        }

        try {
            Files.createDirectories(projectPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(projectPath.toFile(), new TrainerFile(normalizeDefinitions(file.trainers())));
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to save trainer definitions to " + projectPath, ex);
        }

        cacheEntry = null;
        return new LoadSnapshot(
                objectMapper.valueToTree(new TrainerFile(normalizeDefinitions(file.trainers()))),
                CardOverrideStorageService.StorageBackend.PROJECT_FILE,
                projectPath.toString(),
                true,
                null,
                Instant.now().toString()
        );
    }

    private JsonNode readLocalData() {
        Path projectPath = resolveProjectResourcePath();
        try {
            if (Files.isRegularFile(projectPath)) {
                try (InputStream stream = Files.newInputStream(projectPath)) {
                    return objectMapper.readTree(stream);
                }
            }
            try (InputStream stream = getClass().getClassLoader().getResourceAsStream(RESOURCE_PATH)) {
                if (stream == null) {
                    return objectMapper.valueToTree(new TrainerFile(defaultDefinitions()));
                }
                return objectMapper.readTree(stream);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load trainer definitions.", ex);
        }
    }

    private TrainerFile parseTrainerFile(JsonNode data) {
        try {
            TrainerFile file = objectMapper.treeToValue(data, TrainerFile.class);
            if (file == null || file.trainers() == null) {
                throw new IllegalArgumentException("The JSON must contain a top-level 'trainers' array.");
            }
            return new TrainerFile(normalizeDefinitions(file.trainers()));
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("The submitted JSON does not match the trainer format.", ex);
        }
    }

    private List<TrainerDefinition> normalizeDefinitions(List<TrainerDefinition> definitions) {
        if (definitions == null) {
            return List.of();
        }
        return definitions.stream()
                .map(definition -> new TrainerDefinition(
                        normalizeId(definition.id()),
                        normalizeText(definition.name()),
                        definition.element(),
                        definition.rarity(),
                        normalizeText(definition.tier()) == null ? "SiegeKnight" : normalizeText(definition.tier()),
                        definition.active() == null || definition.active(),
                        definition.oncePerGame() != null && definition.oncePerGame(),
                        normalizeAbilityDefinition(definition.passiveAbility(), true),
                        normalizeAbilityDefinition(definition.activeAbility(), false),
                        normalizeText(definition.cardArtUrl()),
                        normalizeCardArtMode(definition.cardArtMode()),
                        definition.cardArtOffsetX(),
                        definition.cardArtOffsetY(),
                        definition.cardArtScale(),
                        definition.cardArtRotation(),
                        definition.holographic()
                ))
                .toList();
    }

    private ManualSieglingCatalog.ManualAbilityDefinition normalizeAbilityDefinition(
            ManualSieglingCatalog.ManualAbilityDefinition definition,
            boolean passiveDefault
    ) {
        if (definition == null) {
            return null;
        }
        return new ManualSieglingCatalog.ManualAbilityDefinition(
                normalizeText(definition.name()),
                normalizeText(definition.description()),
                definition.targetType(),
                definition.targetRow(),
                definition.targetCount() == null ? 0 : definition.targetCount(),
                normalizeEffectKey(definition.effectType()),
                definition.effectValue() == null ? 0 : definition.effectValue(),
                definition.passive() == null ? passiveDefault : definition.passive(),
                definition.requiredElement(),
                definition.requiredEnergy() == null ? 0 : definition.requiredEnergy(),
                definition.requiredReaction()
        );
    }

    private DocumentReference fireStoreDocRef() {
        Firestore firestore = cardOverrideStorageService.requireFirestore();
        return firestore.collection(firestoreCollection).document(firestoreDocument);
    }

    private String resolveTimestamp(DocumentSnapshot snapshot) {
        Object updatedAt = snapshot.get("updatedAt");
        if (updatedAt instanceof Timestamp ts) {
            return Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()).toString();
        }
        if (snapshot.getUpdateTime() != null) {
            Timestamp ts = snapshot.getUpdateTime();
            return Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()).toString();
        }
        return null;
    }

    private LoadSnapshot cloneSnapshot(LoadSnapshot snapshot) {
        return new LoadSnapshot(
                snapshot.data().deepCopy(),
                snapshot.backend(),
                snapshot.filePath(),
                snapshot.canWriteProjectFile(),
                snapshot.updatedBy(),
                snapshot.updatedAt()
        );
    }

    private static TrainerDefinition definition(String id, String name, Element element, Rarity rarity, String tier,
                                                Ability passiveAbility, Ability activeAbility, boolean oncePerGame) {
        return new TrainerDefinition(
                id,
                name,
                element,
                rarity,
                tier,
                true,
                oncePerGame,
                toAbilityDefinition(passiveAbility),
                toAbilityDefinition(activeAbility),
                null,
                null,
                null,
                null,
                null,
                null,
                null
        );
    }

    private static TrainerDefinition fullCardDefinition(String id, String name, Element element, Rarity rarity, String tier,
                                                        Ability passiveAbility, Ability activeAbility, boolean oncePerGame,
                                                        String cardArtUrl, boolean holographic) {
        return new TrainerDefinition(
                id,
                name,
                element,
                rarity,
                tier,
                true,
                oncePerGame,
                toAbilityDefinition(passiveAbility),
                toAbilityDefinition(activeAbility),
                cardArtUrl,
                "FULL_CARD",
                null,
                null,
                null,
                null,
                holographic
        );
    }

    private static ManualSieglingCatalog.ManualAbilityDefinition toAbilityDefinition(Ability ability) {
        if (ability == null) {
            return null;
        }
        return new ManualSieglingCatalog.ManualAbilityDefinition(
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

    private String normalizeId(String value) {
        String normalized = normalizeText(value);
        return normalized == null ? "" : normalized.toLowerCase(Locale.ROOT);
    }

    private String normalizeText(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isBlank() ? null : normalized;
    }

    private String normalizeEffectKey(String value) {
        String normalized = normalizeText(value);
        return normalized == null ? null : normalized.toLowerCase(Locale.ROOT);
    }

    private String normalizeCardArtMode(String value) {
        String normalized = normalizeText(value);
        if (normalized == null) {
            return null;
        }
        String mode = normalized.toUpperCase(Locale.ROOT);
        return switch (mode) {
            case "REPLACE", "OVERLAY", "FULL_CARD" -> mode;
            default -> null;
        };
    }

    record TrainerFile(List<TrainerDefinition> trainers) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TrainerDefinition(
            String id,
            String name,
            Element element,
            Rarity rarity,
            String tier,
            Boolean active,
            Boolean oncePerGame,
            ManualSieglingCatalog.ManualAbilityDefinition passiveAbility,
            ManualSieglingCatalog.ManualAbilityDefinition activeAbility,
            String cardArtUrl,
            String cardArtMode,
            Double cardArtOffsetX,
            Double cardArtOffsetY,
            Double cardArtScale,
            Double cardArtRotation,
            Boolean holographic
    ) {
        public TrainerDefinition(String id, String name, Element element, Rarity rarity, String tier,
                                 Boolean active, Boolean oncePerGame,
                                 ManualSieglingCatalog.ManualAbilityDefinition passiveAbility,
                                 ManualSieglingCatalog.ManualAbilityDefinition activeAbility) {
            this(id, name, element, rarity, tier, active, oncePerGame, passiveAbility, activeAbility,
                    null, null, null, null, null, null, null);
        }
    }
}
