/**
 * Persistence layout for SiegelingsTCG. The mobile app talks to the Spring API; it does not
 * open H2 or Firestore directly. This documents what the server uses so native features
 * (offline cache, support tooling) stay consistent.
 */

/** H2 file datasource: {@code spring.datasource.url} in application.properties. */
export const H2_FILE_DATASOURCE_PATTERN = "jdbc:h2:file:./data/sieglings";

/**
 * JPA entities under {@code com.sieglings.persistence.entity} (table names in parentheses).
 */
export const H2Tables = {
  accountUsers: "account_users",
  authSessions: "auth_sessions",
  savedDecks: "saved_decks",
  matchHistory: "match_history",
} as const;

/**
 * Firestore (Google Cloud) used for live card/deck/trainer config and editor admin sessions.
 * Defaults from {@code application.properties}:
 * - {@code app.card-editor.firestore-project-id}
 * - {@code app.card-editor.firestore-database-id}
 * - {@code app.card-editor.firestore-collection}
 * - document ids: cardOverrides, liveElements, trainerCards, presetDecks
 */
export const FirestoreAppConfig = {
  projectId: "siegelingstcgtesting",
  databaseId: "siegedb",
  collection: "appConfig",
  documents: {
    cardOverrides: "cardOverrides",
    liveElements: "liveElements",
    trainerCards: "trainerCards",
    presetDecks: "presetDecks",
  },
} as const;
