package com.sieglings.chronicles;

import com.sieglings.model.enums.Element;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Static content for Siegeknight Chronicles: professions and their unlock web,
 * gathering activities, recipes, items, weapon disciplines, techniques, synergies
 * and expedition routes. Numbers here are first-pass balance targets; everything a
 * designer would want to retune lives in this one file.
 */
public final class ChroniclesContent {

    private ChroniclesContent() {}

    public static final int MAX_LEVEL = 100;
    public static final int MAX_BOND = 100;
    public static final long OFFLINE_CAP_MS = 12L * 60 * 60 * 1000;
    public static final int ROSTER_CAP = 12;
    public static final int MAX_PENDING_TAMINGS = 3;
    public static final long TAMING_EXPIRY_MS = 48L * 60 * 60 * 1000;
    public static final int DAILY_TREATS_PER_SIEGELING = 5;
    public static final List<String> STARTERS = List.of("cacty", "pursula", "sundile", "fawny");
    public static final List<String> CLASSES = List.of("Guardian", "Bruiser", "Assassin", "Mage", "Support");
    /** The 12 canonical elements in RBX order; NEUTRAL is a TCG-only bucket. */
    public static final List<Element> ELEMENTS = List.of(Element.FIRE, Element.ICE, Element.WIND, Element.EARTH,
            Element.WATER, Element.ELECTRIC, Element.LIGHT, Element.SHADOW, Element.PSYCHIC, Element.METAL,
            Element.POISON, Element.UNDEAD);

    // ── Level curves ─────────────────────────────────────────────────────────

    /** Cumulative XP needed to reach a skill/affinity/mastery/weapon/rank level. */
    public static long xpForLevel(int level) {
        int n = Math.max(0, level - 1);
        return 40L * n * n + 60L * n;
    }

    public static int levelForXp(long xp) {
        int level = 1;
        while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
        return level;
    }

    /** Cumulative bond points needed for a bond level (bond starts at 0, Stranger). */
    public static long bondForLevel(int level) {
        return 8L * level * level;
    }

    public static int bondLevelFor(long points) {
        int level = 0;
        while (level < MAX_BOND && points >= bondForLevel(level + 1)) level++;
        return level;
    }

    /** Cumulative combat XP for a Siegeling's level. */
    public static long companionXpForLevel(int level) {
        int n = Math.max(0, level - 1);
        return 24L * n * n + 36L * n;
    }

    /** RBX GameConfig: base forms cap at 10, first evolutions at 25, finals at 50. */
    public static int levelCap(int stage, boolean canEvolve) {
        if (!canEvolve) return 50;
        return stage <= 1 ? 10 : 25;
    }

    // ── Requirements ─────────────────────────────────────────────────────────

    public enum ReqKind { SKILL, AFFINITY, MASTERY, RANK }

    public record Req(ReqKind kind, String key, int level) {}

    static Req skill(String id, int level) { return new Req(ReqKind.SKILL, id, level); }
    static Req affinity(Element element, int level) { return new Req(ReqKind.AFFINITY, element.name(), level); }
    static Req mastery(String creatureClass, int level) { return new Req(ReqKind.MASTERY, creatureClass, level); }
    static Req rank(int level) { return new Req(ReqKind.RANK, "rank", level); }

    // ── Professions ──────────────────────────────────────────────────────────

    public record Skill(String id, String name, String group, String blurb, List<Req> unlock) {}

    public static final Map<String, Skill> SKILLS = ordered(List.of(
            new Skill("mining", "Mining", "Gathering", "Ore, stone and elemental shards.", List.of()),
            new Skill("woodcutting", "Woodcutting", "Gathering", "Timber for tools, rods and bows.", List.of()),
            new Skill("foraging", "Foraging", "Gathering", "Herbs and berries for remedies and lures.", List.of()),
            new Skill("fishing", "Fishing", "Gathering", "Fish for cooking. Needs a rod carved from pine.",
                    List.of(skill("woodcutting", 5))),
            new Skill("smithing", "Smithing", "Production", "Smelt bars and forge weapons, armor and relics.",
                    List.of(skill("mining", 5))),
            new Skill("alchemy", "Alchemy", "Production", "Potions for expeditions and lures for taming.",
                    List.of(skill("foraging", 8))),
            new Skill("cooking", "Cooking", "Production", "Meals your Siegelings love. Treats build bond.",
                    List.of(skill("fishing", 3))),
            new Skill("taming", "Taming", "Siegeling", "Befriend wild Siegelings spotted on expeditions.", List.of()),
            new Skill("command", "Command", "Expedition", "Lead larger companies. Opens party slots.", List.of())
    ), Skill::id);

    /** Command levels at which the company grows. */
    public static int partySlots(int commandLevel) {
        if (commandLevel >= 10) return 3;
        if (commandLevel >= 3) return 2;
        return 1;
    }

    public static final int RESERVE_COMMAND_LEVEL = 30;

    // ── Items ────────────────────────────────────────────────────────────────

    public enum ItemKind { MATERIAL, ESSENCE, POTION, LURE, FOOD, WEAPON, ARMOR, RELIC }

    public record Item(String id, String name, ItemKind kind, String blurb, int tier,
                       double healPct, Element lureElement, int lureBonus,
                       int bondXp, Set<Element> prefers,
                       String weaponType, int armor, boolean heatWard, String relicEffect) {}

    private static Item material(String id, String name, String blurb, int tier) {
        return new Item(id, name, ItemKind.MATERIAL, blurb, tier, 0, null, 0, 0, Set.of(), null, 0, false, null);
    }

    private static Item potion(String id, String name, String blurb, double healPct, boolean heatWard) {
        return new Item(id, name, ItemKind.POTION, blurb, 1, healPct, null, 0, 0, Set.of(), null, 0, heatWard, null);
    }

