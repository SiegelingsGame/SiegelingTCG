package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Session + orchestration layer for the Siege roguelike: creates runs, resolves
 * map nodes, drives battles through {@link SiegeCombatEngine}, and serializes
 * run/battle state to plain maps for the JSON API. Runs are held in memory and
 * scoped to an opaque token (mirrors the base solo-game pattern).
 */
@Service
public class SiegeService {

    private static final Duration RUN_TTL = Duration.ofHours(6);

    @Autowired
    private SiegeContentService content;

    @Autowired
    private SiegeCombatEngine engine;

    private final Map<String, Session> runs = new ConcurrentHashMap<>();
    private final SecureRandom tokenRandom = new SecureRandom();
    private final Random rng = new Random();

    private static final class Session {
        final SiegeRun run;
        volatile Instant lastSeen;
        Session(SiegeRun run) { this.run = run; this.lastSeen = Instant.now(); }
    }

    // ---- Roster for team select ----------------------------------------

    Map<String, Object> roster() {
        Map<String, Object> resp = new LinkedHashMap<>();
        List<Map<String, Object>> sieglings = new ArrayList<>();
        for (SieglingCard s : content.selectableSieglings()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("name", s.getName());
            m.put("element", s.getElement().name());
            m.put("rarity", s.getRarity().name());
            m.put("hp", 18 + s.getHealth() * 4);
            m.put("speed", Math.max(4, s.getSpeed()));
            m.put("moveCount", content.moveCount(s));
            m.put("artUrl", s.getCardArtUrl());
            sieglings.add(m);
        }
        List<Map<String, Object>> knights = new ArrayList<>();
        for (TrainerCard k : content.selectableKnights()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", k.getId());
            m.put("name", k.getName());
            m.put("element", k.getElement().name());
            m.put("activeName", k.getActiveAbility() == null ? "Rally" : k.getActiveAbility().getName());
            m.put("passive", content.knightPassiveDescription(k));
            knights.add(m);
        }
        resp.put("sieglings", sieglings);
        resp.put("knights", knights);
        resp.put("partySize", content.partySize());
        return resp;
    }

    // ---- Run lifecycle --------------------------------------------------

