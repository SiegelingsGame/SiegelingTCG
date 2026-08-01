package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.Move;
import com.sieglings.model.MoveCategory;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MovesPoolServiceTest {

    private MovesPoolService pool;

    @BeforeEach
    void setUp() {
        pool = new MovesPoolService(new ObjectMapper(), null);
    }

    @Test
    void waterKitMatchesElementalPoolShapeAndFlowIdentity() {
        List<Move> water = pool.allMovesSorted().stream()
                .filter(m -> m.element() == Element.WATER)
                .filter(m -> !m.id().startsWith("gen:") && !m.id().startsWith("legacy:"))
                .toList();

        assertEquals(25, water.size(), "Water should ship a full 25-move kit like Fire/Earth/Wind/Ice.");

        Map<MoveCategory, Long> byCategory = water.stream()
                .collect(Collectors.groupingBy(Move::category, Collectors.counting()));
        assertEquals(10L, byCategory.getOrDefault(MoveCategory.STANDARD, 0L));
        assertEquals(10L, byCategory.getOrDefault(MoveCategory.SPECIALITY, 0L));
        assertEquals(5L, byCategory.getOrDefault(MoveCategory.UTILITY, 0L));

        Set<String> effects = water.stream().map(Move::effectType).collect(Collectors.toSet());
        assertTrue(effects.contains(AbilityEffectKeys.DRAW), "Flow kit must cycle cards.");
        assertTrue(effects.contains(AbilityEffectKeys.SHIELD), "Flow kit must absorb with Shield.");
        assertTrue(effects.contains(AbilityEffectKeys.SLOW), "Flow kit must erode tempo with Slow.");
        assertFalse(effects.contains(AbilityEffectKeys.FREEZE), "Water must not steal Ice hard control.");
        assertFalse(effects.contains(AbilityEffectKeys.HEAL), "Water must not steal Earth sustain.");
        assertFalse(effects.contains(AbilityEffectKeys.HEALTH_BOOST), "Water must not steal Earth sustain.");

        assertNotNull(pool.getMove("water-sip"));
        assertEquals(TargetType.SELF, pool.getMove("water-sip").targetType());
        assertEquals(AbilityEffectKeys.DRAW, pool.getMove("water-sip").effectType());

        assertNotNull(pool.getMove("water-bubble-veil"));
        assertEquals(AbilityEffectKeys.SHIELD, pool.getMove("water-bubble-veil").effectType());

        assertNotNull(pool.getMove("water-undertow"));
        assertEquals(AbilityEffectKeys.SLOW, pool.getMove("water-undertow").effectType());

        assertEquals(
                EnumSet.of(Element.FIRE, Element.EARTH, Element.WIND, Element.ICE, Element.WATER),
                pool.allMovesSorted().stream()
                        .filter(m -> !m.id().startsWith("gen:") && !m.id().startsWith("legacy:"))
                        .map(Move::element)
                        .collect(Collectors.toCollection(() -> EnumSet.noneOf(Element.class)))
        );
    }
}
