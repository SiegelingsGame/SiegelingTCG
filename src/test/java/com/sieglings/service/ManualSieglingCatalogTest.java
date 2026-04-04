package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertIterableEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class ManualSieglingCatalogTest {

    @Test
    void manualDefinitionsCanOverrideGeneratedSieglingFields() {
        List<SieglingCard> generated = GeneratedCreatureCatalog.createGeneratedForElement(Element.ELECTRIC);

        ManualSieglingCatalog.ManualSieglingDefinition definition = new ManualSieglingCatalog.ManualSieglingDefinition(
                CardType.SIEGLING,
                "staticap",
                "Staticap",
                Element.ELECTRIC,
                Rarity.RARE,
                17,
                6,
                List.of(
                        new ManualSieglingCatalog.ManualNotchDefinition(NotchDirection.LEFT, Element.ELECTRIC),
                        new ManualSieglingCatalog.ManualNotchDefinition(NotchDirection.TOP, Element.ELECTRIC),
                        new ManualSieglingCatalog.ManualNotchDefinition(NotchDirection.RIGHT, Element.ELECTRIC)
                ),
                Row.FRONT,
                null,
                null,
                Element.ELECTRIC,
                2,
                new ManualSieglingCatalog.ManualAbilityDefinition(
                        "Capacitor Bash",
                        "Deal 3 damage to 1 enemy",
                        TargetType.SINGLE_ENEMY,
                        null,
                        1,
                        "damage",
                        3,
                        false,
                        Element.ELECTRIC,
                        1,
                        null
                ),
                null,
                null,
                null,
                null,
                null,
                null
        );

        SieglingCard staticap = ManualSieglingCatalog.applyOverrides(Element.ELECTRIC, generated, List.of(definition)).stream()
                .filter(card -> card.getId().equals("staticap"))
                .findFirst()
                .orElseThrow();

        assertEquals(Rarity.RARE, staticap.getRarity());
        assertEquals(17, staticap.getHealth());
        assertEquals(6, staticap.getSpeed());
        assertEquals(Row.FRONT, staticap.getPreferredRow());
        assertEquals(Element.ELECTRIC, staticap.getCostElement());
        assertEquals(2, staticap.getCostAmount());
        assertIterableEquals(
                List.of(NotchDirection.LEFT, NotchDirection.TOP, NotchDirection.RIGHT),
                staticap.getNotches().stream().map(notch -> notch.direction()).toList()
        );
        assertNotNull(staticap.getAbility());
        assertEquals("Capacitor Bash", staticap.getAbility().getName());
        assertEquals("damage", staticap.getAbility().getEffectType());
        assertEquals(3, staticap.getAbility().getEffectValue());
        assertEquals(TargetType.SINGLE_ENEMY, staticap.getAbility().getTargetType());
        assertEquals(Element.ELECTRIC, staticap.getAbility().getRequiredElement());
        assertEquals(1, staticap.getAbility().getRequiredEnergy());
    }

    @Test
    void manualDefinitionsCanReplaceAbilityList() {
        List<SieglingCard> generated = GeneratedCreatureCatalog.createGeneratedForElement(Element.ELECTRIC);

        ManualSieglingCatalog.ManualSieglingDefinition definition = new ManualSieglingCatalog.ManualSieglingDefinition(
                CardType.SIEGLING,
                "staticap",
                "Staticap",
                Element.ELECTRIC,
                Rarity.COMMON,
                12,
                4,
                null,
                Row.FRONT,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of(
                        new ManualSieglingCatalog.ManualAbilityDefinition(
                                "Arc Nip",
                                "Deal 2 damage to 1 enemy",
                                TargetType.SINGLE_ENEMY,
                                null,
                                1,
                                "damage",
                                2,
                                false,
                                null,
                                0,
                                null
                        ),
                        new ManualSieglingCatalog.ManualAbilityDefinition(
                                "Volt Burst",
                                "Deal 5 damage to 1 enemy",
                                TargetType.SINGLE_ENEMY,
                                null,
                                1,
                                "damage",
                                5,
                                false,
                                Element.ELECTRIC,
                                2,
                                null
                        )
                )
        );

        SieglingCard staticap = ManualSieglingCatalog.applyOverrides(Element.ELECTRIC, generated, List.of(definition)).stream()
                .filter(card -> card.getId().equals("staticap"))
                .findFirst()
                .orElseThrow();

        assertEquals(2, staticap.getAbilities().size());
        assertEquals("Arc Nip", staticap.getAbilities().get(0).getName());
        assertEquals(0, staticap.getAbilities().get(0).getRequiredEnergy());
        assertEquals("Volt Burst", staticap.getAbilities().get(1).getName());
        assertEquals(Element.ELECTRIC, staticap.getAbilities().get(1).getRequiredElement());
        assertEquals(2, staticap.getAbilities().get(1).getRequiredEnergy());
        assertEquals("Arc Nip", staticap.getAbility().getName());
        assertEquals(true, staticap.hasExplicitAbilityLoadout());
    }

    @Test
    void manualDefinitionsCanOverrideGeneratedSpellFields() {
        List<SpellCard> generated = GeneratedSpellCatalog.createSpells();

        ManualSieglingCatalog.ManualSieglingDefinition definition = new ManualSieglingCatalog.ManualSieglingDefinition(
                CardType.SPELL,
                "spell_fire_01",
                "Edited Ember Bolt",
                Element.FIRE,
                Rarity.RARE,
                null,
                null,
                null,
                null,
                null,
                null,
                Element.FIRE,
                2,
                new ManualSieglingCatalog.ManualAbilityDefinition(
                        "Edited Ember Bolt",
                        "Deal 7 damage to 1 enemy",
                        TargetType.SINGLE_ENEMY,
                        null,
                        1,
                        "damage",
                        7,
                        false,
                        Element.FIRE,
                        2,
                        Reaction.MIST
                ),
                null,
                null,
                Reaction.MIST,
                2,
                "EARTH+FIRE",
                null
        );

        SpellCard spell = ManualSieglingCatalog.applySpellOverrides(generated, List.of(definition)).stream()
                .filter(card -> card.getId().equals("spell_fire_01"))
                .findFirst()
                .orElseThrow();

        assertEquals("Edited Ember Bolt", spell.getName());
        assertEquals(Rarity.RARE, spell.getRarity());
        assertEquals(2, spell.getCostAmount());
        assertEquals(Element.FIRE, spell.getCostElement());
        assertEquals(Reaction.MIST, spell.getRequiredReaction());
        assertEquals(2, spell.getRequiredComboSize());
        assertEquals("EARTH+FIRE", spell.getRequiredComboSignature());
        assertEquals("Edited Ember Bolt", spell.getAbility().getName());
        assertEquals(7, spell.getAbility().getEffectValue());
    }

    @Test
    void manualDefinitionsCanOverrideGeneratedTrapFields() {
        List<TrapCard> generated = CardDefinitionService.createBaseTraps();

        ManualSieglingCatalog.ManualSieglingDefinition definition = new ManualSieglingCatalog.ManualSieglingDefinition(
                CardType.TRAP,
                "trap03",
                "Edited Stone Collapse",
                Element.EARTH,
                Rarity.LEGENDARY,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                new ManualSieglingCatalog.ManualAbilityDefinition(
                        "Edited Stone Collapse",
                        "Deal 9 damage to 1 enemy if the opponent has 4 Earth energy",
                        TargetType.SINGLE_ENEMY,
                        null,
                        1,
                        "damage",
                        9,
                        false,
                        null,
                        0,
                        null
                ),
                Element.EARTH,
                4,
                null,
                null,
                null,
                null
        );

        TrapCard trap = ManualSieglingCatalog.applyTrapOverrides(generated, List.of(definition)).stream()
                .filter(card -> card.getId().equals("trap03"))
                .findFirst()
                .orElseThrow();

        assertEquals("Edited Stone Collapse", trap.getName());
        assertEquals(Rarity.LEGENDARY, trap.getRarity());
        assertEquals(Element.EARTH, trap.getCostElement());
        assertEquals(4, trap.getCostAmount());
        assertEquals("Edited Stone Collapse", trap.getAbility().getName());
        assertEquals(9, trap.getAbility().getEffectValue());
    }

    @Test
    void untypedLegacySpellDefinitionsStillInferSpellTypeFromId() {
        List<SpellCard> generated = GeneratedSpellCatalog.createSpells();

        ManualSieglingCatalog.ManualSieglingDefinition definition = new ManualSieglingCatalog.ManualSieglingDefinition(
                null,
                "spell_fire_06",
                "Legacy Ember Pulse",
                Element.FIRE,
                Rarity.UNCOMMON,
                null,
                null,
                null,
                null,
                null,
                null,
                Element.FIRE,
                1,
                new ManualSieglingCatalog.ManualAbilityDefinition(
                        "Legacy Ember Pulse",
                        "Deal 4 damage to 1 enemy",
                        TargetType.SINGLE_ENEMY,
                        null,
                        1,
                        "damage",
                        4,
                        false,
                        Element.FIRE,
                        1,
                        null
                ),
                null,
                null,
                null,
                null,
                null,
                null
        );

        SpellCard spell = ManualSieglingCatalog.applySpellOverrides(generated, List.of(definition)).stream()
                .filter(card -> card.getId().equals("spell_fire_06"))
                .findFirst()
                .orElseThrow();

        assertEquals("Legacy Ember Pulse", spell.getName());
        assertEquals(1, spell.getCostAmount());
        assertEquals(Element.FIRE, spell.getCostElement());
        assertEquals(4, spell.getAbility().getEffectValue());
    }

    @Test
    void buildOverrideFileExportsSpellAndTrapDefinitions() {
        SpellCard spell = new SpellCard(
                "spell_custom",
                "Custom Spell",
                Element.FIRE,
                Rarity.RARE,
                2,
                Ability.damage("Custom Spell", "Deal 6 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 6)
        );
        spell.setRequiredReaction(Reaction.MIST);
        spell.setRequiredComboSize(2);
        spell.setRequiredComboSignature("EARTH+FIRE");

        TrapCard trap = new TrapCard(
                "trap_custom",
                "Custom Trap",
                Element.WATER,
                Rarity.UNCOMMON,
                Element.FIRE,
                3,
                Ability.freeze("Custom Trap", "Freeze 1 enemy if the opponent has 3 Fire energy", TargetType.SINGLE_ENEMY, null, 1)
        );

        ManualSieglingCatalog.OverrideFile overrideFile = ManualSieglingCatalog.buildOverrideFile(List.of(spell, trap));

        assertEquals(2, overrideFile.cards().size());

        ManualSieglingCatalog.ManualSieglingDefinition exportedSpell = overrideFile.cards().get(0);
        assertEquals(CardType.SPELL, exportedSpell.type());
        assertEquals("spell_custom", exportedSpell.id());
        assertEquals(Element.FIRE, exportedSpell.costElement());
        assertEquals(2, exportedSpell.costAmount());
        assertEquals(Reaction.MIST, exportedSpell.requiredReaction());
        assertEquals(2, exportedSpell.requiredComboSize());
        assertEquals("EARTH+FIRE", exportedSpell.requiredComboSignature());
        assertNotNull(exportedSpell.ability());
        assertEquals("damage", exportedSpell.ability().effectType());
        assertEquals(6, exportedSpell.ability().effectValue());
        assertEquals(0, exportedSpell.abilities().size());

        ManualSieglingCatalog.ManualSieglingDefinition exportedTrap = overrideFile.cards().get(1);
        assertEquals(CardType.TRAP, exportedTrap.type());
        assertEquals("trap_custom", exportedTrap.id());
        assertNull(exportedTrap.costElement());
        assertNull(exportedTrap.costAmount());
        assertEquals(Element.FIRE, exportedTrap.trapBucketElement());
        assertEquals(3, exportedTrap.trapBucketAmount());
        assertNotNull(exportedTrap.ability());
        assertEquals("freeze", exportedTrap.ability().effectType());
        assertEquals(1, exportedTrap.ability().effectValue());
        assertEquals(0, exportedTrap.abilities().size());
    }
}
