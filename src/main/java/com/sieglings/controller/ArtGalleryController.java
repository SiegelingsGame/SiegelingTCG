package com.sieglings.controller;

import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.CardOverrideStorageService;
import com.sieglings.service.LoadingArtStorageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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

    @Autowired
    private CardOverrideStorageService storageService;

    @Autowired
    private CardEditorAuthService authService;

    /**
     * Lists every cataloged world-art plate: classpath + local + hosted files
     * under {@code static/img/art/loading}, plus the cinematic scenes under
     * {@code static/img/gallery}. Loading files pair by name —
     * {@code <piece>-landscape.<ext>} / {@code <piece>-portrait.<ext>} — and
     * gallery plates (non-thumb) count as landscape. Adding art is dropping
     * files into either folder (or uploading from the card dashboard).
     */
    @GetMapping("/api/art/loading")
    public Map<String, Object> listLoadingArt() {
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
        for (Map<String, Object> piece : pieces.values()) {
            piece.put("hasLandscape", piece.get("landscape") instanceof String);
            piece.put("hasPortrait", piece.get("portrait") instanceof String);
        }
        return Map.of("art", new ArrayList<>(pieces.values()));
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
            response.put("art", listLoadingArt().get("art"));
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
     * Art can live in the packaged classpath (loading + cinematic gallery),
     * local runtime upload directories, or Firebase Storage. Storage entries
     * override same-named static files so hosted uploads return durable,
     * Hosting-visible URLs.
     */
    private Map<String, ArtFile> collectArtFilesByFilename() {
        Map<String, ArtFile> filesByFilename = new TreeMap<>();
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
        }
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
