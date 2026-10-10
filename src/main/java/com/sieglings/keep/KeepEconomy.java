package com.sieglings.keep;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

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
 *
 * <p>The market refreshes every UTC day ({@link #dailyOffers}): timber and a handful of
 * common and uncommon lots for Silver, plus one rare (or, sometimes, epic) slot that is
 * paid in Siegecoins and is the only way to buy tier 2 and tier 3 goods. The draw is
 * seeded by keeper and day, so it is stable all day and different for every keeper.
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

    enum Currency { SILVER, SIEGECOINS }

    enum Rarity { COMMON, UNCOMMON, RARE, EPIC }

    /** One thing the market can offer: a lot of a resource, its price and its daily stock. */
    record MarketItem(String id, String resourceId, int amount, int price, Currency currency,
                      Rarity rarity, int dailyStock) { }

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

    /** Common slots drawn each day after the always-on timber lot. */
    static final int DAILY_COMMON_SLOTS = 3;
    static final int DAILY_UNCOMMON_SLOTS = 2;
    /** Chance (percent) that the daily coin slot is epic rather than rare. */
    static final int EPIC_CHANCE_PERCENT = 15;

    static final List<MarketItem> POOL = List.of(
            new MarketItem("timber_lot", "timber", 50, 6, Currency.SILVER, Rarity.COMMON, 5),
            new MarketItem("verdant_fiber_lot", "verdant_fiber", 10, 18, Currency.SILVER, Rarity.COMMON, 3),
            new MarketItem("ember_ingot_lot", "ember_ingot", 10, 22, Currency.SILVER, Rarity.COMMON, 3),
            new MarketItem("frost_crystal_lot", "frost_crystal", 10, 24, Currency.SILVER, Rarity.COMMON, 3),
            new MarketItem("storm_cell_lot", "storm_cell", 10, 22, Currency.SILVER, Rarity.COMMON, 3),
            new MarketItem("stone_lot", "stone", 10, 18, Currency.SILVER, Rarity.COMMON, 3),
            new MarketItem("provisions_lot", "provisions", 10, 16, Currency.SILVER, Rarity.COMMON, 3),
            new MarketItem("living_mortar_lot", "living_mortar", 1, 16, Currency.SILVER, Rarity.UNCOMMON, 2),
            new MarketItem("tempered_glass_lot", "tempered_glass", 1, 18, Currency.SILVER, Rarity.UNCOMMON, 2),
            new MarketItem("charged_alloy_lot", "charged_alloy", 1, 18, Currency.SILVER, Rarity.UNCOMMON, 2),
            new MarketItem("hearth_ration_lot", "hearth_ration", 1, 14, Currency.SILVER, Rarity.UNCOMMON, 2),
            new MarketItem("stone_crate", "stone", 30, 48, Currency.SILVER, Rarity.UNCOMMON, 1),
            new MarketItem("timber_wagon", "timber", 200, 20, Currency.SILVER, Rarity.UNCOMMON, 1),
            // Bulk raw crates keep the Siegecoin slot useful before any refined tier opens.
            new MarketItem("ember_crate_offer", "ember_ingot", 40, 90, Currency.SIEGECOINS, Rarity.RARE, 1),
            new MarketItem("frost_crate_offer", "frost_crystal", 40, 95, Currency.SIEGECOINS, Rarity.RARE, 1),
            new MarketItem("storm_crate_offer", "storm_cell", 40, 90, Currency.SIEGECOINS, Rarity.RARE, 1),
            new MarketItem("covenant_keystone_offer", "covenant_keystone", 1, 180, Currency.SIEGECOINS, Rarity.RARE, 1),
            new MarketItem("aether_core_offer", "aether_core", 1, 200, Currency.SIEGECOINS, Rarity.RARE, 1),
            new MarketItem("mortar_bundle_offer", "living_mortar", 3, 110, Currency.SIEGECOINS, Rarity.RARE, 1),
            new MarketItem("glass_bundle_offer", "tempered_glass", 3, 120, Currency.SIEGECOINS, Rarity.RARE, 1),
            new MarketItem("heartwood_relic_offer", "heartwood_relic", 1, 600, Currency.SIEGECOINS, Rarity.EPIC, 1));

    static MarketItem item(String id) {
        return POOL.stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
    }

    /**
     * Today's offers for one keeper: the timber lot, then common and uncommon Silver lots,
     * then one Siegecoin slot (epic on a lucky day). Only items the keeper could use today
     * are drawn ({@code available}), so a locked tier never wastes the rare slot.
     */
    static List<MarketItem> dailyOffers(String userId, String day, java.util.function.Predicate<MarketItem> available) {
        Random rng = new Random(((userId == null ? "" : userId) + "|" + day).hashCode() * 31L + day.hashCode());
        List<MarketItem> out = new ArrayList<>();
        MarketItem timber = item("timber_lot");
        if (available.test(timber)) out.add(timber);
        out.addAll(draw(rng, Rarity.COMMON, DAILY_COMMON_SLOTS, available, out));
        out.addAll(draw(rng, Rarity.UNCOMMON, DAILY_UNCOMMON_SLOTS, available, out));
        boolean epic = rng.nextInt(100) < EPIC_CHANCE_PERCENT;
        List<MarketItem> coinSlot = draw(rng, epic ? Rarity.EPIC : Rarity.RARE, 1, available, out);
        if (coinSlot.isEmpty() && epic) coinSlot = draw(rng, Rarity.RARE, 1, available, out);
        out.addAll(coinSlot);
        return out;
    }

    private static List<MarketItem> draw(Random rng, Rarity rarity, int count,
                                         java.util.function.Predicate<MarketItem> available, List<MarketItem> taken) {
        List<MarketItem> candidates = new ArrayList<>(POOL.stream()
                .filter(item -> item.rarity() == rarity && available.test(item) && !taken.contains(item)).toList());
        List<MarketItem> out = new ArrayList<>();
        while (out.size() < count && !candidates.isEmpty()) {
            out.add(candidates.remove(rng.nextInt(candidates.size())));
        }
        return out;
    }

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
