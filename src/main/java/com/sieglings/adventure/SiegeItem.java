package com.sieglings.adventure;

/**
 * A carryable Siege item. Each Siegeling can hold one; it grants a passive
 * combat bonus. VITALITY raises the holder's max HP for the whole run (applied
 * on equip); the others apply at the start of each battle.
 *
 * @param id     stable id
 * @param name   display name
 * @param icon   emoji/glyph for the UI
 * @param kind   VITALITY | ATTACK | SPEED | SHIELD | EVOLUTION | EVOLUTION2 | REVIVE | HEAL
 * @param value  magnitude of the bonus (percent for REVIVE/HEAL)
 * @param desc   short human-readable text
 */
record SiegeItem(String id, String name, String icon, String kind, int value, String desc) {

    boolean consumable() {
        return "REVIVE".equals(kind) || "HEAL".equals(kind);
    }

    boolean evolutionSigil() {
        return "EVOLUTION".equals(kind) || "EVOLUTION2".equals(kind);
    }

    String effectText() {
        return switch (kind) {
            case "VITALITY" -> "+" + value + " max HP (while equipped)";
            case "ATTACK" -> "+" + value + " attack each battle";
            case "SPEED" -> "+" + value + " speed each battle";
            case "SHIELD" -> "+" + value + " shield at battle start";
            case "EVOLUTION" -> "Evolves to the next stage at battle start";
            case "EVOLUTION2" -> "Begins battle at stage 3 (3-stage evolutions only)";
            case "REVIVE" -> "Revive a fallen Siegeling at " + value + "% HP";
            case "HEAL" -> "Restore " + value + "% HP to one ally";
            default -> desc == null ? "" : desc;
        };
    }
}
