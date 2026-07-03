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

    @Autowired
    private SiegeCheckpointStore checkpoints;

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
            m.put("evolves", content.evolutionOf(s.getId()).isPresent());
            m.put("moves", serializeSpecs(content.moveSpecs(s)));
            sieglings.add(m);
        }
        List<Map<String, Object>> knights = new ArrayList<>();
        for (TrainerCard k : content.selectableKnights()) {
            AbilitySpec active = content.knightActiveSpec(k);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", k.getId());
            m.put("name", k.getName());
            m.put("element", k.getElement().name());
            m.put("activeName", k.getActiveAbility() == null ? "Rally" : k.getActiveAbility().getName());
            m.put("activeDesc", active.description());
            m.put("active", serializeSpec(active));
            KnightPassive passive = content.knightPassiveKind(k);
            m.put("passive", content.knightPassiveDescription(k));
            m.put("passiveKind", passive.name());
            m.put("passiveName", content.knightPassiveName(passive));
            m.put("passiveValue", content.knightPassiveValue(passive));
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
        KnightPassive passive = content.knightPassiveKind(knight);
        run.setKnightPassive(passive);
        run.setKnightPassiveValue(content.knightPassiveValue(passive));
        run.setKnightUnit(content.toKnightCombatant(knight));

        int slot = 0;
        for (String id : sieglingIds) {
            SieglingCard s = content.findSiegling(id)
                    .orElseThrow(() -> new IllegalArgumentException("Unknown Siegeling: " + id));
            Combatant member = content.toPartyCombatant(s, slot);
            applyJoinBonus(run, member);
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
        checkpoint(run);
        return serialize(run);
    }

    /** Applies the knight's HEALTH passive to a member as it joins the warband. */
    private void applyJoinBonus(SiegeRun run, Combatant member) {
        if (run.getKnightPassive() == KnightPassive.HEALTH) {
            int v = run.getKnightPassiveValue();
            member.setMaxHp(member.getMaxHp() + v);
            member.heal(v);
        }
    }

    /** Credits gold, applying the knight's LOOT passive; returns the amount added. */
    private int earnGold(SiegeRun run, int base) {
        int amount = base;
        if (run.getKnightPassive() == KnightPassive.LOOT) {
            amount = base + Math.round(base * run.getKnightPassiveValue() / 100f);
        }
        run.addGold(amount);
        return amount;
    }

    Optional<SiegeRun> lookup(String token) {
        if (token == null) return Optional.empty();
        Session session = runs.get(token);
        if (session == null) {
            // Not in memory (e.g. the server restarted): try the checkpoint.
            Optional<SiegeRun> restored = checkpoints.load(token).flatMap(snap -> restoreRun(token, snap));
            if (restored.isEmpty()) return Optional.empty();
            session = new Session(restored.get());
            runs.put(token, session);
        }
        session.lastSeen = Instant.now();
        return Optional.of(session.run);
    }

    Map<String, Object> state(String token) {
        return lookup(token).map(this::serialize)
                .orElseThrow(() -> new IllegalArgumentException("Run not found. Start a new expedition."));
    }

    /** Player chose "start over" on the resume prompt: drop the run and its checkpoint for good. */
    void abandonRun(String token) {
        if (token == null) return;
        runs.remove(token);
        checkpoints.delete(token);
    }

    // ---- Checkpoints (save mid-battle and at safe map states; resume later) --

    /**
     * Persists the run — including a live battle, if one is in progress — so
     * closing the app or losing connection mid-fight resumes exactly where it
     * left off. Camp/cache/broker/reward prompts are short-lived UI states
     * without their own persisted model, so those are skipped (the last
     * checkpoint before entering them still resumes cleanly). Deletes the
     * checkpoint once the run ends.
     */
    private void checkpoint(SiegeRun run) {
        if (run.getStatus() != RunStatus.ACTIVE) {
            checkpoints.delete(run.getToken());
            run.setCheckpointSaved(false);
            return;
        }
        boolean safe = !run.isInCamp() && !run.isInCache() && !run.isInBroker() && run.getPendingRewards().isEmpty();
        if (!safe) return;
        run.setCheckpointSaved(checkpoints.save(run.getToken(), snapshotRun(run)));
    }

    private Map<String, Object> snapshotRun(SiegeRun run) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("version", 1);
        s.put("knightId", run.getKnightId());
        s.put("gold", run.getGold());
        s.put("currentNodeId", run.getCurrentNodeId());
        if (run.getKnightUnit() != null) {
            s.put("knightHp", run.getKnightUnit().getHp());
            s.put("knightMaxHp", run.getKnightUnit().getMaxHp());
        }
        List<Map<String, Object>> party = new ArrayList<>();
        for (Combatant c : run.getParty()) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("id", c.getId());
            p.put("sourceCardId", c.getSourceCardId());
            p.put("hp", c.getHp());
            p.put("maxHp", c.getMaxHp());
            p.put("position", c.getPosition());
            party.add(p);
        }
        s.put("party", party);
        List<Map<String, Object>> deck = new ArrayList<>();
        for (SiegeCard card : run.getDeckTemplates()) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("iid", card.getInstanceId());
            d.put("owner", card.getOwnerId());
            d.put("spec", specToMap(card.getSpec()));
            deck.add(d);
        }
        s.put("deck", deck);
        List<Map<String, Object>> map = new ArrayList<>();
        for (SiegeNode node : run.getMap()) {
            Map<String, Object> n = new LinkedHashMap<>();
            n.put("id", node.getId());
            n.put("row", node.getRow());
            n.put("col", node.getCol());
            n.put("type", node.getType().name());
            n.put("label", node.getLabel());
            n.put("cleared", node.isCleared());
            n.put("next", new ArrayList<>(node.getNext()));
            map.add(n);
        }
        s.put("map", map);
        if (run.getBattle() != null) {
            s.put("battle", snapshotBattle(run.getBattle()));
        }
        return s;
    }

    private Map<String, Object> snapshotBattle(SiegeBattle battle) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("nodeType", battle.getNodeType().name());
        b.put("phase", battle.getPhase().name());
        b.put("actionPoints", battle.getActionPoints());
        b.put("roundNumber", battle.getRoundNumber());
        b.put("playerActsFirst", battle.isPlayerActsFirst());
        b.put("playerSpeed", battle.getPlayerSpeed());
        b.put("enemySpeed", battle.getEnemySpeed());
        b.put("knightCharge", battle.getKnightCharge());
        b.put("leadId", battle.getLeadId());
        b.put("log", new ArrayList<>(battle.getLog()));
        b.put("turnLog", new ArrayList<>(battle.getTurnLog()));
        List<Map<String, Object>> combatants = new ArrayList<>();
        for (Combatant c : battle.getCombatants()) {
            combatants.add(snapshotCombatant(c));
        }
        b.put("combatants", combatants);
        b.put("deck", snapshotCards(battle.getDeck()));
        b.put("hand", snapshotCards(battle.getHand()));
        b.put("discard", snapshotCards(battle.getDiscard()));
        return b;
    }

    private List<Map<String, Object>> snapshotCards(List<SiegeCard> cards) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (SiegeCard card : cards) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("iid", card.getInstanceId());
            d.put("owner", card.getOwnerId());
            d.put("spec", specToMap(card.getSpec()));
            out.add(d);
        }
        return out;
    }

    private Map<String, Object> snapshotCombatant(Combatant c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getName());
        m.put("element", c.getElement() == null ? null : c.getElement().name());
        m.put("side", c.getSide().name());
        m.put("knight", c.isKnight());
        m.put("artUrl", c.getArtUrl());
        m.put("maxHp", c.getMaxHp());
        m.put("hp", c.getHp());
        m.put("shield", c.getShield());
        m.put("speed", c.getSpeed());
        m.put("baseSpeed", c.getBaseSpeed());
        m.put("attackBuff", c.getAttackBuff());
        m.put("position", c.getPosition());
        m.put("sourceCardId", c.getSourceCardId());
        m.put("apSpent", c.getApSpent());
        Map<String, Integer> statuses = new LinkedHashMap<>();
        c.getStatuses().forEach((k, v) -> statuses.put(k.name(), v));
        m.put("statuses", statuses);
        List<Map<String, Object>> abilities = new ArrayList<>();
        for (AbilitySpec spec : c.getAbilities()) abilities.add(specToMap(spec));
        m.put("abilities", abilities);
        m.put("intent", c.getIntent() == null ? null : specToMap(c.getIntent()));
        m.put("intentPosition", c.getIntentPosition());
        return m;
    }

    @SuppressWarnings("unchecked")
    private SiegeBattle restoreBattle(Map<String, Object> b) {
        SiegeBattle battle = new SiegeBattle(NodeType.valueOf(String.valueOf(b.get("nodeType"))));
        battle.setPhase(BattlePhase.valueOf(String.valueOf(b.get("phase"))));
        battle.setActionPoints(intVal(b.get("actionPoints"), SiegeBattle.ACTIONS_PER_TURN));
        battle.setRoundNumber(intVal(b.get("roundNumber"), 0));
        battle.setPlayerActsFirst(!Boolean.FALSE.equals(b.get("playerActsFirst")));
        battle.setPlayerSpeed(intVal(b.get("playerSpeed"), 0));
        battle.setEnemySpeed(intVal(b.get("enemySpeed"), 0));
        battle.setKnightCharge(intVal(b.get("knightCharge"), 0));
        battle.setLeadId(b.get("leadId") == null ? null : String.valueOf(b.get("leadId")));
        for (Object line : (List<Object>) b.getOrDefault("log", List.of())) {
            battle.log(String.valueOf(line));
        }
        for (Object entry : (List<Object>) b.getOrDefault("turnLog", List.of())) {
            battle.getTurnLog().add((Map<String, Object>) entry);
        }
        for (Object c : (List<Object>) b.getOrDefault("combatants", List.of())) {
            battle.getCombatants().add(restoreCombatant((Map<String, Object>) c));
        }
        for (Object d : (List<Object>) b.getOrDefault("deck", List.of())) battle.getDeck().add(restoreSiegeCard((Map<String, Object>) d));
        for (Object d : (List<Object>) b.getOrDefault("hand", List.of())) battle.getHand().add(restoreSiegeCard((Map<String, Object>) d));
        for (Object d : (List<Object>) b.getOrDefault("discard", List.of())) battle.getDiscard().add(restoreSiegeCard((Map<String, Object>) d));
        return battle;
    }

    private SiegeCard restoreSiegeCard(Map<String, Object> d) {
        return new SiegeCard(String.valueOf(d.get("iid")), String.valueOf(d.get("owner")),
                specFromMap((Map<String, Object>) d.get("spec")));
    }

    @SuppressWarnings("unchecked")
    private Combatant restoreCombatant(Map<String, Object> m) {
        Element element = m.get("element") == null ? null : Element.valueOf(String.valueOf(m.get("element")));
        Side side = Side.valueOf(String.valueOf(m.get("side")));
        boolean knight = Boolean.TRUE.equals(m.get("knight"));
        int baseSpeed = intVal(m.get("baseSpeed"), 1);
        Combatant c = new Combatant(String.valueOf(m.get("id")), String.valueOf(m.get("name")), element, side,
                intVal(m.get("maxHp"), 1), baseSpeed,
                m.get("artUrl") == null ? null : String.valueOf(m.get("artUrl")), knight);
        c.setHp(intVal(m.get("hp"), c.getMaxHp()));
        c.setShield(intVal(m.get("shield"), 0));
        c.setSpeed(intVal(m.get("speed"), baseSpeed));
        c.addAttackBuff(intVal(m.get("attackBuff"), 0));
        c.setPosition(intVal(m.get("position"), -1));
        c.setSourceCardId(m.get("sourceCardId") == null ? null : String.valueOf(m.get("sourceCardId")));
        c.setApSpent(intVal(m.get("apSpent"), 0));
        Object statuses = m.get("statuses");
        if (statuses instanceof Map) {
            ((Map<String, Object>) statuses).forEach((k, v) -> c.applyStatus(StatusKind.valueOf(k), intVal(v, 1)));
        }
        Object abilities = m.get("abilities");
        if (abilities instanceof List) {
            for (Object a : (List<Object>) abilities) c.getAbilities().add(specFromMap((Map<String, Object>) a));
        }
        Object intent = m.get("intent");
        if (intent instanceof Map) {
            c.setIntent(specFromMap((Map<String, Object>) intent));
        }
        c.setIntentPosition(intVal(m.get("intentPosition"), -1));
        return c;
    }

    private Map<String, Object> specToMap(AbilitySpec spec) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("id", spec.id());
        s.put("name", spec.name());
        s.put("element", spec.element() == null ? null : spec.element().name());
        s.put("effect", spec.effect().name());
        s.put("value", spec.value());
        s.put("target", spec.target().name());
        s.put("cost", spec.actionCost());
        s.put("desc", spec.description());
        s.put("status", spec.status() == null ? null : spec.status().name());
        s.put("statusChance", spec.statusChance());
        return s;
    }

    @SuppressWarnings("unchecked")
    private Optional<SiegeRun> restoreRun(String token, Map<String, Object> s) {
        try {
            TrainerCard knight = content.findKnight(String.valueOf(s.get("knightId"))).orElse(null);
            if (knight == null) return Optional.empty();
            SiegeRun run = new SiegeRun(token);
            run.setKnightId(knight.getId());
            run.setKnightName(knight.getName());
            run.setKnightElement(knight.getElement());
            run.setKnightActive(content.knightActiveSpec(knight));
            run.setKnightPassiveDesc(content.knightPassiveDescription(knight));
            KnightPassive passive = content.knightPassiveKind(knight);
            run.setKnightPassive(passive);
            run.setKnightPassiveValue(content.knightPassiveValue(passive));
            Combatant knightUnit = content.toKnightCombatant(knight);
            knightUnit.setMaxHp(intVal(s.get("knightMaxHp"), knightUnit.getMaxHp()));
            knightUnit.setHp(intVal(s.get("knightHp"), knightUnit.getMaxHp()));
            run.setKnightUnit(knightUnit);
            run.setGold(intVal(s.get("gold"), 0));
            run.setCurrentNodeId(intVal(s.get("currentNodeId"), -1));

            for (Map<String, Object> p : (List<Map<String, Object>>) s.get("party")) {
                String sourceId = String.valueOf(p.get("sourceCardId"));
                SieglingCard src = content.findAnySiegling(sourceId).orElse(null);
                if (src == null) return Optional.empty(); // catalog changed under us
                int maxHp = intVal(p.get("maxHp"), 18 + src.getHealth() * 4);
                Combatant m = new Combatant(String.valueOf(p.get("id")), src.getName(), src.getElement(),
                        Side.PLAYER, maxHp, Math.max(4, src.getSpeed()), src.getCardArtUrl());
                m.setSourceCardId(sourceId);
                m.setHp(intVal(p.get("hp"), maxHp));
                m.setPosition(intVal(p.get("position"), run.getParty().size()));
                run.getParty().add(m);
            }
            for (Map<String, Object> d : (List<Map<String, Object>>) s.get("deck")) {
                run.getDeckTemplates().add(new SiegeCard(String.valueOf(d.get("iid")),
                        String.valueOf(d.get("owner")), specFromMap((Map<String, Object>) d.get("spec"))));
            }
            for (Map<String, Object> n : (List<Map<String, Object>>) s.get("map")) {
                SiegeNode node = new SiegeNode(intVal(n.get("id"), 0), intVal(n.get("row"), 0),
                        intVal(n.get("col"), 0), NodeType.valueOf(String.valueOf(n.get("type"))),
                        String.valueOf(n.get("label")));
                node.setCleared(Boolean.TRUE.equals(n.get("cleared")));
                for (Object next : (List<Object>) n.get("next")) {
                    node.getNext().add(intVal(next, 0));
                }
                run.getMap().add(node);
            }

            // A live battle takes precedence over the idle party/knight HP above —
            // its combatants ARE the party/knight instances (same objects the
            // combat engine mutates), so restoring it keeps every stat (shield,
            // statuses, position, hand/deck/discard, enemy intents) exact.
            if (s.get("battle") instanceof Map) {
                SiegeBattle battle = restoreBattle((Map<String, Object>) s.get("battle"));
                run.setBattle(battle);
                List<Combatant> restoredParty = new ArrayList<>();
                Combatant restoredKnight = null;
                for (Combatant c : battle.getCombatants()) {
                    if (c.getSide() != Side.PLAYER) continue;
                    if (c.isKnight()) restoredKnight = c; else restoredParty.add(c);
                }
                restoredParty.sort((x, y) -> Integer.compare(x.getPosition(), y.getPosition()));
                run.getParty().clear();
                run.getParty().addAll(restoredParty);
                if (restoredKnight != null) run.setKnightUnit(restoredKnight);
            }

            run.setCheckpointSaved(true);
            run.setLastReward("Welcome back — the expedition resumes from your last checkpoint.");
            return Optional.of(run);
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    private AbilitySpec specFromMap(Map<String, Object> s) {
        Object statusName = s.get("status");
        return new AbilitySpec(
                String.valueOf(s.get("id")),
                String.valueOf(s.get("name")),
                s.get("element") == null ? null : Element.valueOf(String.valueOf(s.get("element"))),
                Effect.valueOf(String.valueOf(s.get("effect"))),
                intVal(s.get("value"), 0),
                TargetKind.valueOf(String.valueOf(s.get("target"))),
                intVal(s.get("cost"), 1),
                s.get("desc") == null ? "" : String.valueOf(s.get("desc")),
                statusName == null ? null : StatusKind.valueOf(String.valueOf(statusName)),
                intVal(s.get("statusChance"), 0));
    }

    private int intVal(Object value, int fallback) {
        return value instanceof Number n ? n.intValue() : fallback;
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
        } else if (node.getType() == NodeType.REST) {
            openCamp(run);
        } else if (node.getType() == NodeType.TREASURE) {
            openCache(run);
        } else if (node.getType() == NodeType.BROKER) {
            openBroker(run);
        } else {
            node.setCleared(true);
            checkpoint(run);
        }
        return serialize(run);
    }

    // ---- Broker stall (recruit or swap Siegelings for gold) ----------------

    private static final int BROKER_HIRE_COST = 40;
    private static final int BROKER_SWAP_COST = 20;

    /** Opens a broker stall offering up to three Siegelings for hire or swap. */
    private void openBroker(SiegeRun run) {
        run.setInBroker(true);
        run.getBrokerOptions().clear();
        List<String> names = run.getParty().stream().map(Combatant::getName).toList();
        int oid = 0;
        for (SieglingCard s : content.randomRecruits(3, names, rng)) {
            run.getBrokerOptions().add(CampOption.broker("b" + (oid++), s.getName(), s.getElement(),
                    s.getCardArtUrl(), s.getId(), BROKER_HIRE_COST));
        }
    }

    /**
     * Hires a broker Siegeling. With {@code replaceId} it swaps in for that
     * party member (cheaper — the member is released and its cards leave the
     * deck); without it the recruit joins an open warband slot.
     */
    Map<String, Object> brokerHire(String token, String optionId, String replaceId) {
        SiegeRun run = require(token);
        if (!run.isInBroker()) throw new IllegalArgumentException("There is no broker here.");
        CampOption pick = run.getBrokerOptions().stream()
                .filter(o -> o.id.equals(optionId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown broker offer."));
        if (pick.used) throw new IllegalArgumentException("That Siegeling has already been taken.");

        boolean swap = replaceId != null && !replaceId.isBlank() && !"null".equals(replaceId);
        int cost = swap ? BROKER_SWAP_COST : BROKER_HIRE_COST;
        if (!swap && run.getParty().size() >= content.partyMax()) {
            throw new IllegalArgumentException("The warband is full — swap a member instead.");
        }
        if (run.getGold() < cost) throw new IllegalArgumentException("Not enough gold.");
        SieglingCard s = content.findSiegling(pick.sieglingId)
                .orElseThrow(() -> new IllegalArgumentException("That Siegeling is gone."));

        run.addGold(-cost);
        if (swap) {
            Combatant leaving = run.getParty().stream()
                    .filter(m -> m.getId().equals(replaceId)).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Unknown party member to swap out."));
            int position = leaving.getPosition();
            run.getParty().remove(leaving);
            run.getDeckTemplates().removeIf(c -> c.getOwnerId().equals(leaving.getId()));
            Combatant member = content.toPartyCombatant(s, run.getParty().size());
            member.setPosition(position >= 0 ? position : run.getParty().size());
            applyJoinBonus(run, member);
            run.getParty().add(member);
            run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
            run.setLastReward(s.getName() + " joins the warband — " + leaving.getName() + " returns to the broker.");
        } else {
            Combatant member = content.toPartyCombatant(s, run.getParty().size());
            member.setPosition(run.getParty().size());
            applyJoinBonus(run, member);
            run.getParty().add(member);
            run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
            run.setLastReward(s.getName() + " joined the warband!");
        }
        pick.used = true;
        return serialize(run);
    }

    /** Leaves the broker stall; the node is spent. */
    Map<String, Object> brokerLeave(String token) {
        SiegeRun run = require(token);
        if (!run.isInBroker()) return serialize(run);
        run.setInBroker(false);
        run.getBrokerOptions().clear();
        SiegeNode node = run.currentNode();
        if (node != null) node.setCleared(true);
        checkpoint(run);
        return serialize(run);
    }

    // ---- Rest Camp (interactive stop: fire, trader, broker) ---------------

    /** Sets up camp: resting is free; a trader and/or Siegeling broker may be there. */
    private void openCamp(SiegeRun run) {
        run.setInCamp(true);
        run.getCampOptions().clear();
        int oid = 0;
        run.getCampOptions().add(CampOption.rest("c" + (oid++)));

        boolean trader = rng.nextInt(100) < 65;
        boolean broker = rng.nextInt(100) < 45 && run.getParty().size() < content.partyMax();

        if (trader) {
            List<Combatant> living = run.getParty().stream().filter(Combatant::isAlive).toList();
            if (!living.isEmpty()) {
                for (AbilitySpec spec : content.randomCardRewards(2, rng)) {
                    Combatant owner = living.get(rng.nextInt(living.size()));
                    run.getCampOptions().add(CampOption.shopCard("c" + (oid++), spec, owner.getId(), owner.getName(), 25));
                }
            }
            run.getCampOptions().add(CampOption.shopHeal("c" + (oid++), 15));
            if (!run.getDeckTemplates().isEmpty()) {
                int idx = rng.nextInt(run.getDeckTemplates().size());
                AbilitySpec spec = run.getDeckTemplates().get(idx).getSpec();
                run.getCampOptions().add(CampOption.shopUpgrade("c" + (oid++), spec.name(), spec.element(), idx, 20));
            }
        }
        if (broker) {
            List<String> names = run.getParty().stream().map(Combatant::getName).toList();
            String brokerId = "c" + oid;
            content.randomRecruit(names, rng).ifPresent(s ->
                    run.getCampOptions().add(CampOption.broker(brokerId, s.getName(), s.getElement(),
                            s.getCardArtUrl(), s.getId(), 45)));
        }

        run.setCampNote(trader && broker ? "A wandering trader and a Siegeling broker share your fire tonight."
                : trader ? "A wandering trader has set up shop by the fire."
                : broker ? "A Siegeling broker warms their hands at your fire."
                : "A quiet night. The fire crackles; the warband rests easy.");
    }

    /** Uses one camp interaction (each option once; goods cost gold). */
    Map<String, Object> campChoose(String token, String optionId) {
        SiegeRun run = require(token);
        if (!run.isInCamp()) throw new IllegalArgumentException("The party is not camped.");
        CampOption pick = run.getCampOptions().stream()
                .filter(o -> o.id.equals(optionId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown camp option."));
        if (pick.used) throw new IllegalArgumentException("Already used this stop.");
        if (run.getGold() < pick.cost) throw new IllegalArgumentException("Not enough gold.");

        switch (pick.kind) {
            case "REST" -> {
                int healed = 0;
                for (Combatant ally : run.getParty()) {
                    if (ally.isAlive()) {
                        int before = ally.getHp();
                        ally.setHp(before + (int) Math.round(ally.getMaxHp() * 0.4));
                        healed += ally.getHp() - before;
                    }
                }
                if (run.getKnightUnit() != null && run.getKnightUnit().isAlive()) {
                    int before = run.getKnightUnit().getHp();
                    run.getKnightUnit().setHp(before + (int) Math.round(run.getKnightUnit().getMaxHp() * 0.4));
                    healed += run.getKnightUnit().getHp() - before;
                }
                run.setLastReward("The party rests: +" + healed + " HP.");
            }
            case "SHOP_HEAL" -> {
                run.addGold(-pick.cost);
                int healed = 0;
                for (Combatant ally : run.getParty()) {
                    if (ally.isAlive()) {
                        int before = ally.getHp();
                        ally.setHp(before + (int) Math.round(ally.getMaxHp() * 0.25));
                        healed += ally.getHp() - before;
                    }
                }
                run.setLastReward("Hot stew! The party recovers " + healed + " HP.");
            }
            case "SHOP_CARD" -> {
                run.addGold(-pick.cost);
                run.getDeckTemplates().add(new SiegeCard(
                        "camp-" + pick.id + "-" + run.getDeckTemplates().size(), pick.ownerId, pick.cardSpec));
                run.setLastReward("Bought " + pick.cardSpec.name() + " for the deck.");
            }
            case "SHOP_UPGRADE" -> {
                run.addGold(-pick.cost);
                int idx = pick.templateIndex;
                if (idx >= 0 && idx < run.getDeckTemplates().size()) {
                    SiegeCard old = run.getDeckTemplates().get(idx);
                    AbilitySpec upgraded = content.upgradeSpec(old.getSpec());
                    run.getDeckTemplates().set(idx, new SiegeCard(old.getInstanceId(), old.getOwnerId(), upgraded));
                    run.setLastReward(old.getSpec().name() + " was honed into " + upgraded.name() + ".");
                }
            }
            case "BROKER" -> {
                run.addGold(-pick.cost);
                content.findSiegling(pick.sieglingId).ifPresent(s -> {
                    Combatant member = content.toPartyCombatant(s, run.getParty().size());
                    member.setPosition(run.getParty().size());
                    applyJoinBonus(run, member);
                    run.getParty().add(member);
                    run.getDeckTemplates().addAll(content.deckCardsFor(s, member.getId()));
                    run.setLastReward(s.getName() + " joined the warband!");
                });
            }
            default -> { }
        }
        pick.used = true;
        return serialize(run);
    }

    /** Breaks camp: the stop is spent and the map opens up again. */
    Map<String, Object> campLeave(String token) {
        SiegeRun run = require(token);
        if (!run.isInCamp()) return serialize(run);
        run.setInCamp(false);
        run.getCampOptions().clear();
        SiegeNode node = run.currentNode();
        if (node != null) node.setCleared(true);
        checkpoint(run);
        return serialize(run);
    }

    // ---- Cache dig minigame (press your luck) ------------------------------

    private static final int CACHE_MAX_DIGS = 4;

    private void openCache(SiegeRun run) {
        run.setInCache(true);
        run.setCacheDigs(0);
        run.setCacheGold(6 + rng.nextInt(6));
        run.setLastReward("");
    }

    private int cacheBustChance(SiegeRun run) {
        return Math.min(85, 15 + run.getCacheDigs() * 20);
    }

    /** Digs deeper: more loot, or the cache collapses and unbanked gold is lost. */
    Map<String, Object> cacheDig(String token) {
        SiegeRun run = require(token);
        if (!run.isInCache()) throw new IllegalArgumentException("No cache to dig.");
        int bust = cacheBustChance(run);
        if (rng.nextInt(100) < bust) {
            run.setInCache(false);
            run.setCacheGold(0);
            SiegeNode node = run.currentNode();
            if (node != null) node.setCleared(true);
            run.setLastReward("The cache collapses! The unbanked loot is buried…");
            checkpoint(run);
            return serialize(run);
        }
        run.setCacheDigs(run.getCacheDigs() + 1);
        int roll = rng.nextInt(100);
        if (roll < 60) {
            int found = 8 + rng.nextInt(8);
            run.setCacheGold(run.getCacheGold() + found);
            run.setLastReward("Dug up " + found + " gold — bank it or dig deeper?");
        } else if (roll < 85) {
            List<Combatant> living = run.getParty().stream().filter(Combatant::isAlive).toList();
            if (!living.isEmpty()) {
                Combatant lucky = living.get(rng.nextInt(living.size()));
                lucky.setMaxHp(lucky.getMaxHp() + 3);
                lucky.heal(3);
                run.setLastReward("An ancient tonic! " + lucky.getName() + " gains +3 max HP (kept even on a bust).");
            }
        } else {
            List<AbilitySpec> finds = content.randomCardRewards(1, rng);
            List<Combatant> living = run.getParty().stream().filter(Combatant::isAlive).toList();
            if (!finds.isEmpty() && !living.isEmpty()) {
                Combatant owner = living.get(rng.nextInt(living.size()));
                run.getDeckTemplates().add(new SiegeCard(
                        "cache-" + run.getDeckTemplates().size(), owner.getId(), finds.get(0)));
                run.setLastReward("A buried technique! " + owner.getName() + " learns " + finds.get(0).name() + " (kept even on a bust).");
            }
        }
        // The floor gives way after enough digging: bank automatically.
        if (run.getCacheDigs() >= CACHE_MAX_DIGS) {
            return cacheTake(token);
        }
        return serialize(run);
    }

    /** Banks the loot and seals the cache. */
    Map<String, Object> cacheTake(String token) {
        SiegeRun run = require(token);
        if (!run.isInCache()) return serialize(run);
        int banked = earnGold(run, run.getCacheGold());
        run.setInCache(false);
        run.setCacheGold(0);
        SiegeNode node = run.currentNode();
        if (node != null) node.setCleared(true);
        run.setLastReward("Banked " + banked + " gold from the cache.");
        checkpoint(run);
        return serialize(run);
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

            // Spoils: gold scales with how deep the fight was; elites pay more.
            int floor = node == null ? 1 : node.getRow() + 1;
            int base = 10 + floor * 2 + (wasElite ? 10 : 0) + rng.nextInt(5);
            int gold = earnGold(run, base);

            if (wasBoss) {
                run.setStatus(RunStatus.WON);
                run.setLastReward("The Siegelord is defeated — the expedition is won!");
            } else {
                run.setLastReward("Victory! +" + gold + " gold. Choose your spoils.");
                generateRewards(run, wasElite);
            }
        } else if (battle.getPhase() == BattlePhase.LOST) {
            run.setStatus(RunStatus.LOST);
            run.setBattle(null);
            run.setLastReward("The warband has fallen. The expedition ends here.");
        }
        checkpoint(run);
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
        checkpoint(run);
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
                member.setPosition(run.getParty().size());
                applyJoinBonus(run, member);
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
        checkpoint(run);
        Map<String, Object> out = serialize(run);
        if (!result.ok && result.message != null) out.put("error", result.message);
        return out;
    }

    Map<String, Object> endTurn(String token) {
        SiegeRun run = require(token);
        engine.endPlayerTurn(run, rng);
        checkpoint(run);
        return serialize(run);
    }

    /** Fires the Knight Ultimate (not a card; 0 AP; needs 20 Charge). */
    Map<String, Object> knightUltimate(String token) {
        SiegeRun run = require(token);
        SiegeCombatEngine.PlayResult result = engine.useKnightUltimate(run, rng);
        checkpoint(run);
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

    /** Compact JSON for a list of ability specs (detail modals / shop cards). */
    private List<Map<String, Object>> serializeSpecs(List<AbilitySpec> specs) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (AbilitySpec spec : specs) out.add(serializeSpec(spec));
        return out;
    }

    private Map<String, Object> serializeSpec(AbilitySpec spec) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("name", spec.name());
        s.put("element", spec.element() == null ? null : spec.element().name());
        s.put("effect", spec.effect().name());
        s.put("value", spec.value());
        s.put("actionCost", spec.actionCost());
        s.put("target", spec.target().name());
        s.put("description", spec.description());
        if (spec.status() != null && spec.statusChance() > 0) {
            s.put("status", spec.status().name());
            s.put("statusChance", spec.statusChance());
        }
        return s;
    }

    private Map<String, Object> serialize(SiegeRun run) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("token", run.getToken());
        m.put("status", run.getStatus().name());
        m.put("currentNodeId", run.getCurrentNodeId());
        m.put("lastReward", run.getLastReward());
        m.put("deckSize", run.getDeckTemplates().size());
        m.put("gold", run.getGold());

        // Interactive camp stop (rest / trader / broker).
        if (run.isInCamp()) {
            Map<String, Object> camp = new LinkedHashMap<>();
            camp.put("note", run.getCampNote());
            List<Map<String, Object>> options = new ArrayList<>();
            for (CampOption o : run.getCampOptions()) {
                Map<String, Object> om = new LinkedHashMap<>();
                om.put("id", o.id);
                om.put("kind", o.kind);
                om.put("title", o.title);
                om.put("desc", o.desc);
                om.put("cost", o.cost);
                om.put("element", o.element == null ? null : o.element.name());
                om.put("artUrl", o.artUrl);
                om.put("used", o.used);
                om.put("affordable", run.getGold() >= o.cost);
                if (o.cardSpec != null) om.put("card", serializeSpec(o.cardSpec));
                options.add(om);
            }
            camp.put("options", options);
            m.put("camp", camp);
        } else {
            m.put("camp", null);
        }

        // Cache dig minigame.
        if (run.isInCache()) {
            Map<String, Object> cache = new LinkedHashMap<>();
            cache.put("loot", run.getCacheGold());
            cache.put("digs", run.getCacheDigs());
            cache.put("maxDigs", 4);
            cache.put("bustChance", Math.min(85, 15 + run.getCacheDigs() * 20));
            m.put("cache", cache);
        } else {
            m.put("cache", null);
        }

        // Broker stall (recruit or swap).
        if (run.isInBroker()) {
            Map<String, Object> broker = new LinkedHashMap<>();
            broker.put("hireCost", BROKER_HIRE_COST);
            broker.put("swapCost", BROKER_SWAP_COST);
            broker.put("partyFull", run.getParty().size() >= content.partyMax());
            List<Map<String, Object>> offers = new ArrayList<>();
            for (CampOption o : run.getBrokerOptions()) {
                Map<String, Object> om = new LinkedHashMap<>();
                om.put("id", o.id);
                om.put("name", o.title.replace(" joins for hire", ""));
                om.put("element", o.element == null ? null : o.element.name());
                om.put("artUrl", o.artUrl);
                om.put("used", o.used);
                SieglingCard src = content.findSiegling(o.sieglingId).orElse(null);
                if (src != null) {
                    om.put("hp", 18 + src.getHealth() * 4);
                    om.put("speed", Math.max(4, src.getSpeed()));
                    om.put("moves", serializeSpecs(content.moveSpecs(src)));
                    om.put("evolves", content.evolutionOf(src.getId()).isPresent());
                }
                offers.add(om);
            }
            broker.put("offers", offers);
            m.put("broker", broker);
        } else {
            m.put("broker", null);
        }

        m.put("checkpoint", run.isCheckpointSaved());

        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("name", run.getKnightName());
        knight.put("element", run.getKnightElement() == null ? null : run.getKnightElement().name());
        knight.put("passive", run.getKnightPassiveDesc());
        knight.put("passiveKind", run.getKnightPassive() == null ? null : run.getKnightPassive().name());
        knight.put("passiveName", run.getKnightPassive() == null ? null : content.knightPassiveName(run.getKnightPassive()));
        knight.put("active", run.getKnightActive() == null ? null : run.getKnightActive().name());
        knight.put("activeSpec", run.getKnightActive() == null ? null : serializeSpec(run.getKnightActive()));
        if (run.getKnightUnit() != null) {
            knight.put("hp", run.getKnightUnit().getHp());
            knight.put("maxHp", run.getKnightUnit().getMaxHp());
            knight.put("artUrl", run.getKnightUnit().getArtUrl());
        }
        m.put("knight", knight);

        List<Map<String, Object>> party = new ArrayList<>();
        for (Combatant c : run.getParty()) {
            Map<String, Object> pm = serializeCombatant(c, false);
            // This member's cards in the shared deck — powers the detail modal.
            List<AbilitySpec> cards = new ArrayList<>();
            for (SiegeCard card : run.getDeckTemplates()) {
                if (card.getOwnerId().equals(c.getId())) cards.add(card.getSpec());
            }
            pm.put("cards", serializeSpecs(cards));
            pm.put("evolvesTo", content.evolutionOf(c.getSourceCardId())
                    .map(SieglingCard::getName).orElse(null));
            party.add(pm);
        }
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
        // Structured turn ledger: each action with the card behind it, by round.
        b.put("turnLog", new ArrayList<>(battle.getTurnLog()));

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
            // Evolution cards also require the owner's gauge (5 AP of own moves).
            boolean gaugeOk = spec.effect() != Effect.EVOLVE
                    || (owner != null && owner.getApSpent() >= SiegeBattle.EVOLVE_GAUGE);
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
            if (spec.effect() == Effect.EVOLVE && owner != null) {
                h.put("gauge", Math.min(owner.getApSpent(), SiegeBattle.EVOLVE_GAUGE));
                h.put("gaugeMax", SiegeBattle.EVOLVE_GAUGE);
            }
            h.put("playable", playerTurn && ownerAlive && ownerReady && affordable && gaugeOk);
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
        // Evolution gauge for player Siegelings (AP spent on own moves this battle).
        if (c.getSide() == Side.PLAYER && !c.isKnight()) {
            boolean hasEvolution = content.evolutionOf(c.getSourceCardId()).isPresent();
            m.put("hasEvolution", hasEvolution);
            if (hasEvolution) {
                m.put("evoGauge", Math.min(c.getApSpent(), SiegeBattle.EVOLVE_GAUGE));
                m.put("evoGaugeMax", SiegeBattle.EVOLVE_GAUGE);
                m.put("evoReady", c.getApSpent() >= SiegeBattle.EVOLVE_GAUGE);
            }
        }
        if (includeAbilities) {
            // Full ability specs so the detail popup can show what enemies do.
            m.put("abilities", serializeSpecs(c.getAbilities()));
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
