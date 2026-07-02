package com.sieglings.adventure;

import com.sieglings.model.Card;
import com.sieglings.model.Move;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.TargetType;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.MovesPoolService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;

/**
 * Builds all Siege content from the existing card catalog: the selectable
 * Siegeling / SiegeKnight roster, the combat cards derived from each Siegeling's
 * moves, procedural enemies, and the run map. Elements carry no strengths or
 * weaknesses — they only provide status effects (see {@link #statusFor}).
 */
@Service
public class SiegeContentService {

    static final int COPIES_PER_MOVE = 2;
    private static final int PARTY_SIZE = 3;

    @Autowired
    private CardDefinitionService cardDefs;

    @Autowired
    private MovesPoolService movesPool;

    // ---- Roster ---------------------------------------------------------

    /**
     * Stage-1 Siegelings only — evolutions cannot be picked directly; they
     * arrive automatically mid-run once their base form earns enough wins.
     */
    List<SieglingCard> selectableSieglings() {
        List<SieglingCard> out = new ArrayList<>();
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard s && !s.isEvolutionCard() && !playableMoves(s).isEmpty()) {
                out.add(s);
            }
        }
        return out;
    }

    /** The next evolution stage of a catalog card, if any (with usable moves). */
    Optional<SieglingCard> evolutionOf(String cardId) {
        if (cardId == null) return Optional.empty();
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard s && cardId.equals(s.getEvolvesFromId())
                    && !playableMoves(s).isEmpty()) {
                return Optional.of(s);
            }
        }
        return Optional.empty();
    }

    /**
     * Evolves a party member in place: same combatant id (so its deck cards
     * stay owned), new name/element/art, bigger HP pool, an evolution surge
     * of healing. Positions carry over.
     */
    Combatant evolve(Combatant member, SieglingCard evo) {
        int maxHp = Math.max(member.getMaxHp() + 6, 18 + evo.getHealth() * 4);
        Combatant e = new Combatant(member.getId(), evo.getName(), evo.getElement(), Side.PLAYER,
                maxHp, Math.max(4, evo.getSpeed()), evo.getCardArtUrl());
        e.setSourceCardId(evo.getId());
        e.setPosition(member.getPosition());
        e.setHp(Math.min(maxHp, member.getHp() + (int) Math.round(maxHp * 0.3)));
        return e;
    }

    /** Adds the new stage's moves (ones the owner doesn't already know) to the deck. */
    int addNewStageCards(SieglingCard evo, String ownerId, List<SiegeCard> deck) {
        int added = 0;
        for (Move move : playableMoves(evo)) {
            AbilitySpec spec = toSpec(move);
            boolean known = deck.stream().anyMatch(c ->
                    c.getOwnerId().equals(ownerId) && c.getSpec().id().equals(spec.id()));
            if (!known) {
                deck.add(new SiegeCard(ownerId + "-evo-" + spec.id(), ownerId, spec));
                added++;
            }
        }
        return added;
    }

    List<TrainerCard> selectableKnights() {
        return cardDefs.getTrainerOptions();
    }

    Optional<SieglingCard> findSiegling(String id) {
        return selectableSieglings().stream().filter(s -> s.getId().equals(id)).findFirst();
    }

    Optional<TrainerCard> findKnight(String id) {
        return selectableKnights().stream().filter(k -> k.getId().equals(id)).findFirst();
    }

    /** Non-passive, targetable moves for a Siegeling, resolved to combat specs. */
    private List<Move> playableMoves(SieglingCard s) {
        List<Move> out = new ArrayList<>();
        for (String moveId : s.getMoveIds()) {
            Move move = movesPool.getMove(moveId);
            if (move == null || move.isPassive() || move.targetType() == TargetType.PASSIVE) {
                continue;
            }
            out.add(move);
        }
        return out;
    }

    int moveCount(SieglingCard s) {
        return playableMoves(s).size();
    }

    /** Combat specs for a Siegeling's moves — powers the "view cards" detail modal. */
    List<AbilitySpec> moveSpecs(SieglingCard s) {
        List<AbilitySpec> out = new ArrayList<>();
        for (Move move : playableMoves(s)) {
            out.add(toSpec(move));
        }
        return out;
    }

    // ---- Party + deck construction -------------------------------------

    Combatant toPartyCombatant(SieglingCard s, int slot) {
        // Give Siegelings a chunkier HP pool so battles last a few turns.
        int hp = 18 + s.getHealth() * 4;
        String id = "ally-" + slot + "-" + s.getId();
        Combatant c = new Combatant(id, s.getName(), s.getElement(), Side.PLAYER, hp, Math.max(4, s.getSpeed()), s.getCardArtUrl());
        c.setSourceCardId(s.getId());
        return c;
    }

    /** The SiegeKnight as a battlefield unit: stands behind the line, no notch. */
    Combatant toKnightCombatant(TrainerCard knight) {
        return new Combatant("knight-unit", knight.getName(), knight.getElement(),
                Side.PLAYER, 40, 5, knight.getCardArtUrl(), true);
    }

    /**
     * Element → status mapping. Elements do NOT have rock-paper-scissors
     * strengths or weaknesses; they only provide these status effects:
     * Fire→Burn, Ice→Slow, Earth→Stun, Sky (Wind/Electric)→Shock.
     */
    static StatusKind statusFor(Element element) {
        if (element == null) return null;
        return switch (element) {
            case FIRE -> StatusKind.BURN;
            case ICE -> StatusKind.SLOW;
            case EARTH -> StatusKind.STUN;
            case WIND, ELECTRIC -> StatusKind.SHOCK;
            default -> null;
        };
    }

    /** Status application chance written on a damage card, by its AP cost. */
    static int statusChanceFor(StatusKind status, int actionCost) {
        if (status == null) return 0;
        return switch (actionCost) {
            case 0 -> 20;
            case 1 -> 25;
            case 2 -> 30;
            default -> 40;
        };
    }

    List<SiegeCard> deckCardsFor(SieglingCard s, String ownerId) {
        List<SiegeCard> cards = new ArrayList<>();
        int n = 0;
        for (Move move : playableMoves(s)) {
            AbilitySpec spec = toSpec(move);
            for (int copy = 0; copy < COPIES_PER_MOVE; copy++) {
                cards.add(new SiegeCard(ownerId + "-m" + (n++), ownerId, spec));
            }
        }
        return cards;
    }

    /**
     * The knight's unique deck card, built from its dashboard active ability —
     * effect, value, and target all come from the dashboard definition, and a
     * damaging ability carries the knight element's status rider.
     */
    AbilitySpec knightActiveSpec(TrainerCard knight) {
        String kid = "knight-" + knight.getId();
        if (knight.getActiveAbility() != null) {
            var a = knight.getActiveAbility();
            Effect effect = effectFor(a.getEffectType());
            TargetKind target = effect == Effect.SWAP ? TargetKind.ALLY_SINGLE : targetFor(a.getTargetType());
            int value = Math.max(3, a.getEffectValue() + 2);
            StatusKind status = effect == Effect.DAMAGE ? statusFor(knight.getElement()) : null;
            return new AbilitySpec(kid, knight.getName() + ": " + a.getName(), knight.getElement(),
                    effect, value, target, 2, a.getDescription() == null ? "" : a.getDescription(),
                    status, status == null ? 0 : 30);
        }
        // Fallback knight card: a rallying strike.
        return new AbilitySpec(kid, knight.getName() + ": Rally", knight.getElement(),
                Effect.BUFF_ATK, 2, TargetKind.ALLY_ALL, 2, "All Siegelings gain +2 attack this battle.");
    }

    /**
     * Each knight leads with a different passive, chosen deterministically from
     * a stable hash of its id so the roster spreads across all five kinds.
     */
    KnightPassive knightPassiveKind(TrainerCard knight) {
        String id = knight.getId() == null ? knight.getName() : knight.getId();
        int h = 0;
        for (int i = 0; i < id.length(); i++) h = h * 31 + id.charAt(i);
        KnightPassive[] all = KnightPassive.values();
        return all[Math.floorMod(h, all.length)];
    }

    int knightPassiveValue(KnightPassive kind) {
        return switch (kind) {
            case SHIELD -> 4;   // +4 shield to each Siegeling at battle start
            case ATTACK -> 2;   // +2 attack to the party at battle start
            case SPEED -> 2;    // +2 speed to each Siegeling at battle start
            case HEALTH -> 8;   // +8 max HP to each Siegeling all expedition
            case LOOT -> 40;    // +40% gold from spoils and caches
        };
    }

    String knightPassiveName(KnightPassive kind) {
        return switch (kind) {
            case SHIELD -> "Bulwark";
            case ATTACK -> "Warlord";
            case SPEED -> "Vanguard";
            case HEALTH -> "Warden";
            case LOOT -> "Quartermaster";
        };
    }

    String knightPassiveDescription(TrainerCard knight) {
        KnightPassive kind = knightPassiveKind(knight);
        int v = knightPassiveValue(kind);
        String lead = knight.getName() + " leads the warband — ";
        return lead + switch (kind) {
            case SHIELD -> "Bulwark: the party begins each battle with +" + v + " shield.";
            case ATTACK -> "Warlord: the party begins each battle with +" + v + " attack.";
            case SPEED -> "Vanguard: the party begins each battle with +" + v + " speed.";
            case HEALTH -> "Warden: every Siegeling has +" + v + " max HP all expedition.";
            case LOOT -> "Quartermaster: +" + v + "% gold from spoils and caches.";
        };
    }

    // ---- Move -> combat spec -------------------------------------------

    private AbilitySpec toSpec(Move move) {
        Effect effect = effectFor(move.effectType());
        // A notch-move card targets the ally it trades places with.
        TargetKind target = effect == Effect.SWAP ? TargetKind.ALLY_SINGLE : targetFor(move.targetType());
        int value = combatValue(move, effect);
        int actionCost = actionCostFor(move.energyCost());
        StatusKind status = effect == Effect.DAMAGE ? statusFor(move.element()) : null;
        return new AbilitySpec(move.id(), move.name(), move.element(), effect, value, target, actionCost,
                move.description() == null ? "" : move.description(),
                status, statusChanceFor(status, actionCost));
    }

    private int combatValue(Move move, Effect effect) {
        int base = Math.max(1, move.effectValue());
        // Scale raw board values up a little so combat numbers feel meaningful
        // against the larger HP pools used in Siege.
        return switch (effect) {
            case DAMAGE -> base + 2;
            case HEAL, SHIELD -> base + 3;
            case BUFF_ATK, BUFF_SPD -> Math.max(1, base);
            case SLOW -> Math.max(1, base);
            case SWAP -> 0;
        };
    }

    private int actionCostFor(int energyCost) {
        if (energyCost <= 0) return 0;
        if (energyCost == 1) return 1;
        if (energyCost <= 3) return 2;
        return 3;
    }

    private Effect effectFor(String effectType) {
        String key = effectType == null ? "" : effectType.toLowerCase();
        if (key.contains("heal")) return Effect.HEAL;
        if (key.contains("health_boost") || key.contains("shield")) return Effect.SHIELD;
        if (key.contains("damage_boost")) return Effect.BUFF_ATK;
        if (key.contains("speed_boost")) return Effect.BUFF_SPD;
        if (key.contains("freeze") || key.contains("speed_zero")) return Effect.SLOW;
        if (key.contains("move_link") || key.contains("notch")) return Effect.SWAP;
        return Effect.DAMAGE;
    }

    private TargetKind targetFor(TargetType t) {
        return switch (t) {
            case SINGLE_ENEMY -> TargetKind.ENEMY_SINGLE;
            case ALL_ENEMIES, ROW_ENEMIES, ROW_SELECT_ENEMIES, ENEMY_PLAYER -> TargetKind.ALL_ENEMIES;
            case SINGLE_ALLY -> TargetKind.ALLY_SINGLE;
            case ALL_ALLIES, ROW_ALLIES, ROW_SELECT_ALLIES -> TargetKind.ALLY_ALL;
            case SELF -> TargetKind.SELF;
            case PASSIVE -> TargetKind.SELF;
        };
    }

    // ---- Enemies --------------------------------------------------------

    /** Enemy names themed to their element so the silhouette matches the label. */
    private static final Map<Element, String[]> ENEMY_NAMES_BY_ELEMENT = Map.ofEntries(
            Map.entry(Element.FIRE, new String[] { "Cinder Husk", "Ash Revenant", "Ember Fiend" }),
            Map.entry(Element.WATER, new String[] { "Bog Lurker", "Mire Beast", "Tide Creeper" }),
            Map.entry(Element.EARTH, new String[] { "Iron Golem", "Stone Shambler", "Crag Brute" }),
            Map.entry(Element.WIND, new String[] { "Gale Shrike", "Squall Wisp", "Zephyr Fiend" }),
            Map.entry(Element.ICE, new String[] { "Frost Shade", "Rime Stalker", "Glacier Maw" }),
            Map.entry(Element.ELECTRIC, new String[] { "Static Wisp", "Volt Fiend", "Storm Crawler" }),
            Map.entry(Element.SHADOW, new String[] { "Gloom Maw", "Umbral Stalker", "Dusk Wraith" }),
            Map.entry(Element.METAL, new String[] { "Scrap Golem", "Gear Fiend", "Rust Hulk" }),
            Map.entry(Element.UNDEAD, new String[] { "Grave Husk", "Bone Revenant", "Crypt Shade" }),
            Map.entry(Element.PSYCHIC, new String[] { "Mind Leech", "Dream Wisp", "Rift Crawler" }),
            Map.entry(Element.POISON, new String[] { "Venom Creeper", "Blight Fiend", "Spore Beast" }),
            Map.entry(Element.LIGHT, new String[] { "Radiant Shade", "Gleam Wisp", "Halo Fiend" }));
    private static final String[] ENEMY_NAMES_FALLBACK = { "Rift Crawler", "Gloom Maw", "Mire Beast" };
    private static final String[] BOSS_NAMES = { "Siegelord Vareth", "The Hollow Warden", "Umbral Titan" };

    List<Combatant> generateEnemies(NodeType type, int floor, Random rng, List<Element> palette) {
        List<Combatant> enemies = new ArrayList<>();
        int count = switch (type) {
            case ELITE -> 2;
            case BOSS -> 1;
            default -> 1 + (floor >= 3 ? rng.nextInt(2) : 0); // 1–2 for battles
        };
        double hpMul = switch (type) { case ELITE -> 1.5; case BOSS -> 2.2; default -> 1.0; };
        double dmgMul = switch (type) { case ELITE -> 1.2; case BOSS -> 1.25; default -> 1.0; };
        int abilityCount = switch (type) {
            case BOSS -> 3;
            case ELITE -> 2 + (floor >= 5 ? 1 : 0);
            default -> floor >= 4 ? 2 : 1;
        };
        abilityCount = Math.min(3, abilityCount);

        for (int i = 0; i < count; i++) {
            Element element = palette.get(rng.nextInt(palette.size()));
            int hp = (int) Math.round((22 + floor * 6 + rng.nextInt(8)) * hpMul);
            int speed = 6 + rng.nextInt(8) + (type == NodeType.BOSS ? 2 : 0);
            String[] names = ENEMY_NAMES_BY_ELEMENT.getOrDefault(element, ENEMY_NAMES_FALLBACK);
            String name = type == NodeType.BOSS
                    ? BOSS_NAMES[Math.floorMod(floor, BOSS_NAMES.length)]
                    : names[rng.nextInt(names.length)];
            String id = "foe-" + floor + "-" + i;
            Combatant foe = new Combatant(id, name, element, Side.ENEMY, hp, speed, null);
            foe.getAbilities().addAll(enemyAbilities(element, floor, abilityCount, dmgMul, rng));
            enemies.add(foe);
        }
        return enemies;
    }

    private List<AbilitySpec> enemyAbilities(Element element, int floor, int count, double dmgMul, Random rng) {
        List<AbilitySpec> abilities = new ArrayList<>();
        int dmg = (int) Math.round((4 + (int) (floor * 0.7) + rng.nextInt(3)) * dmgMul);
        abilities.add(new AbilitySpec("ea-strike", "Strike", element, Effect.DAMAGE, dmg,
                TargetKind.ENEMY_SINGLE, 0, "Deals " + dmg + " damage to one Siegeling."));
        if (count >= 2) {
            if (rng.nextBoolean()) {
                int sweep = Math.max(2, dmg - 2);
                abilities.add(new AbilitySpec("ea-sweep", "Sweep", element, Effect.DAMAGE, sweep,
                        TargetKind.ALL_ENEMIES, 0, "Deals " + sweep + " damage to the whole party."));
            } else {
                int heal = 6 + floor;
                abilities.add(new AbilitySpec("ea-mend", "Mend", element, Effect.HEAL, heal,
                        TargetKind.SELF, 0, "Recovers " + heal + " HP."));
            }
        }
        if (count >= 3) {
            abilities.add(new AbilitySpec("ea-crush", "Crushing Blow", element, Effect.DAMAGE, dmg + 3,
                    TargetKind.ENEMY_SINGLE, 0, "Deals " + (dmg + 3) + " heavy damage to one Siegeling."));
        }
        return abilities;
    }

    // ---- Map ------------------------------------------------------------

    static final int MAP_ROWS = 8;

    /**
     * Generates a Slay-the-Spire-style branching DAG: {@value #MAP_ROWS} rows,
     * 2–4 nodes per middle row, non-crossing forward edges, a rest row before
     * the final Siegelord node. Every node is reachable and every path reaches
     * the boss.
     */
    List<SiegeNode> generateMap(Random rng) {
        int[] counts = new int[MAP_ROWS];
        counts[0] = 2 + rng.nextInt(2);                 // 2–3 starting paths
        counts[MAP_ROWS - 1] = 1;                       // the Siegelord
        counts[MAP_ROWS - 2] = 2;                       // rest row before the boss
        for (int r = 1; r < MAP_ROWS - 2; r++) {
            counts[r] = 2 + rng.nextInt(3);             // 2–4
        }

        List<SiegeNode> nodes = new ArrayList<>();
        int nextId = 0;
        int[][] rowIds = new int[MAP_ROWS][];
        for (int r = 0; r < MAP_ROWS; r++) {
            rowIds[r] = new int[counts[r]];
            for (int c = 0; c < counts[r]; c++) {
                NodeType type = nodeTypeFor(r, c, counts[r], rng);
                SiegeNode node = new SiegeNode(nextId, r, c, type, labelFor(type));
                rowIds[r][c] = nextId;
                nodes.add(node);
                nextId++;
            }
        }

        // Forward edges. Mapping each node onto the next row's index space keeps
        // the paths monotonic (non-crossing) so the map reads cleanly.
        for (int r = 0; r < MAP_ROWS - 1; r++) {
            int a = counts[r], b = counts[r + 1];
            boolean[] hasIncoming = new boolean[b];
            for (int i = 0; i < a; i++) {
                SiegeNode from = nodes.get(rowIds[r][i]);
                int base = a == 1 ? (b - 1) / 2 : (int) Math.round(i * (double) (b - 1) / (a - 1));
                from.getNext().add(rowIds[r + 1][base]);
                hasIncoming[base] = true;
                // Occasionally branch to a neighbor for route choice.
                if (b > 1 && rng.nextInt(100) < 45) {
                    int alt = base + (base == b - 1 ? -1 : (base == 0 ? 1 : (rng.nextBoolean() ? 1 : -1)));
                    if (alt >= 0 && alt < b && !from.getNext().contains(rowIds[r + 1][alt])) {
                        from.getNext().add(rowIds[r + 1][alt]);
                        hasIncoming[alt] = true;
                    }
                }
            }
            // Guarantee every next-row node is reachable.
            for (int j = 0; j < b; j++) {
                if (!hasIncoming[j]) {
                    int i = a == 1 ? 0 : (int) Math.round(j * (double) (a - 1) / Math.max(1, b - 1));
                    SiegeNode from = nodes.get(rowIds[r][i]);
                    if (!from.getNext().contains(rowIds[r + 1][j])) {
                        from.getNext().add(rowIds[r + 1][j]);
                    }
                }
            }
        }
        return nodes;
    }

    private NodeType nodeTypeFor(int row, int col, int rowCount, Random rng) {
        if (row == 0) return NodeType.BATTLE;
        if (row == MAP_ROWS - 1) return NodeType.BOSS;
        if (row == MAP_ROWS - 2) return NodeType.REST;
        // Guaranteed variety anchors: a cache early, an elite mid-run.
        if (row == 2 && col == rowCount - 1) return NodeType.TREASURE;
        if (row == 4 && col == 0) return NodeType.ELITE;
        int roll = rng.nextInt(100);
        if (row >= 3 && roll < 18) return NodeType.ELITE;
        if (roll < 34) return NodeType.TREASURE;
        if (roll < 48) return NodeType.REST;
        return NodeType.BATTLE;
    }

    private String labelFor(NodeType type) {
        return switch (type) {
            case BATTLE -> "Skirmish";
            case ELITE -> "Elite Siege";
            case REST -> "Rest Camp";
            case TREASURE -> "Cache";
            case BOSS -> "Siegelord";
        };
    }

    List<Element> defaultPalette() {
        List<Element> palette = new ArrayList<>();
        for (String name : cardDefs.getActiveLiveElementNames()) {
            try {
                palette.add(Element.valueOf(name.toUpperCase()));
            } catch (IllegalArgumentException ignored) {
                // skip unknown element name
            }
        }
        if (palette.isEmpty()) {
            palette.addAll(List.of(Element.FIRE, Element.WATER, Element.EARTH, Element.WIND));
        }
        return palette;
    }

    int partySize() { return PARTY_SIZE; }

    int partyMax() { return 4; }

    // ---- Rewards ---------------------------------------------------------

    /** Random playable move specs drawn from the full moves pool for card rewards. */
    List<AbilitySpec> randomCardRewards(int count, Random rng) {
        List<Move> pool = new ArrayList<>();
        for (Move move : movesPool.allMovesSorted()) {
            if (move == null || move.isPassive() || move.targetType() == TargetType.PASSIVE) continue;
            pool.add(move);
        }
        List<AbilitySpec> out = new ArrayList<>();
        while (out.size() < count && !pool.isEmpty()) {
            Move pick = pool.remove(rng.nextInt(pool.size()));
            out.add(toSpec(pick));
        }
        return out;
    }

    /** A strengthened copy of a card spec: +2 power, or cheaper for utility cards. */
    AbilitySpec upgradeSpec(AbilitySpec spec) {
        boolean scaling = spec.effect() == Effect.DAMAGE || spec.effect() == Effect.HEAL || spec.effect() == Effect.SHIELD;
        int value = scaling ? spec.value() + 2 : spec.value() + 1;
        int cost = scaling ? spec.actionCost() : Math.max(0, spec.actionCost() - 1);
        return new AbilitySpec(spec.id(), spec.name() + " +", spec.element(),
                spec.effect(), value, spec.target(), cost, spec.description(),
                spec.status(), spec.statusChance());
    }

    /** A random selectable Siegeling not already in the warband, if any. */
    Optional<SieglingCard> randomRecruit(List<String> excludedNames, Random rng) {
        List<SieglingCard> pool = new ArrayList<>();
        for (SieglingCard s : selectableSieglings()) {
            if (!excludedNames.contains(s.getName())) pool.add(s);
        }
        if (pool.isEmpty()) return Optional.empty();
        return Optional.of(pool.get(rng.nextInt(pool.size())));
    }

}
