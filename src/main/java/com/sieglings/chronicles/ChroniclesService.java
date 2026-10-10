package com.sieglings.chronicles;

import com.fasterxml.jackson.core.type.TypeReference;
import com.sieglings.chronicles.ChroniclesCombat.Unit;
import com.sieglings.chronicles.ChroniclesContent.Activity;
import com.sieglings.chronicles.ChroniclesContent.CommandTrigger;
import com.sieglings.chronicles.ChroniclesContent.CrossClass;
import com.sieglings.chronicles.ChroniclesContent.Item;
import com.sieglings.chronicles.ChroniclesContent.ItemKind;
import com.sieglings.chronicles.ChroniclesContent.Mods;
import com.sieglings.chronicles.ChroniclesContent.Recipe;
import com.sieglings.chronicles.ChroniclesContent.Req;
import com.sieglings.chronicles.ChroniclesContent.Route;
import com.sieglings.chronicles.ChroniclesContent.RouteType;
import com.sieglings.chronicles.ChroniclesContent.Skill;
import com.sieglings.chronicles.ChroniclesContent.Synergy;
import com.sieglings.chronicles.ChroniclesContent.Technique;
import com.sieglings.chronicles.ChroniclesState.ActivityRun;
import com.sieglings.chronicles.ChroniclesState.AwayReport;
import com.sieglings.chronicles.ChroniclesState.Companion;
import com.sieglings.chronicles.ChroniclesState.Expedition;
import com.sieglings.chronicles.ChroniclesState.Rewards;
import com.sieglings.chronicles.ChroniclesState.Sighting;
import com.sieglings.chronicles.ChroniclesState.TimelineEvent;
import com.sieglings.model.Card;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.CreatureRegistry;
import com.sieglings.service.CreatureRegistry.Creature;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/** Server-authoritative rules for Siegeknight Chronicles. */
@Service
public class ChroniclesService {

    public static class StaleStateException extends RuntimeException {
        public StaleStateException(String message) { super(message); }
    }

    private static final int MAX_SUPPLIES = 20;
    private static final int MAX_REQUEST_IDS = 30;
    private static final long ART_TTL_MS = 5 * 60_000L;
    private static final long AWAY_REPORT_MIN_MS = 5 * 60_000L;

    private final ChroniclesStore store;
    private final CardDefinitionService cards;
    private final Map<String, Object> locks = new ConcurrentHashMap<>();
    private final Map<String, String> behaviors;
    private Clock clock = Clock.systemUTC();
    private volatile Map<String, String> artCache = Map.of();
    private volatile long artCachedAt;

    /** {@code cards} only supplies portrait art; tests pass null. */
    @Autowired
    public ChroniclesService(ChroniclesStore store, CardDefinitionService cards) {
        this.store = store;
        this.cards = cards;
        this.behaviors = loadBehaviors();
    }

    void setClock(Clock clock) { this.clock = clock; }

    // ── Public operations ────────────────────────────────────────────────────

    public Map<String, Object> getSnapshot(AccountUser user) {
        synchronized (lock(user)) {
            long now = now();
            ChroniclesState state = store.findByUserId(user.getId()).orElse(null);
            if (state == null) return introSnapshot(user);
            List<String> events = new ArrayList<>();
            boolean changed = settle(state, now, events);
            if (changed) {
                state.version++;
                state.updatedAt = now;
                store.save(state);
            }
            return snapshot(state, now, events, null);
        }
    }

    public Map<String, Object> start(AccountUser user, String starterId, String knightName, String requestId) {
        synchronized (lock(user)) {
            long now = now();
            ChroniclesState existing = store.findByUserId(user.getId()).orElse(null);
            if (existing != null) return snapshot(existing, now, List.of(), null);
            String starter = normalize(starterId);
            if (!ChroniclesContent.STARTERS.contains(starter)) {
                throw new IllegalArgumentException("Choose one of the four starter Siegelings.");
            }
            Creature creature = creature(starter);
            ChroniclesState state = new ChroniclesState();
            state.userId = user.getId();
            state.knightName = cleanName(knightName, user.getDisplayName());
            state.seed = new Random(now ^ user.getId().hashCode()).nextLong();
            state.createdAt = now;
            state.updatedAt = now;
            Companion partner = newCompanion(state, creature, 1, "starter", now);
            state.party.add(partner.id);
            state.inventory.put("squires_sword", 1);
            state.inventory.put("travelers_coat", 1);
            state.inventory.put("herb_tonic", 3);
            state.inventory.put("wild_bait", 1);
            remember(state, requestId);
            state.version = 1;
            store.save(state);
            List<String> events = List.of("Sir " + state.knightName + " takes the oath. " + creature.name()
                    + " joins as your first companion.");
            return snapshot(state, now, events, null);
        }
    }

