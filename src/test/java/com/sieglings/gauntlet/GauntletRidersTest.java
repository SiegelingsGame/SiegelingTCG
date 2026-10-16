package com.sieglings.gauntlet;

import com.sieglings.model.Ability;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import com.sieglings.service.EffectService;
import com.sieglings.service.MovesPoolService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Forged moves: riders resolve after the move through ordinary effect keys, and a card's
 * forged loadout replaces the pool lookup for that copy only.
 */
class GauntletRidersTest {

    private final EffectService effects = new EffectService();
    private final MovesPoolService pool = new MovesPoolService(new ObjectMapper(), null);
    private final GauntletUpgrades upgrades = new GauntletUpgrades(pool);

    @Test
    void lifestealRiderHealsTheAttackerAfterTheHitLands() {
        GameState state = battleState();
        CardInstance attacker = creature("attacker", Element.FIRE, 1, 1, true);
        CardInstance target = creature("target", Element.EARTH, 2, 1, false);
        attacker.takeRawDamage(5);
        state.setAt(true, 1, 1, attacker);
        state.setAt(false, 2, 1, target);

        Ability strike = Ability.damage("Strike", "Deal 3 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 3);
        strike.setRiders(List.of(GauntletUpgrades.Rider.LIFESTEAL.toAbility("Strike")));

        effects.resolveAbility(state, strike, attacker, true, 2, 1);

        assertTrue(target.getCurrentHealth() < 10, "The primary damage still lands.");
        assertEquals(7, attacker.getCurrentHealth(), "Lifesteal heals the attacker 2 after the hit.");
    }

    @Test
    void siegeRiderHitsTheEnemyPlayerAndCopiesCarryRiders() {
        GameState state = battleState();
        CardInstance attacker = creature("attacker", Element.FIRE, 1, 1, true);
        CardInstance target = creature("target", Element.FIRE, 2, 1, false);
        state.setAt(true, 1, 1, attacker);
        state.setAt(false, 2, 1, target);
        Ability strike = Ability.damage("Strike", "Deal 1 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 1);
        strike.setRiders(List.of(GauntletUpgrades.Rider.SIEGE.toAbility("Strike")));

        Ability copy = strike.copy();
        assertNotSame(strike.getRiders().get(0), copy.getRiders().get(0), "Riders are deep-copied.");
        effects.resolveAbility(state, copy, attacker, true, 2, 1);

        assertEquals(state.getEnemy().getMaxHealth() - 2, state.getEnemy().getHealth());
    }

    @Test
    void forgedMovesStayOnTheirCopyAndRewriteTheirText() {
        SieglingCard card = new SieglingCard("forge-test", "Forge Test", Element.FIRE, Rarity.COMMON, 10, 4,
                List.of(new Notch(NotchDirection.TOP, Element.FIRE), new Notch(NotchDirection.LEFT, Element.WATER)), Row.FRONT);
        Ability strike = Ability.damage("Strike", "Deal 3 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 3);
        strike.setRequiredEnergy(2);
        strike.setRequiredElement(Element.FIRE);
        card.setCustomMoves(List.of(strike));

        upgrades.materialize(card, List.of(
                new GauntletRun.Upgrade(GauntletUpgrades.MOVE_POWER, 0, 2, null, null, "Strike: +2 damage"),
                new GauntletRun.Upgrade(GauntletUpgrades.MOVE_COST, 0, 1, null, null, "Strike: costs 1 less"),
                new GauntletRun.Upgrade(GauntletUpgrades.HEALTH, -1, 3, null, null, "+3 Health"),
                new GauntletRun.Upgrade(GauntletUpgrades.ELEMENT, -1, 0, "ICE", null, "Infuse with Ice")));

        Ability forged = pool.resolvePrintedAbilities(card).get(0);
        assertEquals(5, forged.getEffectValue());
        assertEquals("Deal 5 damage to 1 enemy", forged.getDescription());
        assertEquals(1, forged.getRequiredEnergy());
        assertEquals(Element.ICE, forged.getRequiredElement(), "Infusion moves the move's cost with the card.");
        assertEquals(13, card.getHealth());
        assertEquals(Element.ICE, card.getElement());
        assertEquals(Element.ICE, card.getNotches().get(0).element(), "Own-element notches follow the infusion.");
        assertEquals(Element.WATER, card.getNotches().get(1).element(), "Off-element notches keep bridging combos.");
        SieglingCard copy = card.copy();
        copy.getCustomMoves().get(0).setEffectValue(99);
        assertEquals(5, pool.resolvePrintedAbilities(card).get(0).getEffectValue(), "Copies never share move objects.");
    }

    @Test
    void forgeOffersAreDistinctAndRespectTheCard() {
        SieglingCard card = new SieglingCard("offer-test", "Offer Test", Element.EARTH, Rarity.COMMON, 10, 4, List.of(), Row.FRONT);
        Ability strike = Ability.damage("Strike", "Deal 3 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 3);
        strike.setRequiredEnergy(1);
        card.setCustomMoves(List.of(strike));
        List<GauntletRun.Upgrade> offer = upgrades.offer(card, new java.util.Random(7));
        assertEquals(3, offer.size());
        assertEquals(3, offer.stream().map(GauntletRun.Upgrade::type).distinct().count(), "Three different kinds of upgrade.");
    }

    @Test
    void playerHealthCeilingFollowsTheGauntletMaximum() {
        Player player = new Player("P", true);
        player.setMaxHealthAndRefill(25);
        assertEquals(25, player.getHealth());
        player.takeDirectDamage(10);
        player.healPlayer(40);
        assertEquals(25, player.getHealth(), "Heals cap at the side's own maximum, not the standard 50.");
    }

    private static CardInstance creature(String id, Element element, int row, int col, boolean owner) {
        SieglingCard card = new SieglingCard(id, id, element, Rarity.COMMON, 10, 4, List.of(), Row.MIDDLE);
        return new CardInstance(card, row, col, owner);
    }

    private static GameState battleState() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("AI", false));
        state.setCurrentPhase(Phase.BATTLE);
        return state;
    }
}
