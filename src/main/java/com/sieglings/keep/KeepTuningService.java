package com.sieglings.keep;

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
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Firestore-backed (with local-file fallback) storage for the Keep tuning document the card
 * dashboard edits. Mirrors {@link com.sieglings.service.ShopPriceCatalogService}: Firestore
 * when credentials exist, otherwise the project resource so local dev and tests still round-trip.
 *
 * <p>Reads are cached briefly because {@link KeepService} consults the tuning on every rate
 * calculation; a dashboard save invalidates the cache immediately so editors see their change.
 */
@Service
public class KeepTuningService {

    public record LoadSnapshot(
            KeepTuning tuning,
            CardOverrideStorageService.StorageBackend backend,
            String filePath,
            String updatedBy,
            String updatedAt
    ) { }

    private record CacheEntry(LoadSnapshot snapshot, long loadedAtMillis) { }

    private static final long CACHE_TTL_MILLIS = 30_000L;
    static final String RESOURCE_PATH = "cards/keep-tuning.json";
    private static final Path PROJECT_RESOURCE_PATH =
            Path.of("src", "main", "resources", "cards", "keep-tuning.json");

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService cardOverrideStorageService;
    private final String firestoreCollection;
    private final String firestoreDocument;

    private volatile CacheEntry cacheEntry;

    public KeepTuningService(
            ObjectMapper objectMapper,
            CardOverrideStorageService cardOverrideStorageService,
            @Value("${app.card-editor.firestore-collection:appConfig}") String firestoreCollection,
            @Value("${app.card-editor.firestore-keep-tuning-document:keepTuning}") String firestoreDocument
    ) {
        this.objectMapper = objectMapper;
        this.cardOverrideStorageService = cardOverrideStorageService;
        this.firestoreCollection = firestoreCollection;
        this.firestoreDocument = firestoreDocument;
    }

    /** Effective tuning for gameplay. Never throws: a broken document degrades to shipped defaults. */
    public KeepTuning current() {
        try {
            return KeepTuning.orEmpty(loadSnapshot().tuning());
        } catch (RuntimeException ignored) {
            return KeepTuning.EMPTY;
        }
    }

    public LoadSnapshot loadSnapshot() {
        if (cardOverrideStorageService.isFirestoreReady()) {
            try {
                return loadFirestoreSnapshot();
            } catch (RuntimeException ignored) {
                // Fall through to the local copy when Firestore is unreachable.
            }
        }
        return loadLocalSnapshot();
    }

    public LoadSnapshot save(KeepTuning tuning, String updatedByEmail) {
        KeepTuning normalized = KeepTuning.orEmpty(tuning);
        if (cardOverrideStorageService.isFirestoreReady()) {
            try {
                LoadSnapshot snapshot = persistFirestore(normalized, updatedByEmail);
                cacheEntry = new CacheEntry(snapshot, System.currentTimeMillis());
                return snapshot;
            } catch (RuntimeException ex) {
                throw new IllegalStateException("Unable to save Keep tuning to Firestore.", ex);
            }
        }
        return saveToProjectFile(normalized);
    }

    /** Drops every override so the Keep runs on the values it ships with. */
    public LoadSnapshot reset(String updatedByEmail) {
        return save(KeepTuning.EMPTY, updatedByEmail);
    }

    public KeepTuning parse(JsonNode data) {
        if (data == null || data.isNull()) return KeepTuning.EMPTY;
        try {
            return KeepTuning.orEmpty(objectMapper.treeToValue(data, KeepTuning.class));
        } catch (Exception ex) {
            throw new IllegalArgumentException("The Keep tuning payload is malformed: " + ex.getMessage(), ex);
        }
    }

