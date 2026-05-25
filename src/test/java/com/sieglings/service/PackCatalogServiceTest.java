package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackCatalogServiceTest {

    @Test
    void packOpeningBuildsFiveCardsWithRequiredTypeMix() throws Exception {
        PackCatalogService service = new PackCatalogService();
        setField(service, "cardDefinitionService", new FakeCardDefinitionService());

        PackCatalogService.PackOpenResult result = service.openPack("pack_fire", true);

        assertEquals(5, result.cards().size());
        Map<CardType, Long> counts = result.cards().stream()
                .collect(Collectors.groupingBy(Card::getCardType, Collectors.counting()));
        assertTrue(counts.getOrDefault(CardType.SIEGLING, 0L) >= 2);
        assertTrue(counts.getOrDefault(CardType.TRAP, 0L) >= 1);
        assertTrue(counts.getOrDefault(CardType.SPELL, 0L) >= 1);
    }

    private void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static class FakeCardDefinitionService extends CardDefinitionService {
        @Override
        public List<String> getActiveLiveElementNames() {
            return List.of("FIRE");
        }

        @Override
        public List<Card> getDeckBuilderCatalog() {
            return List.of(
                    new SieglingCard("draco", "Draco", Element.FIRE, Rarity.COMMON, 7, 3, List.of(), Row.FRONT),
                    new SieglingCard("dracoil", "Dracoil", Element.FIRE, Rarity.RARE, 8, 3, List.of(), Row.FRONT),
                    new SieglingCard("pylook", "Pylook", Element.FIRE, Rarity.COMMON, 5, 4, List.of(), Row.FRONT),
                    new SpellCard("spark", "Spark", Element.FIRE, Rarity.COMMON, 1, Ability.damage("Spark", "", TargetType.SINGLE_ENEMY, null, 1, 1)),
                    new TrapCard("flaretrap", "Flare Trap", Element.FIRE, Rarity.COMMON, Element.FIRE, 2, Ability.damage("Flare", "", TargetType.SINGLE_ENEMY, null, 1, 1))
            );
        }
    }
}
