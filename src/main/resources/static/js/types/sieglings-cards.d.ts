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
}
