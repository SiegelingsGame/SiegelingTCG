package com.sieglings.adventure;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
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

    static final String KNIGHT_OWNER_PREFIX = "knight-";
    /** Damage the Knight suffers whenever one of the Siegelings is knocked out. */
    static final int KNIGHT_KO_DAMAGE = 5;
    /** Chance an enemy's elemental attack applies its status. */
    static final int ENEMY_STATUS_CHANCE = 20;
    /** Knight Ultimate: heavy elemental sweep. */
    static final int KNIGHT_ULT_DAMAGE = 15;

    // ---- Battle setup ---------------------------------------------------

    void startBattle(SiegeRun run, NodeType type, List<Combatant> enemies, Random rng) {
        SiegeBattle battle = new SiegeBattle(type);

        // Reset persistent party members for a fresh battle (HP carries over),
        // then apply the knight's leadership passive (varies per knight).
        Combatant knight = run.getKnightUnit();
        KnightPassive passive = run.getKnightPassive();
        int pv = run.getKnightPassiveValue();
        int pos = 0;
        for (Combatant ally : run.getParty()) {
            ally.setShield(0);
            ally.setSpeed(ally.getBaseSpeed());
            ally.addAttackBuff(-ally.getAttackBuff());
            ally.clearStatuses();
            ally.setPosition(pos++);
            if (knight != null && passive != null) {
                switch (passive) {
                    case SHIELD -> ally.setShield(pv);
                    case ATTACK -> ally.addAttackBuff(pv);
                    case SPEED -> ally.setSpeed(ally.getBaseSpeed() + pv);
                    default -> { } // HEALTH is baked into max HP; LOOT affects gold only
                }
            }
            battle.getCombatants().add(ally);
        }
        if (knight != null) {
            knight.setShield(0);
            knight.clearStatuses();
            knight.setPosition(-1);
            battle.getCombatants().add(knight);
        }
        for (Combatant foe : enemies) {
            battle.getCombatants().add(foe);
        }

        // Build the deck (fresh card instances from templates) and shuffle.
        int n = 0;
        for (SiegeCard template : run.getDeckTemplates()) {
            battle.getDeck().add(new SiegeCard("c" + (n++), template.getOwnerId(), template.getSpec()));
        }
        Collections.shuffle(battle.getDeck(), rng);

        battle.log(typeBanner(type));
        String passiveBanner = battleStartPassiveBanner(run, passive, pv);
        if (passiveBanner != null) {
            battle.log(passiveBanner);
        }
        run.setBattle(battle);

        drawOpeningHand(run, battle, rng);
        rollEnemyIntents(battle, rng);
        beginRound(run, rng);
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

    private void openPlayerTurn(SiegeRun run, Random rng) {
        SiegeBattle battle = run.getBattle();

        // Shock: each shocked Siegeling drains 1 AP from the shared pool.
        int ap = SiegeBattle.ACTIONS_PER_TURN;
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

        // Draw 1 card at the start of every turn after the first (hand cap 8).
        if (battle.getRoundNumber() > 1 && battle.getHand().size() < SiegeBattle.HAND_MAX) {
            draw(battle, 1, rng);
        }
        battle.log("— Your turn · " + ap + " AP —");
    }

    private void draw(SiegeBattle battle, int count, Random rng) {
        for (int i = 0; i < count; i++) {
            if (battle.getHand().size() >= SiegeBattle.HAND_MAX) return;
            if (battle.getDeck().isEmpty()) {
                if (battle.getDiscard().isEmpty()) return;
                // Internal decks are permanent: played cards reshuffle back in.
                battle.getDeck().addAll(battle.getDiscard());
                battle.getDiscard().clear();
                Collections.shuffle(battle.getDeck(), rng);
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
        if (battle.getActionPoints() < spec.actionCost()) {
            return PlayResult.fail("Not enough action points.");
        }

        List<Combatant> targets = resolveTargets(battle, spec, attacker, targetId);
        if (targets.isEmpty()) return PlayResult.fail("No valid target.");

        battle.event("card", "sourceId", attacker.getId(), "name", spec.name(),
                "element", spec.element() == null ? null : spec.element().name());
        applyEffect(battle, attacker, spec, targets, rng);
        battle.getHand().remove(card);
        battle.getDiscard().add(card);
        battle.setActionPoints(battle.getActionPoints() - spec.actionCost());

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

        StatusKind status = SiegeContentService.statusFor(knight.getElement());
        for (Combatant foe : new ArrayList<>(battle.living(Side.ENEMY))) {
            boolean wasAlive = foe.isAlive();
            int dealt = foe.takeDamage(KNIGHT_ULT_DAMAGE);
            battle.event("hit", "sourceId", knight.getId(), "targetId", foe.getId(),
                    "amount", dealt, "element", knight.getElement() == null ? null : knight.getElement().name(),
                    "ko", wasAlive && !foe.isAlive());
            battle.log(run.getKnightName() + "'s Ultimate → " + foe.getName() + " takes " + dealt
                    + (foe.isAlive() ? "" : " and is defeated!"));
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

        // Unused AP converts directly into Knight Ultimate Charge.
        int leftover = battle.getActionPoints();
        if (leftover > 0) {
            battle.addKnightCharge(leftover);
            battle.log("Unused AP → +" + leftover + " Knight Charge (" + battle.getKnightCharge() + ").");
            battle.event("charge", "amount", leftover, "total", battle.getKnightCharge());
        }
        battle.setActionPoints(0);

        // A stunned Siegeling has now skipped its action.
        for (Combatant ally : battle.living(Side.PLAYER)) {
            if (ally.has(StatusKind.STUN)) {
                ally.clearStatus(StatusKind.STUN);
                battle.event("status-consumed", "targetId", ally.getId(), "status", "STUN");
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

        // Burn: 1 damage at the end of each round.
        for (Combatant c : new ArrayList<>(battle.getCombatants())) {
            if (c.isAlive() && c.has(StatusKind.BURN)) {
                boolean wasAlive = c.isAlive();
                c.takeDamage(1);
                battle.event("burn", "targetId", c.getId(), "amount", 1, "ko", wasAlive && !c.isAlive());
                battle.log(c.getName() + " burns for 1.");
                if (!c.isAlive()) {
                    battle.log(c.getName() + " succumbs to the flames!");
                    if (c.getSide() == Side.PLAYER && !c.isKnight()) {
                        hitKnightForKo(battle, c);
                    }
                }
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
                    battle.event("hit", "sourceId", attacker.getId(), "targetId", t.getId(),
                            "amount", dealt, "element", spec.element() == null ? null : spec.element().name(),
                            "ko", wasAlive && !t.isAlive());
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName()
                            + " takes " + dealt + (t.isAlive() ? "" : " and is defeated!"));
                    if (t.isAlive()) {
                        rollStatus(battle, spec, t, rng);
                    }
                }
            }
            case HEAL -> {
                for (Combatant t : targets) {
                    t.heal(spec.value());
                    battle.event("heal", "sourceId", attacker.getId(), "targetId", t.getId(), "amount", spec.value());
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName() + " heals " + spec.value() + ".");
                }
            }
            case SHIELD -> {
                for (Combatant t : targets) {
                    t.setShield(t.getShield() + spec.value());
                    battle.event("shield", "sourceId", attacker.getId(), "targetId", t.getId(), "amount", spec.value());
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName() + " gains " + spec.value() + " shield.");
                }
            }
            case BUFF_ATK -> {
                // A damage boost strengthens the whole warband so it reliably
                // applies to the party's shared turn.
                for (Combatant ally : battle.living(Side.PLAYER)) ally.addAttackBuff(spec.value());
                battle.event("buff", "kind", "atk", "amount", spec.value());
                battle.log(attacker.getName() + " uses " + spec.name() + " → the party gains +" + spec.value() + " attack.");
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
                battle.log(attacker.getName() + " uses " + spec.name() + " → enemies are slowed.");
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

    /** Damage is exactly the number written on the card, plus explicit attack buffs. */
    private int damageValue(Combatant attacker, AbilitySpec spec) {
        return Math.max(0, spec.value() + attacker.getAttackBuff());
    }

    private void rollStatus(SiegeBattle battle, AbilitySpec spec, Combatant target, Random rng) {
        if (spec.status() == null || spec.statusChance() <= 0) return;
        if (rng.nextInt(100) < spec.statusChance()) {
            applyStatus(battle, target, spec.status());
        }
    }

    private void applyStatus(SiegeBattle battle, Combatant target, StatusKind status) {
        int rounds = switch (status) {
            case BURN -> SiegeBattle.BURN_ROUNDS;
            case SLOW -> SiegeBattle.SLOW_ROUNDS;
            case STUN, SHOCK -> 2; // consumed on effect; duration is a safety net
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
        };
    }

    // ---- Enemy turn -------------------------------------------------------

    /** Every living enemy executes its telegraphed intent, fastest first. */
    private void resolveEnemyTurn(SiegeRun run, Random rng) {
        SiegeBattle battle = run.getBattle();
        List<Combatant> foes = new ArrayList<>(battle.living(Side.ENEMY));
        foes.sort(Comparator.comparingInt(Combatant::effectiveSpeed).reversed());

        for (Combatant foe : foes) {
            if (!foe.isAlive() || battle.isOver()) break;
            if (foe.has(StatusKind.STUN)) {
                foe.clearStatus(StatusKind.STUN);
                battle.event("stunned", "sourceId", foe.getId());
                battle.log(foe.getName() + " is stunned and skips its action.");
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

        switch (choice.effect()) {
            case HEAL -> {
                foe.heal(choice.value());
                battle.event("heal", "sourceId", foe.getId(), "targetId", foe.getId(), "amount", choice.value());
                battle.log(foe.getName() + " uses " + choice.name() + " and recovers " + choice.value() + ".");
            }
            case SHIELD -> {
                foe.setShield(foe.getShield() + choice.value());
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

    private void strikeAlly(SiegeBattle battle, Combatant foe, AbilitySpec choice, Combatant ally, int dmg, Random rng) {
        boolean wasAlive = ally.isAlive();
        int dealt = ally.takeDamage(dmg);
        battle.event("hit", "sourceId", foe.getId(), "targetId", ally.getId(), "amount", dealt,
                "element", foe.getElement() == null ? null : foe.getElement().name(),
                "ko", wasAlive && !ally.isAlive());
        battle.log(foe.getName() + " uses " + choice.name() + " → " + ally.getName()
                + " takes " + dealt + (ally.isAlive() ? "" : " and falls!"));
        if (!ally.isAlive()) {
            hitKnightForKo(battle, ally);
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
        for (Combatant ally : run.getParty()) {
            ally.setShield(0);
            ally.setSpeed(ally.getBaseSpeed());
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
            case HEALTH -> null; // reflected in each Siegeling's raised max HP
            case LOOT -> null;   // reflected in richer spoils
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
