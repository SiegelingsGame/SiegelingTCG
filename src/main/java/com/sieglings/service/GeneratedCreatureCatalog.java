package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.Notch;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

final class GeneratedCreatureCatalog {

    record CreatureSeed(
            String id,
            String name,
            Element element,
            Rarity rarity,
            String role,
            String evolvesFromId,
            String evolvesToId
    ) {}

    private static final List<CreatureSeed> CREATURE_SEEDS = List.of(
            // ========================
            // FIRE (15) — matches Roblox
            // ========================
            seed("firsky", "Firsky", Element.FIRE, Rarity.COMMON, "Mage", null, "coming soon"),
            seed("pylook", "Pylook", Element.FIRE, Rarity.COMMON, "Assassin", null, "pyleer"),
            seed("sundile", "Sundile", Element.FIRE, Rarity.COMMON, "Guardian", null, "raydile"),
            seed("draco", "Draco", Element.FIRE, Rarity.COMMON, "Bruiser", null, "dracoil"),
            seed("emberfox", "Emberfox", Element.FIRE, Rarity.COMMON, "Support", null, null),
            seed("emberpup", "Emberpup", Element.FIRE, Rarity.UNCOMMON, "Bruiser", null, null),
            seed("raydile", "Raydile", Element.FIRE, Rarity.UNCOMMON, "Guardian", "sundile", "solgator"),
            seed("hotty", "Hotty", Element.FIRE, Rarity.UNCOMMON, "Support", null, null),
            seed("emberfin", "Emberfin", Element.FIRE, Rarity.UNCOMMON, "Assassin", null, "cindergil"),
            seed("dracoil", "Dracoil", Element.FIRE, Rarity.RARE, "Assassin", "draco", null),
            seed("cindergil", "Cindergil", Element.FIRE, Rarity.RARE, "Support", null, null),
            seed("hotdog", "Hotdog", Element.FIRE, Rarity.RARE, "Bruiser", null, null),
            seed("pyleer", "Pyleer", Element.FIRE, Rarity.RARE, "Mage", "pylook", null),
            seed("solgator", "Solgator", Element.FIRE, Rarity.RARE, "Guardian", "raydile", null),
            seed("pylord", "Pylord", Element.FIRE, Rarity.LEGENDARY, "Bruiser", null, null),

            // ========================
            // EARTH (15) — synced with Roblox (sleaf→Common, added sleafwyrm/dracosleaf,
            //   removed papapa/golor/sheenx which moved to Psychic/Undead)
            // ========================
            seed("cacty", "Cacty", Element.EARTH, Rarity.COMMON, "Bruiser", null, "jackedty"),
            seed("applehead", "Applehead", Element.EARTH, Rarity.COMMON, "Guardian", null, null),
            seed("sleaf", "Sleaf", Element.EARTH, Rarity.COMMON, "Assassin", null, "sleafwyrm"),
            seed("squirebud", "Squire Bud", Element.EARTH, Rarity.COMMON, "Assassin", null, "floraknight"),
            seed("pylme", "Pylme", Element.EARTH, Rarity.COMMON, "Mage", null, "bonoblade"),
            seed("jackedty", "Jacked'ty", Element.EARTH, Rarity.UNCOMMON, "Bruiser", "cacty", "cactyjackedty"),
            seed("mossy", "Mossy", Element.EARTH, Rarity.UNCOMMON, "Bruiser", null, null),
            seed("floraknight", "Flora Knight", Element.EARTH, Rarity.UNCOMMON, "Mage", "squirebud", "generoot"),
            seed("bonoblade", "Bonoblade", Element.EARTH, Rarity.UNCOMMON, "Assassin", "pylme", "guerilla"),
            seed("generoot", "Generoot", Element.EARTH, Rarity.RARE, "Bruiser", "floraknight", null),
            seed("guerilla", "Guerilla", Element.EARTH, Rarity.RARE, "Bruiser", "bonoblade", null),
            seed("sleafwyrm", "Sleafwyrm", Element.EARTH, Rarity.RARE, "Assassin", "sleaf", "dracosleaf"),
            seed("cactyjackedty", "CactyJackedty", Element.EARTH, Rarity.RARE, "Bruiser", "jackedty", null),
            seed("dracosleaf", "Dracosleaf", Element.EARTH, Rarity.RARE, "Bruiser", "sleafwyrm", null),
            seed("gymstone", "Gymstone", Element.EARTH, Rarity.LEGENDARY, "Guardian", null, null),

            // ========================
            // WIND (14) — synced with Roblox (removed blanky, ragguette→Psychic)
            // ========================
            seed("breezee", "Breezee", Element.WIND, Rarity.COMMON, "Assassin", null, "gagglestand"),
            seed("pursula", "Pursula", Element.WIND, Rarity.COMMON, "Bruiser", null, "purseus"),
            seed("cloudpuff", "Cloudpuff", Element.WIND, Rarity.COMMON, "Guardian", null, "cloudwisp"),
            seed("cloudwisp", "Cloudwisp", Element.WIND, Rarity.UNCOMMON, "Bruiser", "cloudpuff", "cloudsprite"),
            seed("gagglestand", "Gagglestand", Element.WIND, Rarity.UNCOMMON, "Support", "breezee", "hurricrane"),
            seed("lofty", "Lofty", Element.WIND, Rarity.UNCOMMON, "Assassin", null, null),
            seed("purseus", "Purseus", Element.WIND, Rarity.UNCOMMON, "Mage", "pursula", "pursephone"),
            seed("cloudsprite", "Cloudsprite", Element.WIND, Rarity.RARE, "Mage", "cloudwisp", null),
            seed("hurricrane", "Hurricrane", Element.WIND, Rarity.RARE, "Mage", "gagglestand", null),
            seed("pursephone", "Pursephone", Element.WIND, Rarity.RARE, "Assassin", "purseus", null),
            seed("shellshock", "Shellshock", Element.WIND, Rarity.RARE, "Assassin", null, "strikehawk"),
            seed("skydon", "Skydon", Element.WIND, Rarity.RARE, "Support", null, null),
            seed("strikehawk", "Strikehawk", Element.WIND, Rarity.RARE, "Bruiser", "shellshock", null),
            seed("aerovane", "Aerovane", Element.WIND, Rarity.LEGENDARY, "Assassin", null, null),

            // ========================
            // WATER (14) — synced with Roblox (added ceeponee chain,
            //   removed splashfin/tidepup/brinepup/leviathan)
            // ========================
            seed("spoutyl", "Spoutyl", Element.WATER, Rarity.COMMON, "Assassin", null, "droxyl"),
            seed("shellpack", "Shellpack", Element.WATER, Rarity.COMMON, "Support", null, "torqlander"),
            seed("jawby", "Jawby", Element.WATER, Rarity.COMMON, "Guardian", null, "jawbite"),
            seed("ceeponee", "Ceeponee", Element.WATER, Rarity.COMMON, "Bruiser", null, "ceehorcee"),
            seed("droxyl", "Droxyl", Element.WATER, Rarity.UNCOMMON, "Assassin", "spoutyl", "hydroxyl"),
            seed("clawkid", "Clawkid", Element.WATER, Rarity.UNCOMMON, "Guardian", null, "clawqueen"),
            seed("torqlander", "Torqlander", Element.WATER, Rarity.UNCOMMON, "Mage", "shellpack", "shellnaut"),
            seed("ceehorcee", "Ceehorcee", Element.WATER, Rarity.UNCOMMON, "Assassin", "ceeponee", "ceesteed"),
            seed("hydroxyl", "Hydroxyl", Element.WATER, Rarity.RARE, "Assassin", "droxyl", null),
            seed("shellnaut", "Shellnaut", Element.WATER, Rarity.RARE, "Guardian", "torqlander", null),
            seed("jawbite", "Jawbite", Element.WATER, Rarity.RARE, "Support", "jawby", null),
            seed("clawqueen", "Claw Queen", Element.WATER, Rarity.RARE, "Mage", "clawkid", null),
            seed("ceesteed", "Ceesteed", Element.WATER, Rarity.RARE, "Guardian", "ceehorcee", null),
            seed("conchious", "Conchious", Element.WATER, Rarity.LEGENDARY, "Mage", null, null),

            // ========================
            // ICE (13) — synced with Roblox (complete replacement of old TCG-only roster)
            // ========================
            seed("fawny", "Fawny", Element.ICE, Rarity.COMMON, "Bruiser", null, "chilldoe"),
            seed("frostfly", "Frostfly", Element.ICE, Rarity.COMMON, "Assassin", null, null),
            seed("icewee", "Ice-Wee", Element.ICE, Rarity.COMMON, "Assassin", null, "icecuewee"),
            seed("falcool", "Falcool", Element.ICE, Rarity.COMMON, "Support", null, "falcoat"),
            seed("cozycub", "Cozycub", Element.ICE, Rarity.COMMON, "Mage", null, null),
            seed("frosty", "Frosty", Element.ICE, Rarity.UNCOMMON, "Mage", null, null),
            seed("chilldoe", "Chilldoe", Element.ICE, Rarity.UNCOMMON, "Bruiser", "fawny", "frostag"),
            seed("icecuewee", "Ice-Cue-Wee", Element.ICE, Rarity.UNCOMMON, "Assassin", "icewee", null),
            seed("falcoat", "Falcoat", Element.ICE, Rarity.UNCOMMON, "Assassin", "falcool", "peatbeak"),
            seed("peatbeak", "Peatbeak", Element.ICE, Rarity.RARE, "Guardian", "falcoat", null),
            seed("lumina", "Lumina", Element.ICE, Rarity.RARE, "Mage", null, null),
            seed("frostag", "Frostag", Element.ICE, Rarity.RARE, "Assassin", "chilldoe", null),
            seed("glaciemperor", "Glaciemperor", Element.ICE, Rarity.LEGENDARY, "Mage", null, null),

            // ========================
            // SHADOW (15) — echo line from Roblox + TCG originals for playability
            // ========================
            seed("echo", "Echo", Element.SHADOW, Rarity.COMMON, "Assassin", null, "echowing"),
            seed("duskmoth", "Duskmoth", Element.SHADOW, Rarity.COMMON, "Mage", null, null),
            seed("shadeblob", "Shadeblob", Element.SHADOW, Rarity.COMMON, "Guardian", null, null),
            seed("murkling", "Murkling", Element.SHADOW, Rarity.COMMON, "Bruiser", null, null),
            seed("whisperling", "Whisperling", Element.SHADOW, Rarity.COMMON, "Support", null, null),
            seed("echowing", "Echowing", Element.SHADOW, Rarity.UNCOMMON, "Assassin", "echo", "echolustrious"),
            seed("hexweaver", "Hexweaver", Element.SHADOW, Rarity.UNCOMMON, "Mage", null, null),
            seed("grimshell", "Grimshell", Element.SHADOW, Rarity.UNCOMMON, "Guardian", null, null),
            seed("dreadpup", "Dreadpup", Element.SHADOW, Rarity.UNCOMMON, "Bruiser", null, null),
            seed("echolustrious", "Echolustrious", Element.SHADOW, Rarity.RARE, "Assassin", "echowing", null),
            seed("phantomsteed", "Phantomsteed", Element.SHADOW, Rarity.RARE, "Support", null, null),
            seed("abysscrawler", "Abysscrawler", Element.SHADOW, Rarity.RARE, "Bruiser", null, null),
            seed("umbralwyrm", "Umbralwyrm", Element.SHADOW, Rarity.RARE, "Mage", null, null),
            seed("doomshield", "Doomshield", Element.SHADOW, Rarity.RARE, "Guardian", null, null),
            seed("voidmaw", "Voidmaw", Element.SHADOW, Rarity.LEGENDARY, "Mage", null, null),

            // ========================
            // ELECTRIC (11) — synced with Roblox Lightning
            //   (removed sparkpuff/arcfox/galvanite/ionwarden — not in Roblox)
            // ========================
            seed("monkwatt", "Monkwatt", Element.ELECTRIC, Rarity.COMMON, "Mage", null, null),
            seed("newt", "Newt", Element.ELECTRIC, Rarity.COMMON, "Support", null, "newton"),
            seed("staticap", "Staticap", Element.ELECTRIC, Rarity.COMMON, "Bruiser", null, "joltram"),
            seed("blinky", "Blinky", Element.ELECTRIC, Rarity.COMMON, "Guardian", null, null),
            seed("simicircuit", "Simicircuit", Element.ELECTRIC, Rarity.UNCOMMON, "Support", null, null),
            seed("joltram", "Joltram", Element.ELECTRIC, Rarity.UNCOMMON, "Bruiser", "staticap", "bleetsrike"),
            seed("kilokong", "Kilokong", Element.ELECTRIC, Rarity.RARE, "Bruiser", null, null),
            seed("newton", "New Ton", Element.ELECTRIC, Rarity.RARE, "Guardian", "newt", null),
            seed("bleetsrike", "Bleetsrike", Element.ELECTRIC, Rarity.RARE, "Bruiser", "joltram", null),
            seed("stormclaw", "Stormclaw", Element.ELECTRIC, Rarity.RARE, "Bruiser", null, null),
            seed("thunderlord", "Thunderlord", Element.ELECTRIC, Rarity.LEGENDARY, "Mage", null, null),

            // ========================
            // METAL (11) — mechanical constructs and armored beasts
            // ========================
            seed("coppkit", "Coppkit", Element.METAL, Rarity.COMMON, "Guardian", null, "brassguard"),
            seed("tinpaw", "Tinpaw", Element.METAL, Rarity.COMMON, "Bruiser", null, "ironmaw"),
            seed("gearling", "Gearling", Element.METAL, Rarity.COMMON, "Support", null, "clockwerk"),
            seed("rivetpup", "Rivetpup", Element.METAL, Rarity.COMMON, "Assassin", null, null),
            seed("brassguard", "Brassguard", Element.METAL, Rarity.UNCOMMON, "Guardian", "coppkit", "steelwarden"),
            seed("ironmaw", "Ironmaw", Element.METAL, Rarity.UNCOMMON, "Bruiser", "tinpaw", "titanjaw"),
            seed("clockwerk", "Clockwerk", Element.METAL, Rarity.UNCOMMON, "Support", "gearling", null),
            seed("steelwarden", "Steelwarden", Element.METAL, Rarity.RARE, "Guardian", "brassguard", null),
            seed("titanjaw", "Titanjaw", Element.METAL, Rarity.RARE, "Bruiser", "ironmaw", null),
            seed("forgeclaw", "Forgeclaw", Element.METAL, Rarity.RARE, "Assassin", null, null),
            seed("chromelord", "Chromelord", Element.METAL, Rarity.LEGENDARY, "Guardian", null, null),

            // ========================
            // UNDEAD (11) — restless spirits, revenants, and skeletal horrors
            // ========================
            seed("skully", "Skully", Element.UNDEAD, Rarity.COMMON, "Assassin", null, "bonereaver"),
            seed("ghoulpup", "Ghoulpup", Element.UNDEAD, Rarity.COMMON, "Bruiser", null, "dreadmaw"),
            seed("wispshade", "Wispshade", Element.UNDEAD, Rarity.COMMON, "Support", null, "banshee"),
            seed("rattlebones", "Rattlebones", Element.UNDEAD, Rarity.COMMON, "Guardian", null, null),
            seed("bonereaver", "Bonereaver", Element.UNDEAD, Rarity.UNCOMMON, "Assassin", "skully", "gravewalker"),
            seed("dreadmaw", "Dreadmaw", Element.UNDEAD, Rarity.UNCOMMON, "Bruiser", "ghoulpup", "abominus"),
            seed("banshee", "Banshee", Element.UNDEAD, Rarity.UNCOMMON, "Mage", "wispshade", null),
            seed("gravewalker", "Gravewalker", Element.UNDEAD, Rarity.RARE, "Assassin", "bonereaver", null),
            seed("abominus", "Abominus", Element.UNDEAD, Rarity.RARE, "Bruiser", "dreadmaw", null),
            seed("wraithlord", "Wraithlord", Element.UNDEAD, Rarity.RARE, "Mage", null, null),
            seed("lichking", "Lichking", Element.UNDEAD, Rarity.LEGENDARY, "Mage", null, null),

            // ========================
            // PSYCHIC (11) — mind-benders, illusionists, and astral entities
            // ========================
            seed("blanky", "Blanky", Element.PSYCHIC, Rarity.COMMON, "Support", null, "dreamweaver"),
            seed("papapa", "Papapa", Element.PSYCHIC, Rarity.COMMON, "Mage", null, "psylon"),
            seed("mindmite", "Mindmite", Element.PSYCHIC, Rarity.COMMON, "Assassin", null, "thoughtfang"),
            seed("glimmer", "Glimmer", Element.PSYCHIC, Rarity.COMMON, "Guardian", null, null),
            seed("dreamweaver", "Dreamweaver", Element.PSYCHIC, Rarity.UNCOMMON, "Support", "blanky", "miragequeen"),
            seed("psylon", "Psylon", Element.PSYCHIC, Rarity.UNCOMMON, "Mage", "papapa", "omnipsych"),
            seed("thoughtfang", "Thoughtfang", Element.PSYCHIC, Rarity.UNCOMMON, "Assassin", "mindmite", null),
            seed("miragequeen", "Miragequeen", Element.PSYCHIC, Rarity.RARE, "Support", "dreamweaver", null),
            seed("omnipsych", "Omnipsych", Element.PSYCHIC, Rarity.RARE, "Mage", "psylon", null),
            seed("sheenx", "Sheenx", Element.PSYCHIC, Rarity.RARE, "Assassin", null, null),
            seed("cosmicoracle", "Cosmic Oracle", Element.PSYCHIC, Rarity.LEGENDARY, "Mage", null, null)
    );

