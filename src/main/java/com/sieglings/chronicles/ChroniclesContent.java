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
            new Skill("woodcutting", "Woodcutting", "Gathering", "Timber for planks, tools and bows.", List.of()),
            new Skill("foraging", "Foraging", "Gathering", "Herbs, berries and flax.", List.of()),
            new Skill("fishing", "Fishing", "Gathering", "Fish for cooking. Needs a rod from the carpenter.",
                    List.of(skill("carpentry", 3))),
            new Skill("excavation", "Excavation", "Gathering", "Dig for fossils, rune stones and relic shards.",
                    List.of(skill("mining", 10))),
            new Skill("smelting", "Smelting", "Production", "Turn ore into bars.",
                    List.of(skill("mining", 5))),
            new Skill("smithing", "Smithing", "Production", "Forge weapons, armor and relics.",
                    List.of(skill("smelting", 10))),
            new Skill("carpentry", "Carpentry", "Production", "Planks, rods and snare crates.",
                    List.of(skill("woodcutting", 5))),
            new Skill("weaving", "Weaving", "Production", "Linen, rope, robes and taming nets.",
                    List.of(skill("foraging", 10))),
            new Skill("cooking", "Cooking", "Production", "Meals your Siegelings love. Treats build bond.",
                    List.of(skill("fishing", 3))),
            new Skill("alchemy", "Alchemy", "Production", "Potions for expeditions and lures for taming.",
                    List.of(skill("foraging", 8))),
            new Skill("runecrafting", "Runecrafting", "Production", "Runes that empower a whole expedition.",
                    List.of(skill("elemental_studies", 10), skill("smelting", 5))),
            new Skill("taming", "Taming", "Siegeling", "Befriend wild Siegelings spotted on expeditions.", List.of()),
            new Skill("bonding", "Bonding", "Siegeling", "Grows with every bond you build. Bonds grow faster.",
                    List.of(skill("taming", 3))),
            new Skill("husbandry", "Husbandry", "Siegeling", "Care between battles. Better rest, more treats.",
                    List.of(skill("bonding", 10), skill("cooking", 5))),
            new Skill("pathfinding", "Pathfinding", "Expedition", "Find faster roads. Expeditions take less time.",
                    List.of()),
            new Skill("survival", "Survival", "Expedition", "Endure hazards. Heat and wild lands hurt less.",
                    List.of(rank(3))),
            new Skill("cartography", "Cartography", "Expedition", "Map the wilds: better finds, hidden places.",
                    List.of(skill("pathfinding", 5))),
            new Skill("command", "Command", "Expedition", "Lead larger companies. Opens party slots.", List.of()),
            new Skill("elemental_studies", "Elemental Studies", "Knowledge",
                    "Study essences to deepen every elemental affinity.", List.of(rank(5))),
            new Skill("class_tactics", "Class Tactics", "Knowledge",
                    "How classes fight together. Faster commands; cross-class techniques.", List.of(skill("command", 5)))
    ), Skill::id);

    // Profession effects. Each returns a fraction; the snapshot shows them as text.
    public static double pathfindingCut(int level) { return Math.min(0.30, level * 0.004); }
    public static double survivalCut(int level) { return Math.min(0.60, level * 0.01); }
    public static double cartographyLoot(int level) { return level * 0.003; }
    public static double husbandryRest(int level) { return Math.min(0.20, level * 0.003); }
    public static double bondingBonus(int level) { return level * 0.01; }
    public static double studiesBonus(int level) { return level * 0.005; }
    public static double tacticsGauge(int level) { return level * 0.25; }
    public static int treatCap(int husbandry) {
        return DAILY_TREATS_PER_SIEGELING + (husbandry >= 10 ? 1 : 0) + (husbandry >= 30 ? 1 : 0) + (husbandry >= 60 ? 1 : 0);
    }
    /** Cross-class techniques also need this much Class Tactics. */
    public static final int CROSS_CLASS_TACTICS = 10;
    /** Cartography level that keeps the company from getting lost and the one that finds hidden rooms. */
    public static final int CARTOGRAPHY_NO_MAZE = 10;
    public static final int CARTOGRAPHY_HIDDEN_ROOM = 25;

    /** Command levels at which the company grows. */
    public static int partySlots(int commandLevel) {
        if (commandLevel >= 10) return 3;
        if (commandLevel >= 3) return 2;
        return 1;
    }

    public static final int RESERVE_COMMAND_LEVEL = 30;

    // ── Items ────────────────────────────────────────────────────────────────

    public enum ItemKind { MATERIAL, ESSENCE, POTION, LURE, FOOD, WEAPON, ARMOR, RELIC, RUNE, HELMET, BOOTS, ACCESSORY }

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

    private static Item gear(String id, String name, ItemKind kind, int tier, String blurb) {
        return new Item(id, name, kind, blurb, tier, 0, null, 0, 0, Set.of(), null, 0, false, null);
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
                material("ancient_relic", "Ancient Relic", "Found in dungeons, or pieced together from relic shards. Needed for final evolutions.", 4),
                material("fossil", "Fossil", "Old bones from the barrows. Runecrafters grind them for warding runes.", 1),
                material("relic_shard", "Relic Shard", "A fragment of something ancient. Five make an Ancient Relic.", 3),
                material("rune_stone", "Rune Stone", "Carved stone that holds an inscription.", 2),
                material("flax", "Flax", "Fibrous stalks for spinning.", 1),
                material("linen", "Linen", "Spun flax cloth.", 1),
                material("rope", "Rope", "Twisted flax.", 1),
                material("pine_plank", "Pine Plank", "Sawn pine.", 1),
                material("oak_plank", "Oak Plank", "Sawn oak.", 2),
                material("tide_pearl", "Tide Pearl", "Grown in Tidewater reefs.", 3),
                material("storm_glass", "Storm Glass", "Sand fused by Stormspire lightning.", 3),
                material("umbral_crystal", "Umbral Crystal", "Drinks light. Found in the Umbral Caves.", 4),
                material("mind_prism", "Mind Prism", "Holds a thought. Found in the Mirage Expanse.", 4),
                material("living_alloy", "Living Alloy", "Metal that remembers its shape. From the Forge Wastes.", 4),
                material("grave_dust", "Grave Dust", "From the Ashen Crypts. It will not stay still.", 4),
                potion("herb_tonic", "Herb Tonic", "Heals 35% of a Siegeling's health mid-battle.", 0.35, false),
                potion("frostbloom_remedy", "Frostbloom Remedy",
                        "Heals 50% and cools heat hazards for the whole company.", 0.50, true),
                lure("wild_bait", "Wild Bait", "A plain lure any Siegeling might follow.", null, 12),
                lure("ember_lure", "Ember Lure", "Smoked fish on pine. Fire Siegelings can't resist.", Element.FIRE, 30),
                lure("root_lure", "Root Lure", "Herbs bound to oak. Calms Earth Siegelings.", Element.EARTH, 30),
                lure("frost_lure", "Frost Lure", "A frostbloom-wrapped minnow for Ice Siegelings.", Element.ICE, 30),
                lure("gale_lure", "Gale Lure", "Galeberries strung on a feather for Wind Siegelings.", Element.WIND, 30),
                lure("snare_crate", "Snare Crate", "A sturdy crate trap. Works on anything, best on skittish Siegelings.", null, 18),
                lure("breezewoven_net", "Breezewoven Net", "Woven with gale feathers. Superb for swift Wind Siegelings.", Element.WIND, 42),
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
                weapon("pearl_staff", "Pearl Staff", "staff", 3, "Tide pearls on heartwood. Elemental advantage surges."),
                weapon("stormglass_hammer", "Stormglass Hammer", "hammer", 3, "Every blow cracks like thunder."),
                weapon("embersteel_lance", "Embersteel Lance", "spear", 3,
                        "Intercept also sears the attacker. Forged by Fire-attuned Guardian commanders."),
                armor("travelers_coat", "Traveler's Coat", 0, 1, false, "Keeps the rain off."),
                armor("copper_mail", "Copper Mail", 1, 4, false, "Light mail against expedition hazards."),
                armor("iron_mail", "Iron Mail", 2, 9, false, "Solid protection for dungeon work."),
                armor("frostweave_cloak", "Frostweave Cloak", 2, 6, true, "Frost crystals sewn into wool. Wards off heat."),
                armor("linen_robe", "Linen Robe", 1, 2, false, "A channeler's robe. Mage Siegelings deal 6% more damage."),
                armor("ember_robe", "Ember Robe", 2, 4, true, "Ember-thread robe. Mages deal 12% more damage; wards off heat."),
                armor("guardian_harness", "Guardian Harness", 2, 7, false, "Rope and plank bracing. Guardians gain 8% defense."),
                armor("tidewarden_cloak", "Tidewarden Cloak", 3, 8, false, "Pearl-weighted linen. Halves tide hazards."),
                armor("stormward_cloak", "Stormward Cloak", 3, 8, false, "Storm glass woven in. Halves storm hazards."),
                gear("copper_helm", "Copper Helm", ItemKind.HELMET, 1, "A sturdy helm: +2 armor against hazards."),
                gear("iron_helm", "Iron Helm", ItemKind.HELMET, 2, "+4 armor against hazards."),
                gear("stormglass_visor", "Stormglass Visor", ItemKind.HELMET, 3, "+5 armor; halves storm hazards."),
                gear("travel_boots", "Travel Boots", ItemKind.BOOTS, 1, "Expeditions 4% shorter."),
                gear("galeweave_boots", "Galeweave Boots", ItemKind.BOOTS, 2, "Expeditions 8% shorter; the company is 4% faster."),
                gear("tidewalker_boots", "Tidewalker Boots", ItemKind.BOOTS, 3, "Expeditions 8% shorter; halves tide hazards."),
                gear("mending_amulet", "Mending Amulet", ItemKind.ACCESSORY, 1, "The company recovers 4% more between battles."),
                gear("hunters_ring", "Hunter's Ring", ItemKind.ACCESSORY, 2, "The company lands critical hits 5% more often."),
                gear("prism_pendant", "Prism Pendant", ItemKind.ACCESSORY, 3, "The command gauge fills 15% faster."),
                weapon("siegeforged_blade", "Siegeforged Blade", "sword", 4, "A grandmaster's sword. Rally Strike at its finest."),
                weapon("grandbow", "Heartwood Grandbow", "bow", 4, "A grandmaster carpenter's bow."),
                armor("grandmasters_mantle", "Grandmaster's Mantle", 4, 14, true,
                        "Woven by a grandmaster: wards heat, tide, storm and forge alike."),
                relic("runeheart", "Runeheart", "runeheart", true,
                        "A grandmaster's rune core: the command gauge fills 25% faster and heat is warded."),
                relic("dawn_lantern", "Dawn Lantern", "ward:ambush", false,
                        "Holds back the dark: wards off ambushes and an enemy's radiance."),
                relic("clarity_charm", "Clarity Charm", "ward:mirage", false, "Sees through mirages."),
                relic("alloy_breaker", "Alloy Breaker", "ward:plated", false, "Unmakes living metal: plated foes lose their plating."),
                relic("grave_ward", "Grave Ward", "ward:risen", false, "The dead stay down; blight cannot take root."),
                new Item("rune_warding", "Rune of Warding", ItemKind.RUNE, "The whole company gains 6% defense for one expedition.", 1,
                        0, null, 0, 0, Set.of(), null, 0, false, null),
                new Item("rune_embers", "Rune of Embers", ItemKind.RUNE, "Fire Siegelings deal 12% more damage for one expedition.", 2,
                        0, null, 0, 0, Set.of(), null, 0, false, null),
                new Item("rune_stone_skin", "Rune of Stoneskin", ItemKind.RUNE, "Earth Siegelings gain 14% health for one expedition.", 2,
                        0, null, 0, 0, Set.of(), null, 0, false, null),
                new Item("rune_frost", "Rune of Frost", ItemKind.RUNE, "Ice Siegelings gain 12% defense for one expedition.", 2,
                        0, null, 0, 0, Set.of(), null, 0, false, null),
                new Item("rune_gales", "Rune of Gales", ItemKind.RUNE, "Wind Siegelings gain 12% speed for one expedition.", 2,
                        0, null, 0, 0, Set.of(), null, 0, false, null),
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

    /** What a rune does for the expedition it is carried on; null element means the whole company. */
    public record RuneEffect(Element element, Mods mods) {}

    public static final Map<String, RuneEffect> RUNE_EFFECTS = Map.of(
            "rune_warding", new RuneEffect(null, Mods.def(0.06)),
            "rune_embers", new RuneEffect(Element.FIRE, Mods.atk(0.12)),
            "rune_stone_skin", new RuneEffect(Element.EARTH, Mods.hp(0.14)),
            "rune_frost", new RuneEffect(Element.ICE, Mods.def(0.12)),
            "rune_gales", new RuneEffect(Element.WIND, Mods.spd(0.12)));

    /** Armor that strengthens one class of Siegeling in the company. */
    public record ClassBoost(String creatureClass, Mods mods) {}

    public static final Map<String, ClassBoost> ARMOR_BOOSTS = Map.of(
            "linen_robe", new ClassBoost("Mage", Mods.atk(0.06)),
            "ember_robe", new ClassBoost("Mage", Mods.atk(0.12)),
            "guardian_harness", new ClassBoost("Guardian", Mods.def(0.08)));

    /** Gear that halves one region hazard (heat keeps its own flag on the Item). */
    public static final Map<String, Set<String>> HAZARD_WARD_ITEMS = Map.of(
            "tidewarden_cloak", Set.of("tide"),
            "stormward_cloak", Set.of("storm"),
            "frostweave_cloak", Set.of("forge"),
            "stormglass_visor", Set.of("storm"),
            "tidewalker_boots", Set.of("tide"),
            "grandmasters_mantle", Set.of("heat", "tide", "storm", "forge"));

    /** What the helmet, boots and accessory slots add. */
    public record GearBonus(int armor, double roadCut, double speed, double crit, double rest, double gauge) {}

    public static final Map<String, GearBonus> GEAR_BONUSES = Map.of(
            "copper_helm", new GearBonus(2, 0, 0, 0, 0, 0),
            "iron_helm", new GearBonus(4, 0, 0, 0, 0, 0),
            "stormglass_visor", new GearBonus(5, 0, 0, 0, 0, 0),
            "travel_boots", new GearBonus(0, 0.04, 0, 0, 0, 0),
            "galeweave_boots", new GearBonus(0, 0.08, 0.04, 0, 0, 0),
            "tidewalker_boots", new GearBonus(0, 0.08, 0, 0, 0, 0),
            "mending_amulet", new GearBonus(0, 0, 0, 0, 0.04, 0),
            "hunters_ring", new GearBonus(0, 0, 0, 0.05, 0, 0),
            "prism_pendant", new GearBonus(0, 0, 0, 0, 0, 0.15));

    // ── Endgame ──────────────────────────────────────────────────────────────

    /** A profession at this level is mastered: a title, and its own actions run faster. */
    public static final int GRANDMASTER = 100;
    public static final double GRANDMASTER_SPEED = 0.20;
    /** Bond needed to attempt a Legendary Bond Trial, and what a Legend gains. */
    public static final int LEGEND_BOND = 100;
    public static final double LEGEND_STATS = 0.05;
    public static final int TRIAL_MINUTES = 60;

    public static String grandmasterTitle(String skillId) {
        return switch (skillId) {
            case "mining" -> "Grandmaster Miner";
            case "woodcutting" -> "Grandmaster Woodcutter";
            case "foraging" -> "Grandmaster Forager";
            case "fishing" -> "Grandmaster Angler";
            case "excavation" -> "Grandmaster Excavator";
            case "smelting" -> "Grandmaster Smelter";
            case "smithing" -> "Grandmaster Smith";
            case "carpentry" -> "Grandmaster Carpenter";
            case "weaving" -> "Grandmaster Weaver";
            case "cooking" -> "Grandmaster Chef";
            case "alchemy" -> "Grandmaster Alchemist";
            case "runecrafting" -> "Grandmaster Runesmith";
            case "taming" -> "Grandmaster Tamer";
            case "bonding" -> "Grandmaster of Bonds";
            case "husbandry" -> "Grandmaster Keeper";
            case "pathfinding" -> "Grandmaster Pathfinder";
            case "survival" -> "Grandmaster Survivor";
            case "cartography" -> "Grandmaster Cartographer";
            case "command" -> "Grand Commander";
            case "elemental_studies" -> "Grandmaster Scholar";
            case "class_tactics" -> "Grandmaster Tactician";
            default -> "Grandmaster";
        };
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
            new Activity("forage_flax", "foraging", "Flax Field", "Mossroot Wilds", 5, 10, 7,
                    "flax", null, 0, Set.of(Element.WIND, Element.EARTH)),
            new Activity("dig_barrows", "excavation", "Mossroot Barrows", "Mossroot Wilds", 1, 12, 9,
                    "fossil", "relic_shard", 10, Set.of(Element.EARTH, Element.METAL)),
            new Activity("dig_ember_ruins", "excavation", "Ember Ruins", "Ember Crags", 15, 16, 20,
                    "rune_stone", "relic_shard", 6, Set.of(Element.EARTH, Element.FIRE)),
            new Activity("dig_frozen_vault", "excavation", "Frozen Vault", "Frostfen", 30, 20, 34,
                    "rune_stone", "ancient_relic", 40, Set.of(Element.ICE, Element.METAL)),
            new Activity("fish_coral", "fishing", "Coral Shallows", "Tidewater Coast", 25, 16, 30,
                    "silverfin", "tide_pearl", 6, Set.of(Element.WATER, Element.ICE)),
            new Activity("mine_stormglass", "mining", "Stormglass Vein", "Stormspire Peaks", 35, 20, 40,
                    "iron_ore", "storm_glass", 5, Set.of(Element.METAL, Element.ELECTRIC)),
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
    /**
     * {@code studyElement} marks a study session: it makes no item and instead teaches
     * that element's affinity ({@link #STUDY_AFFINITY_XP} per session).
     */
    public record Recipe(String id, String skillId, String output, int outputQty, int level, List<Req> extraReqs,
                         Map<String, Integer> inputs, int actionSeconds, int xp, boolean repeatable,
                         Set<Element> helperElements, Element studyElement) {
        public boolean isStudy() { return studyElement != null; }
    }

    public static final int STUDY_AFFINITY_XP = 8;

    private static Recipe repeatable(String id, String skillId, String output, int level, List<Req> extra,
                                     Map<String, Integer> inputs, int seconds, int xp, Set<Element> helpers) {
        return new Recipe(id, skillId, output, 1, level, extra, inputs, seconds, xp, true, helpers, null);
    }

    private static Recipe forge(String id, String output, int level, List<Req> extra,
                                Map<String, Integer> inputs, int xp) {
        return craftOnce(id, "smithing", output, level, extra, inputs, xp);
    }

    private static Recipe craftOnce(String id, String skillId, String output, int level, List<Req> extra,
                                    Map<String, Integer> inputs, int xp) {
        return new Recipe(id, skillId, output, 1, level, extra, inputs, 0, xp, false, Set.of(), null);
    }

    private static Recipe study(Element element) {
        String key = element.name().toLowerCase();
        return new Recipe("study_" + key, "elemental_studies", null, 0, 1, List.of(),
                Map.of(essenceId(element), 1), 12, 10, true,
                element == Element.PSYCHIC ? Set.of(element) : Set.of(Element.PSYCHIC, element), element);
    }

    private static final Set<Element> FORGE_HELPERS = Set.of(Element.FIRE, Element.METAL);
    private static final Set<Element> ALCHEMY_HELPERS = Set.of(Element.WATER, Element.POISON, Element.PSYCHIC);
    private static final Set<Element> KITCHEN_HELPERS = Set.of(Element.FIRE, Element.WATER);
    private static final Set<Element> WORKSHOP_HELPERS = Set.of(Element.EARTH, Element.METAL);
    private static final Set<Element> LOOM_HELPERS = Set.of(Element.WIND, Element.POISON);
    private static final Set<Element> RUNE_HELPERS = Set.of(Element.PSYCHIC, Element.LIGHT, Element.SHADOW);

    public static final Map<String, Recipe> RECIPES = ordered(List.of(
            repeatable("smelt_copper", "smelting", "copper_bar", 1, List.of(),
                    Map.of("copper_ore", 2), 10, 8, FORGE_HELPERS),
            repeatable("smelt_iron", "smelting", "iron_bar", 10, List.of(),
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
                    List.of(mastery("Guardian", 30), affinity(Element.EARTH, 25), skill("runecrafting", 25)),
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
                    Map.of("galeberry", 2, "sunleaf", 1), 14, 22, KITCHEN_HELPERS),
            repeatable("saw_pine_plank", "carpentry", "pine_plank", 1, List.of(),
                    Map.of("pine_log", 2), 10, 7, WORKSHOP_HELPERS),
            repeatable("saw_oak_plank", "carpentry", "oak_plank", 10, List.of(),
                    Map.of("oak_log", 2), 12, 14, WORKSHOP_HELPERS),
            repeatable("build_snare_crate", "carpentry", "snare_crate", 8, List.of(skill("weaving", 3)),
                    Map.of("oak_plank", 2, "rope", 1), 14, 18, WORKSHOP_HELPERS),
            craftOnce("build_guardian_harness", "carpentry", "guardian_harness", 18, List.of(mastery("Guardian", 10)),
                    Map.of("oak_plank", 6, "rope", 4, "iron_bar", 2), 160),
            repeatable("spin_linen", "weaving", "linen", 1, List.of(),
                    Map.of("flax", 3), 10, 7, LOOM_HELPERS),
            repeatable("twist_rope", "weaving", "rope", 3, List.of(),
                    Map.of("flax", 2), 10, 8, LOOM_HELPERS),
            craftOnce("sew_linen_robe", "weaving", "linen_robe", 6, List.of(),
                    Map.of("linen", 6, "sunleaf", 2), 70),
            repeatable("weave_breezewoven_net", "weaving", "breezewoven_net", 12,
                    List.of(skill("taming", 10), affinity(Element.WIND, 15)),
                    Map.of("rope", 2, "gale_feather", 2), 16, 26, LOOM_HELPERS),
            craftOnce("sew_ember_robe", "weaving", "ember_robe", 20, List.of(affinity(Element.FIRE, 15)),
                    Map.of("linen", 8, "ember_shard", 4, "essence_fire", 6), 220),
            repeatable("inscribe_warding", "runecrafting", "rune_warding", 1, List.of(),
                    Map.of("rune_stone", 1, "fossil", 2), 14, 14, RUNE_HELPERS),
            repeatable("inscribe_embers", "runecrafting", "rune_embers", 10, List.of(affinity(Element.FIRE, 10)),
                    Map.of("rune_stone", 1, "essence_fire", 2), 16, 22, RUNE_HELPERS),
            repeatable("inscribe_stoneskin", "runecrafting", "rune_stone_skin", 10, List.of(affinity(Element.EARTH, 10)),
                    Map.of("rune_stone", 1, "essence_earth", 2), 16, 22, RUNE_HELPERS),
            repeatable("inscribe_frost", "runecrafting", "rune_frost", 10, List.of(affinity(Element.ICE, 10)),
                    Map.of("rune_stone", 1, "essence_ice", 2), 16, 22, RUNE_HELPERS),
            repeatable("inscribe_gales", "runecrafting", "rune_gales", 10, List.of(affinity(Element.WIND, 10)),
                    Map.of("rune_stone", 1, "essence_wind", 2), 16, 22, RUNE_HELPERS),
            repeatable("restore_ancient_relic", "runecrafting", "ancient_relic", 20, List.of(),
                    Map.of("relic_shard", 5, "rune_stone", 1), 30, 60, RUNE_HELPERS),
            forge("forge_pearl_staff", "pearl_staff", 30, List.of(affinity(Element.WATER, 20)),
                    Map.of("tide_pearl", 4, "heartwood", 3, "iron_bar", 4), 320),
            forge("forge_stormglass_hammer", "stormglass_hammer", 35, List.of(affinity(Element.ELECTRIC, 20)),
                    Map.of("storm_glass", 6, "iron_bar", 6, "oak_plank", 2), 360),
            craftOnce("sew_tidewarden_cloak", "weaving", "tidewarden_cloak", 28, List.of(),
                    Map.of("tide_pearl", 4, "linen", 10, "rope", 4), 300),
            craftOnce("sew_stormward_cloak", "weaving", "stormward_cloak", 30, List.of(),
                    Map.of("storm_glass", 4, "linen", 12, "rope", 4), 320),
            craftOnce("inscribe_dawn_lantern", "runecrafting", "dawn_lantern", 30, List.of(),
                    Map.of("umbral_crystal", 4, "rune_stone", 2, "copper_bar", 4), 380),
            craftOnce("inscribe_clarity_charm", "runecrafting", "clarity_charm", 30, List.of(),
                    Map.of("mind_prism", 4, "rune_stone", 2, "linen", 4), 380),
            craftOnce("inscribe_alloy_breaker", "runecrafting", "alloy_breaker", 32, List.of(),
                    Map.of("living_alloy", 4, "rune_stone", 2, "iron_bar", 4), 400),
            craftOnce("inscribe_grave_ward", "runecrafting", "grave_ward", 32, List.of(),
                    Map.of("grave_dust", 4, "rune_stone", 2, "fossil", 6), 400),
            forge("forge_copper_helm", "copper_helm", 6, List.of(), Map.of("copper_bar", 4), 60),
            forge("forge_iron_helm", "iron_helm", 20, List.of(), Map.of("iron_bar", 5), 150),
            forge("forge_stormglass_visor", "stormglass_visor", 36, List.of(), Map.of("storm_glass", 4, "iron_bar", 4), 360),
            craftOnce("sew_travel_boots", "weaving", "travel_boots", 5, List.of(), Map.of("linen", 4, "rope", 2), 60),
            craftOnce("sew_galeweave_boots", "weaving", "galeweave_boots", 18, List.of(affinity(Element.WIND, 15)),
                    Map.of("linen", 8, "gale_feather", 4), 180),
            craftOnce("sew_tidewalker_boots", "weaving", "tidewalker_boots", 30, List.of(), Map.of("linen", 8, "tide_pearl", 3), 320),
            craftOnce("carve_mending_amulet", "carpentry", "mending_amulet", 8, List.of(skill("husbandry", 5)),
                    Map.of("oak_plank", 2, "herb_tonic", 4, "rope", 2), 90),
            craftOnce("inscribe_hunters_ring", "runecrafting", "hunters_ring", 18, List.of(),
                    Map.of("iron_bar", 3, "rune_stone", 2, "relic_shard", 2), 200),
            craftOnce("inscribe_prism_pendant", "runecrafting", "prism_pendant", 34, List.of(skill("class_tactics", 20)),
                    Map.of("mind_prism", 3, "rune_stone", 3, "iron_bar", 2), 400),
            forge("forge_siegeforged_blade", "siegeforged_blade", GRANDMASTER, List.of(),
                    Map.of("iron_bar", 20, "ancient_relic", 4, "living_alloy", 4, "storm_glass", 4), 2000),
            craftOnce("carve_grandbow", "carpentry", "grandbow", GRANDMASTER, List.of(),
                    Map.of("heartwood", 12, "rope", 10, "ancient_relic", 3, "gale_feather", 8), 2000),
            craftOnce("weave_grandmasters_mantle", "weaving", "grandmasters_mantle", GRANDMASTER, List.of(),
                    Map.of("linen", 40, "tide_pearl", 6, "storm_glass", 6, "frost_crystal", 6, "ancient_relic", 3), 2000),
            craftOnce("inscribe_runeheart", "runecrafting", "runeheart", GRANDMASTER, List.of(),
                    Map.of("rune_stone", 12, "umbral_crystal", 4, "mind_prism", 4, "grave_dust", 4, "ancient_relic", 4), 2000),
            study(Element.FIRE), study(Element.ICE), study(Element.WIND), study(Element.EARTH),
            study(Element.WATER), study(Element.ELECTRIC), study(Element.LIGHT), study(Element.SHADOW),
            study(Element.PSYCHIC), study(Element.METAL), study(Element.POISON), study(Element.UNDEAD)
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

    // ── Affinity milestones beyond Familiarity ───────────────────────────────

    public static final int ATTUNEMENT = 25;
    public static final int RESONANCE = 50;
    public static final int CONVERGENCE = 75;
    public static final int ASCENDANCE = 100;
    /** Resonance makes the prepared technique company-wide and this much stronger. */
    public static final double RESONANCE_SCALE = 1.5;
    public static final double ATTUNED_HAZARD = 0.5;
    public static final double ATTUNED_LOOT = 0.25;
    public static final double ATTUNED_TAMING = 0.05;

    /**
     * Battle-wide effects that are not stat changes. Combos and signatures fill these
     * in; the simulator reads them each round.
     */
    public record Arcana(double allyDamageCut, double advantageShield, double enemyDotPct, double roundHealPct,
                         double enemySkipChance, double assassinAtk) {
        public static final Arcana NONE = new Arcana(0, 0, 0, 0, 0, 0);

        public Arcana plus(Arcana o) {
            return new Arcana(allyDamageCut + o.allyDamageCut, advantageShield + o.advantageShield,
                    enemyDotPct + o.enemyDotPct, roundHealPct + o.roundHealPct,
                    enemySkipChance + o.enemySkipChance, assassinAtk + o.assassinAtk);
        }
    }

    /** Cross-element combinations from the design (Convergence, both elements at 75). */
    public record Combo(String id, Element a, Element b, String name, String text, Mods mods, Arcana arcana) {}

    public static final Map<String, Combo> COMBOS = ordered(List.of(
            new Combo("steam_veil", Element.FIRE, Element.WATER, "Steam Veil",
                    "Burning enemies release steam that hides your company: it takes 15% less damage.",
                    Mods.NONE, new Arcana(0.15, 0, 0, 0, 0, 0)),
            new Combo("thunderglass", Element.ELECTRIC, Element.EARTH, "Thunderglass",
                    "Elemental advantage hardens into mineral barriers: an advantaged hit shields its attacker for 8% health.",
                    Mods.NONE, new Arcana(0, 0.08, 0, 0, 0, 0)),
            new Combo("frozen_tempest", Element.ICE, Element.WIND, "Frozen Tempest",
                    "Enemies are 15% slower and swift Assassins deal 20% more damage.",
                    new Mods(0, 0, 0, 0, 0, 0, -0.15, 0, 0, 0), new Arcana(0, 0, 0, 0, 0, 0.20)),
            new Combo("toxic_bloom", Element.POISON, Element.EARTH, "Toxic Bloom",
                    "Poison spreads through rooted enemies: every enemy loses 4% health each round.",
                    Mods.NONE, new Arcana(0, 0, 0.04, 0, 0, 0)),
            new Combo("dawnfire", Element.FIRE, Element.LIGHT, "Dawnfire",
                    "Offense with protective radiance: +10% attack, and the most wounded ally recovers 3% each round.",
                    Mods.atk(0.10), new Arcana(0, 0, 0, 0.03, 0, 0)),
            new Combo("eclipse_binding", Element.SHADOW, Element.PSYCHIC, "Eclipse Binding",
                    "Disrupts ability cycles: enemies lose one turn in five.",
                    Mods.NONE, new Arcana(0, 0, 0, 0, 0.20, 0))
    ), Combo::id);

    public enum SignatureKind { BURST, SANCTUARY, CONTROL }

    /**
     * Ascendance (affinity 100) signature abilities, named in the design. Each fires once
     * per expedition at the start of the hardest battle when that element's technique is
     * prepared and the element is in the company.
     */
    public record Signature(Element element, String name, SignatureKind kind, String text) {}

    public static final Map<Element, Signature> SIGNATURES;

    static {
        Map<Element, Signature> map = new EnumMap<>(Element.class);
        String burst = "Once per expedition, every enemy in the hardest battle loses a quarter of its health as it begins.";
        String sanctuary = "Once per expedition, the company recovers 40% health and gains a 15% barrier before the hardest battle.";
        String control = "Once per expedition, enemies in the hardest battle lose their whole first round.";
        for (Element e : ELEMENTS) {
            Technique t = TECHNIQUES.get("tech_" + e.name().toLowerCase());
            SignatureKind kind = switch (e) {
                case FIRE, ELECTRIC, SHADOW, POISON -> SignatureKind.BURST;
                case WATER, LIGHT, EARTH, UNDEAD, METAL -> SignatureKind.SANCTUARY;
                default -> SignatureKind.CONTROL;
            };
            String text = kind == SignatureKind.BURST ? burst : kind == SignatureKind.SANCTUARY ? sanctuary : control;
            map.put(e, new Signature(e, t.mastery(), kind, text));
        }
        SIGNATURES = Collections.unmodifiableMap(map);
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

    // ── Home base ────────────────────────────────────────────────────────────

    public static final int MAX_BUILDING_LEVEL = 5;
    /** Siegeknight rank needed for each building level (index = level - 1). */
    public static final int[] BUILDING_RANK = {2, 6, 12, 20, 30};

    public record Building(String id, String name, String blurb, List<Map<String, Integer>> costs) {}

    private static Building building(String id, String name, String blurb, List<Map<String, Integer>> costs) {
        return new Building(id, name, blurb, costs);
    }

    /**
     * The design's six base buildings. Each level draws on several professions, so a
     * knight who only mines cannot raise the base alone.
     */
    public static final Map<String, Building> BUILDINGS = ordered(List.of(
            building("sanctuary", "Siegeling Sanctuary", "Rest and care for companions. More room; resting Siegelings grow their bond.",
                    List.of(Map.of("pine_plank", 8, "linen", 4, "sunleaf", 12),
                            Map.of("pine_plank", 16, "linen", 10, "grilled_minnow", 6),
                            Map.of("oak_plank", 18, "rope", 12, "sunleaf_salad", 8, "copper_bar", 10),
                            Map.of("oak_plank", 30, "linen", 24, "silverfin_stew", 10, "iron_bar", 12),
                            Map.of("heartwood", 12, "linen", 40, "berry_tart", 16, "ancient_relic", 2))),
            building("forge", "Knight's Forge", "A proper forge. Smelting, Smithing and Carpentry work faster.",
                    List.of(Map.of("copper_bar", 8, "pine_plank", 6, "fossil", 4),
                            Map.of("copper_bar", 16, "oak_plank", 8, "rune_stone", 2),
                            Map.of("iron_bar", 14, "oak_plank", 14, "ember_shard", 4),
                            Map.of("iron_bar", 28, "heartwood", 6, "ember_shard", 10),
                            Map.of("iron_bar", 45, "heartwood", 12, "frost_crystal", 10, "ancient_relic", 2))),
            building("garden", "Alchemy Garden", "Beds of herbs and flax that grow while you are away. Alchemy and Cooking work faster.",
                    List.of(Map.of("pine_plank", 6, "sunleaf", 20, "fossil", 2),
                            Map.of("pine_plank", 12, "frostbloom", 10, "rope", 6),
                            Map.of("oak_plank", 14, "galeberry", 14, "herb_tonic", 10),
                            Map.of("oak_plank", 24, "frostbloom", 24, "iron_bar", 8),
                            Map.of("heartwood", 10, "galeberry", 40, "frostbloom_remedy", 12, "ancient_relic", 1))),
            building("war_room", "War Room", "Plan campaigns. Saved loadouts, and the command gauge starts charged.",
                    List.of(Map.of("pine_plank", 10, "copper_bar", 6, "linen", 4),
                            Map.of("oak_plank", 10, "copper_bar", 12, "rope", 6),
                            Map.of("oak_plank", 18, "iron_bar", 10, "rune_stone", 4),
                            Map.of("heartwood", 6, "iron_bar", 20, "rune_stone", 8),
                            Map.of("heartwood", 12, "iron_bar", 32, "ancient_relic", 3))),
            building("stable", "Expedition Stable", "Pack animals and supply racks. Carry more potions; the company rests better on the road.",
                    List.of(Map.of("pine_plank", 10, "rope", 4, "minnow", 10),
                            Map.of("oak_plank", 10, "rope", 10, "herb_tonic", 6),
                            Map.of("oak_plank", 20, "rope", 16, "iron_bar", 6),
                            Map.of("heartwood", 6, "rope", 24, "iron_bar", 14),
                            Map.of("heartwood", 12, "rope", 36, "silverfin_stew", 12, "ancient_relic", 1))),
            building("library", "Research Library", "Records of every discovery. Longer offline progress (up to 24h), faster studies, faster affinity.",
                    List.of(Map.of("pine_plank", 10, "linen", 6, "fossil", 6),
                            Map.of("oak_plank", 10, "linen", 12, "rune_stone", 3),
                            Map.of("oak_plank", 18, "linen", 20, "relic_shard", 4),
                            Map.of("heartwood", 8, "linen", 30, "relic_shard", 8),
                            Map.of("heartwood", 14, "linen", 44, "ancient_relic", 3)))
    ), Building::id);

    public static int rosterCap(int sanctuary) { return ROSTER_CAP + 3 * sanctuary; }
    /** Bond points per hour for each resting Siegeling. */
    public static double sanctuaryBondPerHour(int sanctuary) { return 6.0 * sanctuary; }
    public static double workshopSpeed(int level) { return Math.min(0.30, 0.06 * level); }
    public static int supplyCap(int stable) { return 20 + 4 * stable; }
    public static double stableRest(int stable) { return 0.02 * stable; }
    public static long offlineCapMs(int library) { return OFFLINE_CAP_MS + Math.round(library * 2.4 * 3_600_000L); }
    public static double libraryAffinity(int library) { return 0.02 * library; }
    public static int loadoutSlots(int warRoom) { return warRoom; }
    public static double warRoomGauge(int warRoom) { return 10.0 * warRoom; }

    /** Items the garden grows per hour at a level (each entry needs the listed level). */
    public static Map<String, Double> gardenYield(int level) {
        Map<String, Double> out = new LinkedHashMap<>();
        if (level <= 0) return out;
        out.put("sunleaf", 6.0 * level);
        out.put("flax", 4.0 * level);
        if (level >= 2) out.put("frostbloom", 2.0 * (level - 1));
        if (level >= 3) out.put("galeberry", 2.0 * (level - 2));
        return out;
    }

    // ── The realm: crowns, guilds, Siege Operations, marketplace ─────────────

    /** Crowns earned per enemy level in a won battle. Chronicles' own currency, kept apart from Siegecoins. */
    public static final int CROWNS_PER_LEVEL = 2;
    public static final int GUILD_RANK = 10;
    public static final int GUILD_MAX_MEMBERS = 20;
    public static final double MARKET_FEE = 0.05;
    public static final int MARKET_MAX_LISTINGS = 10;
    public static final long MARKET_MAX_PRICE = 1_000_000L;
    /** Item kinds that may be sold. Siegelings are never tradeable: their worth is their history. */
    public static final Set<ItemKind> TRADEABLE = Set.of(ItemKind.MATERIAL, ItemKind.ESSENCE, ItemKind.POTION,
            ItemKind.LURE, ItemKind.FOOD, ItemKind.RUNE, ItemKind.WEAPON, ItemKind.ARMOR, ItemKind.RELIC,
            ItemKind.HELMET, ItemKind.BOOTS, ItemKind.ACCESSORY);

    public record Threat(String id, String name, Element element, String blurb) {}

    /** One threat a week, in rotation. */
    public static final List<Threat> THREATS = List.of(
            new Threat("cinder_legion", "The Cinder Legion", Element.FIRE, "A host of Fire Siegelings marches on the Inner Wilds."),
            new Threat("frostbound_host", "The Frostbound Host", Element.ICE, "The fen freezes over as an Ice host advances."),
            new Threat("stormbreak_raiders", "Stormbreak Raiders", Element.ELECTRIC, "Raiders ride the lightning down from Stormspire."),
            new Threat("ashen_horde", "The Ashen Horde", Element.UNDEAD, "The crypts empty. The dead march together."),
            new Threat("tidal_armada", "The Tidal Armada", Element.WATER, "A flood of Water Siegelings breaks on the coast."),
            new Threat("umbral_court", "The Umbral Court", Element.SHADOW, "Shadow lords gather beneath the caves."));

    /**
     * Operation strength: per member (at least three), scaled by the guild's average rank,
     * because a sortie's score grows with the company's level. About a sortie a day per
     * knight breaks a threat at any stage of the game.
     */
    public static long threatHp(int members, double averageRank) {
        long perMember = Math.max(1000L, Math.round(150 * averageRank));
        return perMember * Math.max(3, members);
    }

    public record Front(String id, String name, String text, Set<String> favoredClasses, Set<Element> favoredElements) {}

    public static final Map<String, Front> FRONTS = ordered(List.of(
            new Front("assault", "Assault", "Strike the main force. Bruisers and Mages hit hardest here.",
                    Set.of("Bruiser", "Mage"), Set.of()),
            new Front("supply", "Supply Line", "Hold the supply line. Guardians and Supports keep it open.",
                    Set.of("Guardian", "Support"), Set.of()),
            new Front("scouting", "Scouting", "Scout the threat's flanks. Assassins and Wind Siegelings range farthest.",
                    Set.of("Assassin"), Set.of(Element.WIND))
    ), Front::id);

    public static final int OPERATION_MINUTES = 60;
    public static final int OPERATION_ENCOUNTERS = 6;

    /** Points each donated item adds to the guild's siege defenses. */
    public static final Map<String, Integer> DONATION_POINTS = Map.of(
            "iron_bar", 6, "copper_bar", 3, "oak_plank", 4, "pine_plank", 2, "rope", 3,
            "herb_tonic", 4, "rune_stone", 8, "ancient_relic", 60, "linen", 2);
    /** Defense points needed for levels 1..5; each level adds 10% to every operation score. */
    public static final long[] DEFENSE_THRESHOLDS = {400, 1500, 4000, 9000, 18000};

    public static int defenseLevel(long points) {
        int level = 0;
        for (long t : DEFENSE_THRESHOLDS) if (points >= t) level++;
        return level;
    }

    /** A Siege Operation sortie on one front against the week's threat, at the company's level. */
    public static Route operationRoute(String frontId, Threat threat, int level, int companySize) {
        Front front = FRONTS.get(frontId);
        int lo = Math.max(1, level - 3);
        int size = Math.max(1, Math.min(3, companySize));
        // The threat meets each company at its own size and a little below its level, so a
        // knight with one Siegeling can still add to the guild's effort.
        return r("operation:" + frontId, "Siege Operation: " + front.name(), threat.name(), RouteType.PATROL, threat.element())
                .time(OPERATION_MINUTES, OPERATION_ENCOUNTERS).levels(lo, Math.max(lo, level - 1)).groups(size, size)
                .loot(new Loot(essenceId(threat.element()), 1, 2, 0.6))
                .blurb(front.text()).build();
    }

    // ── Expedition routes ────────────────────────────────────────────────────

    public enum RouteType { PATROL, HUNT, RESOURCE, DUNGEON, GRAND }

    public record Loot(String item, int min, int max, double chance) {}

    /**
     * An expedition destination. Beyond the basics, later regions add entry
     * requirements, a per-battle hazard with the elements that ward it, combat twists
     * (see {@link #TWISTS}), extra elements for mixed pools, and a hidden flag for
     * routes that only appear once their requirements are met (Cartography's finds).
     */
    public record Route(String id, String name, String region, RouteType type, Element element, int tier,
                        int minutes, int encounters, int levelMin, int levelMax, int groupMin, int groupMax,
                        int rankReq, double sightingChance, List<Loot> loot, String hazard, String hazardText,
                        String bossId, int bossLevel, Req hiddenRoomReq, String blurb,
                        List<Req> requirements, double hazardPct, Set<Element> wards, List<String> twists,
                        List<Element> extraElements, boolean hidden) {
        public List<Element> elements() {
            List<Element> out = new ArrayList<>();
            out.add(element);
            out.addAll(extraElements);
            return out;
        }
    }

    private static Route route(String id, String name, String region, RouteType type, Element element,
                               int minutes, int encounters, int levelMin, int levelMax, int groupMin, int groupMax,
                               int rankReq, double sighting, List<Loot> loot, String blurb) {
        return new Route(id, name, region, type, element, 1, minutes, encounters, levelMin, levelMax,
                groupMin, groupMax, rankReq, sighting, loot, null, null, null, 0, null, blurb,
                List.of(), 0, Set.of(), List.of(), List.of(), false);
    }

    /** Fluent builder for the later regions, whose routes carry many optional parts. */
    static final class R {
        private final String id, name, region;
        private final RouteType type;
        private final Element element;
        private int tier = 1, minutes, encounters, levelMin, levelMax, groupMin = 1, groupMax = 2, rank = 1;
        private double sighting;
        private List<Loot> loot = List.of();
        private String hazard, hazardText, bossId, blurb = "";
        private int bossLevel;
        private Req hiddenRoom;
        private final List<Req> reqs = new ArrayList<>();
        private double hazardPct;
        private Set<Element> wards = Set.of();
        private final List<String> twists = new ArrayList<>();
        private List<Element> extra = List.of();
        private boolean hidden;

        R(String id, String name, String region, RouteType type, Element element) {
            this.id = id; this.name = name; this.region = region; this.type = type; this.element = element;
        }
        R tier(int t) { tier = t; return this; }
        R time(int min, int enc) { minutes = min; encounters = enc; return this; }
        R levels(int lo, int hi) { levelMin = lo; levelMax = hi; return this; }
        R groups(int lo, int hi) { groupMin = lo; groupMax = hi; return this; }
        R rank(int r) { rank = r; return this; }
        R sighting(double s) { sighting = s; return this; }
        R loot(Loot... l) { loot = List.of(l); return this; }
        R hazard(String id, double pct, String text, Element... wardEls) {
            hazard = id; hazardPct = pct; hazardText = text; wards = Set.of(wardEls); return this;
        }
        R twist(String t) { twists.add(t); return this; }
        R boss(String id, int level) { bossId = id; bossLevel = level; return this; }
        R needs(Req r) { reqs.add(r); return this; }
        R extra(Element... e) { extra = List.of(e); return this; }
        R hidden() { hidden = true; return this; }
        R blurb(String b) { blurb = b; return this; }
        Route build() {
            return new Route(id, name, region, type, element, tier, minutes, encounters, levelMin, levelMax, groupMin,
                    groupMax, rank, sighting, loot, hazard, hazardText, bossId, bossLevel, hiddenRoom, blurb,
                    List.copyOf(reqs), hazardPct, wards, List.copyOf(twists), extra, hidden);
        }
    }

    private static R r(String id, String name, String region, RouteType type, Element element) {
        return new R(id, name, region, type, element);
    }

    /** A Legendary Bond Trial for one Siegeling (see ChroniclesService.startTrial). */
    public static Route trialRoute(String id, String heroName, Element element, int level) {
        return r(id, "Legendary Bond Trial: " + heroName, "Trial Grounds", RouteType.DUNGEON, element)
                .time(TRIAL_MINUTES, 3).levels(Math.max(1, level - 2), level).groups(1, 1)
                .boss("auto", level)
                .loot(new Loot("ancient_relic", 1, 1, 1.0))
                .blurb("Alone, against the strongest of its element.").build();
    }

    /** Region-wide combat twists of the Forgotten Regions, and what counters each. */
    public record Twist(String id, String name, String text, Set<Element> wards, String relicWard) {}

    public static final Map<String, Twist> TWISTS = ordered(List.of(
            new Twist("ambush", "Ambush", "Enemies strike from the dark: +30% damage in the first round.",
                    Set.of(Element.LIGHT, Element.SHADOW), "dawn_lantern"),
            new Twist("mirage", "Mirage", "Shimmering mirages waste one company turn in seven.",
                    Set.of(Element.PSYCHIC), "clarity_charm"),
            new Twist("plated", "Plated Foes", "Enemies wear living metal: +30% defense.",
                    Set.of(Element.ELECTRIC, Element.FIRE), "alloy_breaker"),
            new Twist("risen", "Restless Dead", "Fallen enemies rise once at 30% health.",
                    Set.of(Element.LIGHT, Element.FIRE), "grave_ward"),
            new Twist("radiance", "Radiance", "Enemies recover 3% health each round.",
                    Set.of(Element.SHADOW), "dawn_lantern"),
            new Twist("blight", "Blight", "The company loses 3% health each round.",
                    Set.of(Element.POISON, Element.LIGHT), "grave_ward")
    ), Twist::id);

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
                    "A volcanic dungeon. Lingering heat wears the company down before the Solgator at its heart.",
                    List.of(), 0.06, Set.of(Element.ICE), List.of(), List.of(), false),
            new Route("old_rootcrypt", "Old Rootcrypt", "Mossroot Deeps", RouteType.DUNGEON, Element.EARTH, 1,
                    90, 9, 14, 19, 3, 3, 10, 0.10,
                    List.of(new Loot("heartwood", 1, 3, 0.8), new Loot("iron_ore", 3, 6, 0.8),
                            new Loot("ancient_relic", 1, 2, 0.5)),
                    "maze", "Root-choked halls. Knights with Foraging 20 or Cartography 25 find the hidden root cellar; "
                    + "Foraging 10 or Cartography 10 keeps the company from getting lost.",
                    "generoot", 20, skill("foraging", 20),
                    "An ancient forest crypt. Patience and woodcraft reveal its secrets.",
                    List.of(), 0, Set.of(), List.of(), List.of(), false),
            r("sunken_mossway", "Sunken Mossway", "Mossroot Deeps", RouteType.PATROL, Element.EARTH)
                    .time(30, 5).levels(6, 10).groups(1, 2).rank(4).sighting(0.2).extra(Element.WATER)
                    .needs(skill("cartography", 10)).hidden()
                    .loot(new Loot("relic_shard", 1, 2, 0.4), new Loot("rune_stone", 1, 2, 0.4), new Loot("oak_log", 2, 4, 0.6))
                    .blurb("A drowned path only a mapmaker could find. Shards and rune stones in the silt.").build(),
            r("inner_wilds_circuit", "Grand Circuit of the Inner Wilds", "Tier I lands", RouteType.GRAND, Element.EARTH)
                    .time(240, 16).levels(8, 14).groups(2, 3).rank(8).sighting(0.2)
                    .extra(Element.FIRE, Element.ICE, Element.WIND)
                    .loot(new Loot("iron_ore", 2, 5, 0.7), new Loot("oak_log", 2, 4, 0.6), new Loot("galeberry", 1, 3, 0.5),
                            new Loot("ember_shard", 1, 2, 0.3), new Loot("frost_crystal", 1, 2, 0.3))
                    .blurb("Four hours across all four Tier I lands. Long, varied, and rich.").build(),

            // Tier II: the Outer Frontiers.
            r("tidewater_patrol", "Tidewater Patrol", "Tidewater Coast", RouteType.PATROL, Element.WATER)
                    .tier(2).time(40, 6).levels(15, 19).groups(2, 2).rank(12).sighting(0.12)
                    .needs(skill("survival", 10))
                    .hazard("tide", 0.04, "Surging tides batter the company for 4% health before each battle. Water or Ice Siegelings, "
                            + "Survival and tide-warded gear cut it.", Element.WATER, Element.ICE)
                    .loot(new Loot("minnow", 2, 4, 0.6), new Loot("silverfin", 1, 2, 0.4), new Loot("tide_pearl", 1, 1, 0.2))
                    .blurb("Salt cliffs and tidepools. Needs Survival 10.").build(),
            r("tidewater_hunt", "Tidewater Hunt", "Tidewater Coast", RouteType.HUNT, Element.WATER)
                    .tier(2).time(70, 9).levels(16, 21).groups(2, 3).rank(13).sighting(0.28)
                    .needs(skill("survival", 15))
                    .hazard("tide", 0.04, "Surging tides batter the company for 4% health before each battle.", Element.WATER, Element.ICE)
                    .loot(new Loot("tide_pearl", 1, 2, 0.35), new Loot("silverfin", 1, 3, 0.5))
                    .blurb("Track Water Siegelings along the reefs. Good for taming.").build(),
            r("sunken_grotto", "Sunken Grotto", "Tidewater Coast", RouteType.DUNGEON, Element.WATER)
                    .tier(2).time(90, 8).levels(19, 23).groups(2, 3).rank(15).sighting(0.10)
                    .needs(skill("survival", 20))
                    .hazard("tide", 0.06, "Flooding halls drain the company for 6% health before each battle.", Element.WATER, Element.ICE)
                    .boss("clawqueen", 25)
                    .loot(new Loot("tide_pearl", 2, 3, 0.7), new Loot("ancient_relic", 1, 1, 0.45), new Loot("relic_shard", 1, 3, 0.6))
                    .blurb("A flooded sea cave ruled by the Clawqueen.").build(),
            r("stormspire_patrol", "Stormspire Patrol", "Stormspire Peaks", RouteType.PATROL, Element.ELECTRIC)
                    .tier(2).time(45, 6).levels(17, 21).groups(2, 2).rank(14).sighting(0.12)
                    .needs(skill("survival", 12))
                    .hazard("storm", 0.05, "Lightning strikes the ridges: 5% health before each battle. Metal or Earth Siegelings "
                            + "ground it; storm-warded gear and Survival help.", Element.METAL, Element.EARTH)
                    .loot(new Loot("iron_ore", 2, 4, 0.6), new Loot("storm_glass", 1, 1, 0.2))
                    .blurb("Crackling peaks above the clouds. Needs Survival 12.").build(),
            r("stormspire_hunt", "Stormspire Hunt", "Stormspire Peaks", RouteType.HUNT, Element.ELECTRIC)
                    .tier(2).time(75, 9).levels(18, 23).groups(2, 3).rank(15).sighting(0.28)
                    .needs(skill("survival", 16))
                    .hazard("storm", 0.05, "Lightning strikes the ridges: 5% health before each battle.", Element.METAL, Element.EARTH)
                    .loot(new Loot("storm_glass", 1, 2, 0.35), new Loot("iron_ore", 2, 4, 0.5))
                    .blurb("Hunt Electric Siegelings through the storm. Good for taming.").build(),
            r("thunderhold", "Thunderhold", "Stormspire Peaks", RouteType.DUNGEON, Element.ELECTRIC)
                    .tier(2).time(100, 9).levels(21, 25).groups(2, 3).rank(17).sighting(0.10)
                    .needs(skill("survival", 22))
                    .hazard("storm", 0.07, "The hold is a lightning rod: 7% health before each battle.", Element.METAL, Element.EARTH)
                    .boss("bleetsrike", 27)
                    .loot(new Loot("storm_glass", 2, 3, 0.7), new Loot("ancient_relic", 1, 1, 0.5), new Loot("relic_shard", 1, 3, 0.6))
                    .blurb("A fortress of living thunder, ruled by the Bleetsrike.").build(),
            r("frontier_odyssey", "Frontier Odyssey", "Outer Frontiers", RouteType.GRAND, Element.WATER)
                    .tier(2).time(360, 20).levels(18, 25).groups(2, 3).rank(18).sighting(0.22).extra(Element.ELECTRIC)
                    .needs(skill("survival", 20))
                    .hazard("tide", 0.03, "Six hours of tide and storm: 3% health before each battle.", Element.WATER, Element.METAL)
                    .loot(new Loot("tide_pearl", 1, 2, 0.4), new Loot("storm_glass", 1, 2, 0.4), new Loot("silverfin", 2, 4, 0.5),
                            new Loot("relic_shard", 1, 2, 0.3))
                    .blurb("A six-hour journey through both frontier lands.").build(),

            // Tier III: the Forgotten Regions. Each has a twist the right element (or relic) counters.
            r("umbral_hunt", "Umbral Caves Hunt", "Umbral Caves", RouteType.HUNT, Element.SHADOW)
                    .tier(3).time(80, 9).levels(25, 30).groups(2, 3).rank(20).sighting(0.25)
                    .needs(skill("survival", 25)).twist("ambush")
                    .loot(new Loot("umbral_crystal", 1, 2, 0.35), new Loot("rune_stone", 1, 2, 0.5))
                    .blurb("Lightless tunnels where Shadow Siegelings lie in wait.").build(),
            r("abyssal_hollow", "Abyssal Hollow", "Umbral Caves", RouteType.DUNGEON, Element.SHADOW)
                    .tier(3).time(120, 10).levels(29, 34).groups(2, 3).rank(24).sighting(0.10)
                    .needs(skill("survival", 30)).needs(skill("cartography", 15)).twist("ambush")
                    .boss("umbralwyrm", 36)
                    .loot(new Loot("umbral_crystal", 2, 3, 0.7), new Loot("ancient_relic", 1, 2, 0.5))
                    .blurb("The cave's heart, where the Umbralwyrm coils.").build(),
            r("mirage_hunt", "Mirage Expanse Hunt", "Mirage Expanse", RouteType.HUNT, Element.PSYCHIC)
                    .tier(3).time(80, 9).levels(25, 30).groups(2, 3).rank(21).sighting(0.25)
                    .needs(skill("survival", 25)).twist("mirage")
                    .loot(new Loot("mind_prism", 1, 2, 0.35), new Loot("galeberry", 2, 3, 0.5))
                    .blurb("A desert of illusions. Psychic Siegelings see through them.").build(),
            r("oracle_sanctum", "Oracle's Sanctum", "Mirage Expanse", RouteType.DUNGEON, Element.PSYCHIC)
                    .tier(3).time(120, 10).levels(29, 34).groups(2, 3).rank(25).sighting(0.10)
                    .needs(skill("survival", 30)).needs(skill("cartography", 15)).twist("mirage")
                    .boss("omnipsych", 36)
                    .loot(new Loot("mind_prism", 2, 3, 0.7), new Loot("ancient_relic", 1, 2, 0.5))
                    .blurb("Where the Omnipsych dreams the desert into being.").build(),
            r("forge_wastes_hunt", "Forge Wastes Hunt", "Forge Wastes", RouteType.HUNT, Element.METAL)
                    .tier(3).time(85, 9).levels(26, 31).groups(2, 3).rank(22).sighting(0.25)
                    .needs(skill("survival", 25)).twist("plated")
                    .hazard("forge", 0.04, "Slag heat: 4% health before each battle.", Element.WATER, Element.ICE)
                    .loot(new Loot("living_alloy", 1, 2, 0.35), new Loot("iron_ore", 3, 6, 0.6))
                    .blurb("An abandoned machine-forge of armored Metal Siegelings.").build(),
            r("titan_foundry", "Titan Foundry", "Forge Wastes", RouteType.DUNGEON, Element.METAL)
                    .tier(3).time(130, 10).levels(30, 35).groups(2, 3).rank(26).sighting(0.10)
                    .needs(skill("survival", 32)).needs(skill("cartography", 15)).twist("plated")
                    .hazard("forge", 0.06, "Molten channels: 6% health before each battle.", Element.WATER, Element.ICE)
                    .boss("steelwarden", 37)
                    .loot(new Loot("living_alloy", 2, 3, 0.7), new Loot("ancient_relic", 1, 2, 0.5))
                    .blurb("The great foundry, guarded by the Steelwarden.").build(),
            r("ashen_hunt", "Ashen Crypts Hunt", "Ashen Crypts", RouteType.HUNT, Element.UNDEAD)
                    .tier(3).time(85, 9).levels(26, 31).groups(2, 3).rank(23).sighting(0.25)
                    .needs(skill("survival", 25)).twist("risen")
                    .loot(new Loot("grave_dust", 1, 2, 0.35), new Loot("fossil", 2, 4, 0.6))
                    .blurb("Crypts where the dead refuse to stay down.").build(),
            r("lich_vault", "Lich Vault", "Ashen Crypts", RouteType.DUNGEON, Element.UNDEAD)
                    .tier(3).time(130, 10).levels(30, 35).groups(2, 3).rank(27).sighting(0.10)
                    .needs(skill("survival", 32)).needs(skill("cartography", 15)).twist("risen")
                    .boss("wraithlord", 37)
                    .loot(new Loot("grave_dust", 2, 3, 0.7), new Loot("ancient_relic", 1, 2, 0.5))
                    .blurb("The Wraithlord's vault. Endurance and cleansing win here.").build(),
            r("sunspire_hunt", "Sunspire Sanctum Hunt", "Sunspire Sanctum", RouteType.HUNT, Element.LIGHT)
                    .tier(3).time(85, 9).levels(26, 31).groups(2, 3).rank(23).sighting(0.25)
                    .needs(skill("survival", 25)).twist("radiance").boss("auto", 36)
                    .loot(new Loot("relic_shard", 1, 2, 0.4), new Loot("rune_stone", 1, 2, 0.5))
                    .blurb("A radiant sanctum. Sealed until Light Siegelings walk the world.").build(),
            r("blight_hunt", "Blight Marsh Hunt", "Blight Marsh", RouteType.HUNT, Element.POISON)
                    .tier(3).time(85, 9).levels(26, 31).groups(2, 3).rank(23).sighting(0.25)
                    .needs(skill("survival", 25)).twist("blight")
                    .loot(new Loot("relic_shard", 1, 2, 0.4), new Loot("flax", 3, 6, 0.6))
                    .blurb("A toxic marsh. Sealed until Poison Siegelings walk the world.").build(),
            r("forgotten_pilgrimage", "Forgotten Pilgrimage", "Forgotten Regions", RouteType.GRAND, Element.SHADOW)
                    .tier(3).time(480, 24).levels(28, 36).groups(2, 3).rank(28).sighting(0.2)
                    .extra(Element.PSYCHIC, Element.METAL, Element.UNDEAD)
                    .needs(skill("survival", 30)).twist("ambush")
                    .loot(new Loot("umbral_crystal", 1, 2, 0.3), new Loot("mind_prism", 1, 2, 0.3),
                            new Loot("living_alloy", 1, 2, 0.3), new Loot("grave_dust", 1, 2, 0.3), new Loot("ancient_relic", 1, 1, 0.2))
                    .blurb("Eight hours through every Forgotten Region.").build(),

            // Tier IV: Legendary Expeditions, multi-element trials.
            r("trial_inner_wilds", "Trial of the Inner Wilds", "Legendary Expeditions", RouteType.DUNGEON, Element.FIRE)
                    .tier(4).time(150, 12).levels(40, 45).groups(3, 3).rank(40).sighting(0.06)
                    .extra(Element.EARTH, Element.ICE, Element.WIND)
                    .needs(affinity(Element.FIRE, 40)).needs(affinity(Element.EARTH, 40)).needs(skill("survival", 40))
                    .hazard("heat", 0.05, "The trial burns: 5% health before each battle.", Element.ICE)
                    .boss("pylord", 48)
                    .loot(new Loot("ancient_relic", 1, 2, 0.8), new Loot("ember_shard", 2, 4, 0.6), new Loot("frost_crystal", 2, 4, 0.6))
                    .blurb("Four elements, one trial, and Pylord at its end.").build(),
            r("trial_frontier_tempest", "Trial of the Frontier Tempest", "Legendary Expeditions", RouteType.DUNGEON, Element.ELECTRIC)
                    .tier(4).time(160, 12).levels(42, 47).groups(3, 3).rank(45).sighting(0.06).extra(Element.WATER)
                    .needs(affinity(Element.ELECTRIC, 40)).needs(affinity(Element.WATER, 40)).needs(skill("survival", 45))
                    .hazard("storm", 0.06, "An endless storm: 6% health before each battle.", Element.METAL, Element.EARTH)
                    .boss("thunderlord", 49)
                    .loot(new Loot("ancient_relic", 1, 2, 0.8), new Loot("storm_glass", 2, 4, 0.6), new Loot("tide_pearl", 2, 4, 0.6))
                    .blurb("Ride the tempest to the Thunderlord.").build(),
            r("trial_ancient_eclipse", "Trial of the Ancient Eclipse", "Legendary Expeditions", RouteType.DUNGEON, Element.SHADOW)
                    .tier(4).time(180, 14).levels(45, 50).groups(3, 3).rank(50).sighting(0.06)
                    .extra(Element.PSYCHIC, Element.UNDEAD, Element.METAL)
                    .needs(affinity(Element.SHADOW, 50)).needs(affinity(Element.PSYCHIC, 40)).needs(skill("cartography", 50))
                    .twist("ambush").twist("risen")
                    .boss("voidmaw", 50)
                    .loot(new Loot("ancient_relic", 2, 3, 0.9), new Loot("umbral_crystal", 2, 4, 0.6), new Loot("mind_prism", 2, 4, 0.6))
                    .blurb("An ancient expedition only master cartographers can chart. The Voidmaw waits.").build(),
            r("skyreach_ruins", "Skyreach Ruins", "Legendary Expeditions", RouteType.DUNGEON, Element.WIND)
                    .tier(4).time(120, 10).levels(38, 44).groups(2, 3).rank(35).sighting(0.08)
                    .needs(skill("cartography", 50)).hidden()
                    .boss("aerovane", 46)
                    .loot(new Loot("ancient_relic", 1, 2, 0.8), new Loot("gale_feather", 3, 6, 0.8))
                    .blurb("Ruins above the clouds, on no map but yours. Aerovane nests here.").build()
    ), Route::id);

    // ── helpers ──────────────────────────────────────────────────────────────

    private static <T> Map<String, T> ordered(List<T> values, java.util.function.Function<T, String> key) {
        Map<String, T> map = new LinkedHashMap<>();
        for (T value : values) map.put(key.apply(value), value);
        return Collections.unmodifiableMap(map);
    }
}