    private static Item lure(String id, String name, String blurb, Element element, int bonus) {
        return new Item(id, name, ItemKind.LURE, blurb, 1, 0, element, bonus, 0, Set.of(), null, 0, false, null);
    }

    private static Item food(String id, String name, String blurb, int bondXp, Set<Element> prefers) {
        return new Item(id, name, ItemKind.FOOD, blurb, 1, 0, null, 0, bondXp, prefers, null, 0, false, null);
    }

    private static Item weapon(String id, String name, String type, int tier, String blurb) {
        return new Item(id, name, ItemKind.WEAPON, blurb, tier, 0, null, 0, 0, Set.of(), type, 0, false, null);
    }

    private static Item armor(String id, String name, int tier, int armor, boolean heatWard, String blurb) {
        return new Item(id, name, ItemKind.ARMOR, blurb, tier, 0, null, 0, 0, Set.of(), null, armor, heatWard, null);
    }

    private static Item relic(String id, String name, String effect, boolean heatWard, String blurb) {
        return new Item(id, name, ItemKind.RELIC, blurb, 2, 0, null, 0, 0, Set.of(), null, 0, heatWard, effect);
    }

    public static final Map<String, Item> ITEMS;

    static {
        List<Item> items = new ArrayList<>(List.of(
                material("copper_ore", "Copper Ore", "Soft ore that smelts into copper bars.", 1),
                material("iron_ore", "Iron Ore", "Tough ore for second-tier gear.", 2),
                material("ember_shard", "Ember Shard", "A warm crystal from volcanic seams.", 3),
                material("frost_crystal", "Frost Crystal", "Never melts. Prized by Ice-attuned smiths.", 3),
                material("pine_log", "Pine Log", "Light, straight timber.", 1),
                material("oak_log", "Oak Log", "Dense timber for staves and hafts.", 2),
                material("heartwood", "Heartwood", "Living timber from the oldest trees.", 3),
                material("sunleaf", "Sunleaf", "A common healing herb.", 1),
                material("frostbloom", "Frostbloom", "A cold flower that soothes heat.", 2),
                material("galeberry", "Galeberry", "Tart berries that ride the high winds.", 2),
                material("gale_feather", "Gale Feather", "Shed by Wind Siegelings in flight.", 3),
                material("minnow", "Minnow", "Small river fish.", 1),
                material("silverfin", "Silverfin", "A deep-pool fish with bright scales.", 2),
                material("copper_bar", "Copper Bar", "Smelted copper.", 1),
                material("iron_bar", "Iron Bar", "Smelted iron.", 2),
                material("ancient_relic", "Ancient Relic", "Found only in dungeons. Needed for final evolutions.", 4),
                potion("herb_tonic", "Herb Tonic", "Heals 35% of a Siegeling's health mid-battle.", 0.35, false),
                potion("frostbloom_remedy", "Frostbloom Remedy",
                        "Heals 50% and cools heat hazards for the whole company.", 0.50, true),
                lure("wild_bait", "Wild Bait", "A plain lure any Siegeling might follow.", null, 12),
                lure("ember_lure", "Ember Lure", "Smoked fish on pine. Fire Siegelings can't resist.", Element.FIRE, 30),
                lure("root_lure", "Root Lure", "Herbs bound to oak. Calms Earth Siegelings.", Element.EARTH, 30),
                lure("frost_lure", "Frost Lure", "A frostbloom-wrapped minnow for Ice Siegelings.", Element.ICE, 30),
                lure("gale_lure", "Gale Lure", "Galeberries strung on a feather for Wind Siegelings.", Element.WIND, 30),
                food("grilled_minnow", "Grilled Minnow", "A simple treat.", 60,
                        Set.of(Element.FIRE, Element.WATER, Element.ICE, Element.UNDEAD)),
                food("sunleaf_salad", "Sunleaf Salad", "Crisp greens.", 50,
                        Set.of(Element.EARTH, Element.WIND, Element.LIGHT, Element.POISON)),
                food("silverfin_stew", "Silverfin Stew", "A hearty stew.", 150,
                        Set.of(Element.WATER, Element.ICE, Element.METAL, Element.ELECTRIC)),
                food("berry_tart", "Berry Tart", "Sweet and windswept.", 130,
                        Set.of(Element.WIND, Element.PSYCHIC, Element.LIGHT, Element.SHADOW)),
                weapon("squires_sword", "Squire's Sword", "sword", 0, "A plain blade every Siegeknight starts with."),
                weapon("copper_sword", "Copper Sword", "sword", 1, "A balanced leader's blade."),
                weapon("copper_spear", "Copper Spear", "spear", 1, "Reach to step between a foe and a friend."),
                weapon("pine_bow", "Pine Bow", "bow", 1, "Pick out the dangerous target."),
                weapon("oak_staff", "Oak Staff", "staff", 1, "Channels the company's elements."),
                weapon("copper_hammer", "Copper Hammer", "hammer", 1, "Cracks shells and armor."),
                weapon("copper_daggers", "Copper Daggers", "daggers", 1, "For the opening feint."),
                weapon("iron_sword", "Iron Sword", "sword", 2, "A veteran's blade."),
                weapon("iron_spear", "Iron Spear", "spear", 2, "A steady guard's spear."),
                weapon("oak_longbow", "Oak Longbow", "bow", 2, "A hunter's longbow."),
                weapon("heartwood_staff", "Heartwood Staff", "staff", 2, "Living wood that hums with power."),
                weapon("iron_hammer", "Iron Hammer", "hammer", 2, "Heavy enough to sunder plate."),
                weapon("iron_daggers", "Iron Daggers", "daggers", 2, "Quick, quiet, sharp."),
                weapon("embersteel_lance", "Embersteel Lance", "spear", 3,
                        "Intercept also sears the attacker. Forged by Fire-attuned Guardian commanders."),
                armor("travelers_coat", "Traveler's Coat", 0, 1, false, "Keeps the rain off."),
                armor("copper_mail", "Copper Mail", 1, 4, false, "Light mail against expedition hazards."),
                armor("iron_mail", "Iron Mail", 2, 9, false, "Solid protection for dungeon work."),
                armor("frostweave_cloak", "Frostweave Cloak", 2, 6, true, "Frost crystals sewn into wool. Wards off heat."),
                relic("emberward_charm", "Emberward Charm", "heatWard", true,
                        "Halves volcanic heat damage to the company."),
                relic("rally_banner", "Rally Banner", "commandGauge", false,
                        "The command gauge fills 20% faster."),
                relic("bastion_crest", "Bastion Crest", "guardianCrest", false,
                        "Guardians gain 12% defense and their first bond technique fires one round sooner.")
        ));
        for (Element element : ELEMENTS) {
            String label = elementLabel(element);
            items.add(new Item(essenceId(element), label + " Essence", ItemKind.ESSENCE,
                    "Left by defeated " + label + " Siegelings. Fuels evolution.", 2,
                    0, null, 0, 0, Set.of(), null, 0, false, null));
        }
        ITEMS = ordered(items, Item::id);
    }

