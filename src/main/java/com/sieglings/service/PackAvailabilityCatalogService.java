package com.sieglings.service;

import com.sieglings.diagnostics.FirestoreReadMetrics;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
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
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Remote-configurable on/off switch for each shop pack, keyed by pack id. A pack with no stored
 * row is active, so the shop keeps working unchanged until a designer deactivates something.
 * Follows the same Firestore-with-local-fallback pattern as {@link ShopPriceCatalogService},
 * reusing {@link CardOverrideStorageService} for the Firestore client.
 */
@Service
public class PackAvailabilityCatalogService {

    public record LoadSnapshot(
            JsonNode data,
            CardOverrideStorageService.StorageBackend backend,
            String filePath,
            boolean canWriteProjectFile,
            String updatedBy,
            String updatedAt
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PackToggle(String id, Boolean active) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PackAvailabilityFile(List<PackToggle> packs) {}

    private record CacheEntry(LoadSnapshot snapshot, long loadedAtMillis) {}

    private static final long CACHE_TTL_MILLIS = 60_000L;
    static final String RESOURCE_PATH = "cards/pack-availability.json";
    private static final Path PROJECT_RESOURCE_PATH = Path.of("src", "main", "resources", "cards", "pack-availability.json");

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService cardOverrideStorageService;
    private final String firestoreCollection;
    private final String firestoreDocument;

    private volatile CacheEntry cacheEntry;

    public PackAvailabilityCatalogService(
            ObjectMapper objectMapper,
            CardOverrideStorageService cardOverrideStorageService,
            @Value("${app.card-editor.firestore-collection:appConfig}") String firestoreCollection,
            @Value("${app.card-editor.firestore-pack-availability-document:packAvailability}") String firestoreDocument
    ) {
        this.objectMapper = objectMapper;
        this.cardOverrideStorageService = cardOverrideStorageService;
        this.firestoreCollection = firestoreCollection;
        this.firestoreDocument = firestoreDocument;
    }

    /** True unless a designer has explicitly deactivated this pack. */
    public boolean isActive(String packId) {
        String normalized = normalizeId(packId);
        if (normalized.isEmpty()) {
            return true;
        }
        Boolean stored = togglesById(loadSnapshot().data()).get(normalized);
        return stored == null || stored;
    }

    /** Deactivated pack ids, for callers that want the raw override set. */
    public List<String> inactivePackIds() {
        return togglesById(loadSnapshot().data()).entrySet().stream()
                .filter(entry -> !entry.getValue())
                .map(Map.Entry::getKey)
                .toList();
    }

    /** Stores an explicit on/off row for a pack and returns the resolved state. */
    public boolean setActive(String packId, boolean active, String updatedByEmail) {
        String normalized = normalizeId(packId);
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("A pack id is required.");
        }
        PackAvailabilityFile file = parseFile(loadSnapshot().data());
        List<PackToggle> updated = new ArrayList<>();
        boolean replaced = false;
        for (PackToggle existing : file.packs()) {
            if (normalized.equals(normalizeId(existing.id()))) {
                updated.add(new PackToggle(normalized, active));
                replaced = true;
            } else {
                updated.add(existing);
            }
        }
        if (!replaced) {
            updated.add(new PackToggle(normalized, active));
        }
        saveSnapshot(objectMapper.valueToTree(new PackAvailabilityFile(updated)), updatedByEmail);
        return active;
    }

    private static String normalizeId(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }

    private Map<String, Boolean> togglesById(JsonNode data) {
        PackAvailabilityFile file;
        try {
            file = parseFile(data);
        } catch (IllegalArgumentException ex) {
            // A malformed stored document must not take the shop offline.
            return Map.of();
        }
        Map<String, Boolean> map = new LinkedHashMap<>();
        for (PackToggle toggle : file.packs()) {
            String id = normalizeId(toggle == null ? null : toggle.id());
            if (id.isEmpty()) {
                continue;
            }
            map.put(id, toggle.active() == null || toggle.active());
        }
        return map;
    }

    private PackAvailabilityFile parseFile(JsonNode data) {
        try {
            PackAvailabilityFile file = objectMapper.treeToValue(data, PackAvailabilityFile.class);
            return file == null || file.packs() == null ? new PackAvailabilityFile(List.of()) : file;
        } catch (Exception ex) {
            throw new IllegalArgumentException("The stored pack availability data is malformed.", ex);
        }
    }

    /** Overridable for tests: loads the current snapshot from Firestore or the local fallback. */
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

    /** Overridable for tests: persists the snapshot to Firestore or the local fallback. */
    public LoadSnapshot saveSnapshot(JsonNode data, String updatedByEmail) {
        PackAvailabilityFile file = parseFile(data);
        if (cardOverrideStorageService.isFirestoreReady()) {
            return saveToFirestore(file, updatedByEmail);
        }
        return saveToProjectFile(file);
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
                long __fsReadStart = System.nanoTime();
                DocumentSnapshot snapshot = docRef.get().get(10, TimeUnit.SECONDS);
                FirestoreReadMetrics.record("packAvailability", System.nanoTime() - __fsReadStart);
                LoadSnapshot loadSnapshot;
                if (!snapshot.exists() || snapshot.get("packs") == null) {
                    loadSnapshot = persistFirestoreData(docRef, new PackAvailabilityFile(List.of()), "system@bootstrap");
                } else {
                    JsonNode data = objectMapper.valueToTree(new PackAvailabilityFile(List.of()));
                    ((com.fasterxml.jackson.databind.node.ObjectNode) data)
                            .set("packs", objectMapper.valueToTree(snapshot.get("packs")));
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
                throw new IllegalStateException("Unable to load pack availability from Firestore.", ex);
            }
        }
    }

    private LoadSnapshot saveToFirestore(PackAvailabilityFile file, String updatedByEmail) {
        try {
            LoadSnapshot snapshot = persistFirestoreData(fireStoreDocRef(), file, updatedByEmail);
            cacheEntry = new CacheEntry(cloneSnapshot(snapshot), System.currentTimeMillis());
            return snapshot;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save pack availability to Firestore.", ex);
        }
    }

    private LoadSnapshot persistFirestoreData(DocumentReference docRef,
                                              PackAvailabilityFile file,
                                              String updatedByEmail) throws Exception {
        JsonNode data = objectMapper.valueToTree(file);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("packs", objectMapper.convertValue(data.get("packs"), Object.class));
        payload.put("updatedBy", updatedByEmail == null || updatedByEmail.isBlank()
                ? "unknown" : updatedByEmail.trim().toLowerCase(Locale.ROOT));
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

    private LoadSnapshot saveToProjectFile(PackAvailabilityFile file) {
        Path projectPath = resolveProjectResourcePath();
        if (projectPath.getParent() == null || !Files.isDirectory(projectPath.getParent())) {
            throw new IllegalStateException("This runtime cannot write to the pack availability project file.");
        }

        try {
            Files.createDirectories(projectPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(projectPath.toFile(), file);
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to save pack availability to " + projectPath, ex);
        }

        cacheEntry = null;
        return new LoadSnapshot(
                objectMapper.valueToTree(file),
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
                    return objectMapper.valueToTree(new PackAvailabilityFile(List.of()));
                }
                return objectMapper.readTree(stream);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load pack availability.", ex);
        }
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
}