    Map<String, Object> newRun(String knightId, List<String> sieglingIds) {
        if (sieglingIds == null || sieglingIds.size() != content.partySize()) {
            throw new IllegalArgumentException("Choose exactly " + content.partySize() + " Siegelings.");
        }
        TrainerCard knight = content.findKnight(knightId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown SiegeKnight."));

        purgeStale();
        String token = generateToken();
        SiegeRun run = new SiegeRun(token);

        run.setKnightId(knight.getId());
        run.setKnightName(knight.getName());
        run.setKnightElement(knight.getElement());
        run.setKnightActive(content.knightActiveSpec(knight));
        run.setKnightPassiveDesc(content.knightPassiveDescription(knight));
        run.setKnightUnit(content.toKnightCombatant(knight));

        int slot = 0;
        for (String id : sieglingIds) {
            SieglingCard s = content.findSiegling(id)
                    .orElseThrow(() -> new IllegalArgumentException("Unknown Siegeling: " + id));
            Combatant member = content.toPartyCombatant(s, slot);
            run.getParty().add(member);
            run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
            slot++;
        }
        // The SiegeKnight contributes one card to the shared deck.
        if (run.getKnightActive() != null) {
            run.getDeckTemplates().add(new SiegeCard("knightcard", "knight-" + knight.getId(), run.getKnightActive()));
        }

        run.getMap().addAll(content.generateMap(rng));
        runs.put(token, new Session(run));
        return serialize(run);
    }

    Optional<SiegeRun> lookup(String token) {
        Session session = token == null ? null : runs.get(token);
        if (session == null) return Optional.empty();
        session.lastSeen = Instant.now();
        return Optional.of(session.run);
    }

    Map<String, Object> state(String token) {
        return lookup(token).map(this::serialize)
                .orElseThrow(() -> new IllegalArgumentException("Run not found. Start a new expedition."));
    }

    /** Travels to a reachable map node: starts a battle or resolves a rest/treasure stop. */
    Map<String, Object> enterNode(String token, int nodeId) {
        SiegeRun run = require(token);
        if (run.getStatus() != RunStatus.ACTIVE) return serialize(run);
        if (run.getBattle() != null && !run.getBattle().isOver()) return serialize(run); // battle already live
        if (!run.getPendingRewards().isEmpty()) {
            throw new IllegalArgumentException("Choose a reward before moving on.");
        }
        if (!run.reachableNodeIds().contains(nodeId)) {
            throw new IllegalArgumentException("That node is not on a path you can reach.");
        }
        SiegeNode node = run.nodeById(nodeId);
        run.setCurrentNodeId(nodeId);
        run.setLastReward("");

        if (node.isBattle()) {
            List<Element> palette = elementPaletteFor(run);
            List<Combatant> enemies = content.generateEnemies(node.getType(), node.getRow() + 1, rng, palette);
            engine.startBattle(run, node.getType(), enemies, rng);
        } else {
            resolveNonBattleNode(run, node);
        }
        return serialize(run);
    }

    private void resolveNonBattleNode(SiegeRun run, SiegeNode node) {
        switch (node.getType()) {
            case REST -> {
                int healed = 0;
                for (Combatant ally : run.getParty()) {
                    if (ally.isAlive()) {
                        int before = ally.getHp();
                        ally.setHp(before + (int) Math.round(ally.getMaxHp() * 0.4));
                        healed += ally.getHp() - before;
                    }
                }
                run.setLastReward("Rest Camp: the party recovers " + healed + " HP.");
            }
            case TREASURE -> {
                for (Combatant ally : run.getParty()) {
                    if (ally.isAlive()) ally.setMaxHp(ally.getMaxHp() + 4);
                    ally.heal(4);
                }
                run.setLastReward("Cache: each Siegeling gains +4 max HP.");
            }
            default -> run.setLastReward("");
        }
        node.setCleared(true);
    }

    /** Applies battle outcome; a win off the boss row queues reward choices. */
    Map<String, Object> continueRun(String token) {
        SiegeRun run = require(token);
        SiegeBattle battle = run.getBattle();
        if (battle == null) return serialize(run);
        if (battle.getPhase() == BattlePhase.WON) {
            SiegeNode node = run.currentNode();
            if (node != null) node.setCleared(true);
            // A short breather after victory.
            for (Combatant ally : run.getParty()) {
                if (ally.isAlive()) ally.heal((int) Math.round(ally.getMaxHp() * 0.12));
            }
            boolean wasBoss = node != null && node.getType() == NodeType.BOSS;
            boolean wasElite = node != null && node.getType() == NodeType.ELITE;
            run.setBattle(null);
            if (wasBoss) {
                run.setStatus(RunStatus.WON);
                run.setLastReward("The Siegelord is defeated — the expedition is won!");
            } else {
                run.setLastReward("Victory! Choose your spoils.");
                generateRewards(run, wasElite);
            }
        } else if (battle.getPhase() == BattlePhase.LOST) {
            run.setStatus(RunStatus.LOST);
            run.setBattle(null);
            run.setLastReward("The warband has fallen. The expedition ends here.");
        }
        return serialize(run);
    }

    // ---- Rewards ----------------------------------------------------------

    private void generateRewards(SiegeRun run, boolean elite) {
        run.getPendingRewards().clear();
        int optId = 0;

        // Two new-card offers, each bound to a random living Siegeling.
        List<Combatant> living = run.getParty().stream().filter(Combatant::isAlive).toList();
        if (living.isEmpty()) return;
        for (AbilitySpec spec : content.randomCardRewards(2, rng)) {
            Combatant owner = living.get(rng.nextInt(living.size()));
            run.getPendingRewards().add(RewardOption.card(
                    "r" + (optId++),
                    spec.name(),
                    spec.description() + " · learned by " + owner.getName(),
                    spec.element(), spec, owner.getId()));
        }

        // Elite wins can recruit a new Siegeling (until the warband is full);
        // otherwise offer an upgrade to a random existing card.
        boolean offerRecruit = elite && run.getParty().size() < content.partyMax();
        if (offerRecruit) {
            List<String> names = run.getParty().stream().map(Combatant::getName).toList();
            var recruit = content.randomRecruit(names, rng);
            if (recruit.isPresent()) {
                var s = recruit.get();
                run.getPendingRewards().add(RewardOption.recruit(
                        "r" + (optId++),
                        s.getName() + " joins!",
                        s.getName() + " (" + s.getElement().name() + ") joins the warband with its moves.",
                        s.getElement(), s.getCardArtUrl(), s.getId()));
                return;
            }
        }
        if (!run.getDeckTemplates().isEmpty()) {
            int idx = rng.nextInt(run.getDeckTemplates().size());
            SiegeCard target = run.getDeckTemplates().get(idx);
            AbilitySpec upgraded = content.upgradeSpec(target.getSpec());
            run.getPendingRewards().add(RewardOption.upgrade(
                    "r" + (optId++),
                    "Upgrade " + target.getSpec().name(),
                    target.getSpec().name() + " becomes " + upgraded.name() + " ("
                            + describeUpgrade(target.getSpec(), upgraded) + ").",
                    target.getSpec().element(), idx));
        }
    }

    private String describeUpgrade(AbilitySpec from, AbilitySpec to) {
        if (to.value() != from.value() && to.actionCost() != from.actionCost()) {
            return from.value() + "→" + to.value() + " power, " + from.actionCost() + "→" + to.actionCost() + " actions";
        }
        if (to.value() != from.value()) return from.value() + "→" + to.value() + " power";
        return from.actionCost() + "→" + to.actionCost() + " actions";
    }

    /** Applies the chosen reward ("skip" forfeits the choice). */
    Map<String, Object> chooseReward(String token, String optionId) {
        SiegeRun run = require(token);
        if (run.getPendingRewards().isEmpty()) return serialize(run);
        if (!"skip".equalsIgnoreCase(String.valueOf(optionId))) {
            RewardOption pick = run.getPendingRewards().stream()
                    .filter(o -> o.id().equals(optionId)).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Unknown reward option."));
            applyReward(run, pick);
        } else {
            run.setLastReward("The party pressed on without spoils.");
        }
        run.getPendingRewards().clear();
        return serialize(run);
    }

    private void applyReward(SiegeRun run, RewardOption pick) {
        switch (pick.kind()) {
            case "CARD" -> {
                run.getDeckTemplates().add(new SiegeCard(
                        "reward-" + pick.id() + "-" + run.getDeckTemplates().size(),
                        pick.ownerId(), pick.cardSpec()));
                run.setLastReward("Added " + pick.cardSpec().name() + " to the deck.");
            }
            case "UPGRADE" -> {
                int idx = pick.templateIndex();
                if (idx >= 0 && idx < run.getDeckTemplates().size()) {
                    SiegeCard old = run.getDeckTemplates().get(idx);
                    AbilitySpec upgraded = content.upgradeSpec(old.getSpec());
                    run.getDeckTemplates().set(idx, new SiegeCard(old.getInstanceId(), old.getOwnerId(), upgraded));
                    run.setLastReward(old.getSpec().name() + " was upgraded to " + upgraded.name() + ".");
                }
            }
            case "RECRUIT" -> content.findSiegling(pick.sieglingId()).ifPresent(s -> {
                Combatant member = content.toPartyCombatant(s, run.getParty().size());
                run.getParty().add(member);
                run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
                run.setLastReward(s.getName() + " joined the warband!");
            });
            default -> { }
        }
    }

    Map<String, Object> playCard(String token, String cardInstanceId, String targetId) {
        SiegeRun run = require(token);
        SiegeCombatEngine.PlayResult result = engine.playCard(run, cardInstanceId, targetId, rng);
        Map<String, Object> out = serialize(run);
        if (!result.ok && result.message != null) out.put("error", result.message);
        return out;
    }

    Map<String, Object> endTurn(String token) {
        SiegeRun run = require(token);
        engine.endPlayerTurn(run, rng);
        return serialize(run);
    }

    /** Fires the Knight Ultimate (not a card; 0 AP; needs 20 Charge). */
    Map<String, Object> knightUltimate(String token) {
        SiegeRun run = require(token);
        SiegeCombatEngine.PlayResult result = engine.useKnightUltimate(run, rng);
        Map<String, Object> out = serialize(run);
        if (!result.ok && result.message != null) out.put("error", result.message);
        return out;
    }

    private List<Element> elementPaletteFor(SiegeRun run) {
        // Bias enemies toward elements that counter the party for a bit of tension,
        // but fall back to the live palette so content stays valid.
        return content.defaultPalette();
    }

    // ---- Serialization --------------------------------------------------

    private Map<String, Object> serialize(SiegeRun run) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("token", run.getToken());
        m.put("status", run.getStatus().name());
        m.put("currentNodeId", run.getCurrentNodeId());
        m.put("lastReward", run.getLastReward());
        m.put("deckSize", run.getDeckTemplates().size());

        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("name", run.getKnightName());
        knight.put("element", run.getKnightElement() == null ? null : run.getKnightElement().name());
        knight.put("passive", run.getKnightPassiveDesc());
        knight.put("active", run.getKnightActive() == null ? null : run.getKnightActive().name());
        if (run.getKnightUnit() != null) {
            knight.put("hp", run.getKnightUnit().getHp());
            knight.put("maxHp", run.getKnightUnit().getMaxHp());
            knight.put("artUrl", run.getKnightUnit().getArtUrl());
        }
        m.put("knight", knight);

        List<Map<String, Object>> party = new ArrayList<>();
        for (Combatant c : run.getParty()) party.add(serializeCombatant(c, false));
        m.put("party", party);

        List<Integer> reachable = run.reachableNodeIds();
        List<Map<String, Object>> map = new ArrayList<>();
        for (SiegeNode node : run.getMap()) {
            Map<String, Object> n = new LinkedHashMap<>();
            n.put("id", node.getId());
            n.put("row", node.getRow());
            n.put("col", node.getCol());
            n.put("type", node.getType().name());
            n.put("label", node.getLabel());
            n.put("cleared", node.isCleared());
            n.put("current", node.getId() == run.getCurrentNodeId());
            n.put("reachable", reachable.contains(node.getId()));
            n.put("next", new ArrayList<>(node.getNext()));
            map.add(n);
        }
        m.put("map", map);

        List<Map<String, Object>> rewards = new ArrayList<>();
        for (RewardOption option : run.getPendingRewards()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", option.id());
            r.put("kind", option.kind());
            r.put("title", option.title());
            r.put("desc", option.desc());
            r.put("element", option.element() == null ? null : option.element().name());
            r.put("artUrl", option.artUrl());
            if (option.cardSpec() != null) {
                r.put("cardEffect", option.cardSpec().effect().name());
                r.put("cardValue", option.cardSpec().value());
                r.put("cardCost", option.cardSpec().actionCost());
                r.put("cardTarget", option.cardSpec().target().name());
            }
            rewards.add(r);
        }
        m.put("pendingRewards", rewards);

        SiegeBattle battle = run.getBattle();
        m.put("battle", battle == null ? null : serializeBattle(run, battle));
        return m;
    }