    public static String essenceId(Element element) {
        return "essence_" + element.name().toLowerCase();
    }

    // ── Gathering activities ────────────────────────────────────────────────

    public record Activity(String id, String skillId, String name, String place, int level,
                           int actionSeconds, int xp, String output, String bonusOutput, int bonusEvery,
                           Set<Element> helperElements) {}

    public static final Map<String, Activity> ACTIVITIES = ordered(List.of(
            new Activity("mine_copper", "mining", "Copper Vein", "Mossroot Quarry", 1, 8, 6,
                    "copper_ore", null, 0, Set.of(Element.EARTH, Element.METAL)),
            new Activity("mine_iron", "mining", "Iron Vein", "Mossroot Quarry", 10, 12, 14,
                    "iron_ore", null, 0, Set.of(Element.EARTH, Element.METAL)),
            new Activity("mine_ember", "mining", "Emberstone Seam", "Ember Crags", 20, 16, 26,
                    "iron_ore", "ember_shard", 3, Set.of(Element.EARTH, Element.FIRE)),
            new Activity("mine_frost", "mining", "Frostglass Lode", "Frostfen", 25, 18, 32,
                    "iron_ore", "frost_crystal", 3, Set.of(Element.ICE, Element.METAL)),
            new Activity("chop_pine", "woodcutting", "Pine Stand", "Galeward Slopes", 1, 8, 6,
                    "pine_log", null, 0, Set.of(Element.EARTH, Element.WIND)),
            new Activity("chop_oak", "woodcutting", "Old Oaks", "Mossroot Wilds", 10, 12, 14,
                    "oak_log", null, 0, Set.of(Element.EARTH, Element.WIND)),
            new Activity("chop_heartwood", "woodcutting", "Heartwood Grove", "Mossroot Deeps", 22, 16, 28,
                    "heartwood", null, 0, Set.of(Element.EARTH, Element.WIND)),
            new Activity("forage_sunleaf", "foraging", "Sunleaf Meadow", "Mossroot Wilds", 1, 8, 6,
                    "sunleaf", null, 0, Set.of(Element.WIND, Element.POISON, Element.EARTH)),
            new Activity("forage_frostbloom", "foraging", "Frostbloom Banks", "Frostfen", 12, 12, 15,
                    "frostbloom", null, 0, Set.of(Element.ICE, Element.WIND)),
            new Activity("forage_galeberry", "foraging", "Galeberry Ridge", "Galeward Heights", 18, 14, 22,
                    "galeberry", "gale_feather", 4, Set.of(Element.WIND, Element.POISON)),
            new Activity("fish_river", "fishing", "Riverbank", "Mossroot Wilds", 1, 10, 8,
                    "minnow", null, 0, Set.of(Element.WATER, Element.ICE)),
            new Activity("fish_deep", "fishing", "Deep Pool", "Frostfen", 12, 14, 18,
                    "silverfin", null, 0, Set.of(Element.WATER, Element.ICE))
    ), Activity::id);

    // ── Recipes ──────────────────────────────────────────────────────────────

    /**
     * Repeatable recipes (bars, potions, lures, meals) can run as the knight's idle
     * activity or be made instantly in small batches; gear is a one-off forge.
     */
    public record Recipe(String id, String skillId, String output, int outputQty, int level, List<Req> extraReqs,
                         Map<String, Integer> inputs, int actionSeconds, int xp, boolean repeatable,
                         Set<Element> helperElements) {}

    private static Recipe repeatable(String id, String skillId, String output, int level, List<Req> extra,
                                     Map<String, Integer> inputs, int seconds, int xp, Set<Element> helpers) {
        return new Recipe(id, skillId, output, 1, level, extra, inputs, seconds, xp, true, helpers);
    }

    private static Recipe forge(String id, String output, int level, List<Req> extra,
                                Map<String, Integer> inputs, int xp) {
        return new Recipe(id, "smithing", output, 1, level, extra, inputs, 0, xp, false, Set.of());
    }

    private static final Set<Element> FORGE_HELPERS = Set.of(Element.FIRE, Element.METAL);
    private static final Set<Element> ALCHEMY_HELPERS = Set.of(Element.WATER, Element.POISON, Element.PSYCHIC);
    private static final Set<Element> KITCHEN_HELPERS = Set.of(Element.FIRE, Element.WATER);

