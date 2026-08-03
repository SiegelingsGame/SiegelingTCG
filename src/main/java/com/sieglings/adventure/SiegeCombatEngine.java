package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;

/**
 * Runs Siege battles on a round-based team-Speed system.
 *
 * <p>Rules (v3):
 * <ul>
 *   <li><b>Speed</b>: each round, the Speeds of all living active Siegelings are
 *       summed and compared to the enemy team's total; the faster side acts
 *       first. Recomputed every round; ties are a coin flip.</li>
 *   <li><b>Action points</b>: the player's turn spends a shared pool of
 *       {@link SiegeBattle#ACTIONS_PER_TURN} AP. Unused AP converts directly
 *       into SiegeKnight Ultimate Charge at the end of the turn.</li>
 *   <li><b>Elements</b>: no strengths or weaknesses — elements only carry status
 *       effects (Burn / Slow / Stun / Shock) applied by the chance written on
 *       each card. Damage is exactly the number written on the card, plus any
 *       explicit attack buff.</li>
 *   <li><b>Positions</b>: Siegelings stand on notches. Enemies telegraph their
 *       next move against a notch; whoever stands there when it lands takes the
 *       hit, so notch-swap cards can dodge (or tank) a telegraphed blow.</li>
 *   <li><b>The Knight</b>: joins the battle behind the line. A Siegeling KO deals
 *       5 damage to the Knight; with no Siegelings left, enemies strike the
 *       Knight directly. The battle is lost when the Knight falls.</li>
 * </ul>
 */
@Service
public class SiegeCombatEngine {

    @Autowired
    private SiegeContentService content;

    static final String KNIGHT_OWNER_PREFIX = "knight-";
    /** Damage the Knight suffers whenever one of the Siegelings is knocked out. */
    static final int KNIGHT_KO_DAMAGE = 5;
    /** Chance an enemy's elemental attack applies its status. */
    static final int ENEMY_STATUS_CHANCE = 20;
    /** Knight Ultimate: heavy elemental sweep. */
    static final int KNIGHT_ULT_DAMAGE = 15;
    /**
     * Shields granted before round 1 (knight passive, carried items) lapse when
     * the party opens round 2 — the same "until the beginning of your next turn"
     * window every other shield gets, counted from the turn they were meant for.
     */
    static final int BATTLE_START_SHIELD_EXPIRY = 2;
    /**
     * A {@code destroy} card is an instant kill on the board. Elites and Siegelords
     * are the run's whole difficulty curve, so against them it lands as a heavy hit
     * instead: this fraction of their max HP.
     */
    static final double EXECUTE_BOSS_FRACTION = 0.25;

    // ---- Battle setup ---------------------------------------------------

    void startBattle(SiegeRun run, NodeType type, List<Combatant> enemies, Random rng) {
        SiegeBattle battle = new SiegeBattle(type);
        // Run-wide Battlegrounds boons ride along on the battle so the AP/turn/fall
        // code can read them without threading the run through. Empty elsewhere.
        if (run.isBattlegrounds()) battle.setBoons(run.getBoons());

        // Reset persistent party members for a fresh battle (HP carries over),
        // then apply the knight's leadership passive (varies per knight).
        Combatant knight = run.getKnightUnit();
        KnightPassive passive = run.getKnightPassive();
        // The leadership passive strengthens as the Knight levels (+1 every 2 levels).
        int pv = run.getKnightPassiveValue()
                + (knight != null ? SiegeTuning.knightPassiveBonus(knight.getLevel()) : 0);
        int pos = 0;
        for (Combatant ally : run.getParty()) {
            ally.setShield(0);
            ally.setShieldExpiryRound(BATTLE_START_SHIELD_EXPIRY);
            ally.setBattleMaxHpBonus(0);
            ally.setSpeed(ally.leveledBaseSpeed());
            ally.addAttackBuff(-ally.getAttackBuff());
            ally.clearStatuses();
            ally.setApSpent(0);
            ally.setLeveledRecently(false);
            ally.setPosition(pos++);
            if (knight != null && passive != null) {
                switch (passive) {
                    case SHIELD -> ally.setShield(pv);
                    case ATTACK -> ally.addAttackBuff(pv);
                    case SPEED -> ally.setSpeed(ally.leveledBaseSpeed() + pv);
                    default -> { } // HEALTH is baked into max HP; LOOT affects gold only
                }
            }
            // Carried item bonus (VITALITY is baked into max HP on equip).
            SiegeItem item = content.findItem(ally.getItemId());
            if (item != null) {
                switch (item.kind()) {
                    case "ATTACK" -> ally.addAttackBuff(item.value());
                    case "SPEED" -> ally.setSpeed(ally.getSpeed() + item.value());
                    case "SHIELD" -> ally.setShield(ally.getShield() + item.value());
                    case "EVOLUTION", "EVOLUTION2" -> { } // applied after the deck is built
                    default -> { }
                }
            }
            battle.getCombatants().add(ally);
        }
        if (knight != null) {
            knight.setShield(0);
            knight.setShieldExpiryRound(BATTLE_START_SHIELD_EXPIRY);
            knight.setBattleMaxHpBonus(0);
            knight.clearStatuses();
            knight.setPosition(-1);
            knight.setLeveledRecently(false);
            battle.getCombatants().add(knight);
        }
        // A rented mercenary marches in for this one battle with its boon cards.
        Combatant merc = run.getMercenary();
        if (merc != null) {
            merc.setShield(0);
            merc.setShieldExpiryRound(BATTLE_START_SHIELD_EXPIRY);
            merc.setBattleMaxHpBonus(0);
            merc.clearStatuses();
            merc.setApSpent(0);
            merc.setPosition(pos++);
            battle.getCombatants().add(merc);
            battle.log(merc.getName() + " marches with the warband — for this battle only.");
        }
        for (Combatant foe : enemies) {
            battle.getCombatants().add(foe);
        }

        // Build the deck (fresh card instances from templates) and shuffle.
        int n = 0;
        for (SiegeCard template : run.getDeckTemplates()) {
            battle.getDeck().add(new SiegeCard("c" + (n++), template.getOwnerId(), template.getSpec()));
        }
        if (merc != null) {
            for (SiegeCard boon : run.getMercCards()) {
                battle.getDeck().add(new SiegeCard("c" + (n++), boon.getOwnerId(), boon.getSpec()));
            }
        }
        // Evolution sigils transform the holder before EVOLVE cards are injected.
        applySigilEvolutions(run, battle, rng);
        // Each member with a next stage gets its Evolution card in the deck —
        // evolution happens in battle by drawing and playing it (2 AP).
        for (Combatant ally : battle.living(Side.PLAYER)) {
            if (ally.isKnight()) continue;
            content.evolutionOf(ally.getSourceCardId()).ifPresent(evo ->
                    battle.getDeck().add(new SiegeCard("evo-" + ally.getId(), ally.getId(),
                            content.evolveCardSpec(ally.getName(), evo, content.stageOf(evo)))));
        }
        Collections.shuffle(battle.getDeck(), rng);

        battle.log(typeBanner(type));
        String passiveBanner = battleStartPassiveBanner(run, passive, pv);
        if (passiveBanner != null) {
            battle.log(passiveBanner);
        }
        run.setBattle(battle);

        drawOpeningHand(run, battle, rng);
        // Sigil-evolved allies refresh their hand cards after the opening draw.
        for (Combatant ally : battle.living(Side.PLAYER)) {
            if (!ally.isKnight() && ally.getEvolvedFrom() != null) {
                emitCardUpdate(battle, ally.getId(), rng);
            }
        }
        rollEnemyIntents(battle, rng);
        beginRound(run, rng);
    }

