package com.sieglings.gauntlet;

import com.sieglings.gauntlet.GauntletEncounters.Encounter;
import com.sieglings.gauntlet.GauntletEncounters.Kind;
import com.sieglings.gauntlet.GauntletRun.ForgeOffer;
import com.sieglings.gauntlet.GauntletRun.GauntletCard;
import com.sieglings.gauntlet.GauntletRun.LastBattle;
import com.sieglings.gauntlet.GauntletRun.Phase;
import com.sieglings.gauntlet.GauntletRun.ShopItem;
import com.sieglings.gauntlet.GauntletRun.Upgrade;
import com.sieglings.model.Ability;
import com.sieglings.model.Card;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.GameService;
import com.sieglings.service.MovesPoolService;
import com.sieglings.service.PlayerProgressionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

/**
 * The Gauntlet: a roguelike climb on the Battle Table. Pick a preset deck and a
 * SiegeKnight, receive ten balanced cards drawn from it, and fight floor after floor.
 * Wins pay gold, cards and knight XP; gold buys cards and forges upgrades onto them;
 * every tenth floor is a SiegeKnight with 30 HP. Three lost fights end the run.
 *
 * <p>Fights are ordinary solo Battle Table matches (see {@link GameService#newGauntletGame}),
 * so every rule, animation and AI decision is the core game's. This service only owns
 * what happens between fights.
 */
@Service
public class GauntletService {

    static final Set<String> GUEST_KNIGHT_IDS = Set.of("squire-bob", "pyla", "ser-airek");
    private static final Duration RUN_TTL = Duration.ofDays(14);

    public static final List<String> PERKS = List.of("VITALITY", "COMMAND", "TACTICS", "PLUNDER", "FORGEMASTER");

    @Autowired
    private CardDefinitionService cardDefs;
    @Autowired
    private GameService gameService;
    @Autowired
    private MovesPoolService movesPoolService;
    @Autowired
    private PlayerProgressionService progressionService;
    @Autowired
    private GauntletEncounters encounters;
    @Autowired
    private GauntletUpgrades upgrades;
    @Autowired
    private GauntletRunStore store;

    private final Map<String, GauntletRun> runs = new ConcurrentHashMap<>();
    /**
     * The Battle Table's own card JSON (set by {@link GauntletController}). Card faces on the
     * Gauntlet page are drawn by the binder renderer, which reads exactly that shape: art
     * mode and placement, notches, printed moves. Null in plain unit tests.
     */
    private volatile Function<Card, Map<String, Object>> clientCardJson;

    void useClientCardJson(Function<Card, Map<String, Object>> serializer) {
        this.clientCardJson = serializer;
    }
    private final SecureRandom tokenRandom = new SecureRandom();

    // ---------------------------------------------------------------- start

