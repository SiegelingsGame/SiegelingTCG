package com.sieglings.adventure;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Random;

/**
 * Runs Siege battles on a speed-based initiative timeline.
 *
 * <p>Rules (v1):
 * <ul>
 *   <li>Every combatant accrues initiative each tick equal to its speed; when it
 *       crosses {@link SiegeBattle#READY_THRESHOLD} it takes a turn. A unit twice
 *       as fast therefore acts about twice as often — each enemy on its own clock.</li>
 *   <li>When a player Siegeling becomes ready the whole party takes one turn with a
 *       shared pool of {@link SiegeBattle#ACTIONS_PER_TURN} action points; cards cost
 *       1–3 actions. You play your whole turn, then the enemies act on their clocks.</li>
 *   <li>A card is only playable while its owning Siegeling is alive.</li>
 * </ul>
 */
@Service
public class SiegeCombatEngine {

    @Autowired
    private SiegeContentService content;

    static final String KNIGHT_OWNER_PREFIX = "knight-";

    // ---- Battle setup ---------------------------------------------------

    void startBattle(SiegeRun run, NodeType type, List<Combatant> enemies, Random rng) {
        SiegeBattle battle = new SiegeBattle(type);

        // Reset persistent party members for a fresh battle (HP carries over).
        int shield = run.getKnightActive() == null ? 0 : 4;
        for (Combatant ally : run.getParty()) {
            ally.setInitiative(0);
            ally.setShield(shield);
            ally.setSpeed(ally.getBaseSpeed());
            // attack buff is a fresh, per-battle value
            ally.addAttackBuff(-ally.getAttackBuff());
            battle.getCombatants().add(ally);
        }
        for (Combatant foe : enemies) {
            foe.setInitiative(0);
            battle.getCombatants().add(foe);
        }

        // Build the deck (fresh card instances from templates) and shuffle.
        int n = 0;
        for (SiegeCard template : run.getDeckTemplates()) {
            battle.getDeck().add(new SiegeCard("c" + (n++), template.getOwnerId(), template.getSpec()));
        }
        Collections.shuffle(battle.getDeck(), rng);

        battle.log(typeBanner(type));
        if (shield > 0) {
            battle.log(run.getKnightName() + "'s command grants the party +" + shield + " shield.");
        }
        run.setBattle(battle);

        // Determine who acts first.
        advance(run, rng);
    }

    // ---- Timeline -------------------------------------------------------

    /** Advances the initiative timeline until it is the player's turn or the battle ends. */
    void advance(SiegeRun run, Random rng) {
        SiegeBattle battle = run.getBattle();
        if (battle == null || battle.isOver()) return;

        int guard = 0;
        while (guard++ < 100000) {
            if (checkEnd(run)) return;

            Combatant ready = topReady(battle);
            if (ready == null) {
                tick(battle);
                continue;
            }

            if (ready.getSide() == Side.PLAYER) {
                openPlayerTurn(battle, ready, rng);
                return;
            }
            // Enemy acts immediately, then the loop continues.
            resolveEnemyTurn(battle, ready, rng);
            ready.setInitiative(ready.getInitiative() - SiegeBattle.READY_THRESHOLD);
            if (checkEnd(run)) return;
        }
    }

    private void tick(SiegeBattle battle) {
        for (Combatant c : battle.getCombatants()) {
            if (c.isAlive()) {
                c.addInitiative(Math.max(1, c.getSpeed()));
            }
        }
    }

    /** Highest-initiative living combatant that has crossed the threshold, players winning ties. */
    private Combatant topReady(SiegeBattle battle) {
        Combatant best = null;
        for (Combatant c : battle.getCombatants()) {
            if (!c.isAlive() || c.getInitiative() < SiegeBattle.READY_THRESHOLD) continue;
            if (best == null
                    || c.getInitiative() > best.getInitiative()
                    || (c.getInitiative() == best.getInitiative() && c.getSide() == Side.PLAYER && best.getSide() == Side.ENEMY)) {
                best = c;
            }
        }
        return best;
    }

    private void openPlayerTurn(SiegeBattle battle, Combatant lead, Random rng) {
        // Consume the readiness of every ready ally so the team takes one shared turn.
        for (Combatant ally : battle.living(Side.PLAYER)) {
            if (ally.getInitiative() >= SiegeBattle.READY_THRESHOLD) {
                ally.setInitiative(ally.getInitiative() - SiegeBattle.READY_THRESHOLD);
            }
        }
        battle.setLeadId(lead.getId());
        battle.setActionPoints(SiegeBattle.ACTIONS_PER_TURN);
        battle.setPhase(BattlePhase.PLAYER_INPUT);
        battle.setTurnNumber(battle.getTurnNumber() + 1);
        // Discard the old hand and draw a fresh one each turn.
        battle.getDiscard().addAll(battle.getHand());
        battle.getHand().clear();
        draw(battle, SiegeBattle.HAND_SIZE, rng);
        battle.log("— Your turn (" + lead.getName() + " leads) · " + SiegeBattle.ACTIONS_PER_TURN + " actions —");
    }

