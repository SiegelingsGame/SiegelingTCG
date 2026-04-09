import type { Phase } from "./phase.js";

/**
 * Turn order in {@code com.sieglings.model.enums.Phase}.
 * After the opening mulligan phase, the loop is DRAW → SETUP → BATTLE → END → DRAW …
 */
export const PHASE_ORDER: readonly Phase[] = [
  "MULLIGAN",
  "DRAW",
  "SETUP",
  "BATTLE",
  "END",
];

/**
 * High-level client flow (mirrors web: welcome → loadout → multiplayer room or AI → mulligan → match loop).
 */
export const ClientScreenFlow = {
  welcome: "welcome",
  loadout: "loadout",
  roomLobby: "roomLobby",
  mulligan: "mulligan",
  match: "match",
} as const;

export type ClientScreen = (typeof ClientScreenFlow)[keyof typeof ClientScreenFlow];

/**
 * Board layout: 3×3 per side, rows BACK/MIDDLE/FRONT (see {@code GameState} in Java).
 */
export const BOARD_DIMENSIONS = { rows: 3, cols: 3 } as const;
