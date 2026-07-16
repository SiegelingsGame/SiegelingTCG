package com.sieglings.service;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;

@Service
public class CardArtStorageService {

    private static final Path CARD_ART_DIR = Path.of("src", "main", "resources", "static", "assets", "cards");
    private static final long MAX_BYTES = 4L * 1024L * 1024L;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("png", "jpg", "jpeg", "webp", "gif", "svg");

    public String saveCardArt(String cardId, MultipartFile file) throws IOException {
        return saveCardArt(cardId, file, null);
    }

    public String saveCardArt(String cardId, MultipartFile file, String artVariant) throws IOException {
        String normalizedCardId = normalizeCardId(cardId);
        if (normalizedCardId == null) {
            throw new IllegalArgumentException("Card art upload requires a valid card id.");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Choose an image file to upload.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new IllegalArgumentException("Card art must be 4 MB or smaller.");
        }

        String extension = resolveExtension(file);
        Path absoluteDir = CARD_ART_DIR.toAbsolutePath().normalize();
        Files.createDirectories(absoluteDir);
        String fileName = buildFileName(normalizedCardId, extension, artVariant);
        Path target = absoluteDir.resolve(fileName).normalize();
        if (!target.startsWith(absoluteDir)) {
            throw new IllegalArgumentException("Invalid card art destination.");
        }

        file.transferTo(target);
        return "/assets/cards/" + fileName;
    }

    static String buildFileName(String normalizedCardId, String extension, String artVariant) {
        String suffix = isHolographicVariant(artVariant) ? "-holographic" : "";
        return normalizedCardId + suffix + "." + extension;
    }

    private static boolean isHolographicVariant(String artVariant) {
        return "HOLOGRAPHIC".equalsIgnoreCase(String.valueOf(artVariant).trim());
    }

    private static String normalizeCardId(String cardId) {
        if (cardId == null) {
            return null;
        }
        String normalized = cardId.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]+", "");
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
            return switch (contentType.toLowerCase(Locale.ROOT)) {
                case "image/png" -> "png";
                case "image/jpeg" -> "jpg";
                case "image/webp" -> "webp";
                case "image/gif" -> "gif";
                case "image/svg+xml" -> "svg";
                default -> throw new IllegalArgumentException("Unsupported image type. Use PNG, JPEG, WebP, GIF, or SVG.");
            };
        }

        throw new IllegalArgumentException("Unsupported image type. Use PNG, JPEG, WebP, GIF, or SVG.");
    }
}
