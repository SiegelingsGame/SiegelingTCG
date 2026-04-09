/**
 * Subset of {@code GET /api/game/options} used by loadout and deck builder.
 * Full JSON includes nested card catalogs; keep this file for stable field names only.
 */

export interface DeckOptionJson {
  id: string;
  name: string;
  description: string;
  elements: string[];
  recommendedTrainerId: string;
}

export interface TrainerOptionJson {
  id: string;
  name: string;
  /** Additional fields may be present from the server. */
  [key: string]: unknown;
}

export interface GameOptionsResponse {
  decks: DeckOptionJson[];
  trainers: TrainerOptionJson[];
  deckBuilder: {
    minDeckSize: number;
    maxCopies: number;
  };
  cardCatalog: unknown[];
  liveElements: string[];
  defaultDeckId: string | null;
  defaultTrainerId: string | null;
}