    private Map<String, Object> serializeBattle(SiegeRun run, SiegeBattle battle) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("phase", battle.getPhase().name());
        b.put("roundNumber", battle.getRoundNumber());
        b.put("playerActsFirst", battle.isPlayerActsFirst());
        b.put("playerSpeed", battle.getPlayerSpeed());
        b.put("enemySpeed", battle.getEnemySpeed());
        b.put("actionPoints", battle.getActionPoints());
        b.put("maxActionPoints", SiegeBattle.ACTIONS_PER_TURN);
        b.put("handMax", SiegeBattle.HAND_MAX);
        b.put("leadId", battle.getLeadId());
        b.put("nodeType", battle.getNodeType().name());
        b.put("deckCount", battle.getDeck().size());
        b.put("discardCount", battle.getDiscard().size());
        b.put("log", new ArrayList<>(battle.getLog()));

        // The Knight: HP, Ultimate Charge, and readiness for the HUD.
        Combatant knightUnit = battle.knight();
        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("name", run.getKnightName());
        knight.put("element", run.getKnightElement() == null ? null : run.getKnightElement().name());
        if (knightUnit != null) {
            knight.put("id", knightUnit.getId());
            knight.put("hp", knightUnit.getHp());
            knight.put("maxHp", knightUnit.getMaxHp());
            knight.put("artUrl", knightUnit.getArtUrl());
        }
        knight.put("charge", battle.getKnightCharge());
        knight.put("ultCost", SiegeBattle.KNIGHT_ULT_COST);
        knight.put("ultReady", knightUnit != null && knightUnit.isAlive()
                && battle.getKnightCharge() >= SiegeBattle.KNIGHT_ULT_COST);
        b.put("knight", knight);

