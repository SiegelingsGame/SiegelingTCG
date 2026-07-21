package com.sieglings.keep;

import com.sieglings.keep.KeepLoreCatalog.Conversation;
import com.sieglings.keep.KeepLoreCatalog.ConversationChoice;
import com.sieglings.keep.KeepLoreCatalog.LoreEntry;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.PlayerProgressionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Server-authoritative simulation and narrative progression for My Keep. */
@Service
public class KeepService {
    public static final int TIMBER_INVENTORY_CAPACITY = 300;
    public static final int INITIAL_TIMBER = 80;
    public static final int ARCHIVE_RESTORE_COST = 60;
    public static final int WOODLOT_LEVEL_TWO_COST = 140;
    public static final long ARCHIVE_RESTORE_SECONDS = 120;
    public static final long WOODLOT_LEVEL_TWO_SECONDS = 600;
    /** A snapshot loaded after at least this long away triggers the while-you-were-away summary. */
    public static final long AWAY_SUMMARY_MIN_SECONDS = 600;
    private static final long LAST_SEEN_PERSIST_SECONDS = 120;
    private static final double AFFINITY_RATE_BONUS = 1.15;
    private static final int REQUEST_HISTORY_LIMIT = 120;
    private static final Object[] LOCKS = createLocks();

    /** Stations a resident can work, with the elements that thrive there (every live element has a home). */
    private static final Map<String, Set<String>> STATION_AFFINITIES = Map.of(
            "woodlot", Set.of("EARTH", "WIND", "WATER", "LIGHT"),
            "garden", Set.of("EARTH", "WATER", "LIGHT", "POISON"),
            "forge", Set.of("FIRE", "METAL", "ELECTRIC"),
            "cellar", Set.of("ICE", "WATER", "UNDEAD", "SHADOW"),
            "generator", Set.of("ELECTRIC", "WIND", "PSYCHIC")
    );
    private static final List<String> SLOT_STATION_IDS = List.of("woodlot", "garden", "forge", "cellar", "generator");
    private static final Map<String, String> STATION_NAMES = Map.of(
            "woodlot", "Restorative Woodlot",
            "garden", "Verdant Garden",
            "forge", "Ember Forge",
            "cellar", "Frost Cellar",
            "generator", "Storm Generator",
            "warehouse", "Warehouse"
    );

    /** Restoration project catalog: costs, timers, one-time Siegecoin/Remnant rewards, and chain gating. */
    private record ProjectDef(String id, String name, String description, int timberCost, long durationSeconds,
                              int rewardCoins, int rewardRemnants,
                              java.util.function.Predicate<KeepState> unlocked,
                              java.util.function.Predicate<KeepState> done,
                              String lockedMessage) { }

    private static final List<ProjectDef> PROJECTS = List.of(
            new ProjectDef("restore_archive", "Restore the Living Archive",
                    "Raise a shelter for recovered letters and the memories held by the land.",
                    ARCHIVE_RESTORE_COST, ARCHIVE_RESTORE_SECONDS, 40, 5,
                    state -> true, state -> state.getArchiveLevel() >= 1,
                    "The Archive is already restored."),
            new ProjectDef("woodlot_level_2", "Cultivate the Woodlot",
                    "Replace clear-cutting with a grove shaped by human and Siegeling knowledge.",
                    WOODLOT_LEVEL_TWO_COST, WOODLOT_LEVEL_TWO_SECONDS, 60, 8,
                    state -> state.getArchiveLevel() >= 1, state -> state.getWoodlotLevel() >= 2,
                    "Restore the Archive before expanding the Woodlot."),
            new ProjectDef("build_garden", "Plant the Verdant Garden",
                    "Terraced beds where Earth, Water, Light, and Poison Siegelings coax Siegecoins from the soil.",
                    90, 300, 50, 5,
                    state -> state.getArchiveLevel() >= 1, state -> stationLevel(state, "garden") >= 1,
                    "Restore the Archive before planting the Garden."),
            new ProjectDef("build_warehouse", "Raise the Warehouse",
                    "A timber store that doubles your inventory capacity.",
                    120, 480, 60, 8,
                    state -> state.getArchiveLevel() >= 1, state -> stationLevel(state, "warehouse") >= 1,
                    "Restore the Archive before raising the Warehouse."),
            new ProjectDef("build_forge", "Light the Ember Forge",
                    "Fire, Metal, and Electric Siegelings temper battlefield scrap into Remnants.",
                    160, 600, 70, 10,
                    state -> stationLevel(state, "garden") >= 1, state -> stationLevel(state, "forge") >= 1,
                    "Plant the Garden before lighting the Forge."),
            new ProjectDef("build_cellar", "Dig the Frost Cellar",
                    "Ice-cut vaults that preserve every station's harvest half again as long.",
                    180, 720, 80, 10,
                    state -> stationLevel(state, "forge") >= 1, state -> stationLevel(state, "cellar") >= 1,
                    "Light the Forge before digging the Frost Cellar."),
            new ProjectDef("build_generator", "Wake the Storm Generator",
                    "Captured storm-light that quickens production across the sanctuary.",
                    220, 900, 100, 15,
                    state -> stationLevel(state, "cellar") >= 1, state -> stationLevel(state, "generator") >= 1,
                    "Dig the Frost Cellar before waking the Generator."),
            new ProjectDef("warehouse_level_2", "Expand the Warehouse",
                    "A second hall of racks and cranes for a 1,000-timber store.",
                    200, 900, 80, 12,
                    state -> stationLevel(state, "warehouse") >= 1, state -> stationLevel(state, "warehouse") >= 2,
                    "Raise the Warehouse before expanding it.")
    );