    private static final Map<String, CreatureSeed> CREATURE_BY_ID = CREATURE_SEEDS.stream()
            .collect(Collectors.toMap(CreatureSeed::id, seed -> seed));

    private GeneratedCreatureCatalog() {}

    static List<SieglingCard> createForElement(Element element) {
        return CREATURE_SEEDS.stream()
                .filter(seed -> seed.element() == element)
                .sorted(Comparator
                        .comparing(CreatureSeed::rarity, GeneratedCreatureCatalog::compareRarity)
                        .thenComparing(CreatureSeed::name))
                .map(GeneratedCreatureCatalog::buildCard)
                .toList();
    }

    private static CreatureSeed seed(String id, String name, Element element, Rarity rarity,
                                     String role, String evolvesFromId, String evolvesToId) {
        return new CreatureSeed(normalizeId(id), name, element, rarity, role, normalizeId(evolvesFromId), normalizeId(evolvesToId));
    }

    private static String normalizeId(String raw) {
        if (raw == null) {
            return null;
        }
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        if (normalized.isBlank() || normalized.equals("coming soon")) {
            return null;
        }
        return normalized;
    }

    static String creatureName(String id) {
        CreatureSeed seed = CREATURE_BY_ID.get(normalizeId(id));
        return seed == null ? id : seed.name();
    }

