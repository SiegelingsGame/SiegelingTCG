package com.sieglings.persistence.firestore;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.ServiceOptions;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.FirestoreOptions;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class FirestoreUserDataClient {

    private final boolean enabled;
    private final String projectId;
    private final String databaseId;
    private final String serviceAccountPath;
    private final String usersCollection;
    private final String sessionsCollection;
    private final String decksCollection;
    private final String matchesCollection;
    private final String progressionCollection;
    private final String profileSettingsCollection;
    private final String presenceCollection;
    private final String lobbiesCollection;
    private final String directMessagesCollection;

    private volatile Firestore firestore;
    private volatile String initializationError;

    public FirestoreUserDataClient(
            @Value("${app.user-data.firestore-enabled:true}") boolean enabled,
            @Value("${app.user-data.firestore-project-id:${app.card-editor.firestore-project-id:}}") String projectId,
            @Value("${app.user-data.firestore-database-id:${app.card-editor.firestore-database-id:(default)}}") String databaseId,
            @Value("${app.user-data.firestore-service-account-path:${app.card-editor.firestore-service-account-path:}}") String serviceAccountPath,
            @Value("${app.user-data.collection-users:accountUsers}") String usersCollection,
            @Value("${app.user-data.collection-sessions:authSessions}") String sessionsCollection,
            @Value("${app.user-data.collection-decks:savedDecks}") String decksCollection,
            @Value("${app.user-data.collection-matches:matchHistory}") String matchesCollection,
            @Value("${app.user-data.collection-progression:playerProgression}") String progressionCollection,
            @Value("${app.user-data.collection-profile-settings:profileSettings}") String profileSettingsCollection,
            @Value("${app.user-data.collection-presence:userPresence}") String presenceCollection,
            @Value("${app.user-data.collection-lobbies:openLobbies}") String lobbiesCollection,
            @Value("${app.user-data.collection-direct-messages:directMessages}") String directMessagesCollection
    ) {
        this.enabled = enabled;
        this.projectId = projectId == null ? "" : projectId.trim();
        this.databaseId = databaseId == null || databaseId.isBlank() ? "(default)" : databaseId.trim();
        this.serviceAccountPath = serviceAccountPath == null ? "" : serviceAccountPath.trim();
        this.usersCollection = usersCollection;
        this.sessionsCollection = sessionsCollection;
        this.decksCollection = decksCollection;
        this.matchesCollection = matchesCollection;
        this.progressionCollection = progressionCollection;
        this.profileSettingsCollection = profileSettingsCollection;
        this.presenceCollection = presenceCollection;
        this.lobbiesCollection = lobbiesCollection;
        this.directMessagesCollection = directMessagesCollection;
    }

    @PostConstruct
    void initialize() {
        ensureInitialized();
    }

    @PreDestroy
    void shutdown() {
        Firestore current = firestore;
        if (current != null) {
            try {
                current.close();
            } catch (Exception ignored) {
            }
        }
    }

    public boolean isAvailable() {
        ensureInitialized();
        return firestore != null;
    }

    public Firestore requireFirestore() {
        ensureInitialized();
        if (firestore == null) {
            throw new IllegalStateException(
                    "Firestore is not available for user data. " +
                    (initializationError == null ? "" : initializationError));
        }
        return firestore;
    }

    public String usersCollection() {
        return usersCollection;
    }

    public String sessionsCollection() {
        return sessionsCollection;
    }

    public String decksCollection() {
        return decksCollection;
    }

    public String matchesCollection() {
        return matchesCollection;
    }

    public String progressionCollection() {
        return progressionCollection;
    }

    public String profileSettingsCollection() {
        return profileSettingsCollection;
    }

    public String presenceCollection() {
        return presenceCollection;
    }

    public String lobbiesCollection() {
        return lobbiesCollection;
    }

    public String directMessagesCollection() {
        return directMessagesCollection;
    }

    private synchronized void ensureInitialized() {
        if (!enabled || firestore != null) {
            return;
        }
        try {
            firestore = buildClient();
            initializationError = null;
        } catch (Exception ex) {
            initializationError = ex.getMessage();
        }
    }

    private Firestore buildClient() throws IOException {
        GoogleCredentials credentials = null;
        String resolvedProjectId = firstNonBlank(
                projectId,
                System.getenv("GOOGLE_CLOUD_PROJECT"),
                System.getenv("GCLOUD_PROJECT"),
                ServiceOptions.getDefaultProjectId()
        );

        Path serviceAccountFile = resolveServiceAccountFile();
        if (serviceAccountFile != null && Files.isRegularFile(serviceAccountFile)) {
            try (InputStream stream = Files.newInputStream(serviceAccountFile)) {
                credentials = GoogleCredentials.fromStream(stream);
            }
            if (resolvedProjectId == null) {
                resolvedProjectId = readProjectIdFromServiceAccount(serviceAccountFile);
            }
        }

        if (credentials == null) {
            credentials = GoogleCredentials.getApplicationDefault();
        }
        if (resolvedProjectId == null || resolvedProjectId.isBlank()) {
            throw new IllegalStateException("No Firebase or Google Cloud project id was available for Firestore.");
        }

        return FirestoreOptions.newBuilder()
                .setCredentials(credentials)
                .setProjectId(resolvedProjectId)
                .setDatabaseId(databaseId)
                .build()
                .getService();
    }

    private Path resolveServiceAccountFile() {
        if (serviceAccountPath == null || serviceAccountPath.isBlank()) {
            return null;
        }
        Path candidate = Path.of(serviceAccountPath);
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
        ObjectMapper mapper = new ObjectMapper();
        JsonNode node = mapper.readTree(file.toFile());
        JsonNode projectIdNode = node.get("project_id");
        return projectIdNode == null || projectIdNode.isNull() ? null : projectIdNode.asText();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }
}