    public static final Map<String, Recipe> RECIPES = ordered(List.of(
            repeatable("smelt_copper", "smithing", "copper_bar", 1, List.of(),
                    Map.of("copper_ore", 2), 10, 8, FORGE_HELPERS),
            repeatable("smelt_iron", "smithing", "iron_bar", 10, List.of(),
                    Map.of("iron_ore", 2), 14, 16, FORGE_HELPERS),
            forge("forge_copper_sword", "copper_sword", 2, List.of(), Map.of("copper_bar", 3, "pine_log", 2), 40),
            forge("forge_copper_daggers", "copper_daggers", 3, List.of(), Map.of("copper_bar", 3), 40),
            forge("forge_copper_spear", "copper_spear", 3, List.of(), Map.of("copper_bar", 2, "pine_log", 4), 40),
            forge("forge_copper_mail", "copper_mail", 4, List.of(), Map.of("copper_bar", 5), 55),
            forge("forge_pine_bow", "pine_bow", 4, List.of(skill("woodcutting", 6)),
                    Map.of("pine_log", 6, "copper_bar", 1), 45),
            forge("forge_copper_hammer", "copper_hammer", 5, List.of(), Map.of("copper_bar", 4, "pine_log", 2), 50),
            forge("forge_oak_staff", "oak_staff", 6, List.of(skill("woodcutting", 10)),
                    Map.of("oak_log", 4, "copper_bar", 1, "sunleaf", 2), 55),
            forge("forge_rally_banner", "rally_banner", 8, List.of(skill("command", 5)),
                    Map.of("copper_bar", 4, "oak_log", 2, "sunleaf", 6), 70),
            forge("forge_emberward_charm", "emberward_charm", 12, List.of(affinity(Element.FIRE, 10)),
                    Map.of("copper_bar", 3, "essence_fire", 4), 90),
            forge("forge_iron_sword", "iron_sword", 15, List.of(), Map.of("iron_bar", 4, "oak_log", 2), 110),
            forge("forge_iron_spear", "iron_spear", 15, List.of(), Map.of("iron_bar", 3, "oak_log", 4), 110),
            forge("forge_iron_daggers", "iron_daggers", 16, List.of(), Map.of("iron_bar", 4), 110),
            forge("forge_oak_longbow", "oak_longbow", 16, List.of(skill("woodcutting", 15)),
                    Map.of("oak_log", 8, "iron_bar", 1), 110),
            forge("forge_iron_hammer", "iron_hammer", 17, List.of(), Map.of("iron_bar", 5, "oak_log", 2), 120),
            forge("forge_iron_mail", "iron_mail", 18, List.of(), Map.of("iron_bar", 6), 130),
            forge("forge_heartwood_staff", "heartwood_staff", 20, List.of(skill("woodcutting", 22)),
                    Map.of("heartwood", 4, "iron_bar", 2, "frostbloom", 2), 150),
            forge("forge_frostweave_cloak", "frostweave_cloak", 22, List.of(affinity(Element.ICE, 15)),
                    Map.of("frost_crystal", 4, "iron_bar", 2, "frostbloom", 4), 170),
            forge("forge_embersteel_lance", "embersteel_lance", 25,
                    List.of(affinity(Element.FIRE, 20), mastery("Guardian", 10)),
                    Map.of("iron_bar", 6, "ember_shard", 4, "heartwood", 2), 260),
            forge("forge_bastion_crest", "bastion_crest", 35,
                    List.of(mastery("Guardian", 30), affinity(Element.EARTH, 25)),
                    Map.of("iron_bar", 8, "ancient_relic", 2, "essence_earth", 12), 420),
            repeatable("brew_herb_tonic", "alchemy", "herb_tonic", 1, List.of(),
                    Map.of("sunleaf", 2), 10, 8, ALCHEMY_HELPERS),
            repeatable("brew_wild_bait", "alchemy", "wild_bait", 2, List.of(skill("taming", 2)),
                    Map.of("sunleaf", 2, "minnow", 1), 10, 9, ALCHEMY_HELPERS),
            repeatable("brew_ember_lure", "alchemy", "ember_lure", 4, List.of(),
                    Map.of("minnow", 1, "pine_log", 2), 12, 12, ALCHEMY_HELPERS),
            repeatable("brew_root_lure", "alchemy", "root_lure", 8, List.of(),
                    Map.of("sunleaf", 3, "oak_log", 1), 12, 14, ALCHEMY_HELPERS),
            repeatable("brew_frostbloom_remedy", "alchemy", "frostbloom_remedy", 10,
                    List.of(skill("foraging", 12), affinity(Element.ICE, 10)),
                    Map.of("frostbloom", 2, "sunleaf", 1), 14, 20, ALCHEMY_HELPERS),
            repeatable("brew_frost_lure", "alchemy", "frost_lure", 12, List.of(),
                    Map.of("frostbloom", 1, "minnow", 1), 12, 18, ALCHEMY_HELPERS),
            repeatable("brew_gale_lure", "alchemy", "gale_lure", 15, List.of(),
                    Map.of("galeberry", 2, "gale_feather", 1), 12, 22, ALCHEMY_HELPERS),
            repeatable("cook_grilled_minnow", "cooking", "grilled_minnow", 1, List.of(),
                    Map.of("minnow", 1, "pine_log", 1), 10, 8, KITCHEN_HELPERS),
            repeatable("cook_sunleaf_salad", "cooking", "sunleaf_salad", 3, List.of(),
                    Map.of("sunleaf", 3), 10, 9, KITCHEN_HELPERS),
            repeatable("cook_silverfin_stew", "cooking", "silverfin_stew", 12, List.of(),
                    Map.of("silverfin", 1, "sunleaf", 1), 14, 20, KITCHEN_HELPERS),
            repeatable("cook_berry_tart", "cooking", "berry_tart", 15, List.of(),
                    Map.of("galeberry", 2, "sunleaf", 1), 14, 22, KITCHEN_HELPERS)
    ), Recipe::id);

    // ── Weapon disciplines ───────────────────────────────────────────────────

    public enum CommandTrigger { READY, ALLY_LOW, ELITE, BOSS }

