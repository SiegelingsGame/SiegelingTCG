package com.sieglings.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.api.gax.paging.Page;
import com.google.cloud.ServiceOptions;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Stores dashboard card art in Firebase Storage on hosted runtimes. Cloud Run's
 * writable filesystem is ephemeral and is not Firebase Hosting's static root,
 * so a relative /assets/cards URL created there can never load in the hosted
 * dashboard. Local development without cloud credentials keeps the convenient
 * project-static-folder fallback.
 */
@Service
public class CardArtStorageService {

    private static final Path CARD_ART_DIR = Path.of("src", "main", "resources", "static", "assets", "cards");
    private static final String STORAGE_PREFIX = "assets/cards/";
    private static final String DEFAULT_BUCKET = "siegelingstcgtesting.firebasestorage.app";
    private static final long MAX_BYTES = 4L * 1024L * 1024L;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("png", "jpg", "jpeg", "webp", "gif", "svg");

    private final ObjectMapper objectMapper;
    private final boolean cloudStorageEnabled;
    private final String storageBucket;
    private final String storageProjectId;
    private final String storageServiceAccountPath;
    private volatile StorageClientContext storageContext;
    private volatile boolean storageInitializationAttempted;
    private volatile String storageInitializationError;

    @Autowired
    public CardArtStorageService(
            ObjectMapper objectMapper,
            @Value("${app.card-art.storage-enabled:true}") boolean cloudStorageEnabled,
            @Value("${app.card-art.storage-bucket:}") String storageBucket,
            @Value("${app.card-art.storage-project-id:${app.card-editor.firestore-project-id:}}") String storageProjectId,
            @Value("${app.card-art.storage-service-account-path:${app.card-editor.firestore-service-account-path:}}") String storageServiceAccountPath
    ) {
        this.objectMapper = objectMapper;
        this.cloudStorageEnabled = cloudStorageEnabled;
        this.storageBucket = firstNonBlank(storageBucket, System.getenv("STORAGE_BUCKET"), DEFAULT_BUCKET);
        this.storageProjectId = storageProjectId == null ? "" : storageProjectId.trim();
        this.storageServiceAccountPath = storageServiceAccountPath == null ? "" : storageServiceAccountPath.trim();
    }

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
        String fileName = buildFileName(normalizedCardId, extension, artVariant);
        StorageClientContext context = ensureCloudStorageInitialized();
        if (context != null) {
            return saveCloudStorageArt(context, fileName, extension, file);
        }
        if (isHostedRuntime()) {
            String detail = storageInitializationError == null || storageInitializationError.isBlank()
                    ? "unknown storage initialization error"
                    : storageInitializationError;
            throw new IllegalStateException("Persistent card art storage is unavailable: " + detail);
        }
        return saveLocalArt(fileName, file);
    }

    private String saveCloudStorageArt(
            StorageClientContext context,
            String fileName,
            String extension,
            MultipartFile file
    ) throws IOException {
        String objectPath = buildStorageObjectPath(fileName);
        String downloadToken = UUID.randomUUID().toString();
        BlobInfo blobInfo = BlobInfo.newBuilder(BlobId.of(context.bucketName(), objectPath))
                .setContentType(contentTypeForExtension(extension))
                .setCacheControl("public,max-age=31536000,immutable")
                .setMetadata(Map.of("firebaseStorageDownloadTokens", downloadToken))
                .build();
        context.storage().create(blobInfo, file.getBytes());
        deleteOtherCloudVariants(context, baseName(fileName), objectPath);
        return LoadingArtStorageService.buildStoragePublicUrl(context.bucketName(), objectPath, downloadToken);
    }

    private void deleteOtherCloudVariants(StorageClientContext context, String baseName, String keptObjectPath) {
        try {
            Page<Blob> blobs = context.storage().list(
                    context.bucketName(),
                    Storage.BlobListOption.prefix(STORAGE_PREFIX + baseName + ".")
            );
            for (Blob blob : blobs.iterateAll()) {
                if (blob != null && !keptObjectPath.equals(blob.getName())) {
                    context.storage().delete(blob.getBlobId());
                }
            }
        } catch (Exception ex) {
            // A stale alternate extension is less harmful than failing a saved upload.
        }
    }

    private String saveLocalArt(String fileName, MultipartFile file) throws IOException {
        Path absoluteDir = CARD_ART_DIR.toAbsolutePath().normalize();
        Files.createDirectories(absoluteDir);
        Path target = absoluteDir.resolve(fileName).normalize();
        if (!target.startsWith(absoluteDir)) {
            throw new IllegalArgumentException("Invalid card art destination.");
        }
        String keptBaseName = baseName(fileName);
        try (Stream<Path> existing = Files.list(absoluteDir)) {
            existing.filter(Files::isRegularFile)
                    .filter(path -> baseName(path.getFileName().toString()).equalsIgnoreCase(keptBaseName))
                    .filter(path -> !path.equals(target))
                    .forEach(path -> path.toFile().delete());
        }
        file.transferTo(target);
        return "/assets/cards/" + fileName;
    }

    private StorageClientContext ensureCloudStorageInitialized() {
        if (!cloudStorageEnabled) {
            return null;
        }
        if (storageContext != null || storageInitializationAttempted) {
            return storageContext;
        }
        synchronized (this) {
            if (storageContext != null || storageInitializationAttempted) {
                return storageContext;
            }
            storageInitializationAttempted = true;
            try {
                storageContext = createCloudStorageContext();
                storageInitializationError = null;
            } catch (Exception ex) {
                storageInitializationError = ex.getMessage();
                storageContext = null;
            }
            return storageContext;
        }
    }

    private StorageClientContext createCloudStorageContext() throws IOException {
        GoogleCredentials credentials = null;
        String projectId = firstNonBlank(
                storageProjectId,
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
        StorageOptions.Builder builder = StorageOptions.newBuilder().setCredentials(credentials);
        if (projectId != null && !projectId.isBlank()) {
            builder.setProjectId(projectId);
        }
        return new StorageClientContext(builder.build().getService(), storageBucket);
    }

    private Path resolveServiceAccountFile() {
        if (storageServiceAccountPath.isBlank()) {
            return null;
        }
        Path candidate = Path.of(storageServiceAccountPath);
        if (candidate.isAbsolute()) {
            return candidate.normalize();
        }
        Path workingDirectory = Path.of("").toAbsolutePath().normalize();
        Path localCandidate = workingDirectory.resolve(candidate).normalize();
        if (Files.isRegularFile(localCandidate)) {
            return localCandidate;
        }
        Path parent = workingDirectory.getParent();
        return parent == null ? localCandidate : parent.resolve(candidate).normalize();
    }

    private String readProjectIdFromServiceAccount(Path file) throws IOException {
        JsonNode node = objectMapper.readTree(file.toFile());
        JsonNode projectIdNode = node.get("project_id");
        return projectIdNode == null || projectIdNode.isNull() ? null : projectIdNode.asText();
    }

    static String buildFileName(String normalizedCardId, String extension, String artVariant) {
        String suffix = isHolographicVariant(artVariant) ? "-holographic" : "";
        return normalizedCardId + suffix + "." + extension;
    }

    static String buildStorageObjectPath(String fileName) {
        return STORAGE_PREFIX + fileName;
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

    private static String baseName(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }

    static String contentTypeForExtension(String extension) {
        return switch (extension) {
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "webp" -> "image/webp";
            case "gif" -> "image/gif";
            case "svg" -> "image/svg+xml";
            default -> "application/octet-stream";
        };
    }

    private static boolean isHostedRuntime() {
        String service = System.getenv("K_SERVICE");
        return service != null && !service.isBlank();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private record StorageClientContext(Storage storage, String bucketName) {}
}
