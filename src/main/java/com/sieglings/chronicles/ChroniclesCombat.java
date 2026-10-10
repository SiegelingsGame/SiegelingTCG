package com.sieglings.chronicles;

import com.sieglings.chronicles.ChroniclesContent.Arcana;
import com.sieglings.chronicles.ChroniclesContent.CommandTrigger;
import com.sieglings.chronicles.ChroniclesContent.Signature;
import com.sieglings.chronicles.ChroniclesContent.SignatureKind;
import com.sieglings.chronicles.ChroniclesContent.Loot;
import com.sieglings.chronicles.ChroniclesContent.Mods;
import com.sieglings.chronicles.ChroniclesContent.Route;
import com.sieglings.chronicles.ChroniclesContent.RouteType;
import com.sieglings.chronicles.ChroniclesState.TimelineEvent;
import com.sieglings.model.enums.Element;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * Resolves a whole idle expedition up front from a seed. The service stores the
 * result and reveals timeline entries as their time passes, so the outcome is
 * fixed at launch and the same seed always replays the same story.
 */
final class ChroniclesCombat {

    private static final int MAX_ROUNDS = 30;
    private static final double REST_HEAL = 0.20;
    /** A Siegeling knocked out in a won battle gets back up dazed at this share of health. */
    private static final double DAZED_HP = 0.15;

    private ChroniclesCombat() {}

    /** A Siegeling ready for battle; stats already include level, bond, mastery and synergies. */
    static final class Unit {
        String id;
        String name;
        String speciesId;
        Element element;
        String cls;
        boolean ally;
        int level;
        double maxHp;
        double hp;
        double atk;
        double def;
        double spd;
        double crit;
        int bondLevel;
        boolean boss;
        String position = "";

        // per-battle state
        boolean guarding;
        int actions;
        int bondUses;
        double shield;
        boolean searingShield;
        boolean struckYet;
        boolean resolveActive;
        double defBreak;
        int defBreakRounds;
        double marked;
        boolean rose;
        boolean legend;

        boolean alive() { return hp > 0.0001; }
        double pct() { return maxHp <= 0 ? 0 : hp / maxHp; }

        Unit copy() {
            Unit u = new Unit();
            u.id = id; u.name = name; u.speciesId = speciesId; u.element = element; u.cls = cls; u.ally = ally;
            u.level = level; u.maxHp = maxHp; u.hp = hp; u.atk = atk; u.def = def; u.spd = spd; u.crit = crit;
            u.bondLevel = bondLevel; u.boss = boss; u.position = position; u.legend = legend;
            return u;
        }
    }

    /** Everything about the knight that matters on the road. */
    /**
     * Everything about the knight that matters on the road. The profession fields are
     * already-converted effects (fractions), so balance lives in ChroniclesContent.
     */
    record Knight(String weaponType, int weaponTier, int proficiency, int command, int armor,
                  boolean heatWard, String relicEffect, boolean searingIntercept, int foraging,
                  int cartography, double survivalCut, double lootBonus, double restBonus, double gaugeBonus,
                  double startGauge, java.util.Set<String> hazardWards) {
        Knight(String weaponType, int weaponTier, int proficiency, int command, int armor,
               boolean heatWard, String relicEffect, boolean searingIntercept, int foraging) {
            this(weaponType, weaponTier, proficiency, command, armor, heatWard, relicEffect, searingIntercept, foraging,
                    0, 0, 0, 0, 0, 0, java.util.Set.of());
        }

        boolean findsWay() {
            return foraging >= 10 || cartography >= ChroniclesContent.CARTOGRAPHY_NO_MAZE;
        }
    }

