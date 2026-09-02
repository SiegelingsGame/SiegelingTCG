package com.sieglings.service;

import com.sieglings.diagnostics.FirestoreReadMetrics;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.ServiceOptions;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.FirestoreOptions;
import com.google.cloud.firestore.SetOptions;
import com.sieglings.util.FirestorePayloadSanitizer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class CardOverrideStorageService {

    public enum StorageBackend {
        FIRESTORE,
        PROJECT_FILE,
        CLASSPATH_RESOURCE
    }

    public record LoadSnapshot(
            JsonNode data,
            StorageBackend backend,
            String filePath,
            boolean canWriteProjectFile,
            String updatedBy,
            String updatedAt
    ) {}

    private record CacheEntry(LoadSnapshot snapshot, long loadedAtMillis, long publishVersion) {}
    private record PublishVersionEntry(long version, long loadedAtMillis) {}

    // Gameplay can hit the live card catalog multiple times in the same short session.
    // Keep the cached snapshot warm long enough that opening the loadout screen and then
    // starting a match does not trigger another remote config round-trip.
    private static final long CACHE_TTL_MILLIS = 5 * 60_000L;
    private static final long PUBLISH_VERSION_CACHE_TTL_MILLIS = 1_000L;
    private static volatile CardOverrideStorageService INSTANCE;

    private final ObjectMapper objectMapper;
    private final boolean firestoreEnabled;
    private final String firestoreProjectId;
    private final String firestoreServiceAccountPath;
    private final String firestoreDatabaseId;
    private final String firestoreCollection;
    private final String firestoreDocument;
    private final String firestorePublishSignalDocument;

    private volatile Firestore firestore;
    private volatile String firestoreInitializationError;
    private volatile CacheEntry cacheEntry;
    private volatile PublishVersionEntry publishVersionEntry;
    private final AtomicLong localCatalogRevision = new AtomicLong(0L);

    @Autowired
    public CardOverrideStorageService(
            ObjectMapper objectMapper,
            @Value("${app.card-editor.firestore-enabled:true}") boolean firestoreEnabled,
            @Value("${app.card-editor.firestore-project-id:}") String firestoreProjectId,
            @Value("${app.card-editor.firestore-service-account-path:}") String firestoreServiceAccountPath,
            @Value("${app.card-editor.firestore-database-id:(default)}") String firestoreDatabaseId,
            @Value("${app.card-editor.firestore-collection:appConfig}") String firestoreCollection,
            @Value("${app.card-editor.firestore-document:cardOverrides}") String firestoreDocument,
            @Value("${app.card-editor.firestore-publish-signal-document:livePublishState}") String firestorePublishSignalDocument
    ) {
        this.objectMapper = objectMapper;
        this.firestoreEnabled = firestoreEnabled;
        this.firestoreProjectId = firestoreProjectId == null ? "" : firestoreProjectId.trim();
        this.firestoreServiceAccountPath = firestoreServiceAccountPath == null ? "" : firestoreServiceAccountPath.trim();
        this.firestoreDatabaseId = firestoreDatabaseId == null || firestoreDatabaseId.isBlank()
                ? "(default)"
                : firestoreDatabaseId.trim();
        this.firestoreCollection = firestoreCollection;
        this.firestoreDocument = firestoreDocument;
        this.firestorePublishSignalDocument = firestorePublishSignalDocument == null || firestorePublishSignalDocument.isBlank()
                ? "livePublishState"
                : firestorePublishSignalDocument.trim();
    }

    CardOverrideStorageService(
            ObjectMapper objectMapper,
            boolean firestoreEnabled,
            String firestoreProjectId,
            String firestoreServiceAccountPath,
            String firestoreDatabaseId,
            String firestoreCollection,
            String firestoreDocument
    ) {
        this(
                objectMapper,
                firestoreEnabled,
                firestoreProjectId,
                firestoreServiceAccountPath,
                firestoreDatabaseId,
                firestoreCollection,
                firestoreDocument,
                "livePublishState"
        );
    }

    @PostConstruct
    void registerInstance() {
        INSTANCE = this;
        ensureFirestoreInitialized();
    }

    @PreDestroy
    void cleanup() {
        Firestore current = firestore;
        if (current != null) {
            try {
                current.close();
            } catch (Exception ignored) {
                // Shutdown should not fail the Spring context teardown.
            }
        }
        if (INSTANCE == this) {
            INSTANCE = null;
        }
    }

    public LoadSnapshot loadSnapshot() {
        ensureFirestoreInitialized();
        if (isFirestoreReady()) {
            try {
                return loadFirestoreSnapshot();
            } catch (RuntimeException ex) {
                firestoreInitializationError = ex.getMessage();
            }
        }
        return loadLocalSnapshot();
    }

    public LoadSnapshot saveSnapshot(JsonNode data, String updatedByEmail) {
        ManualSieglingCatalog.OverrideFile file = parseOverrideFile(data);
        ManualSieglingCatalog.validateDefinitions(file);
        ensureFirestoreInitialized();

        if (isFirestoreReady()) {
            return saveToFirestore(file, updatedByEmail);
        }

        return saveToProjectFile(file);
    }

    public boolean isFirestoreReady() {
        return firestore != null;
    }

    public String getFirestoreInitializationError() {
        return firestoreInitializationError;
    }

    public static List<ManualSieglingCatalog.ManualSieglingDefinition> loadDefinitionsForGame(ObjectMapper mapper) {
        CardOverrideStorageService current = INSTANCE;
        if (current == null) {
            return readDefinitionsFromLocal(mapper);
        }
        return current.loadDefinitionsInternal();
    }

    private List<ManualSieglingCatalog.ManualSieglingDefinition> loadDefinitionsInternal() {
        return parseOverrideFile(loadSnapshot().data()).cards();
    }

    private synchronized void ensureFirestoreInitialized() {
        if (!firestoreEnabled || firestore != null || firestoreInitializationError != null) {
            return;
        }
        try {
            FirestoreClientContext context = createFirestoreContext();
            firestore = context.client();
        } catch (Exception ex) {
            firestoreInitializationError = ex.getMessage();
        }
    }

    private LoadSnapshot loadFirestoreSnapshot() {
        CacheEntry cached = cacheEntry;
        long now = System.currentTimeMillis();
        Long publishVersion = getCurrentPublishVersion();
        if (cached != null && now - cached.loadedAtMillis() < CACHE_TTL_MILLIS
                && (publishVersion == null || cached.publishVersion() == publishVersion.longValue())) {
            return cached.snapshot();
        }

        synchronized (this) {
            cached = cacheEntry;
            now = System.currentTimeMillis();
            publishVersion = getCurrentPublishVersion();
            if (cached != null && now - cached.loadedAtMillis() < CACHE_TTL_MILLIS
                    && (publishVersion == null || cached.publishVersion() == publishVersion.longValue())) {
                return cached.snapshot();
            }

            try {
                DocumentReference docRef = fireStoreDocRef();
                long __fsReadStart = System.nanoTime();
                DocumentSnapshot snapshot = docRef.get().get(10, TimeUnit.SECONDS);
                FirestoreReadMetrics.record("cardOverrides", System.nanoTime() - __fsReadStart);
                LoadSnapshot loadSnapshot;
                if (!snapshot.exists() || snapshot.get("cards") == null) {
                    JsonNode fallback = readLocalData();
                    loadSnapshot = persistFirestoreData(docRef, parseOverrideFile(fallback), "system@bootstrap");
                } else {
                    ObjectNode data = objectMapper.createObjectNode();
                    data.set("cards", objectMapper.valueToTree(snapshot.get("cards")));
                    if (snapshot.get("moves") != null) {
                        data.set("moves", objectMapper.valueToTree(snapshot.get("moves")));
                    }
                    loadSnapshot = new LoadSnapshot(
                            data,
                            StorageBackend.FIRESTORE,
                            fireStoreDocRef().getPath(),
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
                throw new IllegalStateException("Unable to load live card data from Firestore.", ex);
            }
        }
    }

    private LoadSnapshot saveToFirestore(ManualSieglingCatalog.OverrideFile file, String updatedByEmail) {
        try {
            LoadSnapshot snapshot = persistFirestoreData(fireStoreDocRef(), file, updatedByEmail);
            Long publishVersion = getCurrentPublishVersion();
            cacheEntry = new CacheEntry(
                    cloneSnapshot(snapshot),
                    System.currentTimeMillis(),
                    publishVersion == null ? 0L : publishVersion
            );
            return snapshot;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save live card data to Firestore.", ex);
        }
    }

    private LoadSnapshot persistFirestoreData(DocumentReference docRef,
                                              ManualSieglingCatalog.OverrideFile file,
                                              String updatedByEmail) throws Exception {
        JsonNode data = objectMapper.valueToTree(file);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("cards", FirestorePayloadSanitizer.sanitize(objectMapper.convertValue(data.get("cards"), Object.class)));
        if (data.get("moves") != null) {
            payload.put("moves", FirestorePayloadSanitizer.sanitize(objectMapper.convertValue(data.get("moves"), Object.class)));
        }
        payload.put("updatedBy", updatedByEmail == null || updatedByEmail.isBlank() ? "unknown" : updatedByEmail.trim().toLowerCase());
        payload.put("updatedAt", Timestamp.now());
        docRef.set(payload).get(10, TimeUnit.SECONDS);

        return new LoadSnapshot(
                data,
                StorageBackend.FIRESTORE,
                docRef.getPath(),
                false,
                (String) payload.get("updatedBy"),
                Instant.now().toString()
        );
    }

    private LoadSnapshot loadLocalSnapshot() {
        JsonNode data = readLocalData();
        Path projectPath = ManualSieglingCatalog.resolveProjectResourcePath();
        boolean hasProjectFile = Files.isRegularFile(projectPath);
        return new LoadSnapshot(
                data,
                hasProjectFile ? StorageBackend.PROJECT_FILE : StorageBackend.CLASSPATH_RESOURCE,
                hasProjectFile ? projectPath.toString() : ManualSieglingCatalog.RESOURCE_PATH,
                projectPath.getParent() != null && Files.isDirectory(projectPath.getParent()),
                null,
                null
        );
    }

    private LoadSnapshot saveToProjectFile(ManualSieglingCatalog.OverrideFile file) {
        Path projectPath = ManualSieglingCatalog.resolveProjectResourcePath();
        if (projectPath.getParent() == null || !Files.isDirectory(projectPath.getParent())) {
            throw new IllegalStateException("This runtime cannot write to the project resource file.");
        }

        try {
            Files.createDirectories(projectPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(projectPath.toFile(), file);
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to save manual Siegling definitions to " + projectPath, ex);
        }

        cacheEntry = null;
        localCatalogRevision.incrementAndGet();
        return new LoadSnapshot(
                objectMapper.valueToTree(file),
                StorageBackend.PROJECT_FILE,
                projectPath.toString(),
                true,
                null,
                Instant.now().toString()
        );
    }

    private FirestoreClientContext createFirestoreContext() throws IOException {
        GoogleCredentials credentials = null;
        String projectId = firstNonBlank(
                firestoreProjectId,
                System.getenv("GOOGLE_CLOUD_PROJECT"),
                System.getenv("GCLOUD_PROJECT"),
                ServiceOptions.getDefaultProjectId()
        );

        Path serviceAccountFile = resolveServiceAccountFile();
        if (serviceAccountFile != null && Files.isRegularFile(serviceAccountFile)) {
            try (InputStream stream = Files.newInputStream(serviceAccountFile)) {
                credentials = GoogleCredentials.fromStream(stream);
            }
            if (projectId == null) {
                projectId = readProjectIdFromServiceAccount(serviceAccountFile);
            }
        }

        if (credentials == null) {
            credentials = GoogleCredentials.getApplicationDefault();
        }
        if (projectId == null || projectId.isBlank()) {
            throw new IllegalStateException("No Firebase or Google Cloud project id was available for Firestore.");
        }

        Firestore client = FirestoreOptions.newBuilder()
                .setCredentials(credentials)
                .setProjectId(projectId)
                .setDatabaseId(firestoreDatabaseId)
                .build()
                .getService();
        return new FirestoreClientContext(client, projectId);
    }

    private DocumentReference fireStoreDocRef() {
        return firestore.collection(firestoreCollection).document(firestoreDocument);
    }

    private DocumentReference fireStorePublishSignalDocRef() {
        return firestore.collection(firestoreCollection).document(firestorePublishSignalDocument);
    }

    private JsonNode readLocalData() {
        Path projectPath = ManualSieglingCatalog.resolveProjectResourcePath();
        try {
            if (Files.isRegularFile(projectPath)) {
                try (InputStream stream = Files.newInputStream(projectPath)) {
                    return objectMapper.readTree(stream);
                }
            }
            try (InputStream stream = getClass().getClassLoader().getResourceAsStream(ManualSieglingCatalog.RESOURCE_PATH)) {
                if (stream == null) {
                    ObjectNode empty = objectMapper.createObjectNode();
                    empty.putArray("cards");
                    return empty;
                }
                return objectMapper.readTree(stream);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load manual Siegling definitions.", ex);
        }
    }

    private static List<ManualSieglingCatalog.ManualSieglingDefinition> readDefinitionsFromLocal(ObjectMapper mapper) {
        Path projectPath = ManualSieglingCatalog.resolveProjectResourcePath();
        try {
            if (Files.isRegularFile(projectPath)) {
                try (InputStream stream = Files.newInputStream(projectPath)) {
                    return readDefinitions(mapper, stream);
                }
            }
            try (InputStream stream = CardOverrideStorageService.class.getClassLoader().getResourceAsStream(ManualSieglingCatalog.RESOURCE_PATH)) {
                if (stream == null) {
                    return List.of();
                }
                return readDefinitions(mapper, stream);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load manual Siegling definitions.", ex);
        }
    }

    private static List<ManualSieglingCatalog.ManualSieglingDefinition> readDefinitions(ObjectMapper mapper, InputStream stream)
            throws IOException {
        ManualSieglingCatalog.OverrideFile file = mapper.readValue(stream, ManualSieglingCatalog.OverrideFile.class);
        return file == null || file.cards() == null ? List.of() : List.copyOf(file.cards());
    }

    private ManualSieglingCatalog.OverrideFile parseOverrideFile(JsonNode data) {
        try {
            ManualSieglingCatalog.OverrideFile file = objectMapper.treeToValue(data, ManualSieglingCatalog.OverrideFile.class);
            if (file == null || file.cards() == null) {
                throw new IllegalArgumentException("The JSON must contain a top-level 'cards' array.");
            }
            return file;
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("The submitted JSON does not match the Sieglings override format.", ex);
        }
    }

    private Path resolveServiceAccountFile() {
        if (firestoreServiceAccountPath == null || firestoreServiceAccountPath.isBlank()) {
            return null;
        }
        Path candidate = Path.of(firestoreServiceAccountPath);
        if (candidate.isAbsolute()) {
            return candidate.normalize();
        }
        Path workingDirectory = Path.of("").toAbsolutePath().normalize();
        Path localCandidate = workingDirectory.resolve(candidate).normalize();
        if (Files.isRegularFile(localCandidate)) {
            return localCandidate;
        }

        Path parentCandidate = workingDirectory.getParent() == null
                ? localCandidate
                : workingDirectory.getParent().resolve(candidate).normalize();
        if (Files.isRegularFile(parentCandidate)) {
            return parentCandidate;
        }

        return localCandidate;
    }

    private String readProjectIdFromServiceAccount(Path file) throws IOException {
        JsonNode node = objectMapper.readTree(file.toFile());
        JsonNode projectIdNode = node.get("project_id");
        return projectIdNode == null || projectIdNode.isNull() ? null : projectIdNode.asText();
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

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    public Firestore requireFirestore() {
        ensureFirestoreInitialized();
        if (firestore == null) {
            throw new IllegalStateException("Firestore is not available in this runtime.");
        }
        return firestore;
    }

    /**
     * Monotonic revision for catalog consumers. Uses the live Firestore publish signal when
     * available; otherwise bumps on each project-file save in this JVM.
     */
    public long getCatalogRevision() {
        Long published = getCurrentPublishVersion();
        if (published != null) {
            return published;
        }
        return localCatalogRevision.get();
    }

    public Long getCurrentPublishVersion() {
        ensureFirestoreInitialized();
        if (!isFirestoreReady()) {
            return null;
        }

        PublishVersionEntry cached = publishVersionEntry;
        long now = System.currentTimeMillis();
        if (cached != null && now - cached.loadedAtMillis() < PUBLISH_VERSION_CACHE_TTL_MILLIS) {
            return cached.version();
        }

        synchronized (this) {
            cached = publishVersionEntry;
            now = System.currentTimeMillis();
            if (cached != null && now - cached.loadedAtMillis() < PUBLISH_VERSION_CACHE_TTL_MILLIS) {
                return cached.version();
            }
            try {
                long __fsReadStart = System.nanoTime();
                DocumentSnapshot snapshot = fireStorePublishSignalDocRef().get().get(5, TimeUnit.SECONDS);
                FirestoreReadMetrics.record("publishVersion", System.nanoTime() - __fsReadStart);
                long version = resolvePublishVersion(snapshot);
                publishVersionEntry = new PublishVersionEntry(version, System.currentTimeMillis());
                return version;
            } catch (Exception ex) {
                return null;
            }
        }
    }

    public void markLivePublish(String updatedByEmail) {
        ensureFirestoreInitialized();
        if (!isFirestoreReady()) {
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("version", FieldValue.increment(1L));
            payload.put("updatedBy", updatedByEmail == null || updatedByEmail.isBlank() ? "unknown" : updatedByEmail.trim().toLowerCase());
            payload.put("updatedAt", Timestamp.now());
            fireStorePublishSignalDocRef().set(payload, SetOptions.merge()).get(10, TimeUnit.SECONDS);
            publishVersionEntry = null;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to bump the live publish signal in Firestore.", ex);
        }
    }

    private long resolvePublishVersion(DocumentSnapshot snapshot) {
        Object version = snapshot == null ? null : snapshot.get("version");
        if (version instanceof Number number) {
            return number.longValue();
        }
        if (snapshot != null && snapshot.getUpdateTime() != null) {
            Timestamp ts = snapshot.getUpdateTime();
            return ts.getSeconds() * 1_000_000_000L + ts.getNanos();
        }
        return 0L;
    }

    private record FirestoreClientContext(Firestore client, String projectId) {}
}
