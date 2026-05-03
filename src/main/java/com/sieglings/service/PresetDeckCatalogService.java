package com.sieglings.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.sieglings.model.enums.Element;
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
import java.util.concurrent.TimeUnit;

@Service
public class PresetDeckCatalogService {

    public record LoadSnapshot(
            JsonNode data,
            CardOverrideStorageService.StorageBackend backend,
            String filePath,
            boolean canWriteProjectFile,
            String updatedBy,
            String updatedAt
    ) {}

    private record CacheEntry(LoadSnapshot snapshot, long loadedAtMillis) {}

    // Match startup consults preset decks several times in quick succession, so a short cache
    // window can force the UI flow back through remote config fetches between "load options"
    // and "start match". Keep this warm for a few minutes instead.
    private static final long CACHE_TTL_MILLIS = 5 * 60_000L;
    static final String RESOURCE_PATH = "cards/preset-decks.json";
    private static final Path PROJECT_RESOURCE_PATH = Path.of("src", "main", "resources", "cards", "preset-decks.json");

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService cardOverrideStorageService;
    private final String firestoreCollection;
    private final String firestoreDocument;

    private volatile CacheEntry cacheEntry;

    public PresetDeckCatalogService(
            ObjectMapper objectMapper,
            CardOverrideStorageService cardOverrideStorageService,
            @Value("${app.card-editor.firestore-collection:appConfig}") String firestoreCollection,
            @Value("${app.card-editor.firestore-preset-decks-document:presetDecks}") String firestoreDocument
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
                // Fall back to local storage when Firestore deck config cannot be loaded.
            }
        }
        return loadLocalSnapshot();
    }

    public LoadSnapshot saveSnapshot(JsonNode data, String updatedByEmail) {
        PresetDeckFile file = parseDeckFile(data);
        if (cardOverrideStorageService.isFirestoreReady()) {
            return saveToFirestore(file, updatedByEmail);
        }
        return saveToProjectFile(file);
    }

    public List<PresetDeckDefinition> loadDefinitionsForGame() {
        return normalizeDefinitions(parseDeckFile(loadSnapshot().data()).decks());
    }

    public static List<PresetDeckDefinition> defaultDefinitions() {
        return List.of(
                definition("deck_fire", "Blazing Core", "Pure Fire pressure with strong attack lines.", List.of(Element.FIRE), "trainer02"),
                definition("deck_earth", "Stone Garden", "Pure Earth durability and healing.", List.of(Element.EARTH), "trainer05"),
                definition("deck_wind", "Gale Talons", "Pure Wind speed and disruption.", List.of(Element.WIND), "trainer06"),
                definition("deck_water", "Tidal Depths", "Pure Water control and sustain.", List.of(Element.WATER), "trainer04"),
                definition("deck_ice", "Frostmarch", "Pure Ice lockdown with freezes, slows, and resilient board lines.", List.of(Element.ICE), "trainer09"),
                definition("deck_shadow", "Night Bloom", "Pure Shadow pressure with ambushes and board picks.", List.of(Element.SHADOW), "trainer07"),
                definition("deck_electric", "Storm Circuit", "Pure Electric tempo with charged bursts and fast lines.", List.of(Element.ELECTRIC), "trainer08"),
                definition("deck_fire_earth", "Ashen Roots", "Fire damage backed by Earth bulk and combo payoffs.", List.of(Element.FIRE, Element.EARTH), "trainer05"),
                definition("deck_water_wind", "Stormtide", "Water control mixed with Wind tempo.", List.of(Element.WATER, Element.WIND), "trainer06"),
                definition("deck_fire_wind", "Skyflame", "Aggressive Fire and Wind with fast openers.", List.of(Element.FIRE, Element.WIND), "trainer02"),
                definition("deck_fire_ice", "Cinderfrost", "Burn and freeze lines collide for explosive tempo swings.", List.of(Element.FIRE, Element.ICE), "trainer09"),
                definition("deck_water_ice", "Glacier Current", "Layered freezes and healing make every lane hard to crack.", List.of(Element.WATER, Element.ICE), "trainer09"),
                definition("deck_shadow_ice", "Blackfrost Court", "Shadow picks backed by chilling control and lock pieces.", List.of(Element.SHADOW, Element.ICE), "trainer09"),
                definition("deck_electric_ice", "Cryovolt Array", "Fast charge openings backed by brittle freeze pressure.", List.of(Element.ELECTRIC, Element.ICE), "trainer08"),
                definition("deck_water_electric", "Undercurrent Grid", "Water control and Electric tempo combine into relentless pressure.", List.of(Element.WATER, Element.ELECTRIC), "trainer08"),
                definition("deck_quad", "Grand Crossroads", "All four primal elements with the widest combo ceiling.", List.of(Element.FIRE, Element.EARTH, Element.WIND, Element.WATER), "trainer01"),
                definition("deck_metal", "Iron Bastion", "Pure Metal fortification with armored board presence.", List.of(Element.METAL), "trainer23"),
                definition("deck_undead", "Grave Dominion", "Pure Undead aggression with relentless pressure.", List.of(Element.UNDEAD), "trainer26"),
                definition("deck_psychic", "Astral Nexus", "Pure Psychic control with mind-bending disruption.", List.of(Element.PSYCHIC), "trainer29"),
                definition("deck_metal_fire", "Molten Forge", "Metal durability fueled by Fire's raw power.", List.of(Element.METAL, Element.FIRE), "trainer23"),
                definition("deck_undead_shadow", "Eternal Night", "Shadow picks paired with Undead resilience.", List.of(Element.UNDEAD, Element.SHADOW), "trainer26"),
                definition("deck_psychic_ice", "Frozen Mind", "Psychic disruption backed by Ice lockdown.", List.of(Element.PSYCHIC, Element.ICE), "trainer29"),
                definition("deck_metal_electric", "Charged Armor", "Metal defenses combined with Electric tempo.", List.of(Element.METAL, Element.ELECTRIC), "trainer23"),
                definition("deck_undead_psychic", "Soul Eclipse", "Undead aggression meets Psychic manipulation.", List.of(Element.UNDEAD, Element.PSYCHIC), "trainer26")
        );
    }

    static Path resolveProjectResourcePath() {
        return PROJECT_RESOURCE_PATH.toAbsolutePath().normalize();
    }

    private LoadSnapshot loadFirestoreSnapshot() {
        CacheEntry cached = cacheEntry;
        long now = System.currentTimeMillis();
        if (cached != null && now - cached.loadedAtMillis() < CACHE_TTL_MILLIS) {
            return cached.snapshot();
        }

        synchronized (this) {
            cached = cacheEntry;
            now = System.currentTimeMillis();
            if (cached != null && now - cached.loadedAtMillis() < CACHE_TTL_MILLIS) {
                return cached.snapshot();
            }

            try {
                DocumentReference docRef = fireStoreDocRef();
                DocumentSnapshot snapshot = docRef.get().get(10, TimeUnit.SECONDS);
                LoadSnapshot loadSnapshot;
                if (!snapshot.exists() || snapshot.get("decks") == null) {
                    loadSnapshot = persistFirestoreData(docRef, new PresetDeckFile(defaultDefinitions()), "system@bootstrap");
                } else {
                    ObjectNode data = objectMapper.createObjectNode();
                    data.set("decks", objectMapper.valueToTree(snapshot.get("decks")));
                    loadSnapshot = new LoadSnapshot(
                            data,
                            CardOverrideStorageService.StorageBackend.FIRESTORE,
                            docRef.getPath(),
                            false,
                            snapshot.getString("updatedBy"),
                            resolveTimestamp(snapshot)
                    );
                }
                cacheEntry = new CacheEntry(cloneSnapshot(loadSnapshot), System.currentTimeMillis());
                return loadSnapshot;
            } catch (Exception ex) {
                throw new IllegalStateException("Unable to load preset deck data from Firestore.", ex);
            }
        }
    }

    private LoadSnapshot saveToFirestore(PresetDeckFile file, String updatedByEmail) {
        try {
            LoadSnapshot snapshot = persistFirestoreData(fireStoreDocRef(), file, updatedByEmail);
            cacheEntry = new CacheEntry(cloneSnapshot(snapshot), System.currentTimeMillis());
            return snapshot;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save preset deck data to Firestore.", ex);
        }
    }

    private LoadSnapshot persistFirestoreData(DocumentReference docRef,
                                              PresetDeckFile file,
                                              String updatedByEmail) throws Exception {
        JsonNode data = objectMapper.valueToTree(new PresetDeckFile(normalizeDefinitions(file.decks())));
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("decks", objectMapper.convertValue(data.get("decks"), Object.class));
        payload.put("updatedBy", updatedByEmail == null || updatedByEmail.isBlank() ? "unknown" : updatedByEmail.trim().toLowerCase());
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

    private LoadSnapshot saveToProjectFile(PresetDeckFile file) {
        Path projectPath = resolveProjectResourcePath();
        if (projectPath.getParent() == null || !Files.isDirectory(projectPath.getParent())) {
            throw new IllegalStateException("This runtime cannot write to the preset deck project file.");
        }

        try {
            Files.createDirectories(projectPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(projectPath.toFile(), new PresetDeckFile(normalizeDefinitions(file.decks())));
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to save preset deck definitions to " + projectPath, ex);
        }

        cacheEntry = null;
        return new LoadSnapshot(
                objectMapper.valueToTree(new PresetDeckFile(normalizeDefinitions(file.decks()))),
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
                    return objectMapper.valueToTree(new PresetDeckFile(defaultDefinitions()));
                }
                return objectMapper.readTree(stream);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load preset deck definitions.", ex);
        }
    }

    private PresetDeckFile parseDeckFile(JsonNode data) {
        try {
            PresetDeckFile file = objectMapper.treeToValue(data, PresetDeckFile.class);
            if (file == null || file.decks() == null) {
                throw new IllegalArgumentException("The JSON must contain a top-level 'decks' array.");
            }
            return new PresetDeckFile(normalizeDefinitions(file.decks()));
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("The submitted JSON does not match the preset deck format.", ex);
        }
    }

    private List<PresetDeckDefinition> normalizeDefinitions(List<PresetDeckDefinition> definitions) {
        if (definitions == null) {
            return List.of();
        }
        return definitions.stream()
                .map(definition -> new PresetDeckDefinition(
                        definition.id() == null ? "" : definition.id().trim().toLowerCase(),
                        definition.name() == null ? "" : definition.name().trim(),
                        definition.description() == null ? "" : definition.description().trim(),
                        definition.elements() == null ? List.of() : List.copyOf(definition.elements()),
                        definition.recommendedTrainerId() == null ? "" : definition.recommendedTrainerId().trim().toLowerCase(),
                        definition.active() == null || definition.active(),
                        definition.cardIds() == null ? List.of() : definition.cardIds().stream()
                                .map(cardId -> cardId == null ? "" : cardId.trim().toLowerCase())
                                .filter(cardId -> !cardId.isBlank())
                                .toList()
                ))
                .toList();
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

    private static PresetDeckDefinition definition(String id, String name, String description,
                                                   List<Element> elements, String recommendedTrainerId) {
        return new PresetDeckDefinition(id, name, description, elements, recommendedTrainerId, true, List.of());
    }

    record PresetDeckFile(List<PresetDeckDefinition> decks) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PresetDeckDefinition(
            String id,
            String name,
            String description,
            List<Element> elements,
            String recommendedTrainerId,
            Boolean active,
            List<String> cardIds
    ) {}
}