    /** Decks and knights the start screen may offer this player. */
    public Map<String, Object> options(AccountUser user) {
        List<Map<String, Object>> decks = new ArrayList<>();
        for (CardDefinitionService.DeckOption deck : cardDefs.getDeckOptions()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", deck.id());
            row.put("name", deck.name());
            row.put("description", deck.description());
            row.put("elements", deck.elements().stream().map(Enum::name).toList());
            row.put("recommendedKnightId", deck.recommendedTrainerId());
            row.put("locked", !deckUnlocked(user, deck.id()));
            decks.add(row);
        }
        List<Map<String, Object>> knights = new ArrayList<>();
        for (TrainerCard knight : cardDefs.getTrainerOptions()) {
            Map<String, Object> row = knightView(knight, 1);
            row.put("locked", !knightUnlocked(user, knight.getId()));
            knights.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("decks", decks);
        out.put("knights", knights);
        out.put("rules", rulesView());
        return out;
    }

    public GauntletRun start(AccountUser user, String playerName, String deckId, String knightId) {
        CardDefinitionService.DeckOption deck = cardDefs.getDeckOption(deckId)
                .orElseThrow(() -> new IllegalArgumentException("Pick a deck to draft from."));
        if (!deckUnlocked(user, deck.id())) {
            throw new IllegalArgumentException("That premade deck is locked. Unlock it in Decks first.");
        }
        TrainerCard knight = cardDefs.getActiveTrainerById(knightId)
                .orElseThrow(() -> new IllegalArgumentException("Pick a SiegeKnight."));
        if (!knightUnlocked(user, knight.getId())) {
            throw new IllegalArgumentException(user == null
                    ? "Guests can lead with Squire Bob, Lady Pyla or Ser Airek. Sign in to use more SiegeKnights."
                    : "You haven't unlocked that SiegeKnight yet.");
        }
        GauntletRun run = new GauntletRun();
        run.token = newToken();
        run.ownerUserId = user == null ? null : user.getId();
        run.playerName = cleanName(playerName, user);
        run.seed = tokenRandom.nextLong();
        run.createdAt = System.currentTimeMillis();
        run.deckId = deck.id();
        run.deckName = deck.name();
        run.elements = deck.elements().stream().map(Enum::name).toList();
        run.knightId = knight.getId();
        run.deck = draft(run, new Random(run.seed));
        run.phase = Phase.DRAFT;
        run.log("Drafted ten cards from " + deck.name() + " with " + knight.getName() + ".");
        return persist(run);
    }

    /**
     * Ten balanced cards from the chosen preset: six Siegelings (bases spread across the
     * deck's elements, plus at most one evolution whose precursor came too), two
     * Strategies and two Deceptions. Short categories are made up with Siegelings.
     */
    List<GauntletCard> draft(GauntletRun run, Random rng) {
        List<Card> preset = new ArrayList<>(cardDefs.buildDeckById(run.deckId));
        Collections.shuffle(preset, rng);
        List<SieglingCard> bases = new ArrayList<>();
        List<SieglingCard> evolutions = new ArrayList<>();
        List<Card> spells = new ArrayList<>();
        List<Card> traps = new ArrayList<>();
        for (Card card : preset) {
            if (card instanceof SieglingCard s) {
                (s.isEvolutionCard() ? evolutions : bases).add(s);
            } else if (card instanceof SpellCard) {
                spells.add(card);
            } else if (card instanceof TrapCard) {
                traps.add(card);
            }
        }
        List<String> picks = new ArrayList<>();
        // Round-robin over elements so a dual-element deck drafts both halves.
        List<Element> elementOrder = new ArrayList<>(new LinkedHashSet<>(bases.stream().map(Card::getElement).toList()));
        int sieglingTarget = GauntletRules.DRAFT_SIEGLINGS - 1;
        int guard = 0;
        while (countSieglings(picks, bases, evolutions) < sieglingTarget && !bases.isEmpty() && guard++ < 200) {
            Element want = elementOrder.isEmpty() ? null : elementOrder.get(picks.size() % elementOrder.size());
            SieglingCard choice = bases.stream()
                    .filter(b -> want == null || b.getElement() == want)
                    .filter(b -> Collections.frequency(picks, b.getId()) == 0)
                    .findFirst()
                    .orElseGet(() -> bases.stream()
                            .filter(b -> Collections.frequency(picks, b.getId()) < 2)
                            .findFirst().orElse(null));
            if (choice == null) break;
            picks.add(choice.getId());
        }
        SieglingCard evolution = evolutions.stream()
                .filter(e -> picks.contains(e.getEvolvesFromId()))
                .findFirst().orElse(null);
        if (evolution != null) {
            picks.add(evolution.getId());
        } else if (!bases.isEmpty()) {
            picks.add(bases.get(rng.nextInt(bases.size())).getId());
        }
        takeDistinct(picks, spells, GauntletRules.DRAFT_SPELLS);
        takeDistinct(picks, traps, GauntletRules.DRAFT_TRAPS);
        while (picks.size() < GauntletRules.DRAFT_SIZE && !bases.isEmpty()) {
            picks.add(bases.get(rng.nextInt(bases.size())).getId());
        }
        List<GauntletCard> deck = new ArrayList<>();
        for (String id : picks) {
            deck.add(new GauntletCard("c" + run.nextCardUid++, id));
        }
        return deck;
    }

    private static int countSieglings(List<String> picks, List<SieglingCard> bases, List<SieglingCard> evolutions) {
        return (int) picks.stream().filter(id -> bases.stream().anyMatch(b -> b.getId().equals(id))
                || evolutions.stream().anyMatch(e -> e.getId().equals(id))).count();
    }

    private static void takeDistinct(List<String> picks, List<Card> pool, int count) {
        int taken = 0;
        Set<String> seen = new LinkedHashSet<>();
        for (Card card : pool) {
            if (taken >= count) return;
            if (seen.add(card.getId())) {
                picks.add(card.getId());
                taken++;
            }
        }
        for (Card card : pool) {
            if (taken >= count) return;
            picks.add(card.getId());
            taken++;
        }
    }

    public GauntletRun rerollDraft(String token) {
        GauntletRun run = require(token);
        synchronized (run) {
            requirePhase(run, Phase.DRAFT);
            if (run.draftRerolled) {
                throw new IllegalArgumentException("The draft can only be redrawn once.");
            }
            run.draftRerolled = true;
            run.deck = draft(run, new Random(run.seed ^ 0x5DEECE66DL));
            run.log("Redrew the draft.");
            return persist(run);
        }
    }

    public GauntletRun begin(String token) {
        GauntletRun run = require(token);
        synchronized (run) {
            requirePhase(run, Phase.DRAFT);
            enterCamp(run);
            return persist(run);
        }
    }

    // ---------------------------------------------------------------- battle

    /** Opens this floor's fight as a Battle Table solo match and returns its solo token. */
    public String startBattle(String token) {
        GauntletRun run = require(token);
        synchronized (run) {
            // A fight lost to a redeploy (or one already finished) is settled first, so
            // "Return to the fight" reopens the floor instead of erroring.
            settleBattle(run);
            if (run.phase == Phase.BATTLE && run.battleToken != null) {
                return run.battleToken;
            }
            requirePhase(run, Phase.CAMP);
            Encounter encounter = encounters.forFloor(run.seed, run.floor, run.knightId);
            GameService.GauntletSide playerSide = new GameService.GauntletSide(
                    run.playerName, materializeDeck(run), playerKnight(run), run.maxHealth(),
                    run.openingHandSize(), List.of(), "Gauntlet: " + run.deckName);
            GameService.GauntletSide enemySide = enemySide(encounter);
            GameService.SoloHandle handle = gameService.newGauntletGame(playerSide, enemySide, run.floor,
                    encounter.name(), encounter.kind() == Kind.KNIGHT);
            run.battleToken = handle.token();
            run.phase = Phase.BATTLE;
            persist(run);
            return handle.token();
        }
    }

    GameService.GauntletSide enemySide(Encounter encounter) {
        List<Card> deck = new ArrayList<>();
        for (String id : encounter.deckIds()) {
            cardDefs.findCardCopy(id).map(card -> toughen(card, encounter.creatureHealthBonus())).ifPresent(deck::add);
        }
        List<GameService.GauntletPlacement> board = new ArrayList<>();
        int slot = 0;
        for (String id : encounter.boardIds()) {
            if (slot >= GauntletEncounters.PACK_SLOTS.length) break;
            Card card = cardDefs.findCardCopy(id).orElse(null);
            if (card instanceof SieglingCard siegling) {
                int[] cell = GauntletEncounters.PACK_SLOTS[slot++];
                board.add(new GameService.GauntletPlacement(
                        (SieglingCard) toughen(siegling, encounter.creatureHealthBonus()), cell[0], cell[1]));
            }
        }
        TrainerCard knight = encounter.knightId() == null ? null
                : cardDefs.getActiveTrainerById(encounter.knightId())
                .map(trainer -> gameService.leveledTrainer(trainer, encounter.knightLevel()))
                .orElse(null);
        String name = knight != null ? knight.getName() : encounter.name();
        return new GameService.GauntletSide(name, deck, knight, encounter.enemyHp(),
                Math.max(1, Math.min(encounter.openingHand(), deck.size())), board, encounter.name());
    }

    private static Card toughen(Card card, int bonus) {
        if (bonus != 0 && card instanceof SieglingCard siegling) {
            siegling.setHealth(Math.max(1, siegling.getHealth() + bonus));
        }
        return card;
    }

    List<Card> materializeDeck(GauntletRun run) {
        List<Card> deck = new ArrayList<>();
        for (GauntletCard entry : run.deck) {
            materialize(entry).ifPresent(deck::add);
        }
        return deck;
    }

    Optional<Card> materialize(GauntletCard entry) {
        return cardDefs.findCardCopy(entry.cardId).map(card -> upgrades.materialize(card, entry.upgrades));
    }

    private TrainerCard playerKnight(GauntletRun run) {
        return cardDefs.getActiveTrainerById(run.knightId)
                .map(knight -> gameService.leveledTrainer(knight, run.knightPowerLevel()))
                .orElse(null);
    }

    /**
     * Settles a finished fight. Called on every read of the run, so returning to the
     * Gauntlet page after the match is all the client has to do.
     */
    private void settleBattle(GauntletRun run) {
        if (run.phase != Phase.BATTLE) return;
        GameState state = run.battleToken == null ? null : gameService.getSoloGame(run.battleToken);
        if (state == null) {
            // The match lived only in server memory and is gone (redeploy or expiry).
            // Nothing was decided, so the floor simply waits to be fought again.
            run.phase = Phase.CAMP;
            run.battleToken = null;
            run.lastBattle = new LastBattle(run.floor, null, false, 0, 0,
                    "That fight was interrupted before it finished. It is waiting for you.");
            persist(run);
            return;
        }
        if (!state.isGameOver()) return;
        Encounter encounter = encounters.forFloor(run.seed, run.floor, run.knightId);
        boolean won = state.getEnemy().getHealth() <= 0;
        run.battleToken = null;
        if (won) {
            winFloor(run, encounter);
        } else {
            loseFloor(run, encounter, state);
        }
        persist(run);
    }

    void winFloor(GauntletRun run, Encounter encounter) {
        boolean elite = encounter.kind() == Kind.ELITE;
        boolean knight = encounter.kind() == Kind.KNIGHT;
        int gold = GauntletRules.applyPlunder(GauntletRules.winGold(run.floor, elite, knight), run.perkPlunder);
        int xp = GauntletRules.winXp(elite, knight);
        run.gold += gold;
        int forges = knight ? 2 : (elite ? 1 : 0);
        run.freeForges += forges;
        gainXp(run, xp);
        String note = forges > 0 ? "+" + forges + " free forge" + (forges == 1 ? "" : "s") + "." : null;
        run.lastBattle = new LastBattle(run.floor, encounter.name(), true, gold, xp, note);
        run.log("Beat " + encounter.name() + " (+" + gold + " gold, +" + xp + " XP).");
        run.rewardOptions = rollRewardOptions(run, elite || knight);
        run.rewardSkipGold = GauntletRules.REWARD_SKIP_GOLD;
        run.floor++;
        run.bestFloor = Math.max(run.bestFloor, run.floor);
        run.phase = Phase.REWARD;
    }

    private void loseFloor(GauntletRun run, Encounter encounter, GameState state) {
        run.lives = Math.max(0, run.lives - 1);
        String note = run.lives > 0
                ? run.lives + (run.lives == 1 ? " life" : " lives") + " left. The floor waits for a rematch."
                : "No lives left. The run is over.";
        run.lastBattle = new LastBattle(run.floor, encounter.name(), false, 0, 0, note);
        run.log("Fell to " + encounter.name() + ". " + note);
        run.phase = run.lives > 0 ? Phase.CAMP : Phase.OVER;
    }

    void gainXp(GauntletRun run, int xp) {
        if (run.knightLevel >= GauntletRules.MAX_KNIGHT_LEVEL) return;
        run.knightXp += xp;
        while (run.knightLevel < GauntletRules.MAX_KNIGHT_LEVEL
                && run.knightXp >= GauntletRules.xpToNext(run.knightLevel)) {
            run.knightXp -= GauntletRules.xpToNext(run.knightLevel);
            run.knightLevel++;
            run.pendingLevelUps++;
            run.log("SiegeKnight reached level " + run.knightLevel + ".");
        }
        if (run.knightLevel >= GauntletRules.MAX_KNIGHT_LEVEL) {
            run.knightXp = 0;
        }
    }

    // ---------------------------------------------------------------- reward / level-up

    public GauntletRun chooseReward(String token, String cardId) {
        GauntletRun run = require(token);
        synchronized (run) {
            requirePhase(run, Phase.REWARD);
            if (cardId == null || cardId.isBlank()) {
                run.gold += run.rewardSkipGold;
                run.log("Skipped the card reward (+" + run.rewardSkipGold + " gold).");
            } else {
                if (!run.rewardOptions.contains(cardId)) {
                    throw new IllegalArgumentException("That card was not offered.");
                }
                run.deck.add(new GauntletCard("c" + run.nextCardUid++, cardId));
                run.log("Added " + cardDefs.cardDisplayName(cardId) + " to the deck.");
            }
            run.rewardOptions = new ArrayList<>();
            afterReward(run);
            return persist(run);
        }
    }

    private void afterReward(GauntletRun run) {
        if (run.pendingLevelUps > 0) {
            run.pendingLevelUps--;
            run.perkOptions = rollPerks(run);
            run.phase = Phase.LEVEL_UP;
        } else {
            enterCamp(run);
        }
    }

    List<String> rollPerks(GauntletRun run) {
        List<String> available = new ArrayList<>(PERKS);
        if (run.perkTactics >= GauntletRules.MAX_TACTICS) {
            available.remove("TACTICS");
        }
        Collections.shuffle(available, new Random(run.seed + run.knightLevel * 31L));
        return new ArrayList<>(available.subList(0, Math.min(3, available.size())));
    }

    public GauntletRun choosePerk(String token, String perk) {
        GauntletRun run = require(token);
        synchronized (run) {
            requirePhase(run, Phase.LEVEL_UP);
            String key = perk == null ? "" : perk.trim().toUpperCase();
            if (!run.perkOptions.contains(key)) {
                throw new IllegalArgumentException("Pick one of the offered perks.");
            }
            switch (key) {
                case "VITALITY" -> run.perkVitality++;
                case "COMMAND" -> run.perkCommand++;
                case "TACTICS" -> run.perkTactics++;
                case "PLUNDER" -> run.perkPlunder++;
                case "FORGEMASTER" -> run.freeForges += 2;
                default -> { }
            }
            run.log("Took the " + perkTitle(key) + " perk.");
            run.perkOptions = new ArrayList<>();
            afterReward(run);
            return persist(run);
        }
    }

    // ---------------------------------------------------------------- camp: forge and shop

    private void enterCamp(GauntletRun run) {
        run.phase = Phase.CAMP;
        if (run.shopFloor != run.floor) {
            run.shop = rollShop(run);
            run.shopFloor = run.floor;
        }
    }

    /** The three upgrades on offer for a card; rolled once and kept until one is forged. */
    public List<Upgrade> forgeOffer(String token, String cardUid) {
        GauntletRun run = require(token);
        synchronized (run) {
            requirePhase(run, Phase.CAMP);
            GauntletCard entry = requireCard(run, cardUid);
            if (entry.level() >= GauntletRules.MAX_CARD_LEVEL) {
                throw new IllegalArgumentException("That card is fully forged.");
            }
            for (ForgeOffer offer : run.forgeOffers) {
                if (offer.cardUid.equals(cardUid)) return offer.options;
            }
            Card card = materialize(entry).orElseThrow(() -> new IllegalArgumentException("That card is no longer in the catalog."));
            Random rng = new Random(run.seed ^ (cardUid.hashCode() * 977L) ^ (entry.upgrades.size() * 131L));
            List<Upgrade> options = upgrades.offer(card, rng);
            if (options.isEmpty()) {
                throw new IllegalArgumentException("Nothing on that card can be forged further.");
            }
            run.forgeOffers.add(new ForgeOffer(cardUid, options));
            persist(run);
            return options;
        }
    }

    public GauntletRun forgeApply(String token, String cardUid, int optionIndex) {
        GauntletRun run = require(token);
        synchronized (run) {
            requirePhase(run, Phase.CAMP);
            GauntletCard entry = requireCard(run, cardUid);
            ForgeOffer offer = run.forgeOffers.stream().filter(o -> o.cardUid.equals(cardUid)).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Open the forge on that card first."));
            if (optionIndex < 0 || optionIndex >= offer.options.size()) {
                throw new IllegalArgumentException("Pick one of the offered upgrades.");
            }
            int cost = GauntletRules.forgeCost(entry.level());
            if (run.freeForges > 0) {
                run.freeForges--;
            } else if (run.gold >= cost) {
                run.gold -= cost;
            } else {
                throw new IllegalArgumentException("Forging that card costs " + cost + " gold.");
            }
            Upgrade chosen = offer.options.get(optionIndex);
            entry.upgrades.add(chosen);
            run.forgeOffers.remove(offer);
            run.log("Forged " + cardDefs.cardDisplayName(entry.cardId) + ": " + chosen.label() + ".");
            return persist(run);
        }
    }

    public GauntletRun buy(String token, String itemId, String removeUid) {
        GauntletRun run = require(token);
        synchronized (run) {
            requirePhase(run, Phase.CAMP);
            ShopItem item = run.shop.stream().filter(i -> i.id.equals(itemId)).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("That item is not in the shop."));
            if (item.sold) {
                throw new IllegalArgumentException("Already bought.");
            }
            if (run.gold < item.price) {
                throw new IllegalArgumentException("You need " + item.price + " gold.");
            }
            switch (item.kind) {
                case "CARD" -> {
                    run.deck.add(new GauntletCard("c" + run.nextCardUid++, item.cardId));
                    run.log("Bought " + cardDefs.cardDisplayName(item.cardId) + ".");
                }
                case "LIFE" -> {
                    if (run.lives >= GauntletRules.MAX_LIVES) {
                        throw new IllegalArgumentException("Your lives are already full.");
                    }
                    run.lives++;
                    run.log("Mended a life.");
                }
                case "REMOVE" -> {
                    if (run.deck.size() <= GauntletRules.MIN_DECK_SIZE) {
                        throw new IllegalArgumentException("Your deck needs at least " + GauntletRules.MIN_DECK_SIZE + " cards.");
                    }
                    GauntletCard removed = requireCard(run, removeUid);
                    run.deck.remove(removed);
                    run.forgeOffers.removeIf(o -> o.cardUid.equals(removed.uid));
                    run.cardsRemoved++;
                    run.log("Removed " + cardDefs.cardDisplayName(removed.cardId) + " from the deck.");
                }
                default -> throw new IllegalArgumentException("Unknown shop item.");
            }
            run.gold -= item.price;
            item.sold = true;
            return persist(run);
        }
    }

