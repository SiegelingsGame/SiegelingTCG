package com.sieglings.gauntlet;

import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.service.CardDefinitionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.stream.Collectors;

/**
 * Builds the fight waiting on each floor. The same run seed and floor always build the
 * same encounter, so the camp's "next fight" preview is exactly what the player meets,
 * and a lost fight is retried against the same foes.
 *
 * <p>The opening two floors are hand-set (a lone Sundile, then a Draco pack already on
 * the board); after that, packs are rolled from the live catalog so dashboard edits and
 * new Siegelings flow straight in.
 */
@Component
public class GauntletEncounters {

    public enum Kind { WILD, PACK, ELITE, KNIGHT }

    /** Board slots a pack fills, front row first, so the player meets its wall. */
    static final int[][] PACK_SLOTS = {{2, 1}, {2, 0}, {2, 2}, {1, 1}, {1, 0}};
    static final int BOARD_CAP = 5;

    /**
     * {@code boardIds} start on the enemy board; {@code deckIds} are what it can still
     * play. A null knight means a wild fight with no SiegeKnight.
     */
    public record Encounter(int floor, Kind kind, String name, String blurb, Element element, int enemyHp,
                            List<String> boardIds, List<String> deckIds, String knightId, int knightLevel,
                            int creatureHealthBonus, int openingHand) {}

    @Autowired
    private CardDefinitionService cardDefs;

    GauntletEncounters() {}

    GauntletEncounters(CardDefinitionService cardDefs) {
        this.cardDefs = cardDefs;
    }

    public Encounter forFloor(long runSeed, int floor, String playerKnightId) {
        Random rng = new Random(runSeed * 1_000_003L + floor * 7_919L);
        List<SieglingCard> roster = cardDefs.getDeckBuilderCatalog().stream()
                .filter(SieglingCard.class::isInstance)
                .map(SieglingCard.class::cast)
                .toList();
        if (GauntletRules.isKnightFloor(floor)) {
            return knight(floor, rng, roster, playerKnightId);
        }
        if (floor == 1 && has(roster, "sundile")) {
            return new Encounter(floor, Kind.WILD, "A Lone Sundile",
                    "A single Sundile basks on the sand. It has only a little fight in it.",
                    Element.FIRE, GauntletRules.wildEnemyHp(floor),
                    List.of(), List.of("sundile"), null, 0, 0, 1);
        }
        if (floor == 2 && has(roster, "draco")) {
            return new Encounter(floor, Kind.PACK, "Draco Pack",
                    "Two Draco are already coiled on the front row, with a third in the brush.",
                    Element.FIRE, GauntletRules.wildEnemyHp(floor),
                    List.of("draco", "draco"), List.of("draco"), null, 0,
                    GauntletRules.enemyCreatureHealthBonus(floor), 1);
        }
        if (GauntletRules.isEliteFloor(floor)) {
            return elite(floor, rng, roster);
        }
        return wild(floor, rng, roster);
    }

    private Encounter wild(int floor, Random rng, List<SieglingCard> roster) {
        int inAct = GauntletRules.floorInAct(floor);
        int act = GauntletRules.act(floor);
        Element element = pickElement(rng, roster);
        List<SieglingCard> pool = basesOf(roster, element, maxRarityFor(floor));
        if (pool.isEmpty()) {
            pool = basesOf(roster, null, maxRarityFor(floor));
        }
        SieglingCard lead = pool.get(rng.nextInt(pool.size()));
        boolean pack = rng.nextInt(3) != 0;
        // A pack already on the board acts before the player has built anything, so it
        // grows slowly: one creature early in the first act, up to four later on.
        int onBoard = pack ? Math.min(4, Math.max(1, inAct / 3 + act)) : 0;
        int inDeck = 2 + inAct / 2 + act;
        List<String> board = new ArrayList<>();
        List<String> deck = new ArrayList<>();
        for (int i = 0; i < onBoard; i++) {
            board.add(i == 0 ? lead.getId() : pool.get(rng.nextInt(pool.size())).getId());
        }
        for (int i = 0; i < inDeck; i++) {
            deck.add(i == 0 && !pack ? lead.getId() : pool.get(rng.nextInt(pool.size())).getId());
        }
        addEvolutionsFor(deck, board, roster, rng, act >= 1 ? 2 : (inAct >= 6 ? 1 : 0));
        String elementName = GauntletUpgrades.titleCase(element.name());
        String name = pack ? lead.getName() + " Pack" : "Wild " + lead.getName();
        String blurb = pack
                ? onBoard + " " + elementName + " Siegelings already hold the field."
                : "A wild " + lead.getName() + " and its kin roam this floor.";
        return new Encounter(floor, pack ? Kind.PACK : Kind.WILD, name, blurb, element,
                GauntletRules.wildEnemyHp(floor), board, deck, null, 0,
                GauntletRules.enemyCreatureHealthBonus(floor), Math.min(3, 1 + inAct / 4));
    }

