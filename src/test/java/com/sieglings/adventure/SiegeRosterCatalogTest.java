package com.sieglings.adventure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.SieglingCard;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.MovesPoolService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SiegeRosterCatalogTest {

    private CardDefinitionService cardDefs;
    private MovesPoolService movesPool;
    private SiegeContentService content;

    @BeforeEach
    void setUp() throws Exception {
        cardDefs = new CardDefinitionService();
        movesPool = new MovesPoolService(new ObjectMapper(), null);
        content = new SiegeContentService();

        setField(cardDefs, "movesPoolService", movesPool);
        setField(content, "cardDefs", cardDefs);
        setField(content, "movesPool", movesPool);
    }

    @Test
    void selectableSieglingsIncludeStageOneCardsWithResolvableMoves() {
        var selectable = content.selectableSieglings();
        assertFalse(selectable.isEmpty(),
                "Expedition roster should include stage-1 Siegelings with playable moves");
        assertTrue(selectable.stream().anyMatch(s -> "blanky".equals(s.getId()) || "draco".equals(s.getId())),
                "Expected common starters such as blanky or draco in the selectable roster");
    }

    @Test
    void legacyMovesRemainResolvableAfterFullDeckBuilderCatalogLoad() {
        cardDefs.getDeckBuilderCatalog();
        assertTrue(movesPool.getMove("legacy:draco:0") != null || movesPool.getMove("legacy:blanky:0") != null,
                "Legacy manual moves should stay registered after loading every element");
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
