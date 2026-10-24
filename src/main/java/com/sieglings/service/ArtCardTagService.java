package com.sieglings.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.diagnostics.FirestoreReadMetrics;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Which cards appear in each gallery art piece, and where the shop hangs it.
 *
 * <p>A piece's {@code cards} drive "Cards in this image" in the gallery and the
 * shop, and let a daily offer stand on a scene of the card it sells. Its
 * {@code shop} slots name the stages it backs: {@code summon:FIRE} (that
 * element's Siegeknight Pack), {@code element:FIRE} (packs and daily offers of
 * that element) and {@code pack:<packId>}. {@code focus} is the CSS
 * object-position that keeps the subjects in frame when a 16:9 plate is cropped
 * to a phone. {@code title} and {@code place} replace the name the catalog
 * derives from the file name, and {@code hidden} takes the piece out of the game
 * (gallery, loading screens, backgrounds, shop) without deleting its files, which
 * for art packaged in the jar is not possible at runtime anyway.
 *
 * <p>{@code catalog/art-card-tags.json} is the baseline; the dashboard's edits
 * live in Firestore ({@code appConfig/artCardTags}) and replace the baseline
 * piece by piece, so art that ships with a seed tag later still gets it unless a
 * designer has already edited that piece. Without Firestore (local dev) edits
 * write the project file, like the other catalog editors.
 */
@Service
public class ArtCardTagService {

    static final String RESOURCE_PATH = "catalog/art-card-tags.json";
    private static final Path PROJECT_RESOURCE_PATH = Path.of("src", "main", "resources", "catalog", "art-card-tags.json");
    private static final long CACHE_TTL_MILLIS = 60_000L;
    static final int MAX_CARDS = 24;
    static final int MAX_SHOP_SLOTS = 12;
    private static final Pattern CARD_ID = Pattern.compile("[A-Za-z0-9_.\\-]{1,80}");
    private static final Pattern SHOP_SLOT = Pattern.compile("(summon|element|pack):[A-Za-z0-9_\\-]{1,80}");
    // Two CSS lengths ("50% 40%"); anything else would be written straight
    // into a style attribute, so it is refused rather than escaped.
    private static final Pattern FOCUS = Pattern.compile("\\d{1,3}(\\.\\d+)?% \\d{1,3}(\\.\\d+)?%");
    static final int MAX_NAME_LENGTH = 60;