    /**
     * Applies equipped Evolution / Evolution 2 sigils at battle start. Each step
     * emits an {@code evolve} presentation event for the client.
     */
    private void applySigilEvolutions(SiegeRun run, SiegeBattle battle, Random rng) {
        for (Combatant ally : new ArrayList<>(battle.living(Side.PLAYER))) {
            if (ally.isKnight()) continue;
            SiegeItem item = content.findItem(ally.getItemId());
            if (item == null || !item.evolutionSigil()) continue;
            if ("EVOLUTION2".equals(item.kind())) {
                content.finalEvolutionOf(ally.getSourceCardId()).ifPresent(target ->
                        forceEvolveTo(run, battle, ally.getId(), target, rng));
            } else {
                content.evolutionOf(ally.getSourceCardId()).ifPresent(evo ->
                        forceEvolve(run, battle, ally.getId(), evo, rng, true));
            }
        }
    }

    /** Evolves {@code memberId} along the chain until it reaches {@code target}. */
    private void forceEvolveTo(SiegeRun run, SiegeBattle battle, String memberId,
                               SieglingCard target, Random rng) {
        int guard = 0;
        while (guard++ < 6) {
            Combatant current = battle.findCombatant(memberId);
            if (current == null || current.getSourceCardId().equals(target.getId())) break;
            Optional<SieglingCard> next = content.evolutionOf(current.getSourceCardId());
            if (next.isEmpty()) break;
            forceEvolve(run, battle, memberId, next.get(), rng, false);
        }
        Collections.shuffle(battle.getDeck(), rng);
    }

    /** Instantly evolves a Siegeling (sigil at battle start or internal helper). */
    private Combatant forceEvolve(SiegeRun run, SiegeBattle battle, String memberId,
                                  SieglingCard evo, Random rng, boolean shuffleDeck) {
        Combatant member = battle.findCombatant(memberId);
        if (member == null || member.getSide() != Side.PLAYER || member.isKnight()) return member;

        Combatant evolved = content.evolve(member, evo);
        evolved.setEvolvedFrom(member);
        evolved.setShield(member.getShield());
        evolved.setShieldExpiryRound(member.getShieldExpiryRound());
        evolved.addBattleMaxHp(member.getBattleMaxHpBonus());
        evolved.addAttackBuff(member.getAttackBuff());
        evolved.setItemId(member.getItemId());

        int bi = battle.getCombatants().indexOf(member);
        if (bi >= 0) battle.getCombatants().set(bi, evolved);
        int pi = run.getParty().indexOf(member);
        if (pi >= 0) run.getParty().set(pi, evolved);

        battle.event("evolve", "targetId", evolved.getId(), "from", member.getName(),
                "to", evolved.getName(), "element",
                evolved.getElement() == null ? null : evolved.getElement().name());
        battle.log("🌟 " + member.getName() + " evolves into " + evolved.getName() + "!");

        content.addNewStageCards(evo, evolved.getId(), battle.getDeck());
        if (shuffleDeck) Collections.shuffle(battle.getDeck(), rng);
        return evolved;
    }

    /**
     * Opening hand: 1 random Knight card + 1 random card from each active
     * Siegeling are guaranteed; the rest of the {@link SiegeBattle#HAND_START}
     * cards are random draws from the deck.
     */
    private void drawOpeningHand(SiegeRun run, SiegeBattle battle, Random rng) {
        // One guaranteed card per living Siegeling, plus one Knight card.
        List<String> wantedOwners = new ArrayList<>();
        for (Combatant ally : battle.living(Side.PLAYER)) {
            wantedOwners.add(ally.getId());
        }
        for (String owner : wantedOwners) {
            pullFromDeck(battle, c -> c.getOwnerId().equals(owner), rng);
        }
        pullFromDeck(battle, c -> c.getOwnerId().startsWith(KNIGHT_OWNER_PREFIX), rng);
        while (battle.getHand().size() < SiegeBattle.HAND_START && !battle.getDeck().isEmpty()) {
            battle.getHand().add(battle.getDeck().remove(battle.getDeck().size() - 1));
        }
    }

    private void pullFromDeck(SiegeBattle battle, java.util.function.Predicate<SiegeCard> match, Random rng) {
        if (battle.getHand().size() >= SiegeBattle.HAND_MAX) return;
        List<SiegeCard> candidates = battle.getDeck().stream().filter(match).toList();
        if (candidates.isEmpty()) return;
        SiegeCard pick = candidates.get(rng.nextInt(candidates.size()));
        battle.getDeck().remove(pick);
        battle.getHand().add(pick);
    }

    // ---- Rounds -----------------------------------------------------------

    /** Starts a new round: recompute team Speeds, decide order, open the turns. */
    private void beginRound(SiegeRun run, Random rng) {
        SiegeBattle battle = run.getBattle();
        if (battle == null || battle.isOver()) return;

        battle.setRoundNumber(battle.getRoundNumber() + 1);
        int playerSpeed = teamSpeed(battle, Side.PLAYER);
        int enemySpeed = teamSpeed(battle, Side.ENEMY);
        boolean playerFirst = playerSpeed != enemySpeed ? playerSpeed > enemySpeed : rng.nextBoolean();
        battle.setPlayerSpeed(playerSpeed);
        battle.setEnemySpeed(enemySpeed);
        battle.setPlayerActsFirst(playerFirst);
        battle.event("round", "round", battle.getRoundNumber(),
                "playerSpeed", playerSpeed, "enemySpeed", enemySpeed, "playerFirst", playerFirst);
        battle.log("— Round " + battle.getRoundNumber() + " · Speed " + playerSpeed + " vs " + enemySpeed
                + (playerSpeed == enemySpeed ? " (coin flip: " + (playerFirst ? "you" : "they") + " win)" : "")
                + " — " + (playerFirst ? "your side" : "the enemy") + " acts first —");

        if (playerFirst) {
            openPlayerTurn(run, rng);
        } else {
            resolveEnemyTurn(run, rng);
            if (checkEnd(run)) return;
            openPlayerTurn(run, rng);
        }
    }

    /** Sum of living, un-stunned active units' effective Speed (the Knight does not fight the line). */
    private int teamSpeed(SiegeBattle battle, Side side) {
        int total = 0;
        for (Combatant c : battle.living(side)) {
            if (!c.has(StatusKind.STUN)) {
                total += c.effectiveSpeed();
            }
        }
        return total;
    }

