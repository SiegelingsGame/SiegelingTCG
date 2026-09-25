package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.enums.Rarity;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MatchReplayRecorderTest {

    @Test
    void everyLogLineIsAFrameAndTheBoardRidesOnlyWhenItChanges() {
        GameState state = new GameState();
        state.setPlayer(new Player("You", true));
        state.setEnemy(new Player("AI", false));
        state.setTurnNumber(1);
        state.setCurrentPhase(Phase.SETUP);

        state.log("Game started!");
        SieglingCard bearby = new SieglingCard("bearby", "Bearby", Element.FIRE, Rarity.COMMON, 11, 3,
                List.of(new Notch(NotchDirection.RIGHT, Element.FIRE)), null);
        CardInstance unit = new CardInstance(bearby, 1, 1, true);
        state.setAt(true, 1, 1, unit);
        state.log("You place Bearby.");
        state.log("Nothing changes on the board here.");
        unit.setCurrentHealth(7);
        state.getEnemy().takeDirectDamage(5);
        state.log("Bearby takes 4 damage.");

        List<Map<String, Object>> frames = state.getReplay().frames();
        assertEquals(4, frames.size());
        assertEquals("You place Bearby.", frames.get(1).get("m"));
        assertEquals("SETUP", frames.get(1).get("p"));
        assertTrue(frames.get(0).containsKey("b"), "the first frame carries the (empty) board");
        assertTrue(frames.get(1).containsKey("b"), "placing a card changes the board");
        assertFalse(frames.get(2).containsKey("b"), "an unchanged board is carried forward, not repeated");
        assertTrue(frames.get(3).containsKey("b"), "damage changes the board");
        assertEquals(45, frames.get(3).get("eh"));

        @SuppressWarnings("unchecked")
        Map<String, Object> cell = ((List<Map<String, Object>>) frames.get(3).get("b")).getFirst();
        assertEquals("p", cell.get("s"));
        assertEquals("bearby", cell.get("id"));
        assertEquals(7, cell.get("hp"));

        Map<String, Object> card = state.getReplay().cards().get("bearby");
        assertEquals("Bearby", card.get("name"));
        assertEquals(List.of("RIGHT:FIRE"), card.get("notches"));
    }

    @Test
    void replayKeepsTheWholeMatchWhileTheLiveLogIsTrimmed() {
        GameState state = new GameState();
        state.setPlayer(new Player("You", true));
        state.setEnemy(new Player("AI", false));
        for (int i = 0; i < 150; i++) {
            state.log("line " + i);
        }
        assertTrue(state.getGameLog().size() <= 100);
        assertEquals(150, state.getReplay().frames().size());
        assertEquals("line 0", state.getReplay().frames().getFirst().get("m"));
    }
}