    public record ArtTag(List<String> cards, List<String> shop, String focus,
                         String title, String place, boolean hidden) {
        public ArtTag(List<String> cards, List<String> shop, String focus) {
            this(cards, shop, focus, "", "", false);
        }

        public boolean isEmpty() {
            return cards.isEmpty() && shop.isEmpty() && (focus == null || focus.isEmpty())
                    && title.isEmpty() && place.isEmpty() && !hidden;
        }

        Map<String, Object> toMap() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("cards", cards);
            out.put("shop", shop);
            out.put("focus", focus == null ? "" : focus);
            out.put("title", title);
            out.put("place", place);
            out.put("hidden", hidden);
            return out;
        }
    }

    private record CacheEntry(Map<String, ArtTag> overrides, long loadedAtMillis) {}

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService storageService;
    private final String firestoreCollection;
    private final String firestoreDocument;
    private volatile Map<String, ArtTag> baseline;
    private volatile CacheEntry cache;

    @Autowired
    public ArtCardTagService(
            ObjectMapper objectMapper,
            CardOverrideStorageService storageService,
            @Value("${app.card-editor.firestore-collection:appConfig}") String firestoreCollection,
            @Value("${app.card-editor.firestore-art-tags-document:artCardTags}") String firestoreDocument
    ) {
        this.objectMapper = objectMapper;
        this.storageService = storageService;
        this.firestoreCollection = firestoreCollection;
        this.firestoreDocument = firestoreDocument;
    }

    /** Every tagged piece, keyed by lower-case piece id; empty tags are left out. */
    public Map<String, ArtTag> tags() {
        Map<String, ArtTag> merged = new TreeMap<>(baseline());
        merged.putAll(overrides());
        merged.values().removeIf(ArtTag::isEmpty);
        return Collections.unmodifiableMap(merged);
    }

    public ArtTag tagFor(String pieceId) {
        return tags().get(normalizePieceId(pieceId));
    }

    /**
     * Updates one piece's tag. Fields the body leaves out keep their current
     * value, so the tag editor (cards, shop, focus) and the rename/remove
     * controls can each save without wiping the other's fields. An all-empty
     * tag is still stored, so clearing a piece that the baseline seeds stays
     * cleared.
     */
    public ArtTag save(String pieceId, Map<String, Object> body, String updatedByEmail) {
        String id = normalizePieceId(pieceId);
        if (id.isEmpty()) {
            throw new IllegalArgumentException("Choose an art piece first.");
        }
        Map<String, Object> merged = new LinkedHashMap<>();
        Map<String, ArtTag> current = new TreeMap<>(baseline());
        current.putAll(overrides());
        ArtTag existing = current.get(id);
        if (existing != null) {
            merged.putAll(existing.toMap());
        }
        if (body != null) {
            merged.putAll(body);
        }
        ArtTag tag = parseTag(merged);
        Map<String, ArtTag> next = new TreeMap<>(overrides());
        next.put(id, tag);
        if (storageService.isFirestoreReady()) {
            writeFirestore(next, updatedByEmail);
        } else {
            writeProjectFile(id, tag);
        }
        cache = new CacheEntry(Collections.unmodifiableMap(next), System.currentTimeMillis());
        return tag;
    }

    static ArtTag parseTag(Map<String, Object> body) {
        List<String> cards = cleanList(body.get("cards"), CARD_ID, MAX_CARDS, false, "card id");
        List<String> shop = cleanList(body.get("shop"), SHOP_SLOT, MAX_SHOP_SLOTS, true, "shop slot");
        Object rawFocus = body.get("focus");
        String focus = rawFocus == null ? "" : String.valueOf(rawFocus).trim().replaceAll("\\s+", " ");
        if (!focus.isEmpty() && !FOCUS.matcher(focus).matches()) {
            throw new IllegalArgumentException("Focus must look like \"50% 40%\".");
        }
        String title = cleanName(body.get("title"), "Name");
        String place = cleanName(body.get("place"), "Place");
        Object rawHidden = body.get("hidden");
        boolean hidden = rawHidden instanceof Boolean b ? b : "true".equalsIgnoreCase(String.valueOf(rawHidden));
        return new ArtTag(cards, shop, focus, title, place, hidden);
    }

    // Display text only (every renderer escapes it); trimmed, single-spaced and
    // capped so a stray paste cannot blow out a caption.
    private static String cleanName(Object raw, String label) {
        String value = raw == null ? "" : String.valueOf(raw).replaceAll("\\s+", " ").trim();
        if (value.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException(label + " must be " + MAX_NAME_LENGTH + " characters or fewer.");
        }
        return value;
    }

    private static List<String> cleanList(Object raw, Pattern pattern, int max, boolean shopSlot, String label) {
        if (raw == null) {
            return List.of();
        }
        if (!(raw instanceof List<?> list)) {
            throw new IllegalArgumentException("Expected a list of " + label + "s.");
        }
        Set<String> out = new LinkedHashSet<>();
        for (Object item : list) {
            String value = item == null ? "" : String.valueOf(item).trim();
            if (value.isEmpty()) {
                continue;
            }
            if (shopSlot) {
                // The kind is lower-case, an element is upper-case (the enum
                // name the shop payload uses); a pack id keeps its own case.
                int colon = value.indexOf(':');
                String kind = colon > 0 ? value.substring(0, colon).toLowerCase(Locale.ROOT) : value;
                String rest = colon > 0 ? value.substring(colon + 1) : "";
                value = kind + ":" + ("pack".equals(kind) ? rest : rest.toUpperCase(Locale.ROOT));
            }
            if (!pattern.matcher(value).matches()) {
                throw new IllegalArgumentException("Not a valid " + label + ": " + value);
            }
            out.add(value);
        }
        if (out.size() > max) {
            throw new IllegalArgumentException("At most " + max + " " + label + "s per piece.");
        }
        return List.copyOf(out);
    }

    public static String normalizePieceId(String pieceId) {
        return pieceId == null ? "" : pieceId.trim().toLowerCase(Locale.ROOT);
    }

    private Map<String, ArtTag> baseline() {
        Map<String, ArtTag> loaded = baseline;
        if (loaded == null) {
            loaded = Collections.unmodifiableMap(readBaseline());
            baseline = loaded;
        }
        return loaded;
    }

    private Map<String, ArtTag> readBaseline() {
        Path projectPath = PROJECT_RESOURCE_PATH.toAbsolutePath().normalize();
        try {
            if (Files.isRegularFile(projectPath)) {
                try (InputStream stream = Files.newInputStream(projectPath)) {
                    return parseFile(stream);
                }
            }
            try (InputStream stream = getClass().getClassLoader().getResourceAsStream(RESOURCE_PATH)) {
                return stream == null ? new TreeMap<>() : parseFile(stream);
            }
        } catch (IOException | RuntimeException ex) {
            // A broken seed file must not take the gallery down; the art still lists.
            return new TreeMap<>();
        }
    }

    private Map<String, ArtTag> parseFile(InputStream stream) throws IOException {
        Map<String, Object> root = objectMapper.readValue(stream, new TypeReference<Map<String, Object>>() {});
        return parsePieces(root.get("pieces"));
    }

    private static Map<String, ArtTag> parsePieces(Object raw) {
        Map<String, ArtTag> out = new TreeMap<>();
        if (!(raw instanceof Map<?, ?> pieces)) {
            return out;
        }
        for (Map.Entry<?, ?> entry : pieces.entrySet()) {
            if (!(entry.getValue() instanceof Map<?, ?> value)) {
                continue;
            }
            Map<String, Object> body = new LinkedHashMap<>();
            value.forEach((k, v) -> body.put(String.valueOf(k), v));
            try {
                out.put(normalizePieceId(String.valueOf(entry.getKey())), parseTag(body));
            } catch (IllegalArgumentException ignored) {
                // One malformed row is skipped rather than dropping every tag.
            }
        }
        return out;
    }

    private Map<String, ArtTag> overrides() {
        if (!storageService.isFirestoreReady()) {
            return Map.of();
        }
        CacheEntry cached = cache;
        long now = System.currentTimeMillis();
        if (cached != null && now - cached.loadedAtMillis() < CACHE_TTL_MILLIS) {
            return cached.overrides();
        }
        synchronized (this) {
            cached = cache;
            if (cached != null && System.currentTimeMillis() - cached.loadedAtMillis() < CACHE_TTL_MILLIS) {
                return cached.overrides();
            }
            Map<String, ArtTag> loaded;
            try {
                long start = System.nanoTime();
                DocumentSnapshot snapshot = docRef().get().get(10, TimeUnit.SECONDS);
                FirestoreReadMetrics.record("artCardTags", System.nanoTime() - start);
                loaded = snapshot.exists() ? parsePieces(snapshot.get("pieces")) : new TreeMap<>();
            } catch (Exception ex) {
                // Serve the last good read (or none) and retry after the TTL
                // rather than failing the art catalog on a Firestore hiccup.
                loaded = cached != null ? cached.overrides() : Map.of();
            }
            Map<String, ArtTag> frozen = Collections.unmodifiableMap(loaded);
            cache = new CacheEntry(frozen, System.currentTimeMillis());
            return frozen;
        }
    }

    private void writeFirestore(Map<String, ArtTag> pieces, String updatedByEmail) {
        Map<String, Object> serialized = new LinkedHashMap<>();
        pieces.forEach((id, tag) -> serialized.put(id, tag.toMap()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("pieces", serialized);
        payload.put("updatedBy", updatedByEmail == null || updatedByEmail.isBlank()
                ? "unknown"
                : updatedByEmail.trim().toLowerCase(Locale.ROOT));
        payload.put("updatedAt", Timestamp.now());
        try {
            docRef().set(payload).get(10, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save art tags to Firestore.", ex);
        }
    }

    private synchronized void writeProjectFile(String id, ArtTag tag) {
        Path projectPath = PROJECT_RESOURCE_PATH.toAbsolutePath().normalize();
        if (projectPath.getParent() == null || !Files.isDirectory(projectPath.getParent())) {
            throw new IllegalStateException("This runtime cannot save art tags (no Firestore and no project folder).");
        }
        Map<String, ArtTag> pieces = new TreeMap<>(readBaseline());
        pieces.put(id, tag);
        pieces.values().removeIf(ArtTag::isEmpty);
        Map<String, Object> serialized = new LinkedHashMap<>();
        pieces.forEach((key, value) -> serialized.put(key, value.toMap()));
        try {
            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(projectPath.toFile(), Map.of("pieces", serialized));
        } catch (IOException ex) {
            throw new IllegalStateException("Unable to save art tags to " + projectPath, ex);
        }
        baseline = Collections.unmodifiableMap(pieces);
    }

    private DocumentReference docRef() {
        return storageService.requireFirestore().collection(firestoreCollection).document(firestoreDocument);
    }
}