        List<Map<String, Object>> allies = new ArrayList<>();
        List<Map<String, Object>> foes = new ArrayList<>();
        for (Combatant c : battle.getCombatants()) {
            if (c.isKnight()) continue;
            Map<String, Object> cm = serializeCombatant(c, c.getSide() == Side.ENEMY);
            if (c.getSide() == Side.PLAYER) allies.add(cm); else foes.add(cm);
        }
        // Present the line in notch order so positions read left → right.
        allies.sort((x, y) -> Integer.compare((int) x.getOrDefault("position", 0), (int) y.getOrDefault("position", 0)));
        b.put("allies", allies);
        b.put("enemies", foes);

        // Which notches are threatened by telegraphed enemy attacks.
        List<Integer> targetedPositions = new ArrayList<>();
        boolean sweepIncoming = false;
        for (Combatant foe : battle.living(Side.ENEMY)) {
            AbilitySpec intent = foe.getIntent();
            if (intent == null || intent.effect() != Effect.DAMAGE) continue;
            if (intent.target() == TargetKind.ALL_ENEMIES) sweepIncoming = true;
            else if (foe.getIntentPosition() >= 0 && !targetedPositions.contains(foe.getIntentPosition())) {
                targetedPositions.add(foe.getIntentPosition());
            }
        }
        b.put("targetedPositions", targetedPositions);
        b.put("sweepIncoming", sweepIncoming);

