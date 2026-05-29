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
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertIterableEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
        );

        MovesPoolService pool = new MovesPoolService(new ObjectMapper(), null);
        SieglingCard staticap = ManualSieglingCatalog.applyOverrides(Element.ELECTRIC, generated, List.of(definition), pool).stream()
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
        List<com.sieglings.model.Ability> resolved = pool.resolvePrintedAbilities(staticap);
        assertEquals(1, resolved.size());
        assertEquals("Capacitor Bash", resolved.get(0).getName());
        assertEquals("damage", resolved.get(0).getEffectType());
        assertEquals(3, resolved.get(0).getEffectValue());
        assertEquals(TargetType.SINGLE_ENEMY, resolved.get(0).getTargetType());
        assertEquals(Element.ELECTRIC, resolved.get(0).getRequiredElement());
        assertEquals(1, resolved.get(0).getRequiredEnergy());
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
                ),
                null,
                null,
                null,
                null,
                null,
                null
        );

        MovesPoolService pool = new MovesPoolService(new ObjectMapper(), null);
        SieglingCard staticap = ManualSieglingCatalog.applyOverrides(Element.ELECTRIC, generated, List.of(definition), pool).stream()
                .filter(card -> card.getId().equals("staticap"))
                .findFirst()
                .orElseThrow();

        List<com.sieglings.model.Ability> resolved = pool.resolvePrintedAbilities(staticap);
        assertEquals(2, resolved.size());
        assertEquals("Arc Nip", resolved.get(0).getName());
        assertEquals(0, resolved.get(0).getRequiredEnergy());
        assertEquals("Volt Burst", resolved.get(1).getName());
        assertEquals(Element.ELECTRIC, resolved.get(1).getRequiredElement());
        assertEquals(2, resolved.get(1).getRequiredEnergy());
        assertEquals(2, staticap.getMoveIds().size());
        assertEquals(true, staticap.hasMoveLoadout());
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
                null,
                List.of(),
                null,
                null,
                null,
                null,
                null,
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
    void manualSpellDefinitionsAreAuthoritativeWhenPresent() {
        List<SpellCard> generated = GeneratedSpellCatalog.createSpells();

        ManualSieglingCatalog.ManualSieglingDefinition definition = new ManualSieglingCatalog.ManualSieglingDefinition(
                CardType.SPELL,
                "spell_fire_01",
                "Only Ember Bolt",
                Element.FIRE,
                Rarity.COMMON,
                null,
                null,
                null,
                null,
                null,
                null,
                Element.FIRE,
                1,
                new ManualSieglingCatalog.ManualAbilityDefinition(
                        "Only Ember Bolt",
                        "Deal 3 damage to 1 enemy",
                        TargetType.SINGLE_ENEMY,
                        null,
                        1,
                        "damage",
                        3,
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
                null,
                List.of(),
                null,
                null,
                null,
                null,
                null,
                null
        );

        List<SpellCard> spells = ManualSieglingCatalog.applySpellOverrides(generated, List.of(definition));

        assertEquals(List.of("spell_fire_01"), spells.stream().map(SpellCard::getId).toList());
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
                null,
                List.of(),
                null,
                null,
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
    void manualTrapDefinitionsAreAuthoritativeWhenPresent() {
        List<TrapCard> generated = CardDefinitionService.createBaseTraps();

        ManualSieglingCatalog.ManualSieglingDefinition definition = new ManualSieglingCatalog.ManualSieglingDefinition(
                CardType.TRAP,
                "trap03",
                "Only Stone Collapse",
                Element.EARTH,
                Rarity.UNCOMMON,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                new ManualSieglingCatalog.ManualAbilityDefinition(
                        "Only Stone Collapse",
                        "Deal 5 damage to 1 enemy if the opponent has 3 Earth energy",
                        TargetType.SINGLE_ENEMY,
                        null,
                        1,
                        "damage",
                        5,
                        false,
                        null,
                        0,
                        null
                ),
                Element.EARTH,
                3,
                null,
                null,
                null,
                null,
                List.of(),
                null,
                null,
                null,
                null,
                null,
                null
        );

        List<TrapCard> traps = ManualSieglingCatalog.applyTrapOverrides(generated, List.of(definition));

        assertEquals(List.of("trap03"), traps.stream().map(TrapCard::getId).toList());
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
                null,
                List.of(),
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
    void manualDefinitionsCanOverrideCardArtTransform() {
        List<SieglingCard> generated = GeneratedCreatureCatalog.createGeneratedForElement(Element.ELECTRIC);

        ManualSieglingCatalog.ManualSieglingDefinition definition = new ManualSieglingCatalog.ManualSieglingDefinition(
                CardType.SIEGLING,
                "staticap",
                "Staticap",
                Element.ELECTRIC,
                Rarity.RARE,
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
                null,
                null,
                null,
                null,
                null,
                null,
                "/assets/cards/staticap.png",
                "REPLACE",
                12.5,
                -8.0,
                1.35,
                -15.0
        );

        MovesPoolService pool = new MovesPoolService(new ObjectMapper(), null);
        SieglingCard staticap = ManualSieglingCatalog.applyOverrides(Element.ELECTRIC, generated, List.of(definition), pool).stream()
                .filter(card -> card.getId().equals("staticap"))
                .findFirst()
                .orElseThrow();

        assertEquals("/assets/cards/staticap.png", staticap.getCardArtUrl());
        assertEquals("REPLACE", staticap.getCardArtMode());
        assertEquals(12.5, staticap.getCardArtOffsetX());
        assertEquals(-8.0, staticap.getCardArtOffsetY());
        assertEquals(1.35, staticap.getCardArtScale());
        assertEquals(-15.0, staticap.getCardArtRotation());

        ManualSieglingCatalog.ManualSieglingDefinition exported = ManualSieglingCatalog.buildOverrideFile(List.of(staticap)).cards().get(0);
        assertEquals(12.5, exported.cardArtOffsetX());
        assertEquals(-8.0, exported.cardArtOffsetY());
        assertEquals(1.35, exported.cardArtScale());
        assertEquals(-15.0, exported.cardArtRotation());
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
        assertEquals(0, overrideFile.moves().size());

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

    @Test
    void validateCardArtForStorageRejectsEmbeddedDataUrls() {
        ManualSieglingCatalog.ManualSieglingDefinition definition = new ManualSieglingCatalog.ManualSieglingDefinition(
                CardType.SIEGLING,
                "hurrcrane",
                "Hurricrane",
                Element.WIND,
                Rarity.EPIC,
                14,
                16,
                List.of(),
                Row.BACK,
                null,
                null,
                Element.WIND,
                3,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of("move_a"),
                null,
                "data:image/png;base64,abc",
                "REPLACE",
                null,
                null,
                null,
                null
        );

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> ManualSieglingCatalog.validateCardArtForStorage(definition)
        );
        assertTrue(error.getMessage().contains("data URL"));
    }
}
