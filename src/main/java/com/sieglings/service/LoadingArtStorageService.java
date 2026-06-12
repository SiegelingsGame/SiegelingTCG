package com.sieglings.service;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Stores loading-screen art uploaded from the card dashboard. Mirrors
 * {@link CardArtStorageService}: files land in the project static folder and
 * are served via the {@code /img/art/loading/**} resource handler, so uploads
 * are visible immediately and survive into the next build.
 */
@Service
public class LoadingArtStorageService {

    private static final Path ART_DIR = Path.of("src", "main", "resources", "static", "img", "art", "loading");
    private static final long MAX_BYTES = 8L * 1024L * 1024L;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("png", "jpg", "jpeg", "webp", "gif");
    private static final Set<String> ORIENTATIONS = Set.of("landscape", "portrait");

    public Path getArtDirectory() {
        return ART_DIR.toAbsolutePath().normalize();
    }

    public String saveLoadingArt(String pieceId, String orientation, MultipartFile file) throws IOException {
        String normalizedId = normalizePieceId(pieceId);
        if (normalizedId == null) {
            throw new IllegalArgumentException("Give the art piece a name (letters, numbers, dashes).");
        }
        String normalizedOrientation = orientation == null ? "" : orientation.trim().toLowerCase(Locale.ROOT);
        if (!ORIENTATIONS.contains(normalizedOrientation)) {
            throw new IllegalArgumentException("Orientation must be landscape or portrait.");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Choose an image file to upload.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new IllegalArgumentException("Loading art must be 8 MB or smaller.");
        }

        String extension = resolveExtension(file);
        Path absoluteDir = getArtDirectory();
        Files.createDirectories(absoluteDir);
        String baseName = normalizedId + "-" + normalizedOrientation;
        Path target = absoluteDir.resolve(baseName + "." + extension).normalize();
        if (!target.startsWith(absoluteDir)) {
            throw new IllegalArgumentException("Invalid art destination.");
        }
        // Replace any other-extension variant of the same piece/orientation so
        // re-uploads don't leave a stale duplicate behind.
        try (Stream<Path> existing = Files.list(absoluteDir)) {
            existing.filter(Files::isRegularFile)
                    .filter(path -> {
                        String name = path.getFileName().toString();
                        int dot = name.lastIndexOf('.');
                        return dot > 0 && name.substring(0, dot).equalsIgnoreCase(baseName);
                    })
                    .forEach(path -> path.toFile().delete());
        }

        file.transferTo(target);
        return "/img/art/loading/" + baseName + "." + extension;
    }

    private static String normalizePieceId(String pieceId) {
        if (pieceId == null) {
            return null;
        }
        String normalized = pieceId.trim().toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", "-")
                .replaceAll("[^a-z0-9_-]+", "");
        // Guard the orientation suffixes so ids can't collide with pairing.
        normalized = normalized.replaceAll("-(landscape|portrait)$", "");
        return normalized.isBlank() ? null : normalized;
    }

    private static String resolveExtension(MultipartFile file) {
        String originalName = file.getOriginalFilename();
        if (originalName != null) {
            int dotIndex = originalName.lastIndexOf('.');
            if (dotIndex >= 0 && dotIndex < originalName.length() - 1) {
                String extension = originalName.substring(dotIndex + 1).trim().toLowerCase(Locale.ROOT);
                if (ALLOWED_EXTENSIONS.contains(extension)) {
                    return "jpeg".equals(extension) ? "jpg" : extension;
                }
            }
        }
        String contentType = file.getContentType();
        if (contentType != null) {
            switch (contentType.toLowerCase(Locale.ROOT)) {
                case "image/png": return "png";
                case "image/jpeg": return "jpg";
                case "image/webp": return "webp";
                case "image/gif": return "gif";
                default: break;
            }
        }
        throw new IllegalArgumentException("Loading art must be a png, jpg, webp, or gif image.");
    }
}
