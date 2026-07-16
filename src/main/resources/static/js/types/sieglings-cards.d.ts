/**
 * Shared shapes for the Sieglings card editor and game client (Java serves matching JSON).
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
    /** Complete-card artwork used only when the card's holographic finish is active in binder views. */
    holographicCardArtUrl?: string;
    /** Independent crop scale for holographic full-card artwork (0.25–3). */
    holographicCardArtScale?: number;
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
