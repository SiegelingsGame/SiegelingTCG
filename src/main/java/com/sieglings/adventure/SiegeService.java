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

    /** Enters the current map node: starts a battle or resolves a non-battle node. */
    Map<String, Object> enterNode(String token) {
        SiegeRun run = require(token);
        if (run.getStatus() != RunStatus.ACTIVE) return serialize(run);
        SiegeNode node = run.currentNode();
        if (node == null) return serialize(run);
        if (run.getBattle() != null && !run.getBattle().isOver()) return serialize(run); // battle already live

        if (node.isBattle()) {
            List<Element> palette = elementPaletteFor(run);
            List<Combatant> enemies = content.generateEnemies(node.getType(), node.getIndex(), rng, palette);
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
        advanceMap(run);
    }

    /** Applies battle outcome and advances the map; called by the client after a battle ends. */
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
            run.setBattle(null);
            if (wasBoss) {
                run.setStatus(RunStatus.WON);
                run.setLastReward("The Siegelord is defeated — the expedition is won!");
            } else {
                run.setLastReward("Victory! The party presses on.");
                advanceMap(run);
            }
        } else if (battle.getPhase() == BattlePhase.LOST) {
            run.setStatus(RunStatus.LOST);
            run.setBattle(null);
            run.setLastReward("The warband has fallen. The expedition ends here.");
        }
        return serialize(run);
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

    private void advanceMap(SiegeRun run) {
        if (run.getCurrentIndex() < run.getMap().size() - 1) {
            run.setCurrentIndex(run.getCurrentIndex() + 1);
        }
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
        m.put("currentIndex", run.getCurrentIndex());
        m.put("lastReward", run.getLastReward());

        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("name", run.getKnightName());
        knight.put("element", run.getKnightElement() == null ? null : run.getKnightElement().name());
        knight.put("passive", run.getKnightPassiveDesc());
        knight.put("active", run.getKnightActive() == null ? null : run.getKnightActive().name());
        m.put("knight", knight);

        List<Map<String, Object>> party = new ArrayList<>();
        for (Combatant c : run.getParty()) party.add(serializeCombatant(c, false));
        m.put("party", party);

        List<Map<String, Object>> map = new ArrayList<>();
        for (SiegeNode node : run.getMap()) {
            Map<String, Object> n = new LinkedHashMap<>();
            n.put("index", node.getIndex());
            n.put("type", node.getType().name());
            n.put("label", node.getLabel());
            n.put("cleared", node.isCleared());
            n.put("current", node.getIndex() == run.getCurrentIndex());
            map.add(n);
        }
        m.put("map", map);

        SiegeBattle battle = run.getBattle();
        m.put("battle", battle == null ? null : serializeBattle(run, battle));
        return m;
    }

    private Map<String, Object> serializeBattle(SiegeRun run, SiegeBattle battle) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("phase", battle.getPhase().name());
        b.put("turnNumber", battle.getTurnNumber());
        b.put("actionPoints", battle.getActionPoints());
        b.put("maxActionPoints", SiegeBattle.ACTIONS_PER_TURN);
        b.put("leadId", battle.getLeadId());
        b.put("nodeType", battle.getNodeType().name());
        b.put("deckCount", battle.getDeck().size());
        b.put("discardCount", battle.getDiscard().size());
        b.put("log", new ArrayList<>(battle.getLog()));

        List<Map<String, Object>> allies = new ArrayList<>();
        List<Map<String, Object>> foes = new ArrayList<>();
        // Initiative-order preview for the UI.
        for (Combatant c : battle.getCombatants()) {
            Map<String, Object> cm = serializeCombatant(c, c.getSide() == Side.ENEMY);
            if (c.getSide() == Side.PLAYER) allies.add(cm); else foes.add(cm);
        }
        b.put("allies", allies);
        b.put("enemies", foes);
        b.put("order", initiativeOrder(battle));

        List<Map<String, Object>> hand = new ArrayList<>();
        boolean playerTurn = battle.getPhase() == BattlePhase.PLAYER_INPUT;
        // The damage boost is party-wide, so every living Siegeling shares the
        // same bonus; surface it on damage cards so the boosted number is visible.
        int partyAttackBuff = battle.living(Side.PLAYER).stream().mapToInt(Combatant::getAttackBuff).max().orElse(0);
        for (SiegeCard card : battle.getHand()) {
            AbilitySpec spec = card.getSpec();
            Combatant owner = battle.findCombatant(card.getOwnerId());
            boolean ownerAlive = card.getOwnerId().startsWith(SiegeCombatEngine.KNIGHT_OWNER_PREFIX)
                    ? !battle.living(Side.PLAYER).isEmpty()
                    : owner != null && owner.isAlive();
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
            h.put("ownerId", card.getOwnerId());
            h.put("ownerName", card.getOwnerId().startsWith(SiegeCombatEngine.KNIGHT_OWNER_PREFIX)
                    ? run.getKnightName() : (owner == null ? "" : owner.getName()));
            h.put("needsTarget", spec.needsExplicitTarget());
            h.put("playable", playerTurn && ownerAlive && affordable);
            hand.add(h);
        }
        b.put("hand", hand);
        return b;
    }

    private List<String> initiativeOrder(SiegeBattle battle) {
        // Rough next-to-act ordering by how close each unit is to the threshold.
        List<Combatant> living = new ArrayList<>();
        for (Combatant c : battle.getCombatants()) if (c.isAlive()) living.add(c);
        living.sort((a, b) -> {
            double ra = (SiegeBattle.READY_THRESHOLD - a.getInitiative()) / Math.max(1, a.getSpeed());
            double rb = (SiegeBattle.READY_THRESHOLD - b.getInitiative()) / Math.max(1, b.getSpeed());
            return Double.compare(ra, rb);
        });
        List<String> order = new ArrayList<>();
        for (Combatant c : living) order.add(c.getId());
        return order;
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
        m.put("attackBuff", c.getAttackBuff());
        m.put("alive", c.isAlive());
        m.put("artUrl", c.getArtUrl());
        if (includeAbilities) {
            List<String> names = new ArrayList<>();
            for (AbilitySpec a : c.getAbilities()) names.add(a.name());
            m.put("abilities", names);
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
