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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;

/**
 * Builds all Siege content from the existing card catalog: the selectable
 * Siegeling / SiegeKnight roster, the combat cards derived from each Siegeling's
 * moves, procedural enemies, and the run map. Also owns the element-weakness
 * chart used for combat damage.
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

    List<SieglingCard> selectableSieglings() {
        List<SieglingCard> out = new ArrayList<>();
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard s && !playableMoves(s).isEmpty()) {
                out.add(s);
            }
        }
        return out;
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

    // ---- Party + deck construction -------------------------------------

    Combatant toPartyCombatant(SieglingCard s, int slot) {
        // Give Siegelings a chunkier HP pool so battles last a few turns.
        int hp = 18 + s.getHealth() * 4;
        String id = "ally-" + slot + "-" + s.getId();
        return new Combatant(id, s.getName(), s.getElement(), Side.PLAYER, hp, Math.max(4, s.getSpeed()), s.getCardArtUrl());
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

    AbilitySpec knightActiveSpec(TrainerCard knight) {
        String kid = "knight-" + knight.getId();
        if (knight.getActiveAbility() != null) {
            var a = knight.getActiveAbility();
            Effect effect = effectFor(a.getEffectType());
            TargetKind target = targetFor(a.getTargetType());
            int value = Math.max(3, a.getEffectValue() + 2);
            return new AbilitySpec(kid, knight.getName() + ": " + a.getName(), knight.getElement(),
                    effect, value, target, 2, a.getDescription() == null ? "" : a.getDescription());
        }
        // Fallback knight card: a rallying strike.
        return new AbilitySpec(kid, knight.getName() + ": Rally", knight.getElement(),
                Effect.BUFF_ATK, 2, TargetKind.ALLY_ALL, 2, "All Siegelings gain +2 attack this battle.");
    }

    String knightPassiveDescription(TrainerCard knight) {
        return knight.getName() + " leads the warband — the party begins each battle with +"
                + knightPassiveShield(knight) + " shield.";
    }

    int knightPassiveShield(TrainerCard knight) {
        return 4;
    }

    // ---- Move -> combat spec -------------------------------------------

    private AbilitySpec toSpec(Move move) {
        Effect effect = effectFor(move.effectType());
        TargetKind target = targetFor(move.targetType());
        int value = combatValue(move, effect);
        int actionCost = actionCostFor(move.energyCost());
        return new AbilitySpec(move.id(), move.name(), move.element(), effect, value, target, actionCost,
                move.description() == null ? "" : move.description());
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
        };
    }

    private int actionCostFor(int energyCost) {
        if (energyCost <= 1) return 1;
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

    private static final String[] ENEMY_NAMES = {
            "Rift Crawler", "Gloom Maw", "Cinder Husk", "Bramble Fiend", "Frost Shade",
            "Static Wisp", "Iron Golem", "Bog Lurker", "Ash Revenant", "Mire Beast"
    };
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
            String name = type == NodeType.BOSS
                    ? BOSS_NAMES[Math.floorMod(floor, BOSS_NAMES.length)]
                    : ENEMY_NAMES[rng.nextInt(ENEMY_NAMES.length)];
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
        int cost = scaling ? spec.actionCost() : Math.max(1, spec.actionCost() - 1);
        return new AbilitySpec(spec.id(), spec.name() + " +", spec.element(),
                spec.effect(), value, spec.target(), cost, spec.description());
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

    // ---- Weakness chart -------------------------------------------------

    private static final Map<Element, Set<Element>> STRONG_AGAINST = new LinkedHashMap<>();
    static {
        STRONG_AGAINST.put(Element.FIRE, Set.of(Element.ICE, Element.METAL));
        STRONG_AGAINST.put(Element.ICE, Set.of(Element.WIND));
        STRONG_AGAINST.put(Element.WIND, Set.of(Element.EARTH));
        STRONG_AGAINST.put(Element.EARTH, Set.of(Element.FIRE, Element.ELECTRIC));
        STRONG_AGAINST.put(Element.WATER, Set.of(Element.FIRE, Element.ICE));
        STRONG_AGAINST.put(Element.METAL, Set.of(Element.EARTH, Element.WIND));
        STRONG_AGAINST.put(Element.ELECTRIC, Set.of(Element.WIND, Element.WATER));
        STRONG_AGAINST.put(Element.POISON, Set.of(Element.ICE, Element.EARTH));
        STRONG_AGAINST.put(Element.SHADOW, Set.of(Element.PSYCHIC));
        STRONG_AGAINST.put(Element.PSYCHIC, Set.of(Element.LIGHT));
        STRONG_AGAINST.put(Element.LIGHT, Set.of(Element.UNDEAD, Element.SHADOW));
        STRONG_AGAINST.put(Element.UNDEAD, Set.of(Element.SHADOW));
    }

    /** Damage multiplier for an attacker element hitting a defender element. */
    double weaknessMultiplier(Element attacker, Element defender) {
        if (attacker == null || defender == null) return 1.0;
        Set<Element> strong = STRONG_AGAINST.get(attacker);
        if (strong != null && strong.contains(defender)) return 1.3;
        Set<Element> reverse = STRONG_AGAINST.get(defender);
        if (reverse != null && reverse.contains(attacker)) return 0.8;
        return 1.0;
    }
}