    public GauntletRun abandon(String token) {
        GauntletRun run = require(token);
        synchronized (run) {
            if (run.battleToken != null) {
                GameState state = gameService.getSoloGame(run.battleToken);
                if (state != null && !state.isGameOver()) {
                    gameService.forfeit(state, true);
                }
            }
            run.battleToken = null;
            run.phase = Phase.OVER;
            run.log("Ended the run on floor " + run.floor + ".");
            return persist(run);
        }
    }

    // ---------------------------------------------------------------- card pools

    /**
     * Cards the run can be offered: the deck's elements (and Neutral), plus an
     * evolution only when its precursor is already in the deck.
     */
    private List<Card> offerPool(GauntletRun run, boolean anyElement) {
        Set<String> owned = new LinkedHashSet<>();
        run.deck.forEach(card -> owned.add(card.cardId));
        Set<String> elements = new LinkedHashSet<>(run.elements);
        elements.add(Element.NEUTRAL.name());
        return cardDefs.getDeckBuilderCatalog().stream()
                .filter(card -> anyElement || elements.contains(card.getElement().name()))
                .filter(card -> !(card instanceof SieglingCard s && s.isEvolutionCard() && !owned.contains(s.getEvolvesFromId())))
                .toList();
    }

    private static int rarityWeight(Rarity rarity, int act, boolean rich) {
        int[] weights = rich
                ? new int[]{10, 35, 35, 15, 5}
                : (act == 0 ? new int[]{60, 30, 10, 0, 0} : new int[]{40, 35, 18, 6, 1});
        return weights[rarity == null ? 0 : rarity.ordinal()];
    }