        // Presentation events since the last response, for client playback.
        b.put("events", new ArrayList<>(battle.getEvents()));
        battle.getEvents().clear();

        List<Map<String, Object>> hand = new ArrayList<>();
        boolean playerTurn = battle.getPhase() == BattlePhase.PLAYER_INPUT;
        // The damage boost is party-wide, so every living Siegeling shares the
        // same bonus; surface it on damage cards so the boosted number is visible.
        int partyAttackBuff = battle.living(Side.PLAYER).stream().mapToInt(Combatant::getAttackBuff).max().orElse(0);
        for (SiegeCard card : battle.getHand()) {
            AbilitySpec spec = card.getSpec();
            Combatant owner = battle.findCombatant(card.getOwnerId());
            boolean knightCard = card.getOwnerId().startsWith(SiegeCombatEngine.KNIGHT_OWNER_PREFIX);
            boolean ownerAlive = knightCard
                    ? (knightUnit != null ? knightUnit.isAlive() : !battle.living(Side.PLAYER).isEmpty())
                    : owner != null && owner.isAlive();
            boolean ownerReady = knightCard || owner == null || !owner.has(StatusKind.STUN);
            boolean affordable = battle.getActionPoints() >= spec.actionCost();
            Map<String, Object> h = new LinkedHashMap<>();
            h.put("instanceId", card.getInstanceId());
            h.put("name", spec.name());
            h.put("element", spec.element().name());
            h.put("effect", spec.effect().name());
            h.put("value", spec.value());
            if (spec.effect() == Effect.DAMAGE) {
                h.put("boostedValue", spec.value() + partyAttackBuff);
            }
            h.put("target", spec.target().name());
            h.put("actionCost", spec.actionCost());
            h.put("description", spec.description());
            if (spec.status() != null && spec.statusChance() > 0) {
                h.put("status", spec.status().name());
                h.put("statusChance", spec.statusChance());
            }
            h.put("ownerId", card.getOwnerId());
            h.put("ownerName", knightCard ? run.getKnightName() : (owner == null ? "" : owner.getName()));
            h.put("needsTarget", spec.needsExplicitTarget());
            h.put("playable", playerTurn && ownerAlive && ownerReady && affordable);
            hand.add(h);
        }
        b.put("hand", hand);
        return b;
    }

    private Map<String, Object> serializeCombatant(Combatant c, boolean includeAbilities) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getName());
        m.put("element", c.getElement() == null ? null : c.getElement().name());
        m.put("side", c.getSide().name());
        m.put("hp", c.getHp());
        m.put("maxHp", c.getMaxHp());
        m.put("shield", c.getShield());
        m.put("speed", c.getSpeed());
        m.put("effectiveSpeed", c.effectiveSpeed());
        m.put("attackBuff", c.getAttackBuff());
        m.put("alive", c.isAlive());
        m.put("artUrl", c.getArtUrl());
        m.put("position", c.getPosition());
        List<String> statuses = new ArrayList<>();
        for (StatusKind s : c.getStatuses().keySet()) statuses.add(s.name());
        m.put("statuses", statuses);
        if (includeAbilities) {
            List<String> names = new ArrayList<>();
            for (AbilitySpec a : c.getAbilities()) names.add(a.name());
            m.put("abilities", names);
            AbilitySpec intent = c.getIntent();
            if (intent != null) {
                Map<String, Object> im = new LinkedHashMap<>();
                im.put("name", intent.name());
                im.put("effect", intent.effect().name());
                im.put("value", intent.value());
                im.put("sweep", intent.target() == TargetKind.ALL_ENEMIES);
                im.put("position", c.getIntentPosition());
                m.put("intent", im);
            }
        }
        return m;
    }

    // ---- Helpers --------------------------------------------------------

    private SiegeRun require(String token) {
        return lookup(token).orElseThrow(() -> new IllegalArgumentException("Run not found. Start a new expedition."));
    }

    private String generateToken() {
        byte[] bytes = new byte[24];
        String token;
        do {
            tokenRandom.nextBytes(bytes);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } while (runs.containsKey(token));
        return token;
    }

    private void purgeStale() {
        Instant cutoff = Instant.now().minus(RUN_TTL);
        runs.values().removeIf(s -> s.lastSeen.isBefore(cutoff));
    }
}
