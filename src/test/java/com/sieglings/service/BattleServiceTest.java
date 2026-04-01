package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.BattleAbilityOption;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BattleServiceTest {

    @Test
    void explicitAbilityLoadoutUsesConfiguredAbilitiesAndCosts() throws Exception {
        BattleService battleService = new BattleService();
        setField(battleService, "effectService", new EffectService());
        setField(battleService, "energyService", new EnergyService(new PlacementService()));

        SieglingCard card = new SieglingCard("staticap", "Staticap", Element.ELECTRIC, Rarity.COMMON, 12, 4, List.of(), Row.FRONT);
        card.setAbilities(List.of(
                Ability.connectedAlliesSpeedBoost("Quick Circuit", "Connected allies gain +1 Speed", 1),
                Ability.damage("Volt Crash", "Deal 5 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 5)
        ));
        card.getAbilities().get(1).setRequiredElement(Element.ELECTRIC);
        card.getAbilities().get(1).setRequiredEnergy(2);

        CardInstance attacker = new CardInstance(card, 1, 1, true);

        GameState state = new GameState();
        Player player = new Player("Player", true);
        player.setElectricEnergy(1);
        state.setPlayer(player);
        state.setEnemy(new Player("AI", false));

        List<BattleAbilityOption> options = battleService.getAvailableAbilities(state, attacker);

        assertEquals(2, options.size());
        assertEquals("Quick Circuit", options.get(0).getAbility().getName());
        assertEquals(0, options.get(0).getRequiredEnergy());
        assertTrue(options.get(0).isAffordable());
        assertEquals("Volt Crash", options.get(1).getAbility().getName());
        assertEquals(Element.ELECTRIC, options.get(1).getRequiredElement());
        assertEquals(2, options.get(1).getRequiredEnergy());
        assertFalse(options.get(1).isAffordable());
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }
}