    public record Weapon(String id, String name, String specialty, String command, String commandText,
                         CommandTrigger defaultTrigger) {}

    public static final Map<String, Weapon> WEAPONS = ordered(List.of(
            new Weapon("sword", "Sword", "Balanced leadership", "Rally Strike",
                    "The whole company deals 20% more damage for 2 rounds.", CommandTrigger.READY),
            new Weapon("spear", "Spear", "Defensive positioning", "Intercept",
                    "Shield a Siegeling that falls low for a quarter of its health.", CommandTrigger.ALLY_LOW),
            new Weapon("bow", "Bow", "Target selection", "Mark Prey",
                    "Mark the toughest enemy: it takes 35% more damage and the company focuses it.", CommandTrigger.ELITE),
            new Weapon("staff", "Staff", "Elemental channeling", "Elemental Amplification",
                    "Elemental advantage hits 30% harder for 3 rounds.", CommandTrigger.BOSS),
            new Weapon("hammer", "Hammer", "Armor breaking", "Sundering Blow",
                    "The sturdiest enemy loses 40% defense for 3 rounds.", CommandTrigger.ELITE),
            new Weapon("daggers", "Daggers", "Ambush and evasion", "Opening Feint",
                    "The company's next attack lands as a critical hit.", CommandTrigger.READY)
    ), Weapon::id);

    // ── Element and class identity ───────────────────────────────────────────

    public static String elementLabel(Element element) {
        if (element == null) return "Neutral";
        return switch (element) {
            case ELECTRIC -> "Electric";
            default -> element.name().charAt(0) + element.name().substring(1).toLowerCase();
        };
    }

    /** Mirrors {@code EffectService.isWeakTo}: the battle table's own chart. */
    public static boolean beats(Element attacker, Element defender) {
        if (attacker == null || defender == null) return false;
        return switch (attacker) {
            case FIRE -> defender == Element.ICE || defender == Element.METAL;
            case ICE -> defender == Element.WIND || defender == Element.POISON;
            case WIND -> defender == Element.EARTH || defender == Element.WATER;
            case EARTH -> defender == Element.FIRE || defender == Element.ELECTRIC;
            case WATER -> defender == Element.FIRE || defender == Element.ICE;
            case METAL -> defender == Element.EARTH || defender == Element.WIND;
            case ELECTRIC -> defender == Element.WIND || defender == Element.FIRE;
            case POISON -> defender == Element.ICE || defender == Element.EARTH;
            case SHADOW -> defender == Element.PSYCHIC || defender == Element.LIGHT;
            case PSYCHIC -> defender == Element.LIGHT || defender == Element.UNDEAD;
            case LIGHT -> defender == Element.UNDEAD || defender == Element.SHADOW;
            case UNDEAD -> defender == Element.SHADOW || defender == Element.PSYCHIC;
            default -> false;
        };
    }

    /** RBX RarityStatBudget. */
    public static int rarityBudget(com.sieglings.model.enums.Rarity rarity) {
        if (rarity == null) return 100;
        return switch (rarity) {
            case COMMON -> 100;
            case UNCOMMON -> 150;
            case RARE -> 300;
            case EPIC -> 400;
            case LEGENDARY -> 500;
            default -> 100;
        };
    }

    /** RBX ClassStatWeights in {health, attack, defense, speed} order. */
    public static double[] classWeights(String creatureClass) {
        return switch (creatureClass == null ? "" : creatureClass) {
            case "Assassin" -> new double[]{0.14, 0.32, 0.22, 0.32};
            case "Guardian" -> new double[]{0.40, 0.17, 0.33, 0.10};
            case "Mage" -> new double[]{0.20, 0.40, 0.11, 0.29};
            case "Support" -> new double[]{0.36, 0.14, 0.14, 0.36};
            default -> new double[]{0.28, 0.26, 0.28, 0.18};
        };
    }

    /** RBX ElementStatBias in {health, attack, defense, speed} order. */
    public static double[] elementBias(Element element) {
        if (element == null) return new double[]{0, 0, 0, 0};
        return switch (element) {
            case FIRE -> new double[]{0, 0.07, 0, 0};
            case EARTH -> new double[]{0.07, 0, 0, 0};
            case WIND -> new double[]{0, 0, 0, 0.07};
            case ICE -> new double[]{0, 0, 0.07, 0};
            case WATER -> new double[]{0.04, 0.04, 0, 0};
            case ELECTRIC -> new double[]{0, 0.04, 0, 0.04};
            case POISON -> new double[]{0.04, 0, 0, 0.04};
            case METAL -> new double[]{0.04, 0, 0.04, 0};
            case PSYCHIC -> new double[]{0, 0, 0.04, 0.04};
            case UNDEAD -> new double[]{0, 0.04, 0.04, 0};
            case LIGHT -> new double[]{0.03, 0, 0.03, 0.03};
            case SHADOW -> new double[]{0, 0.03, 0.03, 0.03};
            default -> new double[]{0, 0, 0, 0};
        };
    }

    /** Behaviour for creatures RBX has not placed in the world yet. */
    public static String defaultBehavior(String creatureClass) {
        return switch (creatureClass == null ? "" : creatureClass) {
            case "Assassin" -> "skittish";
            case "Bruiser" -> "pack";
            case "Mage" -> "lone";
            case "Guardian", "Support" -> "gentle";
            default -> "gentle";
        };
    }

    // ── Modifiers (techniques, synergies, bonds) ─────────────────────────────

