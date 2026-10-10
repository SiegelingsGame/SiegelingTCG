package com.sieglings.keep;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The Keep's advanced economy: refined materials combined from raw ones, recycling that
 * turns a surplus into what is short, and the Silver market.
 *
 * <p>Three tiers of refined material sit deeper in the tech tree, each gated by a
 * building ({@link Tier#gate}): tier 1 at the Builder's Yard, tier 2 behind the vaulted
 * Storehouse, tier 3 behind Akhar's Front. Later rebirths ask for the deeper tiers, so
 * the requirement ladder in {@link KeepRebirth} pulls players through the whole tree.
 *
 * <p>Recycling always loses value (3 raw for 1, 15 timber for 1, a refined good back for
 * half its raw inputs), and the market is priced so Silver is a shortcut, never a
 * cheaper route than producing the goods.
 */
final class KeepEconomy {

    enum Tier {
        ONE("builders_yard", "Raise the Builder's Yard to refine tier 1 materials."),
        TWO("storehouse_2", "Vault the Storehouse (level 2) to refine tier 2 materials."),
        THREE("akhars_front", "Raise Akhar's Front to refine tier 3 materials.");

        final String gate;
        final String lockedHint;

        Tier(String gate, String lockedHint) {
            this.gate = gate;
            this.lockedHint = lockedHint;
        }
    }

    /** A refined material and its recipe. Inputs may be raw ids, refined ids or "timber". */
    record Refined(String id, String name, Tier tier, String description, Map<String, Integer> inputs) { }

    record MarketLot(String id, String resourceId, int amount, int silverCost) { }

    record SilverBundle(String id, String name, int silver, int coinCost) { }

    static final Map<String, Refined> REFINED = createRefined();

    /** Raw-for-raw recycling rate: this many of one raw material make one of another. */
    static final int RAW_RECYCLE_RATE = 3;
    /** Timber needed for one raw material. */
    static final int TIMBER_RECYCLE_RATE = 15;
    /** Silver paid for every repaired Keep event. */
    static final int SILVER_PER_EVENT_REPAIR = 6;

    static final List<SilverBundle> SILVER_BUNDLES = List.of(
            new SilverBundle("silver_pouch", "Silver Pouch", 20, 100),
            new SilverBundle("silver_purse", "Silver Purse", 60, 270),
            new SilverBundle("silver_chest", "Silver Chest", 150, 600));

    /** What the market sells. Tier 3 is never sold: it has to be made. */
    static final List<MarketLot> MARKET = List.of(
            new MarketLot("timber_lot", "timber", 50, 6),
            new MarketLot("verdant_fiber_lot", "verdant_fiber", 10, 18),
            new MarketLot("ember_ingot_lot", "ember_ingot", 10, 22),
            new MarketLot("frost_crystal_lot", "frost_crystal", 10, 24),
            new MarketLot("storm_cell_lot", "storm_cell", 10, 22),
            new MarketLot("stone_lot", "stone", 10, 18),
            new MarketLot("provisions_lot", "provisions", 10, 16),
            new MarketLot("living_mortar_lot", "living_mortar", 1, 16),
            new MarketLot("tempered_glass_lot", "tempered_glass", 1, 18),
            new MarketLot("charged_alloy_lot", "charged_alloy", 1, 18),
            new MarketLot("hearth_ration_lot", "hearth_ration", 1, 14),
            new MarketLot("covenant_keystone_lot", "covenant_keystone", 1, 70),
            new MarketLot("aether_core_lot", "aether_core", 1, 80));

    private KeepEconomy() { }

    private static Map<String, Refined> createRefined() {
        Map<String, Refined> out = new LinkedHashMap<>();
        add(out, new Refined("living_mortar", "Living Mortar", Tier.ONE,
                "Stone bound with fiber that keeps growing into the joints.",
                Map.of("stone", 6, "verdant_fiber", 4, "timber", 20)));
        add(out, new Refined("tempered_glass", "Tempered Glass", Tier.ONE,
                "Forge heat quenched in frost: clear, and nearly unbreakable.",
                Map.of("ember_ingot", 5, "frost_crystal", 5)));
        add(out, new Refined("charged_alloy", "Charged Alloy", Tier.ONE,
                "Ingot folded around a storm cell so it holds a working charge.",
                Map.of("storm_cell", 5, "ember_ingot", 4)));
        add(out, new Refined("hearth_ration", "Hearth Ration", Tier.ONE,
                "Provisions packed with fiber to travel to the front and back.",
                Map.of("provisions", 6, "verdant_fiber", 3)));
        add(out, new Refined("covenant_keystone", "Covenant Keystone", Tier.TWO,
                "The stone every rebuilt arch is set around.",
                Map.of("living_mortar", 2, "tempered_glass", 2, "charged_alloy", 1)));
        add(out, new Refined("aether_core", "Aether Core", Tier.TWO,
                "A sealed heart of charge and light that feeds a whole quarter.",
                Map.of("charged_alloy", 2, "tempered_glass", 2, "hearth_ration", 1, "timber", 30)));
        add(out, new Refined("heartwood_relic", "Heartwood Relic", Tier.THREE,
                "Grown from the first grove and carried through every rebirth's ash.",
                Map.of("covenant_keystone", 1, "aether_core", 1, "living_mortar", 2)));
        return Map.copyOf(out);
    }

    private static void add(Map<String, Refined> out, Refined refined) {
        out.put(refined.id(), refined);
    }

    static Refined refined(String id) {
        return id == null ? null : REFINED.get(id);
    }

    static boolean isRefined(String id) {
        return id != null && REFINED.containsKey(id);
    }

    /** Refined materials in display order: by tier, then as authored. */
    static List<Refined> refinedInOrder() {
        return List.of(REFINED.get("living_mortar"), REFINED.get("tempered_glass"), REFINED.get("charged_alloy"),
                REFINED.get("hearth_ration"), REFINED.get("covenant_keystone"), REFINED.get("aether_core"),
                REFINED.get("heartwood_relic"));
    }

    static MarketLot lot(String id) {
        return MARKET.stream().filter(lot -> lot.id().equals(id)).findFirst().orElse(null);
    }

    static SilverBundle bundle(String id) {
        return SILVER_BUNDLES.stream().filter(bundle -> bundle.id().equals(id)).findFirst().orElse(null);
    }

    /** What recycling one refined good returns: half of each input, rounded down. */
    static Map<String, Integer> salvage(Refined refined) {
        Map<String, Integer> out = new LinkedHashMap<>();
        refined.inputs().forEach((id, amount) -> {
            int back = amount / 2;
            if (back > 0) out.put(id, back);
        });
        return out;
    }
}
