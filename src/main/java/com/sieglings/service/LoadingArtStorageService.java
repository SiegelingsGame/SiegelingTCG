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
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Stores loading-screen art uploaded from the card dashboard. Hosted uploads
 * go to Firebase Storage so Firebase Hosting can serve the returned URLs even
 * though the API runs in Cloud Run. Local development without Google
 * credentials falls back to the project static folder.
 */
@Service
public class LoadingArtStorageService {

    private static final Path ART_DIR = Path.of("src", "main", "resources", "static", "img", "art", "loading");
    private static final String STORAGE_PREFIX = "img/art/loading/";
    private static final String DEFAULT_BUCKET = "siegelingstcgtesting.firebasestorage.app";
    private static final long MAX_BYTES = 8L * 1024L * 1024L;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("png", "jpg", "jpeg", "webp", "gif");
    private static final Set<String> ORIENTATIONS = Set.of("landscape", "portrait");

    private final ObjectMapper objectMapper;
    private final boolean cloudStorageEnabled;
    private final String storageBucket;
    private final String storageProjectId;
    private final String storageServiceAccountPath;
    private final boolean hostedRuntime;
    private volatile StorageClientContext storageContext;
    private volatile boolean storageInitializationAttempted;
    private volatile String storageInitializationError;

    @Autowired
    public LoadingArtStorageService(
            ObjectMapper objectMapper,
            @Value("${app.loading-art.storage-enabled:true}") boolean cloudStorageEnabled,
            @Value("${app.loading-art.storage-bucket:}") String storageBucket,
            @Value("${app.loading-art.storage-project-id:}") String storageProjectId,
            @Value("${app.loading-art.storage-service-account-path:}") String storageServiceAccountPath
    ) {
        this(objectMapper, cloudStorageEnabled, storageBucket, storageProjectId, storageServiceAccountPath, isHostedRuntime());
    }

    LoadingArtStorageService(
            ObjectMapper objectMapper,
            boolean cloudStorageEnabled,
            String storageBucket,
            String storageProjectId,
            String storageServiceAccountPath,
            boolean hostedRuntime
    ) {
        this.objectMapper = objectMapper;
        this.cloudStorageEnabled = cloudStorageEnabled;
        this.storageBucket = firstNonBlank(storageBucket, System.getenv("STORAGE_BUCKET"), DEFAULT_BUCKET);
        this.storageProjectId = storageProjectId == null ? "" : storageProjectId.trim();
        this.storageServiceAccountPath = storageServiceAccountPath == null ? "" : storageServiceAccountPath.trim();
        this.hostedRuntime = hostedRuntime;
    }

    public Path getArtDirectory() {
        return ART_DIR.toAbsolutePath().normalize();
    }

    public Map<String, String> listHostedArtUrls() {
        StorageClientContext context = ensureCloudStorageInitialized();
        if (context == null) {
            return Collections.emptyMap();
        }
        Map<String, String> urlsByFilename = new TreeMap<>();
        try {
            Page<Blob> blobs = context.storage().list(
                    context.bucketName(),
                    Storage.BlobListOption.prefix(STORAGE_PREFIX)
            );
            for (Blob blob : blobs.iterateAll()) {
                if (blob == null || blob.isDirectory()) {
                    continue;
                }
                String objectName = blob.getName();
                String filename = filenameFromObjectName(objectName);
                if (!isAllowedImageFilename(filename)) {
                    continue;
                }
                urlsByFilename.put(
                        filename,
                        buildStoragePublicUrl(context.bucketName(), objectName, firstDownloadToken(blob.getMetadata()))
                );
            }
        } catch (Exception ex) {
            return Collections.emptyMap();
        }
        return urlsByFilename;
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
        String baseName = normalizedId + "-" + normalizedOrientation;
        StorageClientContext context = ensureCloudStorageInitialized();
        if (context != null) {
            return saveCloudStorageArt(context, baseName, extension, file);
        }
        if (hostedRuntime) {
            throw new IOException(hostedStorageUnavailableMessage());
        }
        return saveLocalArt(baseName, extension, file);
    }

