package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.TargetType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Central card registry for the TCG.
 * Creature rosters are generated from the Roblox CreatureData set for the live six-element format.
 */
@Service
public class CardDefinitionService {

    public record DeckOption(
            String id,
            String name,
            String description,
            List<Element> elements,
            String recommendedTrainerId
    ) {}

    public List<SieglingCard> createFireSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.FIRE);
    }

    public List<SieglingCard> createWaterSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.WATER);
    }

    public List<SieglingCard> createEarthSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.EARTH);
    }

    public List<SieglingCard> createWindSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.WIND);
    }

    public List<SieglingCard> createShadowSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.SHADOW);
    }

    public List<SieglingCard> createElectricSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.ELECTRIC);
    }

    public List<SpellCard> createSpells() {
        return GeneratedSpellCatalog.createSpells();
    }

    public List<TrapCard> createTraps() {
        List<TrapCard> cards = new ArrayList<>();

        cards.add(new TrapCard("trap01", "Backfire Sigil", Element.FIRE, Rarity.UNCOMMON,
                Element.FIRE, 3,
                Ability.damage("Backfire Sigil", "Deal 4 damage to 1 enemy if the opponent has 3 Fire energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap02", "Magma Breach", Element.FIRE, Rarity.RARE,
                Element.EARTH, 3,
                new Ability("Magma Breach", "Destroy 1 enemy if the opponent has 3 Earth energy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false)));
        cards.add(new TrapCard("trap03", "Stone Collapse", Element.EARTH, Rarity.UNCOMMON,
                Element.EARTH, 3,
                Ability.damage("Stone Collapse", "Deal 5 damage to 1 enemy if the opponent has 3 Earth energy", TargetType.SINGLE_ENEMY, null, 1, 5)));
        cards.add(new TrapCard("trap04", "Root Lock", Element.EARTH, Rarity.RARE,
                Element.WIND, 3,
                new Ability("Root Lock", "Set 1 enemy's Speed to 0 if the opponent has 3 Wind energy", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false)));
        cards.add(new TrapCard("trap05", "Pressure Snap", Element.WATER, Rarity.UNCOMMON,
                Element.WATER, 3,
                Ability.damage("Pressure Snap", "Deal 4 damage to 1 enemy if the opponent has 3 Water energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap06", "Undertow Hex", Element.WATER, Rarity.RARE,
                Element.FIRE, 2,
                Ability.damage("Undertow Hex", "Deal 4 direct damage if the opponent has 2 Fire energy", TargetType.ENEMY_PLAYER, null, 0, 4)));
        cards.add(new TrapCard("trap07", "Crash Draft", Element.WIND, Rarity.UNCOMMON,
                Element.WIND, 3,
                Ability.damage("Crash Draft", "Deal 4 damage to 1 enemy if the opponent has 3 Wind energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap08", "Skyfall Snare", Element.WIND, Rarity.RARE,
                Element.WATER, 2,
                new Ability("Skyfall Snare", "Destroy 1 enemy if the opponent has 2 Water energy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false)));
        cards.add(new TrapCard("trap09", "Void Mirror", Element.SHADOW, Rarity.UNCOMMON,
                Element.SHADOW, 3,
                Ability.damage("Void Mirror", "Deal 4 damage to 1 enemy if the opponent has 3 Shadow energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap10", "Blackout Curse", Element.SHADOW, Rarity.RARE,
                Element.WIND, 2,
                Ability.damage("Blackout Curse", "Deal 4 direct damage if the opponent has 2 Wind energy", TargetType.ENEMY_PLAYER, null, 0, 4)));
        cards.add(new TrapCard("trap11", "Arc Lash", Element.ELECTRIC, Rarity.UNCOMMON,
                Element.WATER, 3,
                Ability.damage("Arc Lash", "Deal 5 damage to 1 enemy if the opponent has 3 Water energy", TargetType.SINGLE_ENEMY, null, 1, 5)));
        cards.add(new TrapCard("trap12", "Grid Crash", Element.ELECTRIC, Rarity.RARE,
                Element.EARTH, 2,
                Ability.damage("Grid Crash", "Deal 4 direct damage if the opponent has 2 Earth energy", TargetType.ENEMY_PLAYER, null, 0, 4)));

        return cards;
    }

    public List<TrainerCard> createTrainers() {
        return List.of(
                new TrainerCard("trainer01", "Fire Marshal", Element.FIRE, Rarity.UNCOMMON,
                        Ability.passiveRow("Command Presence", "Front Row allies gain +1 Attack", "atk_boost", 1, com.sieglings.model.enums.Row.FRONT, TargetType.ROW_ALLIES),
                        Ability.damage("Rally Cry", "Deal 2 damage to 1 enemy", TargetType.SINGLE_ENEMY, null, 1, 2),
                        false),
                new TrainerCard("trainer02", "Flame Tactician", Element.FIRE, Rarity.RARE,
                        Ability.passive("Battle Focus", "All Fire allies gain +1 Speed", "speed_boost", 1),
                        new Ability("Ignite", "Grant +2 Attack to 1 ally this turn", TargetType.SINGLE_ALLY, null, 1, "atk_boost", 2, false),
                        false),
                new TrainerCard("trainer03", "Tide Caller", Element.WATER, Rarity.UNCOMMON,
                        Ability.passive("Tidal Ward", "All Water allies gain +1 Defense", "def_boost", 1),
                        Ability.heal("Soothing Tide", "Heal 1 ally for 3", TargetType.SINGLE_ALLY, null, 1, 3),
                        false),
                new TrainerCard("trainer04", "Frost Sage", Element.WATER, Rarity.RARE,
                        Ability.passive("Frost Flow", "All Water allies gain +1 Speed", "speed_boost", 1),
                        Ability.freeze("Deep Freeze", "Freeze 1 enemy", TargetType.SINGLE_ENEMY, null, 1),
                        true),
                new TrainerCard("trainer05", "Stone Warden", Element.EARTH, Rarity.UNCOMMON,
                        Ability.passive("Roots of Resolve", "All Earth allies gain +1 Defense", "def_boost", 1),
                        Ability.heal("Earthen Shelter", "Heal 1 ally for 4", TargetType.SINGLE_ALLY, null, 1, 4),
                        false),
                new TrainerCard("trainer06", "Sky Caller", Element.WIND, Rarity.UNCOMMON,
                        Ability.passive("Gale Rhythm", "All Wind allies gain +1 Speed", "speed_boost", 1),
                        new Ability("Downdraft", "Set 1 enemy's Speed to 0 for this turn", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false),
                        false),
                new TrainerCard("trainer07", "Night Regent", Element.SHADOW, Rarity.UNCOMMON,
                        Ability.passive("Veil of Hunger", "All Shadow allies gain +1 Attack", "atk_boost", 1),
                        Ability.damage("Soul Rend", "Deal 3 direct damage to the enemy player", TargetType.ENEMY_PLAYER, null, 0, 3),
                        false),
                new TrainerCard("trainer08", "Volt Shepherd", Element.ELECTRIC, Rarity.UNCOMMON,
                        Ability.passive("Static Tempo", "All Electric allies gain +1 Speed", "speed_boost", 1),
                        new Ability("Overcharge", "Increase 1 ally's Speed by 2 this turn", TargetType.SINGLE_ALLY, null, 1, "speed_boost", 2, false),
                        false)
        );
    }

    public List<DeckOption> getDeckOptions() {
        return List.of(
                new DeckOption("deck_fire", "Blazing Core", "Pure Fire pressure with strong attack lines.", List.of(Element.FIRE), "trainer01"),
                new DeckOption("deck_earth", "Stone Garden", "Pure Earth durability and healing.", List.of(Element.EARTH), "trainer05"),
                new DeckOption("deck_wind", "Gale Talons", "Pure Wind speed and disruption.", List.of(Element.WIND), "trainer06"),
                new DeckOption("deck_water", "Tidal Depths", "Pure Water control and sustain.", List.of(Element.WATER), "trainer03"),
                new DeckOption("deck_shadow", "Night Bloom", "Pure Shadow pressure with ambushes and board picks.", List.of(Element.SHADOW), "trainer07"),
                new DeckOption("deck_electric", "Storm Circuit", "Pure Electric tempo with charged bursts and fast lines.", List.of(Element.ELECTRIC), "trainer08"),
                new DeckOption("deck_fire_earth", "Ashen Roots", "Fire damage backed by Earth bulk and combo payoffs.", List.of(Element.FIRE, Element.EARTH), "trainer05"),
                new DeckOption("deck_water_wind", "Stormtide", "Water control mixed with Wind tempo.", List.of(Element.WATER, Element.WIND), "trainer06"),
                new DeckOption("deck_fire_wind", "Skyflame", "Aggressive Fire and Wind with fast openers.", List.of(Element.FIRE, Element.WIND), "trainer02"),
                new DeckOption("deck_quad", "Grand Crossroads", "All four live elements with the widest combo ceiling.", List.of(Element.FIRE, Element.EARTH, Element.WIND, Element.WATER), "trainer01")
        );
    }

    public int getDeckBuilderMinSize() {
        return 30;
    }

    public int getDeckBuilderMaxCopies() {
        return 3;
    }

    public List<Card> getDeckBuilderCatalog() {
        return Stream.concat(
                        Stream.of(Element.FIRE, Element.EARTH, Element.WIND, Element.WATER, Element.SHADOW, Element.ELECTRIC)
                                .flatMap(element -> getSieglingsForElement(element).stream().map(this::copyCard)),
                        Stream.concat(createSpells().stream().map(this::copyCard), createTraps().stream().map(this::copyCard))
                )
                .sorted(Comparator
                        .comparing((Card card) -> switch (card.getCardType().name()) {
                            case "SIEGLING" -> 0;
                            case "SPELL" -> 1;
                            case "TRAP" -> 2;
                            default -> 3;
                        })
                        .thenComparing(card -> card.getElement().name())
                        .thenComparing(card -> rarityOrder(card.getRarity()))
                        .thenComparing(Card::getName))
                .toList();
    }

    public List<Card> buildCustomDeck(List<String> cardIds) {
        if (cardIds == null || cardIds.size() < getDeckBuilderMinSize()) {
            throw new IllegalArgumentException("Custom decks must contain at least " + getDeckBuilderMinSize() + " cards.");
        }

        Map<String, Long> counts = cardIds.stream()
                .collect(Collectors.groupingBy(id -> id, Collectors.counting()));
        for (Map.Entry<String, Long> entry : counts.entrySet()) {
            if (entry.getValue() > getDeckBuilderMaxCopies()) {
                Card card = findCardDefinition(entry.getKey())
                        .orElseThrow(() -> new IllegalArgumentException("Unknown card id: " + entry.getKey()));
                throw new IllegalArgumentException("You can only use up to " + getDeckBuilderMaxCopies()
                        + " copies of " + card.getName() + ".");
            }
        }

        List<Card> deck = new ArrayList<>();
        for (String cardId : cardIds) {
            Card card = findCardDefinition(cardId)
                    .orElseThrow(() -> new IllegalArgumentException("Unknown card id: " + cardId));
            deck.add(copyCard(card));
        }
        return deck;
    }

    public List<Card> buildFireDeck() { return buildDeck(EnumSet.of(Element.FIRE)); }
    public List<Card> buildWaterDeck() { return buildDeck(EnumSet.of(Element.WATER)); }
    public List<Card> buildEarthDeck() { return buildDeck(EnumSet.of(Element.EARTH)); }
    public List<Card> buildWindDeck() { return buildDeck(EnumSet.of(Element.WIND)); }
    public List<Card> buildShadowDeck() { return buildDeck(EnumSet.of(Element.SHADOW)); }
    public List<Card> buildElectricDeck() { return buildDeck(EnumSet.of(Element.ELECTRIC)); }
    public List<Card> buildPlayerStarterDeck() { return buildDeck(EnumSet.of(Element.FIRE, Element.EARTH)); }
    public List<Card> buildEnemyStarterDeck() { return buildDeck(EnumSet.of(Element.WATER, Element.WIND)); }

    public TrainerCard getTrainer(Element element) {
        return createTrainers().stream()
                .filter(t -> t.getElement() == element)
                .findFirst()
                .map(TrainerCard::copy)
                .orElse(createTrainers().get(0).copy());
    }

    public TrainerCard getTrainerById(String trainerId) {
        return createTrainers().stream()
                .filter(t -> t.getId().equals(trainerId))
                .findFirst()
                .map(TrainerCard::copy)
                .orElse(createTrainers().get(0).copy());
    }

    public Optional<DeckOption> getDeckOption(String deckId) {
        return getDeckOptions().stream().filter(option -> option.id().equals(deckId)).findFirst();
    }

    public List<Card> buildDeckById(String deckId) {
        DeckOption option = getDeckOption(deckId).orElse(getDeckOptions().get(0));
        return buildDeck(EnumSet.copyOf(option.elements()));
    }

    private List<Card> buildDeck(Set<Element> elements) {
        List<Card> deck = new ArrayList<>();
        for (Element element : elements) {
            getSieglingsForElement(element).forEach(card -> deck.add(card.copy()));
        }

        boolean supportsMist = elements.contains(Element.FIRE) && elements.contains(Element.WATER);
        for (SpellCard spell : createSpells()) {
            if (!spellFitsDeck(spell, elements)) {
                continue;
            }
            if (spell.getRequiredReaction() != null && !supportsMist) {
                continue;
            }
            deck.add(spell.copy());
        }

        for (TrapCard trap : createTraps()) {
            if (elements.contains(trap.getElement())) {
                deck.add(trap.copy());
                deck.add(trap.copy());
            }
        }

        return deck;
    }

    private List<SieglingCard> getSieglingsForElement(Element element) {
        return switch (element) {
            case FIRE -> createFireSieglings();
            case EARTH -> createEarthSieglings();
            case WIND -> createWindSieglings();
            case WATER -> createWaterSieglings();
            case SHADOW -> createShadowSieglings();
            case ELECTRIC -> createElectricSieglings();
            case NEUTRAL -> List.of();
        };
    }

    private boolean spellFitsDeck(SpellCard spell, Set<Element> deckElements) {
        if (spell.getElement() != Element.NEUTRAL && !deckElements.contains(spell.getElement())) {
            return false;
        }
        if (spell.getRequiredComboSize() > deckElements.size()) {
            return false;
        }
        if (spell.getRequiredComboSignature() == null || spell.getRequiredComboSignature().isBlank()) {
            return true;
        }
        Set<String> names = deckElements.stream().map(Enum::name).collect(Collectors.toSet());
        for (String part : spell.getRequiredComboSignature().split("\\+")) {
            if (!names.contains(part)) {
                return false;
            }
        }
        return true;
    }

    private Optional<Card> findCardDefinition(String cardId) {
        return getDeckBuilderCatalog().stream().filter(card -> card.getId().equals(cardId)).findFirst();
    }

    private Card copyCard(Card card) {
        if (card instanceof SieglingCard siegling) return siegling.copy();
        if (card instanceof SpellCard spell) return spell.copy();
        if (card instanceof TrapCard trap) return trap.copy();
        if (card instanceof TrainerCard trainer) return trainer.copy();
        throw new IllegalArgumentException("Unsupported card type: " + card.getClass().getSimpleName());
    }

    private int rarityOrder(Rarity rarity) {
        return switch (rarity) {
            case COMMON -> 0;
            case UNCOMMON -> 1;
            case RARE -> 2;
            case LEGENDARY -> 3;
        };
    }
}
