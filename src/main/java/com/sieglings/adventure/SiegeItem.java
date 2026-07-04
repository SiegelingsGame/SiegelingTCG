package com.sieglings.adventure;

/**
 * A carryable Siege item. Each Siegeling can hold one; it grants a passive
 * combat bonus. VITALITY raises the holder's max HP for the whole run (applied
 * on equip); the others apply at the start of each battle.
 *
 * @param id     stable id
 * @param name   display name
 * @param icon   emoji/glyph for the UI
 * @param kind   VITALITY | ATTACK | SPEED | SHIELD
 * @param value  magnitude of the bonus
 * @param desc   short human-readable text
 */
record SiegeItem(String id, String name, String icon, String kind, int value, String desc) {

    String effectText() {
        return switch (kind) {
            case "VITALITY" -> "+" + value + " max HP (while equipped)";
            case "ATTACK" -> "+" + value + " attack each battle";
            case "SPEED" -> "+" + value + " speed each battle";
            case "SHIELD" -> "+" + value + " shield at battle start";
            default -> desc == null ? "" : desc;
        };
    }
}
