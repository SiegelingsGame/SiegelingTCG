package com.sieglings.model.enums;

/**
 * The finish ladder a card climbs, lowest first; a card only ever moves up.
 * The four gold tiers pair a look (a gold card, or the whole card cast in gold)
 * with an art (standard, or the SP art). GSP and GSPx show the standard art on
 * a card that has no SP art yet.
 *
 * <ul>
 *   <li>HOLO - a plain holographic sheen over the standard art.</li>
 *   <li>SP - the card's dedicated holo art (only cards that have holo art).</li>
 *   <li>HSP - holo art plus the full rainbow foil.</li>
 *   <li>GOLD - the standard art on a gold card.</li>
 *   <li>CARAT - the standard art, the whole card cast in gold.</li>
 *   <li>GSP - the SP art on a gold card.</li>
 *   <li>GSPX ("GSPx") - the SP art, the whole card cast in gold, notches left in colour.</li>
 * </ul>
 */
public enum CardFinish {
    STANDARD(0),
    HOLO(1),
    SP(2),
    HSP(4),
    GOLD(6),
    CARAT(9),
    GSP(12),
    GSPX(28);

    /** Craft-cost multiples paid to reach this tier from STANDARD; a step costs the difference. */
    private final int totalCraftMultiple;

    CardFinish(int totalCraftMultiple) {
        this.totalCraftMultiple = totalCraftMultiple;
    }

    public int totalCraftMultiple() {
        return totalCraftMultiple;
    }

    /** The tier's display name: the enum name, except GSPX reads "GSPx". */
    public String label() {
        return this == GSPX ? "GSPx" : name();
    }

    public boolean isAbove(CardFinish other) {
        return other == null || ordinal() > other.ordinal();
    }

    /** API names: the tier names themselves, plus the ones earlier clients sent. */
    public static CardFinish parseTier(String raw) {
        if (raw == null || raw.isBlank()) {
            return HSP;
        }
        return switch (raw.trim().toUpperCase(java.util.Locale.ROOT)) {
            case "HOLO", "PLAIN" -> HOLO;
            case "SP", "ART" -> SP;
            case "GOLD" -> GOLD;
            case "CARAT" -> CARAT;
            case "GSP" -> GSP;
            case "GSPX", "HOLO_GOLD", "HOLOGOLD" -> GSPX;
            default -> HSP; // "HSP", "FLAIR" and anything unrecognised: the classic holo finish
        };
    }
}
