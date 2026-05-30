package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrainerCard;
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

    @Test
    void siegeKnightCachePackAlwaysIncludesABonusKnight() throws Exception {
        PackCatalogService service = new PackCatalogService();
        setField(service, "cardDefinitionService", new KnightCardDefinitionService());

        PackCatalogService.PackOpenResult result = service.openPack(PackCatalogService.SIEGEKNIGHT_PACK_ID, false);

        assertEquals(5, result.cards().size());
        assertTrue(result.bonusTrainer() != null, "SiegeKnight Cache should always include a knight");
        assertEquals(Element.FIRE, result.bonusTrainer().getElement());
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
        public List<TrainerCard> getTrainerOptions() {
            return List.of();
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

    private static class KnightCardDefinitionService extends FakeCardDefinitionService {
        @Override
        public List<TrainerCard> getTrainerOptions() {
            return List.of(new TrainerCard(
                    "trainer01",
                    "Flame Tactician",
                    Element.FIRE,
                    Rarity.RARE,
                    Ability.passive("Battle Focus", "All Fire allies gain +1 attack damage", "damage_boost", 1),
                    Ability.damage("Kindle Shot", "Deal 2 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 2),
                    false
            ));
        }
    }
}