    record Input(Route route, List<Unit> party, Unit reserve, Knight knight, CommandTrigger trigger,
                 int retreatAt, int potionAt, Map<String, Integer> supplies, Mods fieldMods,
                 List<String> fieldNotes, long seed, EnemyFactory enemies, long durationMs,
                 Arcana arcana, Signature signature, java.util.Set<String> twists) {
        Input(Route route, List<Unit> party, Unit reserve, Knight knight, CommandTrigger trigger,
              int retreatAt, int potionAt, Map<String, Integer> supplies, Mods fieldMods,
              List<String> fieldNotes, long seed, EnemyFactory enemies) {
            this(route, party, reserve, knight, trigger, retreatAt, potionAt, supplies, fieldMods, fieldNotes, seed,
                    enemies, route.minutes() * 60_000L, Arcana.NONE, null, java.util.Set.of());
        }
    }

    interface EnemyFactory {
        /** A wild group for one encounter; {@code boss} asks for the route's boss alone. */
        List<Unit> group(Random random, boolean boss, boolean elite);
    }

    static final class Result {
        String outcome = "complete";
        long endMs;
        int encountersTotal;
        int encountersWon;
        final List<TimelineEvent> timeline = new ArrayList<>();
        final Map<String, Integer> loot = new LinkedHashMap<>();
        final Map<String, Integer> suppliesLeft = new LinkedHashMap<>();
        /** Battles each companion took part in and won. */
        final Map<String, Integer> battlesWon = new LinkedHashMap<>();
        final Map<String, Long> companionXp = new LinkedHashMap<>();
        final Map<String, Integer> elementBattles = new LinkedHashMap<>();
        final Map<String, Integer> classBattles = new LinkedHashMap<>();
        int commandsFired;
        int potionsUsed;
        int hazardsEndured;
        int exploreSteps;
        /** Sum of enemy levels in battles won (bosses count triple); pays crowns and operation score. */
        long levelsDefeated;
        final List<SightingRoll> sightings = new ArrayList<>();
        final Map<String, Double> finalHpPct = new LinkedHashMap<>();
    }

    record SightingRoll(long atMs, long seed) {}

