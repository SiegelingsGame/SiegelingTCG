/**
 * SiegelingsTCG mobile contracts: API routes, game phases, and persistence layout
 * aligned with the Spring Boot server under ../src/main/java/com/sieglings.
 *
 * Add a native shell (React Native, Expo, Flutter, Swift, Kotlin) in this directory
 * and import these modules for a single source of truth with the backend.
 */

export { ApiRoutes } from "./apiRoutes.js";
export { DEFAULT_LOCAL_API_BASE, DEFAULT_PRODUCTION_API_BASE, KNOWN_HOSTED_ORIGINS } from "./config.js";
export { BOARD_DIMENSIONS, ClientScreenFlow, PHASE_ORDER } from "./gameFlow.js";
export type { ClientScreen } from "./gameFlow.js";
export type { Phase } from "./phase.js";
export { FirestoreAppConfig, H2_FILE_DATASOURCE_PATTERN, H2Tables } from "./persistence.js";

export type {
  AccountUserJson,
  AuthErrorResponse,
  AuthResponse,
  AuthSuccessResponse,
  DeleteDeckRequest,
  LoginRequest,
  MatchHistoryJson,
  RegisterRequest,
  SaveDeckRequest,
  SavedDeckJson,
} from "./types/auth.js";

export type { DeckOptionJson, GameOptionsResponse, TrainerOptionJson } from "./types/gameOptions.js";
export { GameHeaders, bearerHeader } from "./types/headers.js";
