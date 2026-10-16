package com.sieglings.model.enums;

/**
 * The finish ladder a card climbs, lowest first. Each tier contains the look of
 * the ones below it, so a card only ever moves up.
 *
 * <ul>
 *   <li>HOLO - a plain holographic sheen over the standard art.</li>
 *   <li>SP - the card's dedicated holo art (only cards that have holo art).</li>
 *   <li>HSP - holo art plus the full rainbow foil.</li>
 *   <li>GOLD - holo art in a polished gold frame.</li>
 *   <li>GSP - the whole card cast in gold, notches left in colour.</li>
 * </ul>
 */
public enum CardFinish {
    STANDARD(0),
    HOLO(1),
    SP(2),
    HSP(4),
    GOLD(12),
    GSP(28);

    /** Craft-cost multiples paid to reach this tier from STANDARD; a step costs the difference. */
    private final int totalCraftMultiple;

    CardFinish(int totalCraftMultiple) {
        this.totalCraftMultiple = totalCraftMultiple;
    }

    public int totalCraftMultiple() {
        return totalCraftMultiple;
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
            case "GSP", "HOLO_GOLD", "HOLOGOLD" -> GSP;
            default -> HSP; // "HSP", "FLAIR" and anything unrecognised: the classic holo finish
        };
    }
}