    private Encounter elite(int floor, Random rng, List<SieglingCard> roster) {
        int act = GauntletRules.act(floor);
        Element element = pickElement(rng, roster);
        Map<String, SieglingCard> byId = byId(roster);
        // The alpha is the strongest evolved form available in that element.
        List<SieglingCard> alphas = roster.stream()
                .filter(card -> card.getElement() == element)
                .filter(card -> card.isEvolutionCard() || rank(card.getRarity()) >= rank(Rarity.RARE))
                .filter(card -> rank(card.getRarity()) <= rank(act == 0 ? Rarity.RARE : Rarity.LEGENDARY))
                .toList();
        if (alphas.isEmpty()) {
            return wild(floor, rng, roster);
        }
        SieglingCard alpha = alphas.get(rng.nextInt(alphas.size()));
        List<String> board = new ArrayList<>();
        board.add(alpha.getId());
        // Its precursor line guards it.
        String precursor = alpha.getEvolvesFromId();
        while (precursor != null && byId.containsKey(precursor) && board.size() < 3) {
            board.add(precursor);
            precursor = byId.get(precursor).getEvolvesFromId();
        }
        List<SieglingCard> bases = basesOf(roster, element, act == 0 ? Rarity.UNCOMMON : Rarity.RARE);
        List<String> deck = new ArrayList<>();
        for (int i = 0; i < 3 + act && !bases.isEmpty(); i++) {
            deck.add(bases.get(rng.nextInt(bases.size())).getId());
        }
        addSupport(deck, element, rng, 1 + act);
        return new Encounter(floor, Kind.ELITE, "Alpha " + alpha.getName(),
                "An elite: an evolved " + alpha.getName() + " leads its line. Beat it for a free forge.",
                element, GauntletRules.eliteEnemyHp(floor), board, deck, null, 0,
                2 + GauntletRules.enemyCreatureHealthBonus(floor), 2);
    }

    private Encounter knight(int floor, Random rng, List<SieglingCard> roster, String playerKnightId) {
        List<TrainerCard> knights = cardDefs.getTrainerOptions().stream()
                .filter(knight -> !knight.getId().equals(playerKnightId))
                .filter(knight -> knight.getElement() != Element.NEUTRAL)
                .toList();
        int act = GauntletRules.act(floor);
        TrainerCard knight = knights.isEmpty() ? null : knights.get(rng.nextInt(knights.size()));
        Element element = knight == null ? pickElement(rng, roster) : knight.getElement();
        List<String> deck = new ArrayList<>();
        List<CardDefinitionService.DeckOption> decks = cardDefs.getDeckOptions().stream()
                .filter(option -> option.elements().contains(element))
                .toList();
        if (!decks.isEmpty()) {
            CardDefinitionService.DeckOption option = decks.get(rng.nextInt(decks.size()));
            List<Card> preset = new ArrayList<>(cardDefs.buildDeckById(option.id()));
            java.util.Collections.shuffle(preset, rng);
            int size = Math.min(preset.size(), 16 + 2 * act);
            // Keep whole evolution lines playable: an evolution only comes with its precursor.
            List<Card> kept = new ArrayList<>();
            for (Card card : preset) {
                if (kept.size() >= size) break;
                if (card instanceof SieglingCard s && s.isEvolutionCard()
                        && kept.stream().noneMatch(k -> k.getId().equals(s.getEvolvesFromId()))) {
                    continue;
                }
                kept.add(card);
            }
            kept.forEach(card -> deck.add(card.getId()));
        } else {
            basesOf(roster, element, Rarity.RARE).forEach(card -> deck.add(card.getId()));
        }
        String knightName = knight == null ? "A SiegeKnight" : knight.getName();
        return new Encounter(floor, Kind.KNIGHT, knightName,
                "Floor " + floor + " is held by " + knightName + ": " + GauntletRules.knightEnemyHp(floor)
                        + " HP, a full warband, and a SiegeKnight's power.",
                element, GauntletRules.knightEnemyHp(floor), act >= 1 ? board(deck, roster) : List.of(), deck,
                knight == null ? null : knight.getId(), GauntletRules.knightLevelFor(floor),
                GauntletRules.enemyCreatureHealthBonus(floor), 5);
    }