    static Result simulate(Input in) {
        Random random = new Random(in.seed());
        Route route = in.route();
        Result result = new Result();
        long duration = in.durationMs();
        int encounters = route.encounters();
        boolean lost = "maze".equals(route.hazard()) && !in.knight().findsWay();
        if (lost) encounters += 1;
        result.encountersTotal = encounters;
        boolean hasBoss = route.bossId() != null;
        long step = duration / (encounters + 1L);
        Map<String, Integer> supplies = new LinkedHashMap<>(in.supplies());

        List<Unit> company = new ArrayList<>();
        for (Unit unit : in.party()) company.add(unit.copy());
        Unit reserve = in.reserve() == null ? null : in.reserve().copy();
        boolean reserveUsed = false;
        double gauge = Math.min(100, in.knight().startGauge());
        boolean signatureUsed = false;

        add(result, 0, "depart", "The company sets out for " + route.name() + ".", "info");
        for (String note : in.fieldNotes()) add(result, 0, "prep", note, "info");
        if (lost) {
            result.hazardsEndured++;
            add(result, step / 2, "hazard", "Without the woodcraft or a map to read the roots, the company loses its way.", "warn");
        }

        for (int i = 0; i < encounters; i++) {
            long at = step * (i + 1);
            long exploreAt = at - step / 2;
            explore(result, route, random, exploreAt, in.knight().lootBonus());

            if (route.hazard() != null && route.hazardPct() > 0) {
                double pct = route.hazardPct() * hazardFactor(in, company, supplies);
                result.hazardsEndured++;
                for (Unit unit : company) {
                    if (unit.alive()) unit.hp = Math.max(1, unit.hp - unit.maxHp * pct);
                }
                add(result, at - step / 4, "hazard", hazardLine(route.hazard()) + " ("
                        + Math.max(1, Math.round(pct * 100)) + "% health).", "warn");
            }

            boolean boss = hasBoss && i == encounters - 1;
            boolean elite = boss || (route.type() == RouteType.DUNGEON && i % 2 == 1) || (route.type() == RouteType.HUNT && i % 3 == 2);
            List<Unit> foes = in.enemies().group(random, boss, elite);
            boolean hasHarder = boss || elite;
            boolean signatureNow = in.signature() != null && !signatureUsed && (hasHarder || i == encounters - 1);
            if (signatureNow) signatureUsed = true;
            Battle battle = new Battle(in, company, foes, random, gauge, boss, elite, supplies, signatureNow);
            battle.fight();
            gauge = battle.gauge;
            result.commandsFired += battle.commandsFired;
            result.potionsUsed += battle.potionsUsed;

            String foeText = describeFoes(foes);
            if (battle.won) {
                result.encountersWon++;
                StringBuilder text = new StringBuilder(boss ? "Boss defeated: " : "Defeated ").append(foeText).append('.');
                if (!battle.highlights.isEmpty()) text.append(' ').append(String.join(" ", battle.highlights));
                add(result, at, boss ? "boss" : "battle", text.toString(), "good");
                double levelSum = 0;
                for (Unit foe : foes) {
                    levelSum += foe.level * (foe.boss ? 3 : 1);
                    if (random.nextDouble() < (foe.boss ? 1.0 : 0.5)) {
                        addLoot(result.loot, ChroniclesContent.essenceId(foe.element == null ? Element.EARTH : foe.element),
                                foe.boss ? 3 : 1);
                    }
                }
                if (boss) addLoot(result.loot, "ancient_relic", 1);
                result.levelsDefeated += Math.round(levelSum);
                for (Unit unit : battle.participants) {
                    result.battlesWon.merge(unit.id, 1, Integer::sum);
                    result.companionXp.merge(unit.id, Math.round(levelSum * 9), Long::sum);
                    result.elementBattles.merge(unit.element.name(), 1, Integer::sum);
                    result.classBattles.merge(unit.cls, 1, Integer::sum);
                }
                if (!boss && random.nextDouble() < route.sightingChance()) {
                    result.sightings.add(new SightingRoll(at, random.nextLong()));
                    add(result, at + step / 6, "sighting", "A wild Siegeling watches from the brush. Its trail is marked for taming.", "rare");
                }
            } else if (battle.fled) {
                add(result, at, "battle", "The " + foeText + " broke off and fled.", "info");
            }

            // A KO'd member's place is taken by the reserve once, if the knight has one.
            if (reserve != null && !reserveUsed) {
                for (int s = 0; s < company.size(); s++) {
                    if (!company.get(s).alive()) {
                        reserve.position = company.get(s).position;
                        add(result, at + step / 8, "reserve", reserve.name + " steps in for " + company.get(s).name + ".", "info");
                        company.set(s, reserve);
                        reserveUsed = true;
                        break;
                    }
                }
            }

            boolean anyAlive = company.stream().anyMatch(Unit::alive);
            if (!anyAlive || !battle.won && !battle.fled) {
                result.outcome = "defeat";
                result.endMs = at + step / 3;
                add(result, at, "defeat", "The company was overwhelmed by " + foeText + " and limps home.", "bad");
                halveLoot(result.loot);
                break;
            }

            double rest = REST_HEAL + in.fieldMods().postHeal() + in.knight().restBonus();
            for (Unit unit : company) {
                if (unit.alive()) unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * rest);
                else if (battle.won) unit.hp = unit.maxHp * DAZED_HP;
            }

            if (i < encounters - 1 && in.retreatAt() > 0) {
                double now = 0;
                double max = 0;
                for (Unit unit : company) { now += Math.max(0, unit.hp); max += unit.maxHp; }
                if (max > 0 && now / max * 100 < in.retreatAt()) {
                    result.outcome = "retreat";
                    result.endMs = at + step / 3;
                    add(result, at + step / 4, "retreat", "Following orders, the company retreats with what it has found.", "warn");
                    break;
                }
            }
        }

        if ("complete".equals(result.outcome)) {
            explore(result, route, random, duration - step / 2, in.knight().lootBonus());
            Route r = route;
            if (r.hiddenRoomReq() != null && (in.knight().foraging() >= r.hiddenRoomReq().level()
                    || in.knight().cartography() >= ChroniclesContent.CARTOGRAPHY_HIDDEN_ROOM)) {
                addLoot(result.loot, "ancient_relic", 1);
                addLoot(result.loot, "heartwood", 3);
                add(result, duration - step / 3, "discovery",
                        "Your woodcraft and maps reveal a hidden root cellar: an Ancient Relic and Heartwood.", "rare");
            }
            result.endMs = duration;
            add(result, duration, "return", "The company returns home.", "good");
        }

