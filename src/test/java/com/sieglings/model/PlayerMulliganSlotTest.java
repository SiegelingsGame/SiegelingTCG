package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertSame;

class PlayerMulliganSlotTest {
    @Test
    void redrawKeepsUnselectedCardsInTheirSlots() {
        Player player = new Player("Player", true);
        Card first = card("first");
        Card second = card("second");
        Card third = card("third");
        Card next = card("next");
        player.getHand().addAll(List.of(first, second, third));
        player.getDeck().add(next);

        player.mulliganHandAtIndices(List.of(1), false);

        assertSame(first, player.getHand().get(0));
        assertSame(next, player.getHand().get(1));
        assertSame(third, player.getHand().get(2));
        assertSame(second, player.getDeck().get(0));
    }

    private Card card(String id) {
        return new SieglingCard(id, id, Element.FIRE, Rarity.COMMON, 10, 4, List.of(), Row.FRONT);
    }
}
