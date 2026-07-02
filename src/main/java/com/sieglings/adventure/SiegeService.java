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
        } else if (node.getType() == NodeType.REST) {
            openCamp(run);
        } else if (node.getType() == NodeType.TREASURE) {
            openCache(run);
        } else {
            node.setCleared(true);
        }
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
