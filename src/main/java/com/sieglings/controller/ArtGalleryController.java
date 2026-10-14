package com.sieglings.controller;

import com.sieglings.service.ArtCardTagService;
import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.CardOverrideStorageService;
import com.sieglings.service.GalleryRewardService;
import com.sieglings.service.LoadingArtStorageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Files;
import java.time.Duration;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Stream;

@RestController
public class ArtGalleryController {

    private static final String EDITOR_TOKEN_HEADER = "X-Card-Editor-Token";
    private static final Set<String> IMAGE_EXTENSIONS = Set.of("png", "jpg", "jpeg", "webp", "gif");

    /**
     * Cinematic hub plates live in {@code img/gallery/} (unsuffixed 16:9 scenes)
     * rather than the loading-art landscape/portrait pair convention. Keep their
     * display titles/places here so the dashboard catalog matches the hub.
     */
    private static final Map<String, CinematicMeta> CINEMATIC = Map.of(
            "bearby-longfuse", new CinematicMeta("The Long Fuse", "Emberwaste Gate"),
            "bearby-blastoff", new CinematicMeta("Blast Off", "Emberwaste Gate"),
            "bearnade-payload", new CinematicMeta("Payload Away", "The Sunken Span"),
            "bearzooka-rampage", new CinematicMeta("Emberwaste Rampage", "Cinderfall Reach"),
            "draco-brood", new CinematicMeta("The Cinder Brood", "Moltenmaw Basin")
    );

    @Autowired
    private LoadingArtStorageService loadingArtStorageService;

    private volatile Map<String, ArtFile> packagedArtFiles;

    @Autowired
    private CardOverrideStorageService storageService;

    @Autowired
    private CardEditorAuthService authService;

    @Autowired
    private GalleryRewardService galleryRewardService;

    @Autowired
    private ArtCardTagService artCardTagService;