    /**
     * Lapses shields that were meant for an earlier turn. Called as each side's
     * turn opens, so "until the beginning of your next turn" is measured against
     * the shielded unit's own side rather than the round as a whole.
     */
    private void expireShields(SiegeBattle battle, Side side) {
        for (Combatant c : battle.living(side)) {
            if (c.getShield() <= 0 || battle.getRoundNumber() < c.getShieldExpiryRound()) continue;
            int lost = c.getShield();
            c.setShield(0);
            c.setShieldExpiryRound(0);
            battle.event("shieldExpired", "targetId", c.getId(), "amount", lost);
            battle.log(c.getName() + "'s shield fades.");
        }
    }

    private void openPlayerTurn(SiegeRun run, Random rng) {
        SiegeBattle battle = run.getBattle();

        expireShields(battle, Side.PLAYER);

        // Shock: each shocked Siegeling drains 1 AP from the shared pool.
        int ap = SiegeBattle.ACTIONS_PER_TURN;
        // Boon (Vanguard Rush): +2 AP on the first round of each battle.
        if (battle.getRoundNumber() <= 1 && battle.hasBoon(SiegeBoon.FIRST_ROUND_AP)) {
            ap += SiegeBoon.FIRST_ROUND_AP_BONUS;
            battle.log("⚡ Vanguard Rush — +" + SiegeBoon.FIRST_ROUND_AP_BONUS + " AP this opening round.");
        }
        for (Combatant ally : battle.living(Side.PLAYER)) {
            if (ally.has(StatusKind.SHOCK)) {
                ap = Math.max(0, ap - 1);
                ally.clearStatus(StatusKind.SHOCK);
                battle.log(ally.getName() + " is shocked — the party loses 1 AP.");
                battle.event("status-consumed", "targetId", ally.getId(), "status", "SHOCK");
            }
        }
        battle.setActionPoints(ap);
        battle.setPhase(BattlePhase.PLAYER_INPUT);

        // The Knight steels: +1 Ultimate Charge at the start of every turn.
        battle.addKnightCharge(1);

        Combatant lead = battle.living(Side.PLAYER).stream()
                .max(Comparator.comparingInt(Combatant::effectiveSpeed)).orElse(null);
        battle.setLeadId(lead == null ? null : lead.getId());

        // A fresh full hand every turn (the opening hand carries its guarantees).
        if (battle.getRoundNumber() > 1) {
            int before = battle.getHand().size();
            draw(battle, SiegeBattle.HAND_START - before, rng);
            int drawn = battle.getHand().size() - before;
            if (drawn > 0) {
                battle.event("draw", "count", drawn);
            }
        }
        battle.log("— Your turn · " + ap + " AP —");
    }

    private void draw(SiegeBattle battle, int count, Random rng) {
        for (int i = 0; i < count; i++) {
            if (battle.getHand().size() >= SiegeBattle.HAND_MAX) return;
            if (battle.getDeck().isEmpty()) {
                if (battle.getDiscard().isEmpty()) return;
                // Internal decks are permanent: the discard folds back into the
                // deck and is shuffled — surfaced to the client as an animation.
                int folded = battle.getDiscard().size();
                battle.getDeck().addAll(battle.getDiscard());
                battle.getDiscard().clear();
                Collections.shuffle(battle.getDeck(), rng);
                battle.event("reshuffle", "count", folded);
                battle.log("♻ The discard pile shuffles back into the deck (" + folded + " cards).");
            }
            battle.getHand().add(battle.getDeck().remove(battle.getDeck().size() - 1));
        }
    }

    // ---- Player actions -------------------------------------------------

    /** Result codes for the controller/service layer. */
    static final class PlayResult {
        final boolean ok;
        final String message;
        PlayResult(boolean ok, String message) { this.ok = ok; this.message = message; }
        static PlayResult fail(String m) { return new PlayResult(false, m); }
        static PlayResult okay() { return new PlayResult(true, null); }
    }

    PlayResult playCard(SiegeRun run, String cardInstanceId, String targetId, Random rng) {
        SiegeBattle battle = run.getBattle();
        if (battle == null || battle.getPhase() != BattlePhase.PLAYER_INPUT) {
            return PlayResult.fail("It is not your turn.");
        }
        SiegeCard card = battle.getHand().stream()
                .filter(c -> c.getInstanceId().equals(cardInstanceId)).findFirst().orElse(null);
        if (card == null) return PlayResult.fail("Card is not in your hand.");

        Combatant attacker = attackerFor(battle, card);
        if (attacker == null) return PlayResult.fail("That card's Siegeling has fallen.");
        if (!card.getOwnerId().startsWith(KNIGHT_OWNER_PREFIX)) {
            Combatant owner = battle.findCombatant(card.getOwnerId());
            if (owner != null && owner.has(StatusKind.STUN)) {
                return PlayResult.fail(owner.getName() + " is stunned and skips this action.");
            }
        }

        AbilitySpec spec = card.getSpec();
        int cost = effectiveCost(battle, spec);
        if (battle.getActionPoints() < cost) {
            return PlayResult.fail("Not enough action points.");
        }

        if (spec.effect() == Effect.EVOLVE) {
            // The evolution gauge must be filled first: 5 AP spent on this
            // Siegeling's own moves this battle.
            if (attacker.getApSpent() < SiegeBattle.EVOLVE_GAUGE) {
                return PlayResult.fail(attacker.getName() + " must spend " + SiegeBattle.EVOLVE_GAUGE
                        + " AP of moves before evolving (" + attacker.getApSpent() + "/" + SiegeBattle.EVOLVE_GAUGE + ").");
            }
            PlayResult evolved = playEvolution(run, battle, attacker, spec, rng);
            if (!evolved.ok) return evolved;
            battle.getHand().remove(card);
            // Evolution cards are consumed for the battle — they do not reshuffle.
            battle.setActionPoints(battle.getActionPoints() - cost);
            if (checkEnd(run)) return PlayResult.okay();
            if (battle.getActionPoints() <= 0 && !hasPlayableFreeCard(battle)) {
                endPlayerTurn(run, rng);
            }
            return PlayResult.okay();
        }

        List<Combatant> targets = resolveTargets(battle, spec, attacker, targetId);
        if (targets.isEmpty()) return PlayResult.fail("No valid target.");

        battle.event("card", "sourceId", attacker.getId(), "name", spec.name(),
                "element", spec.element() == null ? null : spec.element().name());
        // The card leaves the hand before it resolves, so a draw card refills the
        // slot it just vacated instead of being blocked by its own presence.
        battle.getHand().remove(card);
        applyEffect(battle, attacker, spec, targets, rng);
        battle.getDiscard().add(card);
        battle.setActionPoints(battle.getActionPoints() - cost);

        String targetNames = targets.stream().map(Combatant::getName).distinct()
                .reduce((a, b2) -> a + ", " + b2).orElse("");
        battle.turnEntry("you", attacker.getName(), spec.name(), cost,
                spec.name() + " → " + targetNames);

        // Playing a Siegeling's own move fills its evolution gauge.
        if (!card.getOwnerId().startsWith(KNIGHT_OWNER_PREFIX) && !attacker.isKnight()) {
            boolean wasReady = attacker.getApSpent() >= SiegeBattle.EVOLVE_GAUGE;
            attacker.addApSpent(spec.actionCost());
            if (!wasReady && attacker.getApSpent() >= SiegeBattle.EVOLVE_GAUGE) {
                battle.event("gaugeReady", "targetId", attacker.getId());
                battle.log(attacker.getName() + "'s evolution gauge is full!");
            }
        }

        // Knight cards feed the Knight's Ultimate.
        if (card.getOwnerId().startsWith(KNIGHT_OWNER_PREFIX)) {
            battle.addKnightCharge(1);
            battle.event("charge", "amount", 1, "total", battle.getKnightCharge());
        }

        if (checkEnd(run)) return PlayResult.okay();
        if (battle.getActionPoints() <= 0 && !hasPlayableFreeCard(battle)) {
            endPlayerTurn(run, rng);
        }
        return PlayResult.okay();
    }

