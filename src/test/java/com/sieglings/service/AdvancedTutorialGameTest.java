package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.GameState;
import com.sieglings.model.enums.Phase;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The advanced chapter deals a fresh match from the end screen, so anything that
 * makes the deal throw leaves the player on the finished board (dead opponent,
 * stale health) with no way back. The sandbox therefore has to survive card ids
 * that the live dashboard has renamed or deleted.
 */
@SpringBootTest
class AdvancedTutorialGameTest {

    @Autowired
    private GameService gameService;

    @Autowired
    private CardDefinitionService cardDefs;

    private int creatureCount(GameState state, boolean player) {
        int count = 0;
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (state.getAt(player, r, c) != null) count++;
            }
        }
        return count;
    }

    @Test
    void dealsAFullLateGameBoard() {
        GameState state = gameService.newAdvancedTutorialGame("Player").state();
        assertEquals(Phase.SETUP, state.getCurrentPhase());
        assertEquals(6, state.getTurnNumber());
        assertTrue(state.isPlayerTurn());
        assertEquals(50, state.getPlayer().getHealth());
        assertEquals(50, state.getEnemy().getHealth());
        assertEquals(5, creatureCount(state, true));
        assertEquals(5, creatureCount(state, false));
        assertEquals(5, state.getPlayer().getHand().size());
        assertNotNull(state.getAt(true, 0, 0));
        assertTrue(state.getAt(true, 0, 0).getTemporaryShield() > 0);
    }

    @Test
    void survivesACardIdThatNoLongerExists() {
        CardDefinitionService spy = Mockito.spy(cardDefs);
        Mockito.doReturn(Optional.empty()).when(spy).findCardCopy("floraknight");
        Mockito.doReturn(Optional.<Card>empty()).when(spy).findCardCopy("spell_earth_01");
        Object original = ReflectionTestUtils.getField(gameService, "cardDefs");
        ReflectionTestUtils.setField(gameService, "cardDefs", spy);
        try {
            GameState state = gameService.newAdvancedTutorialGame("Player").state();
            // The missing slot is simply left empty; everything else still deals.
            assertNull(state.getAt(true, 1, 2));
            assertEquals(4, creatureCount(state, true));
            assertEquals(5, creatureCount(state, false));
            assertEquals(4, state.getPlayer().getHand().size());
        } finally {
            ReflectionTestUtils.setField(gameService, "cardDefs", original);
        }
    }
}
