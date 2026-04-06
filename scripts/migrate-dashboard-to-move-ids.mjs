#!/usr/bin/env node
/**
 * Migrates sieglings-dashboard-export.json (or card override JSON) from inline Siegling
 * `abilities` arrays to shared `moves` + per-card `moveIds`.
 *
 * Usage:
 *   node scripts/migrate-dashboard-to-move-ids.mjs path/to/export.json [output.json]
 *
 * - Collects unique abilities into moves with stable ids: migrated:{cardId}:{index}
 * - Replaces each SIEGLING card's abilities with moveIds[]
 * - Writes { cards, moves, decks?, trainers?, liveElements? } preserving other top-level keys
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const input = process.argv[2];
const output = process.argv[3] || input.replace(/\.json$/i, "") + "-move-ids.json";

if (!input) {
    console.error("Usage: node scripts/migrate-dashboard-to-move-ids.mjs <input.json> [output.json]");
    process.exit(1);
}

const root = JSON.parse(readFileSync(input, "utf8"));
const cards = Array.isArray(root.cards) ? root.cards : [];
const movesByKey = new Map();
const allMoves = [];

function keyForAbility(a) {
    return JSON.stringify({
        n: a.name,
        d: a.description,
        t: a.targetType,
        tr: a.targetRow ?? null,
        tc: a.targetCount ?? 0,
        e: a.effectType,
        v: a.effectValue ?? 0,
        p: !!a.passive,
        re: a.requiredElement ?? null,
        rn: a.requiredEnergy ?? 0,
        rr: a.requiredReaction ?? null
    });
}

function abilityToMove(id, cardElement, a) {
    const passive = !!a.passive || a.targetType === "PASSIVE";
    return {
        id,
        name: String(a.name || id),
        element: a.requiredElement || cardElement || "NEUTRAL",
        category: "STANDARD",
        targetType: a.targetType || "SINGLE_ENEMY",
        targetRow: a.targetRow ?? null,
        targetCount: Number(a.targetCount) || 0,
        effectType: String(a.effectType || "damage").toLowerCase(),
        effectValue: Number(a.effectValue) || 0,
        energyCost: passive ? 0 : Math.min(6, Math.max(0, Number(a.requiredEnergy) || 0)),
        description: String(a.description || ""),
        isPassive: passive,
        requiredElement: a.requiredElement || null,
        requiredReaction: a.requiredReaction || null
    };
}

for (const card of cards) {
    if (!card || String(card.type || "").toUpperCase() !== "SIEGLING") continue;
    const abs = Array.isArray(card.abilities) ? card.abilities : [];
    if (abs.length === 0) {
        card.moveIds = Array.isArray(card.moveIds) ? card.moveIds : [];
        delete card.abilities;
        delete card.ability;
        continue;
    }
    const ids = [];
    abs.forEach((a, i) => {
        const k = keyForAbility(a);
        let id = movesByKey.get(k);
        if (!id) {
            id = `migrated:${String(card.id || "card").toLowerCase()}:${i}`;
            let unique = id;
            let n = 0;
            while (allMoves.some((m) => m.id === unique)) {
                n += 1;
                unique = `${id}_${n}`;
            }
            id = unique;
            movesByKey.set(k, id);
            allMoves.push(abilityToMove(id, card.element, a));
        }
        ids.push(id);
    });
    card.moveIds = ids.slice(0, 5);
    delete card.abilities;
    delete card.ability;
}

const next = { ...root };
next.cards = cards;
next.moves = [...(Array.isArray(root.moves) ? root.moves : []), ...allMoves];

writeFileSync(output, JSON.stringify(next, null, 2), "utf8");
console.log(`Wrote ${output} (${allMoves.length} new moves from migrated abilities).`);