    /**
     * Plays an evolution card: transforms the owner into the next stage for the
     * remainder of the battle (new art/stats + a heal surge; shield and attack
     * buffs carry over; statuses are cleansed), shuffles the new stage's moves
     * into the deck, and — if a further stage exists — unlocks its Evolution
     * card (3 AP) to draw.
     */
    private PlayResult playEvolution(SiegeRun run, SiegeBattle battle, Combatant member, AbilitySpec spec, Random rng) {
        if (member.getSide() != Side.PLAYER || member.isKnight()) {
            return PlayResult.fail("Only a Siegeling can evolve.");
        }
        String evoId = spec.id().startsWith("evo:") ? spec.id().substring(4) : spec.id();
        SieglingCard evo = content.findAnySiegling(evoId).orElse(null);
        if (evo == null) return PlayResult.fail("That evolution no longer exists.");

        Combatant evolved = content.evolve(member, evo);
        evolved.setEvolvedFrom(member);
        evolved.setShield(member.getShield());
        evolved.setShieldExpiryRound(member.getShieldExpiryRound());
        evolved.addBattleMaxHp(member.getBattleMaxHpBonus());
        evolved.addAttackBuff(member.getAttackBuff());
        evolved.setItemId(member.getItemId());

        // Same combatant id, so deck ownership and the sprite carry straight over.
        int bi = battle.getCombatants().indexOf(member);
        if (bi >= 0) battle.getCombatants().set(bi, evolved);
        int pi = run.getParty().indexOf(member);
        if (pi >= 0) run.getParty().set(pi, evolved);

        battle.event("evolve", "targetId", evolved.getId(), "from", member.getName(),
                "to", evolved.getName(), "element",
                evolved.getElement() == null ? null : evolved.getElement().name());
        battle.log("🌟 " + member.getName() + " evolves into " + evolved.getName() + "!");
        battle.turnEntry("you", member.getName(), spec.name(), spec.actionCost(),
                member.getName() + " evolves into " + evolved.getName());

        // The new stage's moves join the battle deck…
        int added = content.addNewStageCards(evo, evolved.getId(), battle.getDeck());
        if (added > 0) {
            battle.log(evolved.getName() + "'s new move" + (added == 1 ? " is" : "s are") + " shuffled into the deck.");
        }
        // …and evolving unlocks the next stage's Evolution card, if one exists.
        content.evolutionOf(evo.getId()).ifPresent(next -> {
            battle.getDeck().add(new SiegeCard("evo-" + evolved.getId() + "-3", evolved.getId(),
                    content.evolveCardSpec(evolved.getName(), next, 3)));
            battle.log("The path to " + next.getName() + " opens — its Evolution card joins the deck.");
        });
        battle.event("cardUpdate", "targetId", evolved.getId(), "previewMoves",
                previewMovesFor(battle, evolved, rng));
        Collections.shuffle(battle.getDeck(), rng);
        return PlayResult.okay();
    }

    /** Emits a card-update presentation event with random evolved-move previews. */
    private void emitCardUpdate(SiegeBattle battle, String ownerId, Random rng) {
        Combatant owner = battle.findCombatant(ownerId);
        if (owner == null) {
            battle.event("cardUpdate", "targetId", ownerId);
            return;
        }
        battle.event("cardUpdate", "targetId", ownerId, "previewMoves",
                previewMovesFor(battle, owner, rng));
    }

    private List<Map<String, Object>> previewMovesFor(SiegeBattle battle, Combatant owner, Random rng) {
        int owned = (int) battle.getHand().stream().filter(c -> c.getOwnerId().equals(owner.getId())).count();
        return content.findAnySiegling(owner.getSourceCardId())
                .map(evo -> content.previewMovesFor(evo, Math.max(1, owned), rng))
                .orElse(List.of());
    }

    /** 0-AP cards keep the turn open even at 0 AP. */
    private boolean hasPlayableFreeCard(SiegeBattle battle) {
        for (SiegeCard c : battle.getHand()) {
            if (c.getSpec().actionCost() == 0 && attackerFor(battle, c) != null) return true;
        }
        return false;
    }

    /** Fires the SiegeKnight's Ultimate: not a card, costs 0 AP, needs 20 Charge. */
    PlayResult useKnightUltimate(SiegeRun run, Random rng) {
        SiegeBattle battle = run.getBattle();
        if (battle == null || battle.getPhase() != BattlePhase.PLAYER_INPUT) {
            return PlayResult.fail("It is not your turn.");
        }
        if (battle.getKnightCharge() < SiegeBattle.KNIGHT_ULT_COST) {
            return PlayResult.fail("The Knight needs " + SiegeBattle.KNIGHT_ULT_COST + " Charge.");
        }
        Combatant knight = battle.knight();
        if (knight == null || !knight.isAlive()) return PlayResult.fail("The Knight has fallen.");

        battle.setKnightCharge(battle.getKnightCharge() - SiegeBattle.KNIGHT_ULT_COST);
        battle.event("ultimate", "sourceId", knight.getId(), "name", run.getKnightName() + "'s Ultimate",
                "element", knight.getElement() == null ? null : knight.getElement().name());
        battle.log("⚡ " + run.getKnightName() + " unleashes the Knight Ultimate!");
        battle.turnEntry("you", run.getKnightName(), "Knight Ultimate", 0,
                "Ultimate unleashed (" + KNIGHT_ULT_DAMAGE + " dmg to all enemies)");

        StatusKind status = SiegeContentService.statusFor(knight.getElement());
        for (Combatant foe : new ArrayList<>(battle.living(Side.ENEMY))) {
            boolean wasAlive = foe.isAlive();
            int dealt = foe.takeDamage(KNIGHT_ULT_DAMAGE);
            boolean killed = wasAlive && !foe.isAlive();
            battle.event("hit", "sourceId", knight.getId(), "targetId", foe.getId(),
                    "amount", dealt, "element", knight.getElement() == null ? null : knight.getElement().name(),
                    "ko", killed);
            battle.log(run.getKnightName() + "'s Ultimate → " + foe.getName() + " takes " + dealt
                    + (foe.isAlive() ? "" : " and is defeated!"));
            if (killed) battle.creditKill(knight.getId());
            if (foe.isAlive() && status != null) {
                applyStatus(battle, foe, status);
            }
        }
        checkEnd(run);
        return PlayResult.okay();
    }