    private static int compareRarity(Rarity left, Rarity right) {
        return Integer.compare(rarityTier(left), rarityTier(right));
    }

    private static int rarityTier(Rarity rarity) {
        return switch (rarity) {
            case COMMON -> 0;
            case UNCOMMON -> 1;
            case RARE -> 2;
            case LEGENDARY -> 3;
        };
    }

    private static SieglingCard buildCard(CreatureSeed seed) {
        String role = normalizeRole(seed.role());
        int rarityTier = rarityTier(seed.rarity());
        int stage = evolutionStage(seed);

        int health = Math.max(10, baseHealth(role) + rarityTier * 2 + stage * 2 + elementHealthBias(seed.element()));
        int abilityDamage = Math.max(1, baseAttack(role) + rarityTier + attackStageBonus(role, stage));
        int speed = Math.max(1, baseSpeed(role) + speedRarityBonus(role, rarityTier) + elementSpeedBias(seed.element()));

        SieglingCard card = new SieglingCard(
                seed.id(),
                seed.name(),
                seed.element(),
                seed.rarity(),
                health,
                speed,
                buildNotches(seed),
                preferredRow(role)
        );
        card.setAbility(buildPrintedAbility(seed, abilityDamage, stage));
        int placementCost = placementCost(seed.rarity(), stage);
        if (placementCost > 0) {
            card.setCostElement(seed.element());
            card.setCostAmount(placementCost);
        }

        String evolvesFromId = resolvedEvolvesFrom(seed);
        if (evolvesFromId != null) {
            card.setEvolvesFromId(evolvesFromId);
            card.setEvolvesFromName(creatureName(evolvesFromId));
        }
        return card;
    }