    private Card weightedPick(List<Card> pool, Random rng, int act, boolean rich, Set<String> exclude) {
        int total = 0;
        for (Card card : pool) {
            if (!exclude.contains(card.getId())) total += rarityWeight(card.getRarity(), act, rich);
        }
        if (total <= 0) return null;
        int roll = rng.nextInt(total);
        for (Card card : pool) {
            if (exclude.contains(card.getId())) continue;
            roll -= rarityWeight(card.getRarity(), act, rich);
            if (roll < 0) return card;
        }
        return null;
    }

    List<String> rollRewardOptions(GauntletRun run, boolean rich) {
        Random rng = new Random(run.seed * 13L + run.floor * 101L);
        int act = GauntletRules.act(run.floor);
        List<Card> pool = offerPool(run, false);
        List<Card> wide = offerPool(run, true);
        Set<String> picked = new LinkedHashSet<>();
        for (int i = 0; i < 3; i++) {
            // One slot in five reaches outside the deck's elements, for splash builds.
            Card card = weightedPick(rng.nextInt(5) == 0 ? wide : pool, rng, act, rich, picked);
            if (card == null) card = weightedPick(wide, rng, act, rich, picked);
            if (card != null) picked.add(card.getId());
        }
        return new ArrayList<>(picked);
    }

