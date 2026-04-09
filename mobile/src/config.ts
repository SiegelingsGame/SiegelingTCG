/**
 * Default API base for the hosted app (same origin as Firebase Hosting static UI).
 * Override per build flavor (dev/staging/prod).
 */
export const DEFAULT_PRODUCTION_API_BASE = "https://siegelingstcgtesting.web.app";

/**
 * Local Spring Boot default from {@code application.properties} {@code server.port}.
 */
export const DEFAULT_LOCAL_API_BASE = "http://127.0.0.1:8080";

/** CORS patterns accepted by the server include {@code app.cors.allowed-origin-patterns} in application.properties. */
export const KNOWN_HOSTED_ORIGINS = [
  "https://siegelingstcgtesting.web.app",
  "https://siegelingstcgtesting.firebaseapp.com",
] as const;