    void endPlayerTurn(SiegeRun run, Random rng) {
        SiegeBattle battle = run.getBattle();
        if (battle == null || battle.getPhase() != BattlePhase.PLAYER_INPUT) return;

        // Unused AP converts directly into Knight Ultimate Charge — surfaced as
        // its own event so the client can show the pips flowing to the Knight.
        int leftover = battle.getActionPoints();
        if (leftover > 0) {
            battle.addKnightCharge(leftover);
            battle.log("Unused AP → +" + leftover + " Knight Charge (" + battle.getKnightCharge() + ").");
            battle.event("apCharge", "amount", leftover, "total", battle.getKnightCharge());
            battle.turnEntry("you", run.getKnightName(), null, -1,
                    "Unused AP → +" + leftover + " Ultimate Charge (" + battle.getKnightCharge() + "/" + SiegeBattle.KNIGHT_ULT_COST + ")");
        }
        battle.setActionPoints(0);

        // All remaining cards are discarded; a fresh hand comes next turn.
        if (!battle.getHand().isEmpty()) {
            int discarded = battle.getHand().size();
            battle.getDiscard().addAll(battle.getHand());
            battle.getHand().clear();
            battle.event("discardHand", "count", discarded);
        }

        // A stunned Siegeling has now skipped its action.
        for (Combatant ally : battle.living(Side.PLAYER)) {
            if (ally.has(StatusKind.STUN)) {
                ally.clearStatus(StatusKind.STUN);
                battle.event("status-consumed", "targetId", ally.getId(), "status", "STUN");
            }
        }

        // Passive evolution progress: every Siegeling gains at least 1 gauge
        // point per turn, on top of whatever AP it spent on its own moves —
        // otherwise a Siegeling whose whole moveset costs 0 AP could never
        // fill its evolution gauge from played moves alone.
        for (Combatant ally : battle.living(Side.PLAYER)) {
            if (ally.isKnight() || ally.getApSpent() >= SiegeBattle.EVOLVE_GAUGE) continue;
            ally.addApSpent(1);
            if (ally.getApSpent() >= SiegeBattle.EVOLVE_GAUGE) {
                battle.event("gaugeReady", "targetId", ally.getId());
                battle.log(ally.getName() + "'s evolution gauge is full!");
            }
        }

        battle.setPhase(BattlePhase.ENEMY_RESOLVING);
        if (battle.isPlayerActsFirst()) {
            resolveEnemyTurn(run, rng);
            if (checkEnd(run)) return;
        }
        endRound(run, rng);
    }

    private void endRound(SiegeRun run, Random rng) {
        SiegeBattle battle = run.getBattle();
        if (battle == null || battle.isOver()) return;

        // Burn / Poison: 1 damage at the end of each round while the status lasts.
        for (Combatant c : new ArrayList<>(battle.getCombatants())) {
            if (!c.isAlive()) continue;
            if (c.has(StatusKind.BURN)) {
                applyEndRoundDot(battle, c, StatusKind.BURN, "burns for 1.", "succumbs to the flames!");
            }
            if (c.isAlive() && c.has(StatusKind.POISON)) {
                applyEndRoundDot(battle, c, StatusKind.POISON, "takes 1 poison damage.", "succumbs to the toxin!");
            }
        }
        for (Combatant c : battle.getCombatants()) {
            c.tickStatuses();
        }
        if (checkEnd(run)) return;
        beginRound(run, rng);
    }

    private Combatant attackerFor(SiegeBattle battle, SiegeCard card) {
        if (card.getOwnerId().startsWith(KNIGHT_OWNER_PREFIX)) {
            Combatant knight = battle.knight();
            if (knight != null && knight.isAlive()) return knight;
            // Legacy runs without a knight unit: strongest living ally leads it.
            return battle.living(Side.PLAYER).stream()
                    .max(Comparator.comparingInt(Combatant::getHp)).orElse(null);
        }
        Combatant owner = battle.findCombatant(card.getOwnerId());
        return owner != null && owner.isAlive() ? owner : null;
    }

    private List<Combatant> resolveTargets(SiegeBattle battle, AbilitySpec spec, Combatant attacker, String targetId) {
        List<Combatant> out = new ArrayList<>();
        switch (spec.target()) {
            case ENEMY_SINGLE -> {
                Combatant t = battle.findCombatant(targetId);
                if (t != null && t.getSide() == Side.ENEMY && t.isAlive()) out.add(t);
            }
            case ALL_ENEMIES -> out.addAll(battle.living(Side.ENEMY));
            case ALLY_SINGLE -> {
                Combatant t = battle.findCombatant(targetId);
                if (t != null && t.getSide() == Side.PLAYER && !t.isKnight() && t.isAlive()) out.add(t);
                else if (attacker != null) out.add(attacker);
            }
            case ALLY_ALL -> out.addAll(battle.living(Side.PLAYER));
            case SELF -> { if (attacker != null) out.add(attacker); }
        }
        return out;
    }