    private static Ability buildPrintedAbility(CreatureSeed seed, int abilityDamage, int stage) {
        String role = normalizeRole(seed.role());
        int tierValue = Math.max(1, rarityTier(seed.rarity()) + stage + 1);

        return switch (role) {
            case "support" -> buildSupportAbility(seed, tierValue);
            case "guardian" -> buildGuardianAbility(seed, abilityDamage);
            case "mage" -> buildMageAbility(seed, abilityDamage);
            case "assassin" -> buildAssassinAbility(seed, tierValue, abilityDamage);
            default -> Ability.damage(seed.name() + " Charge",
                    "Deal " + (abilityDamage + 1) + " damage to 1 enemy",
                    TargetType.SINGLE_ENEMY, null, 1, abilityDamage + 1);
        };
    }

    private static Ability buildSupportAbility(CreatureSeed seed, int tierValue) {
        return switch (seed.element()) {
            case FIRE -> Ability.passive(
                    seed.name() + " Hearth",
                    "All " + elementLabel(seed.element()) + " allies gain +" + Math.max(1, tierValue / 2) + " attack damage",
                    "damage_boost",
                    Math.max(1, tierValue / 2)
            );
            case EARTH -> Ability.heal(
                    seed.name() + " Grovecall",
                    "Heal 1 ally for " + (2 + tierValue),
                    TargetType.SINGLE_ALLY,
                    null,
                    1,
                    2 + tierValue
            );
            case WIND -> Ability.passive(
                    seed.name() + " Tailwind",
                    "All " + elementLabel(seed.element()) + " allies gain +" + Math.max(1, tierValue / 2) + " Speed",
                    "speed_boost",
                    Math.max(1, tierValue / 2)
            );
            case WATER -> Ability.heal(
                    seed.name() + " Flow Mend",
                    "Heal all allies for " + Math.max(2, tierValue),
                    TargetType.ALL_ALLIES,
                    null,
                    0,
                    Math.max(2, tierValue)
            );
            case ICE -> Ability.passive(
                    seed.name() + " Winter Ward",
                    "All " + elementLabel(seed.element()) + " allies gain +" + Math.max(1, tierValue / 2) + " max Health",
                    "health_boost",
                    Math.max(1, tierValue / 2)
            );
            case SHADOW -> Ability.passive(
                    seed.name() + " Night Chorus",
                    "All " + elementLabel(seed.element()) + " allies gain +" + Math.max(1, tierValue / 2) + " attack damage",
                    "damage_boost",
                    Math.max(1, tierValue / 2)
            );
            case ELECTRIC -> Ability.passive(
                    seed.name() + " Static Choir",
                    "All " + elementLabel(seed.element()) + " allies gain +" + Math.max(1, tierValue / 2) + " Speed",
                    "speed_boost",
                    Math.max(1, tierValue / 2)
            );
            default -> Ability.heal(seed.name() + " Rally", "Heal 1 ally for 2", TargetType.SINGLE_ALLY, null, 1, 2);
        };
    }