    List<ShopItem> rollShop(GauntletRun run) {
        Random rng = new Random(run.seed * 17L + run.floor * 211L);
        int act = GauntletRules.act(run.floor);
        List<Card> onElement = offerPool(run, false);
        List<Card> wide = offerPool(run, true);
        List<ShopItem> shop = new ArrayList<>();
        Set<String> picked = new LinkedHashSet<>();
        int[] wants = {0, 0, 0, 1, 2}; // three Siegelings, a Strategy, a Deception
        int n = 0;
        for (int want : wants) {
            // Mostly the deck's own elements; one slot in four reaches wider for splashes.
            List<Card> pool = rng.nextInt(4) == 0 ? wide : onElement;
            List<Card> slice = pool.stream().filter(card -> switch (want) {
                case 0 -> card instanceof SieglingCard;
                case 1 -> card instanceof SpellCard;
                default -> card instanceof TrapCard;
            }).toList();
            Card card = weightedPick(slice, rng, act, false, picked);
            if (card == null) continue;
            picked.add(card.getId());
            shop.add(new ShopItem("s" + run.floor + "-" + n++, "CARD", card.getId(),
                    GauntletRules.cardPrice(card.getRarity())));
        }
        shop.add(new ShopItem("s" + run.floor + "-life", "LIFE", null, GauntletRules.LIFE_PRICE));
        shop.add(new ShopItem("s" + run.floor + "-remove", "REMOVE", null, GauntletRules.REMOVE_PRICE));
        return shop;
    }