    private void applyEffect(SiegeBattle battle, Combatant attacker, AbilitySpec spec, List<Combatant> targets, Random rng) {
        switch (spec.effect()) {
            case DAMAGE -> {
                for (Combatant t : targets) {
                    boolean wasAlive = t.isAlive();
                    int dmg = damageValue(attacker, spec);
                    int dealt = t.takeDamage(dmg);
                    boolean killed = wasAlive && !t.isAlive();
                    battle.event("hit", "sourceId", attacker.getId(), "targetId", t.getId(),
                            "amount", dealt, "element", spec.element() == null ? null : spec.element().name(),
                            "ko", killed);
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName()
                            + " takes " + dealt + (t.isAlive() ? "" : " and is defeated!"));
                    if (killed && t.getSide() == Side.ENEMY) battle.creditKill(attacker.getId());
                    if (t.isAlive()) {
                        rollStatus(battle, spec, t, rng);
                    }
                }
            }
            case HEAL -> {
                int amount = scaledMoveValue(attacker, spec.value());
                for (Combatant t : targets) {
                    t.heal(amount);
                    battle.event("heal", "sourceId", attacker.getId(), "targetId", t.getId(), "amount", amount);
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName() + " heals " + amount + ".");
                }
            }
            case SHIELD -> {
                int amount = scaledMoveValue(attacker, spec.value());
                for (Combatant t : targets) {
                    t.addShield(amount, shieldExpiryFor(battle, t));
                    battle.event("shield", "sourceId", attacker.getId(), "targetId", t.getId(), "amount", amount);
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName() + " gains " + amount
                            + " shield until its next turn.");
                }
            }
            case MAX_HP_BOOST -> {
                int amount = scaledMoveValue(attacker, spec.value());
                for (Combatant t : targets) {
                    t.addBattleMaxHp(amount);
                    // Reported as a heal because that is what the player sees: the
                    // bar grows and fills by the same amount.
                    battle.event("heal", "sourceId", attacker.getId(), "targetId", t.getId(), "amount", amount);
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName() + "'s max HP rises by "
                            + amount + " for this battle.");
                }
            }
            case BUFF_ATK -> {
                for (Combatant t : targets) t.addAttackBuff(spec.value());
                battle.event("buff", "kind", "atk", "amount", spec.value());
                battle.log(attacker.getName() + " uses " + spec.name() + " → "
                        + buffedNames(targets) + " gain +" + spec.value() + " attack.");
            }
            case BUFF_SPD -> {
                for (Combatant t : targets) t.setSpeed(t.getSpeed() + spec.value());
                battle.event("buff", "kind", "spd", "amount", spec.value());
                battle.log(attacker.getName() + " uses " + spec.name() + " → +" + spec.value() + " speed.");
            }
            case SLOW -> {
                for (Combatant t : targets) {
                    applyStatus(battle, t, StatusKind.SLOW);
                }
                battle.log(attacker.getName() + " uses " + spec.name() + " → " + buffedNames(targets) + " are slowed.");
            }
            case STUN -> {
                // Freeze makes a board Siegling skip its turn; here it skips its action.
                for (Combatant t : targets) {
                    applyStatus(battle, t, StatusKind.STUN);
                }
                battle.log(attacker.getName() + " uses " + spec.name() + " → " + buffedNames(targets)
                        + " will skip the next action.");
            }
            case DRAW -> {
                int before = battle.getHand().size();
                draw(battle, Math.max(1, spec.value()), rng);
                int drawn = battle.getHand().size() - before;
                battle.event("draw", "count", drawn);
                battle.log(attacker.getName() + " uses " + spec.name() + " → draws " + drawn
                        + (drawn == 1 ? " card." : " cards."));
            }
            case EXECUTE -> {
                for (Combatant t : targets) {
                    boolean wasAlive = t.isAlive();
                    int dmg = executeDamage(battle, t);
                    int dealt = t.takeDamage(dmg);
                    boolean killed = wasAlive && !t.isAlive();
                    battle.event("hit", "sourceId", attacker.getId(), "targetId", t.getId(),
                            "amount", dealt, "element", spec.element() == null ? null : spec.element().name(),
                            "ko", killed);
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName()
                            + (killed ? " is destroyed!" : " takes " + dealt + "."));
                    if (killed && t.getSide() == Side.ENEMY) battle.creditKill(attacker.getId());
                }
            }
            case SWAP -> {
                // Move to a new notch: the owner trades places with the chosen ally.
                Combatant other = targets.get(0);
                int a = attacker.getPosition(), b = other.getPosition();
                attacker.setPosition(b);
                other.setPosition(a);
                battle.event("swap", "aId", attacker.getId(), "bId", other.getId());
                battle.log(attacker.getName() + " uses " + spec.name() + " → swaps notches with " + other.getName() + ".");
            }
        }
    }

    /** "Rook, Ember and Vane" — reads better in the log than repeating the effect per unit. */
    private String buffedNames(List<Combatant> targets) {
        return targets.stream().map(Combatant::getName).distinct()
                .reduce((a, b) -> a + ", " + b).orElse("no one");
    }

    /**
     * The round a shield granted now should lapse on: the shielded unit's next
     * turn. Both sides act inside the same round number, so that is always the
     * round after this one.
     */
    private int shieldExpiryFor(SiegeBattle battle, Combatant target) {
        return Math.max(1, battle.getRoundNumber()) + 1;
    }

    /**
     * {@code destroy} kills outright, except against the encounters the run's
     * difficulty is built on — an elite or Siegelord takes
     * {@link #EXECUTE_BOSS_FRACTION} of its max HP instead.
     */
    private int executeDamage(SiegeBattle battle, Combatant target) {
        NodeType type = battle.getNodeType();
        boolean guarded = type == NodeType.ELITE || type == NodeType.BOSS;
        if (!guarded) return target.getHp() + target.getShield();
        return Math.max(1, (int) Math.round(target.getMaxHp() * EXECUTE_BOSS_FRACTION));
    }

    /** Damage is the card's (level-scaled) value plus explicit attack buffs. */
    private int damageValue(Combatant attacker, AbilitySpec spec) {
        return Math.max(0, scaledMoveValue(attacker, spec.value()) + attacker.getAttackBuff());
    }

    /**
     * Scales a Siegeling's own move value (damage/heal/shield) by +4% per level.
     * Only the owning player Siegeling's moves scale — the Knight's own moves and
     * enemy abilities are left at their written value.
     */
    private int scaledMoveValue(Combatant attacker, int base) {
        if (attacker == null || attacker.isKnight() || attacker.getSide() != Side.PLAYER) return base;
        return SiegeTuning.scaledMoveValue(base, attacker.getLevel());
    }

    private void rollStatus(SiegeBattle battle, AbilitySpec spec, Combatant target, Random rng) {
        if (spec.status() == null || spec.statusChance() <= 0) return;
        if (rng.nextInt(100) < spec.statusChance()) {
            applyStatus(battle, target, spec.status());
        }
    }

    private void applyStatus(SiegeBattle battle, Combatant target, StatusKind status) {
        int rounds = switch (status) {
            case BURN, POISON -> SiegeBattle.BURN_ROUNDS;
            case SLOW -> SiegeBattle.SLOW_ROUNDS;
            case STUN, SHOCK, DAZE, BLIND -> 2; // consumed on effect; duration is a safety net
            case SOAK, RUST, CURSE, WITHER -> SiegeBattle.SLOW_ROUNDS;
        };
        target.applyStatus(status, rounds);
        battle.event("status", "targetId", target.getId(), "status", status.name());
        battle.log(target.getName() + " is " + statusVerb(status) + "!");
    }

    private String statusVerb(StatusKind status) {
        return switch (status) {
            case BURN -> "burning";
            case SLOW -> "slowed";
            case STUN -> "stunned";
            case SHOCK -> "shocked";
            case POISON -> "poisoned";
            case SOAK -> "soaked";
            case RUST -> "rusting";
            case CURSE -> "cursed";
            case DAZE -> "dazed";
            case BLIND -> "blinded";
            case WITHER -> "withering";
        };
    }

    private void applyEndRoundDot(SiegeBattle battle, Combatant c, StatusKind kind, String tickLine, String koLine) {
        boolean wasAlive = c.isAlive();
        c.takeDamage(1);
        String eventName = kind == StatusKind.POISON ? "poison" : "burn";
        battle.event(eventName, "targetId", c.getId(), "amount", 1, "ko", wasAlive && !c.isAlive());
        battle.log(c.getName() + " " + tickLine);
        if (!c.isAlive()) {
            battle.log(c.getName() + " " + koLine);
            if (c.getSide() == Side.PLAYER && !c.isKnight() && !maybeReviveOnFall(battle, c)) {
                hitKnightForKo(battle, c);
            }
        }
    }

    // ---- Enemy turn -------------------------------------------------------

    /** Every living enemy executes its telegraphed intent, fastest first. */
    private void resolveEnemyTurn(SiegeRun run, Random rng) {
        SiegeBattle battle = run.getBattle();
        expireShields(battle, Side.ENEMY);
        List<Combatant> foes = new ArrayList<>(battle.living(Side.ENEMY));
        foes.sort(Comparator.comparingInt(Combatant::effectiveSpeed).reversed());

        for (Combatant foe : foes) {
            if (!foe.isAlive() || battle.isOver()) break;
            if (foe.has(StatusKind.STUN)) {
                foe.clearStatus(StatusKind.STUN);
                battle.event("stunned", "sourceId", foe.getId());
                battle.log(foe.getName() + " is stunned and skips its action.");
                battle.turnEntry("foe", foe.getName(), null, -1, "Stunned — skips its action");
                continue;
            }
            AbilitySpec choice = foe.getIntent() != null ? foe.getIntent() : pickEnemyAbility(foe, rng);
            if (choice == null) continue;
            executeEnemyAbility(battle, foe, choice, foe.getIntentPosition(), rng);
        }

        // Telegraph next round's moves so the player sees what is coming.
        if (!battle.isOver()) {
            rollEnemyIntents(battle, rng);
        }
    }

    private void executeEnemyAbility(SiegeBattle battle, Combatant foe, AbilitySpec choice, int targetPos, Random rng) {
        battle.event("enemyAct", "sourceId", foe.getId(), "name", choice.name(),
                "element", foe.getElement() == null ? null : foe.getElement().name(),
                "effect", choice.effect().name(), "position", targetPos);
        Combatant marked = battle.atPosition(targetPos);
        battle.turnEntry("foe", foe.getName(), choice.name(), -1,
                choice.name() + (choice.effect() == Effect.DAMAGE
                        ? (choice.target() == TargetKind.ALL_ENEMIES ? " → the whole line"
                        : " → " + (marked != null ? marked.getName() : "notch " + (targetPos + 1)))
                        : ""));

        switch (choice.effect()) {
            case HEAL -> {
                foe.heal(choice.value());
                battle.event("heal", "sourceId", foe.getId(), "targetId", foe.getId(), "amount", choice.value());
                battle.log(foe.getName() + " uses " + choice.name() + " and recovers " + choice.value() + ".");
            }
            case SHIELD -> {
                foe.addShield(choice.value(), shieldExpiryFor(battle, foe));
                battle.event("shield", "sourceId", foe.getId(), "targetId", foe.getId(), "amount", choice.value());
                battle.log(foe.getName() + " uses " + choice.name() + " and braces.");
            }
            case DAMAGE -> {
                int dmg = enemyDamage(battle, foe, choice);
                if (choice.target() == TargetKind.ALL_ENEMIES) {
                    // A sweep hits every notch.
                    List<Combatant> line = battle.living(Side.PLAYER);
                    if (line.isEmpty()) {
                        strikeKnight(battle, foe, choice, dmg, rng);
                    } else {
                        for (Combatant ally : new ArrayList<>(line)) {
                            strikeAlly(battle, foe, choice, ally, dmg, rng);
                        }
                    }
                } else {
                    Combatant occupant = battle.atPosition(targetPos);
                    if (occupant != null) {
                        strikeAlly(battle, foe, choice, occupant, dmg, rng);
                    } else if (battle.living(Side.PLAYER).isEmpty()) {
                        strikeKnight(battle, foe, choice, dmg, rng);
                    } else {
                        battle.event("whiff", "sourceId", foe.getId(), "name", choice.name(), "position", targetPos);
                        battle.log(foe.getName() + "'s " + choice.name() + " strikes empty ground — notch "
                                + (targetPos + 1) + " is vacant!");
                    }
                }
            }
            default -> battle.log(foe.getName() + " readies itself.");
        }
    }

    /**
     * AP cost of a move after run-wide Battlegrounds boons. Siegebreaker
     * (BOSS_AP_DISCOUNT) shaves 1 AP off every move during boss battles (min 0);
     * outside Battlegrounds no boons are active so the base cost is returned.
     */
    private int effectiveCost(SiegeBattle battle, AbilitySpec spec) {
        int cost = spec.actionCost();
        if (battle.getNodeType() == NodeType.BOSS && battle.hasBoon(SiegeBoon.BOSS_AP_DISCOUNT)) {
            cost = Math.max(0, cost - SiegeBoon.BOSS_AP_DISCOUNT_AMOUNT);
        }
        return cost;
    }

    /**
     * Second Wind boon (BATTLE_REVIVE): the first player Siegeling to fall in a
     * Battlegrounds battle is revived once, at {@link SiegeBoon#REVIVE_HP_PERCENT}%
     * of max HP, instead of exposing the Knight. Returns true when it fired.
     */
    private boolean maybeReviveOnFall(SiegeBattle battle, Combatant ally) {
        if (ally == null || ally.isKnight() || ally.getSide() != Side.PLAYER) return false;
        if (!battle.hasBoon(SiegeBoon.BATTLE_REVIVE) || battle.isBoonReviveUsed()) return false;
        battle.setBoonReviveUsed(true);
        int reviveHp = Math.max(1, ally.getMaxHp() * SiegeBoon.REVIVE_HP_PERCENT / 100);
        ally.setHp(reviveHp);
        battle.event("revive", "targetId", ally.getId(), "amount", reviveHp);
        battle.log("❤️ Second Wind — " + ally.getName() + " rallies at " + reviveHp + " HP!");
        return true;
    }

    private void strikeAlly(SiegeBattle battle, Combatant foe, AbilitySpec choice, Combatant ally, int dmg, Random rng) {
        boolean wasAlive = ally.isAlive();
        int dealt = ally.takeDamage(dmg);
        battle.event("hit", "sourceId", foe.getId(), "targetId", ally.getId(), "amount", dealt,
                "element", foe.getElement() == null ? null : foe.getElement().name(),
                "ko", wasAlive && !ally.isAlive());
        battle.log(foe.getName() + " uses " + choice.name() + " → " + ally.getName()
                + " takes " + dealt + (ally.isAlive() ? "" : " and falls!"));
        if (!ally.isAlive()) {
            if (!maybeReviveOnFall(battle, ally)) hitKnightForKo(battle, ally);
        } else {
            StatusKind status = SiegeContentService.statusFor(foe.getElement());
            if (status != null && rng.nextInt(100) < ENEMY_STATUS_CHANCE) {
                applyStatus(battle, ally, status);
            }
        }
    }

    private void strikeKnight(SiegeBattle battle, Combatant foe, AbilitySpec choice, int dmg, Random rng) {
        Combatant knight = battle.knight();
        if (knight == null || !knight.isAlive()) return;
        boolean wasAlive = knight.isAlive();
        int dealt = knight.takeDamage(dmg);
        battle.event("hit", "sourceId", foe.getId(), "targetId", knight.getId(), "amount", dealt,
                "element", foe.getElement() == null ? null : foe.getElement().name(),
                "ko", wasAlive && !knight.isAlive());
        battle.log(foe.getName() + " strikes " + knight.getName() + " directly for " + dealt + "!");
    }

    /** A KO'd Siegeling immediately deals 5 damage to its SiegeKnight. */
    private void hitKnightForKo(SiegeBattle battle, Combatant fallen) {
        Combatant knight = battle.knight();
        if (knight == null || !knight.isAlive()) return;
        int dealt = knight.takeDamage(KNIGHT_KO_DAMAGE);
        battle.event("knightHit", "targetId", knight.getId(), "amount", dealt, "hp", knight.getHp(),
                "cause", fallen.getName());
        battle.log(fallen.getName() + "'s fall wounds " + knight.getName() + " for " + dealt + "!");
    }

    /** A shocked enemy's next hit is blunted (its "lost AP"). */
    private int enemyDamage(SiegeBattle battle, Combatant foe, AbilitySpec spec) {
        int dmg = spec.value();
        if (foe.has(StatusKind.SHOCK)) {
            foe.clearStatus(StatusKind.SHOCK);
            dmg = Math.max(0, dmg - 2);
            battle.event("status-consumed", "targetId", foe.getId(), "status", "SHOCK");
            battle.log(foe.getName() + " is shocked — its blow is weakened.");
        }
        return dmg;
    }

    // ---- Enemy AI / telegraphs ------------------------------------------

    /** Pre-declares each living enemy's next ability and targeted notch. */
    private void rollEnemyIntents(SiegeBattle battle, Random rng) {
        for (Combatant foe : battle.living(Side.ENEMY)) {
            AbilitySpec pick = pickEnemyAbility(foe, rng);
            foe.setIntent(pick);
            foe.setIntentPosition(-1);
            if (pick != null && pick.effect() == Effect.DAMAGE && pick.target() != TargetKind.ALL_ENEMIES) {
                List<Combatant> line = battle.living(Side.PLAYER);
                if (!line.isEmpty()) {
                    // Aim at the weakest Siegeling's notch half the time, else anywhere.
                    Combatant mark = rng.nextBoolean()
                            ? line.stream().min(Comparator.comparingInt(Combatant::getHp)).orElse(line.get(0))
                            : line.get(rng.nextInt(line.size()));
                    foe.setIntentPosition(mark.getPosition());
                }
            }
        }
    }

    private AbilitySpec pickEnemyAbility(Combatant foe, Random rng) {
        List<AbilitySpec> abilities = foe.getAbilities();
        if (abilities.isEmpty()) return null;
        // Heal when badly hurt, if able.
        if (foe.getHp() < foe.getMaxHp() * 0.45) {
            for (AbilitySpec a : abilities) {
                if (a.effect() == Effect.HEAL) return a;
            }
        }
        // Otherwise favor the strongest damaging option, with some variety.
        List<AbilitySpec> damaging = abilities.stream().filter(a -> a.effect() == Effect.DAMAGE).toList();
        if (damaging.isEmpty()) return abilities.get(rng.nextInt(abilities.size()));
        if (rng.nextInt(100) < 70) {
            return damaging.stream().max(Comparator.comparingInt(AbilitySpec::value)).orElse(damaging.get(0));
        }
        return damaging.get(rng.nextInt(damaging.size()));
    }

    // ---- End conditions -------------------------------------------------

    private boolean checkEnd(SiegeRun run) {
        SiegeBattle battle = run.getBattle();
        if (battle == null || battle.isOver()) return battle != null && battle.isOver();
        if (battle.living(Side.ENEMY).isEmpty()) {
            battle.setPhase(BattlePhase.WON);
            battle.log("Victory! The enemies are defeated.");
            clearBattleBuffs(run);
            return true;
        }
        Combatant knight = battle.knight();
        boolean knightDown = knight != null && !knight.isAlive();
        boolean lineDown = battle.living(Side.PLAYER).isEmpty();
        if (knightDown || (knight == null && lineDown)) {
            battle.setPhase(BattlePhase.LOST);
            battle.log(knightDown ? run.getKnightName() + " has fallen — the siege is broken…"
                    : "Your warband has fallen…");
            clearBattleBuffs(run);
            return true;
        }
        return false;
    }

    private void clearBattleBuffs(SiegeRun run) {
        // Evolution is permanent only for the battle: members return to their
        // base form afterwards, carrying the damage they took home.
        for (int i = 0; i < run.getParty().size(); i++) {
            Combatant member = run.getParty().get(i);
            Combatant root = member;
            while (root.getEvolvedFrom() != null) {
                root = root.getEvolvedFrom();
            }
            if (root != member) {
                // Carry any XP the evolved form banked this battle back to the
                // base form (evolution is battle-scoped; leveling is not).
                if (member.getXp() > root.getXp()) root.loadLeveling(member.getXp());
                root.setHp(Math.min(root.getMaxHp(), member.getHp()));
                root.setPosition(member.getPosition());
                member.setEvolvedFrom(null);
                run.getParty().set(i, root);
            }
        }
        for (Combatant ally : run.getParty()) {
            ally.setShield(0);
            ally.setShieldExpiryRound(0);
            ally.setBattleMaxHpBonus(0);
            ally.setSpeed(ally.leveledBaseSpeed());
            ally.addAttackBuff(-ally.getAttackBuff());
            ally.clearStatuses();
        }
        if (run.getKnightUnit() != null) {
            run.getKnightUnit().clearStatuses();
        }
    }

    /** Combat-log line announcing the knight's battle-start passive, if any. */
    private String battleStartPassiveBanner(SiegeRun run, KnightPassive passive, int pv) {
        if (run.getKnightUnit() == null || passive == null) return null;
        String lead = run.getKnightName() + "'s command ";
        return switch (passive) {
            case SHIELD -> lead + "grants the party +" + pv + " shield.";
            case ATTACK -> lead + "rallies the party for +" + pv + " attack.";
            case SPEED -> lead + "quickens the party by +" + pv + " speed.";
            case HEALTH -> null;  // reflected in each Siegeling's raised max HP
            case LOOT -> null;    // reflected in richer spoils
            case MARSHAL -> null; // reflected in the extra starting Siegeling
        };
    }

    private String typeBanner(NodeType type) {
        return switch (type) {
            case BOSS -> "=== SIEGELORD BATTLE ===";
            case ELITE -> "=== ELITE SIEGE ===";
            default -> "=== BATTLE ===";
        };
    }
}
