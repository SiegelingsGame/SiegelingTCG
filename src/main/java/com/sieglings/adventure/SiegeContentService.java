package com.sieglings.adventure;

import com.sieglings.model.Card;
import com.sieglings.model.Move;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
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

/**
 * Builds all Siege content from the existing card catalog: the selectable
 * Siegeling / SiegeKnight roster, the combat cards derived from each Siegeling's
 * moves, procedural enemies, and the run map. Elements carry no strengths or
 * weaknesses — they only provide status effects (see {@link #statusFor}).
 */
@Service
public class SiegeContentService {

    static final int COPIES_PER_MOVE = 2;
    /** A run starts as the SiegeKnight plus one Siegeling; more join along the way. */
    private static final int PARTY_SIZE = 1;
    private static final int PARTY_MAX = 3;

    /** Admin-assigned roguelike classes per knight (dashboard); overrides the hash default. */
    private final java.util.concurrent.ConcurrentHashMap<String, KnightPassive> classOverrides =
            new java.util.concurrent.ConcurrentHashMap<>();

    /** Built-in carryable items plus any created from the dashboard (in-memory). */
    private final java.util.LinkedHashMap<String, SiegeItem> items = new java.util.LinkedHashMap<>();
    { seedDefaultItems(); }

    private void seedDefaultItems() {
        putItem(new SiegeItem("iron-charm", "Iron Charm", "\uD83D\uDEE1\uFE0F", "VITALITY", 12, "A sturdy charm."));
        putItem(new SiegeItem("vigor-band", "Vigor Band", "\u2764\uFE0F", "VITALITY", 20, "Bursting with life."));
        putItem(new SiegeItem("war-fang", "War Fang", "\u2694\uFE0F", "ATTACK", 3, "Hungry for battle."));
        putItem(new SiegeItem("razor-sigil", "Razor Sigil", "\uD83D\uDD2A", "ATTACK", 5, "Cuts deep."));
        putItem(new SiegeItem("swift-boots", "Swift Boots", "\uD83D\uDC5F", "SPEED", 3, "Fleet of foot."));
        putItem(new SiegeItem("gale-plume", "Gale Plume", "\uD83C\uDF2C\uFE0F", "SPEED", 5, "Rides the wind."));
        putItem(new SiegeItem("aegis-crest", "Aegis Crest", "\uD83D\uDEE1\uFE0F", "SHIELD", 8, "Wards the first blow."));
        putItem(new SiegeItem("bulwark-totem", "Bulwark Totem", "\uD83E\uDDF1", "SHIELD", 14, "An immovable ward."));
        putItem(new SiegeItem("evolution-sigil", "Evolution Sigil", "\uD83C\uDF1F", "EVOLUTION", 1,
                "Evolves to the next stage when battle begins."));
        putItem(new SiegeItem("evolution-2-sigil", "Evolution 2 Sigil", "\u2728", "EVOLUTION2", 1,
                "Begins battle at stage 3 — only for Siegelings with a 3-stage evolution line."));
        putItem(new SiegeItem("revive-card", "Revive Card", "\uD83D\uDCDC", "REVIVE", 50,
                "Raises a knocked Siegeling to half strength."));
        putItem(new SiegeItem("healing-potion", "Healing Potion", "\uD83E\uDDEA", "HEAL", 50,
                "Restores half of an ally's health."));
    }

    void putItem(SiegeItem item) {
        if (item != null && item.id() != null) items.put(item.id(), item);
    }

    java.util.List<SiegeItem> allItems() { return new java.util.ArrayList<>(items.values()); }

    SiegeItem findItem(String id) { return id == null ? null : items.get(id); }

    /** {@code count} distinct random items for rewards / shops. */
    java.util.List<SiegeItem> randomItems(int count, Random rng) {
        java.util.List<SiegeItem> pool = new java.util.ArrayList<>(
                items.values().stream().filter(i -> !i.consumable()).toList());
        java.util.List<SiegeItem> out = new java.util.ArrayList<>();
        while (out.size() < count && !pool.isEmpty()) out.add(pool.remove(rng.nextInt(pool.size())));
        return out;
    }

    /** Dashboard item creation: kind must be a supported carryable or consumable kind. */
    SiegeItem createItem(String name, String icon, String kind, int value) {
        String k = kind == null ? "" : kind.trim().toUpperCase(java.util.Locale.ROOT);
        if (!java.util.Set.of("VITALITY", "ATTACK", "SPEED", "SHIELD", "EVOLUTION", "EVOLUTION2",
                "REVIVE", "HEAL").contains(k)) {
            throw new IllegalArgumentException(
                    "Item kind must be VITALITY, ATTACK, SPEED, SHIELD, EVOLUTION, EVOLUTION2, REVIVE or HEAL.");
        }
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Item name is required.");
        String id = name.trim().toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (id.isBlank()) id = "item-" + Integer.toHexString(name.hashCode());
        SiegeItem item = new SiegeItem(id, name.trim(),
                icon == null || icon.isBlank() ? "\uD83D\uDCE6" : icon.trim(), k, Math.max(1, value),
                java.beans.Introspector.decapitalize(name.trim()));
        putItem(item);
        return item;
    }

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

