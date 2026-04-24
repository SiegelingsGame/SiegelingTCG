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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Remote-configurable roster of which {@link Element}s appear in deck builder, spells, traps, and matchmaking.
 */
@Service
public class LiveElementCatalogService {

    public record LoadSnapshot(
            JsonNode data,
            CardOverrideStorageService.StorageBackend backend,
            String filePath,
            boolean canWriteProjectFile,
            String updatedBy,
            String updatedAt
    ) {}

    private record CacheEntry(LoadSnapshot snapshot, long loadedAtMillis) {}

    private static final long CACHE_TTL_MILLIS = 5 * 60_000L;
    static final String RESOURCE_PATH = "cards/live-elements.json";
    private static final Path PROJECT_RESOURCE_PATH = Path.of("src", "main", "resources", "cards", "live-elements.json");

    /**
     * Elements that have generated Siegling lines in this build (order = UI / deck-builder sort).
     */
    public static final List<Element> DEFAULT_GAMEPLAY_ELEMENT_ORDER = List.of(
            Element.FIRE,
            Element.EARTH,
            Element.WIND,
            Element.WATER,
            Element.ICE,
            Element.SHADOW,
            Element.ELECTRIC,
            Element.METAL,
            Element.UNDEAD,
            Element.PSYCHIC
    );

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService cardOverrideStorageService;
    private final String firestoreCollection;
    private final String firestoreDocument;

    private volatile CacheEntry cacheEntry;

    public LiveElementCatalogService(
            ObjectMapper objectMapper,
            CardOverrideStorageService cardOverrideStorageService,
            @Value("${app.card-editor.firestore-collection:appConfig}") String firestoreCollection,
            @Value("${app.card-editor.firestore-live-elements-document:liveElements}") String firestoreDocument
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
                // Fall back to local storage when Firestore cannot be loaded.
            }
        }
        return loadLocalSnapshot();
    }

    public LoadSnapshot saveSnapshot(JsonNode data, String updatedByEmail) {
        LiveElementsFile file = parseElementFile(data);
        if (cardOverrideStorageService.isFirestoreReady()) {
            return saveToFirestore(file, updatedByEmail);
        }
        return saveToProjectFile(file);
    }

    /**
     * Active gameplay elements for matchmaking, catalog, and presets (stable iteration order).
     */
    public Set<Element> loadActiveElementsForGame() {
        return resolveActiveElements(parseElementFile(loadSnapshot().data()).elements());
    }

    public List<ElementToggle> buildEditorPayload() {
        Map<Element, Boolean> map = togglesByElement(parseElementFile(loadSnapshot().data()).elements());
        List<ElementToggle> rows = new ArrayList<>();
        for (Element element : DEFAULT_GAMEPLAY_ELEMENT_ORDER) {
            rows.add(new ElementToggle(element.name(), map.getOrDefault(element, true)));
        }
        return rows;
    }

    static Set<Element> resolveActiveElements(List<ElementToggle> raw) {
        Map<Element, Boolean> map = togglesByElement(raw);
        Set<Element> active = new LinkedHashSet<>();
        for (Element element : DEFAULT_GAMEPLAY_ELEMENT_ORDER) {
            if (map.getOrDefault(element, true)) {
                active.add(element);
            }
        }
        return active;
    }

    private static Map<Element, Boolean> togglesByElement(List<ElementToggle> raw) {
        Map<Element, Boolean> map = new LinkedHashMap<>();
        if (raw == null) {
            return map;
        }
        for (ElementToggle row : raw) {
            if (row == null || row.element() == null) {
                continue;
            }
            Element parsed = parseElementName(row.element());
            if (parsed == null || !DEFAULT_GAMEPLAY_ELEMENT_ORDER.contains(parsed)) {
                continue;
            }
            map.put(parsed, row.active() == null || row.active());
        }
        return map;
    }

    private static Element parseElementName(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Element.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    public static List<ElementToggle> defaultToggles() {
        return DEFAULT_GAMEPLAY_ELEMENT_ORDER.stream()
                .map(e -> new ElementToggle(e.name(), true))
                .toList();
    }

    static LiveElementsFile defaultFile() {
        return new LiveElementsFile(defaultToggles());
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
                if (!snapshot.exists() || snapshot.get("elements") == null) {
                    loadSnapshot = persistFirestoreData(docRef, defaultFile(), "system@bootstrap");
                } else {
                    ObjectNode data = objectMapper.createObjectNode();
                    data.set("elements", objectMapper.valueToTree(snapshot.get("elements")));
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
                throw new IllegalStateException("Unable to load live element roster from Firestore.", ex);
            }
        }
    }

    private LoadSnapshot saveToFirestore(LiveElementsFile file, String updatedByEmail) {
        try {
            LoadSnapshot snapshot = persistFirestoreData(fireStoreDocRef(), file, updatedByEmail);
            cacheEntry = new CacheEntry(cloneSnapshot(snapshot), System.currentTimeMillis());
            return snapshot;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save live element roster to Firestore.", ex);
        }
    }

    private LoadSnapshot persistFirestoreData(DocumentReference docRef,
                                              LiveElementsFile file,
                                              String updatedByEmail) throws Exception {
        JsonNode data = objectMapper.valueToTree(normalizeFile(file));
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("elements", objectMapper.convertValue(data.get("elements"), Object.class));
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

    private LoadSnapshot saveToProjectFile(LiveElementsFile file) {
        Path projectPath = resolveProjectResourcePath();
        if (projectPath.getParent() == null || !Files.isDirectory(projectPath.getParent())) {
            throw new IllegalStateException("This runtime cannot write to the live-elements project file.");
        }

        try {
            Files.createDirectories(projectPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(projectPath.toFile(), normalizeFile(file));
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to save live element roster to " + projectPath, ex);
        }

        cacheEntry = null;
        return new LoadSnapshot(
                objectMapper.valueToTree(normalizeFile(file)),
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
                    return objectMapper.valueToTree(defaultFile());
                }
                return objectMapper.readTree(stream);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load live element roster.", ex);
        }
    }

    private LiveElementsFile parseElementFile(JsonNode data) {
        try {
            LiveElementsFile file = objectMapper.treeToValue(data, LiveElementsFile.class);
            if (file == null || file.elements() == null) {
                throw new IllegalArgumentException("The JSON must contain a top-level 'elements' array.");
            }
            return normalizeFile(file);
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("The submitted JSON does not match the live element roster format.", ex);
        }
    }

    private static LiveElementsFile normalizeFile(LiveElementsFile file) {
        return new LiveElementsFile(defaultToggles().stream()
                .map(defaultRow -> {
                    Element element = Element.valueOf(defaultRow.element());
                    Boolean override = togglesByElement(file.elements()).get(element);
                    boolean active = override == null || override;
                    return new ElementToggle(element.name(), active);
                })
                .toList());
    }

    static Path resolveProjectResourcePath() {
        return PROJECT_RESOURCE_PATH.toAbsolutePath().normalize();
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

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LiveElementsFile(List<ElementToggle> elements) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ElementToggle(String element, Boolean active) {}
}