    private String saveCloudStorageArt(StorageClientContext context, String baseName, String extension, MultipartFile file) throws IOException {
        String objectPath = STORAGE_PREFIX + baseName + "." + extension;
        String downloadToken = UUID.randomUUID().toString();
        BlobInfo blobInfo = BlobInfo.newBuilder(BlobId.of(context.bucketName(), objectPath))
                .setContentType(contentTypeForExtension(extension))
                .setCacheControl("public,max-age=31536000,immutable")
                .setMetadata(Map.of("firebaseStorageDownloadTokens", downloadToken))
                .build();
        context.storage().create(blobInfo, file.getBytes());
        deleteOtherCloudVariants(context, baseName, objectPath);
        return buildStoragePublicUrl(context.bucketName(), objectPath, downloadToken);
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
            // A stale duplicate is less harmful than failing an already-saved upload.
        }
    }

    private String saveLocalArt(String baseName, String extension, MultipartFile file) throws IOException {
        Path absoluteDir = getArtDirectory();
        Files.createDirectories(absoluteDir);
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

    private StorageClientContext ensureCloudStorageInitialized() {
        if (!cloudStorageEnabled) {
            return null;
        }
        if (storageContext != null || (storageInitializationAttempted && !hostedRuntime)) {
            return storageContext;
        }
        synchronized (this) {
            if (storageContext != null || (storageInitializationAttempted && !hostedRuntime)) {
                return storageContext;
            }
            try {
                storageContext = createCloudStorageContext();
                storageInitializationAttempted = true;
                storageInitializationError = null;
            } catch (Exception ex) {
                storageInitializationError = ex.getMessage();
                storageContext = null;
                storageInitializationAttempted = !hostedRuntime;
            }
            return storageContext;
        }
    }

    private String hostedStorageUnavailableMessage() {
        if (!cloudStorageEnabled) {
            return "Cloud loading art storage is disabled in the hosted runtime.";
        }
        String detail = storageInitializationError == null || storageInitializationError.isBlank()
                ? ""
                : " " + storageInitializationError;
        return "Cloud loading art storage is unavailable; refusing to save to ephemeral local disk." + detail;
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
        if (storageServiceAccountPath == null || storageServiceAccountPath.isBlank()) {
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

    String getStorageInitializationError() {
        return storageInitializationError;
    }

    static String normalizePieceId(String pieceId) {
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

    static String resolveExtension(MultipartFile file) {
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

    private static String filenameFromObjectName(String objectName) {
        if (objectName == null || !objectName.startsWith(STORAGE_PREFIX)) {
            return "";
        }
        String filename = objectName.substring(STORAGE_PREFIX.length());
        return filename.contains("/") ? "" : filename;
    }

    private static boolean isAllowedImageFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return false;
        }
        int dot = filename.lastIndexOf('.');
        if (dot <= 0 || dot >= filename.length() - 1) {
            return false;
        }
        return ALLOWED_EXTENSIONS.contains(filename.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    static String contentTypeForExtension(String extension) {
        return switch (extension) {
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "webp" -> "image/webp";
            case "gif" -> "image/gif";
            default -> "application/octet-stream";
        };
    }

    static String firstDownloadToken(Map<String, String> metadata) {
        String tokens = metadata == null ? "" : metadata.get("firebaseStorageDownloadTokens");
        if (tokens == null) {
            return "";
        }
        return Arrays.stream(tokens.split(","))
                .map(String::trim)
                .filter(token -> !token.isBlank())
                .findFirst()
                .orElse("");
    }

    static String buildStoragePublicUrl(String bucketName, String objectPath, String downloadToken) {
        if (downloadToken != null && !downloadToken.isBlank()) {
            return "https://firebasestorage.googleapis.com/v0/b/"
                    + bucketName
                    + "/o/"
                    + encodeObjectName(objectPath)
                    + "?alt=media&token="
                    + urlEncode(downloadToken);
        }
        return "https://storage.googleapis.com/" + bucketName + "/" + encodePathSegments(objectPath);
    }

    private static String encodeObjectName(String value) {
        return urlEncode(value);
    }

    private static String encodePathSegments(String value) {
        return Arrays.stream(String.valueOf(value).split("/"))
                .map(LoadingArtStorageService::urlEncode)
                .collect(Collectors.joining("/"));
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(String.valueOf(value), StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private static boolean isHostedRuntime() {
        return firstNonBlank(
                System.getenv("K_SERVICE"),
                System.getenv("GAE_SERVICE"),
                System.getenv("FUNCTION_TARGET")
        ) != null;
    }

    private record StorageClientContext(Storage storage, String bucketName) {}
}
