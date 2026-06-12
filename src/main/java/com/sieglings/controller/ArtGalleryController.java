package com.sieglings.controller;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

@RestController
public class ArtGalleryController {

    private static final Set<String> IMAGE_EXTENSIONS = Set.of("png", "jpg", "jpeg", "webp", "gif");

    /**
     * Lists the loading-screen art shipped in {@code static/img/art/loading}.
     * Files pair up by name — {@code <piece>-landscape.<ext>} and
     * {@code <piece>-portrait.<ext>} become one gallery entry — so adding art
     * is just dropping files into the folder; there is no manifest to maintain.
     */
    @GetMapping("/api/art/loading")
    public Map<String, Object> listLoadingArt() {
        Map<String, Map<String, Object>> pieces = new TreeMap<>();
        try {
            Resource[] resources = new PathMatchingResourcePatternResolver()
                    .getResources("classpath*:/static/img/art/loading/*.*");
            for (Resource resource : resources) {
                String filename = resource.getFilename();
                if (filename == null) {
                    continue;
                }
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
        } catch (Exception ex) {
            // An unreadable or missing folder just means an empty gallery.
        }
        return Map.of("art", new ArrayList<>(pieces.values()));
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
}
