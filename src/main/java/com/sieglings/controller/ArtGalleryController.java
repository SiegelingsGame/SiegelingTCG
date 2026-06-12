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
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Stream;

@RestController
public class ArtGalleryController {

    private static final String EDITOR_TOKEN_HEADER = "X-Card-Editor-Token";
    private static final Set<String> IMAGE_EXTENSIONS = Set.of("png", "jpg", "jpeg", "webp", "gif");

    @Autowired
    private LoadingArtStorageService loadingArtStorageService;

    @Autowired
    private CardOverrideStorageService storageService;

    @Autowired
    private CardEditorAuthService authService;

    /**
     * Lists the loading-screen art in {@code static/img/art/loading}. Files
     * pair up by name — {@code <piece>-landscape.<ext>} and
     * {@code <piece>-portrait.<ext>} become one gallery entry — so adding art
     * is just dropping files into the folder (or uploading from the card
     * dashboard); there is no manifest to maintain.
     */
    @GetMapping("/api/art/loading")
    public Map<String, Object> listLoadingArt() {
        Map<String, Map<String, Object>> pieces = new TreeMap<>();
        for (String filename : collectArtFilenames()) {
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
            String orientation = "landscape";
            String id = base;
            if (lower.endsWith("-portrait")) {
                orientation = "portrait";
                id = base.substring(0, base.length() - "-portrait".length());
            } else if (lower.endsWith("-landscape")) {
                id = base.substring(0, base.length() - "-landscape".length());
            }
            String pieceId = id;
            Map<String, Object> piece = pieces.computeIfAbsent(id.toLowerCase(Locale.ROOT), key -> {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", pieceId);
                entry.put("title", titleFromId(pieceId));
                return entry;
            });
            piece.put(orientation, "/img/art/loading/" + filename);
        }
        return Map.of("art", new ArrayList<>(pieces.values()));
    }

    /**
     * Uploads a loading-art image from the card dashboard. Requires the same
     * editor sign-in as card art uploads when live publishing is configured.
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
            String url = loadingArtStorageService.saveLoadingArt(pieceId, orientation, file);
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
     * Art can live in the packaged classpath (committed files) or in the
     * runtime upload directory (dashboard uploads before the next build);
     * both locations are served from /img/art/loading.
     */
    private Set<String> collectArtFilenames() {
        Set<String> filenames = new LinkedHashSet<>();
        try {
            Resource[] resources = new PathMatchingResourcePatternResolver()
                    .getResources("classpath*:/static/img/art/loading/*.*");
            for (Resource resource : resources) {
                String filename = resource.getFilename();
                if (filename != null) {
                    filenames.add(filename);
                }
            }
        } catch (Exception ex) {
            // An unreadable classpath folder just means fewer entries.
        }
        Path uploadDir = loadingArtStorageService.getArtDirectory();
        if (Files.isDirectory(uploadDir)) {
            try (Stream<Path> files = Files.list(uploadDir)) {
                files.filter(Files::isRegularFile)
                        .map(path -> path.getFileName().toString())
                        .forEach(filenames::add);
            } catch (Exception ex) {
                // Ignore and serve what the classpath provided.
            }
        }
        return filenames;
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
}
