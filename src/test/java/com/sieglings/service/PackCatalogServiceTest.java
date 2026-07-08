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
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackCatalogServiceTest {

    @Test
    void packOpeningBuildsFiveCardsWithRequiredTypeMix() throws Exception {
        PackCatalogService service = createService(new FireOnlyCardDefinitions());

        PackCatalogService.PackOpenResult result = service.openPack("pack_fire", true);

        assertEquals(5, result.cards().size());
        Map<CardType, Long> counts = result.cards().stream()
                .collect(Collectors.groupingBy(Card::getCardType, Collectors.counting()));
        assertTrue(counts.getOrDefault(CardType.SIEGLING, 0L) >= 2);
        assertTrue(counts.getOrDefault(CardType.TRAP, 0L) >= 1);
        assertTrue(counts.getOrDefault(CardType.SPELL, 0L) >= 1);
    }

    @Test
    void dailyOffersAlwaysIncludeAKnightStrategyAndDeception() throws Exception {
        PackCatalogService service = createService(new NeutralDropCardDefinitions());

        List<PackCatalogService.DailyCardOffer> offers = service.listDailyOffers();

        assertEquals(5, offers.size());
        Map<CardType, Long> counts = offers.stream()
                .collect(Collectors.groupingBy(offer -> offer.card().getCardType(), Collectors.counting()));
        assertTrue(counts.getOrDefault(CardType.TRAINER, 0L) >= 1, "daily rotation needs a SiegeKnight");
        assertTrue(counts.getOrDefault(CardType.SPELL, 0L) >= 1, "daily rotation needs a Strategy");
        assertTrue(counts.getOrDefault(CardType.TRAP, 0L) >= 1, "daily rotation needs a Deception");
    }

    @Test
    void siegeKnightCachePackAlwaysIncludesABonusKnight() throws Exception {
        PackCatalogService service = createService(new FireKnightCardDefinitions());

        PackCatalogService.PackOpenResult result = service.openPack(PackCatalogService.SIEGEKNIGHT_PACK_ID, false);

        assertEquals(5, result.cards().size());
        assertTrue(result.bonusTrainer() != null, "SiegeKnight Cache should always include a knight");
        assertEquals(Element.FIRE, result.bonusTrainer().getElement());
    }

    @Test
    void shopPacksCanDropNeutralSupportCards() throws Exception {
        PackCatalogService service = createService();

        PackCatalogService.PackOpenResult result = service.openPack("pack_fire", false);

        assertEquals(5, result.cards().size());
        assertTrue(result.cards().stream().anyMatch(card -> card.getElement() == Element.NEUTRAL));
    }

    @Test
    void starterOnlyPackPoolsStayElementLocked() throws Exception {
        PackCatalogService service = createService();
        PackCatalogService.PackDefinition firePack = service.findPack("pack_fire").orElseThrow();

        List<Card> pool = service.cardPoolForPack(firePack, false);

        assertTrue(pool.stream().noneMatch(card -> card.getElement() == Element.NEUTRAL));
    }

    @Test
    void bonusTrainerCandidatesIncludeNeutralKnightsBesideElementKnights() throws Exception {
        PackCatalogService service = createService();
        PackCatalogService.PackDefinition firePack = service.findPack("pack_fire").orElseThrow();

        Set<String> candidateIds = service.bonusTrainerCandidates(firePack).stream()
                .map(TrainerCard::getId)
                .collect(Collectors.toSet());

        assertTrue(candidateIds.contains("trainer-fire"));
        assertTrue(candidateIds.contains("trainer-neutral"));
    }

    @Test
    void dailyOfferSerializationIncludesSiegeKnightArt() throws Exception {
        PackCatalogService service = createService(new FullArtKnightCardDefinitions());
        PackCatalogService.DailyCardOffer offer = service.listDailyOffers().stream()
                .filter(entry -> entry.card().getCardType() == CardType.TRAINER)
                .findFirst()
                .orElseThrow();

        Map<String, Object> serialized = service.serializeDailyOffer(offer);

        assertEquals("new-siegeknight-2", serialized.get("cardId"));
        assertEquals("/img/knights/ser-bob-full-card.png", serialized.get("cardArtUrl"));
        assertEquals("FULL_CARD", serialized.get("cardArtMode"));
        assertEquals("SiegeKnight", serialized.get("tier"));
    }

    private PackCatalogService createService() throws Exception {
        return createService(new NeutralDropCardDefinitions());
    }

    private PackCatalogService createService(CardDefinitionService cardDefinitionService) throws Exception {
        PackCatalogService service = new PackCatalogService();
        Field field = PackCatalogService.class.getDeclaredField("cardDefinitionService");
        field.setAccessible(true);
        field.set(service, cardDefinitionService);
        return service;
    }

    private static class FireOnlyCardDefinitions extends CardDefinitionService {
        @Override
        public List<String> getActiveLiveElementNames() {
            return List.of(Element.FIRE.name());
        }

        @Override
        public List<Card> getDeckBuilderCatalog() {
            return List.of(
                    fireSiegling("fire-a", Row.FRONT),
                    fireSiegling("fire-b", Row.MIDDLE),
                    fireSiegling("fire-c", Row.BACK),
                    new SpellCard("fire-spell", "Fire Spell", Element.FIRE, Rarity.COMMON, 1,
                            Ability.damage("Spark", "Deal 1 damage", TargetType.SINGLE_ENEMY, null, 1, 1)),
                    new TrapCard("fire-trap", "Fire Trap", Element.FIRE, Rarity.COMMON, Element.FIRE, 1,
                            Ability.damage("Snare", "Deal 1 damage", TargetType.SINGLE_ENEMY, null, 1, 1))
            );
        }

        @Override
        public List<TrainerCard> getTrainerOptions() {
            return List.of();
        }

        protected SieglingCard fireSiegling(String id, Row row) {
            return new SieglingCard(id, "Fire Unit", Element.FIRE, Rarity.COMMON, 7, 3, List.of(), row);
        }
    }

    private static class NeutralDropCardDefinitions extends FireOnlyCardDefinitions {
        @Override
        public List<Card> getDeckBuilderCatalog() {
            return List.of(
                    fireSiegling("fire-a", Row.FRONT),
                    fireSiegling("fire-b", Row.MIDDLE),
                    neutralSpell("neutral-spell-a"),
                    neutralSpell("neutral-spell-b"),
                    new TrapCard("neutral-trap", "Neutral Trap", Element.NEUTRAL, Rarity.COMMON, Element.NEUTRAL, 1,
                            Ability.damage("Snare", "Deal 1 damage", TargetType.SINGLE_ENEMY, null, 1, 1))
            );
        }

        @Override
        public List<TrainerCard> getTrainerOptions() {
            return List.of(
                    trainer("trainer-fire", Element.FIRE),
                    trainer("trainer-neutral", Element.NEUTRAL)
            );
        }

        private SpellCard neutralSpell(String id) {
            return new SpellCard(id, "Neutral Spell", Element.NEUTRAL, Rarity.COMMON, 1,
                    Ability.damage("Spark", "Deal 1 damage", TargetType.SINGLE_ENEMY, null, 1, 1));
        }

        private TrainerCard trainer(String id, Element element) {
            return new TrainerCard(
                    id,
                    element == Element.NEUTRAL ? "Neutral Knight" : "Fire Knight",
                    element,
                    Rarity.RARE,
                    Ability.passive("Banner", "Allies gain +1", "damage_boost", 1),
                    Ability.damage("Strike", "Deal 2 damage", TargetType.SINGLE_ENEMY, null, 1, 2),
                    false
            );
        }
    }

    private static class FireKnightCardDefinitions extends FireOnlyCardDefinitions {
        @Override
        public List<TrainerCard> getTrainerOptions() {
            return List.of(new TrainerCard(
                    "trainer-fire",
                    "Fire Knight",
                    Element.FIRE,
                    Rarity.RARE,
                    Ability.passive("Banner", "Allies gain +1", "damage_boost", 1),
                    Ability.damage("Strike", "Deal 2 damage", TargetType.SINGLE_ENEMY, null, 1, 2),
                    false
            ));
        }
    }

    private static class FullArtKnightCardDefinitions extends NeutralDropCardDefinitions {
        @Override
        public List<TrainerCard> getTrainerOptions() {
            TrainerCard serBob = new TrainerCard(
                    "new-siegeknight-2",
                    "Ser Bob",
                    Element.NEUTRAL,
                    Rarity.RARE,
                    Ability.passive("Track Em Down", "Reveal a hidden card", "reveal", 1),
                    Ability.damage("I'll Never Quit!", "Deal 2 damage", TargetType.SINGLE_ENEMY, null, 1, 2),
                    false
            );
            serBob.setCardArtUrl("/img/knights/ser-bob-full-card.png");
            serBob.setCardArtMode("FULL_CARD");
            return List.of(serBob);
        }
    }
}