    // ---------------------------------------------------------------- lookup and storage

    public GauntletRun view(String token) {
        GauntletRun run = require(token);
        synchronized (run) {
            settleBattle(run);
            return run;
        }
    }

    public Optional<String> latestRunToken(AccountUser user) {
        return user == null ? Optional.empty() : store.latestTokenFor(user.getId());
    }

    GauntletRun require(String token) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("No Gauntlet run. Start a new one.");
        }
        purgeStale();
        GauntletRun run = runs.get(token);
        if (run == null) {
            run = store.load(token).orElse(null);
            if (run == null) {
                throw new IllegalArgumentException("That Gauntlet run has ended or expired. Start a new one.");
            }
            GauntletRun existing = runs.putIfAbsent(token, run);
            if (existing != null) run = existing;
        }
        return run;
    }

    private GauntletRun persist(GauntletRun run) {
        run.updatedAt = System.currentTimeMillis();
        runs.put(run.token, run);
        store.save(run);
        return run;
    }

    private void purgeStale() {
        long cutoff = System.currentTimeMillis() - RUN_TTL.toMillis();
        runs.values().removeIf(run -> run.updatedAt > 0 && run.updatedAt < cutoff);
    }

    private static void requirePhase(GauntletRun run, Phase phase) {
        if (run.phase != phase) {
            throw new IllegalArgumentException(switch (run.phase) {
                case OVER -> "This run is over. Start a new one.";
                case BATTLE -> "Finish the current fight first.";
                case REWARD -> "Choose your reward first.";
                case LEVEL_UP -> "Choose a SiegeKnight perk first.";
                case DRAFT -> "Begin the run first.";
                case CAMP -> "You are at camp.";
            });
        }
    }

    private static GauntletCard requireCard(GauntletRun run, String uid) {
        GauntletCard card = run.findCard(uid);
        if (card == null) {
            throw new IllegalArgumentException("That card is not in your deck.");
        }
        return card;
    }

    private String newToken() {
        byte[] bytes = new byte[24];
        tokenRandom.nextBytes(bytes);
        return "g" + java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String cleanName(String raw, AccountUser user) {
        String name = raw == null ? "" : raw.trim();
        if (name.isEmpty() && user != null && user.getDisplayName() != null) {
            name = user.getDisplayName().trim();
        }
        if (name.isEmpty()) name = "Challenger";
        return name.length() > 20 ? name.substring(0, 20) : name;
    }

    private boolean deckUnlocked(AccountUser user, String deckId) {
        try {
            return progressionService.isPremadeDeckUnlockedForUser(user, deckId);
        } catch (RuntimeException ex) {
            // Progression lives in Firestore; when it is unreachable (local dev) do not
            // lock players out of a single-player mode.
            return true;
        }
    }

    private boolean knightUnlocked(AccountUser user, String knightId) {
        String id = knightId == null ? "" : knightId.trim().toLowerCase();
        if (GUEST_KNIGHT_IDS.contains(id)) return true;
        if (user == null) return false;
        try {
            return progressionService.ownsTrainer(user, knightId);
        } catch (RuntimeException ex) {
            return true;
        }
    }

    // ---------------------------------------------------------------- views

    public Map<String, Object> runView(GauntletRun run) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", run.token);
        out.put("phase", run.phase.name());
        out.put("playerName", run.playerName);
        out.put("floor", run.floor);
        out.put("bestFloor", run.bestFloor);
        out.put("act", GauntletRules.act(run.floor) + 1);
        out.put("floorInAct", GauntletRules.floorInAct(run.floor));
        out.put("lives", run.lives);
        out.put("maxLives", GauntletRules.MAX_LIVES);
        out.put("gold", run.gold);
        out.put("freeForges", run.freeForges);
        out.put("maxHealth", run.maxHealth());
        out.put("openingHand", run.openingHandSize());
        out.put("deckName", run.deckName);
        out.put("elements", run.elements);
        out.put("draftRerollAvailable", run.phase == Phase.DRAFT && !run.draftRerolled);
        out.put("battleToken", run.phase == Phase.BATTLE ? run.battleToken : null);

        TrainerCard knight = playerKnight(run);
        Map<String, Object> knightView = knight == null ? new LinkedHashMap<>() : knightView(knight, run.knightPowerLevel());
        knightView.put("level", run.knightLevel);
        knightView.put("xp", run.knightXp);
        knightView.put("xpToNext", run.knightLevel >= GauntletRules.MAX_KNIGHT_LEVEL ? 0 : GauntletRules.xpToNext(run.knightLevel));
        knightView.put("maxLevel", GauntletRules.MAX_KNIGHT_LEVEL);
        knightView.put("powerLevel", run.knightPowerLevel());
        Map<String, Object> perks = new LinkedHashMap<>();
        perks.put("VITALITY", run.perkVitality);
        perks.put("COMMAND", run.perkCommand);
        perks.put("TACTICS", run.perkTactics);
        perks.put("PLUNDER", run.perkPlunder);
        knightView.put("perks", perks);
        out.put("knight", knightView);

        List<Map<String, Object>> deck = new ArrayList<>();
        for (GauntletCard entry : run.deck) {
            materialize(entry).ifPresent(card -> deck.add(cardView(card, entry)));
        }
        out.put("deck", deck);

        if (run.phase != Phase.OVER) {
            out.put("nextEncounter", encounterView(encounters.forFloor(run.seed, run.floor, run.knightId)));
        }
        List<Map<String, Object>> track = new ArrayList<>();
        int actStart = GauntletRules.act(run.floor) * GauntletRules.ACT_LENGTH + 1;
        for (int f = actStart; f < actStart + GauntletRules.ACT_LENGTH; f++) {
            Map<String, Object> stop = new LinkedHashMap<>();
            stop.put("floor", f);
            stop.put("kind", GauntletRules.isKnightFloor(f) ? "KNIGHT" : GauntletRules.isEliteFloor(f) ? "ELITE" : "FIGHT");
            stop.put("cleared", f < run.floor);
            stop.put("current", f == run.floor);
            track.add(stop);
        }
        out.put("track", track);

        if (run.phase == Phase.REWARD) {
            List<Map<String, Object>> options = new ArrayList<>();
            for (String id : run.rewardOptions) {
                cardDefs.findCardCopy(id).ifPresent(card -> options.add(cardView(card, null)));
            }
            out.put("rewardOptions", options);
            out.put("rewardSkipGold", run.rewardSkipGold);
        }
        if (run.phase == Phase.LEVEL_UP) {
            List<Map<String, Object>> options = new ArrayList<>();
            for (String perk : run.perkOptions) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("key", perk);
                row.put("title", perkTitle(perk));
                row.put("text", perkText(perk));
                options.add(row);
            }
            out.put("perkOptions", options);
        }
        List<Map<String, Object>> shop = new ArrayList<>();
        for (ShopItem item : run.shop) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", item.id);
            row.put("kind", item.kind);
            row.put("price", item.price);
            row.put("sold", item.sold);
            if (item.cardId != null) {
                cardDefs.findCardCopy(item.cardId).ifPresent(card -> row.put("card", cardView(card, null)));
                if (!row.containsKey("card")) continue;
            }
            shop.add(row);
        }
        out.put("shop", shop);
        Map<String, Object> offers = new LinkedHashMap<>();
        for (ForgeOffer offer : run.forgeOffers) {
            offers.put(offer.cardUid, offer.options.stream().map(GauntletService::upgradeView).toList());
        }
        out.put("forgeOffers", offers);
        out.put("lastBattle", run.lastBattle);
        out.put("journal", run.journal);
        out.put("rules", rulesView());
        return out;
    }

    static Map<String, Object> upgradeView(Upgrade upgrade) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("type", upgrade.type());
        row.put("label", upgrade.label());
        row.put("element", upgrade.element());
        row.put("rider", upgrade.rider());
        return row;
    }

    private Map<String, Object> encounterView(Encounter encounter) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("floor", encounter.floor());
        out.put("kind", encounter.kind().name());
        out.put("name", encounter.name());
        out.put("blurb", encounter.blurb());
        out.put("element", encounter.element() == null ? null : encounter.element().name());
        out.put("enemyHp", encounter.enemyHp());
        List<Map<String, Object>> board = new ArrayList<>();
        for (String id : encounter.boardIds()) {
            cardDefs.findCardCopy(id).ifPresent(card -> board.add(miniCard(card)));
        }
        out.put("board", board);
        out.put("deckCount", encounter.deckIds().size());
        Set<String> seen = new LinkedHashSet<>();
        List<Map<String, Object>> roster = new ArrayList<>();
        for (String id : encounter.deckIds()) {
            if (seen.add(id)) cardDefs.findCardCopy(id).ifPresent(card -> roster.add(miniCard(card)));
            if (roster.size() >= 6) break;
        }
        out.put("roster", roster);
        if (encounter.knightId() != null) {
            cardDefs.getActiveTrainerById(encounter.knightId())
                    .ifPresent(knight -> out.put("knight", knightView(knight, encounter.knightLevel())));
        }
        return out;
    }

    private Map<String, Object> miniCard(Card card) {
        Map<String, Object> out = new LinkedHashMap<>();
        Function<Card, Map<String, Object>> serializer = clientCardJson;
        if (serializer != null) {
            out.putAll(serializer.apply(card));
            return out;
        }
        out.put("id", card.getId());
        out.put("name", card.getName());
        out.put("element", card.getElement().name());
        out.put("rarity", card.getRarity().name());
        out.put("type", card.getCardType().name());
        out.put("cardArtUrl", card.getCardArtUrl());
        out.put("cardArtMode", card.getCardArtMode());
        return out;
    }

    Map<String, Object> cardView(Card card, GauntletCard entry) {
        Map<String, Object> out = miniCard(card);
        if (entry != null) {
            out.put("uid", entry.uid);
            out.put("level", entry.level());
            out.put("maxLevel", GauntletRules.MAX_CARD_LEVEL);
            out.put("upgrades", entry.upgrades.stream().map(Upgrade::label).toList());
            out.put("forgeCost", GauntletRules.forgeCost(entry.level()));
            if (!entry.upgrades.isEmpty()) {
                // The unforged printing, so the tray can strike through what each upgrade
                // replaced ("Deal 3 -> 5 damage", "HP 14 -> 17").
                cardDefs.findCardCopy(entry.cardId).ifPresent(base -> {
                    Map<String, Object> printed = miniCard(base);
                    if (clientCardJson == null) {
                        appendPlainFields(printed, base);
                    }
                    out.put("base", printed);
                });
            }
        }
        if (clientCardJson != null) {
            // The serialized card already carries cost, stats, notches and its (forged) moves.
            return out;
        }
        appendPlainFields(out, card);
        out.put("description", card.getDescription());
        return out;
    }

    /** The card fields this page reads, for when the Battle Table serializer is not wired (unit tests). */
    private void appendPlainFields(Map<String, Object> out, Card card) {
        if (card.getCostElement() != null) {
            out.put("costElement", card.getCostElement().name());
            out.put("costAmount", card.getCostAmount());
        }
        if (card instanceof SieglingCard siegling) {
            out.put("health", siegling.getHealth());
            out.put("speed", siegling.getSpeed());
            out.put("evolvesFromName", siegling.getEvolvesFromName());
            List<Map<String, Object>> notches = new ArrayList<>();
            for (Notch notch : siegling.getNotches()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("direction", notch.direction().name());
                row.put("element", notch.element() == null ? null : notch.element().name());
                notches.add(row);
            }
            out.put("notches", notches);
            List<Map<String, Object>> moves = new ArrayList<>();
            for (Ability move : movesPoolService.resolvePrintedAbilities(siegling)) {
                if (move == null) continue;
                moves.add(abilityView(move));
            }
            out.put("moves", moves);
        } else if (card.getAbility() != null) {
            out.put("ability", abilityView(card.getAbility()));
        }
    }

    private static Map<String, Object> abilityView(Ability ability) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("name", ability.getName());
        row.put("description", ability.getDescription());
        row.put("energy", ability.getRequiredEnergy());
        row.put("passive", ability.isPassive());
        row.put("effect", ability.getEffectType());
        row.put("value", ability.getEffectValue());
        row.put("riders", ability.hasRiders() ? ability.getRiders().size() : 0);
        return row;
    }

    private Map<String, Object> knightView(TrainerCard knight, int powerLevel) {
        TrainerCard leveled = gameService.leveledTrainer(knight.copy(), powerLevel);
        Map<String, Object> out = new LinkedHashMap<>();
        Function<Card, Map<String, Object>> serializer = clientCardJson;
        if (serializer != null) {
            // Art placement and card template for the SiegeKnight card face.
            out.putAll(serializer.apply(knight));
        }
        out.put("tier", knight.getTier());
        out.put("id", knight.getId());
        out.put("name", knight.getName());
        out.put("element", knight.getElement().name());
        out.put("rarity", knight.getRarity().name());
        out.putIfAbsent("cardArtUrl", knight.getCardArtUrl());
        out.putIfAbsent("cardArtMode", knight.getCardArtMode());
        out.put("passive", leveled.getAbility() == null ? null : abilityView(leveled.getAbility()));
        out.put("active", leveled.getActiveAbility() == null ? null : abilityView(leveled.getActiveAbility()));
        return out;
    }

    private static Map<String, Object> rulesView() {
        Map<String, Object> rules = new LinkedHashMap<>();
        rules.put("draftSize", GauntletRules.DRAFT_SIZE);
        rules.put("playerHp", GauntletRules.PLAYER_BASE_HP);
        rules.put("lives", GauntletRules.STARTING_LIVES);
        rules.put("knightHp", GauntletRules.KNIGHT_BOSS_HP);
        rules.put("actLength", GauntletRules.ACT_LENGTH);
        rules.put("lifePrice", GauntletRules.LIFE_PRICE);
        rules.put("removePrice", GauntletRules.REMOVE_PRICE);
        rules.put("minDeck", GauntletRules.MIN_DECK_SIZE);
        return rules;
    }

    static String perkTitle(String perk) {
        return switch (perk) {
            case "VITALITY" -> "Vitality";
            case "COMMAND" -> "Command";
            case "TACTICS" -> "Tactics";
            case "PLUNDER" -> "Plunder";
            case "FORGEMASTER" -> "Forgemaster";
            default -> perk;
        };
    }

    static String perkText(String perk) {
        return switch (perk) {
            case "VITALITY" -> "+" + GauntletRules.VITALITY_HP + " max HP in every fight.";
            case "COMMAND" -> "+1 to your SiegeKnight's passive and active power.";
            case "TACTICS" -> "Draw one more card in your opening hand.";
            case "PLUNDER" -> "+" + GauntletRules.PLUNDER_PERCENT + "% gold from every win.";
            case "FORGEMASTER" -> "Two free forges, right now.";
            default -> "";
        };
    }
}
