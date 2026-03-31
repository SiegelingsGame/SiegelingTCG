package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.SpellCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

final class GeneratedSpellCatalog {

    private GeneratedSpellCatalog() {}

    static List<SpellCard> createSpells() {
        List<SpellCard> cards = new ArrayList<>();
        cards.addAll(createElementSpellSet(
                Element.FIRE,
                List.of("Ember", "Cinder", "Blaze", "Ash", "Inferno", "Magma"),
                List.of("Bolt", "Veil", "Surge", "Volley", "Furnace")
        ));
        cards.addAll(createElementSpellSet(
                Element.EARTH,
                List.of("Root", "Stone", "Thorn", "Grove", "Terra", "Granite"),
                List.of("Bind", "Guard", "Burst", "Shelter", "Quake")
        ));
        cards.addAll(createElementSpellSet(
                Element.WIND,
                List.of("Gale", "Tempest", "Zephyr", "Sky", "Storm", "Draft"),
                List.of("Slash", "Lift", "Rush", "Veil", "Howl")
        ));
        cards.addAll(createElementSpellSet(
                Element.WATER,
                List.of("Tide", "Mist", "Coral", "Frost", "Current", "Abyss"),
                List.of("Bind", "Burst", "Flow", "Wake", "Surge")
        ));
        cards.addAll(createElementSpellSet(
                Element.SHADOW,
                List.of("Shade", "Night", "Dusk", "Void", "Hex", "Umbra"),
                List.of("Veil", "Strike", "Rend", "Shroud", "Pulse")
        ));
        cards.addAll(createElementSpellSet(
                Element.ELECTRIC,
                List.of("Volt", "Arc", "Static", "Storm", "Spark", "Thunder"),
                List.of("Burst", "Lance", "Rush", "Surge", "Pulse")
        ));
        cards.addAll(createPairComboSpells());
        cards.addAll(createTripleComboSpells());
        cards.addAll(createQuadComboSpells());
        return cards;
    }

    private static List<SpellCard> createElementSpellSet(Element element, List<String> prefixes, List<String> suffixes) {
        List<SpellCard> spells = new ArrayList<>();
        int index = 1;

        for (String prefix : prefixes) {
            for (String suffix : suffixes) {
                Rarity rarity = switch (index) {
                    case 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 -> Rarity.COMMON;
                    case 11, 12, 13, 14, 15, 16, 17, 18 -> Rarity.UNCOMMON;
                    case 19, 20, 21, 22, 23, 24, 25, 26 -> Rarity.RARE;
                    default -> Rarity.LEGENDARY;
                };
                int cost = 0;
                int power = switch (rarity) {
                    case COMMON -> 1;
                    case UNCOMMON -> 2;
                    case RARE -> 3;
                    case EPIC -> 4;
                    case LEGENDARY -> 5;
                };

                String id = "spell_" + element.name().toLowerCase(Locale.ROOT) + "_" + String.format(Locale.ROOT, "%02d", index);
                String name = prefix + " " + suffix;
                Ability ability = buildElementSpellAbility(element, index, power, name);
                SpellCard spell = new SpellCard(id, name, element, rarity, cost, ability);
                if (index % 7 == 0 && element == Element.FIRE) {
                    spell.setRequiredReaction(Reaction.MIST);
                    spell.getAbility().setRequiredReaction(Reaction.MIST);
                    spell.getAbility().setDescription(spell.getAbility().getDescription() + " (requires Mist)");
                }
                spells.add(spell);
                index += 1;
            }
        }

        return spells;
    }

