package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Central card registry for the TCG.
 * Creature rosters are generated from the Roblox CreatureData set for the live seven-element format.
 */
@Service
public class CardDefinitionService {

    @Autowired(required = false)
    private PresetDeckCatalogService presetDeckCatalogService;

    @Autowired(required = false)
    private TrainerCatalogService trainerCatalogService;

    @Autowired(required = false)
    private LiveElementCatalogService liveElementCatalogService;

    @Autowired(required = false)
    private MovesPoolService movesPoolService;

    private MovesPoolService fallbackMovesPool;

    public record DeckOption(
            String id,
            String name,
            String description,
            List<Element> elements,
            String recommendedTrainerId
    ) {}

    private record EvolutionLine(String rootId, List<SieglingCard> cards) {}
    private record LineChoice(EvolutionLine line, List<Integer> copies) {
        private int totalCopies() {
            return copies.stream().mapToInt(Integer::intValue).sum();
        }
    }
    private record MonsterPlan(List<LineChoice> choices, int score) {}

    private static final int PRESET_SIEGLING_COUNT = 20;
    private static final int PRESET_SPELL_COUNT = 10;
    private static final int PRESET_TRAP_COUNT = 10;
    private static final List<Integer> TEN_CARD_COPY_PATTERN = List.of(3, 3, 2, 2);

