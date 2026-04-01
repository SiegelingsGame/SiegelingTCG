package com.sieglings.service;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertIterableEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class ManualSieglingCatalogTest {

    @Test
    void manualDefinitionsCanOverrideGeneratedSieglingFields() {
        List<SieglingCard> generated = GeneratedCreatureCatalog.createGeneratedForElement(Element.ELECTRIC);

        ManualSieglingCatalog.ManualSieglingDefinition definition = new ManualSieglingCatalog.ManualSieglingDefinition(
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
}