    private final KeepStore store;
    private final PlayerProgressionService progressionService;
    private final CardDefinitionService cardDefinitionService;
    private final KeepLoreCatalog loreCatalog;
    @Autowired(required = false)
    private PlayerProgressionStore progressionStore;
    private Clock clock = Clock.systemUTC();

    public KeepService(KeepStore store,
                       PlayerProgressionService progressionService,
                       CardDefinitionService cardDefinitionService,
                       KeepLoreCatalog loreCatalog) {
        this.store = store;
        this.progressionService = progressionService;
        this.cardDefinitionService = cardDefinitionService;
        this.loreCatalog = loreCatalog;
    }

    public Map<String, Object> getSnapshot(AccountUser user) {
        synchronized (lock(user)) {
            Context context = load(user);
            KeepState state = context.state();
            Instant lastSeen = state.getLastSeenAt();
            List<String> beforeUnlocks = new ArrayList<>(state.getUnlockedLoreIds());
            String completedProject = materializeConstruction(state, context.residents(), context.now());
            if (completedProject != null) {
                grantProjectRewards(context, completedProject);
                bump(state, context.now());
            }
            long awaySeconds = lastSeen == null ? 0 : Math.max(0, Duration.between(lastSeen, context.now()).getSeconds());
            boolean persistSeen = lastSeen == null || awaySeconds >= LAST_SEEN_PERSIST_SECONDS;
            state.setLastSeenAt(context.now());
            if (completedProject != null || persistSeen) store.save(state);
            Map<String, Object> out = serialize(user, context.progression(), state, context.residents(), context.now());
            if (awaySeconds >= AWAY_SUMMARY_MIN_SECONDS) {
                out.put("awaySummary", awaySummary(state, context.residents(), context.now(),
                        awaySeconds, completedProject, newUnlockIds(state, beforeUnlocks)));
            }
            return out;
        }
    }