    private LoadSnapshot loadFirestoreSnapshot() {
        CacheEntry cached = cacheEntry;
        long now = System.currentTimeMillis();
        if (cached != null && now - cached.loadedAtMillis() < CACHE_TTL_MILLIS) return cached.snapshot();

        synchronized (this) {
            cached = cacheEntry;
            now = System.currentTimeMillis();
            if (cached != null && now - cached.loadedAtMillis() < CACHE_TTL_MILLIS) return cached.snapshot();
            try {
                DocumentReference docRef = docRef();
                DocumentSnapshot snapshot = docRef.get().get(10, TimeUnit.SECONDS);
                KeepTuning tuning = snapshot.exists()
                        ? parse(objectMapper.valueToTree(snapshot.getData()))
                        : KeepTuning.EMPTY;
                LoadSnapshot loaded = new LoadSnapshot(tuning,
                        CardOverrideStorageService.StorageBackend.FIRESTORE, docRef.getPath(),
                        snapshot.exists() ? snapshot.getString("updatedBy") : null,
                        snapshot.exists() ? resolveTimestamp(snapshot) : null);
                cacheEntry = new CacheEntry(loaded, System.currentTimeMillis());
                return loaded;
            } catch (Exception ex) {
                throw new IllegalStateException("Unable to load Keep tuning from Firestore.", ex);
            }
        }
    }

    private LoadSnapshot persistFirestore(KeepTuning tuning, String updatedByEmail) {
        try {
            DocumentReference docRef = docRef();
            Map<String, Object> payload = new LinkedHashMap<>(
                    objectMapper.convertValue(tuning, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() { }));
            payload.put("updatedBy", updatedByEmail == null || updatedByEmail.isBlank()
                    ? "unknown" : updatedByEmail.trim().toLowerCase(Locale.ROOT));
            payload.put("updatedAt", Timestamp.now());
            docRef.set(payload).get(10, TimeUnit.SECONDS);
            return new LoadSnapshot(tuning, CardOverrideStorageService.StorageBackend.FIRESTORE,
                    docRef.getPath(), (String) payload.get("updatedBy"), Instant.now().toString());
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save Keep tuning to Firestore.", ex);
        }
    }

    private LoadSnapshot loadLocalSnapshot() {
        Path projectPath = resolveProjectResourcePath();
        boolean hasProjectFile = Files.isRegularFile(projectPath);
        return new LoadSnapshot(readLocalTuning(projectPath),
                hasProjectFile ? CardOverrideStorageService.StorageBackend.PROJECT_FILE
                        : CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE,
                hasProjectFile ? projectPath.toString() : RESOURCE_PATH, null, null);
    }

    private LoadSnapshot saveToProjectFile(KeepTuning tuning) {
        Path projectPath = resolveProjectResourcePath();
        if (projectPath.getParent() == null || !Files.isDirectory(projectPath.getParent())) {
            throw new IllegalStateException("This runtime cannot write to the Keep tuning project file.");
        }
        try {
            Files.createDirectories(projectPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(projectPath.toFile(), tuning);
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to save Keep tuning to " + projectPath, ex);
        }
        cacheEntry = null;
        return new LoadSnapshot(tuning, CardOverrideStorageService.StorageBackend.PROJECT_FILE,
                projectPath.toString(), null, Instant.now().toString());
    }

    private KeepTuning readLocalTuning(Path projectPath) {
        try {
            if (Files.isRegularFile(projectPath)) {
                try (InputStream stream = Files.newInputStream(projectPath)) {
                    return parse(objectMapper.readTree(stream));
                }
            }
            try (InputStream stream = getClass().getClassLoader().getResourceAsStream(RESOURCE_PATH)) {
                return stream == null ? KeepTuning.EMPTY : parse(objectMapper.readTree(stream));
            }
        } catch (IOException | IllegalArgumentException ex) {
            return KeepTuning.EMPTY;
        }
    }

    static Path resolveProjectResourcePath() {
        return PROJECT_RESOURCE_PATH.toAbsolutePath().normalize();
    }

    private DocumentReference docRef() {
        Firestore firestore = cardOverrideStorageService.requireFirestore();
        return firestore.collection(firestoreCollection).document(firestoreDocument);
    }

    private String resolveTimestamp(DocumentSnapshot snapshot) {
        Object updatedAt = snapshot.get("updatedAt");
        if (updatedAt instanceof Timestamp ts) return Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()).toString();
        if (snapshot.getUpdateTime() != null) {
            Timestamp ts = snapshot.getUpdateTime();
            return Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()).toString();
        }
        return null;
    }
}
