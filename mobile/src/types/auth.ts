/** Shared JSON shapes returned by {@code AuthController}. */

export interface AccountUserJson {
  id: number;
  email: string;
  displayName: string;
}

export interface SavedDeckJson {
  id: string;
  name: string;
  deckId: string | null;
  trainerId: string;
  customDeckCards: string[];
  custom: boolean;
  updatedAt: string | null;
  deckName?: string;
  trainerName: string;
}

export interface MatchHistoryJson {
  id: string;
  finishedAt: string | null;
  result: string;
  matchType: string;
  opponentName: string;
  loadoutLabel: string;
  trainerName: string;
  turnNumber: number | null;
}

export interface AuthSuccessResponse {
  authenticated: true;
  token?: string;
  user: AccountUserJson;
  savedDecks: SavedDeckJson[];
  matchHistory: MatchHistoryJson[];
}

export interface AuthErrorResponse {
  authenticated: false;
  error?: string;
}

export type AuthResponse = AuthSuccessResponse | AuthErrorResponse;

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SaveDeckRequest {
  /** Optional existing deck id for updates. */
  id?: string | null;
  name: string;
  /** Preset deck id or null when fully custom. */
  deckId?: string | null;
  trainerId: string;
  customDeckCards: string[];
}

export interface DeleteDeckRequest {
  id: string;
}