    private static Ability buildElementSpellAbility(Element element, int index, int cost, String name) {
        int value = Math.max(2, cost + 2);
        int mode = (index - 1) % 5;

        return switch (element) {
            case FIRE -> switch (mode) {
                case 0 -> Ability.damage(name, "Deal " + (value + 1) + " damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, value + 1);
                case 1 -> Ability.damage(name, "Deal " + value + " damage to all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0, value);
                case 2 -> Ability.damage(name, "Deal " + value + " direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, value);
                case 3 -> new Ability(name, "All allies gain +" + Math.max(1, cost - 1) + " Attack this turn", TargetType.ALL_ALLIES, null, 0, "atk_boost", Math.max(1, cost - 1), false);
                default -> new Ability(name, "Destroy 1 enemy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false);
            };
            case EARTH -> switch (mode) {
                case 0 -> new Ability(name, "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false);
                case 1 -> new Ability(name, "All allies gain +" + Math.max(1, cost - 1) + " Defense this turn", TargetType.ALL_ALLIES, null, 0, "def_boost", Math.max(1, cost - 1), false);
                case 2 -> Ability.damage(name, "Deal " + value + " damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, value);
                case 3 -> Ability.heal(name, "Heal 1 ally for " + (value + 1), TargetType.SINGLE_ALLY, null, 1, value + 1);
                default -> new Ability(name, "Destroy 1 enemy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false);
            };
            case WIND -> switch (mode) {
                case 0 -> Ability.damage(name, "Deal " + value + " damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, value);
                case 1 -> new Ability(name, "All allies gain +" + Math.max(1, cost) + " Speed this turn", TargetType.ALL_ALLIES, null, 0, "speed_boost", Math.max(1, cost), false);
                case 2 -> Ability.damage(name, "Deal " + value + " damage to all enemies in Back Row", TargetType.ROW_ENEMIES, Row.BACK, 0, value);
                case 3 -> new Ability(name, "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false);
                default -> Ability.damage(name, "Deal " + Math.max(2, cost) + " direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, Math.max(2, cost));
            };
            case WATER -> switch (mode) {
                case 0 -> Ability.freeze(name, "Freeze 1 enemy for 1 turn", TargetType.SINGLE_ENEMY, null, 1);
                case 1 -> Ability.heal(name, "Heal all allies for " + Math.max(2, cost), TargetType.ALL_ALLIES, null, 0, Math.max(2, cost));
                case 2 -> Ability.damage(name, "Deal " + value + " damage to all enemies in Back Row", TargetType.ROW_ENEMIES, Row.BACK, 0, value);
                case 3 -> new Ability(name, "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false);
                default -> Ability.damage(name, "Deal " + value + " damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, value);
            };
            case SHADOW -> switch (mode) {
                case 0 -> Ability.damage(name, "Deal " + value + " damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, value);
                case 1 -> Ability.damage(name, "Deal " + Math.max(2, cost) + " direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, Math.max(2, cost));
                case 2 -> new Ability(name, "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false);
                case 3 -> new Ability(name, "All allies gain +" + Math.max(1, cost - 1) + " Attack this turn", TargetType.ALL_ALLIES, null, 0, "atk_boost", Math.max(1, cost - 1), false);
                default -> new Ability(name, "Destroy 1 enemy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false);
            };
            case ELECTRIC -> switch (mode) {
                case 0 -> Ability.damage(name, "Deal " + value + " damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, value);
                case 1 -> Ability.damage(name, "Deal " + value + " damage to all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0, value);
                case 2 -> Ability.damage(name, "Deal " + Math.max(2, cost) + " direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, Math.max(2, cost));
                case 3 -> new Ability(name, "All allies gain +" + Math.max(1, cost) + " Speed this turn", TargetType.ALL_ALLIES, null, 0, "speed_boost", Math.max(1, cost), false);
                default -> new Ability(name, "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false);
            };
            case NEUTRAL -> Ability.damage(name, "Deal 3 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 3);
        };
    }

    private static String comboLabel(Element... elements) {
        return Arrays.stream(elements)
                .map(element -> element.name().charAt(0) + element.name().substring(1).toLowerCase(Locale.ROOT))
                .collect(Collectors.joining("-"));
    }

    private static void configureComboSpell(SpellCard spell, int comboSize, Element... comboElements) {
        spell.setCostElement(null);
        spell.setCostAmount(0);
        spell.setRequiredComboSize(comboSize);
        spell.setRequiredComboSignature(Arrays.stream(comboElements)
                .map(Enum::name)
                .sorted()
                .collect(Collectors.joining("+")));
    }

    private static List<SpellCard> createPairComboSpells() {
        List<SpellCard> cards = new ArrayList<>();
        List<Element[]> pairs = List.of(
                new Element[] { Element.FIRE, Element.EARTH },
                new Element[] { Element.FIRE, Element.WIND },
                new Element[] { Element.FIRE, Element.WATER },
                new Element[] { Element.EARTH, Element.WIND },
                new Element[] { Element.EARTH, Element.WATER },
                new Element[] { Element.WIND, Element.WATER }
        );

        int index = 1;
        for (Element[] pair : pairs) {
            String label = comboLabel(pair);
            SpellCard surge = new SpellCard("combo_pair_" + String.format(Locale.ROOT, "%02d", index++),
                    label + " Surge", Element.NEUTRAL, Rarity.RARE, 0,
                    Ability.damage(label + " Surge", "Deal 6 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 6));
            configureComboSpell(surge, 2, pair);
            cards.add(surge);

            SpellCard sweep = new SpellCard("combo_pair_" + String.format(Locale.ROOT, "%02d", index++),
                    label + " Sweep", Element.NEUTRAL, Rarity.RARE, 0,
                    Ability.damage(label + " Sweep", "Deal 4 damage to all enemies in Front Row", TargetType.ROW_ENEMIES, Row.FRONT, 0, 4));
            configureComboSpell(sweep, 2, pair);
            cards.add(sweep);

            SpellCard ward = new SpellCard("combo_pair_" + String.format(Locale.ROOT, "%02d", index++),
                    label + " Ward", Element.NEUTRAL, Rarity.UNCOMMON, 0,
                    new Ability(label + " Ward", "All allies gain +2 Attack this turn", TargetType.ALL_ALLIES, null, 0, "atk_boost", 2, false));
            configureComboSpell(ward, 2, pair);
            cards.add(ward);
        }
        return cards;
    }

    private static List<SpellCard> createTripleComboSpells() {
        List<SpellCard> cards = new ArrayList<>();
        List<Element[]> triples = List.of(
                new Element[] { Element.FIRE, Element.EARTH, Element.WIND },
                new Element[] { Element.FIRE, Element.EARTH, Element.WATER },
                new Element[] { Element.FIRE, Element.WIND, Element.WATER },
                new Element[] { Element.EARTH, Element.WIND, Element.WATER }
        );

        int index = 1;
        for (Element[] triple : triples) {
            String label = comboLabel(triple);
            SpellCard spear = new SpellCard("combo_triple_" + String.format(Locale.ROOT, "%02d", index++),
                    label + " Triad", Element.NEUTRAL, Rarity.RARE, 0,
                    Ability.damage(label + " Triad", "Deal 7 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 7));
            configureComboSpell(spear, 3, triple);
            cards.add(spear);

            SpellCard covenant = new SpellCard("combo_triple_" + String.format(Locale.ROOT, "%02d", index++),
                    label + " Covenant", Element.NEUTRAL, Rarity.RARE, 0,
                    new Ability(label + " Covenant", "All allies gain +2 Defense this turn", TargetType.ALL_ALLIES, null, 0, "def_boost", 2, false));
            configureComboSpell(covenant, 3, triple);
            cards.add(covenant);

            SpellCard cyclone = new SpellCard("combo_triple_" + String.format(Locale.ROOT, "%02d", index++),
                    label + " Tempest", Element.NEUTRAL, Rarity.RARE, 0,
                    Ability.damage(label + " Tempest", "Deal 5 damage to all enemies", TargetType.ALL_ENEMIES, null, 0, 5));
            configureComboSpell(cyclone, 3, triple);
            cards.add(cyclone);
        }
        return cards;
    }

    private static List<SpellCard> createQuadComboSpells() {
        List<String> names = List.of(
                "Grand Crossroads",
                "Worldspark",
                "Fourfold Break",
                "Omniseal",
                "Prism Tide",
                "Skyroot Inferno",
                "Cataclysm Wheel",
                "Elemental Verdict",
                "Confluence Nova",
                "Crown of Four"
        );

        List<SpellCard> cards = new ArrayList<>();
        Element[] signature = { Element.FIRE, Element.EARTH, Element.WIND, Element.WATER };

        for (int i = 0; i < names.size(); i++) {
            String id = "combo_quad_" + String.format(Locale.ROOT, "%02d", i + 1);
            String name = names.get(i);
            Ability ability = switch (i % 5) {
                case 0 -> Ability.damage(name, "Deal 6 damage to all enemies", TargetType.ALL_ENEMIES, null, 0, 6);
                case 1 -> Ability.damage(name, "Deal 8 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 8);
                case 2 -> new Ability(name, "Destroy 1 enemy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false);
                case 3 -> Ability.heal(name, "Heal all allies for 5", TargetType.ALL_ALLIES, null, 0, 5);
                default -> new Ability(name, "All allies gain +3 Speed this turn", TargetType.ALL_ALLIES, null, 0, "speed_boost", 3, false);
            };

            SpellCard spell = new SpellCard(id, name, Element.NEUTRAL, Rarity.LEGENDARY, 0, ability);
            configureComboSpell(spell, 4, signature);
            cards.add(spell);
        }
        return cards;
    }
}
