/**
 * Shared shapes for the Siegelings card editor and game client (Java serves matching JSON).
 * The runtime code is plain JavaScript; this file is for IDE / TypeScript tooling only.
 */

export type MoveCategory = "STANDARD" | "SPECIALITY" | "UTILITY";

export interface Move {
    id: string;
    name: string;
    element: string;
    category: MoveCategory;
    targetType: string;
    targetElement?: string | null;
    targetRow?: string | null;
    targetCount?: number;
    effectType: string;
    effectValue: number;
    energyCost: number;
    description: string;
    isPassive: boolean;
    requiredElement?: string | null;
    requiredReaction?: string | null;
}

export interface SieglingCardModel {
    cardType: "SIEGLING";
    id: string;
    name: string;
    element: string;
    rarity: string;
    health: number;
    speed: number;
    preferredRow: string;
    evolvesFromId: string;
    costElement: string;
    costAmount: number;
    notches: Array<{ direction: string; element: string }>;
    /** Max 5 entries; each id must exist in the dashboard `moves` pool. */
    moveIds: string[];
    /** Custom art URL or data URI for the cards menu binder. */
    cardArtUrl?: string;
    /** Artwork shown instead of the standard art once the card's holographic finish is active. */
    holographicCardArtUrl?: string;
    /** How the holographic art sits in the template (same values as cardArtMode); blank with a holo URL means FULL_CARD. */
    holographicCardArtMode?: "REPLACE" | "OVERLAY" | "FULL_CARD" | "";
    /** Holographic REPLACE/OVERLAY art placement, independent of the standard art. */
    holographicCardArtOffsetXPct?: number;
    holographicCardArtOffsetYPct?: number;
    /** Scale (0.25–3) of holographic REPLACE/OVERLAY art; never applied to full-card faces. */
    holographicCardArtScale?: number;
    holographicCardArtRotation?: number;
    /** REPLACE swaps the element icon; OVERLAY draws art above the default frame; FULL_CARD skips templating and renders the image as the whole card. */
    cardArtMode?: "REPLACE" | "OVERLAY" | "FULL_CARD" | "";
    /** Offset in pixels within the binder art frame. */
    cardArtOffsetX?: number;
    cardArtOffsetY?: number;
    /** Scale multiplier for custom art (0.25–3). */
    cardArtScale?: number;
    /** Rotation in degrees (-180 to 180). */
    cardArtRotation?: number;
    /** Rainbow foil shimmer for binder, loadout, and preview surfaces. */
    holographic?: boolean;
}
