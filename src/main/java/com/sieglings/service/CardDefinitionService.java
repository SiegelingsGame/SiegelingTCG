package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Central card registry for the TCG.
 * Creature rosters are generated from the Roblox CreatureData set for the live seven-element format.
 */
@Service
public class CardDefinitionService {

    public record DeckOption(
            String id,
            String name,
            String description,
            List<Element> elements,
            String recommendedTrainerId
    ) {}

    private record EvolutionLine(String rootId, List<SieglingCard> cards) {}
    private record LineChoice(EvolutionLine line, List<Integer> copies) {
        private int totalCopies() {
            return copies.stream().mapToInt(Integer::intValue).sum();
        }
    }
    private record MonsterPlan(List<LineChoice> choices, int score) {}

    private static final int PRESET_SIEGLING_COUNT = 20;
    private static final int PRESET_SPELL_COUNT = 10;
    private static final int PRESET_TRAP_COUNT = 10;
    private static final List<Integer> TEN_CARD_COPY_PATTERN = List.of(3, 3, 2, 2);

    public List<SieglingCard> createFireSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.FIRE);
    }

    public List<SieglingCard> createWaterSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.WATER);
    }

    public List<SieglingCard> createEarthSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.EARTH);
    }

    public List<SieglingCard> createWindSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.WIND);
    }

    public List<SieglingCard> createShadowSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.SHADOW);
    }

    public List<SieglingCard> createIceSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.ICE);
    }

    public List<SieglingCard> createElectricSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.ELECTRIC);
    }

    public List<SieglingCard> createMetalSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.METAL);
    }

    public List<SieglingCard> createUndeadSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.UNDEAD);
    }

    public List<SieglingCard> createPsychicSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.PSYCHIC);
    }

    public List<SpellCard> createSpells() {
        return GeneratedSpellCatalog.createSpells();
    }

    public List<TrapCard> createTraps() {
        List<TrapCard> cards = new ArrayList<>();

        cards.add(new TrapCard("trap01", "Backfire Sigil", Element.FIRE, Rarity.UNCOMMON,
                Element.FIRE, 3,
                Ability.damage("Backfire Sigil", "Deal 4 damage to 1 enemy if the opponent has 3 Fire energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap02", "Magma Breach", Element.FIRE, Rarity.RARE,
                Element.EARTH, 3,
                new Ability("Magma Breach", "Destroy 1 enemy if the opponent has 3 Earth energy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false)));
        cards.add(new TrapCard("trap03", "Stone Collapse", Element.EARTH, Rarity.UNCOMMON,
                Element.EARTH, 3,
                Ability.damage("Stone Collapse", "Deal 5 damage to 1 enemy if the opponent has 3 Earth energy", TargetType.SINGLE_ENEMY, null, 1, 5)));
        cards.add(new TrapCard("trap04", "Root Lock", Element.EARTH, Rarity.RARE,
                Element.WIND, 3,
                new Ability("Root Lock", "Set 1 enemy's Speed to 0 if the opponent has 3 Wind energy", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false)));
        cards.add(new TrapCard("trap05", "Pressure Snap", Element.WATER, Rarity.UNCOMMON,
                Element.WATER, 3,
                Ability.damage("Pressure Snap", "Deal 4 damage to 1 enemy if the opponent has 3 Water energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap06", "Undertow Hex", Element.WATER, Rarity.RARE,
                Element.FIRE, 2,
                Ability.damage("Undertow Hex", "Deal 4 direct damage if the opponent has 2 Fire energy", TargetType.ENEMY_PLAYER, null, 0, 4)));
        cards.add(new TrapCard("trap07", "Crash Draft", Element.WIND, Rarity.UNCOMMON,
                Element.WIND, 3,
                Ability.damage("Crash Draft", "Deal 4 damage to 1 enemy if the opponent has 3 Wind energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap08", "Skyfall Snare", Element.WIND, Rarity.RARE,
                Element.WATER, 3,
                new Ability("Skyfall Snare", "Destroy 1 enemy if the opponent has 3 Water energy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false)));
        cards.add(new TrapCard("trap09", "Void Mirror", Element.SHADOW, Rarity.UNCOMMON,
                Element.SHADOW, 3,
                Ability.damage("Void Mirror", "Deal 4 damage to 1 enemy if the opponent has 3 Shadow energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap10", "Blackout Curse", Element.SHADOW, Rarity.RARE,
                Element.WIND, 2,
                Ability.damage("Blackout Curse", "Deal 4 direct damage if the opponent has 2 Wind energy", TargetType.ENEMY_PLAYER, null, 0, 4)));
        cards.add(new TrapCard("trap11", "Arc Lash", Element.ELECTRIC, Rarity.UNCOMMON,
                Element.WATER, 3,
                Ability.damage("Arc Lash", "Deal 5 damage to 1 enemy if the opponent has 3 Water energy", TargetType.SINGLE_ENEMY, null, 1, 5)));
        cards.add(new TrapCard("trap12", "Grid Crash", Element.ELECTRIC, Rarity.RARE,
                Element.EARTH, 2,
                Ability.damage("Grid Crash", "Deal 4 direct damage if the opponent has 2 Earth energy", TargetType.ENEMY_PLAYER, null, 0, 4)));
        cards.add(new TrapCard("trap13", "Shatter Seal", Element.ICE, Rarity.UNCOMMON,
                Element.ICE, 3,
                Ability.damage("Shatter Seal", "Deal 4 damage to 1 enemy if the opponent has 3 Ice energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap14", "Zero Hour", Element.ICE, Rarity.RARE,
                Element.FIRE, 2,
                Ability.freeze("Zero Hour", "Freeze 1 enemy if the opponent has 2 Fire energy", TargetType.SINGLE_ENEMY, null, 1)));

        // Metal traps
        cards.add(new TrapCard("trap15", "Shrapnel Burst", Element.METAL, Rarity.UNCOMMON,
                Element.METAL, 3,
                Ability.damage("Shrapnel Burst", "Deal 5 damage to 1 enemy if the opponent has 3 Metal energy", TargetType.SINGLE_ENEMY, null, 1, 5)));
        cards.add(new TrapCard("trap16", "Iron Maiden", Element.METAL, Rarity.RARE,
                Element.FIRE, 3,
                new Ability("Iron Maiden", "Destroy 1 enemy if the opponent has 3 Fire energy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false)));

        // Undead traps
        cards.add(new TrapCard("trap17", "Tombstone Trigger", Element.UNDEAD, Rarity.UNCOMMON,
                Element.UNDEAD, 3,
                Ability.damage("Tombstone Trigger", "Deal 4 damage to 1 enemy if the opponent has 3 Undead energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap18", "Death's Toll", Element.UNDEAD, Rarity.RARE,
                Element.SHADOW, 2,
                Ability.damage("Death's Toll", "Deal 5 direct damage if the opponent has 2 Shadow energy", TargetType.ENEMY_PLAYER, null, 0, 5)));

        // Psychic traps
        cards.add(new TrapCard("trap19", "Mind Snare", Element.PSYCHIC, Rarity.UNCOMMON,
                Element.PSYCHIC, 3,
                new Ability("Mind Snare", "Set 1 enemy's Speed to 0 if the opponent has 3 Psychic energy", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false)));
        cards.add(new TrapCard("trap20", "Psychic Shatter", Element.PSYCHIC, Rarity.RARE,
                Element.ELECTRIC, 2,
                Ability.damage("Psychic Shatter", "Deal 4 damage to 1 enemy if the opponent has 2 Electric energy", TargetType.SINGLE_ENEMY, null, 1, 4)));

        return cards;
    }

    public List<TrainerCard> createTrainers() {
        return List.of(
                trainer("trainer01", "Fire Marshal", Element.FIRE, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Vanguard Drill", "Front Row allies gain +1 attack damage", "damage_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        Ability.damage("Kindle Shot", "Deal 2 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 2),
                        false),
                trainer("trainer02", "Flame Tactician", Element.FIRE, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Battle Focus", "All Fire allies gain +1 attack damage", "damage_boost", 1),
                        new Ability("Ignite", "Grant +2 attack damage to 1 ally this turn", TargetType.SINGLE_ALLY, null, 1, "damage_boost", 2, false),
                        false),
                trainer("trainer10", "Inferno Lord", Element.FIRE, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Scorch Banner", "All Fire allies gain +2 attack damage", "damage_boost", 2),
                        Ability.damage("Solar Break", "Deal 4 damage to all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0, 4),
                        true),

                trainer("trainer12", "Root Herald", Element.EARTH, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Stone Line", "Back Row allies gain +1 max Health", "health_boost", 1, Row.BACK, TargetType.ROW_ALLIES),
                        new Ability("Mend Wall", "Grant +1 max Health to 1 ally this turn", TargetType.SINGLE_ALLY, null, 1, "health_boost", 1, false),
                        false),
                trainer("trainer05", "Stone Warden", Element.EARTH, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Roots of Resolve", "All Earth allies gain +1 max Health", "health_boost", 1),
                        Ability.heal("Earthen Shelter", "Heal 1 ally for 4", TargetType.SINGLE_ALLY, null, 1, 4),
                        false),
                trainer("trainer13", "Mountain Regent", Element.EARTH, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Citadel Heart", "All Earth allies gain +2 max Health", "health_boost", 2),
                        new Ability("Granite Oath", "All allies gain +2 max Health this turn", TargetType.ALL_ALLIES, null, 0, "health_boost", 2, false),
                        true),

                trainer("trainer14", "Gale Page", Element.WIND, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Wing Screen", "Front Row allies gain +1 Speed", "speed_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        new Ability("Tailwind Mark", "Increase 1 ally's Speed by 2 this turn", TargetType.SINGLE_ALLY, null, 1, "speed_boost", 2, false),
                        false),
                trainer("trainer06", "Sky Caller", Element.WIND, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Gale Rhythm", "All Wind allies gain +2 Speed", "speed_boost", 2),
                        new Ability("Downdraft", "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false),
                        false),
                trainer("trainer15", "Tempest Regent", Element.WIND, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Storm March", "All Wind allies gain +3 Speed", "speed_boost", 3),
                        new Ability("Skyfall Decree", "Set all enemies in Front Row's Speed to 0 this turn", TargetType.ROW_ENEMIES, Row.FRONT, 0, "speed_zero", 1, false),
                        true),

                trainer("trainer03", "Tide Caller", Element.WATER, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Harbor Screen", "Back Row allies gain +1 max Health", "health_boost", 1, Row.BACK, TargetType.ROW_ALLIES),
                        Ability.heal("Soothing Tide", "Heal 1 ally for 3", TargetType.SINGLE_ALLY, null, 1, 3),
                        false),
                trainer("trainer04", "Frost Sage", Element.WATER, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Frost Flow", "All Water allies gain +1 max Health", "health_boost", 1),
                        Ability.freeze("Deep Freeze", "Freeze 1 enemy", TargetType.SINGLE_ENEMY, null, 1),
                        false),
                trainer("trainer11", "Abyss Sovereign", Element.WATER, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Tidal Bastion", "All Water allies gain +2 max Health", "health_boost", 2),
                        new Ability("Royal Undertow", "Heal all allies for 4", TargetType.ALL_ALLIES, null, 0, "heal", 4, false),
                        true),

                trainer("trainer20", "Rime Scout", Element.ICE, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Cold Screen", "Back Row allies gain +1 max Health", "health_boost", 1, Row.BACK, TargetType.ROW_ALLIES),
                        new Ability("Chill Order", "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false),
                        false),
                trainer("trainer09", "Rime Marshal", Element.ICE, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Winter Bulwark", "All Ice allies gain +1 max Health", "health_boost", 1),
                        Ability.freeze("Whiteout Order", "Freeze 1 enemy", TargetType.SINGLE_ENEMY, null, 1),
                        false),
                trainer("trainer21", "Glacier Monarch", Element.ICE, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Permafrost Crown", "All Ice allies gain +2 max Health", "health_boost", 2),
                        Ability.freeze("Absolute Zero", "Freeze all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0),
                        true),

                trainer("trainer16", "Dusk Acolyte", Element.SHADOW, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Veil Skirmish", "Front Row allies gain +1 attack damage", "damage_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        Ability.damage("Needle Hex", "Deal 2 direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 2),
                        false),
                trainer("trainer07", "Night Regent", Element.SHADOW, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Veil of Hunger", "All Shadow allies gain +1 attack damage", "damage_boost", 1),
                        Ability.damage("Soul Rend", "Deal 3 direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 3),
                        false),
                trainer("trainer17", "Void Sovereign", Element.SHADOW, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Crown of Hunger", "All Shadow allies gain +2 attack damage", "damage_boost", 2),
                        new Ability("Eclipse Verdict", "Destroy 1 enemy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false),
                        true),

                trainer("trainer18", "Spark Courier", Element.ELECTRIC, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passive("Static Step", "All Electric allies gain +1 Speed", "speed_boost", 1),
                        Ability.damage("Arc Jab", "Deal 2 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 2),
                        false),
                trainer("trainer08", "Volt Shepherd", Element.ELECTRIC, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Static Tempo", "All Electric allies gain +2 Speed", "speed_boost", 2),
                        new Ability("Overcharge", "Increase 1 ally's Speed by 3 this turn", TargetType.SINGLE_ALLY, null, 1, "speed_boost", 3, false),
                        false),
                trainer("trainer19", "Storm Chancellor", Element.ELECTRIC, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Grid Dominion", "All Electric allies gain +3 Speed", "speed_boost", 3),
                        Ability.damage("Chain Burst", "Deal 3 damage to all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0, 3),
                        true),

                // Metal trainers
                trainer("trainer22", "Forge Apprentice", Element.METAL, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Plated Line", "Front Row allies gain +1 max Health", "health_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        new Ability("Temper", "Grant +2 max Health to 1 ally this turn", TargetType.SINGLE_ALLY, null, 1, "health_boost", 2, false),
                        false),
                trainer("trainer23", "Iron Warden", Element.METAL, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Steel Resolve", "All Metal allies gain +1 max Health", "health_boost", 1),
                        Ability.damage("Slag Hammer", "Deal 3 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 3),
                        false),
                trainer("trainer24", "Titan Forgemaster", Element.METAL, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Adamant Aegis", "All Metal allies gain +2 max Health", "health_boost", 2),
                        new Ability("Fortress Protocol", "All allies gain +3 max Health this turn", TargetType.ALL_ALLIES, null, 0, "health_boost", 3, false),
                        true),

                // Undead trainers
                trainer("trainer25", "Grave Initiate", Element.UNDEAD, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Death March", "Front Row allies gain +1 attack damage", "damage_boost", 1, Row.FRONT, TargetType.ROW_ALLIES),
                        Ability.damage("Corpse Bolt", "Deal 2 direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 2),
                        false),
                trainer("trainer26", "Crypt Commander", Element.UNDEAD, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Undying Will", "All Undead allies gain +1 attack damage", "damage_boost", 1),
                        Ability.damage("Soul Drain", "Deal 3 direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 3),
                        false),
                trainer("trainer27", "Lich Sovereign", Element.UNDEAD, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Deathless Crown", "All Undead allies gain +2 attack damage", "damage_boost", 2),
                        new Ability("Mass Resurrect", "Heal all allies for 5", TargetType.ALL_ALLIES, null, 0, "heal", 5, false),
                        true),

                // Psychic trainers
                trainer("trainer28", "Mind Acolyte", Element.PSYCHIC, Rarity.UNCOMMON, "SiegeSquire",
                        Ability.passiveRow("Thought Shield", "Back Row allies gain +1 max Health", "health_boost", 1, Row.BACK, TargetType.ROW_ALLIES),
                        new Ability("Confuse", "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false),
                        false),
                trainer("trainer29", "Astral Sage", Element.PSYCHIC, Rarity.RARE, "SiegeKnight",
                        Ability.passive("Psychic Field", "All Psychic allies gain +1 attack damage", "damage_boost", 1),
                        new Ability("Mind Crush", "Grant +3 attack damage to 1 ally this turn", TargetType.SINGLE_ALLY, null, 1, "damage_boost", 3, false),
                        false),
                trainer("trainer30", "Cosmic Overlord", Element.PSYCHIC, Rarity.LEGENDARY, "SiegeLord",
                        Ability.passive("Third Eye", "All Psychic allies gain +2 attack damage", "damage_boost", 2),
                        new Ability("Psychic Storm", "Deal 4 damage to all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0, "damage", 4, false),
                        true)
        );
    }

    public List<DeckOption> getDeckOptions() {
        return List.of(
                new DeckOption("deck_fire", "Blazing Core", "Pure Fire pressure with strong attack lines.", List.of(Element.FIRE), "trainer02"),
                new DeckOption("deck_earth", "Stone Garden", "Pure Earth durability and healing.", List.of(Element.EARTH), "trainer05"),
                new DeckOption("deck_wind", "Gale Talons", "Pure Wind speed and disruption.", List.of(Element.WIND), "trainer06"),
                new DeckOption("deck_water", "Tidal Depths", "Pure Water control and sustain.", List.of(Element.WATER), "trainer04"),
                new DeckOption("deck_ice", "Frostmarch", "Pure Ice lockdown with freezes, slows, and resilient board lines.", List.of(Element.ICE), "trainer09"),
                new DeckOption("deck_shadow", "Night Bloom", "Pure Shadow pressure with ambushes and board picks.", List.of(Element.SHADOW), "trainer07"),
                new DeckOption("deck_electric", "Storm Circuit", "Pure Electric tempo with charged bursts and fast lines.", List.of(Element.ELECTRIC), "trainer08"),
                new DeckOption("deck_fire_earth", "Ashen Roots", "Fire damage backed by Earth bulk and combo payoffs.", List.of(Element.FIRE, Element.EARTH), "trainer05"),
                new DeckOption("deck_water_wind", "Stormtide", "Water control mixed with Wind tempo.", List.of(Element.WATER, Element.WIND), "trainer06"),
                new DeckOption("deck_fire_wind", "Skyflame", "Aggressive Fire and Wind with fast openers.", List.of(Element.FIRE, Element.WIND), "trainer02"),
                new DeckOption("deck_fire_ice", "Cinderfrost", "Burn and freeze lines collide for explosive tempo swings.", List.of(Element.FIRE, Element.ICE), "trainer09"),
                new DeckOption("deck_water_ice", "Glacier Current", "Layered freezes and healing make every lane hard to crack.", List.of(Element.WATER, Element.ICE), "trainer09"),
                new DeckOption("deck_shadow_ice", "Blackfrost Court", "Shadow picks backed by chilling control and lock pieces.", List.of(Element.SHADOW, Element.ICE), "trainer09"),
                new DeckOption("deck_electric_ice", "Cryovolt Array", "Fast charge openings backed by brittle freeze pressure.", List.of(Element.ELECTRIC, Element.ICE), "trainer08"),
                new DeckOption("deck_water_electric", "Undercurrent Grid", "Water control and Electric tempo combine into relentless pressure.", List.of(Element.WATER, Element.ELECTRIC), "trainer08"),
                new DeckOption("deck_quad", "Grand Crossroads", "All four primal elements with the widest combo ceiling.", List.of(Element.FIRE, Element.EARTH, Element.WIND, Element.WATER), "trainer01"),

                // New element pure decks
                new DeckOption("deck_metal", "Iron Bastion", "Pure Metal fortification with armored board presence.", List.of(Element.METAL), "trainer23"),
                new DeckOption("deck_undead", "Grave Dominion", "Pure Undead aggression with relentless pressure.", List.of(Element.UNDEAD), "trainer26"),
                new DeckOption("deck_psychic", "Astral Nexus", "Pure Psychic control with mind-bending disruption.", List.of(Element.PSYCHIC), "trainer29"),

                // Cross-element combo decks featuring new elements
                new DeckOption("deck_metal_fire", "Molten Forge", "Metal durability fueled by Fire's raw power.", List.of(Element.METAL, Element.FIRE), "trainer23"),
                new DeckOption("deck_undead_shadow", "Eternal Night", "Shadow picks paired with Undead resilience.", List.of(Element.UNDEAD, Element.SHADOW), "trainer26"),
                new DeckOption("deck_psychic_ice", "Frozen Mind", "Psychic disruption backed by Ice lockdown.", List.of(Element.PSYCHIC, Element.ICE), "trainer29"),
                new DeckOption("deck_metal_electric", "Charged Armor", "Metal defenses combined with Electric tempo.", List.of(Element.METAL, Element.ELECTRIC), "trainer23"),
                new DeckOption("deck_undead_psychic", "Soul Eclipse", "Undead aggression meets Psychic manipulation.", List.of(Element.UNDEAD, Element.PSYCHIC), "trainer26")
        );
    }

    public int getDeckBuilderMinSize() {
        return 30;
    }

    public int getDeckBuilderMaxCopies() {
        return 3;
    }

    public List<Card> getDeckBuilderCatalog() {
        return Stream.concat(
                        Stream.of(Element.FIRE, Element.EARTH, Element.WIND, Element.WATER, Element.ICE, Element.SHADOW, Element.ELECTRIC, Element.METAL, Element.UNDEAD, Element.PSYCHIC)
                                .flatMap(element -> getSieglingsForElement(element).stream().map(this::copyCard)),
                        Stream.concat(createSpells().stream().map(this::copyCard), createTraps().stream().map(this::copyCard))
                )
                .sorted(Comparator
                        .comparing((Card card) -> switch (card.getCardType().name()) {
                            case "SIEGLING" -> 0;
                            case "SPELL" -> 1;
                            case "TRAP" -> 2;
                            default -> 3;
                        })
                        .thenComparing(card -> card.getElement().name())
                        .thenComparing(card -> rarityOrder(card.getRarity()))
                        .thenComparing(Card::getName))
                .toList();
    }

    public List<Card> buildCustomDeck(List<String> cardIds) {
        if (cardIds == null || cardIds.size() < getDeckBuilderMinSize()) {
            throw new IllegalArgumentException("Custom decks must contain at least " + getDeckBuilderMinSize() + " cards.");
        }

        Map<String, Long> counts = cardIds.stream()
                .collect(Collectors.groupingBy(id -> id, Collectors.counting()));
        for (Map.Entry<String, Long> entry : counts.entrySet()) {
            if (entry.getValue() > getDeckBuilderMaxCopies()) {
                Card card = findCardDefinition(entry.getKey())
                        .orElseThrow(() -> new IllegalArgumentException("Unknown card id: " + entry.getKey()));
                throw new IllegalArgumentException("You can only use up to " + getDeckBuilderMaxCopies()
                        + " copies of " + card.getName() + ".");
            }
        }

        List<Card> deck = new ArrayList<>();
        for (String cardId : cardIds) {
            Card card = findCardDefinition(cardId)
                    .orElseThrow(() -> new IllegalArgumentException("Unknown card id: " + cardId));
            deck.add(copyCard(card));
        }
        return deck;
    }

    public List<Card> buildFireDeck() { return buildDeck(List.of(Element.FIRE)); }
    public List<Card> buildWaterDeck() { return buildDeck(List.of(Element.WATER)); }
    public List<Card> buildEarthDeck() { return buildDeck(List.of(Element.EARTH)); }
    public List<Card> buildWindDeck() { return buildDeck(List.of(Element.WIND)); }
    public List<Card> buildShadowDeck() { return buildDeck(List.of(Element.SHADOW)); }
    public List<Card> buildElectricDeck() { return buildDeck(List.of(Element.ELECTRIC)); }
    public List<Card> buildIceDeck() { return buildDeck(List.of(Element.ICE)); }
    public List<Card> buildMetalDeck() { return buildDeck(List.of(Element.METAL)); }
    public List<Card> buildUndeadDeck() { return buildDeck(List.of(Element.UNDEAD)); }
    public List<Card> buildPsychicDeck() { return buildDeck(List.of(Element.PSYCHIC)); }
    public List<Card> buildPlayerStarterDeck() { return buildDeck(List.of(Element.FIRE, Element.EARTH)); }
    public List<Card> buildEnemyStarterDeck() { return buildDeck(List.of(Element.WATER, Element.WIND)); }

    public TrainerCard getTrainer(Element element) {
        return createTrainers().stream()
                .filter(t -> t.getElement() == element)
                .filter(t -> "SiegeKnight".equals(t.getTier()))
                .findFirst()
                .map(TrainerCard::copy)
                .orElseGet(() -> createTrainers().stream()
                        .filter(t -> t.getElement() == element)
                        .findFirst()
                        .map(TrainerCard::copy)
                        .orElse(createTrainers().get(0).copy()));
    }

    public TrainerCard getTrainerById(String trainerId) {
        return createTrainers().stream()
                .filter(t -> t.getId().equals(trainerId))
                .findFirst()
                .map(TrainerCard::copy)
                .orElse(createTrainers().get(0).copy());
    }

    public Optional<DeckOption> getDeckOption(String deckId) {
        return getDeckOptions().stream().filter(option -> option.id().equals(deckId)).findFirst();
    }

    public List<Card> buildDeckById(String deckId) {
        DeckOption option = getDeckOption(deckId).orElse(getDeckOptions().get(0));
        return buildDeck(option.elements());
    }

    private List<Card> buildDeck(List<Element> orderedElements) {
        if (orderedElements == null || orderedElements.isEmpty()) {
            return List.of();
        }

        List<Element> elementList = orderedElements.stream().distinct().toList();
        Set<Element> elementSet = EnumSet.copyOf(elementList);
        List<Card> deck = new ArrayList<>();
        deck.addAll(buildPresetSieglings(elementList));
        deck.addAll(buildPresetSpells(elementSet));
        deck.addAll(buildPresetTraps(elementSet));
        return deck;
    }

    private List<Card> buildPresetSieglings(List<Element> orderedElements) {
        Map<Element, Integer> targets = new LinkedHashMap<>();
        int baseTarget = PRESET_SIEGLING_COUNT / orderedElements.size();
        int remainder = PRESET_SIEGLING_COUNT % orderedElements.size();
        for (int i = 0; i < orderedElements.size(); i++) {
            targets.put(orderedElements.get(i), baseTarget + (i < remainder ? 1 : 0));
        }

        List<Card> cards = new ArrayList<>();
        for (Element element : orderedElements) {
            MonsterPlan plan = solveMonsterPlan(getEvolutionLinesForElement(element), targets.get(element));
            if (plan == null) {
                throw new IllegalStateException("Unable to build a balanced preset Siegling package for " + element.name());
            }
            for (LineChoice choice : plan.choices()) {
                for (int i = 0; i < choice.line().cards().size(); i++) {
                    addCopies(cards, choice.line().cards().get(i), choice.copies().get(i));
                }
            }
        }
        return cards;
    }

    private List<Card> buildPresetSpells(Set<Element> deckElements) {
        boolean supportsMist = deckElements.contains(Element.FIRE) && deckElements.contains(Element.WATER);
        List<SpellCard> candidates = createSpells().stream()
                .filter(spell -> spellFitsDeck(spell, deckElements))
                .filter(spell -> spell.getRequiredReaction() == null || supportsMist)
                .sorted(Comparator
                        .comparingInt((SpellCard spell) -> spell.getElement() == Element.NEUTRAL ? 1 : 0)
                        .thenComparingInt(spell -> spell.getRequiredComboSize() > 0 ? 1 : 0)
                        .thenComparingInt(SpellCard::getCostAmount)
                        .thenComparingInt(SpellCard::getRequiredComboSize)
                        .thenComparingInt(spell -> rarityOrder(spell.getRarity()))
                        .thenComparing(Card::getName))
                .toList();
        return buildRepeatedPackage(candidates, PRESET_SPELL_COUNT);
    }

    private List<Card> buildPresetTraps(Set<Element> deckElements) {
        List<TrapCard> candidates = createTraps().stream()
                .sorted(Comparator
                        .comparingInt((TrapCard trap) -> deckElements.contains(trap.getElement()) ? 0 : 1)
                        .thenComparingInt(TrapCard::getCostAmount)
                        .thenComparingInt(trap -> rarityOrder(trap.getRarity()))
                        .thenComparing(Card::getName))
                .toList();
        return buildRepeatedPackage(candidates, PRESET_TRAP_COUNT);
    }

    private MonsterPlan solveMonsterPlan(List<EvolutionLine> lines, int targetCards) {
        return solveMonsterPlan(lines, 0, targetCards, new HashMap<>());
    }

    private MonsterPlan solveMonsterPlan(List<EvolutionLine> lines, int index, int remaining,
                                         Map<String, Optional<MonsterPlan>> memo) {
        if (remaining == 0) {
            return new MonsterPlan(List.of(), 0);
        }
        if (remaining < 0 || index >= lines.size()) {
            return null;
        }

        String memoKey = index + ":" + remaining;
        if (memo.containsKey(memoKey)) {
            return memo.get(memoKey).orElse(null);
        }

        EvolutionLine line = lines.get(index);
        MonsterPlan best = solveMonsterPlan(lines, index + 1, remaining, memo);

        for (List<Integer> pattern : generateLineCopyPatterns(line.cards().size(), remaining)) {
            MonsterPlan tail = solveMonsterPlan(lines, index + 1,
                    remaining - pattern.stream().mapToInt(Integer::intValue).sum(), memo);
            if (tail == null) {
                continue;
            }

            List<LineChoice> combined = new ArrayList<>();
            combined.add(new LineChoice(line, pattern));
            combined.addAll(tail.choices());
            MonsterPlan candidate = new MonsterPlan(List.copyOf(combined), tail.score() + lineChoiceScore(line, pattern));
            if (isBetterMonsterPlan(candidate, best)) {
                best = candidate;
            }
        }

        memo.put(memoKey, Optional.ofNullable(best));
        return best;
    }

    private boolean isBetterMonsterPlan(MonsterPlan candidate, MonsterPlan currentBest) {
        if (candidate == null) {
            return false;
        }
        if (currentBest == null) {
            return true;
        }
        if (candidate.score() != currentBest.score()) {
            return candidate.score() < currentBest.score();
        }
        if (candidate.choices().size() != currentBest.choices().size()) {
            return candidate.choices().size() > currentBest.choices().size();
        }
        int candidateEvolutionLines = (int) candidate.choices().stream().filter(choice -> choice.line().cards().size() > 1).count();
        int currentEvolutionLines = (int) currentBest.choices().stream().filter(choice -> choice.line().cards().size() > 1).count();
        return candidateEvolutionLines > currentEvolutionLines;
    }

    private int lineChoiceScore(EvolutionLine line, List<Integer> copies) {
        int stagePenalty = 0;
        for (int i = 0; i < copies.size(); i++) {
            stagePenalty += i * copies.get(i) * 6;
        }
        int soloPenalty = line.cards().size() == 1 ? 24 : line.cards().size() == 2 ? 10 : 0;
        int rarityPenalty = line.cards().stream()
                .mapToInt(card -> rarityOrder(card.getRarity()))
                .sum();
        return soloPenalty + stagePenalty + rarityPenalty - copies.stream().mapToInt(Integer::intValue).sum();
    }

    private List<List<Integer>> generateLineCopyPatterns(int lineSize, int maxTotal) {
        List<List<Integer>> patterns = new ArrayList<>();
        generateLineCopyPatterns(lineSize, maxTotal, 0, 3, 0, new ArrayList<>(), patterns);
        patterns.sort(Comparator
                .comparingInt((List<Integer> pattern) -> pattern.stream().mapToInt(Integer::intValue).sum())
                .reversed()
                .thenComparingInt(pattern -> {
                    int penalty = 0;
                    for (int i = 0; i < pattern.size(); i++) {
                        penalty += i * pattern.get(i);
                    }
                    return penalty;
                }));
        return patterns;
    }

    private void generateLineCopyPatterns(int lineSize, int maxTotal, int index, int maxAtStage, int runningTotal,
                                          List<Integer> current, List<List<Integer>> patterns) {
        if (index == lineSize) {
            if (runningTotal <= maxTotal) {
                patterns.add(List.copyOf(current));
            }
            return;
        }

        int remainingStages = lineSize - index - 1;
        for (int copies = Math.min(3, maxAtStage); copies >= 1; copies--) {
            int minimumPossible = runningTotal + copies + remainingStages;
            if (minimumPossible > maxTotal) {
                continue;
            }
            current.add(copies);
            generateLineCopyPatterns(lineSize, maxTotal, index + 1, copies, runningTotal + copies, current, patterns);
            current.remove(current.size() - 1);
        }
    }

    private List<EvolutionLine> getEvolutionLinesForElement(Element element) {
        List<SieglingCard> cards = getSieglingsForElement(element);
        Map<String, SieglingCard> byId = cards.stream()
                .collect(Collectors.toMap(Card::getId, card -> card, (left, right) -> left, LinkedHashMap::new));
        Map<String, List<SieglingCard>> byRoot = new LinkedHashMap<>();
        for (SieglingCard card : cards) {
            String rootId = resolveEvolutionRoot(card, byId);
            byRoot.computeIfAbsent(rootId, ignored -> new ArrayList<>()).add(card);
        }

        return byRoot.entrySet().stream()
                .map(entry -> new EvolutionLine(
                        entry.getKey(),
                        entry.getValue().stream()
                                .sorted(Comparator
                                        .comparingInt((SieglingCard card) -> evolutionDepth(card, byId))
                                        .thenComparingInt(card -> rarityOrder(card.getRarity()))
                                        .thenComparing(Card::getName))
                                .toList()))
                .sorted(Comparator
                        .comparingInt((EvolutionLine line) -> line.cards().size() == 1 ? 1 : 0)
                        .thenComparing(line -> line.cards().get(0).getName()))
                .toList();
    }

    private String resolveEvolutionRoot(SieglingCard card, Map<String, SieglingCard> byId) {
        SieglingCard current = card;
        while (current.getEvolvesFromId() != null && byId.containsKey(current.getEvolvesFromId())) {
            current = byId.get(current.getEvolvesFromId());
        }
        return current.getId();
    }

    private int evolutionDepth(SieglingCard card, Map<String, SieglingCard> byId) {
        int depth = 0;
        SieglingCard current = card;
        while (current.getEvolvesFromId() != null && byId.containsKey(current.getEvolvesFromId())) {
            current = byId.get(current.getEvolvesFromId());
            depth += 1;
        }
        return depth;
    }

    private <T extends Card> List<Card> buildRepeatedPackage(List<T> orderedCandidates, int targetCount) {
        if (orderedCandidates.isEmpty()) {
            throw new IllegalStateException("Unable to build preset package with no candidates.");
        }

        List<Card> cards = new ArrayList<>();
        Map<String, Integer> counts = new HashMap<>();
        int candidateIndex = 0;
        for (int preferredCopies : TEN_CARD_COPY_PATTERN) {
            T candidate = orderedCandidates.get(candidateIndex % orderedCandidates.size());
            int allowedCopies = Math.min(preferredCopies, getDeckBuilderMaxCopies() - counts.getOrDefault(candidate.getId(), 0));
            for (int i = 0; i < allowedCopies; i++) {
                cards.add(copyCard(candidate));
            }
            counts.put(candidate.getId(), counts.getOrDefault(candidate.getId(), 0) + allowedCopies);
            candidateIndex += 1;
        }

        while (cards.size() < targetCount) {
            boolean addedAny = false;
            for (T candidate : orderedCandidates) {
                if (cards.size() >= targetCount) {
                    break;
                }
                if (counts.getOrDefault(candidate.getId(), 0) >= getDeckBuilderMaxCopies()) {
                    continue;
                }
                cards.add(copyCard(candidate));
                counts.put(candidate.getId(), counts.getOrDefault(candidate.getId(), 0) + 1);
                addedAny = true;
            }
            if (!addedAny) {
                throw new IllegalStateException("Unable to satisfy preset package size without breaking copy limits.");
            }
        }

        return cards;
    }

    private void addCopies(List<Card> deck, Card card, int copies) {
        for (int i = 0; i < copies; i++) {
            deck.add(copyCard(card));
        }
    }

    private List<SieglingCard> getSieglingsForElement(Element element) {
        return switch (element) {
            case FIRE -> createFireSieglings();
            case EARTH -> createEarthSieglings();
            case WIND -> createWindSieglings();
            case WATER -> createWaterSieglings();
            case ICE -> createIceSieglings();
            case SHADOW -> createShadowSieglings();
            case ELECTRIC -> createElectricSieglings();
            case METAL -> createMetalSieglings();
            case UNDEAD -> createUndeadSieglings();
            case PSYCHIC -> createPsychicSieglings();
            default -> List.of();
        };
    }

    private boolean spellFitsDeck(SpellCard spell, Set<Element> deckElements) {
        if (spell.getElement() != Element.NEUTRAL && !deckElements.contains(spell.getElement())) {
            return false;
        }
        if (spell.getRequiredComboSize() > deckElements.size()) {
            return false;
        }
        if (spell.getRequiredComboSignature() == null || spell.getRequiredComboSignature().isBlank()) {
            return true;
        }
        Set<String> names = deckElements.stream().map(Enum::name).collect(Collectors.toSet());
        for (String part : spell.getRequiredComboSignature().split("\\+")) {
            if (!names.contains(part)) {
                return false;
            }
        }
        return true;
    }

    private Optional<Card> findCardDefinition(String cardId) {
        return getDeckBuilderCatalog().stream().filter(card -> card.getId().equals(cardId)).findFirst();
    }

    private Card copyCard(Card card) {
        if (card instanceof SieglingCard siegling) return siegling.copy();
        if (card instanceof SpellCard spell) return spell.copy();
        if (card instanceof TrapCard trap) return trap.copy();
        if (card instanceof TrainerCard trainer) return trainer.copy();
        throw new IllegalArgumentException("Unsupported card type: " + card.getClass().getSimpleName());
    }

    private int rarityOrder(Rarity rarity) {
        return switch (rarity) {
            case COMMON -> 0;
            case UNCOMMON -> 1;
            case RARE -> 2;
            case EPIC -> 3;
            case LEGENDARY -> 4;
        };
    }

    private TrainerCard trainer(String id, String name, Element element, Rarity rarity, String tier,
                                Ability passiveAbility, Ability activeAbility, boolean oncePerGame) {
        return new TrainerCard(id, name, element, rarity, tier, passiveAbility, activeAbility, oncePerGame);
    }
}