    private Map<String, Object> awaySummary(KeepState state, List<Resident> residents, Instant now,
                                            long awaySeconds, String completedProject, List<String> newLoreIds) {
        List<Map<String, Object>> production = new ArrayList<>();
        for (String id : producingStationIds(state)) {
            // Display estimate: what the away window produced, clipped by what is actually waiting.
            long estimate = (long) Math.floor(awaySeconds * stationRate(state, residents, id) / 60.0);
            int amount = (int) Math.min(estimate, projectedStationAvailable(state, residents, id, now));
            if (amount <= 0) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("stationId", id);
            row.put("stationName", STATION_NAMES.getOrDefault(id, id));
            row.put("resource", stationResource(id));
            row.put("amount", amount);
            production.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("awaySeconds", awaySeconds);
        out.put("production", production);
        if (completedProject != null) {
            ProjectDef def = projectById(completedProject);
            Map<String, Object> project = new LinkedHashMap<>();
            project.put("id", completedProject);
            project.put("name", def == null ? completedProject : def.name());
            project.put("rewardCoins", def == null ? 0 : def.rewardCoins());
            project.put("rewardRemnants", def == null ? 0 : def.rewardRemnants());
            out.put("completedProject", project);
        }
        if (!newLoreIds.isEmpty()) out.put("newLoreIds", newLoreIds);
        return out;
    }

    private void grantProjectRewards(Context context, String projectId) {
        ProjectDef def = projectById(projectId);
        if (def == null) return;
        KeepState state = context.state();
        state.setLifetimeCoinsEarned(state.getLifetimeCoinsEarned() + def.rewardCoins());
        state.setLifetimeRemnantsEarned(state.getLifetimeRemnantsEarned() + def.rewardRemnants());
        recordKeepStats(context.progression(), p -> {
            p.setKeepProjectsCompleted(p.getKeepProjectsCompleted() + 1);
            p.setGold(p.getGold() + def.rewardCoins());
            p.setRemnants(p.getRemnants() + def.rewardRemnants());
        });
    }

    public Map<String, Object> collect(AccountUser user, String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            materializeProduction(state, context.residents(), context.now());
            int room = Math.max(0, timberCapacity(state) - state.getTimber());
            int timberGrant = Math.min(room, state.getWoodlotStored());
            int coinsGrant = stationStoredOf(state, "garden");
            int remnantsGrant = stationStoredOf(state, "forge");
            if (timberGrant + coinsGrant + remnantsGrant <= 0) {
                throw new IllegalArgumentException(state.getWoodlotStored() > 0 && room <= 0
                        ? "Your timber store is full. Start a project before collecting more."
                        : "Nothing is ready to collect yet.");
            }
            state.setTimber(state.getTimber() + timberGrant);
            state.setWoodlotStored(state.getWoodlotStored() - timberGrant);
            if (coinsGrant > 0) {
                state.getStationStored().put("garden", 0);
                state.setLifetimeCoinsEarned(state.getLifetimeCoinsEarned() + coinsGrant);
            }
            if (remnantsGrant > 0) {
                state.getStationStored().put("forge", 0);
                state.setLifetimeRemnantsEarned(state.getLifetimeRemnantsEarned() + remnantsGrant);
            }
            state.setWoodlotCollectCount(state.getWoodlotCollectCount() + 1);
            if (state.getWoodlotCollectCount() == 1) unlock(state, "letter_forester_maren");
            if (state.getWoodlotCollectCount() >= 3) unlock(state, "memorabilia_petrified_root");
            final int timberGranted = timberGrant;
            final int coinsGranted = coinsGrant;
            final int remnantsGranted = remnantsGrant;
            recordKeepStats(context.progression(), p -> {
                p.setKeepTimberCollected(p.getKeepTimberCollected() + timberGranted);
                p.setGold(p.getGold() + coinsGranted);
                p.setRemnants(p.getRemnants() + remnantsGranted);
            });
            List<Map<String, Object>> collected = new ArrayList<>();
            if (timberGrant > 0) collected.add(Map.of("resource", "TIMBER", "amount", timberGrant));
            if (coinsGrant > 0) collected.add(Map.of("resource", "COINS", "amount", coinsGrant));
            if (remnantsGrant > 0) collected.add(Map.of("resource", "REMNANTS", "amount", remnantsGrant));
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("collected", collected);
            return extra;
        });
    }

    public Map<String, Object> inviteResident(AccountUser user, String stationId, String residentId,
                                               String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String station = stationId == null || stationId.isBlank() ? "woodlot" : stationId.trim();
            if (!SLOT_STATION_IDS.contains(station)) {
                throw new IllegalArgumentException("That station does not have a work slot.");
            }
            if (!"woodlot".equals(station) && stationLevel(state, station) < 1) {
                throw new IllegalArgumentException("Build the " + STATION_NAMES.getOrDefault(station, station) + " first.");
            }
            String normalized = residentId == null ? "" : residentId.trim();
            if (!normalized.isBlank() && context.residents().stream().noneMatch(r -> r.id().equals(normalized))) {
                throw new IllegalArgumentException("That Siegeling has not joined your collection yet.");
            }
            materializeProduction(state, context.residents(), context.now());
            // A resident works one station at a time: inviting moves them.
            if (!normalized.isBlank()) {
                if (normalized.equals(state.getWoodlotResidentId())) state.setWoodlotResidentId("");
                state.getStationResidents().values().removeIf(normalized::equals);
            }
            if ("woodlot".equals(station)) state.setWoodlotResidentId(normalized);
            else if (normalized.isBlank()) state.getStationResidents().remove(station);
            else state.getStationResidents().put(station, normalized);
            return Map.of("residentChanged", true);
        });
    }

    public Map<String, Object> startBuild(AccountUser user, String buildId,
                                          String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String id = buildId == null ? "" : buildId.trim();
            ProjectDef def = projectById(id);
            if (def == null) throw new IllegalArgumentException("Unknown construction project.");
            if (!state.getActiveConstructionId().isBlank()) {
                throw new IllegalArgumentException("Finish the current construction project first.");
            }
            if (def.done().test(state)) throw new IllegalArgumentException("That project is already complete.");
            if (!def.unlocked().test(state)) throw new IllegalArgumentException(def.lockedMessage());
            if (state.getTimber() < def.timberCost()) {
                throw new IllegalArgumentException("You need " + def.timberCost() + " timber for that project.");
            }
            materializeProduction(state, context.residents(), context.now());
            state.setTimber(state.getTimber() - def.timberCost());
            state.setActiveConstructionId(id);
            state.setConstructionStartedAt(context.now());
            state.setConstructionCompletesAt(context.now().plusSeconds(def.durationSeconds()));
            return Map.of("constructionStarted", id);
        });
    }

    public Map<String, Object> readLore(AccountUser user, String loreId,
                                        String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String id = loreId == null ? "" : loreId.trim();
            if (!state.getUnlockedLoreIds().contains(id) || loreCatalog.entry(id) == null) {
                throw new IllegalArgumentException("That Chronicle entry has not been discovered.");
            }
            boolean newlyRead = !state.getReadLoreIds().contains(id);
            addUnique(state.getReadLoreIds(), id);
            if (newlyRead) {
                recordKeepStats(context.progression(), p -> p.setKeepLoreRead(p.getKeepLoreRead() + 1));
            }
            return Map.of("readLoreId", id);
        });
    }

    public Map<String, Object> chooseDialogue(AccountUser user, String conversationId, String choiceId,
                                              String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            Conversation conversation = loreCatalog.conversation(conversationId);
            if (conversation == null || !isConversationAvailable(state, conversation)) {
                throw new IllegalArgumentException("That conversation is not available.");
            }
            ConversationChoice choice = conversation.choices().stream()
                    .filter(item -> item.id().equals(choiceId))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Unknown conversation choice."));
            addUnique(state.getCompletedConversationIds(), conversation.id());
            if (choice.flag() != null && !choice.flag().isBlank()) addUnique(state.getChoiceFlags(), choice.flag());
            state.getNpcTrust().merge(conversation.npcId(), Math.max(0, choice.relationshipDelta()), Integer::sum);
            recordKeepStats(context.progression(), p -> p.setKeepConversationsCompleted(p.getKeepConversationsCompleted() + 1));
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("npcId", conversation.npcId());
            result.put("npcName", conversation.npcName());
            result.put("response", choice.response());
            return Map.of("dialogueResult", result);
        });
    }

    public Map<String, Object> placeMemorabilia(AccountUser user, String loreId, boolean displayed,
                                                String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            LoreEntry entry = loreCatalog.entry(loreId);
            if (entry == null || !"MEMORABILIA".equalsIgnoreCase(entry.type()) || !state.getUnlockedLoreIds().contains(loreId)) {
                throw new IllegalArgumentException("That piece of memorabilia has not been recovered.");
            }
            state.getDisplayedMemorabiliaIds().remove(loreId);
            if (displayed) {
                if (state.getDisplayedMemorabiliaIds().size() >= 3) {
                    throw new IllegalArgumentException("The restored display has room for three pieces.");
                }
                state.getDisplayedMemorabiliaIds().add(loreId);
            }
            return Map.of("memorabiliaChanged", loreId);
        });
    }

    private Map<String, Object> mutate(AccountUser user, String requestId, long expectedVersion,
                                       Function<Context, Map<String, Object>> action) {
        synchronized (lock(user)) {
            Context context = load(user);
            KeepState state = context.state();
            String normalizedRequestId = normalizeRequestId(requestId);
            List<String> beforeUnlocks = new ArrayList<>(state.getUnlockedLoreIds());
            String completedProject = materializeConstruction(state, context.residents(), context.now());
            boolean completed = completedProject != null;
            if (completed) grantProjectRewards(context, completedProject);
            state.setLastSeenAt(context.now());
            if (state.getProcessedRequestIds().contains(normalizedRequestId)) {
                if (completed) {
                    bump(state, context.now());
                    store.save(state);
                }
                Map<String, Object> out = serialize(user, context.progression(), state, context.residents(), context.now());
                addNewUnlocks(out, state, beforeUnlocks);
                return out;
            }
            if (expectedVersion >= 0 && state.getVersion() != expectedVersion) {
                if (completed) {
                    bump(state, context.now());
                    store.save(state);
                }
                throw new StaleKeepStateException("My Keep changed on another screen. Refreshing will preserve the newer state.");
            }
            Map<String, Object> extra;
            try {
                extra = action.apply(context);
            } catch (RuntimeException ex) {
                if (completed) {
                    bump(state, context.now());
                    store.save(state);
                }
                throw ex;
            }
            rememberRequest(state, normalizedRequestId);
            bump(state, context.now());
            store.save(state);
            Map<String, Object> out = serialize(user, context.progression(), state, context.residents(), context.now());
            addNewUnlocks(out, state, beforeUnlocks);
            if (extra != null) out.putAll(extra);
            return out;
        }
    }

    private Context load(AccountUser user) {
        if (user == null || user.getId() == null || user.getId().isBlank()) {
            throw new IllegalArgumentException("Sign in to begin My Keep.");
        }
        PlayerProgressionEntity progression = progressionService.getOrCreate(user);
        if (progression.getStarterPackId() == null || progression.getStarterPackId().isBlank()) {
            throw new IllegalArgumentException("Choose a starter pack before founding My Keep.");
        }
        Instant now = clock.instant();
        List<Resident> residents = residents(progression);
        KeepState state = store.findByUserId(user.getId()).orElseGet(() -> store.save(newState(user.getId(), now)));
        repairDefaults(state, now);
        if (!progression.isKeepFounded()) {
            recordKeepStats(progression, p -> p.setKeepFounded(true));
        }
        return new Context(progression, state, residents, now);
    }

    private KeepState newState(String userId, Instant now) {
        KeepState state = new KeepState();
        state.setUserId(userId);
        state.setVersion(1);
        state.setTimber(INITIAL_TIMBER);
        state.setWoodlotLevel(1);
        state.setWoodlotLastAccruedAt(now.minus(Duration.ofMinutes(15)));
        state.setCreatedAt(now);
        state.setUpdatedAt(now);
        state.setUnlockedLoreIds(List.of("charter_three_promises"));
        return state;
    }

    private void repairDefaults(KeepState state, Instant now) {
        if (state.getWoodlotLastAccruedAt() == null) state.setWoodlotLastAccruedAt(now);
        if (state.getCreatedAt() == null) state.setCreatedAt(now);
        if (!state.getUnlockedLoreIds().contains("charter_three_promises")) unlock(state, "charter_three_promises");
    }

    private String materializeConstruction(KeepState state, List<Resident> residents, Instant now) {
        String id = state.getActiveConstructionId();
        Instant completesAt = state.getConstructionCompletesAt();
        if (id == null || id.isBlank() || completesAt == null || now.isBefore(completesAt)) return null;
        // Accrue at the old rates up to completion, apply the change, then accrue the rest.
        materializeProduction(state, residents, completesAt);
        switch (id) {
            case "woodlot_level_2" -> {
                state.setWoodlotLevel(2);
                unlock(state, "letter_green_covenant");
            }
            case "restore_archive" -> {
                state.setArchiveLevel(1);
                unlock(state, "chronicle_living_elements");
                unlock(state, "letter_pre_covenant_watch");
            }
            case "build_garden" -> state.getStationLevels().put("garden", 1);
            case "build_forge" -> state.getStationLevels().put("forge", 1);
            case "build_cellar" -> state.getStationLevels().put("cellar", 1);
            case "build_generator" -> state.getStationLevels().put("generator", 1);
            case "build_warehouse" -> state.getStationLevels().put("warehouse", 1);
            case "warehouse_level_2" -> state.getStationLevels().put("warehouse", 2);
            default -> { }
        }
        materializeProduction(state, residents, now);
        state.setActiveConstructionId("");
        state.setConstructionStartedAt(null);
        state.setConstructionCompletesAt(null);
        return id;
    }

    private void materializeProduction(KeepState state, List<Resident> residents, Instant at) {
        Instant last = state.getWoodlotLastAccruedAt();
        if (last == null) {
            state.setWoodlotLastAccruedAt(at);
            return;
        }
        if (!at.isAfter(last)) return;
        long seconds = Duration.between(last, at).getSeconds();
        for (String id : producingStationIds(state)) accrueStation(state, residents, id, seconds);
        state.setWoodlotLastAccruedAt(at);
    }

    private void accrueStation(KeepState state, List<Resident> residents, String stationId, long seconds) {
        int capacity = stationStorageCapacity(state, residents, stationId);
        int stored = stationStoredOf(state, stationId);
        int room = Math.max(0, capacity - stored);
        double exact = seconds * stationRate(state, residents, stationId) / 60.0 + stationRemainderOf(state, stationId);
        long produced = Math.max(0, (long) Math.floor(exact + 1e-9));
        int added = (int) Math.min(room, produced);
        double remainder = produced >= room ? 0 : exact - produced;
        if ("woodlot".equals(stationId)) {
            state.setWoodlotStored(stored + added);
            state.setWoodlotProductionRemainder(remainder);
        } else {
            state.getStationStored().put(stationId, stored + added);
            state.getStationRemainders().put(stationId, Math.max(0, Math.min(0.999999999, remainder)));
        }
    }

    private int projectedStationAvailable(KeepState state, List<Resident> residents, String stationId, Instant now) {
        Instant last = state.getWoodlotLastAccruedAt();
        long seconds = last == null || !now.isAfter(last) ? 0 : Duration.between(last, now).getSeconds();
        long produced = Math.max(0, (long) Math.floor(
                seconds * stationRate(state, residents, stationId) / 60.0 + stationRemainderOf(state, stationId) + 1e-9));
        return (int) Math.min(stationStorageCapacity(state, residents, stationId),
                stationStoredOf(state, stationId) + produced);
    }

    private List<String> producingStationIds(KeepState state) {
        List<String> out = new ArrayList<>();
        out.add("woodlot");
        if (stationLevel(state, "garden") >= 1) out.add("garden");
        if (stationLevel(state, "forge") >= 1) out.add("forge");
        return out;
    }

    private static String stationResource(String stationId) {
        return switch (stationId) {
            case "garden" -> "COINS";
            case "forge" -> "REMNANTS";
            default -> "TIMBER";
        };
    }

    private double stationRate(KeepState state, List<Resident> residents, String stationId) {
        double base = switch (stationId) {
            case "woodlot" -> state.getWoodlotLevel() >= 2 ? 2.0 : 1.0;
            case "garden" -> stationLevel(state, "garden") >= 1 ? 0.10 : 0;
            case "forge" -> stationLevel(state, "forge") >= 1 ? 0.05 : 0;
            default -> 0;
        };
        if (base <= 0) return 0;
        if (stationLevel(state, "generator") >= 1) base *= generatorBoost(state, residents);
        Resident worker = residentAt(state, residents, stationId);
        if (worker != null && worker.affinities().contains(stationId)) base *= AFFINITY_RATE_BONUS;
        return base;
    }

    private int stationStorageCapacity(KeepState state, List<Resident> residents, String stationId) {
        int base = switch (stationId) {
            case "woodlot" -> state.getWoodlotLevel() >= 2 ? 360 : 120;
            case "garden" -> 60;
            case "forge" -> 30;
            default -> 0;
        };
        return (int) Math.round(base * cellarBoost(state, residents));
    }

    /** Frost Cellar preserves harvests: +50% station storage, +75% with an affinity keeper. */
    private double cellarBoost(KeepState state, List<Resident> residents) {
        if (stationLevel(state, "cellar") < 1) return 1.0;
        Resident keeper = residentAt(state, residents, "cellar");
        return keeper != null && keeper.affinities().contains("cellar") ? 1.75 : 1.5;
    }

    /** Storm Generator quickens production: +10% rates, +15% with an affinity tender. */
    private double generatorBoost(KeepState state, List<Resident> residents) {
        Resident tender = residentAt(state, residents, "generator");
        return tender != null && tender.affinities().contains("generator") ? 1.15 : 1.10;
    }

    private int timberCapacity(KeepState state) {
        return switch (stationLevel(state, "warehouse")) {
            case 0 -> TIMBER_INVENTORY_CAPACITY;
            case 1 -> 600;
            default -> 1000;
        };
    }

    private static int stationLevel(KeepState state, String stationId) {
        return Math.max(0, state.getStationLevels().getOrDefault(stationId, 0));
    }

    private int stationStoredOf(KeepState state, String stationId) {
        return "woodlot".equals(stationId) ? state.getWoodlotStored()
                : Math.max(0, state.getStationStored().getOrDefault(stationId, 0));
    }

    private double stationRemainderOf(KeepState state, String stationId) {
        return "woodlot".equals(stationId) ? state.getWoodlotProductionRemainder()
                : Math.max(0, state.getStationRemainders().getOrDefault(stationId, 0.0));
    }

    private String stationResidentId(KeepState state, String stationId) {
        return "woodlot".equals(stationId) ? state.getWoodlotResidentId()
                : state.getStationResidents().getOrDefault(stationId, "");
    }

    private Resident residentAt(KeepState state, List<Resident> residents, String stationId) {
        String id = stationResidentId(state, stationId);
        if (id == null || id.isBlank()) return null;
        return residents.stream().filter(r -> r.id().equals(id)).findFirst().orElse(null);
    }

    private ProjectDef projectById(String id) {
        return PROJECTS.stream().filter(def -> def.id().equals(id)).findFirst().orElse(null);
    }

    private static List<String> newUnlockIds(KeepState state, List<String> beforeUnlocks) {
        return state.getUnlockedLoreIds().stream().filter(id -> !beforeUnlocks.contains(id)).toList();
    }

    private List<Resident> residents(PlayerProgressionEntity progression) {
        Map<String, Card> cardsById = cardDefinitionService.getDeckBuilderCatalog().stream()
                .collect(Collectors.toMap(Card::getId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        Map<String, SieglingCard> roots = new LinkedHashMap<>();
        for (Map.Entry<String, Integer> owned : progression.getOwnedCards().entrySet()) {
            if (owned.getValue() == null || owned.getValue() <= 0) continue;
            Card card = cardsById.get(owned.getKey());
            if (!(card instanceof SieglingCard siegling)) continue;
            SieglingCard root = rootOf(siegling, cardsById);
            roots.putIfAbsent(root.getId(), root);
        }
        List<Resident> out = new ArrayList<>();
        for (SieglingCard card : roots.values()) {
            String element = card.getElement() == null ? "NEUTRAL" : card.getElement().name();
            String rarity = card.getRarity() == null ? "COMMON" : card.getRarity().name();
            Set<String> affinities = new LinkedHashSet<>();
            for (String stationId : SLOT_STATION_IDS) {
                if (STATION_AFFINITIES.getOrDefault(stationId, Set.of()).contains(element)) affinities.add(stationId);
            }
            out.add(new Resident(card.getId(), card.getName(), element, rarity,
                    card.getCardArtUrl() == null ? "" : card.getCardArtUrl(), affinities.contains("woodlot"), affinities));
        }
        out.sort((a, b) -> a.name().compareToIgnoreCase(b.name()));
        return out;
    }

    private SieglingCard rootOf(SieglingCard card, Map<String, Card> cardsById) {
        SieglingCard current = card;
        Set<String> visited = new LinkedHashSet<>();
        while (current.getEvolvesFromId() != null && !current.getEvolvesFromId().isBlank() && visited.add(current.getId())) {
            Card parent = cardsById.get(current.getEvolvesFromId());
            if (!(parent instanceof SieglingCard parentSiegling)) break;
            current = parentSiegling;
        }
        return current;
    }

    private Map<String, Object> serialize(AccountUser user, PlayerProgressionEntity progression,
                                          KeepState state, List<Resident> residents, Instant now) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("serverTime", now.toString());
        out.put("stateVersion", state.getVersion());
        out.put("keepName", (user.getDisplayName() == null || user.getDisplayName().isBlank() ? "The Keeper" : user.getDisplayName()) + "'s Keep");
        out.put("chapter", Map.of("id", "wounded_ground", "number", 1, "title", "The Wounded Ground"));
        out.put("resources", Map.of(
                "timber", state.getTimber(),
                "timberCapacity", timberCapacity(state)
        ));

        Map<String, Object> station = serializeStation(state, residents, "woodlot", now);
        station.put("collectCount", state.getWoodlotCollectCount());
        out.put("station", station);
        List<Map<String, Object>> stations = new ArrayList<>();
        for (String id : List.of("woodlot", "garden", "forge", "cellar", "generator", "warehouse")) {
            stations.add(serializeStation(state, residents, id, now));
        }
        out.put("stations", stations);
        out.put("keepEarnings", Map.of(
                "coins", state.getLifetimeCoinsEarned(),
                "remnants", state.getLifetimeRemnantsEarned()
        ));

        List<Map<String, Object>> residentPayload = residents.stream()
                .map(resident -> serializeResident(state, resident)).toList();
        out.put("residents", residentPayload);
        out.put("buildings", buildings(state));
        out.put("buildOptions", buildOptions(state));
        out.put("activeConstruction", activeConstruction(state, now));
        Map<String, Object> visual = new LinkedHashMap<>();
        visual.put("archiveRestored", state.getArchiveLevel() > 0);
        visual.put("woodlotLevel", state.getWoodlotLevel());
        visual.put("healingStage", Math.min(3, state.getWoodlotCollectCount() + state.getArchiveLevel()));
        visual.put("gardenBuilt", stationLevel(state, "garden") >= 1);
        visual.put("forgeBuilt", stationLevel(state, "forge") >= 1);
        visual.put("cellarBuilt", stationLevel(state, "cellar") >= 1);
        visual.put("generatorBuilt", stationLevel(state, "generator") >= 1);
        visual.put("warehouseLevel", stationLevel(state, "warehouse"));
        out.put("visualState", visual);

        List<Map<String, Object>> lore = new ArrayList<>();
        for (LoreEntry entry : loreCatalog.entries(state.getUnlockedLoreIds())) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", entry.id());
            item.put("type", entry.type());
            item.put("title", entry.title());
            item.put("source", entry.source());
            item.put("perspective", entry.perspective());
            item.put("era", entry.era());
            item.put("summary", entry.summary());
            item.put("body", entry.body());
            item.put("artKey", entry.artKey() == null ? "" : entry.artKey());
            item.put("read", state.getReadLoreIds().contains(entry.id()));
            item.put("displayed", state.getDisplayedMemorabiliaIds().contains(entry.id()));
            lore.add(item);
        }
        out.put("lore", lore);
        out.put("unreadLoreCount", lore.stream().filter(item -> !Boolean.TRUE.equals(item.get("read"))).count());
        out.put("availableConversations", availableConversations(state));
        out.put("relationships", relationships(state));
        out.put("choiceFlags", state.getChoiceFlags());
        out.put("progressionReady", progression.getStarterPackId() != null);
        return out;
    }

    private Map<String, Object> serializeStation(KeepState state, List<Resident> residents, String id, Instant now) {
        boolean built = "woodlot".equals(id) || stationLevel(state, id) >= 1;
        int level = "woodlot".equals(id) ? state.getWoodlotLevel() : stationLevel(state, id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", STATION_NAMES.getOrDefault(id, id));
        out.put("built", built);
        out.put("level", level);
        out.put("hasSlot", SLOT_STATION_IDS.contains(id));
        out.put("affinityElements", new ArrayList<>(STATION_AFFINITIES.getOrDefault(id, Set.of())));
        if (SLOT_STATION_IDS.contains(id)) {
            Resident worker = residentAt(state, residents, id);
            out.put("residentId", stationResidentId(state, id));
            out.put("resident", worker == null ? null : serializeResident(state, worker));
        }
        switch (id) {
            case "woodlot", "garden", "forge" -> {
                out.put("resource", stationResource(id));
                out.put("available", built ? projectedStationAvailable(state, residents, id, now) : 0);
                out.put("storageCapacity", built ? stationStorageCapacity(state, residents, id) : 0);
                out.put("ratePerMinute", built ? stationRate(state, residents, id) : 0);
            }
            case "cellar" -> out.put("effect", built
                    ? "+" + Math.round((cellarBoost(state, residents) - 1) * 100) + "% station storage"
                    : "Preserves station harvests");
            case "generator" -> out.put("effect", built
                    ? "+" + Math.round((generatorBoost(state, residents) - 1) * 100) + "% production speed"
                    : "Quickens all production");
            case "warehouse" -> out.put("effect", built
                    ? "Timber capacity " + timberCapacity(state)
                    : "Expands timber storage");
            default -> { }
        }
        return out;
    }

    private List<Map<String, Object>> buildings(KeepState state) {
        List<Map<String, Object>> out = new ArrayList<>();
        out.add(building("great_hall", "Covenant Hall", 1, "COMPLETE"));
        out.add(building("woodlot", "Restorative Woodlot", state.getWoodlotLevel(),
                "woodlot_level_2".equals(state.getActiveConstructionId()) ? "CONSTRUCTING" : "COMPLETE"));
        out.add(building("archive", state.getArchiveLevel() > 0 ? "Living Archive" : "Ruined Archive", state.getArchiveLevel(),
                "restore_archive".equals(state.getActiveConstructionId()) ? "CONSTRUCTING"
                        : state.getArchiveLevel() > 0 ? "COMPLETE" : "RUINED"));
        for (String id : List.of("garden", "forge", "cellar", "generator", "warehouse")) {
            int level = stationLevel(state, id);
            String constructing = state.getActiveConstructionId();
            boolean building = constructing.equals("build_" + id)
                    || ("warehouse".equals(id) && "warehouse_level_2".equals(constructing));
            out.add(building(id, STATION_NAMES.getOrDefault(id, id), level,
                    building ? "CONSTRUCTING" : level >= 1 ? "COMPLETE" : "NOT_BUILT"));
        }
        return out;
    }

    private Map<String, Object> building(String id, String name, int level, String status) {
        return Map.of("id", id, "name", name, "level", level, "status", status);
    }

    private List<Map<String, Object>> buildOptions(KeepState state) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ProjectDef def : PROJECTS) {
            if (def.done().test(state) || !def.unlocked().test(state)) continue;
            Map<String, Object> option = new LinkedHashMap<>();
            option.put("id", def.id());
            option.put("name", def.name());
            option.put("timberCost", def.timberCost());
            option.put("durationSeconds", def.durationSeconds());
            option.put("description", def.description());
            option.put("rewardCoins", def.rewardCoins());
            option.put("rewardRemnants", def.rewardRemnants());
            option.put("canStart", state.getActiveConstructionId().isBlank() && state.getTimber() >= def.timberCost());
            out.add(option);
        }
        return out;
    }

    private Map<String, Object> activeConstruction(KeepState state, Instant now) {
        if (state.getActiveConstructionId().isBlank() || state.getConstructionCompletesAt() == null) return null;
        long total = state.getConstructionStartedAt() == null ? 1
                : Math.max(1, Duration.between(state.getConstructionStartedAt(), state.getConstructionCompletesAt()).getSeconds());
        long remaining = Math.max(0, Duration.between(now, state.getConstructionCompletesAt()).getSeconds());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", state.getActiveConstructionId());
        out.put("startedAt", state.getConstructionStartedAt() == null ? null : state.getConstructionStartedAt().toString());
        out.put("completesAt", state.getConstructionCompletesAt().toString());
        out.put("remainingSeconds", remaining);
        out.put("progress", Math.max(0, Math.min(1, (total - remaining) / (double) total)));
        return out;
    }

    private Map<String, Object> serializeResident(KeepState state, Resident resident) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", resident.id());
        out.put("name", resident.name());
        out.put("element", resident.element());
        out.put("rarity", resident.rarity());
        out.put("artUrl", resident.artUrl());
        out.put("preferredAtWoodlot", resident.preferredAtWoodlot());
        out.put("affinities", new ArrayList<>(resident.affinities()));
        out.put("workingAt", workingStation(state, resident.id()));
        out.put("affinityLabel", resident.affinities().isEmpty()
                ? "Willing helper · normal rate"
                : "Thrives at " + resident.affinities().stream()
                        .map(id -> STATION_NAMES.getOrDefault(id, id).replace("Restorative ", "").replace("Verdant ", "")
                                .replace("Ember ", "").replace("Frost ", "").replace("Storm ", ""))
                        .collect(Collectors.joining(", ")) + " · +15%");
        return out;
    }

    private String workingStation(KeepState state, String residentId) {
        if (residentId == null || residentId.isBlank()) return "";
        if (residentId.equals(state.getWoodlotResidentId())) return "woodlot";
        return state.getStationResidents().entrySet().stream()
                .filter(entry -> residentId.equals(entry.getValue()))
                .map(Map.Entry::getKey)
                .findFirst().orElse("");
    }

    private List<Map<String, Object>> availableConversations(KeepState state) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Conversation conversation : loreCatalog.allConversations()) {
            if (!isConversationAvailable(state, conversation)) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", conversation.id());
            item.put("npcId", conversation.npcId());
            item.put("npcName", conversation.npcName());
            item.put("npcRole", conversation.npcRole());
            item.put("kicker", conversation.kicker());
            item.put("prompt", conversation.prompt());
            item.put("choices", conversation.choices().stream().map(choice -> Map.of(
                    "id", choice.id(), "label", choice.label()
            )).toList());
            out.add(item);
        }
        return out;
    }

    private boolean isConversationAvailable(KeepState state, Conversation conversation) {
        return !state.getCompletedConversationIds().contains(conversation.id())
                && state.getUnlockedLoreIds().containsAll(conversation.requiresLoreIds());
    }

    private List<Map<String, Object>> relationships(KeepState state) {
        Map<String, String> names = Map.of(
                "steward_elara", "Steward Elara Venn",
                "archivist_pell", "Archivist Nara Pell"
        );
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : state.getNpcTrust().entrySet()) {
            int trust = Math.max(0, entry.getValue());
            String stage = trust >= 7 ? "Bonded" : trust >= 3 ? "Trusted" : trust >= 1 ? "Acquainted" : "Wary";
            out.add(Map.of("npcId", entry.getKey(), "npcName", names.getOrDefault(entry.getKey(), entry.getKey()), "stage", stage));
        }
        return out;
    }

    /** Lifetime keep stats power keep achievements and titles; recording is best-effort and must never fail a keep action. */
    private void recordKeepStats(PlayerProgressionEntity progression, Consumer<PlayerProgressionEntity> update) {
        if (progression == null) return;
        try {
            update.accept(progression);
            progression.setUpdatedAt(clock.instant());
            if (progressionStore != null) progressionStore.save(progression);
        } catch (Exception ignored) {
            // the keep action stands either way
        }
    }

    private void unlock(KeepState state, String loreId) {
        if (loreCatalog.entry(loreId) == null) throw new IllegalStateException("Unknown Keep lore id: " + loreId);
        addUnique(state.getUnlockedLoreIds(), loreId);
    }

    private void rememberRequest(KeepState state, String requestId) {
        String id = normalizeRequestId(requestId);
        state.getProcessedRequestIds().remove(id);
        state.getProcessedRequestIds().add(id);
        while (state.getProcessedRequestIds().size() > REQUEST_HISTORY_LIMIT) state.getProcessedRequestIds().remove(0);
    }

    private void addNewUnlocks(Map<String, Object> out, KeepState state, List<String> beforeUnlocks) {
        List<String> newUnlocks = state.getUnlockedLoreIds().stream().filter(id -> !beforeUnlocks.contains(id)).toList();
        if (!newUnlocks.isEmpty()) out.put("newLoreUnlocks", newUnlocks);
    }

    private String normalizeRequestId(String requestId) {
        String id = requestId == null ? "" : requestId.trim();
        if (id.isBlank() || id.length() > 100) throw new IllegalArgumentException("A valid request id is required.");
        return id;
    }

    private void bump(KeepState state, Instant now) {
        state.setVersion(state.getVersion() + 1);
        state.setUpdatedAt(now);
    }

    private Object lock(AccountUser user) {
        String id = user == null || user.getId() == null ? "" : user.getId();
        return LOCKS[Math.floorMod(id.toLowerCase(Locale.ROOT).hashCode(), LOCKS.length)];
    }

    private static Object[] createLocks() {
        Object[] locks = new Object[64];
        for (int i = 0; i < locks.length; i++) locks[i] = new Object();
        return locks;
    }

    private static void addUnique(List<String> target, String value) {
        if (value != null && !value.isBlank() && !target.contains(value)) target.add(value);
    }

    void setClock(Clock clock) {
        this.clock = clock == null ? Clock.systemUTC() : clock;
    }

    private record Resident(String id, String name, String element, String rarity, String artUrl,
                            boolean preferredAtWoodlot, Set<String> affinities) { }
    private record Context(PlayerProgressionEntity progression, KeepState state, List<Resident> residents, Instant now) { }

    public static class StaleKeepStateException extends IllegalStateException {
        public StaleKeepStateException(String message) { super(message); }
    }
}