    /**
     * Percent modifiers a technique or synergy grants. {@code scope} limits the
     * ally bonuses to one element or class; null means the whole company.
     */
    public record Mods(double atk, double def, double hp, double spd, double crit,
                       double enemyDef, double enemySpd, double postHeal, double openingDmg, double lowHpGuard) {
        public static final Mods NONE = new Mods(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        static Mods atk(double v) { return new Mods(v, 0, 0, 0, 0, 0, 0, 0, 0, 0); }
        static Mods def(double v) { return new Mods(0, v, 0, 0, 0, 0, 0, 0, 0, 0); }
        static Mods hp(double v) { return new Mods(0, 0, v, 0, 0, 0, 0, 0, 0, 0); }
        static Mods spd(double v) { return new Mods(0, 0, 0, v, 0, 0, 0, 0, 0, 0); }
        static Mods of(double atk, double def, double hp, double spd) { return new Mods(atk, def, hp, spd, 0, 0, 0, 0, 0, 0); }
    }

    public record Synergy(String key, int count, String label, Mods mods) {}

    /** CreatureData.Synergies from SiegelingsRBX, keyed by element name or class. */
    public static final Map<String, List<Synergy>> SYNERGIES;

    static {
        Map<String, List<Synergy>> map = new LinkedHashMap<>();
        syn(map, "FIRE", "Ember", Mods.atk(0.10), "Inferno", Mods.atk(0.25));
        syn(map, "ICE", "Frost", Mods.def(0.10), "Blizzard", Mods.of(0, 0.25, 0, -0.10));
        syn(map, "WIND", "Breeze", Mods.spd(0.15), "Tempest", Mods.of(0.10, 0, 0, 0.30));
        syn(map, "EARTH", "Roots", Mods.hp(0.10), "Tectonic", Mods.of(0, 0.10, 0.25, 0));
        syn(map, "SHADOW", "Dusk", Mods.of(0.10, 0, 0, 0.05), "Eclipse", Mods.of(0.20, 0, 0, 0.15));
        syn(map, "LIGHT", "Radiant", Mods.of(0.05, 0.10, 0, 0), "Brilliance", Mods.of(0.15, 0.20, 0, 0));
        syn(map, "ELECTRIC", "Spark", Mods.of(0.05, 0, 0, 0.10), "Thunder", Mods.of(0.15, 0, 0, 0.20));
        syn(map, "WATER", "Tide", Mods.of(0, 0.10, 0, 0.05), "Tsunami", Mods.of(0, 0.20, 0, 0.15));
        syn(map, "PSYCHIC", "Link", Mods.of(0, 0, 0.10, 0.05), "Harmony", Mods.of(0, 0, 0.20, 0.10));
        syn(map, "METAL", "Alloy", Mods.def(0.12), "Tempered", Mods.of(0, 0.25, 0.08, 0));
        syn(map, "POISON", "Toxin", Mods.of(0.08, 0, 0, 0.05), "Venom", Mods.of(0.18, 0, 0, 0.10));
        syn(map, "UNDEAD", "Wither", Mods.of(0, 0.08, 0.08, 0), "Necrotic", Mods.of(0, 0.15, 0.18, 0));
        syn(map, "Bruiser", "Fury", Mods.atk(0.12), "Rampage", Mods.of(0.25, 0, 0.10, 0));
        syn(map, "Mage", "Focus", Mods.atk(0.10), "Arcane", Mods.atk(0.20));
        syn(map, "Guardian", "Shield", Mods.def(0.15), "Bastion", Mods.of(0, 0.30, 0.10, 0));
        syn(map, "Assassin", "Edge", Mods.of(0.05, 0, 0, 0.10), "Lethal", Mods.of(0.20, 0, 0, 0.20));
        syn(map, "Support", "Mend", Mods.hp(0.10), "Harmony", Mods.of(0, 0.10, 0.20, 0));
        SYNERGIES = Collections.unmodifiableMap(map);
    }

    private static void syn(Map<String, List<Synergy>> map, String key, String two, Mods twoMods,
                            String three, Mods threeMods) {
        map.put(key, List.of(new Synergy(key, 2, two, twoMods), new Synergy(key, 3, three, threeMods)));
    }

    /** Affinity milestone names from the design (levels 1/10/25/50/75/100). */
    public static final int[] AFFINITY_MILESTONES = {1, 10, 25, 50, 75, 100};
    public static final String[] AFFINITY_MILESTONE_NAMES =
            {"Awareness", "Familiarity", "Attunement", "Resonance", "Convergence", "Ascendance"};
    public static final int[] BOND_MILESTONES = {0, 10, 25, 50, 75, 100};
    public static final String[] BOND_MILESTONE_NAMES =
            {"Stranger", "Companion", "Trusted", "Attuned", "Devoted", "Knightbound"};

    /**
     * Familiarity (affinity 10) techniques. A knight prepares one per expedition and
     * it only applies when a Siegeling of that element is in the company.
     */
    public record Technique(String id, Element element, String name, String text, boolean elementScoped, Mods mods,
                            String mastery) {}

    public static final Map<String, Technique> TECHNIQUES;

    static {
        Map<Element, Technique> map = new EnumMap<>(Element.class);
        tech(map, Element.FIRE, "Kindled Strikes", "Fire Siegelings deal 15% more damage.", true, Mods.atk(0.15), "Infernal Surge");
        tech(map, Element.ICE, "Rime Guard", "Ice Siegelings gain 15% defense and enemies are 8% slower.", true,
                new Mods(0, 0.15, 0, 0, 0, 0, -0.08, 0, 0, 0), "Absolute Frost");
        tech(map, Element.WIND, "Tailwind", "The whole company is 12% faster.", false, Mods.spd(0.12), "Tempest Rush");
        tech(map, Element.EARTH, "Stoneskin", "Earth Siegelings gain 18% health.", true, Mods.hp(0.18), "Earthen Sanctuary");
        tech(map, Element.WATER, "Tidal Mending", "The company recovers 8% health after each battle.", false,
                new Mods(0, 0, 0, 0, 0, 0, 0, 0.08, 0, 0), "Cleansing Tide");
        tech(map, Element.ELECTRIC, "Static Charge", "Electric Siegelings gain 12% critical chance.", true,
                new Mods(0, 0, 0, 0, 0.12, 0, 0, 0, 0, 0), "Thunder Conduit");
        tech(map, Element.LIGHT, "Warding Glow", "The whole company gains 8% defense.", false, Mods.def(0.08), "Radiant Covenant");
        tech(map, Element.SHADOW, "Shroud", "The company's opening round deals 25% more damage.", false,
                new Mods(0, 0, 0, 0, 0, 0, 0, 0, 0.25, 0), "Eclipse Veil");
        tech(map, Element.PSYCHIC, "Foresight", "The company gains 8% speed and 5% defense.", false,
                Mods.of(0, 0.05, 0, 0.08), "Mindlink");
        tech(map, Element.METAL, "Plated", "Metal Siegelings gain 18% defense.", true, Mods.def(0.18), "Living Alloy");
        tech(map, Element.POISON, "Toxic Edge", "Enemies lose 10% defense; Poison Siegelings gain 8% attack.", true,
                new Mods(0.08, 0, 0, 0, 0, -0.10, 0, 0, 0, 0), "Venom Bloom");
        tech(map, Element.UNDEAD, "Grave Will", "Siegelings below a quarter health take 25% less damage.", false,
                new Mods(0, 0, 0, 0, 0, 0, 0, 0, 0, 0.25), "Deathless March");
        Map<String, Technique> byId = new LinkedHashMap<>();
        for (Technique t : map.values()) byId.put(t.id(), t);
        TECHNIQUES = Collections.unmodifiableMap(byId);
    }

    private static void tech(Map<Element, Technique> map, Element element, String name, String text,
                             boolean scoped, Mods mods, String mastery) {
        map.put(element, new Technique("tech_" + element.name().toLowerCase(), element, name, text, scoped, mods, mastery));
    }

    public static Technique techniqueFor(Element element) {
        return TECHNIQUES.get("tech_" + element.name().toLowerCase());
    }

    /** Cross-class techniques: both masteries at {@link #CROSS_CLASS_LEVEL} and both classes fielded. */
    public record CrossClass(String id, String a, String b, String name, String text, Mods mods) {}

    public static final int CROSS_CLASS_LEVEL = 20;

    public static final List<CrossClass> CROSS_CLASS = List.of(
            new CrossClass("sanctuary_formation", "Guardian", "Support", "Sanctuary Formation",
                    "Protection followed by healing: the company gains 10% defense and recovers 6% after each battle.",
                    new Mods(0, 0.10, 0, 0, 0, 0, 0, 0.06, 0, 0)),
            new CrossClass("execution_window", "Bruiser", "Assassin", "Execution Window",
                    "Frontline pressure exposes targets: +10% critical chance for the company.",
                    new Mods(0, 0, 0, 0, 0.10, 0, 0, 0, 0, 0)),
            new CrossClass("fortress_spell", "Guardian", "Mage", "Fortress Spell",
                    "Protected spellcasting: the company gains 8% attack and 8% defense.", Mods.of(0.08, 0.08, 0, 0)),
            new CrossClass("arcane_ambush", "Assassin", "Mage", "Arcane Ambush",
                    "An empowered opening: the first round deals 35% more damage.",
                    new Mods(0, 0, 0, 0, 0, 0, 0, 0, 0.35, 0)),
            new CrossClass("endless_vanguard", "Bruiser", "Support", "Endless Vanguard",
                    "Sustained combat: +10% health and 5% recovery after each battle.",
                    new Mods(0, 0, 0.10, 0, 0, 0, 0, 0.05, 0, 0))
    );

    /** Per-class identity shown on the mastery path and used for the bond technique. */
    public record ClassPath(String creatureClass, String path, String identity, String bondNoun, String bondText) {}

    public static final Map<String, ClassPath> CLASS_PATHS = ordered(List.of(
            new ClassPath("Guardian", "The Bulwark Path", "Protection, taunting, barriers", "Aegis",
                    "The first time an ally falls below 40%, this Guardian shields it and strikes back."),
            new ClassPath("Bruiser", "The Vanguard Path", "Frontline damage, pressure, counterattacks", "Resolve",
                    "Below half health it hardens (+35% defense) and counters far more often."),
            new ClassPath("Assassin", "The Shadowstrike Path", "Critical hits, ambushes, priority targets", "Ambush",
                    "Its opening strike each battle is a guaranteed double-damage critical."),
            new ClassPath("Mage", "The Arcanist Path", "Elemental spells, area damage, status effects", "Surge",
                    "Its first area spell each battle hits 70% harder."),
            new ClassPath("Support", "The Lifebinder Path", "Healing, buffs, recovery, utility", "Mending",
                    "Once a battle, it restores 40% health to the most wounded ally.")
    ), ClassPath::creatureClass);

    public static String bondPrefix(Element element) {
        if (element == null) return "Steadfast";
        return switch (element) {
            case FIRE -> "Cinder";
            case ICE -> "Rime";
            case WIND -> "Gale";
            case EARTH -> "Rooted";
            case WATER -> "Tidal";
            case ELECTRIC -> "Storm";
            case LIGHT -> "Radiant";
            case SHADOW -> "Umbral";
            case PSYCHIC -> "Mind";
            case METAL -> "Iron";
            case POISON -> "Venom";
            case UNDEAD -> "Grave";
            default -> "Steadfast";
        };
    }

    // ── Expedition routes ────────────────────────────────────────────────────

    public enum RouteType { PATROL, HUNT, RESOURCE, DUNGEON }

    public record Loot(String item, int min, int max, double chance) {}

    public record Route(String id, String name, String region, RouteType type, Element element, int tier,
                        int minutes, int encounters, int levelMin, int levelMax, int groupMin, int groupMax,
                        int rankReq, double sightingChance, List<Loot> loot, String hazard, String hazardText,
                        String bossId, int bossLevel, Req hiddenRoomReq, String blurb) {}

    private static Route route(String id, String name, String region, RouteType type, Element element,
                               int minutes, int encounters, int levelMin, int levelMax, int groupMin, int groupMax,
                               int rankReq, double sighting, List<Loot> loot, String blurb) {
        return new Route(id, name, region, type, element, 1, minutes, encounters, levelMin, levelMax,
                groupMin, groupMax, rankReq, sighting, loot, null, null, null, 0, null, blurb);
    }

    public static final Map<String, Route> ROUTES = ordered(List.of(
            route("mossroot_patrol", "Mossroot Patrol", "Mossroot Wilds", RouteType.PATROL, Element.EARTH,
                    15, 4, 1, 2, 1, 1, 1, 0.12,
                    List.of(new Loot("sunleaf", 1, 3, 0.7), new Loot("pine_log", 1, 2, 0.5)),
                    "Gentle woodland paths. A safe first outing."),
            route("galeward_patrol", "Galeward Patrol", "Galeward Heights", RouteType.PATROL, Element.WIND,
                    20, 4, 2, 5, 1, 2, 1, 0.12,
                    List.of(new Loot("pine_log", 1, 3, 0.6), new Loot("galeberry", 1, 2, 0.25)),
                    "Windswept ridges where swift Siegelings roam."),
            route("mossroot_hunt", "Mossroot Hunt", "Mossroot Wilds", RouteType.HUNT, Element.EARTH,
                    40, 7, 3, 7, 1, 2, 2, 0.28,
                    List.of(new Loot("copper_ore", 1, 3, 0.5), new Loot("oak_log", 1, 2, 0.35)),
                    "Track wild Earth Siegelings through the deep wood. Good for taming."),
            route("galeward_hunt", "Galeward Hunt", "Galeward Heights", RouteType.HUNT, Element.WIND,
                    45, 8, 4, 8, 2, 2, 3, 0.28,
                    List.of(new Loot("galeberry", 1, 3, 0.45), new Loot("gale_feather", 1, 1, 0.2)),
                    "Chase the high flyers. Good for taming."),
            route("frostfen_patrol", "Frostfen Patrol", "Frostfen", RouteType.PATROL, Element.ICE,
                    25, 5, 5, 9, 1, 2, 3, 0.12,
                    List.of(new Loot("frostbloom", 1, 2, 0.5), new Loot("minnow", 1, 3, 0.5)),
                    "Frozen marsh. Fire Siegelings shine here."),
            route("deepvein_survey", "Deepvein Survey", "Mossroot Quarry", RouteType.RESOURCE, Element.EARTH,
                    120, 5, 5, 9, 1, 2, 4, 0.05,
                    List.of(new Loot("copper_ore", 6, 12, 1.0), new Loot("iron_ore", 3, 8, 0.9),
                            new Loot("oak_log", 3, 6, 0.8)),
                    "A long haul through old mine tunnels. Few fights, big hauls."),
            route("frostfen_hunt", "Frostfen Hunt", "Frostfen", RouteType.HUNT, Element.ICE,
                    50, 8, 7, 11, 2, 3, 5, 0.28,
                    List.of(new Loot("frostbloom", 1, 3, 0.5), new Loot("frost_crystal", 1, 1, 0.15)),
                    "Hunt the fen's Ice Siegelings. Good for taming."),
            route("ember_patrol", "Ember Crags Patrol", "Ember Crags", RouteType.PATROL, Element.FIRE,
                    30, 5, 8, 12, 2, 2, 5, 0.12,
                    List.of(new Loot("copper_ore", 1, 3, 0.5), new Loot("ember_shard", 1, 1, 0.2)),
                    "Volcanic slopes. Bring Water or Earth."),
            route("ember_hunt", "Ember Crags Hunt", "Ember Crags", RouteType.HUNT, Element.FIRE,
                    60, 9, 10, 14, 2, 3, 6, 0.28,
                    List.of(new Loot("ember_shard", 1, 2, 0.35), new Loot("iron_ore", 1, 3, 0.5)),
                    "Stalk Fire Siegelings across the lava fields. Good for taming."),
            new Route("cinder_hollow", "Cinder Hollow", "Ember Crags", RouteType.DUNGEON, Element.FIRE, 1,
                    60, 7, 11, 15, 2, 3, 7, 0.10,
                    List.of(new Loot("ember_shard", 2, 4, 0.8), new Loot("iron_ore", 2, 5, 0.8),
                            new Loot("ancient_relic", 1, 1, 0.35)),
                    "heat", "Volcanic heat scorches the company for 6% health before each battle. "
                    + "Ice Siegelings, a Frostbloom Remedy, heat-warded armor or an Emberward Charm cut it.",
                    "solgator", 16, null,
                    "A volcanic dungeon. Lingering heat wears the company down before the Solgator at its heart."),
            new Route("old_rootcrypt", "Old Rootcrypt", "Mossroot Deeps", RouteType.DUNGEON, Element.EARTH, 1,
                    90, 9, 14, 19, 3, 3, 10, 0.10,
                    List.of(new Loot("heartwood", 1, 3, 0.8), new Loot("iron_ore", 3, 6, 0.8),
                            new Loot("ancient_relic", 1, 2, 0.5)),
                    "maze", "Root-choked halls. Knights with Foraging 20 find the hidden root cellar.",
                    "generoot", 20, skill("foraging", 20),
                    "An ancient forest crypt. Patience and woodcraft reveal its secrets.")
    ), Route::id);

    // ── helpers ──────────────────────────────────────────────────────────────

    private static <T> Map<String, T> ordered(List<T> values, java.util.function.Function<T, String> key) {
        Map<String, T> map = new LinkedHashMap<>();
        for (T value : values) map.put(key.apply(value), value);
        return Collections.unmodifiableMap(map);
    }
}