    private static Ability buildGuardianAbility(CreatureSeed seed, int abilityDamage) {
        return switch (seed.element()) {
            case FIRE -> Ability.damage(
                    seed.name() + " Shield Bash",
                    "Deal " + Math.max(2, abilityDamage) + " damage to 1 enemy",
                    TargetType.SINGLE_ENEMY,
                    Row.FRONT,
                    1,
                    Math.max(2, abilityDamage)
            );
            case EARTH -> Ability.passive(
                    seed.name() + " Barkplate",
                    "This Siegling gains +1 max Health",
                    "health_boost",
                    1
            );
            case WIND -> new Ability(
                    seed.name() + " Crosswind Guard",
                    "Set 1 enemy's Speed to 0 for this turn",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1,
                    "speed_zero",
                    1,
                    false
            );
            case WATER -> Ability.freeze(
                    seed.name() + " Cold Anchor",
                    "Freeze 1 enemy for 1 turn",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1
            );
            case ICE -> Ability.freeze(
                    seed.name() + " Rime Anchor",
                    "Freeze 1 enemy for 1 turn",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1
            );
            case SHADOW -> Ability.passive(
                    seed.name() + " Dusk Carapace",
                    "This Siegling gains +1 max Health",
                    "health_boost",
                    1
            );
            case ELECTRIC -> Ability.damage(
                    seed.name() + " Shock Ram",
                    "Deal " + Math.max(2, abilityDamage) + " damage to 1 enemy",
                    TargetType.SINGLE_ENEMY,
                    Row.FRONT,
                    1,
                    Math.max(2, abilityDamage)
            );
            default -> Ability.passive(seed.name() + " Guard", "This Siegling gains +1 max Health", "health_boost", 1);
        };
    }