    /**
     * Which gallery pieces are achievement rewards, and what unlocks each. Public
     * and the same for everyone (a guest sees the locks too); whether THIS player
     * has earned a piece rides on /api/player/progression as galleryUnlockedIds.
     */
    @GetMapping("/api/art/rewards")
    public ResponseEntity<Map<String, Object>> galleryRewards() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .body(galleryRewardService.serializeTable());
    }

    /**
     * Lists every cataloged world-art plate: classpath + local + hosted files
     * under {@code static/img/art/loading}, plus the cinematic scenes under
     * {@code static/img/gallery}. Loading files pair by name —
     * {@code <piece>-landscape.<ext>} / {@code <piece>-portrait.<ext>} — and
     * gallery plates (non-thumb) count as landscape. Adding art is dropping
     * files into either folder (or uploading from the card dashboard).
     */
    @GetMapping("/api/art/loading")
    public Map<String, Object> listLoadingArt(
            @RequestParam(value = "all", required = false, defaultValue = "false") boolean all) {
        return catalog(all);
    }

    /**
     * {@code all=false} is what the game reads: pieces a designer removed are left
     * out, and their ids ride along in {@code removed} so clients can also drop
     * the scenes they compile in. The dashboard asks for {@code all=true} to list
     * removed pieces (flagged {@code hidden}) so they can be restored.
     */
    private Map<String, Object> catalog(boolean includeHidden) {
        Map<String, Map<String, Object>> pieces = new TreeMap<>();
        for (Map.Entry<String, ArtFile> artEntry : collectArtFilesByFilename().entrySet()) {
            String filename = artEntry.getKey();
            ArtFile artFile = artEntry.getValue();
            int dot = filename.lastIndexOf('.');
            if (dot <= 0) {
                continue;
            }
            String ext = filename.substring(dot + 1).toLowerCase(Locale.ROOT);
            if (!IMAGE_EXTENSIONS.contains(ext)) {
                continue;
            }
            String base = filename.substring(0, dot);
            String lower = base.toLowerCase(Locale.ROOT);
            // Gallery thumbs are companion previews, not separate catalog pieces.
            if (lower.endsWith("-thumb")) {
                continue;
            }
            String orientation = "landscape";
            String id = base;
            if (lower.endsWith("-portrait")) {
                orientation = "portrait";
                id = base.substring(0, base.length() - "-portrait".length());
            } else if (lower.endsWith("-landscape")) {
                id = base.substring(0, base.length() - "-landscape".length());
            }
            String pieceKey = id.toLowerCase(Locale.ROOT);
            // Prefer a .webp twin over a same-named .png/.jpg: the raster
            // originals are ~6x larger and every browser we target reads WebP.
            Object existing = pieces.containsKey(pieceKey)
                    ? pieces.get(pieceKey).get(orientation)
                    : null;
            if (existing instanceof String current
                    && current.toLowerCase(Locale.ROOT).contains(".webp")
                    && !"webp".equals(ext)) {
                continue;
            }
            // Loading-folder orientation wins over a cinematic plate of the same
            // id so a dashboard replace that wrote the standard pair is what the
            // gallery and backgrounds pick up next.
            if (existing instanceof String current
                    && current.contains("/img/art/loading/")
                    && artFile.source() == ArtSource.CINEMATIC) {
                continue;
            }
            String pieceId = id;
            ArtSource source = artFile.source();
            Map<String, Object> piece = pieces.computeIfAbsent(pieceKey, key -> {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", pieceId);
                CinematicMeta cinematic = CINEMATIC.get(pieceKey);
                if (cinematic != null) {
                    entry.put("title", cinematic.title());
                    entry.put("place", cinematic.place());
                } else {
                    entry.put("title", titleFromId(pieceId));
                }
                entry.put("source", source == ArtSource.CINEMATIC ? "cinematic" : "loading");
                return entry;
            });
            // Once a loading orientation exists, keep source=loading even if a
            // cinematic landscape was cataloged first.
            if (source == ArtSource.LOADING) {
                piece.put("source", "loading");
            } else if (!"loading".equals(piece.get("source")) && CINEMATIC.containsKey(pieceKey)) {
                piece.put("source", "cinematic");
            }
            piece.put(orientation, artFile.url());
        }
        Map<String, ArtCardTagService.ArtTag> tags = artCardTagService.tags();
        List<Map<String, Object>> art = new ArrayList<>();
        List<String> removed = new ArrayList<>();
        for (Map.Entry<String, Map<String, Object>> entry : pieces.entrySet()) {
            Map<String, Object> piece = entry.getValue();
            piece.put("hasLandscape", piece.get("landscape") instanceof String);
            piece.put("hasPortrait", piece.get("portrait") instanceof String);
            ArtCardTagService.ArtTag tag = tags.get(entry.getKey());
            piece.put("cards", tag == null ? List.of() : tag.cards());
            piece.put("shop", tag == null ? List.of() : tag.shop());
            piece.put("focus", tag == null || tag.focus() == null ? "" : tag.focus());
            // The name the file gives a piece is only a default.
            piece.put("defaultTitle", piece.get("title"));
            if (tag != null && !tag.title().isEmpty()) {
                piece.put("title", tag.title());
            }
            if (tag != null && !tag.place().isEmpty()) {
                piece.put("place", tag.place());
            }
            boolean hidden = tag != null && tag.hidden();
            piece.put("hidden", hidden);
            if (hidden) {
                removed.add(entry.getKey());
                if (!includeHidden) {
                    continue;
                }
            }
            art.add(piece);
        }
        // A removed piece the game compiles in (a cinematic scene) may have no
        // file listed here at all; it still has to be named as removed.
        tags.forEach((id, tag) -> {
            if (tag.hidden() && !removed.contains(id)) {
                removed.add(id);
            }
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("art", art);
        out.put("removed", removed);
        return out;
    }

    /**
     * Uploads a loading-art image from the card dashboard. Requires the same
     * editor sign-in as card art uploads when live publishing is configured.
     * Landscape replaces for known cinematic gallery ids write back to
     * {@code img/gallery/} so the hub scenes stay in sync; everything else
     * uses the loading landscape/portrait pair folder.
     */
    @PostMapping(value = "/api/art/loading", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> uploadLoadingArt(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @RequestParam("pieceId") String pieceId,
            @RequestParam("orientation") String orientation,
            @RequestParam("file") MultipartFile file) {
        try {
            if (storageService.isFirestoreReady()) {
                authService.requireEditor(editorToken);
            }
            String normalizedId = LoadingArtStorageService.normalizePieceId(pieceId);
            String normalizedOrientation = orientation == null
                    ? ""
                    : orientation.trim().toLowerCase(Locale.ROOT);
            String url;
            if ("landscape".equals(normalizedOrientation) && isCinematicPiece(normalizedId)) {
                url = loadingArtStorageService.saveCinematicGalleryArt(normalizedId, file);
            } else {
                url = loadingArtStorageService.saveLoadingArt(pieceId, orientation, file);
            }
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("ok", true);
            response.put("url", url);
            response.put("art", catalog(true).get("art"));
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException ex) {
            return error(HttpStatus.BAD_REQUEST, ex.getMessage());
        } catch (IllegalStateException ex) {
            return error(HttpStatus.UNAUTHORIZED, ex.getMessage());
        } catch (Exception ex) {
            return error(HttpStatus.INTERNAL_SERVER_ERROR, "Loading art upload failed: " + ex.getMessage());
        }
    }

    /**
     * Tags one piece with the cards it shows and the shop stages it backs (see
     * {@link ArtCardTagService}). Same editor sign-in as art uploads; answers
     * with the refreshed catalog so the dashboard repaints from one call.
     */
    @PutMapping("/api/art/tags/{pieceId}")
    public ResponseEntity<Map<String, Object>> saveArtTags(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @PathVariable("pieceId") String pieceId,
            @RequestBody(required = false) Map<String, Object> body) {
        try {
            String email = null;
            if (storageService.isFirestoreReady()) {
                email = authService.requireEditor(editorToken).email();
            }
            String id = ArtCardTagService.normalizePieceId(pieceId);
            boolean known = catalog(true).get("art") instanceof List<?> art && art.stream()
                    .anyMatch(p -> p instanceof Map<?, ?> m && id.equals(String.valueOf(m.get("id")).toLowerCase(Locale.ROOT)));
            if (!known) {
                return error(HttpStatus.NOT_FOUND, "No art piece named " + pieceId + ".");
            }
            ArtCardTagService.ArtTag tag = artCardTagService.save(id, body, email);
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("ok", true);
            response.put("pieceId", id);
            response.put("cards", tag.cards());
            response.put("shop", tag.shop());
            response.put("focus", tag.focus());
            response.put("title", tag.title());
            response.put("place", tag.place());
            response.put("hidden", tag.hidden());
            response.put("art", catalog(true).get("art"));
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException ex) {
            // requireEditor signals a missing/expired sign-in this way too.
            HttpStatus status = ex.getMessage() != null && ex.getMessage().startsWith("Sign in")
                    ? HttpStatus.UNAUTHORIZED
                    : HttpStatus.BAD_REQUEST;
            return error(status, ex.getMessage());
        } catch (IllegalStateException ex) {
            Throwable cause = ex.getCause();
            return error(HttpStatus.SERVICE_UNAVAILABLE, ex.getMessage()
                    + (cause != null && cause.getMessage() != null ? " (" + cause.getMessage() + ")" : ""));
        } catch (RuntimeException ex) {
            // Anything else still answers in JSON, so the dashboard can show why.
            return error(HttpStatus.INTERNAL_SERVER_ERROR, "Saving art tags failed: " + ex.getMessage());
        }
    }

    /**
     * Art can live in the packaged classpath (loading + cinematic gallery),
     * local runtime upload directories, or Firebase Storage. Storage entries
     * override same-named static files so hosted uploads return durable,
     * Hosting-visible URLs.
     */
    private Map<String, ArtFile> collectArtFilesByFilename() {
        Map<String, ArtFile> filesByFilename = new TreeMap<>(packagedArtFiles());
        Path uploadDir = loadingArtStorageService.getArtDirectory();
        if (Files.isDirectory(uploadDir)) {
            try (Stream<Path> files = Files.list(uploadDir)) {
                files.filter(Files::isRegularFile)
                        .map(path -> path.getFileName().toString())
                        .forEach(filename -> filesByFilename.put(
                                filename,
                                new ArtFile("/img/art/loading/" + filename, ArtSource.LOADING)
                        ));
            } catch (Exception ex) {
                // Ignore and serve what the classpath provided.
            }
        }
        Path galleryDir = loadingArtStorageService.getGalleryDirectory();
        if (Files.isDirectory(galleryDir)) {
            try (Stream<Path> files = Files.list(galleryDir)) {
                files.filter(Files::isRegularFile)
                        .map(path -> path.getFileName().toString())
                        .forEach(filename -> filesByFilename.putIfAbsent(
                                filename,
                                new ArtFile("/img/gallery/" + filename, ArtSource.CINEMATIC)
                        ));
            } catch (Exception ex) {
                // Ignore and serve classpath gallery entries.
            }
        }
        for (Map.Entry<String, String> hosted : loadingArtStorageService.listHostedArtUrls().entrySet()) {
            String url = hosted.getValue();
            ArtSource source = isGalleryUrl(url) ? ArtSource.CINEMATIC : ArtSource.LOADING;
            filesByFilename.put(hosted.getKey(), new ArtFile(url, source));
        }
        return filesByFilename;
    }

    /**
     * The art packaged in the jar cannot change while the JVM runs, so the
     * classpath scan (a walk over every jar entry) runs once rather than on
     * every /api/art/loading call. A scan that failed is not remembered, so a
     * transient read error cannot drop packaged art for the life of the process.
     */
    private Map<String, ArtFile> packagedArtFiles() {
        Map<String, ArtFile> cached = packagedArtFiles;
        if (cached != null) {
            return cached;
        }
        Map<String, ArtFile> filesByFilename = new TreeMap<>();
        boolean complete = true;
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        try {
            Resource[] resources = resolver.getResources("classpath*:/static/img/art/loading/*.*");
            for (Resource resource : resources) {
                String filename = resource.getFilename();
                if (filename != null) {
                    filesByFilename.put(filename, new ArtFile("/img/art/loading/" + filename, ArtSource.LOADING));
                }
            }
        } catch (Exception ex) {
            // An unreadable classpath folder just means fewer entries.
            complete = false;
        }
        try {
            Resource[] galleryResources = resolver.getResources("classpath*:/static/img/gallery/*.*");
            for (Resource resource : galleryResources) {
                String filename = resource.getFilename();
                if (filename != null) {
                    // Do not clobber a loading-folder file of the same name.
                    filesByFilename.putIfAbsent(
                            filename,
                            new ArtFile("/img/gallery/" + filename, ArtSource.CINEMATIC)
                    );
                }
            }
        } catch (Exception ex) {
            // Gallery is optional for the loading catalog.
            complete = false;
        }
        Map<String, ArtFile> result = Collections.unmodifiableMap(filesByFilename);
        if (complete) {
            packagedArtFiles = result;
        }
        return result;
    }

    private static boolean isGalleryUrl(String url) {
        if (url == null) {
            return false;
        }
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.contains("/img/gallery/") || lower.contains("img%2fgallery%2f");
    }

    private boolean isCinematicPiece(String normalizedId) {
        if (normalizedId == null) {
            return false;
        }
        if (CINEMATIC.containsKey(normalizedId)) {
            return true;
        }
        // Any non-thumb plate already on disk under img/gallery counts, so a
        // newly dropped cinematic file is editable before CINEMATIC is updated.
        for (ArtFile artFile : collectArtFilesByFilename().values()) {
            if (artFile.source() != ArtSource.CINEMATIC) {
                continue;
            }
            String url = artFile.url();
            int slash = url.lastIndexOf('/');
            String filename = slash >= 0 ? url.substring(slash + 1) : url;
            int dot = filename.lastIndexOf('.');
            String base = dot > 0 ? filename.substring(0, dot) : filename;
            String lower = base.toLowerCase(Locale.ROOT);
            if (lower.endsWith("-thumb")) {
                continue;
            }
            if (lower.endsWith("-landscape")) {
                lower = lower.substring(0, lower.length() - "-landscape".length());
            } else if (lower.endsWith("-portrait")) {
                continue;
            }
            if (normalizedId.equals(lower)) {
                return true;
            }
        }
        return false;
    }

    private String titleFromId(String id) {
        String[] words = id.replace('_', ' ').replace('-', ' ').trim().split("\\s+");
        StringBuilder title = new StringBuilder();
        for (String word : words) {
            if (word.isEmpty()) {
                continue;
            }
            if (title.length() > 0) {
                title.append(' ');
            }
            title.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return title.length() == 0 ? "Untitled" : title.toString();
    }

    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("ok", false, "error", message == null ? "Request failed" : message));
    }

    private enum ArtSource {
        LOADING,
        CINEMATIC
    }

    private record ArtFile(String url, ArtSource source) {}

    private record CinematicMeta(String title, String place) {}
}