    /** True when any catalog Siegeling has an explicit expedition-starter flag in overrides. */
    boolean expeditionStartersConfigured() {
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard s && s.getExpeditionStarter() != null) {
                return true;
            }
        }
        return false;
    }

    /**
     * Pickable at warband assembly. When no card has been configured yet, every
     * stage-1 Siegeling remains available so existing catalogs keep working.
     */
    boolean isExpeditionStarter(SieglingCard s) {
        return isExpeditionStarter(s, expeditionStartersConfigured());
    }

    boolean isExpeditionStarter(SieglingCard s, boolean startersConfigured) {
        if (s == null) {
            return false;
        }
        if (!startersConfigured) {
            return true;
        }
        return Boolean.TRUE.equals(s.getExpeditionStarter());
    }

    /** Stage-1 ids that have a playable evolution in the catalog. */
    java.util.Set<String> idsWithEvolutionAvailable() {
        java.util.Set<String> out = new java.util.LinkedHashSet<>();
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard s && s.getEvolvesFromId() != null && !s.getEvolvesFromId().isBlank()
                    && !playableMoves(s).isEmpty()) {
                out.add(s.getEvolvesFromId());
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

    /** The furthest evolution reachable from a catalog card (walking the chain). */
    Optional<SieglingCard> finalEvolutionOf(String cardId) {
        Optional<SieglingCard> current = findAnySiegling(cardId);
        Optional<SieglingCard> last = Optional.empty();
        int guard = 0;
        while (current.isPresent() && guard++ < 6) {
            last = current;
            Optional<SieglingCard> next = evolutionOf(current.get().getId());
            if (next.isEmpty()) break;
            current = next;
        }
        return last;
    }

    /** True when the catalog card can evolve along a chain that reaches stage 3. */
    boolean hasStage3EvolutionChain(String cardId) {
        return finalEvolutionOf(cardId).map(s -> stageOf(s) >= 3).orElse(false);
    }

    /** Full-catalog lookup that, unlike {@link #findSiegling}, includes evolution stages. */
    Optional<SieglingCard> findAnySiegling(String id) {
        if (id == null) return Optional.empty();
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard s && id.equals(s.getId())) {
                return Optional.of(s);
            }
        }
        return Optional.empty();
    }

    /**
     * The evolution card itself: playing it evolves the owner into {@code evo}
     * for the remainder of the battle. Stage 2 costs 2 AP, stage 3 costs 3 AP
     * (per the battle rules); the spec id carries the target catalog card id.
     */
    AbilitySpec evolveCardSpec(String ownerName, SieglingCard evo, int stage) {
        int cost = stage >= 3 ? 3 : 2;
        return new AbilitySpec("evo:" + evo.getId(), "Evolve: " + evo.getName(), evo.getElement(),
                Effect.EVOLVE, 0, TargetKind.SELF, cost,
                ownerName + " evolves into " + evo.getName() + " for the rest of the battle. Unlocks after "
                        + ownerName + " spends " + SiegeBattle.EVOLVE_GAUGE + " AP of its own moves.");
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
        // Carry the base form's level/XP so its moves keep their scaling while
        // evolved. Max HP above already folds in the base form's leveled HP, so
        // we copy identity only — no second HP scaling pass.
        e.copyLevelingFrom(member);
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

    private static final String DEFAULT_EXPEDITION_KNIGHT_ID = "squire-bob";

    boolean expeditionKnightStartersConfigured() {
        return selectableKnights().stream().anyMatch(k -> k.getExpeditionStarter() != null);
    }

    /** Free at warband assembly — Squire Bob by default until the dashboard configures starters. */
    boolean isExpeditionKnightStarter(TrainerCard knight) {
        if (knight == null) {
            return false;
        }
        if (!expeditionKnightStartersConfigured()) {
            return DEFAULT_EXPEDITION_KNIGHT_ID.equalsIgnoreCase(knight.getId());
        }
        return Boolean.TRUE.equals(knight.getExpeditionStarter());
    }

    int siegeUnlockCost(TrainerCard knight) {
        if (knight == null) {
            return 0;
        }
        if (knight.getSiegeUnlockCost() != null && knight.getSiegeUnlockCost() > 0) {
            return knight.getSiegeUnlockCost();
        }
        return defaultSiegeUnlockCost(knight.getRarity());
    }

    private static int defaultSiegeUnlockCost(Rarity rarity) {
        if (rarity == null) {
            return 300;
        }
        return switch (rarity) {
            case COMMON -> 200;
            case UNCOMMON -> 300;
            case RARE -> 450;
            case EPIC -> 650;
            case LEGENDARY -> 900;
        };
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
        KnightPassive assigned = classOverrides.get(id.trim().toLowerCase(java.util.Locale.ROOT));
        if (assigned != null) return assigned;
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
            case MARSHAL -> 1;  // picks 1 extra Siegeling at warband assembly
        };
    }

    /**
     * How many Siegelings the player picks before the run starts. A MARSHAL knight
     * musters its extra Siegeling up front — the player chooses it at warband
     * assembly rather than waiting on a mid-run join.
     */
    int startingPartySize(TrainerCard knight) {
        int extra = knight != null && knightPassiveKind(knight) == KnightPassive.MARSHAL
                ? knightPassiveValue(KnightPassive.MARSHAL)
                : 0;
        return Math.min(PARTY_MAX, PARTY_SIZE + extra);
    }

    String knightPassiveName(KnightPassive kind) {
        return switch (kind) {
            case SHIELD -> "Bulwark";
            case ATTACK -> "Warlord";
            case SPEED -> "Vanguard";
            case HEALTH -> "Warden";
            case LOOT -> "Quartermaster";
            case MARSHAL -> "Marshal";
        };
    }

    String knightPassiveDescription(TrainerCard knight) {
        KnightPassive kind = knightPassiveKind(knight);
        int v = knightPassiveValue(kind);
        return switch (kind) {
            case SHIELD -> "The party begins each battle with +" + v + " shield.";
            case ATTACK -> "The party begins each battle with +" + v + " attack.";
            case SPEED -> "The party begins each battle with +" + v + " speed.";
            case HEALTH -> "Every Siegeling has +" + v + " max HP all expedition.";
            case LOOT -> "+" + v + "% gold from spoils and caches.";
            case MARSHAL -> "Musters an extra Siegeling: choose " + Math.min(PARTY_MAX, PARTY_SIZE + v)
                    + " starting Siegelings instead of " + PARTY_SIZE + ".";
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
            case SWAP, EVOLVE -> 0;
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

    /**
     * @param floor     effective depth (compressed across segments / endless loops)
     * @param partySize living warband size — smaller parties face gentler odds
     * @param segment   which boss region (0 Squire, 1 SiegeKnight, 2+ Siegelord)
     */
    List<Combatant> generateEnemies(NodeType type, int floor, int partySize, int segment, Random rng, List<Element> palette) {
        return generateEnemies(type, floor, partySize, segment, rng, palette, 1.0, 1.0);
    }

    /**
     * As {@link #generateEnemies(NodeType, int, int, int, Random, List)} but scales
     * enemy max HP and damage by extra multipliers on top of the usual tuning —
     * the Battlegrounds difficulty seam ({@code bgHpScalar}/{@code bgDmgScalar}).
     * Both are {@code 1.0} for STANDARD/ENDLESS, so those modes are unaffected.
     */
    List<Combatant> generateEnemies(NodeType type, int floor, int partySize, int segment, Random rng,
                                    List<Element> palette, double bgHpScalar, double bgDmgScalar) {
        List<Combatant> enemies = new ArrayList<>();
        int count = switch (type) {
            case ELITE -> partySize <= 1 ? 1 : 2;
            case BOSS -> 1;
            default -> 1 + (floor >= 3 && partySize >= 2 ? rng.nextInt(2) : 0); // 1–2 for battles
        };
        int tier = Math.min(segment, 2);
        double bossHp = switch (tier) { case 0 -> 1.9; case 1 -> 2.2; default -> 2.6; };
        double bossDmg = switch (tier) { case 0 -> 1.15; case 1 -> 1.25; default -> 1.35; };
        // Difficulty tracks warband size: a lone Siegeling faces ~2/3-strength foes.
        double partyMul = 0.48 + 0.175 * Math.max(1, partySize);
        double hpMul = (switch (type) { case ELITE -> 1.5; case BOSS -> bossHp; default -> 1.0; })
                * partyMul * Math.max(1.0, bgHpScalar);
        double dmgMul = (switch (type) { case ELITE -> 1.2; case BOSS -> bossDmg; default -> 1.0; })
                * Math.min(1.0, 0.62 + 0.13 * partySize) * Math.max(1.0, bgDmgScalar);
        int abilityCount = switch (type) {
            case BOSS -> 3;
            case ELITE -> 2 + (floor >= 5 ? 1 : 0);
            default -> floor >= 4 ? 2 : 1;
        };
        abilityCount = Math.min(3, abilityCount);

        for (int i = 0; i < count; i++) {
            Element element = palette.get(rng.nextInt(palette.size()));
            // Tuned up for the fresh-hand-per-turn economy (a full 6 cards every
            // turn hits much harder than the old draw-1 flow).
            int hp = (int) Math.round((30 + floor * 9 + rng.nextInt(10)) * hpMul);
            int speed = 6 + rng.nextInt(8) + (type == NodeType.BOSS ? 2 : 0);
            String[] names = ENEMY_NAMES_BY_ELEMENT.getOrDefault(element, ENEMY_NAMES_FALLBACK);
            String name = type == NodeType.BOSS
                    ? bossName(tier, rng)
                    : names[rng.nextInt(names.length)];
            String id = "foe-" + floor + "-" + i;
            Combatant foe = new Combatant(id, name, element, Side.ENEMY, hp, speed, null);
            foe.getAbilities().addAll(enemyAbilities(element, floor, abilityCount, dmgMul, rng));
            enemies.add(foe);
        }
        return enemies;
    }

    /**
     * The run's opening fight — a fixed yardstick, not a scaled encounter. Element
     * and name still vary so the fight looks different each run, but every number
     * that decides how hard it is (foe count, HP, damage, speed, one ability) is
     * pinned in {@link SiegeTuning}, so a lone Siegeling and a Marshal's pair face
     * exactly the same opener. From the second fight on, encounters run through
     * {@link #generateEnemies} and scale off warband size and depth as before.
     */
    List<Combatant> generateOpeningEnemies(Random rng, List<Element> palette) {
        List<Combatant> enemies = new ArrayList<>();
        for (int i = 0; i < SiegeTuning.OPENING_FIGHT_FOES; i++) {
            Element element = palette.get(rng.nextInt(palette.size()));
            String[] names = ENEMY_NAMES_BY_ELEMENT.getOrDefault(element, ENEMY_NAMES_FALLBACK);
            Combatant foe = new Combatant("foe-1-" + i, names[rng.nextInt(names.length)], element, Side.ENEMY,
                    SiegeTuning.OPENING_FIGHT_HP, SiegeTuning.OPENING_FIGHT_SPEED, null);
            int dmg = SiegeTuning.OPENING_FIGHT_DAMAGE;
            foe.getAbilities().add(new AbilitySpec("ea-strike", "Strike", element, Effect.DAMAGE, dmg,
                    TargetKind.ENEMY_SINGLE, 0, "Deals " + dmg + " damage to one Siegeling."));
            enemies.add(foe);
        }
        return enemies;
    }

    private List<AbilitySpec> enemyAbilities(Element element, int floor, int count, double dmgMul, Random rng) {
        List<AbilitySpec> abilities = new ArrayList<>();
        int dmg = (int) Math.round((5 + (int) (floor * 0.9) + rng.nextInt(3)) * dmgMul);
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

    static final int SEGMENT_ROWS = 8;
    static final int SEGMENTS = 3;
    static final int MAP_ROWS = SEGMENT_ROWS * SEGMENTS;

    /** Boss tier names per segment: a Squire, a rogue SiegeKnight, the Siegelord. */
    private static final String[][] SEGMENT_BOSS_NAMES = {
            { "Squire Bram", "Squire Vex", "Squire Odo" },
            { "Ser Malachar", "Dame Cressida", "The Fallen Knight" },
            { "Siegelord Vareth", "The Hollow Warden", "Umbral Titan" }
    };
    private static final String[] SEGMENT_BOSS_LABELS = { "Squire", "SiegeKnight", "Siegelord" };

    static int segmentOf(int row) { return Math.min(SEGMENTS - 1, row / SEGMENT_ROWS); }

    String bossName(int segment, Random rng) {
        String[] names = SEGMENT_BOSS_NAMES[Math.min(segment, SEGMENT_BOSS_NAMES.length - 1)];
        return names[rng.nextInt(names.length)];
    }

    /**
     * Generates a Slay-the-Spire-style branching DAG: {@value #MAP_ROWS} rows,
     * 2–4 nodes per middle row, non-crossing forward edges, a rest row before
     * the final Siegelord node. Every node is reachable and every path reaches
     * the boss.
     */
    List<SiegeNode> generateMap(Random rng) {
        return generateMap(rng, false);
    }

    /**
     * As {@link #generateMap(Random)} but, for {@code battlegrounds}, biases node
     * generation toward ELITE nodes (+50% density) — the Battlegrounds difficulty
     * knob. STANDARD/ENDLESS pass {@code false} and are unaffected.
     */
    List<SiegeNode> generateMap(Random rng, boolean battlegrounds) {
        return generateSegments(0, 0, SEGMENTS, rng, battlegrounds);
    }

    /** One more segment for Endless mode, appended after the current last row. */
    List<SiegeNode> generateEndlessSegment(int startRow, int startId, int loop, Random rng) {
        return generateSegments(startRow, startId, 1, rng, false);
    }

    /**
     * Builds {@code segmentCount} chained segments starting at global row
     * {@code rowOffset}. Each segment is {@value #SEGMENT_ROWS} rows ending in a
     * single unskippable boss row (rest row just before it); every path funnels
     * through each boss, and a boss links onward to the next segment's openers.
     */
    private List<SiegeNode> generateSegments(int rowOffset, int idOffset, int segmentCount, Random rng, boolean battlegrounds) {
        int totalRows = SEGMENT_ROWS * segmentCount;
        int[] counts = new int[totalRows];
        for (int r = 0; r < totalRows; r++) {
            int rin = r % SEGMENT_ROWS;
            if (rin == 0) {
                int seg = segmentOf(rowOffset + r);
                counts[r] = switch (Math.min(seg, 2)) {
                    case 0 -> 3 + rng.nextInt(3);   // Squire: 3–5 main paths
                    case 1 -> 2 + rng.nextInt(3);   // SiegeKnight: 2–4
                    default -> 2 + rng.nextInt(2);  // Siegelord: 2–3
                };
            }
            else if (rin == SEGMENT_ROWS - 1) counts[r] = 1;          // the boss
            else if (rin == SEGMENT_ROWS - 2) counts[r] = 2;          // rest row
            else counts[r] = 2 + rng.nextInt(3);                      // 2–4
        }

        List<SiegeNode> nodes = new ArrayList<>();
        int nextId = idOffset;
        int[][] rowIds = new int[totalRows][];
        for (int r = 0; r < totalRows; r++) {
            int globalRow = rowOffset + r;
            rowIds[r] = new int[counts[r]];
            for (int c = 0; c < counts[r]; c++) {
                NodeType type = nodeTypeFor(r % SEGMENT_ROWS, c, counts[r], rng, battlegrounds);
                String label = type == NodeType.BOSS
                        ? SEGMENT_BOSS_LABELS[Math.min(segmentOf(globalRow), SEGMENT_BOSS_LABELS.length - 1)]
                        : labelFor(type);
                SiegeNode node = new SiegeNode(nextId, globalRow, c, type, label);
                rowIds[r][c] = nextId;
                nodes.add(node);
                nextId++;
            }
        }

        // Forward edges. Mapping each node onto the next row's index space keeps
        // the paths monotonic (non-crossing) so the map reads cleanly.
        for (int r = 0; r < totalRows - 1; r++) {
            int a = counts[r], b = counts[r + 1];
            boolean[] hasIncoming = new boolean[b];
            for (int i = 0; i < a; i++) {
                SiegeNode from = nodes.get(rowIds[r][i] - idOffset);
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
                    SiegeNode from = nodes.get(rowIds[r][i] - idOffset);
                    if (!from.getNext().contains(rowIds[r + 1][j])) {
                        from.getNext().add(rowIds[r + 1][j]);
                    }
                }
            }
        }
        return nodes;
    }

    /** {@code row} here is the row within its segment (0..SEGMENT_ROWS-1). */
    private NodeType nodeTypeFor(int row, int col, int rowCount, Random rng, boolean battlegrounds) {
        if (row == 0) return NodeType.BATTLE;
        if (row == SEGMENT_ROWS - 1) return NodeType.BOSS;
        if (row == SEGMENT_ROWS - 2) return NodeType.REST;
        // Guaranteed variety anchors: a cache early, a broker and an elite mid-run.
        if (row == 2 && col == rowCount - 1) return NodeType.TREASURE;
        if (row == 3 && col == 0) return NodeType.BROKER;
        if (row == 4 && col == 0) return NodeType.ELITE;
        // Guaranteed variety anchors for the new stops.
        if (row == 3 && col == rowCount - 1) return NodeType.SMITH;
        if (row == 4 && col == rowCount - 1) return NodeType.EVENT;
        int roll = rng.nextInt(100);
        // Battlegrounds packs in more elites (+50% density).
        int eliteThreshold = battlegrounds ? (int) Math.round(14 * SiegeTuning.BG_ELITE_DENSITY_MULT) : 14;
        if (row >= 3 && roll < eliteThreshold) return NodeType.ELITE;
        if (roll < 24) return NodeType.EVENT;
        if (roll < 36) return NodeType.TREASURE;
        if (roll < 46) return NodeType.REST;
        if (row >= 1 && roll < 56) return NodeType.BROKER;
        if (row >= 2 && roll < 66) return NodeType.SMITH;
        if (row >= 2 && roll < 74) return NodeType.CARAVAN;
        return NodeType.BATTLE;
    }

    private String labelFor(NodeType type) {
        return switch (type) {
            case BATTLE -> "Skirmish";
            case ELITE -> "Elite Siege";
            case REST -> "Rest Camp";
            case TREASURE -> "Cache";
            case BROKER -> "Broker";
            case SMITH -> "Smith";
            case CARAVAN -> "Caravan";
            case EVENT -> "Event";
            case BOSS -> "Boss";
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

    int partyMax() { return PARTY_MAX; }

    // ---- Evolution stages + staged recruits -------------------------------

    /** 1 = base form, 2/3 = evolution depth via the evolvesFrom chain. */
    int stageOf(SieglingCard s) {
        int stage = 1;
        String from = s.getEvolvesFromId();
        int guard = 0;
        while (from != null && !from.isBlank() && guard++ < 6) {
            stage++;
            from = findAnySiegling(from).map(SieglingCard::getEvolvesFromId).orElse(null);
        }
        return stage;
    }

    private List<SieglingCard> sieglingsAtStage(int stage) {
        List<SieglingCard> out = new ArrayList<>();
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard s && !playableMoves(s).isEmpty() && stageOf(s) == stage) {
                out.add(s);
            }
        }
        return out;
    }

    /**
     * A post-battle joiner: 1% chance of a stage-3, 5% of a stage-2, otherwise a
     * stage-1 Siegeling (falling back down a stage when a tier has no entries).
     */
    Optional<SieglingCard> randomStagedRecruit(List<String> excludedNames, Random rng) {
        int roll = rng.nextInt(100);
        int stage = roll < 1 ? 3 : roll < 6 ? 2 : 1;
        for (int s = stage; s >= 1; s--) {
            List<SieglingCard> pool = new ArrayList<>();
            for (SieglingCard cand : sieglingsAtStage(s)) {
                if (!excludedNames.contains(cand.getName())) pool.add(cand);
            }
            if (!pool.isEmpty()) return Optional.of(pool.get(rng.nextInt(pool.size())));
        }
        return Optional.empty();
    }

    /**
     * A guaranteed reveal at or above {@code minStage} (Battlegrounds boss reward):
     * prefers a stage-3 half the time when available, else the highest stage on hand,
     * falling back down a stage when a tier has no entries. Excludes names already in play.
     */
    Optional<SieglingCard> randomRevealAtLeastStage(int minStage, List<String> excludedNames, Random rng) {
        int floor = Math.max(1, minStage);
        // Bias toward the top stage: a coin-flip try at stage 3 first when asking for >=2.
        if (floor <= 2 && rng.nextBoolean()) {
            Optional<SieglingCard> three = pickAtStage(3, excludedNames, rng);
            if (three.isPresent()) return three;
        }
        for (int s = 3; s >= floor; s--) {
            Optional<SieglingCard> pick = pickAtStage(s, excludedNames, rng);
            if (pick.isPresent()) return pick;
        }
        // Nothing at/above the floor: settle for the best available below it.
        for (int s = floor - 1; s >= 1; s--) {
            Optional<SieglingCard> pick = pickAtStage(s, excludedNames, rng);
            if (pick.isPresent()) return pick;
        }
        return Optional.empty();
    }

    private Optional<SieglingCard> pickAtStage(int stage, List<String> excludedNames, Random rng) {
        List<SieglingCard> pool = new ArrayList<>();
        for (SieglingCard cand : sieglingsAtStage(stage)) {
            if (excludedNames == null || !excludedNames.contains(cand.getName())) pool.add(cand);
        }
        return pool.isEmpty() ? Optional.empty() : Optional.of(pool.get(rng.nextInt(pool.size())));
    }

    // ---- Mercenaries (broker rentals) --------------------------------------

    /** Broker stall stock: prefer evolved forms — mercenaries are elite muscle. */
    List<SieglingCard> mercOffers(int count, Random rng) {
        List<SieglingCard> pool = sieglingsAtStage(3);
        if (pool.size() < count) pool.addAll(sieglingsAtStage(2));
        if (pool.size() < count) pool.addAll(sieglingsAtStage(1));
        List<SieglingCard> out = new ArrayList<>();
        List<SieglingCard> work = new ArrayList<>(pool);
        while (out.size() < count && !work.isEmpty()) {
            out.add(work.remove(rng.nextInt(work.size())));
        }
        return out;
    }

    /** A rented mercenary: beefier than a normal recruit; fights one battle then leaves. */
    Combatant toMercCombatant(SieglingCard s) {
        int hp = (int) Math.round((18 + s.getHealth() * 4) * 1.35);
        Combatant merc = new Combatant("merc-" + s.getId(), s.getName() + " (Merc)", s.getElement(),
                Side.PLAYER, hp, Math.max(4, s.getSpeed()) + 3, s.getCardArtUrl());
        // No sourceCardId: mercs don't get evolution cards; they're already elite.
        return merc;
    }

    /** The merc's own moves (upgraded once) plus two signature boon cards. */
    List<SiegeCard> mercBoonCards(Combatant merc, SieglingCard s) {
        List<SiegeCard> cards = new ArrayList<>();
        int n = 0;
        for (Move move : playableMoves(s)) {
            cards.add(new SiegeCard(merc.getId() + "-m" + (n++), merc.getId(), upgradeSpec(toSpec(move))));
        }
        cards.add(new SiegeCard(merc.getId() + "-boon-war", merc.getId(),
                new AbilitySpec("boon-warcry", "Boon: Warcry", s.getElement(), Effect.BUFF_ATK, 3,
                        TargetKind.ALLY_ALL, 1, merc.getName() + " rallies the warband: +3 attack this battle.")));
        cards.add(new SiegeCard(merc.getId() + "-boon-wall", merc.getId(),
                new AbilitySpec("boon-bulwark", "Boon: Bulwark", s.getElement(), Effect.SHIELD, 8,
                        TargetKind.ALLY_ALL, 1, merc.getName() + " shields the whole warband for 8.")));
        return cards;
    }

    // ---- Knight class assignment (dashboard) --------------------------------

    /** A random card from the full collection catalog — the end-of-run card prize. */
    Optional<Card> randomCollectionCard(Random rng) {
        List<Card> catalog = cardDefs.getDeckBuilderCatalog();
        if (catalog.isEmpty()) return Optional.empty();
        return Optional.of(catalog.get(rng.nextInt(catalog.size())));
    }

    Map<String, KnightPassive> classOverrides() { return classOverrides; }

    // ---- Event nodes (data-driven) ----------------------------------------

    /** One event choice: outcome code + value, decoded by the service. */
    record EventChoice(String label, String outcome, int value, String flavor) {}
    /** An event definition: title/prompt/icon + 2-3 choices. */
    record EventDef(String id, String title, String icon, String prompt, List<EventChoice> choices) {}

    private final List<EventDef> events = new ArrayList<>(buildEvents());

    List<EventDef> allEvents() { return List.copyOf(events); }

    static final java.util.Set<String> VALID_EVENT_OUTCOMES = java.util.Set.of(
            "GOLD", "PAY_GOLD", "SNEAK", "HEAL", "AMBUSH", "AMBUSH_ELITE",
            "ITEM_HEALTHCOST", "BLEED_ITEM", "RECRUIT_CHANCE", "SEARCH",
            "DIG_MAP", "BLESS_SPEED", "NOTHING");

    /** Dashboard event creation: 2–3 choices with validated outcome codes. */
    EventDef createEvent(String title, String icon, String prompt, List<EventChoice> choices) {
        if (title == null || title.isBlank()) throw new IllegalArgumentException("Event title is required.");
        if (prompt == null || prompt.isBlank()) throw new IllegalArgumentException("Event prompt is required.");
        if (choices == null || choices.size() < 2 || choices.size() > 3) {
            throw new IllegalArgumentException("Events need 2–3 choices.");
        }
        String id = title.trim().toLowerCase(java.util.Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (id.isBlank()) id = "event-" + Integer.toHexString(title.hashCode());
        String finalId = id;
        if (events.stream().anyMatch(e -> e.id().equals(finalId))) {
            id = id + "-" + (events.size() + 1);
        }
        List<EventChoice> normalized = new ArrayList<>();
        for (EventChoice ch : choices) {
            if (ch.label() == null || ch.label().isBlank()) {
                throw new IllegalArgumentException("Each choice needs a label.");
            }
            String outcome = ch.outcome() == null ? "NOTHING"
                    : ch.outcome().trim().toUpperCase(java.util.Locale.ROOT);
            if (!VALID_EVENT_OUTCOMES.contains(outcome)) {
                throw new IllegalArgumentException("Unknown outcome: " + outcome);
            }
            normalized.add(new EventChoice(ch.label().trim(), outcome, Math.max(0, ch.value()),
                    ch.flavor() == null ? "" : ch.flavor().trim()));
        }
        EventDef def = new EventDef(id, title.trim(),
                icon == null || icon.isBlank() ? "❓" : icon.trim(), prompt.trim(), normalized);
        events.add(def);
        return def;
    }

    EventDef randomEvent(Random rng) {
        return events.get(rng.nextInt(events.size()));
    }

    private List<EventDef> buildEvents() {
        List<EventDef> out = new ArrayList<>();
        out.add(new EventDef("traveler", "A Weary Traveler", "\uD83E\uDDD1", // 🧑
                "A traveler shares your road. \u201CSpare a moment for a fellow wanderer?\u201D", List.of(
                new EventChoice("Trade stories", "GOLD", 18, "The traveler tips you off to a hidden cache."),
                new EventChoice("Share your rations", "ITEM_HEALTHCOST", 8, "Grateful, they press a trinket into your hand."),
                new EventChoice("Walk on by", "NOTHING", 0, "You keep your own counsel."))));
        out.add(new EventDef("bandit-toll", "Bandit Toll", "\uD83E\uDD77", // 🥷
                "Bandits block the pass. \u201CPay the toll \u2014 or bleed for it.\u201D", List.of(
                new EventChoice("Pay 30 gold", "PAY_GOLD", 30, "They step aside, grinning."),
                new EventChoice("Fight them (ambush!)", "AMBUSH", 0, "Steel rings out \u2014 they strike first!"),
                new EventChoice("Try to sneak past", "SNEAK", 12, "You slip into the brush\u2026"))));
        out.add(new EventDef("stranger", "Mysterious Stranger", "\uD83E\uDDD9", // 🧙
                "A cloaked figure offers a bargain. \u201CYour blood for my treasure.\u201D", List.of(
                new EventChoice("Bleed for a relic (\u221215 HP)", "BLEED_ITEM", 15, "The pain is worth it."),
                new EventChoice("Decline", "NOTHING", 0, "The figure fades into mist."))));
        out.add(new EventDef("lost-child", "Lost Siegeling", "\uD83D\uDC23", // 🐣
                "A frightened wild Siegeling watches from the ferns.", List.of(
                new EventChoice("Coax it along", "RECRUIT_CHANCE", 0, "It follows, warily\u2026"),
                new EventChoice("Leave a treat & go", "HEAL", 12, "It chirps thankfully as you leave."))));
        out.add(new EventDef("abandoned-camp", "Abandoned Camp", "\u26FA", // ⛺
                "Cold ashes and a half-packed pack. Something feels off.", List.of(
                new EventChoice("Search carefully", "SEARCH", 0, "You sift the wreckage\u2026"),
                new EventChoice("Rest here", "HEAL", 18, "You risk a short rest."),
                new EventChoice("Move on", "NOTHING", 0, "Best not linger."))));
        out.add(new EventDef("monster-tracks", "Monster Tracks", "\uD83D\uDC3E", // 🐾
                "Huge tracks lead off the path \u2014 fresh, and deep.", List.of(
                new EventChoice("Follow them (elite ambush!)", "AMBUSH_ELITE", 0, "You corner the beast \u2014 it lunges!"),
                new EventChoice("Avoid them", "GOLD", 10, "You skirt danger and pocket some scrap."))));
        out.add(new EventDef("treasure-map", "Treasure Map", "\uD83D\uDDFA\uFE0F", // 🗺️
                "A tattered map marks an X not far off.", List.of(
                new EventChoice("Dig at the X", "DIG_MAP", 0, "You dig, dirt flying\u2026"),
                new EventChoice("Sell the map", "GOLD", 35, "A passing trader pays well."))));
        out.add(new EventDef("oracle", "Wandering Oracle", "\uD83D\uDD2E", // 🔮
                "An oracle reads the threads of fate for a fee.", List.of(
                new EventChoice("Pay 15 for a blessing", "BLESS_SPEED", 15, "Foresight quickens your warband."),
                new EventChoice("Ask nothing", "NOTHING", 0, "You trust your own path."))));
        return out;
    }

    void assignClass(String trainerId, KnightPassive passive) {
        if (trainerId == null || trainerId.isBlank()) return;
        String key = trainerId.trim().toLowerCase(java.util.Locale.ROOT);
        if (passive == null) classOverrides.remove(key);
        else classOverrides.put(key, passive);
    }

    // ---- Rewards ---------------------------------------------------------

    private static final String[] NEUTRAL_MOVE_NAMES = {
            "Steady Strike", "Guard Pulse", "Rally Breath", "Focus Tap", "Broad Sweep",
            "Measured Blow", "Keen Guard", "Second Wind", "Tactical Push", "Calm Center"
    };

    /**
     * One reward move for a Siegeling: same-element pool moves, or a procedural
     * neutral technique any Siegeling can equip (~30% neutral).
     */
    AbilitySpec randomCardRewardFor(Element element, Random rng) {
        Element el = element == null ? Element.NEUTRAL : element;
        if (el != Element.NEUTRAL && rng.nextInt(100) < 30) {
            return toSpec(generateNeutralMove(rng));
        }
        List<Move> pool = elementMovePool(el);
        if (pool.isEmpty()) {
            return toSpec(generateNeutralMove(rng));
        }
        return toSpec(pool.get(rng.nextInt(pool.size())));
    }

    /** Up to {@code count} distinct reward specs for the given element. */
    List<AbilitySpec> randomCardRewardsFor(Element element, int count, Random rng) {
        List<AbilitySpec> out = new ArrayList<>();
        while (out.size() < count) {
            AbilitySpec spec = randomCardRewardFor(element, rng);
            boolean dup = out.stream().anyMatch(s -> s.id().equals(spec.id()) && s.name().equals(spec.name()));
            if (!dup) out.add(spec);
        }
        return out;
    }

    /** Random move previews from an evolved form — powers the client card-morph FX. */
    List<Map<String, Object>> previewMovesFor(SieglingCard evo, int count, Random rng) {
        List<Move> moves = playableMoves(evo);
        if (moves.isEmpty() || count <= 0) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            out.add(specToPreviewMap(toSpec(moves.get(rng.nextInt(moves.size())))));
        }
        return out;
    }

    private List<Move> elementMovePool(Element element) {
        List<Move> pool = new ArrayList<>();
        for (Move move : movesPool.allMovesSorted()) {
            if (move == null || move.isPassive() || move.targetType() == TargetType.PASSIVE) continue;
            if (move.element() == element) pool.add(move);
        }
        return pool;
    }

    /** Procedural neutral move — equippable by any Siegeling element. */
    Move generateNeutralMove(Random rng) {
        int roll = rng.nextInt(100);
        String effectType;
        TargetType target;
        int value;
        int energy;
        if (roll < 40) {
            effectType = "damage";
            target = rng.nextBoolean() ? TargetType.SINGLE_ENEMY : TargetType.ALL_ENEMIES;
            value = 3 + rng.nextInt(4);
            energy = target == TargetType.ALL_ENEMIES ? 3 : (1 + rng.nextInt(2));
        } else if (roll < 65) {
            effectType = "heal";
            target = rng.nextBoolean() ? TargetType.SELF : TargetType.SINGLE_ALLY;
            value = 4 + rng.nextInt(4);
            energy = 1 + rng.nextInt(2);
        } else if (roll < 80) {
            effectType = "shield";
            target = rng.nextBoolean() ? TargetType.SELF : TargetType.ALL_ALLIES;
            value = 4 + rng.nextInt(3);
            energy = 2;
        } else if (roll < 92) {
            effectType = "damage_boost";
            target = TargetType.ALL_ALLIES;
            value = 1 + rng.nextInt(2);
            energy = 2;
        } else {
            effectType = "speed_boost";
            target = TargetType.ALL_ALLIES;
            value = 1 + rng.nextInt(2);
            energy = 2;
        }
        String name = NEUTRAL_MOVE_NAMES[rng.nextInt(NEUTRAL_MOVE_NAMES.length)];
        String id = "neutral-gen-" + Integer.toHexString(rng.nextInt(0xFFFFFF));
        return new Move(id, name, Element.NEUTRAL, com.sieglings.model.MoveCategory.UTILITY, target,
                null, null, 0, effectType, value, energy,
                "A universal technique any Siegeling can learn.", false, null, null);
    }

    private Map<String, Object> specToPreviewMap(AbilitySpec spec) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", spec.name());
        m.put("element", spec.element() == null ? "NEUTRAL" : spec.element().name());
        m.put("effect", spec.effect().name());
        m.put("value", spec.value());
        m.put("actionCost", spec.actionCost());
        m.put("target", spec.target().name());
        m.put("description", spec.description());
        if (spec.status() != null && spec.statusChance() > 0) {
            m.put("status", spec.status().name());
            m.put("statusChance", spec.statusChance());
        }
        return m;
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

    /** Up to {@code count} distinct recruits for a broker stall. */
    List<SieglingCard> randomRecruits(int count, List<String> excludedNames, Random rng) {
        List<SieglingCard> pool = new ArrayList<>();
        for (SieglingCard s : selectableSieglings()) {
            if (!excludedNames.contains(s.getName())) pool.add(s);
        }
        List<SieglingCard> out = new ArrayList<>();
        while (out.size() < count && !pool.isEmpty()) {
            out.add(pool.remove(rng.nextInt(pool.size())));
        }
        return out;
    }

}