    public List<SieglingCard> createFireSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.FIRE, movesPool());
    }

    public List<SieglingCard> createWaterSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.WATER, movesPool());
    }

    public List<SieglingCard> createEarthSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.EARTH, movesPool());
    }

    public List<SieglingCard> createWindSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.WIND, movesPool());
    }

    public List<SieglingCard> createShadowSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.SHADOW, movesPool());
    }

    public List<SieglingCard> createIceSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.ICE, movesPool());
    }

    public List<SieglingCard> createElectricSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.ELECTRIC, movesPool());
    }

    public List<SieglingCard> createMetalSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.METAL, movesPool());
    }

    public List<SieglingCard> createUndeadSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.UNDEAD, movesPool());
    }

    public List<SieglingCard> createPsychicSieglings() {
        return GeneratedCreatureCatalog.createForElement(Element.PSYCHIC, movesPool());
    }

    private MovesPoolService movesPool() {
        if (movesPoolService != null) {
            return movesPoolService;
        }
        if (fallbackMovesPool == null) {
            fallbackMovesPool = new MovesPoolService(new ObjectMapper(), null);
        }
        return fallbackMovesPool;
    }

    private void syncMovesPoolFromSources() {
        if (movesPoolService != null) {
            movesPoolService.syncFromSources();
        } else {
            movesPool().syncFromSources();
        }
    }

    public List<SpellCard> createSpells() {
        return ManualSieglingCatalog.applySpellOverrides(GeneratedSpellCatalog.createSpells());
    }

    public List<TrapCard> createTraps() {
        return ManualSieglingCatalog.applyTrapOverrides(createBaseTraps());
    }

    static List<TrapCard> createBaseTraps() {
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
                Element.WATER, 3,
                new Ability("Skyfall Snare", "Destroy 1 enemy if the opponent has 3 Water energy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false)));
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
        cards.add(new TrapCard("trap13", "Shatter Seal", Element.ICE, Rarity.UNCOMMON,
                Element.ICE, 3,
                Ability.damage("Shatter Seal", "Deal 4 damage to 1 enemy if the opponent has 3 Ice energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap14", "Zero Hour", Element.ICE, Rarity.RARE,
                Element.FIRE, 2,
                Ability.freeze("Zero Hour", "Freeze 1 enemy if the opponent has 2 Fire energy", TargetType.SINGLE_ENEMY, null, 1)));

        // Metal traps
        cards.add(new TrapCard("trap15", "Shrapnel Burst", Element.METAL, Rarity.UNCOMMON,
                Element.METAL, 3,
                Ability.damage("Shrapnel Burst", "Deal 5 damage to 1 enemy if the opponent has 3 Metal energy", TargetType.SINGLE_ENEMY, null, 1, 5)));
        cards.add(new TrapCard("trap16", "Iron Maiden", Element.METAL, Rarity.RARE,
                Element.FIRE, 3,
                new Ability("Iron Maiden", "Destroy 1 enemy if the opponent has 3 Fire energy", TargetType.SINGLE_ENEMY, null, 1, "destroy", 0, false)));

        // Undead traps
        cards.add(new TrapCard("trap17", "Tombstone Trigger", Element.UNDEAD, Rarity.UNCOMMON,
                Element.UNDEAD, 3,
                Ability.damage("Tombstone Trigger", "Deal 4 damage to 1 enemy if the opponent has 3 Undead energy", TargetType.SINGLE_ENEMY, null, 1, 4)));
        cards.add(new TrapCard("trap18", "Death's Toll", Element.UNDEAD, Rarity.RARE,
                Element.SHADOW, 2,
                Ability.damage("Death's Toll", "Deal 5 direct damage if the opponent has 2 Shadow energy", TargetType.ENEMY_PLAYER, null, 0, 5)));

        // Psychic traps
        cards.add(new TrapCard("trap19", "Mind Snare", Element.PSYCHIC, Rarity.UNCOMMON,
                Element.PSYCHIC, 3,
                new Ability("Mind Snare", "Set 1 enemy's Speed to 0 if the opponent has 3 Psychic energy", TargetType.SINGLE_ENEMY, null, 1, "speed_zero", 1, false)));
        cards.add(new TrapCard("trap20", "Psychic Shatter", Element.PSYCHIC, Rarity.RARE,
                Element.ELECTRIC, 2,
                Ability.damage("Psychic Shatter", "Deal 4 damage to 1 enemy if the opponent has 2 Electric energy", TargetType.SINGLE_ENEMY, null, 1, 4)));

        return cards;
    }

    public List<TrainerCard> createTrainers() {
        return loadTrainerDefinitions().stream()
                .map(this::toTrainerCard)
                .toList();
    }

    public List<DeckOption> getDeckOptions() {
        return loadPlayablePresetDeckDefinitions().stream()
                .map(this::toDeckOption)
                .toList();
    }

    /** Element names currently active for matchmaking / deck builder (from Firestore when configured). */
    public List<String> getActiveLiveElementNames() {
        return activeGameplayElements().stream().map(Enum::name).toList();
    }

    public int getDeckBuilderMinSize() {
        return 30;
    }

    public int getDeckBuilderMaxCopies() {
        return 3;
    }

    public List<TrainerCatalogService.TrainerDefinition> getStoredTrainerDefinitions() {
        return loadTrainerDefinitions();
    }

    public boolean hasTrainer(String trainerId) {
        String normalizedTrainerId = normalizeTrainerId(trainerId);
        return normalizedTrainerId != null && loadTrainerDefinitions().stream()
                .anyMatch(definition -> normalizedTrainerId.equals(definition.id()));
    }

    public boolean isTrainerActive(String trainerId) {
        String normalizedTrainerId = normalizeTrainerId(trainerId);
        return normalizedTrainerId != null && loadTrainerDefinitions().stream()
                .anyMatch(definition -> normalizedTrainerId.equals(definition.id()) && isTrainerActive(definition));
    }

    public Optional<TrainerCard> getActiveTrainerById(String trainerId) {
        String normalizedTrainerId = normalizeTrainerId(trainerId);
        if (normalizedTrainerId == null) {
            return Optional.empty();
        }
        return loadTrainerDefinitions().stream()
                .filter(CardDefinitionService::isTrainerActive)
                .filter(this::trainerElementIsLive)
                .filter(definition -> normalizedTrainerId.equals(definition.id()))
                .findFirst()
                .map(this::toTrainerCard)
                .map(TrainerCard::copy);
    }

    public List<Card> getDeckBuilderCatalog() {
        syncMovesPoolFromSources();
        Set<Element> live = activeGameplayElements();
        return Stream.concat(
                        LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER.stream()
                                .filter(live::contains)
                                .flatMap(element -> getSieglingsForElement(element).stream().map(this::copyCard)),
                        Stream.concat(
                                createSpells().stream().filter(this::isSpellLiveForMeta).map(this::copyCard),
                                createTraps().stream().filter(this::isTrapLiveForMeta).map(this::copyCard)
                        )
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

    /** Card editor / export sometimes appends {@code -copy} when duplicating rows; resolve to catalog ids. */
    private static final String EDITOR_COPY_SUFFIX = "-copy";

    public List<Card> buildCustomDeck(List<String> cardIds) {
        if (cardIds == null || cardIds.size() < getDeckBuilderMinSize()) {
            throw new IllegalArgumentException("Custom decks must contain at least " + getDeckBuilderMinSize() + " cards.");
        }

        List<String> canonicalIds = cardIds.stream().map(this::resolveToCatalogCardId).toList();

        Map<String, Long> counts = canonicalIds.stream()
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
        for (String canonicalId : canonicalIds) {
            Card card = findCardDefinition(canonicalId)
                    .orElseThrow(() -> new IllegalArgumentException("Unknown card id: " + canonicalId));
            deck.add(copyCard(card));
        }
        return deck;
    }

    private String resolveToCatalogCardId(String cardId) {
        if (cardId == null || cardId.isBlank()) {
            throw new IllegalArgumentException("Card id cannot be empty.");
        }
        String candidate = cardId.trim();
        while (true) {
            Optional<Card> found = findCardDefinition(candidate);
            if (found.isPresent()) {
                return found.get().getId();
            }
            if (!candidate.endsWith(EDITOR_COPY_SUFFIX)) {
                throw new IllegalArgumentException("Unknown card id: " + cardId);
            }
            candidate = candidate.substring(0, candidate.length() - EDITOR_COPY_SUFFIX.length());
        }
    }

    public List<Card> buildFireDeck() { return buildDeck(List.of(Element.FIRE)); }
    public List<Card> buildWaterDeck() { return buildDeck(List.of(Element.WATER)); }
    public List<Card> buildEarthDeck() { return buildDeck(List.of(Element.EARTH)); }
    public List<Card> buildWindDeck() { return buildDeck(List.of(Element.WIND)); }
    public List<Card> buildShadowDeck() { return buildDeck(List.of(Element.SHADOW)); }
    public List<Card> buildElectricDeck() { return buildDeck(List.of(Element.ELECTRIC)); }
    public List<Card> buildIceDeck() { return buildDeck(List.of(Element.ICE)); }
    public List<Card> buildMetalDeck() { return buildDeck(List.of(Element.METAL)); }
    public List<Card> buildUndeadDeck() { return buildDeck(List.of(Element.UNDEAD)); }
    public List<Card> buildPsychicDeck() { return buildDeck(List.of(Element.PSYCHIC)); }
    public List<Card> buildPlayerStarterDeck() { return buildDeck(List.of(Element.FIRE, Element.EARTH)); }
    public List<Card> buildEnemyStarterDeck() { return buildDeck(List.of(Element.WATER, Element.WIND)); }

    public TrainerCard getTrainer(Element element) {
        List<TrainerCard> activeTrainers = getTrainerOptions();
        if (activeTrainers.isEmpty()) {
            return createTrainers().get(0).copy();
        }
        return activeTrainers.stream()
                .filter(t -> t.getElement() == element)
                .filter(t -> "SiegeKnight".equals(t.getTier()))
                .findFirst()
                .map(TrainerCard::copy)
                .orElseGet(() -> activeTrainers.stream()
                        .filter(t -> t.getElement() == element)
                        .findFirst()
                        .map(TrainerCard::copy)
                        .orElse(activeTrainers.get(0).copy()));
    }

    public TrainerCard getTrainerById(String trainerId) {
        String normalizedTrainerId = normalizeTrainerId(trainerId);
        List<TrainerCard> allTrainers = createTrainers();
        return allTrainers.stream()
                .filter(t -> t.getId().equals(normalizedTrainerId))
                .findFirst()
                .map(TrainerCard::copy)
                .orElse(allTrainers.get(0).copy());
    }

    public List<TrainerCard> getTrainerOptions() {
        return loadTrainerDefinitions().stream()
                .filter(CardDefinitionService::isTrainerActive)
                .filter(this::trainerElementIsLive)
                .map(this::toTrainerCard)
                .map(TrainerCard::copy)
                .toList();
    }

    public Optional<DeckOption> getDeckOption(String deckId) {
        return loadPlayablePresetDeckDefinitions().stream()
                .filter(definition -> definition.id().equals(deckId))
                .findFirst()
                .map(this::toDeckOption);
    }

    public Optional<DeckOption> getDefaultDeckOption() {
        List<DeckOption> options = getDeckOptions();
        if (options.isEmpty()) {
            return Optional.empty();
        }
        return options.stream()
                .filter(option -> option.id().equals("deck_fire_earth"))
                .findFirst()
                .or(() -> Optional.of(options.get(0)));
    }

    public List<Card> buildDeckById(String deckId) {
        List<PresetDeckCatalogService.PresetDeckDefinition> playable = loadPlayablePresetDeckDefinitions();
        if (playable.isEmpty()) {
            throw new IllegalStateException("No playable preset decks are available for the current live element roster.");
        }
        PresetDeckCatalogService.PresetDeckDefinition definition = playable.stream()
                .filter(option -> option.id().equals(deckId))
                .findFirst()
                .orElseGet(() -> playable.stream()
                        .filter(option -> option.id().equals("deck_fire_earth"))
                        .findFirst()
                        .orElseGet(() -> playable.stream().findFirst().orElseThrow()));
        return buildDeck(definition);
    }

    public List<PresetDeckCatalogService.PresetDeckDefinition> getStoredDeckDefinitions() {
        return loadPresetDeckDefinitions();
    }

    private List<Card> buildDeck(List<Element> orderedElements) {
        if (orderedElements == null || orderedElements.isEmpty()) {
            return List.of();
        }

        List<Element> elementList = orderedElements.stream().distinct().toList();
        Set<Element> elementSet = EnumSet.copyOf(elementList);
        List<Card> deck = new ArrayList<>();
        deck.addAll(buildPresetSieglings(elementList));
        deck.addAll(buildPresetSpells(elementSet));
        deck.addAll(buildPresetTraps(elementSet));
        return deck;
    }

    private List<Card> buildDeck(PresetDeckCatalogService.PresetDeckDefinition definition) {
        if (definition.cardIds() != null && !definition.cardIds().isEmpty()) {
            return buildCustomDeck(definition.cardIds());
        }
        return buildDeck(definition.elements());
    }

    private List<Card> buildPresetSieglings(List<Element> orderedElements) {
        Map<Element, Integer> targets = new LinkedHashMap<>();
        int baseTarget = PRESET_SIEGLING_COUNT / orderedElements.size();
        int remainder = PRESET_SIEGLING_COUNT % orderedElements.size();
        for (int i = 0; i < orderedElements.size(); i++) {
            targets.put(orderedElements.get(i), baseTarget + (i < remainder ? 1 : 0));
        }

        List<Card> cards = new ArrayList<>();
        for (Element element : orderedElements) {
            MonsterPlan plan = solveMonsterPlan(getEvolutionLinesForElement(element), targets.get(element));
            if (plan == null) {
                throw new IllegalStateException("Unable to build a balanced preset Siegling package for " + element.name());
            }
            for (LineChoice choice : plan.choices()) {
                for (int i = 0; i < choice.line().cards().size(); i++) {
                    addCopies(cards, choice.line().cards().get(i), choice.copies().get(i));
                }
            }
        }
        return cards;
    }

    private List<Card> buildPresetSpells(Set<Element> deckElements) {
        boolean supportsMist = deckElements.contains(Element.FIRE) && deckElements.contains(Element.WATER);
        List<SpellCard> candidates = createSpells().stream()
                .filter(this::isSpellLiveForMeta)
                .filter(spell -> spellFitsDeck(spell, deckElements))
                .filter(spell -> spell.getRequiredReaction() == null || supportsMist)
                .sorted(Comparator
                        .comparingInt((SpellCard spell) -> spell.getElement() == Element.NEUTRAL ? 1 : 0)
                        .thenComparingInt(spell -> spell.getRequiredComboSize() > 0 ? 1 : 0)
                        .thenComparingInt(SpellCard::getCostAmount)
                        .thenComparingInt(SpellCard::getRequiredComboSize)
                        .thenComparingInt(spell -> rarityOrder(spell.getRarity()))
                        .thenComparing(Card::getName))
                .toList();
        return buildRepeatedPackage(candidates, PRESET_SPELL_COUNT);
    }

    private List<Card> buildPresetTraps(Set<Element> deckElements) {
        List<TrapCard> candidates = createTraps().stream()
                .filter(this::isTrapLiveForMeta)
                .sorted(Comparator
                        .comparingInt((TrapCard trap) -> deckElements.contains(trap.getElement()) ? 0 : 1)
                        .thenComparingInt(TrapCard::getCostAmount)
                        .thenComparingInt(trap -> rarityOrder(trap.getRarity()))
                        .thenComparing(Card::getName))
                .toList();
        return buildRepeatedPackage(candidates, PRESET_TRAP_COUNT);
    }

    private MonsterPlan solveMonsterPlan(List<EvolutionLine> lines, int targetCards) {
        return solveMonsterPlan(lines, 0, targetCards, new HashMap<>());
    }

    private MonsterPlan solveMonsterPlan(List<EvolutionLine> lines, int index, int remaining,
                                         Map<String, Optional<MonsterPlan>> memo) {
        if (remaining == 0) {
            return new MonsterPlan(List.of(), 0);
        }
        if (remaining < 0 || index >= lines.size()) {
            return null;
        }

        String memoKey = index + ":" + remaining;
        if (memo.containsKey(memoKey)) {
            return memo.get(memoKey).orElse(null);
        }

        EvolutionLine line = lines.get(index);
        MonsterPlan best = solveMonsterPlan(lines, index + 1, remaining, memo);

        for (List<Integer> pattern : generateLineCopyPatterns(line.cards().size(), remaining)) {
            MonsterPlan tail = solveMonsterPlan(lines, index + 1,
                    remaining - pattern.stream().mapToInt(Integer::intValue).sum(), memo);
            if (tail == null) {
                continue;
            }

            List<LineChoice> combined = new ArrayList<>();
            combined.add(new LineChoice(line, pattern));
            combined.addAll(tail.choices());
            MonsterPlan candidate = new MonsterPlan(List.copyOf(combined), tail.score() + lineChoiceScore(line, pattern));
            if (isBetterMonsterPlan(candidate, best)) {
                best = candidate;
            }
        }

        memo.put(memoKey, Optional.ofNullable(best));
        return best;
    }

    private boolean isBetterMonsterPlan(MonsterPlan candidate, MonsterPlan currentBest) {
        if (candidate == null) {
            return false;
        }
        if (currentBest == null) {
            return true;
        }
        if (candidate.score() != currentBest.score()) {
            return candidate.score() < currentBest.score();
        }
        if (candidate.choices().size() != currentBest.choices().size()) {
            return candidate.choices().size() > currentBest.choices().size();
        }
        int candidateEvolutionLines = (int) candidate.choices().stream().filter(choice -> choice.line().cards().size() > 1).count();
        int currentEvolutionLines = (int) currentBest.choices().stream().filter(choice -> choice.line().cards().size() > 1).count();
        return candidateEvolutionLines > currentEvolutionLines;
    }

    private int lineChoiceScore(EvolutionLine line, List<Integer> copies) {
        int stagePenalty = 0;
        for (int i = 0; i < copies.size(); i++) {
            stagePenalty += i * copies.get(i) * 6;
        }
        int soloPenalty = line.cards().size() == 1 ? 24 : line.cards().size() == 2 ? 10 : 0;
        int rarityPenalty = line.cards().stream()
                .mapToInt(card -> rarityOrder(card.getRarity()))
                .sum();
        return soloPenalty + stagePenalty + rarityPenalty - copies.stream().mapToInt(Integer::intValue).sum();
    }

    private List<List<Integer>> generateLineCopyPatterns(int lineSize, int maxTotal) {
        List<List<Integer>> patterns = new ArrayList<>();
        generateLineCopyPatterns(lineSize, maxTotal, 0, 3, 0, new ArrayList<>(), patterns);
        patterns.sort(Comparator
                .comparingInt((List<Integer> pattern) -> pattern.stream().mapToInt(Integer::intValue).sum())
                .reversed()
                .thenComparingInt(pattern -> {
                    int penalty = 0;
                    for (int i = 0; i < pattern.size(); i++) {
                        penalty += i * pattern.get(i);
                    }
                    return penalty;
                }));
        return patterns;
    }

    private void generateLineCopyPatterns(int lineSize, int maxTotal, int index, int maxAtStage, int runningTotal,
                                          List<Integer> current, List<List<Integer>> patterns) {
        if (index == lineSize) {
            if (runningTotal <= maxTotal) {
                patterns.add(List.copyOf(current));
            }
            return;
        }

        int remainingStages = lineSize - index - 1;
        for (int copies = Math.min(3, maxAtStage); copies >= 1; copies--) {
            int minimumPossible = runningTotal + copies + remainingStages;
            if (minimumPossible > maxTotal) {
                continue;
            }
            current.add(copies);
            generateLineCopyPatterns(lineSize, maxTotal, index + 1, copies, runningTotal + copies, current, patterns);
            current.remove(current.size() - 1);
        }
    }

    private List<EvolutionLine> getEvolutionLinesForElement(Element element) {
        List<SieglingCard> cards = getSieglingsForElement(element);
        Map<String, SieglingCard> byId = cards.stream()
                .collect(Collectors.toMap(Card::getId, card -> card, (left, right) -> left, LinkedHashMap::new));
        Map<String, List<SieglingCard>> byRoot = new LinkedHashMap<>();
        for (SieglingCard card : cards) {
            String rootId = resolveEvolutionRoot(card, byId);
            byRoot.computeIfAbsent(rootId, ignored -> new ArrayList<>()).add(card);
        }

        return byRoot.entrySet().stream()
                .map(entry -> new EvolutionLine(
                        entry.getKey(),
                        entry.getValue().stream()
                                .sorted(Comparator
                                        .comparingInt((SieglingCard card) -> evolutionDepth(card, byId))
                                        .thenComparingInt(card -> rarityOrder(card.getRarity()))
                                        .thenComparing(Card::getName))
                                .toList()))
                .sorted(Comparator
                        .comparingInt((EvolutionLine line) -> line.cards().size() == 1 ? 1 : 0)
                        .thenComparing(line -> line.cards().get(0).getName()))
                .toList();
    }

    private String resolveEvolutionRoot(SieglingCard card, Map<String, SieglingCard> byId) {
        SieglingCard current = card;
        while (current.getEvolvesFromId() != null && byId.containsKey(current.getEvolvesFromId())) {
            current = byId.get(current.getEvolvesFromId());
        }
        return current.getId();
    }

    private int evolutionDepth(SieglingCard card, Map<String, SieglingCard> byId) {
        int depth = 0;
        SieglingCard current = card;
        while (current.getEvolvesFromId() != null && byId.containsKey(current.getEvolvesFromId())) {
            current = byId.get(current.getEvolvesFromId());
            depth += 1;
        }
        return depth;
    }

    private <T extends Card> List<Card> buildRepeatedPackage(List<T> orderedCandidates, int targetCount) {
        if (orderedCandidates.isEmpty()) {
            throw new IllegalStateException("Unable to build preset package with no candidates.");
        }

        List<Card> cards = new ArrayList<>();
        Map<String, Integer> counts = new HashMap<>();
        int candidateIndex = 0;
        for (int preferredCopies : TEN_CARD_COPY_PATTERN) {
            T candidate = orderedCandidates.get(candidateIndex % orderedCandidates.size());
            int allowedCopies = Math.min(preferredCopies, getDeckBuilderMaxCopies() - counts.getOrDefault(candidate.getId(), 0));
            for (int i = 0; i < allowedCopies; i++) {
                cards.add(copyCard(candidate));
            }
            counts.put(candidate.getId(), counts.getOrDefault(candidate.getId(), 0) + allowedCopies);
            candidateIndex += 1;
        }

        while (cards.size() < targetCount) {
            boolean addedAny = false;
            for (T candidate : orderedCandidates) {
                if (cards.size() >= targetCount) {
                    break;
                }
                if (counts.getOrDefault(candidate.getId(), 0) >= getDeckBuilderMaxCopies()) {
                    continue;
                }
                cards.add(copyCard(candidate));
                counts.put(candidate.getId(), counts.getOrDefault(candidate.getId(), 0) + 1);
                addedAny = true;
            }
            if (!addedAny) {
                throw new IllegalStateException("Unable to satisfy preset package size without breaking copy limits.");
            }
        }

        return cards;
    }

    private void addCopies(List<Card> deck, Card card, int copies) {
        for (int i = 0; i < copies; i++) {
            deck.add(copyCard(card));
        }
    }

    private Set<Element> activeGameplayElements() {
        if (liveElementCatalogService == null) {
            return EnumSet.copyOf(LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER);
        }
        return liveElementCatalogService.loadActiveElementsForGame();
    }

    private List<PresetDeckCatalogService.PresetDeckDefinition> loadPlayablePresetDeckDefinitions() {
        return loadPresetDeckDefinitions().stream()
                .filter(CardDefinitionService::isDeckActive)
                .filter(this::presetDeckUsesOnlyLiveElements)
                .toList();
    }

    private boolean presetDeckUsesOnlyLiveElements(PresetDeckCatalogService.PresetDeckDefinition definition) {
        Set<Element> live = activeGameplayElements();
        if (definition.elements() != null) {
            for (Element element : definition.elements()) {
                if (element == null || element == Element.NEUTRAL) {
                    continue;
                }
                if (!live.contains(element)) {
                    return false;
                }
            }
        }
        if (definition.cardIds() != null && !definition.cardIds().isEmpty()) {
            for (String cardId : definition.cardIds()) {
                Element cardElement = resolveCardElementIgnoringLiveFilter(cardId);
                if (cardElement != null && cardElement != Element.NEUTRAL && !live.contains(cardElement)) {
                    return false;
                }
            }
        }
        return true;
    }

    private Element resolveCardElementIgnoringLiveFilter(String cardId) {
        if (cardId == null || cardId.isBlank()) {
            return null;
        }
        String normalized = cardId.trim().toLowerCase();
        for (Element element : LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER) {
            for (SieglingCard card : loadSieglingsUnchecked(element)) {
                if (card.getId().equalsIgnoreCase(normalized)) {
                    return card.getElement();
                }
            }
        }
        for (SpellCard spell : createSpells()) {
            if (spell.getId().equalsIgnoreCase(normalized)) {
                return spell.getElement();
            }
        }
        for (TrapCard trap : createTraps()) {
            if (trap.getId().equalsIgnoreCase(normalized)) {
                return trap.getElement();
            }
        }
        return null;
    }

    private boolean isSpellLiveForMeta(SpellCard spell) {
        Set<Element> live = activeGameplayElements();
        if (spell.getElement() != Element.NEUTRAL) {
            return live.contains(spell.getElement());
        }
        String signature = spell.getRequiredComboSignature();
        if (signature == null || signature.isBlank()) {
            return true;
        }
        for (String part : signature.split("\\+")) {
            try {
                Element required = Element.valueOf(part.trim());
                if (!live.contains(required)) {
                    return false;
                }
            } catch (IllegalArgumentException ex) {
                return false;
            }
        }
        return true;
    }

    private boolean isTrapLiveForMeta(TrapCard trap) {
        return activeGameplayElements().contains(trap.getElement());
    }

    private boolean trainerElementIsLive(TrainerCatalogService.TrainerDefinition definition) {
        Element element = definition.element();
        if (element == null || element == Element.NEUTRAL) {
            return true;
        }
        return activeGameplayElements().contains(element);
    }

    private List<SieglingCard> getSieglingsForElement(Element element) {
        if (!activeGameplayElements().contains(element)) {
            return List.of();
        }
        return loadSieglingsUnchecked(element);
    }

    private List<SieglingCard> loadSieglingsUnchecked(Element element) {
        return switch (element) {
            case FIRE -> createFireSieglings();
            case EARTH -> createEarthSieglings();
            case WIND -> createWindSieglings();
            case WATER -> createWaterSieglings();
            case ICE -> createIceSieglings();
            case SHADOW -> createShadowSieglings();
            case ELECTRIC -> createElectricSieglings();
            case METAL -> createMetalSieglings();
            case UNDEAD -> createUndeadSieglings();
            case PSYCHIC -> createPsychicSieglings();
            default -> List.of();
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
            case EPIC -> 3;
            case LEGENDARY -> 4;
        };
    }

    private static final List<String> GUEST_TRAINER_FALLBACK_IDS = List.of("squire-bob", "pyla", "ser-airek");

    private List<TrainerCatalogService.TrainerDefinition> loadTrainerDefinitions() {
        if (trainerCatalogService == null) {
            return TrainerCatalogService.defaultDefinitions();
        }
        List<TrainerCatalogService.TrainerDefinition> definitions = trainerCatalogService.loadDefinitionsForGame();
        if (definitions.isEmpty()) {
            return TrainerCatalogService.defaultDefinitions();
        }
        return withGuestTrainerFallbacks(definitions);
    }

    private List<TrainerCatalogService.TrainerDefinition> withGuestTrainerFallbacks(
            List<TrainerCatalogService.TrainerDefinition> definitions
    ) {
        Set<String> presentIds = definitions.stream()
                .map(TrainerCatalogService.TrainerDefinition::id)
                .filter(Objects::nonNull)
                .map(String::toLowerCase)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        List<TrainerCatalogService.TrainerDefinition> merged = new ArrayList<>(definitions);
        for (TrainerCatalogService.TrainerDefinition fallback : TrainerCatalogService.defaultDefinitions()) {
            String id = fallback.id();
            if (id == null || !GUEST_TRAINER_FALLBACK_IDS.contains(id)) {
                continue;
            }
            if (!presentIds.contains(id.toLowerCase())) {
                merged.add(fallback);
                presentIds.add(id.toLowerCase());
            }
        }
        return merged;
    }

    private TrainerCard toTrainerCard(TrainerCatalogService.TrainerDefinition definition) {
        TrainerCard card = new TrainerCard(
                definition.id(),
                definition.name(),
                definition.element(),
                definition.rarity(),
                definition.tier(),
                toAbility(definition.passiveAbility()),
                toAbility(definition.activeAbility()),
                definition.oncePerGame() != null && definition.oncePerGame()
        );
        card.setCardArtUrl(definition.cardArtUrl());
        card.setCardArtMode(definition.cardArtMode());
        card.setCardArtOffsetX(definition.cardArtOffsetX());
        card.setCardArtOffsetY(definition.cardArtOffsetY());
        card.setCardArtScale(definition.cardArtScale());
        card.setCardArtRotation(definition.cardArtRotation());
        card.setHolographic(definition.holographic() != null && definition.holographic());
        card.setExpeditionStarter(definition.expeditionStarter());
        card.setSiegeUnlockCost(definition.siegeUnlockCost());
        return card;
    }

    private Ability toAbility(ManualSieglingCatalog.ManualAbilityDefinition definition) {
        if (definition == null) {
            return null;
        }
        Ability ability = new Ability(
                definition.name(),
                definition.description(),
                definition.targetType(),
                definition.targetRow(),
                definition.targetCount() == null ? 0 : definition.targetCount(),
                definition.effectType(),
                definition.effectValue() == null ? 0 : definition.effectValue(),
                definition.passive() != null && definition.passive()
        );
        ability.setRequiredElement(definition.requiredElement());
        ability.setRequiredEnergy(definition.requiredEnergy() == null ? 0 : definition.requiredEnergy());
        ability.setRequiredReaction(definition.requiredReaction());
        return ability;
    }

    private String normalizeTrainerId(String trainerId) {
        if (trainerId == null) {
            return null;
        }
        String normalized = trainerId.trim().toLowerCase();
        return normalized.isBlank() ? null : normalized;
    }

    private List<PresetDeckCatalogService.PresetDeckDefinition> loadPresetDeckDefinitions() {
        if (presetDeckCatalogService == null) {
            return PresetDeckCatalogService.defaultDefinitions();
        }
        List<PresetDeckCatalogService.PresetDeckDefinition> definitions = presetDeckCatalogService.loadDefinitionsForGame();
        return definitions.isEmpty() ? PresetDeckCatalogService.defaultDefinitions() : definitions;
    }

    private DeckOption toDeckOption(PresetDeckCatalogService.PresetDeckDefinition definition) {
        return new DeckOption(
                definition.id(),
                definition.name(),
                definition.description(),
                deckElements(definition),
                definition.recommendedTrainerId()
        );
    }

    private List<Element> deckElements(PresetDeckCatalogService.PresetDeckDefinition definition) {
        if (definition.cardIds() == null || definition.cardIds().isEmpty()) {
            return definition.elements();
        }
        List<Element> explicitElements = buildDeck(definition).stream()
                .map(Card::getElement)
                .filter(element -> element != Element.NEUTRAL)
                .distinct()
                .toList();
        return explicitElements.isEmpty() ? definition.elements() : explicitElements;
    }

    private static boolean isDeckActive(PresetDeckCatalogService.PresetDeckDefinition definition) {
        return definition.active() == null || definition.active();
    }

    private static boolean isTrainerActive(TrainerCatalogService.TrainerDefinition definition) {
        return definition.active() == null || definition.active();
    }
}