    private static Ability buildMageAbility(CreatureSeed seed, int abilityDamage) {
        return switch (seed.element()) {
            case FIRE -> Ability.damage(
                    seed.name() + " Flame Arc",
                    "Deal " + (abilityDamage + 1) + " damage to all enemies in Front Row",
                    TargetType.ROW_ENEMIES,
                    Row.FRONT,
                    0,
                    abilityDamage + 1
            );
            case EARTH -> new Ability(
                    seed.name() + " Rootbind",
                    "Set 1 enemy's Speed to 0 for this turn",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1,
                    "speed_zero",
                    1,
                    false
            );
            case WIND -> Ability.damage(
                    seed.name() + " Skyrend",
                    "Deal " + abilityDamage + " damage to all enemies in Back Row",
                    TargetType.ROW_ENEMIES,
                    Row.BACK,
                    0,
                    abilityDamage
            );
            case WATER -> Ability.freeze(
                    seed.name() + " Frostwake",
                    "Freeze 1 enemy for 1 turn",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1
            );
            case ICE -> Ability.damage(
                    seed.name() + " Hailburst",
                    "Deal " + valueForIceMage(abilityDamage) + " damage to all enemies in Front Row",
                    TargetType.ROW_ENEMIES,
                    Row.FRONT,
                    0,
                    valueForIceMage(abilityDamage)
            );
            case SHADOW -> Ability.damage(
                    seed.name() + " Umbra Volley",
                    "Deal " + abilityDamage + " damage to all enemies in Back Row",
                    TargetType.ROW_ENEMIES,
                    Row.BACK,
                    0,
                    abilityDamage
            );
            case ELECTRIC -> Ability.damage(
                    seed.name() + " Chainflash",
                    "Deal " + (abilityDamage + 1) + " damage to all enemies in Front Row",
                    TargetType.ROW_ENEMIES,
                    Row.FRONT,
                    0,
                    abilityDamage + 1
            );
            default -> Ability.damage(seed.name() + " Bolt", "Deal 3 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 3);
        };
    }

    private static Ability buildAssassinAbility(CreatureSeed seed, int tierValue, int abilityDamage) {
        if (seed.element() == Element.ICE) {
            return Ability.freeze(
                    seed.name() + " Flashfreeze",
                    "Freeze 1 enemy for 1 turn",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1
            );
        }
        if (seed.element() == Element.WIND) {
            return new Ability(
                    seed.name() + " Slipstream",
                    "Set 1 enemy's Speed to 0 for this turn",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1,
                    "speed_zero",
                    1,
                    false
            );
        }
        if (seed.element() == Element.WATER && tierValue >= 2) {
            return Ability.damage(
                    seed.name() + " Undertow Fang",
                    "Deal " + (abilityDamage + 1) + " damage to 1 enemy",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1,
                    abilityDamage + 1
            );
        }
        if (seed.element() == Element.ELECTRIC) {
            return new Ability(
                    seed.name() + " Flashstep",
                    "Set 1 enemy's Speed to 0 for this turn",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1,
                    "speed_zero",
                    1,
                    false
            );
        }
        return Ability.damage(
                seed.name() + " Ambush",
                "Deal " + Math.max(2, abilityDamage) + " damage to 1 enemy",
                TargetType.SINGLE_ENEMY,
                null,
                1,
                Math.max(2, abilityDamage)
        );
    }

    private static List<Notch> buildNotches(CreatureSeed seed) {
        LinkedHashSet<NotchDirection> directions = new LinkedHashSet<>();
        List<NotchDirection> priority = directionalPriority(normalizeRole(seed.role()), seed.element());
        int targetCount = 3 + Math.min(2, rarityTier(seed.rarity()));
        if (evolutionStage(seed) > 0) {
            targetCount += 1;
        }
        if (seed.rarity() == Rarity.LEGENDARY) {
            targetCount += 1;
        }
        targetCount = Math.min(6, targetCount);

        int offset = Math.floorMod(seed.id().hashCode(), priority.size());
        for (int i = 0; directions.size() < targetCount && i < priority.size() * 2; i++) {
            directions.add(priority.get((offset + i) % priority.size()));
        }

        return directions.stream()
                .map(direction -> new Notch(direction, seed.element()))
                .toList();
    }

    private static List<NotchDirection> directionalPriority(String role, Element element) {
        List<NotchDirection> priority = new ArrayList<>(switch (role) {
            case "guardian" -> List.of(NotchDirection.TOP, NotchDirection.LEFT, NotchDirection.RIGHT, NotchDirection.BOTTOM);
            case "mage" -> List.of(NotchDirection.TOP_LEFT, NotchDirection.TOP, NotchDirection.TOP_RIGHT, NotchDirection.RIGHT);
            case "assassin" -> List.of(NotchDirection.RIGHT, NotchDirection.TOP_RIGHT, NotchDirection.BOTTOM_RIGHT, NotchDirection.TOP);
            case "support" -> List.of(NotchDirection.TOP, NotchDirection.LEFT, NotchDirection.RIGHT, NotchDirection.BOTTOM_LEFT);
            default -> List.of(NotchDirection.TOP, NotchDirection.BOTTOM, NotchDirection.RIGHT, NotchDirection.LEFT);
        });

        for (NotchDirection direction : switch (element) {
            case FIRE -> List.of(NotchDirection.TOP, NotchDirection.TOP_RIGHT, NotchDirection.RIGHT, NotchDirection.BOTTOM);
            case EARTH -> List.of(NotchDirection.BOTTOM, NotchDirection.LEFT, NotchDirection.RIGHT, NotchDirection.TOP_LEFT);
            case WIND -> List.of(NotchDirection.TOP_LEFT, NotchDirection.TOP_RIGHT, NotchDirection.RIGHT, NotchDirection.LEFT);
            case WATER -> List.of(NotchDirection.BOTTOM, NotchDirection.BOTTOM_LEFT, NotchDirection.BOTTOM_RIGHT, NotchDirection.LEFT);
            case ICE -> List.of(NotchDirection.TOP, NotchDirection.TOP_LEFT, NotchDirection.LEFT, NotchDirection.BOTTOM);
            case SHADOW -> List.of(NotchDirection.TOP_LEFT, NotchDirection.LEFT, NotchDirection.BOTTOM_LEFT, NotchDirection.TOP);
            case ELECTRIC -> List.of(NotchDirection.TOP_RIGHT, NotchDirection.RIGHT, NotchDirection.BOTTOM_RIGHT, NotchDirection.TOP);
            default -> List.of(NotchDirection.TOP, NotchDirection.RIGHT, NotchDirection.BOTTOM, NotchDirection.LEFT);
        }) {
            if (!priority.contains(direction)) {
                priority.add(direction);
            }
        }

        for (NotchDirection direction : NotchDirection.values()) {
            if (!priority.contains(direction)) {
                priority.add(direction);
            }
        }
        return priority;
    }

    private static int evolutionStage(CreatureSeed seed) {
        int stage = 0;
        String current = resolvedEvolvesFrom(seed);
        while (current != null) {
            stage += 1;
            CreatureSeed previous = CREATURE_BY_ID.get(current);
            current = previous == null ? null : resolvedEvolvesFrom(previous);
        }
        return stage;
    }

    private static String resolvedEvolvesFrom(CreatureSeed seed) {
        if (seed.evolvesFromId() != null) {
            return seed.evolvesFromId();
        }
        return CREATURE_SEEDS.stream()
                .filter(candidate -> seed.id().equals(candidate.evolvesToId()))
                .map(CreatureSeed::id)
                .findFirst()
                .orElse(null);
    }

    private static String normalizeRole(String role) {
        if (role == null || role.isBlank()) {
            return "bruiser";
        }
        return role.trim().toLowerCase(Locale.ROOT);
    }

    private static String elementLabel(Element element) {
        return element.name().charAt(0) + element.name().substring(1).toLowerCase(Locale.ROOT);
    }

    private static int baseHealth(String role) {
        return switch (role) {
            case "guardian" -> 12;
            case "support" -> 11;
            case "bruiser" -> 11;
            case "mage" -> 10;
            case "assassin" -> 10;
            default -> 10;
        };
    }

    private static int baseAttack(String role) {
        return switch (role) {
            case "mage" -> 5;
            case "assassin" -> 4;
            case "bruiser" -> 4;
            case "guardian" -> 3;
            case "support" -> 3;
            default -> 3;
        };
    }

    private static int baseSpeed(String role) {
        return switch (role) {
            case "assassin" -> 7;
            case "support" -> 6;
            case "mage" -> 5;
            case "bruiser" -> 4;
            case "guardian" -> 3;
            default -> 4;
        };
    }

    private static int elementHealthBias(Element element) {
        return switch (element) {
            case EARTH -> 2;
            case WATER -> 1;
            case ICE -> 1;
            case SHADOW -> 1;
            default -> 0;
        };
    }

    private static int attackStageBonus(String role, int stage) {
        if (stage == 0) {
            return 0;
        }
        return role.equals("mage") || role.equals("assassin") || role.equals("bruiser") ? stage : Math.max(0, stage - 1);
    }

    private static int speedRarityBonus(String role, int rarityTier) {
        if (role.equals("assassin") || role.equals("support")) {
            return rarityTier;
        }
        return Math.min(2, rarityTier);
    }

    private static int elementSpeedBias(Element element) {
        return switch (element) {
            case WIND -> 1;
            case ELECTRIC -> 1;
            case EARTH -> -1;
            default -> 0;
        };
    }

    private static int valueForIceMage(int attack) {
        return Math.max(2, attack);
    }

    private static int placementCost(Rarity rarity, int stage) {
        if (rarity == Rarity.LEGENDARY) {
            return 2;
        }
        if (rarity == Rarity.RARE && stage > 0) {
            return 2;
        }
        if (rarity == Rarity.RARE || stage > 0) {
            return 1;
        }
        return 0;
    }

    private static Row preferredRow(String role) {
        return switch (role) {
            case "guardian", "bruiser" -> Row.FRONT;
            case "assassin" -> Row.MIDDLE;
            default -> Row.BACK;
        };
    }
}
