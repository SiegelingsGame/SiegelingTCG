package com.sieglings.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Rarity;
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
 * Remote-configurable shop price overrides keyed by (rarity, card type). Falls back to the
 * hardcoded default price table (the same values {@link PackCatalogService} used to hardcode)
 * whenever no override is set for a combination. Follows the same Firestore-with-local-fallback
 * pattern as {@link LiveElementCatalogService}, reusing {@link CardOverrideStorageService} for
 * the Firestore client and publish plumbing.
 */
@Service
public class ShopPriceCatalogService {

    public record LoadSnapshot(
            JsonNode data,
            CardOverrideStorageService.StorageBackend backend,
            String filePath,
            boolean canWriteProjectFile,
            String updatedBy,
            String updatedAt
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PriceOverride(String rarity, String cardType, Integer price) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ShopPriceFile(List<PriceOverride> overrides) {}

    public record PriceRow(
            Rarity rarity,
            CardType cardType,
            int defaultPrice,
            Integer overridePrice,
            int price,
            boolean isOverride
    ) {}

    private record CacheEntry(LoadSnapshot snapshot, long loadedAtMillis) {}

    public static final int MIN_PRICE = 0;
    public static final int MAX_PRICE = 100_000;

    /** Same values as the price switch PackCatalogService used to hardcode; kept as the defaults. */
    public static final Map<Rarity, Integer> DEFAULT_PRICE_BY_RARITY = Map.of(
            Rarity.COMMON, 60,
            Rarity.UNCOMMON, 95,
            Rarity.RARE, 140,
            Rarity.EPIC, 210,
            Rarity.LEGENDARY, 320
    );

    private static final long CACHE_TTL_MILLIS = 60_000L;
    static final String RESOURCE_PATH = "cards/shop-prices.json";
    private static final Path PROJECT_RESOURCE_PATH = Path.of("src", "main", "resources", "cards", "shop-prices.json");

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService cardOverrideStorageService;
    private final String firestoreCollection;
    private final String firestoreDocument;

    private volatile CacheEntry cacheEntry;

    public ShopPriceCatalogService(
            ObjectMapper objectMapper,
            CardOverrideStorageService cardOverrideStorageService,
            @Value("${app.card-editor.firestore-collection:appConfig}") String firestoreCollection,
            @Value("${app.card-editor.firestore-shop-prices-document:shopPrices}") String firestoreDocument
    ) {
        this.objectMapper = objectMapper;
        this.cardOverrideStorageService = cardOverrideStorageService;
        this.firestoreCollection = firestoreCollection;
        this.firestoreDocument = firestoreDocument;
    }

    /** Effective per-card price: an editor override when one exists, otherwise the default table. */
    public int priceFor(Rarity rarity, CardType cardType) {
        if (rarity == null) {
            throw new IllegalArgumentException("Rarity is required.");
        }
        Integer override = overridesByKey(loadSnapshot().data()).get(key(rarity, cardType));
        return override != null ? override : DEFAULT_PRICE_BY_RARITY.get(rarity);
    }

    /** Full rarity x card type grid for the dashboard, merging defaults with any overrides. */
    public List<PriceRow> buildPriceGrid() {
        return buildPriceGrid(loadSnapshot().data());
    }

    public List<PriceRow> setPrice(Rarity rarity, CardType cardType, int price, String updatedByEmail) {
        validateKey(rarity, cardType);
        if (price < MIN_PRICE || price > MAX_PRICE) {
            throw new IllegalArgumentException("Price must be between " + MIN_PRICE + " and " + MAX_PRICE + ".");
        }
        ShopPriceFile file = parseFile(loadSnapshot().data());
        List<PriceOverride> updated = new ArrayList<>();
        boolean replaced = false;
        for (PriceOverride existing : file.overrides()) {
            if (sameKey(existing, rarity, cardType)) {
                updated.add(new PriceOverride(rarity.name(), cardType.name(), price));
                replaced = true;
            } else {
                updated.add(existing);
            }
        }
        if (!replaced) {
            updated.add(new PriceOverride(rarity.name(), cardType.name(), price));
        }
        LoadSnapshot saved = saveSnapshot(objectMapper.valueToTree(new ShopPriceFile(updated)), updatedByEmail);
        return buildPriceGrid(saved.data());
    }

    public List<PriceRow> clearPrice(Rarity rarity, CardType cardType, String updatedByEmail) {
        validateKey(rarity, cardType);
        ShopPriceFile file = parseFile(loadSnapshot().data());
        List<PriceOverride> updated = new ArrayList<>();
        for (PriceOverride existing : file.overrides()) {
            if (!sameKey(existing, rarity, cardType)) {
                updated.add(existing);
            }
        }
        LoadSnapshot saved = saveSnapshot(objectMapper.valueToTree(new ShopPriceFile(updated)), updatedByEmail);
        return buildPriceGrid(saved.data());
    }

    private void validateKey(Rarity rarity, CardType cardType) {
        if (rarity == null || cardType == null) {
            throw new IllegalArgumentException("Rarity and card type are required.");
        }
    }

    private List<PriceRow> buildPriceGrid(JsonNode data) {
        Map<String, Integer> overrides = overridesByKey(data);
        List<PriceRow> rows = new ArrayList<>();
        for (Rarity rarity : Rarity.values()) {
            for (CardType cardType : CardType.values()) {
                Integer override = overrides.get(key(rarity, cardType));
                int defaultPrice = DEFAULT_PRICE_BY_RARITY.get(rarity);
                rows.add(new PriceRow(
                        rarity,
                        cardType,
                        defaultPrice,
                        override,
                        override != null ? override : defaultPrice,
                        override != null
                ));
            }
        }
        return rows;
    }

    private Map<String, Integer> overridesByKey(JsonNode data) {
        ShopPriceFile file;
        try {
            file = parseFile(data);
        } catch (IllegalArgumentException ex) {
            return Map.of();
        }
        Map<String, Integer> map = new LinkedHashMap<>();
        for (PriceOverride override : file.overrides()) {
            Rarity rarity = parseRarity(override.rarity());
            CardType cardType = parseCardType(override.cardType());
            if (rarity == null || cardType == null || override.price() == null) {
                continue;
            }
            map.put(key(rarity, cardType), override.price());
        }
        return map;
    }

    private static String key(Rarity rarity, CardType cardType) {
        return rarity.name() + "|" + cardType.name();
    }

    private static boolean sameKey(PriceOverride override, Rarity rarity, CardType cardType) {
        return rarity == parseRarity(override.rarity()) && cardType == parseCardType(override.cardType());
    }

    private static Rarity parseRarity(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Rarity.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static CardType parseCardType(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return CardType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private ShopPriceFile parseFile(JsonNode data) {
        try {
            ShopPriceFile file = objectMapper.treeToValue(data, ShopPriceFile.class);
            return file == null || file.overrides() == null ? new ShopPriceFile(List.of()) : file;
        } catch (Exception ex) {
            throw new IllegalArgumentException("The stored shop price data is malformed.", ex);
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
        ShopPriceFile file = parseFile(data);
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
                DocumentSnapshot snapshot = docRef.get().get(10, TimeUnit.SECONDS);
                LoadSnapshot loadSnapshot;
                if (!snapshot.exists() || snapshot.get("overrides") == null) {
                    loadSnapshot = persistFirestoreData(docRef, new ShopPriceFile(List.of()), "system@bootstrap");
                } else {
                    JsonNode data = objectMapper.valueToTree(new ShopPriceFile(List.of()));
                    ((com.fasterxml.jackson.databind.node.ObjectNode) data)
                            .set("overrides", objectMapper.valueToTree(snapshot.get("overrides")));
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
                throw new IllegalStateException("Unable to load shop prices from Firestore.", ex);
            }
        }
    }

    private LoadSnapshot saveToFirestore(ShopPriceFile file, String updatedByEmail) {
        try {
            LoadSnapshot snapshot = persistFirestoreData(fireStoreDocRef(), file, updatedByEmail);
            cacheEntry = new CacheEntry(cloneSnapshot(snapshot), System.currentTimeMillis());
            return snapshot;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save shop prices to Firestore.", ex);
        }
    }

    private LoadSnapshot persistFirestoreData(DocumentReference docRef, ShopPriceFile file, String updatedByEmail) throws Exception {
        JsonNode data = objectMapper.valueToTree(file);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("overrides", objectMapper.convertValue(data.get("overrides"), Object.class));
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

    private LoadSnapshot saveToProjectFile(ShopPriceFile file) {
        Path projectPath = resolveProjectResourcePath();
        if (projectPath.getParent() == null || !Files.isDirectory(projectPath.getParent())) {
            throw new IllegalStateException("This runtime cannot write to the shop prices project file.");
        }

        try {
            Files.createDirectories(projectPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(projectPath.toFile(), file);
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to save shop prices to " + projectPath, ex);
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
                    return objectMapper.valueToTree(new ShopPriceFile(List.of()));
                }
                return objectMapper.readTree(stream);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load shop prices.", ex);
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