    private void draw(SiegeBattle battle, int count, Random rng) {
        for (int i = 0; i < count; i++) {
            if (battle.getDeck().isEmpty()) {
                if (battle.getDiscard().isEmpty()) return;
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

        AbilitySpec spec = card.getSpec();
        if (battle.getActionPoints() < spec.actionCost()) {
            return PlayResult.fail("Not enough action points.");
        }

        List<Combatant> targets = resolveTargets(battle, spec, attacker, targetId);
        if (targets.isEmpty()) return PlayResult.fail("No valid target.");

        applyEffect(battle, attacker, spec, targets);
        battle.getHand().remove(card);
        battle.getDiscard().add(card);
        battle.setActionPoints(battle.getActionPoints() - spec.actionCost());

        if (checkEnd(run)) return PlayResult.okay();
        if (battle.getActionPoints() <= 0) {
            endPlayerTurn(run, rng);
        }
        return PlayResult.okay();
    }

    void endPlayerTurn(SiegeRun run, Random rng) {
        SiegeBattle battle = run.getBattle();
        if (battle == null || battle.getPhase() != BattlePhase.PLAYER_INPUT) return;
        battle.log(run.getParty().stream().anyMatch(Combatant::isAlive) ? "You end your turn." : "");
        battle.setPhase(BattlePhase.ENEMY_RESOLVING);
        advance(run, rng);
    }

    private Combatant attackerFor(SiegeBattle battle, SiegeCard card) {
        if (card.getOwnerId().startsWith(KNIGHT_OWNER_PREFIX)) {
            // Knight card: led by the strongest living ally.
            return battle.living(Side.PLAYER).stream()
                    .max(Comparator.comparingInt(c -> c.getHp())).orElse(null);
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
                if (t != null && t.getSide() == Side.PLAYER && t.isAlive()) out.add(t);
                else if (attacker != null) out.add(attacker);
            }
            case ALLY_ALL -> out.addAll(battle.living(Side.PLAYER));
            case SELF -> { if (attacker != null) out.add(attacker); }
        }
        return out;
    }

    private void applyEffect(SiegeBattle battle, Combatant attacker, AbilitySpec spec, List<Combatant> targets) {
        switch (spec.effect()) {
            case DAMAGE -> {
                for (Combatant t : targets) {
                    int dmg = damageValue(attacker, spec, t);
                    int dealt = t.takeDamage(dmg);
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName()
                            + " takes " + dealt + (t.isAlive() ? "" : " and is defeated!"));
                }
            }
            case HEAL -> {
                for (Combatant t : targets) {
                    t.heal(spec.value());
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName() + " heals " + spec.value() + ".");
                }
            }
            case SHIELD -> {
                for (Combatant t : targets) {
                    t.setShield(t.getShield() + spec.value());
                    battle.log(attacker.getName() + " uses " + spec.name() + " → " + t.getName() + " gains " + spec.value() + " shield.");
                }
            }
            case BUFF_ATK -> {
                for (Combatant t : targets) t.addAttackBuff(spec.value());
                battle.log(attacker.getName() + " uses " + spec.name() + " → +" + spec.value() + " attack.");
            }
            case BUFF_SPD -> {
                for (Combatant t : targets) t.setSpeed(t.getSpeed() + spec.value());
                battle.log(attacker.getName() + " uses " + spec.name() + " → +" + spec.value() + " speed.");
            }
            case SLOW -> {
                for (Combatant t : targets) t.setInitiative(t.getInitiative() - spec.value() * 12.0);
                battle.log(attacker.getName() + " uses " + spec.name() + " → enemies are slowed.");
            }
        }
    }

    private int damageValue(Combatant attacker, AbilitySpec spec, Combatant target) {
        double base = spec.value() + attacker.getAttackBuff();
        double mult = content.weaknessMultiplier(spec.element(), target.getElement());
        return Math.max(1, (int) Math.round(base * mult));
    }

    // ---- Enemy AI -------------------------------------------------------

    private void resolveEnemyTurn(SiegeBattle battle, Combatant foe, Random rng) {
        List<Combatant> allies = battle.living(Side.PLAYER);
        if (allies.isEmpty()) return;

        AbilitySpec choice = pickEnemyAbility(foe, rng);
        if (choice == null) return;

        switch (choice.effect()) {
            case HEAL, SHIELD -> {
                if (choice.effect() == Effect.HEAL) foe.heal(choice.value());
                else foe.setShield(foe.getShield() + choice.value());
                battle.log(foe.getName() + " uses " + choice.name() + " and recovers.");
            }
            case DAMAGE -> {
                if (choice.target() == TargetKind.ALL_ENEMIES) {
                    for (Combatant ally : new ArrayList<>(allies)) {
                        int dealt = ally.takeDamage(enemyDamage(foe, choice, ally));
                        battle.log(foe.getName() + " uses " + choice.name() + " → " + ally.getName()
                                + " takes " + dealt + (ally.isAlive() ? "" : " and falls!"));
                    }
                } else {
                    Combatant target = allies.stream().min(Comparator.comparingInt(Combatant::getHp)).orElse(allies.get(0));
                    int dealt = target.takeDamage(enemyDamage(foe, choice, target));
                    battle.log(foe.getName() + " uses " + choice.name() + " → " + target.getName()
                            + " takes " + dealt + (target.isAlive() ? "" : " and falls!"));
                }
            }
            default -> battle.log(foe.getName() + " readies itself.");
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

    private int enemyDamage(Combatant foe, AbilitySpec spec, Combatant target) {
        double mult = content.weaknessMultiplier(foe.getElement(), target.getElement());
        return Math.max(1, (int) Math.round(spec.value() * mult));
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
        if (battle.living(Side.PLAYER).isEmpty()) {
            battle.setPhase(BattlePhase.LOST);
            battle.log("Your warband has fallen…");
            clearBattleBuffs(run);
            return true;
        }
        return false;
    }

    private void clearBattleBuffs(SiegeRun run) {
        for (Combatant ally : run.getParty()) {
            ally.setShield(0);
            ally.setInitiative(0);
            ally.setSpeed(ally.getBaseSpeed());
            ally.addAttackBuff(-ally.getAttackBuff());
        }
    }

    private String typeBanner(NodeType type) {
        return switch (type) {
            case BOSS -> "=== SIEGELORD BATTLE ===";
            case ELITE -> "=== ELITE SIEGE ===";
            default -> "=== BATTLE ===";
        };
    }
}
