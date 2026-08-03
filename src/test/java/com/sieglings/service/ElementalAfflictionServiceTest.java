package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.CardInstance;
import com.sieglings.model.ElementalAfflictionCatalog;
import com.sieglings.model.GameState;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.ElementalAffliction;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ElementalAfflictionServiceTest {

    private final ElementalAfflictionService afflictions = new ElementalAfflictionService();
    private final EffectService effectService = new EffectService();

    @BeforeEach
    void wire() {
        ReflectionTestUtils.setField(effectService, "elementalAfflictionService", afflictions);
    }

    @Test
    void catalogCoversEveryNonNeutralElementExactlyOnce() {
        assertEquals(12, ElementalAfflictionCatalog.all().size());
        for (Element element : Element.values()) {
            if (element == Element.NEUTRAL) {
                assertTrue(ElementalAfflictionCatalog.forElement(element).isEmpty());
            } else {
                assertTrue(ElementalAfflictionCatalog.forElement(element).isPresent(),
                        element + " should have an affliction row");
            }
        }
        assertEquals(1, ElementalAfflictionCatalog.battleEnabled().size());
        assertEquals(ElementalAffliction.BURN, ElementalAfflictionCatalog.battleEnabled().get(0).affliction());
    }

    @Test
    void fireDamageAppliesBurnBadgeStacks() {
        GameState state = battleState();
        CardInstance attacker = fireInstance("ember", 1, 0, true);
        CardInstance target = iceInstance("frost", 1, 1, false);
        state.setAt(true, 1, 0, attacker);
        state.setAt(false, 1, 1, target);

        Ability strike = Ability.damage("Ember Strike", "Deal 3 fire damage", TargetType.SINGLE_ENEMY, null, 1, 3);
        effectService.resolveAbility(state, strike, attacker, true, 1, 1);

        // Fire > Ice weakness adds +1, so 4 HP damage and one Burn badge.
        assertEquals(6, target.getCurrentHealth());
        assertEquals(1, target.getAfflictionStacks(ElementalAffliction.BURN));
        assertTrue(state.getGameLog().stream().anyMatch(line -> line.contains("Burn x1")));
    }

    @Test
    void burnStacksCapAndResolveForFlatDamageOnOwnerSetup() {
        GameState state = battleState();
        CardInstance target = iceInstance("frost", 1, 1, true);
        state.setAt(true, 1, 1, target);
        target.addAfflictionStacks(ElementalAffliction.BURN, 3, 5);
        target.addAfflictionStacks(ElementalAffliction.BURN, 10, 5); // cap at 5
        assertEquals(5, target.getAfflictionStacks(ElementalAffliction.BURN));

        afflictions.tickOwnerSetup(state, true);

        assertEquals(5, target.getCurrentHealth(), "5 burn stacks × 1 damage each");
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.BURN), "Burn clears after Setup tick");
        assertTrue(state.getGameLog().stream().anyMatch(line -> line.contains("takes 5 burn damage")));
    }

    @Test
    void nonFireDamageDoesNotInflictUntilItsRowIsBattleEnabled() {
        GameState state = battleState();
        CardInstance attacker = iceInstance("frostbite", 1, 0, true);
        CardInstance target = fireInstance("torch", 1, 1, false);
        state.setAt(true, 1, 0, attacker);
        state.setAt(false, 1, 1, target);

        Ability strike = Ability.damage("Frost Bite", "Deal 2 ice damage", TargetType.SINGLE_ENEMY, null, 1, 2);
        effectService.resolveAbility(state, strike, attacker, true, 1, 1);

        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.CHILL));
        assertTrue(target.getAfflictionStacks().isEmpty());
    }

    @Test
    void fullyBlockedDamageDoesNotInflictBurn() {
        GameState state = battleState();
        CardInstance attacker = fireInstance("ember", 1, 0, true);
        CardInstance target = iceInstance("frost", 1, 1, false);
        target.addShield(10);
        state.setAt(true, 1, 0, attacker);
        state.setAt(false, 1, 1, target);

        Ability strike = Ability.damage("Ember Strike", "Deal 3 fire damage", TargetType.SINGLE_ENEMY, null, 1, 3);
        effectService.resolveAbility(state, strike, attacker, true, 1, 1);

        assertEquals(10, target.getCurrentHealth());
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.BURN));
    }

    private static GameState battleState() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("Enemy", false));
        state.setCurrentPhase(Phase.BATTLE);
        state.setPlayerTurn(true);
        return state;
    }

    private static CardInstance fireInstance(String id, int row, int col, boolean owner) {
        SieglingCard card = new SieglingCard(id, id, Element.FIRE, Rarity.COMMON, 10, 5, List.of(), Row.MIDDLE);
        return new CardInstance(card, row, col, owner);
    }

    private static CardInstance iceInstance(String id, int row, int col, boolean owner) {
        SieglingCard card = new SieglingCard(id, id, Element.ICE, Rarity.COMMON, 10, 5, List.of(), Row.MIDDLE);
        return new CardInstance(card, row, col, owner);
    }
}