        for (Unit unit : company) result.finalHpPct.put(unit.id, unit.pct());
        if (reserve != null && !reserveUsed) result.finalHpPct.put(reserve.id, reserve.pct());
        result.suppliesLeft.putAll(supplies);
        result.suppliesLeft.values().removeIf(v -> v <= 0);
        return result;
    }

    private static String hazardLine(String hazard) {
        return switch (hazard) {
            case "heat" -> "Volcanic heat scorches the company";
            case "tide" -> "The tide batters the company";
            case "storm" -> "Lightning strikes the company";
            case "forge" -> "Slag heat sears the company";
            default -> "The land wears on the company";
        };
    }

    private static double hazardFactor(Input in, List<Unit> company, Map<String, Integer> supplies) {
        double factor = 1.0;
        String hazard = in.route().hazard();
        if (company.stream().anyMatch(u -> u.alive() && in.route().wards().contains(u.element))) factor *= 0.5;
        if ("heat".equals(hazard)) {
            if (in.knight().heatWard()) factor *= 0.5;
            if (supplies.getOrDefault("frostbloom_remedy", 0) > 0) factor *= 0.5;
        }
        if (in.knight().hazardWards().contains(hazard)) factor *= 0.5;
        factor *= 1 - Math.min(0.4, in.knight().armor() * 0.03);
        factor *= 1 - in.knight().survivalCut();
        return Math.max(0.05, factor);
    }

    private static void explore(Result result, Route route, Random random, long at, double lootBonus) {
        result.exploreSteps++;
        List<String> found = new ArrayList<>();
        for (Loot loot : route.loot()) {
            if (random.nextDouble() < loot.chance() * (1 + lootBonus)) {
                int qty = loot.min() + (loot.max() > loot.min() ? random.nextInt(loot.max() - loot.min() + 1) : 0);
                addLoot(result.loot, loot.item(), qty);
                ChroniclesContent.Item item = ChroniclesContent.ITEMS.get(loot.item());
                found.add(qty + " " + (item == null ? loot.item() : item.name()));
            }
        }
        if (!found.isEmpty()) add(result, at, "explore", "Gathered " + String.join(", ", found) + ".", "info");
    }

    private static void halveLoot(Map<String, Integer> loot) {
        loot.replaceAll((k, v) -> v / 2);
        loot.values().removeIf(v -> v <= 0);
    }

    private static void addLoot(Map<String, Integer> loot, String item, int qty) {
        if (qty > 0) loot.merge(item, qty, Integer::sum);
    }

    private static void add(Result result, long at, String kind, String text, String tone) {
        result.timeline.add(new TimelineEvent(at, kind, text, tone));
    }

    private static String describeFoes(List<Unit> foes) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Unit foe : foes) counts.merge(foe.name, 1, Integer::sum);
        List<String> parts = new ArrayList<>();
        counts.forEach((name, n) -> parts.add(n > 1 ? n + " wild " + name : "a wild " + name));
        return String.join(" and ", parts);
    }

    /** One battle. Party units are mutated in place so damage carries between battles. */
    private static final class Battle {
        final Input in;
        final List<Unit> party;
        final List<Unit> foes;
        final Random random;
        final boolean boss;
        final boolean elite;
        final Map<String, Integer> supplies;
        final Set<Unit> participants = new LinkedHashSet<>();
        final List<String> highlights = new ArrayList<>();
        double gauge;
        boolean won;
        boolean fled;
        int commandsFired;
        int potionsUsed;
        int round;
        int rallyRounds;
        double rallyBonus;
        int ampRounds;
        double ampBonus;
        boolean feint;
        double feintBonus;
        final Arcana arcana;
        final boolean signature;
        final java.util.Set<String> twists;
        boolean foesStunned;

        Battle(Input in, List<Unit> party, List<Unit> foes, Random random, double gauge, boolean boss,
               boolean elite, Map<String, Integer> supplies, boolean signature) {
            this.in = in;
            this.party = party;
            this.foes = foes;
            this.random = random;
            this.gauge = gauge;
            this.boss = boss;
            this.elite = elite;
            this.supplies = supplies;
            this.arcana = in.arcana() == null ? Arcana.NONE : in.arcana();
            this.signature = signature;
            this.twists = in.twists() == null ? java.util.Set.of() : in.twists();
            for (Unit unit : party) {
                unit.guarding = false; unit.actions = 0; unit.bondUses = 0; unit.shield = 0; unit.struckYet = false;
                unit.resolveActive = false; unit.defBreak = 0; unit.defBreakRounds = 0; unit.marked = 0;
                if (unit.alive()) participants.add(unit);
            }
            Mods field = in.fieldMods();
            for (Unit foe : foes) {
                if (twists.contains("plated")) foe.def *= 1.3;
                foe.def *= Math.max(0.3, 1 + field.enemyDef());
                foe.spd *= Math.max(0.3, 1 + field.enemySpd());
            }
        }

        void fight() {
            if (signature) unleashSignature();
            while (round < MAX_ROUNDS) {
                round++;
                usePotion();
                List<Unit> order = new ArrayList<>();
                for (Unit u : party) if (u.alive()) order.add(u);
                for (Unit u : foes) if (u.alive()) order.add(u);
                order.sort(Comparator.comparingDouble((Unit u) -> -u.spd).thenComparing(u -> u.ally ? 0 : 1));
                for (Unit actor : order) {
                    if (!actor.alive()) continue;
                    if (living(party).isEmpty() || living(foes).isEmpty()) break;
                    if (!actor.ally && (foesStunned && round == 1
                            || arcana.enemySkipChance() > 0 && random.nextDouble() < arcana.enemySkipChance())) {
                        continue;
                    }
                    if (actor.ally && twists.contains("mirage") && random.nextDouble() < 1.0 / 7) continue;
                    act(actor);
                }
                if (living(foes).isEmpty()) { won = true; return; }
                if (living(party).isEmpty()) return;
                endRound();
            }
            fled = true;
        }

        private void unleashSignature() {
            Signature sig = in.signature();
            if (sig.kind() == SignatureKind.BURST) {
                for (Unit foe : living(foes)) foe.hp = Math.max(1, foe.hp - foe.maxHp * 0.25);
            } else if (sig.kind() == SignatureKind.SANCTUARY) {
                for (Unit ally : living(party)) {
                    ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.40);
                    ally.shield += ally.maxHp * 0.15;
                }
            } else {
                foesStunned = true;
            }
            highlights.add("Ascendant power: " + sig.name() + "!");
        }

        private void endRound() {
            if (twists.contains("radiance")) {
                for (Unit foe : living(foes)) foe.hp = Math.min(foe.maxHp, foe.hp + foe.maxHp * 0.03);
            }
            if (twists.contains("blight")) {
                for (Unit ally : living(party)) ally.hp = Math.max(1, ally.hp - ally.maxHp * 0.03);
            }
            if (arcana.enemyDotPct() > 0) {
                for (Unit foe : living(foes)) foe.hp = Math.max(0, foe.hp - foe.maxHp * arcana.enemyDotPct());
            }
            if (arcana.roundHealPct() > 0) {
                Unit hurt = lowest(party);
                if (hurt != null) hurt.hp = Math.min(hurt.maxHp, hurt.hp + hurt.maxHp * arcana.roundHealPct());
            }
            if (rallyRounds > 0 && --rallyRounds == 0) rallyBonus = 0;
            if (ampRounds > 0 && --ampRounds == 0) ampBonus = 0;
            for (Unit foe : foes) {
                if (foe.defBreakRounds > 0 && --foe.defBreakRounds == 0) foe.defBreak = 0;
            }
            for (Unit unit : party) unit.guarding = unit.guarding && unit.alive();
            Knight k = in.knight();
            double fill = 18 + k.proficiency() / 3.0 + k.command() / 4.0 + k.gaugeBonus();
            if ("commandGauge".equals(k.relicEffect())) fill *= 1.2;
            gauge = Math.min(100, gauge + fill);
            tryCommand();
        }

        private void tryCommand() {
            if (gauge < 100) return;
            CommandTrigger trigger = in.trigger();
            boolean ready = switch (trigger) {
                case READY -> true;
                case ALLY_LOW -> party.stream().anyMatch(u -> u.alive() && u.pct() < 0.30);
                case ELITE -> elite || boss;
                case BOSS -> boss;
            };
            if (!ready) return;
            Knight k = in.knight();
            double f = 1 + 0.15 * k.weaponTier() + 0.005 * k.proficiency();
            String type = k.weaponType() == null ? "sword" : k.weaponType();
            switch (type) {
                case "spear" -> {
                    Unit target = lowest(party);
                    if (target == null) return;
                    target.shield += target.maxHp * 0.25 * f;
                    target.searingShield = k.searingIntercept();
                    highlights.add("Your Intercept shielded " + target.name + ".");
                }
                case "bow" -> {
                    Unit target = living(foes).stream().max(Comparator.comparingDouble(u -> u.maxHp)).orElse(null);
                    if (target == null) return;
                    target.marked = 0.35 * f;
                    highlights.add("You marked " + target.name + " as prey.");
                }
                case "staff" -> {
                    ampRounds = 3;
                    ampBonus = 0.30 * f;
                    highlights.add("Your staff amplified the company's elements.");
                }
                case "hammer" -> {
                    Unit target = living(foes).stream().max(Comparator.comparingDouble(u -> u.def)).orElse(null);
                    if (target == null) return;
                    target.defBreak = Math.min(0.7, 0.40 * f);
                    target.defBreakRounds = 3;
                    highlights.add("Your Sundering Blow cracked " + target.name + "'s guard.");
                }
                case "daggers" -> {
                    feint = true;
                    feintBonus = 0.5 * f;
                    highlights.add("Your Opening Feint set up a critical strike.");
                }
                default -> {
                    rallyRounds = 2;
                    rallyBonus = 0.20 * f;
                    highlights.add("Your Rally Strike lifted the company.");
                }
            }
            gauge = 0;
            commandsFired++;
        }

        private void usePotion() {
            if (in.potionAt() <= 0) return;
            Unit target = lowest(party);
            if (target == null || target.pct() * 100 >= in.potionAt()) return;
            for (String id : List.of("herb_tonic", "frostbloom_remedy")) {
                int left = supplies.getOrDefault(id, 0);
                if (left <= 0) continue;
                ChroniclesContent.Item item = ChroniclesContent.ITEMS.get(id);
                supplies.put(id, left - 1);
                target.hp = Math.min(target.maxHp, target.hp + target.maxHp * item.healPct());
                potionsUsed++;
                return;
            }
        }

        private void act(Unit actor) {
            actor.actions++;
            List<Unit> allies = actor.ally ? party : foes;
            List<Unit> enemies = actor.ally ? foes : party;
            actor.guarding = false;
            switch (actor.cls == null ? "" : actor.cls) {
                case "Guardian" -> {
                    boolean allyHurt = living(allies).stream().anyMatch(u -> u != actor && u.pct() < 0.5);
                    if (allyHurt) {
                        actor.guarding = true;
                        if (actor.ally && actor.bondLevel >= 50 && actor.bondUses < bondCap(actor)) {
                            Unit hurt = living(allies).stream().filter(u -> u != actor && u.pct() < 0.4)
                                    .min(Comparator.comparingDouble(Unit::pct)).orElse(null);
                            if (hurt != null) {
                                actor.bondUses++;
                                hurt.shield += actor.maxHp * 0.20;
                                Unit foe = pickTarget(actor, enemies);
                                if (foe != null) strike(actor, foe, 0.6, false);
                                highlights.add(actor.name + "'s " + bondTechnique(actor) + " protected " + hurt.name + ".");
                            }
                        }
                        return;
                    }
                    Unit target = pickTarget(actor, enemies);
                    if (target != null) strike(actor, target, 0.9, false);
                }
                case "Mage" -> {
                    if (actor.actions % 2 == 1) {
                        double power = 0.55;
                        if (actor.ally && actor.bondLevel >= 50 && actor.bondUses < bondCap(actor)) {
                            actor.bondUses++;
                            power *= 1.7;
                            highlights.add(actor.name + " unleashed " + bondTechnique(actor) + ".");
                        }
                        for (Unit target : new ArrayList<>(living(enemies))) strike(actor, target, power, true);
                    } else {
                        Unit target = pickTarget(actor, enemies);
                        if (target != null) strike(actor, target, 1.1, false);
                    }
                }
                case "Support" -> {
                    Unit hurt = living(allies).stream().min(Comparator.comparingDouble(Unit::pct)).orElse(null);
                    if (actor.ally && actor.bondLevel >= 50 && actor.bondUses < bondCap(actor)
                            && hurt != null && hurt.pct() < 0.45) {
                        actor.bondUses++;
                        hurt.hp = Math.min(hurt.maxHp, hurt.hp + hurt.maxHp * 0.40);
                        highlights.add(actor.name + "'s " + bondTechnique(actor) + " restored " + hurt.name + ".");
                        return;
                    }
                    if (hurt != null && hurt.pct() < 0.6) {
                        double heal = actor.atk * 1.0 + actor.maxHp * 0.12;
                        hurt.hp = Math.min(hurt.maxHp, hurt.hp + heal);
                        return;
                    }
                    Unit target = pickTarget(actor, enemies);
                    if (target != null) strike(actor, target, 0.7, false);
                }
                case "Assassin" -> {
                    Unit target = pickTarget(actor, enemies);
                    if (target != null) strike(actor, target, 1.0, false);
                }
                default -> {
                    Unit target = pickTarget(actor, enemies);
                    if (target != null) strike(actor, target, 1.0, false);
                }
            }
        }

        private Unit pickTarget(Unit actor, List<Unit> enemies) {
            List<Unit> alive = living(enemies);
            if (alive.isEmpty()) return null;
            if (!actor.ally) {
                for (Unit u : alive) if (u.guarding && "Guardian".equals(u.cls)) return u;
                double total = 0;
                double[] weights = new double[alive.size()];
                for (int i = 0; i < alive.size(); i++) {
                    weights[i] = switch (alive.get(i).position) {
                        case "FRONT" -> 60;
                        case "FLANK" -> 25;
                        default -> 15;
                    };
                    total += weights[i];
                }
                double roll = random.nextDouble() * total;
                for (int i = 0; i < alive.size(); i++) {
                    roll -= weights[i];
                    if (roll <= 0) return alive.get(i);
                }
                return alive.get(alive.size() - 1);
            }
            if (!"Support".equals(actor.cls)) {
                for (Unit u : alive) if (u.marked > 0) return u;
            }
            if ("Assassin".equals(actor.cls)) {
                return alive.stream().min(Comparator.comparingDouble(u -> u.hp)).orElse(alive.get(0));
            }
            return alive.get(random.nextInt(alive.size()));
        }

        private void strike(Unit attacker, Unit target, double power, boolean area) {
            double mult = power;
            boolean advantaged = ChroniclesContent.beats(attacker.element, target.element);
            if (attacker.ally && "Assassin".equals(attacker.cls)) mult *= 1 + arcana.assassinAtk();
            if (advantaged) mult *= 1.3 + (attacker.ally ? ampBonus : 0);
            else if (ChroniclesContent.beats(target.element, attacker.element)) mult *= 0.8;
            else if (attacker.ally && ampBonus > 0) mult *= 1.1;
            if (attacker.ally) {
                mult *= 1 + rallyBonus;
                if (round == 1) mult *= 1 + in.fieldMods().openingDmg();
            }
            mult *= 1 + target.marked;
            double crit = attacker.crit;
            boolean critHit;
            if (attacker.ally && !area && feint) {
                feint = false;
                critHit = true;
                mult *= 1 + feintBonus;
            } else if (attacker.ally && !area && "Assassin".equals(attacker.cls) && !attacker.struckYet
                    && attacker.bondLevel >= 50 && attacker.bondUses < bondCap(attacker)) {
                attacker.bondUses++;
                critHit = true;
                mult *= 1.4;
                highlights.add(attacker.name + " struck first with " + bondTechnique(attacker) + ".");
            } else {
                critHit = random.nextDouble() < crit;
            }
            attacker.struckYet = true;
            if (critHit) mult *= 1.6;
            double def = target.def * (1 - target.defBreak);
            if (target.guarding) def *= 1.33;
            // Guardians are built to stand in front; even unguarded they shrug off a share of each hit.
            if ("Guardian".equals(target.cls)) mult *= 0.85;
            if (target.resolveActive) def *= 1.35;
            double armorK = armorConstant(attacker);
            double damage = attacker.atk * mult * armorK / (armorK + def);
            damage *= 0.9 + random.nextDouble() * 0.2;
            if (target.ally && target.pct() < 0.25) damage *= 1 - in.fieldMods().lowHpGuard();
            if (target.ally) damage *= 1 - Math.min(0.6, arcana.allyDamageCut());
            if (target.ally && round == 1 && twists.contains("ambush")) damage *= 1.3;
            if (attacker.ally && advantaged && arcana.advantageShield() > 0) {
                attacker.shield = Math.min(attacker.maxHp * 0.3, attacker.shield + attacker.maxHp * arcana.advantageShield());
            }
            if (target.shield > 0) {
                double absorbed = Math.min(target.shield, damage);
                target.shield -= absorbed;
                damage -= absorbed;
                if (target.searingShield && absorbed > 0) attacker.hp = Math.max(0, attacker.hp - absorbed * 0.4);
            }
            target.hp = Math.max(0, target.hp - damage);
            if (!target.ally && !target.alive() && !target.rose && twists.contains("risen")) {
                target.rose = true;
                target.hp = target.maxHp * 0.3;
                if (!highlights.contains("The dead rose again.")) highlights.add("The dead rose again.");
            }
            if (target.alive() && "Bruiser".equals(target.cls)) {
                if (target.ally && target.bondLevel >= 50 && !target.resolveActive && target.pct() < 0.5
                        && target.bondUses < bondCap(target)) {
                    target.bondUses++;
                    target.resolveActive = true;
                    highlights.add(target.name + " hardened with " + bondTechnique(target) + ".");
                }
                double counter = target.resolveActive ? 0.5 : 0.2;
                if (!area && attacker.alive() && random.nextDouble() < counter) {
                    double k = armorConstant(target);
                    double back = target.atk * 0.5 * k / (k + attacker.def);
                    attacker.hp = Math.max(0, attacker.hp - back);
                }
            }
        }

        private static int bondCap(Unit unit) {
            return (unit.bondLevel >= 100 ? 2 : 1) + (unit.legend ? 1 : 0);
        }

        private static Unit lowest(List<Unit> units) {
            return living(units).stream().min(Comparator.comparingDouble(Unit::pct)).orElse(null);
        }
    }

    /**
     * Defense softens hits by K/(K+def). K grows with the attacker's level at the same
     * rate defense does, so a level-50 fight resolves in as many hits as a level-1 one
     * instead of stalling past the round limit.
     */
    static double armorConstant(Unit attacker) {
        return 50.0 * (1 + 0.08 * (Math.max(1, attacker.level) - 1));
    }

    static String bondTechnique(Unit unit) {
        ChroniclesContent.ClassPath path = ChroniclesContent.CLASS_PATHS.get(unit.cls);
        return ChroniclesContent.bondPrefix(unit.element) + " " + (path == null ? "Resolve" : path.bondNoun());
    }

    private static List<Unit> living(List<Unit> units) {
        List<Unit> out = new ArrayList<>();
        for (Unit u : units) if (u.alive()) out.add(u);
        return out;
    }
}