    public Map<String, Object> setActivity(AccountUser user, String kind, String id, String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState state = ctx.state;
            if (id == null || id.isBlank()) {
                if (state.activity != null) ctx.events.add("Your knight rests.");
                state.activity = null;
                return;
            }
            String label;
            if ("craft".equals(kind)) {
                Recipe recipe = ChroniclesContent.RECIPES.get(id);
                if (recipe == null || !recipe.repeatable()) throw new IllegalArgumentException("That recipe cannot be worked idly.");
                requireRecipe(state, recipe);
                if (maxCrafts(state, recipe) <= 0) throw new IllegalArgumentException("You lack the materials to start.");
                label = recipeLabel(recipe);
            } else {
                Activity activity = ChroniclesContent.ACTIVITIES.get(id);
                if (activity == null) throw new IllegalArgumentException("Unknown activity.");
                requireSkillUnlocked(state, activity.skillId());
                if (skillLevel(state, activity.skillId()) < activity.level()) {
                    throw new IllegalArgumentException(activity.name() + " needs "
                            + skillName(activity.skillId()) + " " + activity.level() + ".");
                }
                label = activity.name();
            }
            ActivityRun run = new ActivityRun();
            run.kind = "craft".equals(kind) ? "craft" : "gather";
            run.id = id;
            run.startedAt = ctx.now;
            run.lastTickAt = ctx.now;
            state.activity = run;
            ctx.events.add("Your knight begins: " + label + ".");
        });
    }

    public Map<String, Object> setHelper(AccountUser user, String companionId, String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState state = ctx.state;
            if (companionId == null || companionId.isBlank()) {
                state.helperId = "";
                return;
            }
            Companion companion = requireCompanion(state, companionId);
            if (onExpedition(state, companion.id)) {
                throw new IllegalArgumentException(displayName(companion) + " is away on an expedition.");
            }
            state.helperId = companion.id;
            ctx.events.add(displayName(companion) + " now helps your knight's work.");
        });
    }

    public Map<String, Object> setParty(AccountUser user, List<String> party, String reserveId,
                                        String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState state = ctx.state;
            if (state.expedition != null) throw new IllegalArgumentException("The company is still on an expedition.");
            int slots = ChroniclesContent.partySlots(skillLevel(state, "command"));
            List<String> clean = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                String id = party != null && i < party.size() && party.get(i) != null ? party.get(i).trim() : "";
                if (!id.isEmpty()) {
                    requireCompanion(state, id);
                    if (clean.contains(id)) throw new IllegalArgumentException("A Siegeling can only fill one slot.");
                }
                clean.add(id);
            }
            long filled = clean.stream().filter(s -> !s.isEmpty()).count();
            if (filled == 0) throw new IllegalArgumentException("Your company needs at least one Siegeling.");
            if (filled > slots) throw new IllegalArgumentException("Command " + commandForSlots(filled)
                    + " is needed to field " + filled + " Siegelings.");
            String reserve = reserveId == null ? "" : reserveId.trim();
            if (!reserve.isEmpty()) {
                if (skillLevel(state, "command") < ChroniclesContent.RESERVE_COMMAND_LEVEL) {
                    throw new IllegalArgumentException("A reserve needs Command " + ChroniclesContent.RESERVE_COMMAND_LEVEL + ".");
                }
                requireCompanion(state, reserve);
                if (clean.contains(reserve)) throw new IllegalArgumentException("The reserve cannot also hold a slot.");
            }
            while (clean.size() > 1 && clean.get(clean.size() - 1).isEmpty()) clean.remove(clean.size() - 1);
            state.party = clean;
            state.reserveId = reserve;
        });
    }

    public Map<String, Object> setTactics(AccountUser user, Integer retreatAt, Integer potionAt, String trigger,
                                          String techniqueId, String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState.Tactics tactics = ctx.state.tactics;
            if (retreatAt != null) tactics.retreatAt = clamp(retreatAt, 0, 60);
            if (potionAt != null) tactics.potionAt = clamp(potionAt, 0, 80);
            if (trigger != null) {
                if (trigger.isBlank()) tactics.trigger = null;
                else {
                    try { tactics.trigger = CommandTrigger.valueOf(trigger.trim().toUpperCase(Locale.ROOT)).name(); }
                    catch (IllegalArgumentException ex) { throw new IllegalArgumentException("Unknown command trigger."); }
                }
            }
            if (techniqueId != null) {
                if (techniqueId.isBlank()) tactics.techniqueId = "";
                else {
                    Technique technique = ChroniclesContent.TECHNIQUES.get(techniqueId.trim());
                    if (technique == null) throw new IllegalArgumentException("Unknown technique.");
                    if (affinityLevel(ctx.state, technique.element()) < 10) {
                        throw new IllegalArgumentException(technique.name() + " needs "
                                + ChroniclesContent.elementLabel(technique.element()) + " Affinity 10.");
                    }
                    tactics.techniqueId = technique.id();
                }
            }
        });
    }

    public Map<String, Object> craft(AccountUser user, String recipeId, int quantity, String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState state = ctx.state;
            Recipe recipe = ChroniclesContent.RECIPES.get(recipeId == null ? "" : recipeId.trim());
            if (recipe == null) throw new IllegalArgumentException("Unknown recipe.");
            requireRecipe(state, recipe);
            int qty = recipe.repeatable() ? clamp(quantity <= 0 ? 1 : quantity, 1, 50) : 1;
            if (!recipe.repeatable() && state.inventory.getOrDefault(recipe.output(), 0) > 0) {
                throw new IllegalArgumentException("You already own a " + itemName(recipe.output()) + ".");
            }
            if (maxCrafts(state, recipe) < qty) throw new IllegalArgumentException("Not enough materials.");
            recipe.inputs().forEach((item, n) -> take(state, item, n * qty));
            applyRecipeOutput(state, recipe, qty, ctx.events);
            grantSkill(state, recipe.skillId(), (long) recipe.xp() * qty, ctx.events);
            ctx.events.add((recipe.isStudy() ? "Studied " : "Crafted ") + (qty > 1 ? qty + "× " : "") + recipeLabel(recipe) + ".");
        });
    }

    public Map<String, Object> equip(AccountUser user, String itemId, String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState state = ctx.state;
            String id = itemId == null ? "" : itemId.trim();
            Item item = ChroniclesContent.ITEMS.get(id);
            if (item == null || state.inventory.getOrDefault(id, 0) <= 0) throw new IllegalArgumentException("You don't own that.");
            if (state.expedition != null) throw new IllegalArgumentException("Change gear once the company is home.");
            switch (item.kind()) {
                case WEAPON -> state.weaponId = id;
                case ARMOR -> state.armorId = id;
                case RELIC -> state.relicId = id.equals(state.relicId) ? "" : id;
                default -> throw new IllegalArgumentException("That can't be equipped.");
            }
            ctx.events.add(item.kind() == ItemKind.RELIC && state.relicId.isEmpty()
                    ? "Unequipped " + item.name() + "." : "Equipped " + item.name() + ".");
        });
    }

    public Map<String, Object> launch(AccountUser user, String routeId, Map<String, Integer> supplies,
                                      String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState state = ctx.state;
            if (state.expedition != null) throw new IllegalArgumentException("The company is already on an expedition.");
            Route route = ChroniclesContent.ROUTES.get(routeId == null ? "" : routeId.trim());
            if (route == null) throw new IllegalArgumentException("Unknown destination.");
            if (rank(state) < route.rankReq()) {
                throw new IllegalArgumentException(route.name() + " opens at Siegeknight Rank " + route.rankReq() + ".");
            }
            List<Companion> members = new ArrayList<>();
            for (String id : state.party) if (!id.isEmpty()) members.add(requireCompanion(state, id));
            if (members.isEmpty()) throw new IllegalArgumentException("Assign at least one Siegeling to the company.");
            Map<String, Integer> packed = new LinkedHashMap<>();
            int total = 0;
            if (supplies != null) {
                for (Map.Entry<String, Integer> entry : supplies.entrySet()) {
                    Item item = ChroniclesContent.ITEMS.get(entry.getKey());
                    int n = entry.getValue() == null ? 0 : entry.getValue();
                    if (item == null || n <= 0) continue;
                    if (item.kind() == ItemKind.RUNE) {
                        if (packed.keySet().stream().anyMatch(k -> ChroniclesContent.RUNE_EFFECTS.containsKey(k)) || n > 1) {
                            throw new IllegalArgumentException("A company can carry one rune.");
                        }
                    } else if (item.kind() != ItemKind.POTION) {
                        continue;
                    }
                    if (state.inventory.getOrDefault(item.id(), 0) < n) {
                        throw new IllegalArgumentException("You only have " + state.inventory.getOrDefault(item.id(), 0)
                                + " " + item.name() + ".");
                    }
                    packed.put(item.id(), n);
                    if (item.kind() == ItemKind.POTION) total += n;
                }
            }
            if (total > MAX_SUPPLIES) throw new IllegalArgumentException("A company can carry " + MAX_SUPPLIES + " potions.");
            packed.forEach((id, n) -> take(state, id, n));
            Companion reserve = state.reserveId.isEmpty() ? null : findCompanion(state, state.reserveId);
            if (reserve != null && skillLevel(state, "command") < ChroniclesContent.RESERVE_COMMAND_LEVEL) reserve = null;

            if (!state.helperId.isEmpty() && (members.stream().anyMatch(c -> c.id.equals(state.helperId))
                    || (reserve != null && reserve.id.equals(state.helperId)))) {
                ctx.events.add(displayName(findCompanion(state, state.helperId)) + " sets down the work to join the company.");
                state.helperId = "";
            }

            long seed = state.seed ^ (31L * (state.expeditionsCompleted + 1) + ctx.now);
            ChroniclesCombat.Input input = buildInput(state, route, members, reserve, packed, seed);
            ChroniclesCombat.Result result = ChroniclesCombat.simulate(input);

            Expedition expedition = new Expedition();
            expedition.routeId = route.id();
            expedition.startedAt = ctx.now;
            expedition.plannedEndAt = ctx.now + input.durationMs();
            expedition.completesAt = ctx.now + result.endMs;
            expedition.outcome = result.outcome;
            for (Companion c : members) expedition.partyIds.add(c.id);
            expedition.reserveId = reserve == null ? "" : reserve.id;
            expedition.techniqueId = state.tactics.techniqueId == null ? "" : state.tactics.techniqueId;
            expedition.trigger = input.trigger().name();
            expedition.supplies = packed;
            expedition.suppliesLeft = new LinkedHashMap<>(result.suppliesLeft);
            // A rune is spent by being carried; only unused potions come home.
            expedition.suppliesLeft.keySet().removeIf(ChroniclesContent.RUNE_EFFECTS::containsKey);
            expedition.timeline = new ArrayList<>(result.timeline);
            expedition.encountersWon = result.encountersWon;
            expedition.encountersTotal = result.encountersTotal;
            expedition.rewards = rewardsFor(state, route, result, members, reserve);
            state.expedition = expedition;
            ctx.events.add("The company departs for " + route.name() + ".");
        });
    }

    public Map<String, Object> collect(AccountUser user, String requestId, long expected) {
        Map<String, Object> report = new LinkedHashMap<>();
        Map<String, Object> out = mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState state = ctx.state;
            Expedition expedition = state.expedition;
            if (expedition == null) throw new IllegalArgumentException("No expedition to collect.");
            if (ctx.now < expedition.completesAt) throw new IllegalArgumentException("The company is still on the road.");
            Route route = ChroniclesContent.ROUTES.get(expedition.routeId);
            Rewards rewards = expedition.rewards;
            rewards.items.forEach((id, n) -> give(state, id, n));
            expedition.suppliesLeft.forEach((id, n) -> give(state, id, n));
            for (Map.Entry<String, Long> entry : rewards.companionXp.entrySet()) {
                Companion c = findCompanion(state, entry.getKey());
                if (c != null) grantCompanionXp(c, entry.getValue(), ctx.events);
            }
            for (Map.Entry<String, Long> entry : rewards.bond.entrySet()) {
                Companion c = findCompanion(state, entry.getKey());
                if (c != null) grantBond(state, c, entry.getValue(), ctx.events);
            }
            for (String id : expedition.partyIds) {
                Companion c = findCompanion(state, id);
                if (c != null) {
                    c.expeditions++;
                    c.battlesWon += rewards.battles.getOrDefault(id, 0);
                }
            }
            rewards.affinityXp.forEach((el, xp) -> grantAffinity(state, Element.valueOf(el), xp, ctx.events));
            rewards.masteryXp.forEach((cls, xp) -> grantMastery(state, cls, xp, ctx.events));
            rewards.weaponXp.forEach((w, xp) -> grantWeapon(state, w, xp, ctx.events));
            rewards.skillXp.forEach((s, xp) -> grantSkill(state, s, xp, ctx.events));
            grantRank(state, rewards.rankXp, ctx.events);
            for (Sighting sighting : rewards.sightings) {
                sighting.id = "s" + (++state.sightingCounter);
                sighting.foundAt = ctx.now;
                sighting.expiresAt = ctx.now + ChroniclesContent.TAMING_EXPIRY_MS;
                state.sightings.add(sighting);
                Creature c = creature(sighting.speciesId);
                ctx.events.add("A wild " + c.name() + " was spotted. Try taming it before its trail goes cold.");
            }
            while (state.sightings.size() > ChroniclesContent.MAX_PENDING_TAMINGS) state.sightings.remove(0);
            if ("complete".equals(expedition.outcome)) state.expeditionsCompleted++;
            report.putAll(reportFor(state, expedition, route));
            state.expedition = null;
        });
        out.put("report", report);
        return out;
    }

    public Map<String, Object> tame(AccountUser user, String sightingId, String strategy, String lureId,
                                    String requestId, long expected) {
        Map<String, Object> outcome = new LinkedHashMap<>();
        Map<String, Object> out = mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState state = ctx.state;
            Sighting sighting = state.sightings.stream().filter(s -> s.id.equals(sightingId)).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("That trail has gone cold."));
            String plan = strategy == null ? "" : strategy.trim().toLowerCase(Locale.ROOT);
            if ("leave".equals(plan)) {
                state.sightings.remove(sighting);
                outcome.put("result", "left");
                return;
            }
            if (state.companions.size() >= ChroniclesContent.ROSTER_CAP) {
                throw new IllegalArgumentException("Your sanctuary holds " + ChroniclesContent.ROSTER_CAP + " Siegelings.");
            }
            Creature creature = creature(sighting.speciesId);
            double chance = tameChance(state, sighting, plan, lureId);
            if ("lure".equals(plan)) take(state, lureId, 1);
            Random roll = new Random(sighting.seed ^ 0x5eed);
            boolean success = roll.nextDouble() < chance;
            state.sightings.remove(sighting);
            int tier = rarityTier(creature.rarity());
            if (success) {
                Companion companion = newCompanion(state, creature, sighting.level, "tamed", ctx.now);
                state.tamedCount++;
                grantSkill(state, "taming", 40L + 30L * tier, ctx.events);
                grantAffinity(state, creature.element(), 20, ctx.events);
                ctx.events.add(creature.name() + " joins your company!");
                outcome.put("companionId", companion.id);
            } else {
                grantSkill(state, "taming", 15, ctx.events);
                ctx.events.add("The wild " + creature.name() + " slipped away.");
            }
            outcome.put("result", success ? "tamed" : "fled");
            outcome.put("chance", Math.round(chance * 100));
        });
        out.put("taming", outcome);
        return out;
    }

    public Map<String, Object> feed(AccountUser user, String companionId, String foodId, String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState state = ctx.state;
            Companion companion = requireCompanion(state, companionId);
            if (onExpedition(state, companion.id)) throw new IllegalArgumentException(displayName(companion) + " is away.");
            Item food = ChroniclesContent.ITEMS.get(foodId == null ? "" : foodId.trim());
            if (food == null || food.kind() != ItemKind.FOOD) throw new IllegalArgumentException("That isn't food.");
            if (state.inventory.getOrDefault(food.id(), 0) <= 0) throw new IllegalArgumentException("You have no " + food.name() + ".");
            String day = Instant.ofEpochMilli(ctx.now).atZone(ZoneOffset.UTC).toLocalDate().toString();
            if (!day.equals(companion.treatsDay)) {
                companion.treatsDay = day;
                companion.treatsToday = 0;
            }
            if (companion.treatsToday >= ChroniclesContent.treatCap(profLevel(state, "husbandry"))) {
                throw new IllegalArgumentException(displayName(companion) + " is full for today.");
            }
            take(state, food.id(), 1);
            companion.treatsToday++;
            Creature creature = creature(companion.speciesId);
            boolean loves = food.prefers().contains(creature.element());
            long bond = food.bondXp() * (loves ? 2L : 1L);
            ctx.events.add(displayName(companion) + (loves ? " loves the " : " enjoys the ") + food.name() + ". +" + bond + " bond.");
            grantBond(state, companion, bond, ctx.events);
            grantSkill(state, "husbandry", Math.max(1, food.bondXp() / 4), ctx.events);
        });
    }

    public Map<String, Object> evolve(AccountUser user, String companionId, String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> {
            ChroniclesState state = ctx.state;
            Companion companion = requireCompanion(state, companionId);
            if (onExpedition(state, companion.id)) throw new IllegalArgumentException(displayName(companion) + " is away.");
            Creature from = creature(companion.speciesId);
            if (from.evolvesToId() == null) throw new IllegalArgumentException(from.name() + " has no further evolution.");
            Creature to = CreatureRegistry.find(from.evolvesToId())
                    .orElseThrow(() -> new IllegalArgumentException("That evolution is not available yet."));
            int cap = ChroniclesContent.levelCap(from.stage(), true);
            if (companion.level < cap) throw new IllegalArgumentException(displayName(companion) + " must reach level " + cap + ".");
            evolutionCost(from).forEach((item, n) -> {
                if (state.inventory.getOrDefault(item, 0) < n) {
                    throw new IllegalArgumentException("Evolving needs " + n + " " + itemName(item) + ".");
                }
            });
            evolutionCost(from).forEach((item, n) -> take(state, item, n));
            boolean renamed = companion.nickname.equals(from.name());
            companion.speciesId = to.id();
            if (renamed) companion.nickname = to.name();
            String classNote = from.creatureClass().equals(to.creatureClass()) ? ""
                    : " It now fights as a " + to.creatureClass() + ".";
            ctx.events.add(from.name() + " evolved into " + to.name() + "!" + classNote);
        });
    }

    public Map<String, Object> rename(AccountUser user, String companionId, String nickname, String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> {
            Companion companion = requireCompanion(ctx.state, companionId);
            String clean = nickname == null ? "" : nickname.replaceAll("[^\\p{L}\\p{N} '\\-]", "").trim();
            if (clean.length() > 18) clean = clean.substring(0, 18).trim();
            companion.nickname = clean.isEmpty() ? creature(companion.speciesId).name() : clean;
        });
    }

    public Map<String, Object> acknowledgeAway(AccountUser user, String requestId, long expected) {
        return mutate(user, requestId, expected, (ctx) -> ctx.state.away = null);
    }

    // ── Mutation plumbing ────────────────────────────────────────────────────

    private static final class Ctx {
        ChroniclesState state;
        long now;
        final List<String> events = new ArrayList<>();
    }

    private Map<String, Object> mutate(AccountUser user, String requestId, long expectedVersion, Consumer<Ctx> op) {
        synchronized (lock(user)) {
            Ctx ctx = new Ctx();
            ctx.now = now();
            ctx.state = store.findByUserId(user.getId())
                    .orElseThrow(() -> new IllegalArgumentException("Begin your chronicle first."));
            if (requestId != null && !requestId.isBlank() && ctx.state.processedRequestIds.contains(requestId)) {
                return snapshot(ctx.state, ctx.now, List.of(), null);
            }
            if (expectedVersion >= 0 && expectedVersion != ctx.state.version) {
                throw new StaleStateException("Your chronicle changed on another device. Refreshing.");
            }
            settle(ctx.state, ctx.now, ctx.events);
            op.accept(ctx);
            remember(ctx.state, requestId);
            ctx.state.version++;
            ctx.state.updatedAt = ctx.now;
            store.save(ctx.state);
            return snapshot(ctx.state, ctx.now, ctx.events, null);
        }
    }

    private Object lock(AccountUser user) {
        return locks.computeIfAbsent(user.getId(), k -> new Object());
    }

    private long now() { return clock.millis(); }

    private static void remember(ChroniclesState state, String requestId) {
        if (requestId == null || requestId.isBlank()) return;
        state.processedRequestIds.add(requestId);
        while (state.processedRequestIds.size() > MAX_REQUEST_IDS) state.processedRequestIds.remove(0);
    }

    // ── Idle settlement ──────────────────────────────────────────────────────

    /** Advances the knight's activity and expires stale sightings. Returns true when anything moved. */
    boolean settle(ChroniclesState state, long now, List<String> events) {
        boolean changed = false;
        int before = state.sightings.size();
        state.sightings.removeIf(s -> s.expiresAt <= now);
        if (state.sightings.size() != before) changed = true;
        ActivityRun run = state.activity;
        if (run == null || now <= run.lastTickAt) return changed;
        long elapsed = now - run.lastTickAt;
        boolean capped = elapsed > ChroniclesContent.OFFLINE_CAP_MS;
        if (capped) elapsed = ChroniclesContent.OFFLINE_CAP_MS;
        long actionMs = actionMs(state, run);
        long pool = run.remainderMs + elapsed;
        long actions = pool / actionMs;
        long remainder = pool % actionMs;
        String stopped = "";
        Map<String, Integer> made = new LinkedHashMap<>();
        Map<String, Integer> used = new LinkedHashMap<>();
        String skillId;
        long xpEach;
        String name;
        if ("craft".equals(run.kind)) {
            Recipe recipe = ChroniclesContent.RECIPES.get(run.id);
            if (recipe == null) { state.activity = null; return true; }
            long max = maxCrafts(state, recipe);
            if (actions >= max) {
                actions = max;
                remainder = 0;
                stopped = "Ran out of materials for " + recipeLabel(recipe) + ".";
            }
            for (Map.Entry<String, Integer> input : recipe.inputs().entrySet()) {
                int n = (int) (input.getValue() * actions);
                if (n > 0) { take(state, input.getKey(), n); used.put(input.getKey(), n); }
            }
            if (actions > 0) {
                applyRecipeOutput(state, recipe, (int) actions, events);
                if (!recipe.isStudy()) made.put(recipe.output(), (int) actions);
            }
            skillId = recipe.skillId();
            xpEach = recipe.xp();
            name = recipeLabel(recipe);
        } else {
            Activity activity = ChroniclesContent.ACTIVITIES.get(run.id);
            if (activity == null) { state.activity = null; return true; }
            if (actions > 0) { give(state, activity.output(), (int) actions); made.put(activity.output(), (int) actions); }
            if (activity.bonusOutput() != null && activity.bonusEvery() > 0) {
                long bonus = (run.actions + actions) / activity.bonusEvery() - run.actions / activity.bonusEvery();
                if (bonus > 0) { give(state, activity.bonusOutput(), (int) bonus); made.put(activity.bonusOutput(), (int) bonus); }
            }
            skillId = activity.skillId();
            xpEach = activity.xp();
            name = activity.name();
        }
        if (actions > 0) {
            grantSkill(state, skillId, xpEach * actions, events);
            Companion helper = state.helperId.isEmpty() ? null : findCompanion(state, state.helperId);
            if (helper != null && !onExpedition(state, helper.id)) {
                long bond = (run.actions + actions) / 2 - run.actions / 2;
                if (bond > 0) grantBond(state, helper, bond, events);
                long aff = (run.actions + actions) / 4 - run.actions / 4;
                if (aff > 0) grantAffinity(state, creature(helper.speciesId).element(), aff, events);
            }
        }
        run.actions += actions;
        run.lastTickAt = now;
        run.remainderMs = capped ? 0 : remainder;
        if (!stopped.isEmpty()) {
            state.activity = null;
            events.add(stopped);
        }
        long span = elapsed;
        // Only a real absence opens a report; the settles of an active session would
        // otherwise pop "while you were away" every few seconds.
        boolean report = state.away != null || span >= AWAY_REPORT_MIN_MS || !stopped.isEmpty();
        if (report && (actions > 0 || capped || !stopped.isEmpty())) {
            if (state.away == null) {
                state.away = new AwayReport();
                state.away.fromAt = now - span;
            }
            AwayReport away = state.away;
            away.toAt = now;
            away.activityName = name;
            away.actions += actions;
            away.capped = away.capped || capped;
            if (!stopped.isEmpty()) away.stoppedReason = stopped;
            made.forEach((k, v) -> away.items.merge(k, v, Integer::sum));
            used.forEach((k, v) -> away.consumed.merge(k, v, Integer::sum));
            if (actions > 0) away.skillXp.merge(skillId, xpEach * actions, Long::sum);
        }
        return true;
    }

    long actionMs(ChroniclesState state, ActivityRun run) {
        int seconds;
        java.util.Set<Element> helpers;
        if ("craft".equals(run.kind)) {
            Recipe recipe = ChroniclesContent.RECIPES.get(run.id);
            seconds = recipe == null ? 10 : recipe.actionSeconds();
            helpers = recipe == null ? java.util.Set.of() : recipe.helperElements();
        } else {
            Activity activity = ChroniclesContent.ACTIVITIES.get(run.id);
            seconds = activity == null ? 10 : activity.actionSeconds();
            helpers = activity == null ? java.util.Set.of() : activity.helperElements();
        }
        double factor = 1.0;
        Companion helper = state.helperId.isEmpty() ? null : findCompanion(state, state.helperId);
        if (helper != null && !onExpedition(state, helper.id)) {
            Creature c = creature(helper.speciesId);
            factor = helpers.contains(c.element()) ? 0.75 : 0.92;
        }
        return Math.max(1000L, Math.round(seconds * 1000L * factor));
    }

    // ── Expedition assembly ──────────────────────────────────────────────────

    ChroniclesCombat.Input buildInput(ChroniclesState state, Route route, List<Companion> members, Companion reserve,
                                      Map<String, Integer> packed, long seed) {
        List<String> notes = new ArrayList<>();
        Map<String, Integer> elementCounts = new LinkedHashMap<>();
        Map<String, Integer> classCounts = new LinkedHashMap<>();
        for (Companion c : members) {
            Creature cr = creature(c.speciesId);
            elementCounts.merge(cr.element().name(), 1, Integer::sum);
            classCounts.merge(cr.creatureClass(), 1, Integer::sum);
        }
        List<Synergy> synergies = activeSynergies(elementCounts, classCounts);
        for (Synergy s : synergies) notes.add("Synergy: " + s.label() + ".");

        Technique technique = state.tactics.techniqueId == null || state.tactics.techniqueId.isEmpty()
                ? null : ChroniclesContent.TECHNIQUES.get(state.tactics.techniqueId);
        if (technique != null && affinityLevel(state, technique.element()) < 10) technique = null;
        if (technique != null && !elementCounts.containsKey(technique.element().name())) {
            notes.add("No " + ChroniclesContent.elementLabel(technique.element()) + " Siegeling to channel "
                    + technique.name() + ".");
            technique = null;
        } else if (technique != null) {
            notes.add("Prepared technique: " + technique.name() + ".");
        }
        List<CrossClass> crossClass = activeCrossClass(state, classCounts);
        for (CrossClass cc : crossClass) notes.add("Cross-class technique: " + cc.name() + ".");
        String runeId = packed.keySet().stream().filter(ChroniclesContent.RUNE_EFFECTS::containsKey).findFirst().orElse("");
        if (!runeId.isEmpty()) notes.add("The " + itemName(runeId) + " glows on your standard.");

        // Stat bonuses are folded into each unit; the battle-level effects (enemy debuffs,
        // post-battle healing, opening strike, low-health guard) ride on the field mods.
        Mods crossStats = Mods.NONE;
        for (CrossClass cc : crossClass) crossStats = sum(crossStats, cc.mods());
        Mods field = new Mods(0, 0, 0, 0, 0, crossStats.enemyDef(), crossStats.enemySpd(), crossStats.postHeal(),
                crossStats.openingDmg(), crossStats.lowHpGuard());
        if (technique != null) {
            Mods m = technique.mods();
            field = sum(field, new Mods(0, 0, 0, 0, 0, m.enemyDef(), m.enemySpd(), m.postHeal(), m.openingDmg(), m.lowHpGuard()));
        }

        String[] positions = {"FRONT", "FLANK", "REAR"};
        List<Unit> party = new ArrayList<>();
        int slot = 0;
        for (String id : state.party) {
            if (slot >= 3) break;
            String position = positions[slot++];
            if (id.isEmpty()) continue;
            Companion c = findCompanion(state, id);
            if (c == null) continue;
            Unit unit = companionUnit(state, c, synergies, technique, crossStats, runeId);
            unit.position = position;
            party.add(unit);
        }
        Unit reserveUnit = reserve == null ? null : companionUnit(state, reserve, synergies, technique, crossStats, runeId);

        Item weapon = ChroniclesContent.ITEMS.getOrDefault(state.weaponId, ChroniclesContent.ITEMS.get("squires_sword"));
        Item armor = ChroniclesContent.ITEMS.getOrDefault(state.armorId, ChroniclesContent.ITEMS.get("travelers_coat"));
        Item relic = state.relicId.isEmpty() ? null : ChroniclesContent.ITEMS.get(state.relicId);
        ChroniclesCombat.Knight knight = new ChroniclesCombat.Knight(weapon.weaponType(), weapon.tier(),
                weaponLevel(state, weapon.weaponType()), skillLevel(state, "command"), armor.armor(),
                armor.heatWard() || (relic != null && relic.heatWard()), relic == null ? "" : relic.relicEffect(),
                "embersteel_lance".equals(weapon.id()), skillLevel(state, "foraging"),
                profLevel(state, "cartography"),
                ChroniclesContent.survivalCut(profLevel(state, "survival")),
                ChroniclesContent.cartographyLoot(profLevel(state, "cartography")),
                ChroniclesContent.husbandryRest(profLevel(state, "husbandry")),
                ChroniclesContent.tacticsGauge(profLevel(state, "class_tactics")));
        CommandTrigger trigger = triggerFor(state, weapon.weaponType());
        long duration = Math.round(route.minutes() * 60_000L
                * (1 - ChroniclesContent.pathfindingCut(profLevel(state, "pathfinding"))));

        Map<String, Integer> potions = new LinkedHashMap<>(packed);
        potions.keySet().removeIf(ChroniclesContent.RUNE_EFFECTS::containsKey);
        ChroniclesCombat.EnemyFactory enemies = (random, boss, elite) -> enemyGroup(route, random, boss, elite);
        return new ChroniclesCombat.Input(route, party, reserveUnit, knight, trigger, state.tactics.retreatAt,
                state.tactics.potionAt, potions, field, notes, seed, enemies, duration);
    }

    private CommandTrigger triggerFor(ChroniclesState state, String weaponType) {
        if (state.tactics.trigger != null) {
            try { return CommandTrigger.valueOf(state.tactics.trigger); } catch (IllegalArgumentException ignored) { }
        }
        ChroniclesContent.Weapon weapon = ChroniclesContent.WEAPONS.get(weaponType);
        return weapon == null ? CommandTrigger.READY : weapon.defaultTrigger();
    }

    private List<Unit> enemyGroup(Route route, Random random, boolean boss, boolean elite) {
        List<Unit> out = new ArrayList<>();
        if (boss) {
            Creature c = creature(route.bossId());
            Unit unit = statUnit(c, route.bossLevel(), false, "boss-" + c.id());
            // Bosses are often epic final forms; their raw budget would dwarf a company of
            // first evolutions, so the boss's size comes from its multipliers, not its rarity.
            double norm = Math.min(1.0, 220.0 / ChroniclesContent.rarityBudget(c.rarity()));
            unit.maxHp *= 1.8 * Math.max(norm, 0.75);
            unit.hp = unit.maxHp;
            unit.atk *= 0.95 * norm;
            unit.def *= norm;
            unit.boss = true;
            out.add(unit);
            return out;
        }
        List<Creature> pool = enemyPool(route, false);
        int size = route.groupMin() + random.nextInt(route.groupMax() - route.groupMin() + 1);
        for (int i = 0; i < size; i++) {
            Creature c = pool.get(random.nextInt(pool.size()));
            int level = elite ? route.levelMax()
                    : route.levelMin() + random.nextInt(route.levelMax() - route.levelMin() + 1);
            Unit unit = statUnit(c, level, false, "wild-" + i);
            double wild = elite ? 0.72 : 0.6;
            unit.maxHp *= wild;
            unit.hp = unit.maxHp;
            unit.atk *= wild;
            out.add(unit);
        }
        return out;
    }

    /** Wild Siegelings for a route: its element, base forms for the open wilds, first evolutions in dungeons. */
    List<Creature> enemyPool(Route route, boolean tameable) {
        int maxStage = route.type() == RouteType.DUNGEON && !tameable ? 2 : 1;
        int maxTier = route.type() == RouteType.DUNGEON ? 3 : 2;
        List<Creature> pool = new ArrayList<>();
        for (Creature c : CreatureRegistry.all()) {
            if (c.element() != route.element()) continue;
            if (c.stage() > maxStage) continue;
            if (rarityTier(c.rarity()) > maxTier) continue;
            pool.add(c);
        }
        if (pool.isEmpty()) pool.add(creature(ChroniclesContent.STARTERS.get(0)));
        pool.sort(Comparator.comparing(Creature::id));
        return pool;
    }

    private Rewards rewardsFor(ChroniclesState state, Route route, ChroniclesCombat.Result result,
                               List<Companion> members, Companion reserve) {
        Rewards r = new Rewards();
        boolean complete = "complete".equals(result.outcome);
        r.items.putAll(result.loot);
        r.companionXp.putAll(result.companionXp);
        r.battles.putAll(result.battlesWon);
        List<Companion> everyone = new ArrayList<>(members);
        if (reserve != null) everyone.add(reserve);
        for (Companion c : everyone) {
            int battles = result.battlesWon.getOrDefault(c.id, 0);
            long bond = battles * 10L + (complete && members.contains(c) ? 30 : 0);
            if (bond > 0) r.bond.put(c.id, bond);
        }
        result.elementBattles.forEach((el, n) -> r.affinityXp.merge(el, n * 12L, Long::sum));
        if (result.encountersWon > 0) r.affinityXp.merge(route.element().name(), result.encountersWon * 4L, Long::sum);
        result.classBattles.forEach((cls, n) -> r.masteryXp.merge(cls, n * 12L, Long::sum));
        Item weapon = ChroniclesContent.ITEMS.getOrDefault(state.weaponId, ChroniclesContent.ITEMS.get("squires_sword"));
        long weaponXp = result.encountersWon * 4L + result.commandsFired * 20L;
        if (weaponXp > 0) r.weaponXp.put(weapon.weaponType(), weaponXp);
        long command = result.encountersWon * 15L + (complete ? route.minutes() : 0);
        if (command > 0) r.skillXp.put("command", command);
        long pathfinding = complete ? route.minutes() : route.minutes() / 2;
        if (pathfinding > 0) r.skillXp.put("pathfinding", pathfinding);
        long survival = result.hazardsEndured * 10L + (route.type() == RouteType.DUNGEON ? result.encountersWon * 3L : 0);
        if (survival > 0) r.skillXp.put("survival", survival);
        if (result.exploreSteps > 0) r.skillXp.put("cartography", result.exploreSteps * 5L);
        if (result.encountersWon > 0) r.skillXp.put("class_tactics", result.encountersWon * 4L);
        r.rankXp = complete ? route.minutes() * 2L : route.minutes() / 2;
        for (ChroniclesCombat.SightingRoll roll : result.sightings) {
            Random random = new Random(roll.seed());
            List<Creature> pool = enemyPool(route, true);
            Creature c = pool.get(random.nextInt(pool.size()));
            Sighting s = new Sighting();
            s.speciesId = c.id();
            s.level = clamp(route.levelMin() + random.nextInt(4), 1, 10);
            s.routeId = route.id();
            s.behavior = behavior(c);
            s.seed = random.nextLong();
            r.sightings.add(s);
        }
        return r;
    }

    private Map<String, Object> reportFor(ChroniclesState state, Expedition expedition, Route route) {
        Map<String, Object> out = new LinkedHashMap<>();
        Rewards r = expedition.rewards;
        out.put("route", route == null ? expedition.routeId : route.name());
        out.put("outcome", expedition.outcome);
        out.put("encountersWon", expedition.encountersWon);
        out.put("encountersTotal", expedition.encountersTotal);
        out.put("items", itemList(r.items));
        out.put("suppliesReturned", itemList(expedition.suppliesLeft));
        List<Map<String, Object>> companions = new ArrayList<>();
        List<String> ids = new ArrayList<>(expedition.partyIds);
        if (!expedition.reserveId.isEmpty()) ids.add(expedition.reserveId);
        for (String id : ids) {
            Companion c = findCompanion(state, id);
            if (c == null) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", c.id);
            row.put("name", displayName(c));
            row.put("xp", r.companionXp.getOrDefault(id, 0L));
            row.put("bond", r.bond.getOrDefault(id, 0L));
            row.put("battles", r.battles.getOrDefault(id, 0));
            companions.add(row);
        }
        out.put("companions", companions);
        List<Map<String, Object>> xp = new ArrayList<>();
        r.affinityXp.forEach((el, v) -> xp.add(xpRow("affinity", ChroniclesContent.elementLabel(Element.valueOf(el)) + " Affinity", v)));
        r.masteryXp.forEach((cls, v) -> xp.add(xpRow("mastery", cls + " Mastery", v)));
        r.weaponXp.forEach((w, v) -> xp.add(xpRow("weapon", ChroniclesContent.WEAPONS.get(w).name() + " Proficiency", v)));
        r.skillXp.forEach((s, v) -> xp.add(xpRow("skill", skillName(s), v)));
        out.put("xp", xp);
        out.put("sightings", r.sightings.size());
        out.put("timeline", timelineList(expedition, Long.MAX_VALUE));
        return out;
    }

    private static Map<String, Object> xpRow(String kind, String label, long xp) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("kind", kind);
        row.put("label", label);
        row.put("xp", xp);
        return row;
    }

    // ── Stats ────────────────────────────────────────────────────────────────

    /** Base stats from the RBX allocation: rarity budget × class weights + element bias, grown by level. */
    Unit statUnit(Creature c, int level, boolean ally, String id) {
        double[] w = ChroniclesContent.classWeights(c.creatureClass());
        double[] bias = ChroniclesContent.elementBias(c.element());
        double sum = 0;
        double[] mix = new double[4];
        for (int i = 0; i < 4; i++) { mix[i] = w[i] + bias[i]; sum += mix[i]; }
        int budget = ChroniclesContent.rarityBudget(c.rarity());
        double[] s = new double[4];
        for (int i = 0; i < 4; i++) s[i] = budget * mix[i] / sum;
        int lv = Math.max(1, level);
        Unit u = new Unit();
        u.id = id;
        u.name = c.name();
        u.speciesId = c.id();
        u.element = c.element();
        u.cls = c.creatureClass();
        u.ally = ally;
        u.level = lv;
        u.maxHp = (s[0] * 2.2 + 30) * (1 + 0.09 * (lv - 1));
        u.hp = u.maxHp;
        u.atk = (s[1] * 0.6 + 6) * (1 + 0.08 * (lv - 1));
        u.def = (s[2] * 0.6 + 4) * (1 + 0.08 * (lv - 1));
        u.spd = s[3] * 0.5 + 5 + lv * 0.3;
        u.crit = "Assassin".equals(c.creatureClass()) ? 0.20 : 0.05;
        return u;
    }

    Unit companionUnit(ChroniclesState state, Companion companion, List<Synergy> synergies, Technique technique,
                       Mods crossStats, String runeId) {
        Creature c = creature(companion.speciesId);
        Unit u = statUnit(c, companion.level, true, companion.id);
        u.name = displayName(companion);
        int bond = ChroniclesContent.bondLevelFor(companion.bond);
        u.bondLevel = bond;
        double bondPct = bond >= 100 ? 0.20 : bond >= 75 ? 0.15 : bond >= 25 ? 0.10 : bond >= 10 ? 0.05 : 0;
        if (bond >= 25) u.crit += 0.05;
        int mastery = masteryLevel(state, c.creatureClass());
        double general = 0.0025 * mastery;
        double atk = bondPct + general, def = bondPct + general, hp = bondPct + general, spd = bondPct / 2;
        switch (c.creatureClass()) {
            case "Guardian" -> { def += general; hp += general; }
            case "Bruiser" -> { hp += general; atk += general; }
            case "Assassin" -> { u.crit += 0.001 * mastery; atk += general; }
            case "Mage" -> atk += general * 2;
            case "Support" -> { hp += general; spd += general; }
            default -> { }
        }
        for (Synergy s : synergies) {
            boolean applies = s.key().equals(c.element().name()) || s.key().equals(c.creatureClass());
            if (!applies) continue;
            atk += s.mods().atk(); def += s.mods().def(); hp += s.mods().hp(); spd += s.mods().spd();
        }
        if (technique != null && (!technique.elementScoped() || technique.element() == c.element())) {
            Mods m = technique.mods();
            atk += m.atk(); def += m.def(); hp += m.hp(); spd += m.spd(); u.crit += m.crit();
        }
        atk += crossStats.atk(); def += crossStats.def(); hp += crossStats.hp(); spd += crossStats.spd();
        u.crit += crossStats.crit();
        if ("guardianCrest".equals(relicEffect(state)) && "Guardian".equals(c.creatureClass())) def += 0.12;
        ChroniclesContent.ClassBoost boost = ChroniclesContent.ARMOR_BOOSTS.get(state.armorId);
        if (boost != null && boost.creatureClass().equals(c.creatureClass())) {
            atk += boost.mods().atk(); def += boost.mods().def(); hp += boost.mods().hp(); spd += boost.mods().spd();
        }
        ChroniclesContent.RuneEffect rune = runeId == null ? null : ChroniclesContent.RUNE_EFFECTS.get(runeId);
        if (rune != null && (rune.element() == null || rune.element() == c.element())) {
            atk += rune.mods().atk(); def += rune.mods().def(); hp += rune.mods().hp(); spd += rune.mods().spd();
        }
        u.atk *= 1 + atk;
        u.def *= 1 + def;
        u.maxHp *= 1 + hp;
        u.hp = u.maxHp;
        u.spd *= 1 + spd;
        return u;
    }

    private String relicEffect(ChroniclesState state) {
        Item relic = state.relicId.isEmpty() ? null : ChroniclesContent.ITEMS.get(state.relicId);
        return relic == null ? "" : relic.relicEffect();
    }

    static List<Synergy> activeSynergies(Map<String, Integer> elementCounts, Map<String, Integer> classCounts) {
        List<Synergy> out = new ArrayList<>();
        Map<String, Integer> all = new LinkedHashMap<>(elementCounts);
        all.putAll(classCounts);
        all.forEach((key, n) -> {
            List<Synergy> tiers = ChroniclesContent.SYNERGIES.get(key);
            if (tiers == null) return;
            Synergy best = null;
            for (Synergy s : tiers) if (n >= s.count()) best = s;
            if (best != null) out.add(best);
        });
        return out;
    }

    private List<CrossClass> activeCrossClass(ChroniclesState state, Map<String, Integer> classCounts) {
        List<CrossClass> out = new ArrayList<>();
        if (profLevel(state, "class_tactics") < ChroniclesContent.CROSS_CLASS_TACTICS) return out;
        for (CrossClass cc : ChroniclesContent.CROSS_CLASS) {
            if (classCounts.containsKey(cc.a()) && classCounts.containsKey(cc.b())
                    && masteryLevel(state, cc.a()) >= ChroniclesContent.CROSS_CLASS_LEVEL
                    && masteryLevel(state, cc.b()) >= ChroniclesContent.CROSS_CLASS_LEVEL) {
                out.add(cc);
            }
        }
        return out;
    }

    private static Mods sum(Mods a, Mods b) {
        return new Mods(a.atk() + b.atk(), a.def() + b.def(), a.hp() + b.hp(), a.spd() + b.spd(), a.crit() + b.crit(),
                a.enemyDef() + b.enemyDef(), a.enemySpd() + b.enemySpd(), a.postHeal() + b.postHeal(),
                a.openingDmg() + b.openingDmg(), Math.max(a.lowHpGuard(), b.lowHpGuard()));
    }

    // ── Taming ───────────────────────────────────────────────────────────────

    double tameChance(ChroniclesState state, Sighting sighting, String plan, String lureId) {
        Creature creature = creature(sighting.speciesId);
        double base = switch (creature.rarity()) {
            case COMMON -> 0.50;
            case UNCOMMON -> 0.32;
            case RARE -> 0.18;
            default -> 0.10;
        };
        base -= (sighting.level - 1) * 0.01;
        int taming = skillLevel(state, "taming");
        String behavior = sighting.behavior;
        double chance;
        switch (plan) {
            case "patient" -> chance = base + taming * 0.015 + switch (behavior) {
                case "gentle" -> 0.10;
                case "skittish" -> -0.20;
                case "aggressive" -> -0.10;
                case "lone" -> -0.05;
                default -> 0.0;
            };
            case "lure" -> {
                Item lure = ChroniclesContent.ITEMS.get(lureId == null ? "" : lureId);
                if (lure == null || lure.kind() != ItemKind.LURE) throw new IllegalArgumentException("Choose a lure.");
                if (state.inventory.getOrDefault(lure.id(), 0) <= 0) throw new IllegalArgumentException("You have no " + lure.name() + ".");
                double lureBonus = lure.lureElement() == null ? lure.lureBonus() / 100.0
                        : lure.lureElement() == creature.element() ? lure.lureBonus() / 100.0 : 0.05;
                chance = base + taming * 0.0075 + lureBonus + switch (behavior) {
                    case "skittish" -> 0.05;
                    case "aggressive" -> -0.05;
                    default -> 0.0;
                };
            }
            case "partner" -> {
                Companion partner = bestPartner(state, creature.element());
                if (partner == null) {
                    throw new IllegalArgumentException("A partner approach needs a " + ChroniclesContent.elementLabel(creature.element())
                            + " Siegeling at Bond 10 or higher, home from expeditions.");
                }
                int bond = ChroniclesContent.bondLevelFor(partner.bond);
                chance = base + taming * 0.0075 + bond * 0.005 + switch (behavior) {
                    case "pack" -> 0.15;
                    case "aggressive", "gentle" -> 0.05;
                    case "lone" -> -0.10;
                    default -> 0.0;
                };
            }
            default -> throw new IllegalArgumentException("Choose a taming approach.");
        }
        return Math.max(0.05, Math.min(0.95, chance));
    }

    private Companion bestPartner(ChroniclesState state, Element element) {
        Companion best = null;
        for (Companion c : state.companions) {
            if (creature(c.speciesId).element() != element || onExpedition(state, c.id)) continue;
            if (ChroniclesContent.bondLevelFor(c.bond) < 10) continue;
            if (best == null || c.bond > best.bond) best = c;
        }
        return best;
    }

    // ── Progression helpers ──────────────────────────────────────────────────

    private void grantSkill(ChroniclesState state, String skillId, long xp, List<String> events) {
        if (xp <= 0) return;
        Skill target = ChroniclesContent.SKILLS.get(skillId);
        // A locked profession earns nothing, or it would unlock itself through the grandfather rule.
        if (target == null || !skillUnlocked(state, target)) return;
        Map<String, Boolean> unlockedBefore = new HashMap<>();
        for (Skill s : ChroniclesContent.SKILLS.values()) unlockedBefore.put(s.id(), skillUnlocked(state, s));
        int before = skillLevel(state, skillId);
        state.skillXp.merge(skillId, xp, Long::sum);
        int after = skillLevel(state, skillId);
        if (after > before) events.add(skillName(skillId) + " reached level " + after + ".");
        if ("command".equals(skillId)) {
            int slotsBefore = ChroniclesContent.partySlots(before);
            int slotsAfter = ChroniclesContent.partySlots(after);
            if (slotsAfter > slotsBefore) events.add("Your company can now field " + slotsAfter + " Siegelings.");
            if (before < ChroniclesContent.RESERVE_COMMAND_LEVEL && after >= ChroniclesContent.RESERVE_COMMAND_LEVEL) {
                events.add("You can now name a reserve Siegeling.");
            }
        }
        for (Skill s : ChroniclesContent.SKILLS.values()) {
            if (!unlockedBefore.get(s.id()) && skillUnlocked(state, s)) events.add("New profession unlocked: " + s.name() + ".");
        }
        grantRank(state, Math.max(1, xp / 4), events);
    }

    private void grantAffinity(ChroniclesState state, Element element, long xp, List<String> events) {
        if (xp <= 0 || element == null || element == Element.NEUTRAL) return;
        xp = Math.round(xp * (1 + ChroniclesContent.studiesBonus(profLevel(state, "elemental_studies"))));
        int before = affinityLevel(state, element);
        state.affinityXp.merge(element.name(), xp, Long::sum);
        int after = affinityLevel(state, element);
        for (int i = 0; i < ChroniclesContent.AFFINITY_MILESTONES.length; i++) {
            int m = ChroniclesContent.AFFINITY_MILESTONES[i];
            if (m > 1 && before < m && after >= m) {
                String extra = m == 10 ? " Technique ready: " + ChroniclesContent.techniqueFor(element).name() + "." : "";
                events.add(ChroniclesContent.elementLabel(element) + " Affinity " + m + ": "
                        + ChroniclesContent.AFFINITY_MILESTONE_NAMES[i] + "." + extra);
            }
        }
        grantRank(state, Math.max(1, xp / 4), events);
    }

    private void grantMastery(ChroniclesState state, String cls, long xp, List<String> events) {
        if (xp <= 0 || cls == null) return;
        int before = masteryLevel(state, cls);
        state.masteryXp.merge(cls, xp, Long::sum);
        int after = masteryLevel(state, cls);
        if (after > before && (after % 5 == 0 || after == ChroniclesContent.CROSS_CLASS_LEVEL)) {
            events.add(cls + " Mastery reached " + after + ".");
        }
        grantRank(state, Math.max(1, xp / 4), events);
    }

    private void grantWeapon(ChroniclesState state, String weapon, long xp, List<String> events) {
        if (xp <= 0 || weapon == null) return;
        int before = weaponLevel(state, weapon);
        state.weaponXp.merge(weapon, xp, Long::sum);
        int after = weaponLevel(state, weapon);
        if (after > before) events.add(ChroniclesContent.WEAPONS.get(weapon).name() + " Proficiency reached " + after + ".");
        grantRank(state, Math.max(1, xp / 4), events);
    }

    private void grantRank(ChroniclesState state, long xp, List<String> events) {
        if (xp <= 0) return;
        int before = rank(state);
        state.rankXp += xp;
        int after = rank(state);
        if (after > before) {
            events.add("Siegeknight Rank " + after + "!");
            for (Route route : ChroniclesContent.ROUTES.values()) {
                if (route.rankReq() > before && route.rankReq() <= after) events.add("New destination: " + route.name() + ".");
            }
        }
    }

    private void grantCompanionXp(Companion c, long xp, List<String> events) {
        if (xp <= 0) return;
        Creature creature = creature(c.speciesId);
        int cap = ChroniclesContent.levelCap(creature.stage(), creature.evolvesToId() != null);
        c.xp = Math.min(c.xp + xp, ChroniclesContent.companionXpForLevel(cap));
        int level = 1;
        while (level < cap && c.xp >= ChroniclesContent.companionXpForLevel(level + 1)) level++;
        if (level > c.level) {
            c.level = level;
            events.add(displayName(c) + " reached level " + level + "."
                    + (level == cap && creature.evolvesToId() != null ? " It is ready to evolve." : ""));
        }
    }

    private void grantBond(ChroniclesState state, Companion c, long points, List<String> events) {
        if (points <= 0) return;
        grantSkill(state, "bonding", Math.max(1, points / 2), events);
        points = Math.round(points * (1 + ChroniclesContent.bondingBonus(profLevel(state, "bonding"))));
        int before = ChroniclesContent.bondLevelFor(c.bond);
        c.bond = Math.min(c.bond + points, ChroniclesContent.bondForLevel(ChroniclesContent.MAX_BOND));
        int after = ChroniclesContent.bondLevelFor(c.bond);
        for (int i = 1; i < ChroniclesContent.BOND_MILESTONES.length; i++) {
            int m = ChroniclesContent.BOND_MILESTONES[i];
            if (before < m && after >= m) {
                String extra = m == 50 ? " Bond technique unlocked: " + bondTechniqueName(c) + "." : "";
                events.add(displayName(c) + " is now " + ChroniclesContent.BOND_MILESTONE_NAMES[i] + " (Bond " + m + ")." + extra);
            }
        }
    }

    String bondTechniqueName(Companion c) {
        Creature creature = creature(c.speciesId);
        ChroniclesContent.ClassPath path = ChroniclesContent.CLASS_PATHS.get(creature.creatureClass());
        return ChroniclesContent.bondPrefix(creature.element()) + " " + (path == null ? "Resolve" : path.bondNoun());
    }

    static Map<String, Integer> evolutionCost(Creature from) {
        Map<String, Integer> cost = new LinkedHashMap<>();
        String essence = ChroniclesContent.essenceId(from.element() == Element.NEUTRAL ? Element.EARTH : from.element());
        if (from.stage() <= 1) cost.put(essence, 6);
        else {
            cost.put(essence, 15);
            cost.put("ancient_relic", 1);
        }
        return cost;
    }

    int skillLevel(ChroniclesState state, String id) {
        return ChroniclesContent.levelForXp(state.skillXp.getOrDefault(id, 0L));
    }

    /** A profession's level for its effects: 0 while it is still locked. */
    int profLevel(ChroniclesState state, String id) {
        Skill skill = ChroniclesContent.SKILLS.get(id);
        return skill == null || !skillUnlocked(state, skill) ? 0 : skillLevel(state, id);
    }

    int affinityLevel(ChroniclesState state, Element element) {
        return ChroniclesContent.levelForXp(state.affinityXp.getOrDefault(element.name(), 0L));
    }

    int masteryLevel(ChroniclesState state, String cls) {
        return ChroniclesContent.levelForXp(state.masteryXp.getOrDefault(cls, 0L));
    }

    int weaponLevel(ChroniclesState state, String weapon) {
        return ChroniclesContent.levelForXp(state.weaponXp.getOrDefault(weapon == null ? "" : weapon, 0L));
    }

    int rank(ChroniclesState state) {
        return ChroniclesContent.levelForXp(state.rankXp);
    }

    /**
     * Requirements met, or already practised: a profession whose prerequisites moved
     * (Smithing now follows Smelting) stays open for knights who trained it before.
     */
    boolean skillUnlocked(ChroniclesState state, Skill skill) {
        if (state.skillXp.getOrDefault(skill.id(), 0L) > 0) return true;
        return skill.unlock().stream().allMatch(req -> meets(state, req));
    }

    boolean meets(ChroniclesState state, Req req) {
        return switch (req.kind()) {
            case SKILL -> skillLevel(state, req.key()) >= req.level();
            case AFFINITY -> affinityLevel(state, Element.valueOf(req.key())) >= req.level();
            case MASTERY -> masteryLevel(state, req.key()) >= req.level();
            case RANK -> rank(state) >= req.level();
        };
    }

    String reqText(Req req) {
        return switch (req.kind()) {
            case SKILL -> skillName(req.key()) + " " + req.level();
            case AFFINITY -> ChroniclesContent.elementLabel(Element.valueOf(req.key())) + " Affinity " + req.level();
            case MASTERY -> req.key() + " Mastery " + req.level();
            case RANK -> "Rank " + req.level();
        };
    }

    private void requireSkillUnlocked(ChroniclesState state, String skillId) {
        Skill skill = ChroniclesContent.SKILLS.get(skillId);
        if (skill != null && !skillUnlocked(state, skill)) {
            throw new IllegalArgumentException(skill.name() + " unlocks at "
                    + String.join(", ", skill.unlock().stream().map(this::reqText).toList()) + ".");
        }
    }

    private void requireRecipe(ChroniclesState state, Recipe recipe) {
        requireSkillUnlocked(state, recipe.skillId());
        if (skillLevel(state, recipe.skillId()) < recipe.level()) {
            throw new IllegalArgumentException(itemName(recipe.output()) + " needs " + skillName(recipe.skillId())
                    + " " + recipe.level() + ".");
        }
        for (Req req : recipe.extraReqs()) {
            if (!meets(state, req)) throw new IllegalArgumentException(itemName(recipe.output()) + " needs " + reqText(req) + ".");
        }
    }

    static String recipeLabel(Recipe recipe) {
        if (recipe.isStudy()) return ChroniclesContent.elementLabel(recipe.studyElement()) + " studies";
        return itemName(recipe.output());
    }

    /** Makes the recipe's item, or for a study session teaches its element. */
    private void applyRecipeOutput(ChroniclesState state, Recipe recipe, int times, List<String> events) {
        if (times <= 0) return;
        if (recipe.isStudy()) {
            grantAffinity(state, recipe.studyElement(), (long) ChroniclesContent.STUDY_AFFINITY_XP * times, events);
        } else {
            give(state, recipe.output(), recipe.outputQty() * times);
        }
    }

    static long maxCrafts(ChroniclesState state, Recipe recipe) {
        long max = Long.MAX_VALUE;
        for (Map.Entry<String, Integer> input : recipe.inputs().entrySet()) {
            max = Math.min(max, state.inventory.getOrDefault(input.getKey(), 0) / Math.max(1, input.getValue()));
        }
        return max == Long.MAX_VALUE ? 0 : max;
    }

    private static int commandForSlots(long slots) {
        return slots >= 3 ? 10 : 3;
    }

    private static void give(ChroniclesState state, String item, int qty) {
        if (qty > 0) state.inventory.merge(item, qty, Integer::sum);
    }

    private static void take(ChroniclesState state, String item, int qty) {
        int have = state.inventory.getOrDefault(item, 0);
        if (have < qty) throw new IllegalArgumentException("Not enough " + itemName(item) + ".");
        if (have == qty) state.inventory.remove(item);
        else state.inventory.put(item, have - qty);
    }

    private Companion newCompanion(ChroniclesState state, Creature creature, int level, String origin, long now) {
        Companion c = new Companion();
        c.id = "c" + (state.nextCompanionNo++);
        c.speciesId = creature.id();
        c.nickname = creature.name();
        c.origin = origin;
        c.level = Math.max(1, level);
        c.xp = ChroniclesContent.companionXpForLevel(c.level);
        c.joinedAt = now;
        state.companions.add(c);
        return c;
    }

    private static Companion findCompanion(ChroniclesState state, String id) {
        if (id == null) return null;
        for (Companion c : state.companions) if (c.id.equals(id)) return c;
        return null;
    }

    private static Companion requireCompanion(ChroniclesState state, String id) {
        Companion c = findCompanion(state, id == null ? null : id.trim());
        if (c == null) throw new IllegalArgumentException("That Siegeling is not in your sanctuary.");
        return c;
    }

    private static boolean onExpedition(ChroniclesState state, String id) {
        Expedition e = state.expedition;
        return e != null && (e.partyIds.contains(id) || id.equals(e.reserveId));
    }

    static Creature creature(String id) {
        return CreatureRegistry.find(id).orElseThrow(() -> new IllegalArgumentException("Unknown Siegeling: " + id));
    }

    String behavior(Creature c) {
        return behaviors.getOrDefault(c.id(), ChroniclesContent.defaultBehavior(c.creatureClass()));
    }

    private static String displayName(Companion c) {
        return c == null ? "" : c.nickname;
    }

    static String itemName(String id) {
        Item item = ChroniclesContent.ITEMS.get(id);
        return item == null ? id : item.name();
    }

    static String skillName(String id) {
        Skill skill = ChroniclesContent.SKILLS.get(id);
        return skill == null ? id : skill.name();
    }

    static int rarityTier(Rarity rarity) {
        return rarity == null ? 1 : rarity.ordinal() + 1;
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static String normalize(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
    }

    private static String cleanName(String requested, String fallback) {
        String name = requested == null ? "" : requested.replaceAll("[^\\p{L}\\p{N} '\\-]", "").trim();
        if (name.isEmpty()) name = fallback == null ? "" : fallback.replaceAll("[^\\p{L}\\p{N} '\\-]", "").trim();
        if (name.isEmpty()) name = "Squire";
        return name.length() > 20 ? name.substring(0, 20).trim() : name;
    }

    private static Map<String, String> loadBehaviors() {
        try (InputStream in = ChroniclesService.class.getResourceAsStream("/chronicles/rbx-behaviors.json")) {
            if (in == null) return Map.of();
            Map<String, Object> root = ChroniclesStore.JSON.readValue(in, new TypeReference<Map<String, Object>>() {});
            Object raw = root.get("behaviors");
            Map<String, String> out = new HashMap<>();
            if (raw instanceof Map<?, ?> map) map.forEach((k, v) -> out.put(String.valueOf(k), String.valueOf(v)));
            return out;
        } catch (Exception ex) {
            return Map.of();
        }
    }

    // ── Art ──────────────────────────────────────────────────────────────────

    private Map<String, String> art() {
        long now = System.currentTimeMillis();
        if (cards == null) return Map.of();
        if (now - artCachedAt < ART_TTL_MS && !artCache.isEmpty()) return artCache;
        try {
            Map<String, String> map = new HashMap<>();
            for (Card card : cards.getDeckBuilderCatalog()) {
                if (card.getId() != null && card.getCardArtUrl() != null && !card.getCardArtUrl().isBlank()) {
                    map.put(card.getId().toLowerCase(Locale.ROOT), card.getCardArtUrl());
                }
            }
            artCache = map;
            artCachedAt = now;
        } catch (RuntimeException ignored) {
            // Art is decoration; a catalog hiccup must not block the save.
        }
        return artCache;
    }

    // ── Snapshot ─────────────────────────────────────────────────────────────

    private Map<String, Object> introSnapshot(AccountUser user) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("started", false);
        out.put("serverNow", now());
        out.put("suggestedName", cleanName(null, user.getDisplayName()));
        Map<String, String> art = art();
        List<Map<String, Object>> starters = new ArrayList<>();
        for (String id : ChroniclesContent.STARTERS) {
            Creature c = creature(id);
            Map<String, Object> row = speciesRow(c, art);
            ChroniclesContent.ClassPath path = ChroniclesContent.CLASS_PATHS.get(c.creatureClass());
            row.put("identity", path == null ? "" : path.identity());
            row.put("bondTechnique", ChroniclesContent.bondPrefix(c.element()) + " " + (path == null ? "" : path.bondNoun()));
            starters.add(row);
        }
        out.put("starters", starters);
        return out;
    }

    private Map<String, Object> speciesRow(Creature c, Map<String, String> art) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("speciesId", c.id());
        row.put("species", c.name());
        row.put("element", c.element().name());
        row.put("elementLabel", ChroniclesContent.elementLabel(c.element()));
        row.put("class", c.creatureClass());
        row.put("rarity", c.rarity().name());
        row.put("stage", c.stage());
        row.put("behavior", behavior(c));
        row.put("artUrl", art.getOrDefault(c.id(), ""));
        return row;
    }

    Map<String, Object> snapshot(ChroniclesState state, long now, List<String> events, Map<String, Object> extra) {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, String> art = art();
        out.put("started", true);
        out.put("version", state.version);
        out.put("serverNow", now);
        out.put("events", events);

        int rank = rank(state);
        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("name", state.knightName);
        knight.put("rank", rank);
        knight.put("rankTitle", rankTitle(rank));
        knight.putAll(progress(state.rankXp, rank));
        knight.put("expeditionsCompleted", state.expeditionsCompleted);
        knight.put("tamed", state.tamedCount);
        out.put("knight", knight);

        List<Map<String, Object>> skills = new ArrayList<>();
        for (Skill s : ChroniclesContent.SKILLS.values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            long xp = state.skillXp.getOrDefault(s.id(), 0L);
            int level = ChroniclesContent.levelForXp(xp);
            row.put("id", s.id());
            row.put("name", s.name());
            row.put("group", s.group());
            row.put("blurb", s.blurb());
            row.put("level", level);
            row.putAll(progress(xp, level));
            row.put("unlocked", skillUnlocked(state, s));
            row.put("unlockText", s.unlock().stream().map(this::reqText).toList());
            row.put("leadsTo", leadsTo(s.id()));
            row.put("effect", skillEffect(state, s.id(), level));
            skills.add(row);
        }
        out.put("skills", skills);

        List<Map<String, Object>> affinities = new ArrayList<>();
        for (Element element : ChroniclesContent.ELEMENTS) {
            long xp = state.affinityXp.getOrDefault(element.name(), 0L);
            int level = ChroniclesContent.levelForXp(xp);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("element", element.name());
            row.put("label", ChroniclesContent.elementLabel(element));
            row.put("level", level);
            row.putAll(progress(xp, level));
            row.put("studied", xp > 0);
            int idx = 0;
            for (int i = 0; i < ChroniclesContent.AFFINITY_MILESTONES.length; i++) {
                if (level >= ChroniclesContent.AFFINITY_MILESTONES[i]) idx = i;
            }
            row.put("milestone", xp > 0 ? ChroniclesContent.AFFINITY_MILESTONE_NAMES[idx] : "Unstudied");
            int next = idx + 1 < ChroniclesContent.AFFINITY_MILESTONES.length ? ChroniclesContent.AFFINITY_MILESTONES[idx + 1] : 0;
            row.put("nextMilestone", next);
            row.put("nextMilestoneName", next == 0 ? "" : ChroniclesContent.AFFINITY_MILESTONE_NAMES[idx + 1]);
            Technique t = ChroniclesContent.techniqueFor(element);
            Map<String, Object> tech = new LinkedHashMap<>();
            tech.put("id", t.id());
            tech.put("name", t.name());
            tech.put("text", t.text());
            tech.put("unlocked", level >= 10);
            row.put("technique", tech);
            row.put("masteryAbility", t.mastery());
            affinities.add(row);
        }
        out.put("affinities", affinities);

        List<Map<String, Object>> masteries = new ArrayList<>();
        for (ChroniclesContent.ClassPath path : ChroniclesContent.CLASS_PATHS.values()) {
            long xp = state.masteryXp.getOrDefault(path.creatureClass(), 0L);
            int level = ChroniclesContent.levelForXp(xp);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("class", path.creatureClass());
            row.put("path", path.path());
            row.put("identity", path.identity());
            row.put("level", level);
            row.putAll(progress(xp, level));
            row.put("bonusPct", Math.round(level * 0.25 * 10) / 10.0);
            masteries.add(row);
        }
        out.put("masteries", masteries);

        List<Map<String, Object>> cross = new ArrayList<>();
        for (CrossClass cc : ChroniclesContent.CROSS_CLASS) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", cc.id());
            row.put("name", cc.name());
            row.put("classes", List.of(cc.a(), cc.b()));
            row.put("text", cc.text());
            row.put("needs", ChroniclesContent.CROSS_CLASS_LEVEL);
            row.put("unlocked", masteryLevel(state, cc.a()) >= ChroniclesContent.CROSS_CLASS_LEVEL
                    && masteryLevel(state, cc.b()) >= ChroniclesContent.CROSS_CLASS_LEVEL);
            cross.add(row);
        }
        out.put("crossClass", cross);

        Item equippedWeapon = ChroniclesContent.ITEMS.getOrDefault(state.weaponId, ChroniclesContent.ITEMS.get("squires_sword"));
        List<Map<String, Object>> weapons = new ArrayList<>();
        for (ChroniclesContent.Weapon w : ChroniclesContent.WEAPONS.values()) {
            long xp = state.weaponXp.getOrDefault(w.id(), 0L);
            int level = ChroniclesContent.levelForXp(xp);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", w.id());
            row.put("name", w.name());
            row.put("specialty", w.specialty());
            row.put("command", w.command());
            row.put("commandText", w.commandText());
            row.put("defaultTrigger", w.defaultTrigger().name());
            row.put("level", level);
            row.putAll(progress(xp, level));
            row.put("equipped", w.id().equals(equippedWeapon.weaponType()));
            weapons.add(row);
        }
        out.put("weapons", weapons);

        Map<String, Object> equipment = new LinkedHashMap<>();
        equipment.put("weapon", itemRow(state.weaponId, 1));
        equipment.put("armor", itemRow(state.armorId, 1));
        equipment.put("relic", state.relicId.isEmpty() ? null : itemRow(state.relicId, 1));
        out.put("equipment", equipment);

        List<Map<String, Object>> inventory = new ArrayList<>();
        state.inventory.forEach((id, qty) -> { if (qty > 0) inventory.add(itemRow(id, qty)); });
        out.put("inventory", inventory);

        List<Map<String, Object>> companions = new ArrayList<>();
        for (Companion c : state.companions) companions.add(companionRow(state, c, art));
        out.put("companions", companions);
        out.put("rosterCap", ChroniclesContent.ROSTER_CAP);

        Map<String, Object> party = new LinkedHashMap<>();
        int command = skillLevel(state, "command");
        party.put("slots", ChroniclesContent.partySlots(command));
        party.put("members", state.party);
        party.put("positions", List.of("FRONT", "FLANK", "REAR"));
        party.put("reserveId", state.reserveId);
        party.put("reserveUnlocked", command >= ChroniclesContent.RESERVE_COMMAND_LEVEL);
        party.put("reserveCommandLevel", ChroniclesContent.RESERVE_COMMAND_LEVEL);
        party.put("nextSlotAt", command < 3 ? 3 : command < 10 ? 10 : 0);
        Map<String, Integer> elementCounts = new LinkedHashMap<>();
        Map<String, Integer> classCounts = new LinkedHashMap<>();
        for (String id : state.party) {
            Companion c = findCompanion(state, id);
            if (c == null) continue;
            Creature cr = creature(c.speciesId);
            elementCounts.merge(cr.element().name(), 1, Integer::sum);
            classCounts.merge(cr.creatureClass(), 1, Integer::sum);
        }
        List<Map<String, Object>> syn = new ArrayList<>();
        for (Synergy s : activeSynergies(elementCounts, classCounts)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", s.label());
            row.put("key", s.key());
            row.put("count", s.count());
            row.put("text", modsText(s.mods()));
            syn.add(row);
        }
        party.put("synergies", syn);
        List<Map<String, Object>> crossActive = new ArrayList<>();
        for (CrossClass cc : activeCrossClass(state, classCounts)) crossActive.add(Map.of("name", cc.name(), "text", cc.text()));
        party.put("crossClass", crossActive);
        party.put("helperId", state.helperId);
        out.put("party", party);

        Map<String, Object> tactics = new LinkedHashMap<>();
        tactics.put("retreatAt", state.tactics.retreatAt);
        tactics.put("potionAt", state.tactics.potionAt);
        tactics.put("trigger", triggerFor(state, equippedWeapon.weaponType()).name());
        tactics.put("triggerIsDefault", state.tactics.trigger == null);
        tactics.put("techniqueId", state.tactics.techniqueId == null ? "" : state.tactics.techniqueId);
        tactics.put("triggers", List.of(
                Map.of("id", "READY", "label", "As soon as it's ready"),
                Map.of("id", "ALLY_LOW", "label", "When an ally falls below 30%"),
                Map.of("id", "ELITE", "label", "Against elites and bosses"),
                Map.of("id", "BOSS", "label", "Save it for bosses")));
        out.put("tactics", tactics);

        out.put("activity", activityRow(state, now));
        List<Map<String, Object>> activities = new ArrayList<>();
        for (Activity a : ChroniclesContent.ACTIVITIES.values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            Skill s = ChroniclesContent.SKILLS.get(a.skillId());
            row.put("id", a.id());
            row.put("kind", "gather");
            row.put("skillId", a.skillId());
            row.put("skill", s.name());
            row.put("name", a.name());
            row.put("place", a.place());
            row.put("level", a.level());
            row.put("seconds", a.actionSeconds());
            row.put("xp", a.xp());
            row.put("output", itemName(a.output()));
            row.put("outputId", a.output());
            row.put("bonus", a.bonusOutput() == null ? "" : itemName(a.bonusOutput()) + " every " + a.bonusEvery());
            row.put("helpers", a.helperElements().stream().map(ChroniclesContent::elementLabel).sorted().toList());
            row.put("unlocked", skillUnlocked(state, s) && skillLevel(state, a.skillId()) >= a.level());
            row.put("lockText", !skillUnlocked(state, s) ? s.name() + " is locked" : s.name() + " " + a.level());
            activities.add(row);
        }
        out.put("activities", activities);

        List<Map<String, Object>> recipes = new ArrayList<>();
        for (Recipe r : ChroniclesContent.RECIPES.values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            Skill s = ChroniclesContent.SKILLS.get(r.skillId());
            Item output = ChroniclesContent.ITEMS.get(r.output());
            row.put("id", r.id());
            row.put("skillId", r.skillId());
            row.put("skill", s.name());
            if (r.isStudy()) {
                Map<String, Object> studyRow = new LinkedHashMap<>();
                studyRow.put("id", "");
                studyRow.put("name", recipeLabel(r));
                studyRow.put("kind", "STUDY");
                studyRow.put("blurb", "Each session teaches " + ChroniclesContent.STUDY_AFFINITY_XP + "+ "
                        + ChroniclesContent.elementLabel(r.studyElement()) + " Affinity XP.");
                studyRow.put("qty", 0);
                row.put("output", studyRow);
            } else {
                row.put("output", itemRow(r.output(), r.outputQty()));
            }
            row.put("level", r.level());
            row.put("repeatable", r.repeatable());
            row.put("seconds", r.actionSeconds());
            row.put("xp", r.xp());
            List<Map<String, Object>> inputs = new ArrayList<>();
            r.inputs().forEach((id, n) -> {
                Map<String, Object> in = new LinkedHashMap<>();
                in.put("id", id);
                in.put("name", itemName(id));
                in.put("qty", n);
                in.put("have", state.inventory.getOrDefault(id, 0));
                inputs.add(in);
            });
            row.put("inputs", inputs);
            List<String> missing = new ArrayList<>();
            if (!skillUnlocked(state, s)) missing.add(s.name() + " (locked)");
            else if (skillLevel(state, r.skillId()) < r.level()) missing.add(s.name() + " " + r.level());
            for (Req req : r.extraReqs()) if (!meets(state, req)) missing.add(reqText(req));
            row.put("requirements", r.extraReqs().stream().map(this::reqText).toList());
            row.put("missing", missing);
            row.put("unlocked", missing.isEmpty());
            row.put("canMake", missing.isEmpty() ? maxCrafts(state, r) : 0);
            row.put("owned", !r.repeatable() && state.inventory.getOrDefault(r.output(), 0) > 0);
            row.put("kind", r.isStudy() ? "STUDY" : output == null ? "" : output.kind().name());
            recipes.add(row);
        }
        out.put("recipes", recipes);

        List<Map<String, Object>> routes = new ArrayList<>();
        for (Route r : ChroniclesContent.ROUTES.values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", r.id());
            row.put("name", r.name());
            row.put("region", r.region());
            row.put("type", r.type().name());
            row.put("element", r.element().name());
            row.put("elementLabel", ChroniclesContent.elementLabel(r.element()));
            row.put("minutes", r.minutes());
            row.put("encounters", r.encounters());
            row.put("levels", r.levelMin() + "–" + r.levelMax());
            row.put("rankReq", r.rankReq());
            row.put("unlocked", rank >= r.rankReq());
            row.put("blurb", r.blurb());
            row.put("hazardText", r.hazardText() == null ? "" : r.hazardText());
            row.put("boss", r.bossId() == null ? "" : creature(r.bossId()).name());
            row.put("taming", r.sightingChance() >= 0.2);
            row.put("loot", r.loot().stream().map(l -> itemName(l.item())).distinct().toList());
            routes.add(row);
        }
        out.put("routes", routes);

        out.put("expedition", expeditionRow(state, now));
        List<Map<String, Object>> sightings = new ArrayList<>();
        for (Sighting s : state.sightings) {
            Creature c = creature(s.speciesId);
            Map<String, Object> row = speciesRow(c, art);
            row.put("id", s.id);
            row.put("level", s.level);
            row.put("behavior", s.behavior);
            row.put("expiresAt", s.expiresAt);
            Route route = ChroniclesContent.ROUTES.get(s.routeId);
            row.put("route", route == null ? "" : route.name());
            Map<String, Object> odds = new LinkedHashMap<>();
            odds.put("patient", pct(() -> tameChance(state, s, "patient", null)));
            Companion partner = bestPartner(state, c.element());
            odds.put("partner", partner == null ? null : pct(() -> tameChance(state, s, "partner", null)));
            odds.put("partnerName", partner == null ? "" : partner.nickname);
            List<Map<String, Object>> lures = new ArrayList<>();
            for (Map.Entry<String, Integer> inv : state.inventory.entrySet()) {
                Item item = ChroniclesContent.ITEMS.get(inv.getKey());
                if (item == null || item.kind() != ItemKind.LURE || inv.getValue() <= 0) continue;
                Map<String, Object> lure = new LinkedHashMap<>();
                lure.put("id", item.id());
                lure.put("name", item.name());
                lure.put("qty", inv.getValue());
                lure.put("chance", pct(() -> tameChance(state, s, "lure", item.id())));
                lures.add(lure);
            }
            odds.put("lures", lures);
            row.put("odds", odds);
            sightings.add(row);
        }
        out.put("sightings", sightings);
        out.put("away", awayRow(state.away));
        if (extra != null) out.putAll(extra);
        return out;
    }

    private static Integer pct(java.util.function.DoubleSupplier supplier) {
        try { return (int) Math.round(supplier.getAsDouble() * 100); }
        catch (IllegalArgumentException ex) { return null; }
    }

    private List<String> leadsTo(String skillId) {
        List<String> out = new ArrayList<>();
        for (Skill s : ChroniclesContent.SKILLS.values()) {
            for (Req req : s.unlock()) {
                if (req.kind() == ChroniclesContent.ReqKind.SKILL && req.key().equals(skillId)) {
                    out.add(s.name() + " at " + req.level());
                }
            }
        }
        return out;
    }

    /** One line on what this profession's level is doing for the knight right now. */
    private String skillEffect(ChroniclesState state, String id, int level) {
        return switch (id) {
            case "pathfinding" -> "Expeditions " + pctText(ChroniclesContent.pathfindingCut(level)) + " shorter";
            case "survival" -> "Hazard damage " + pctText(ChroniclesContent.survivalCut(level)) + " lower";
            case "cartography" -> "Finds +" + pctText(ChroniclesContent.cartographyLoot(level))
                    + (level >= ChroniclesContent.CARTOGRAPHY_NO_MAZE ? " · never lost" : " · never lost at "
                    + ChroniclesContent.CARTOGRAPHY_NO_MAZE)
                    + (level >= ChroniclesContent.CARTOGRAPHY_HIDDEN_ROOM ? " · finds hidden rooms" : "");
            case "husbandry" -> "Rest +" + pctText(ChroniclesContent.husbandryRest(level)) + " · "
                    + ChroniclesContent.treatCap(level) + " treats a day";
            case "bonding" -> "Bond gains +" + pctText(ChroniclesContent.bondingBonus(level));
            case "elemental_studies" -> "Affinity gains +" + pctText(ChroniclesContent.studiesBonus(level));
            case "class_tactics" -> "Command gauge +" + Math.round(ChroniclesContent.tacticsGauge(level)) + "/round"
                    + (level >= ChroniclesContent.CROSS_CLASS_TACTICS ? " · cross-class techniques"
                    : " · cross-class at " + ChroniclesContent.CROSS_CLASS_TACTICS);
            case "command" -> ChroniclesContent.partySlots(level) + " company slot"
                    + (ChroniclesContent.partySlots(level) > 1 ? "s" : "")
                    + (level >= ChroniclesContent.RESERVE_COMMAND_LEVEL ? " + reserve" : "");
            default -> "";
        };
    }

    private static String pctText(double fraction) {
        double pct = fraction * 100;
        return (pct == Math.rint(pct) ? String.valueOf((long) pct) : String.format(Locale.ROOT, "%.1f", pct)) + "%";
    }

    private static String rankTitle(int rank) {
        if (rank >= 75) return "Siege Lord";
        if (rank >= 50) return "Knight Commander";
        if (rank >= 30) return "Knight Captain";
        if (rank >= 15) return "Siegeknight";
        if (rank >= 5) return "Knight Errant";
        return "Siege Squire";
    }

    private static Map<String, Object> progress(long xp, int level) {
        Map<String, Object> out = new LinkedHashMap<>();
        long floor = ChroniclesContent.xpForLevel(level);
        long next = level >= ChroniclesContent.MAX_LEVEL ? floor : ChroniclesContent.xpForLevel(level + 1);
        out.put("xp", xp);
        out.put("xpInto", xp - floor);
        out.put("xpSpan", Math.max(1, next - floor));
        return out;
    }

    private Map<String, Object> companionRow(ChroniclesState state, Companion c, Map<String, String> art) {
        Creature creature = creature(c.speciesId);
        Map<String, Object> row = speciesRow(creature, art);
        row.put("id", c.id);
        row.put("nickname", c.nickname);
        row.put("origin", c.origin);
        row.put("level", c.level);
        boolean canEvolve = creature.evolvesToId() != null;
        int cap = ChroniclesContent.levelCap(creature.stage(), canEvolve);
        row.put("levelCap", cap);
        long floor = ChroniclesContent.companionXpForLevel(c.level);
        long next = c.level >= cap ? floor : ChroniclesContent.companionXpForLevel(c.level + 1);
        row.put("xpInto", c.xp - floor);
        row.put("xpSpan", Math.max(1, next - floor));
        int bond = ChroniclesContent.bondLevelFor(c.bond);
        row.put("bond", bond);
        long bondFloor = ChroniclesContent.bondForLevel(bond);
        long bondNext = bond >= ChroniclesContent.MAX_BOND ? bondFloor : ChroniclesContent.bondForLevel(bond + 1);
        row.put("bondInto", c.bond - bondFloor);
        row.put("bondSpan", Math.max(1, bondNext - bondFloor));
        int idx = 0;
        for (int i = 0; i < ChroniclesContent.BOND_MILESTONES.length; i++) if (bond >= ChroniclesContent.BOND_MILESTONES[i]) idx = i;
        row.put("bondTitle", ChroniclesContent.BOND_MILESTONE_NAMES[idx]);
        ChroniclesContent.ClassPath path = ChroniclesContent.CLASS_PATHS.get(creature.creatureClass());
        Map<String, Object> technique = new LinkedHashMap<>();
        technique.put("name", bondTechniqueName(c));
        technique.put("text", path == null ? "" : path.bondText());
        technique.put("unlocked", bond >= 50);
        row.put("bondTechnique", technique);
        Unit unit = statUnit(creature, c.level, true, c.id);
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("health", Math.round(unit.maxHp));
        stats.put("attack", Math.round(unit.atk));
        stats.put("defense", Math.round(unit.def));
        stats.put("speed", Math.round(unit.spd));
        row.put("stats", stats);
        row.put("onExpedition", onExpedition(state, c.id));
        row.put("helping", c.id.equals(state.helperId));
        row.put("expeditions", c.expeditions);
        row.put("battlesWon", c.battlesWon);
        String day = Instant.ofEpochMilli(now()).atZone(ZoneOffset.UTC).toLocalDate().toString();
        row.put("treatsLeft", ChroniclesContent.treatCap(profLevel(state, "husbandry")) - (day.equals(c.treatsDay) ? c.treatsToday : 0));
        Map<String, Object> evolution = new LinkedHashMap<>();
        if (canEvolve) {
            Creature to = creature(creature.evolvesToId());
            evolution.put("to", to.name());
            evolution.put("toClass", to.creatureClass());
            evolution.put("level", cap);
            List<Map<String, Object>> cost = new ArrayList<>();
            boolean affordable = true;
            for (Map.Entry<String, Integer> e : evolutionCost(creature).entrySet()) {
                int have = state.inventory.getOrDefault(e.getKey(), 0);
                affordable &= have >= e.getValue();
                cost.add(Map.of("id", e.getKey(), "name", itemName(e.getKey()), "qty", e.getValue(), "have", have));
            }
            evolution.put("cost", cost);
            evolution.put("ready", c.level >= cap && affordable && !onExpedition(state, c.id));
        }
        row.put("evolution", canEvolve ? evolution : null);
        return row;
    }

    private static Map<String, Object> itemRow(String id, int qty) {
        Item item = ChroniclesContent.ITEMS.get(id);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("name", item == null ? id : item.name());
        row.put("kind", item == null ? "MATERIAL" : item.kind().name());
        row.put("blurb", item == null ? "" : item.blurb());
        row.put("qty", qty);
        if (item != null) {
            row.put("tier", item.tier());
            if (item.weaponType() != null) row.put("weaponType", item.weaponType());
            if (item.armor() > 0) row.put("armor", item.armor());
            if (item.kind() == ItemKind.FOOD) {
                row.put("bondXp", item.bondXp());
                row.put("prefers", item.prefers().stream().map(ChroniclesContent::elementLabel).sorted().toList());
            }
            if (item.lureElement() != null) row.put("lureElement", ChroniclesContent.elementLabel(item.lureElement()));
        }
        return row;
    }

    private List<Map<String, Object>> itemList(Map<String, Integer> items) {
        List<Map<String, Object>> out = new ArrayList<>();
        items.forEach((id, n) -> { if (n > 0) out.add(itemRow(id, n)); });
        return out;
    }

    private Map<String, Object> activityRow(ChroniclesState state, long now) {
        ActivityRun run = state.activity;
        if (run == null) return null;
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("kind", run.kind);
        row.put("id", run.id);
        long actionMs = actionMs(state, run);
        row.put("actionMs", actionMs);
        row.put("remainderMs", run.remainderMs);
        row.put("lastTickAt", run.lastTickAt);
        row.put("startedAt", run.startedAt);
        row.put("actions", run.actions);
        if ("craft".equals(run.kind)) {
            Recipe r = ChroniclesContent.RECIPES.get(run.id);
            row.put("name", r == null ? run.id : r.isStudy() ? recipeLabel(r) : "Crafting " + itemName(r.output()));
            row.put("skill", r == null ? "" : skillName(r.skillId()));
            row.put("output", r == null ? "" : r.isStudy()
                    ? ChroniclesContent.elementLabel(r.studyElement()) + " Affinity" : itemName(r.output()));
            row.put("left", r == null ? 0 : maxCrafts(state, r));
        } else {
            Activity a = ChroniclesContent.ACTIVITIES.get(run.id);
            row.put("name", a == null ? run.id : a.name());
            row.put("skill", a == null ? "" : skillName(a.skillId()));
            row.put("output", a == null ? "" : itemName(a.output()));
            row.put("place", a == null ? "" : a.place());
        }
        Companion helper = state.helperId.isEmpty() ? null : findCompanion(state, state.helperId);
        row.put("helper", helper == null || onExpedition(state, helper.id) ? "" : helper.nickname);
        row.put("offlineCapHours", ChroniclesContent.OFFLINE_CAP_MS / 3_600_000L);
        return row;
    }

    private Map<String, Object> expeditionRow(ChroniclesState state, long now) {
        Expedition e = state.expedition;
        if (e == null) return null;
        Route route = ChroniclesContent.ROUTES.get(e.routeId);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("routeId", e.routeId);
        row.put("route", route == null ? e.routeId : route.name());
        row.put("region", route == null ? "" : route.region());
        row.put("element", route == null ? "" : route.element().name());
        row.put("startedAt", e.startedAt);
        row.put("plannedEndAt", e.plannedEndAt);
        boolean done = now >= e.completesAt;
        // The outcome and its true end time are decided at launch; until the company is
        // home the page only learns what has already happened on the road.
        row.put("completesAt", done ? e.completesAt : e.plannedEndAt);
        row.put("done", done);
        row.put("outcome", done ? e.outcome : "");
        row.put("partyIds", e.partyIds);
        row.put("timeline", timelineList(e, now - e.startedAt));
        Technique t = e.techniqueId.isEmpty() ? null : ChroniclesContent.TECHNIQUES.get(e.techniqueId);
        row.put("technique", t == null ? "" : t.name());
        return row;
    }

    private static List<Map<String, Object>> timelineList(Expedition e, long elapsed) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (TimelineEvent ev : e.timeline) {
            if (ev.atMs > elapsed) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("at", e.startedAt + ev.atMs);
            row.put("kind", ev.kind);
            row.put("text", ev.text);
            row.put("tone", ev.tone);
            out.add(row);
        }
        return out;
    }

    private Map<String, Object> awayRow(AwayReport away) {
        if (away == null) return null;
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("fromAt", away.fromAt);
        row.put("toAt", away.toAt);
        row.put("activityName", away.activityName);
        row.put("actions", away.actions);
        row.put("capped", away.capped);
        row.put("stoppedReason", away.stoppedReason);
        row.put("items", itemList(away.items));
        row.put("consumed", itemList(away.consumed));
        List<Map<String, Object>> xp = new ArrayList<>();
        away.skillXp.forEach((s, v) -> xp.add(xpRow("skill", skillName(s), v)));
        row.put("xp", xp);
        return row;
    }

    private static String modsText(Mods m) {
        List<String> parts = new ArrayList<>();
        if (m.atk() != 0) parts.add(signed(m.atk()) + " attack");
        if (m.def() != 0) parts.add(signed(m.def()) + " defense");
        if (m.hp() != 0) parts.add(signed(m.hp()) + " health");
        if (m.spd() != 0) parts.add(signed(m.spd()) + " speed");
        return String.join(", ", parts);
    }

    private static String signed(double v) {
        long pct = Math.round(v * 100);
        return (pct > 0 ? "+" : "") + pct + "%";
    }
}