    /** From act two, the knight starts with its first base already deployed. */
    private static List<String> board(List<String> deck, List<SieglingCard> roster) {
        Map<String, SieglingCard> byId = byId(roster);
        for (String id : deck) {
            SieglingCard card = byId.get(id);
            if (card != null && !card.isEvolutionCard()) {
                deck.remove(id);
                return List.of(id);
            }
        }
        return List.of();
    }

    /** Adds evolutions of creatures the pack already holds, so its deck can evolve them. */
    private void addEvolutionsFor(List<String> deck, List<String> board, List<SieglingCard> roster,
                                  Random rng, int count) {
        if (count <= 0) return;
        List<String> present = new ArrayList<>(board);
        present.addAll(deck);
        List<SieglingCard> evolutions = roster.stream()
                .filter(SieglingCard::isEvolutionCard)
                .filter(card -> present.contains(card.getEvolvesFromId()))
                .toList();
        for (int i = 0; i < count && !evolutions.isEmpty(); i++) {
            deck.add(evolutions.get(rng.nextInt(evolutions.size())).getId());
        }
    }

    private void addSupport(List<String> deck, Element element, Random rng, int count) {
        List<Card> support = cardDefs.getDeckBuilderCatalog().stream()
                .filter(card -> !(card instanceof SieglingCard))
                .filter(card -> card.getElement() == element)
                .filter(card -> rank(card.getRarity()) <= rank(Rarity.RARE))
                .toList();
        for (int i = 0; i < count && !support.isEmpty(); i++) {
            deck.add(support.get(rng.nextInt(support.size())).getId());
        }
    }

    private static Rarity maxRarityFor(int floor) {
        int act = GauntletRules.act(floor);
        if (act >= 2) return Rarity.EPIC;
        if (act == 1) return Rarity.RARE;
        return GauntletRules.floorInAct(floor) >= 6 ? Rarity.UNCOMMON : Rarity.COMMON;
    }

    private static List<SieglingCard> basesOf(List<SieglingCard> roster, Element element, Rarity maxRarity) {
        return roster.stream()
                .filter(card -> !card.isEvolutionCard())
                .filter(card -> element == null || card.getElement() == element)
                .filter(card -> rank(card.getRarity()) <= rank(maxRarity))
                .sorted(Comparator.comparing(SieglingCard::getId))
                .toList();
    }

    private static Element pickElement(Random rng, List<SieglingCard> roster) {
        List<Element> elements = roster.stream()
                .filter(card -> !card.isEvolutionCard() && card.getRarity() == Rarity.COMMON)
                .map(SieglingCard::getElement)
                .filter(element -> element != Element.NEUTRAL)
                .distinct()
                .sorted()
                .toList();
        if (elements.isEmpty()) {
            return Element.FIRE;
        }
        return elements.get(rng.nextInt(elements.size()));
    }

    private static boolean has(List<SieglingCard> roster, String id) {
        return roster.stream().anyMatch(card -> id.equals(card.getId()));
    }

    private static Map<String, SieglingCard> byId(List<SieglingCard> roster) {
        return roster.stream().collect(Collectors.toMap(SieglingCard::getId, card -> card, (a, b) -> a));
    }

    static int rank(Rarity rarity) {
        return rarity == null ? 0 : rarity.ordinal();
    }
}
