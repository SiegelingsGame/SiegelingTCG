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
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.IsoFields;
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
    public static final int STOREHOUSE_LEVEL_ONE_COST = 180;
    public static final int GARDEN_LEVEL_ONE_COST = 160;
    public static final int FORGE_LEVEL_ONE_COST = 220;
    public static final int FRIDGE_LEVEL_ONE_COST = 200;
    public static final int GENERATOR_LEVEL_ONE_COST = 260;
    public static final long STOREHOUSE_LEVEL_ONE_SECONDS = 1_800;
    public static final long GARDEN_LEVEL_ONE_SECONDS = 3_600;
    public static final long FORGE_LEVEL_ONE_SECONDS = 7_200;
    public static final long FRIDGE_LEVEL_ONE_SECONDS = 10_800;
    public static final long GENERATOR_LEVEL_ONE_SECONDS = 14_400;
    private static final Duration OFFLINE_REPORT_THRESHOLD = Duration.ofMinutes(5);
    private static final Duration TRIBUTE_COOLDOWN = Duration.ofDays(7);
    private static final int REQUEST_HISTORY_LIMIT = 120;
    private static final Object[] LOCKS = createLocks();
    private static final Map<String, FacilityDefinition> FACILITIES = createFacilities();
    private static final Map<String, CraftRecipe> RECIPES = createRecipes();

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
            Instant awaySince = state.getLastVisitedAt();
            List<String> beforeUnlocks = new ArrayList<>(state.getUnlockedLoreIds());
            int timberBefore = state.getWoodlotStored();
            Map<String, Integer> facilityBefore = new LinkedHashMap<>(state.getFacilityStored());
            String completingProject = state.getActiveConstructionId();
            boolean completed = materializeConstruction(state, context.residents(), context.now());
            boolean returning = awaySince != null
                    && Duration.between(awaySince, context.now()).compareTo(OFFLINE_REPORT_THRESHOLD) >= 0;
            boolean produced = completed || (returning && materializeAllProduction(state, context.residents(), context.now()));
            Map<String, Object> offlineReport = offlineReport(state, awaySince, context.now(), timberBefore,
                    facilityBefore, completed ? completingProject : "", beforeUnlocks);
            state.setLastVisitedAt(context.now());
            if (completed || produced) {
                bump(context.state(), context.now());
                store.save(state);
            } else {
                store.save(state);
            }
            if (completed) {
                recordKeepStats(context.progression(), p -> p.setKeepProjectsCompleted(p.getKeepProjectsCompleted() + 1));
            }
            return serialize(user, context.progression(), state, context.residents(), context.now(), offlineReport);
        }
    }

    public Map<String, Object> collect(AccountUser user, String requestId, long expectedVersion) {
        return collect(user, "woodlot", requestId, expectedVersion);
    }

    public Map<String, Object> collect(AccountUser user, String stationId, String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String id = normalizeStationId(stationId);
            if (!"woodlot".equals(id)) return collectEssenceStation(state, context, id);
            int room = Math.max(0, timberInventoryCapacity(state) - state.getTimber());
            int grant = Math.min(room, projectedWoodlotAvailable(state, context.residents(), context.now()));
            if (grant <= 0) {
                throw new IllegalArgumentException(room <= 0
                        ? "Your timber store is full. Start a project before collecting more."
                        : "The Woodlot has not produced any timber yet.");
            }
            materializeProduction(state, context.residents(), context.now());
            grant = Math.min(room, state.getWoodlotStored());
            state.setTimber(state.getTimber() + grant);
            state.setWoodlotStored(state.getWoodlotStored() - grant);
            state.setWoodlotCollectCount(state.getWoodlotCollectCount() + 1);
            if (state.getWoodlotCollectCount() == 1) unlock(state, "letter_forester_maren");
            if (state.getWoodlotCollectCount() >= 3) unlock(state, "memorabilia_petrified_root");
            final int granted = grant;
            recordKeepStats(context.progression(), p -> p.setKeepTimberCollected(p.getKeepTimberCollected() + granted));
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("collected", Map.of("resource", "TIMBER", "amount", grant));
            return extra;
        });
    }

    public Map<String, Object> inviteResident(AccountUser user, String residentId,
                                               String requestId, long expectedVersion) {
        return inviteResident(user, "woodlot", residentId, requestId, expectedVersion);
    }

    public Map<String, Object> inviteResident(AccountUser user, String stationId, String residentId,
                                               String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String id = normalizeStationId(stationId);
            if (!stationAvailable(state, id)) throw new IllegalArgumentException("Build that facility before assigning a resident.");
            String normalized = residentId == null ? "" : residentId.trim();
            if (!normalized.isBlank() && context.residents().stream().noneMatch(r -> r.id().equals(normalized))) {
                throw new IllegalArgumentException("That Siegeling has not joined your collection yet.");
            }
            materializeAllProduction(state, context.residents(), context.now());
            if (!normalized.isBlank()) clearResidentAssignment(state, normalized);
            setStationResidentId(state, id, normalized);
            return Map.of("residentChanged", true, "stationId", id);
        });
    }

    public Map<String, Object> startBuild(AccountUser user, String buildId,
                                          String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String id = buildId == null ? "" : buildId.trim();
            if (!state.getActiveConstructionId().isBlank()) {
                throw new IllegalArgumentException("Finish the current construction project first.");
            }
            BuildProject project = buildProject(id);
            if (project == null) throw new IllegalArgumentException("Unknown construction project.");
            validateBuild(state, project);
            if (state.getTimber() < project.timberCost()) {
                throw new IllegalArgumentException("You need " + project.timberCost() + " timber for that project.");
            }
            requireMaterials(state, project.materialCosts(), "project");
            materializeAllProduction(state, context.residents(), context.now());
            state.setTimber(state.getTimber() - project.timberCost());
            spendMaterials(state, project.materialCosts());
            state.setActiveConstructionId(id);
            state.setConstructionStartedAt(context.now());
            state.setConstructionCompletesAt(context.now().plusSeconds(project.durationSeconds()));
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

    public Map<String, Object> craft(AccountUser user, String recipeId,
                                     String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String id = recipeId == null ? "" : recipeId.trim();
            CraftRecipe recipe = RECIPES.get(id);
            if (recipe == null) throw new IllegalArgumentException("Unknown Keep recipe.");
            if (!recipeAvailable(state, recipe)) throw new IllegalArgumentException("Build the required workshop before crafting that item.");
            if (craftedCount(state, id) > 0 && !recipe.repeatable()) {
                throw new IllegalArgumentException("That Keep item has already been crafted.");
            }
            requireMaterials(state, recipe.materialCosts(), "recipe");
            spendMaterials(state, recipe.materialCosts());
            state.getCraftedItemCounts().merge(id, 1, Integer::sum);
            state.setCraftCount(state.getCraftCount() + 1);
            return Map.of("crafted", Map.of("id", id, "name", recipe.name(), "type", recipe.type()));
        });
    }

    public Map<String, Object> placeDecoration(AccountUser user, String roomId, String decorationId,
                                                boolean displayed, String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String room = normalizeStationId(roomId);
            String id = decorationId == null ? "" : decorationId.trim();
            CraftRecipe recipe = RECIPES.get(id);
            if (recipe == null || !"DECORATION".equals(recipe.type()) || !room.equals(recipe.roomId())) {
                throw new IllegalArgumentException("That decoration does not belong in this room.");
            }
            if (craftedCount(state, id) < 1) throw new IllegalArgumentException("Craft that decoration before placing it.");
            if (displayed) state.getPlacedDecorations().put(room, id);
            else if (id.equals(state.getPlacedDecorations().get(room))) state.getPlacedDecorations().remove(room);
            return Map.of("decorationChanged", id, "roomId", room, "displayed", displayed);
        });
    }

    public Map<String, Object> claimReward(AccountUser user, String rewardId,
                                           String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String id = rewardId == null ? "" : rewardId.trim();
            int gold;
            int remnants;
            String claimKey = id;
            if ("first_harvest".equals(id)) {
                if (state.getEssenceCollectCount() < 1) throw new IllegalArgumentException("Complete an elemental harvest first.");
                gold = 100;
                remnants = 25;
            } else if ("elemental_quarter".equals(id)) {
                if (!allFacilitiesAtLeast(state, 1)) throw new IllegalArgumentException("Complete all four elemental facilities first.");
                gold = 250;
                remnants = 75;
            } else if ("masterwork_keep".equals(id)) {
                if (state.getStorehouseLevel() < 2 || !allFacilitiesAtLeast(state, 2)) {
                    throw new IllegalArgumentException("Raise every elemental facility and the Storehouse to level 2 first.");
                }
                gold = 500;
                remnants = 150;
            } else if ("weekly_tribute".equals(id)) {
                if (facilityLevel(state, "generator") < 1) throw new IllegalArgumentException("Build the Elemental Generator first.");
                Instant next = nextTributeAt(state);
                if (next != null && context.now().isBefore(next)) throw new IllegalArgumentException("The next sanctuary tribute is not ready yet.");
                int totalLevels = state.getStorehouseLevel() + state.getWoodlotLevel()
                        + FACILITIES.keySet().stream().mapToInt(key -> facilityLevel(state, key)).sum();
                gold = 150 + totalLevels * 35;
                remnants = 25 + totalLevels * 8;
                claimKey = "weekly_tribute:" + weekKey(context.now());
                state.setLastTributeClaimedAt(context.now());
            } else {
                throw new IllegalArgumentException("Unknown sanctuary reward.");
            }
            PlayerProgressionEntity progression = context.progression();
            if (progression.getKeepRewardClaimIds().contains(claimKey)) {
                throw new IllegalArgumentException("That sanctuary reward has already been claimed.");
            }
            progression.setGold(progression.getGold() + gold);
            progression.setRemnants(progression.getRemnants() + remnants);
            progression.getKeepRewardClaimIds().add(claimKey);
            progression.setUpdatedAt(context.now());
            if (progressionStore != null) progressionStore.save(progression);
            Map<String, Object> reward = new LinkedHashMap<>();
            reward.put("id", id);
            reward.put("gold", gold);
            reward.put("remnants", remnants);
            reward.put("goldBalance", progression.getGold());
            reward.put("remnantsBalance", progression.getRemnants());
            return Map.of("rewardClaimed", reward);
        });
    }

    private Map<String, Object> mutate(AccountUser user, String requestId, long expectedVersion,
                                       Function<Context, Map<String, Object>> action) {
        synchronized (lock(user)) {
            Context context = load(user);
            KeepState state = context.state();
            String normalizedRequestId = normalizeRequestId(requestId);
            List<String> beforeUnlocks = new ArrayList<>(state.getUnlockedLoreIds());
            boolean completed = materializeConstruction(state, context.residents(), context.now());
            boolean produced = materializeAllProduction(state, context.residents(), context.now());
            if (completed) {
                recordKeepStats(context.progression(), p -> p.setKeepProjectsCompleted(p.getKeepProjectsCompleted() + 1));
            }
            if (state.getProcessedRequestIds().contains(normalizedRequestId)) {
                if (completed || produced) {
                    bump(state, context.now());
                    store.save(state);
                }
                Map<String, Object> out = serialize(user, context.progression(), state, context.residents(), context.now());
                addNewUnlocks(out, state, beforeUnlocks);
                return out;
            }
            if (expectedVersion >= 0 && state.getVersion() != expectedVersion) {
                if (completed || produced) {
                    bump(state, context.now());
                    store.save(state);
                }
                throw new StaleKeepStateException("My Keep changed on another screen. Refreshing will preserve the newer state.");
            }
            Map<String, Object> extra;
            try {
                extra = action.apply(context);
            } catch (RuntimeException ex) {
                if (completed || produced) {
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
        state.setLastVisitedAt(now);
        state.setCreatedAt(now);
        state.setUpdatedAt(now);
        state.setUnlockedLoreIds(List.of("charter_three_promises"));
        return state;
    }

    private void repairDefaults(KeepState state, Instant now) {
        if (state.getWoodlotLastAccruedAt() == null) state.setWoodlotLastAccruedAt(now);
        if (state.getCreatedAt() == null) state.setCreatedAt(now);
        if (state.getLastVisitedAt() == null) state.setLastVisitedAt(state.getUpdatedAt() == null ? now : state.getUpdatedAt());
        for (String id : FACILITIES.keySet()) {
            if (facilityLevel(state, id) > 0) state.getFacilityLastAccruedAt().putIfAbsent(id, now);
            state.getFacilityStored().putIfAbsent(id, 0);
            state.getFacilityProductionRemainders().putIfAbsent(id, 0.0);
            state.getFacilityResidentIds().putIfAbsent(id, "");
            state.getMaterialInventory().putIfAbsent(FACILITIES.get(id).resourceId(), 0);
        }
        if (!state.getUnlockedLoreIds().contains("charter_three_promises")) unlock(state, "charter_three_promises");
    }

    private boolean materializeConstruction(KeepState state, List<Resident> residents, Instant now) {
        String id = state.getActiveConstructionId();
        Instant completesAt = state.getConstructionCompletesAt();
        if (id == null || id.isBlank() || completesAt == null || now.isBefore(completesAt)) return false;
        materializeAllProduction(state, residents, completesAt);
        if ("woodlot_level_2".equals(id)) {
            state.setWoodlotLevel(2);
            unlock(state, "letter_green_covenant");
        } else if ("restore_archive".equals(id)) {
            state.setArchiveLevel(1);
            unlock(state, "chronicle_living_elements");
            unlock(state, "letter_pre_covenant_watch");
        } else if ("raise_storehouse".equals(id)) {
            state.setStorehouseLevel(1);
            unlock(state, "ledger_quartermaster_sera");
        } else if ("storehouse_level_2".equals(id)) {
            state.setStorehouseLevel(2);
        } else if ("build_garden".equals(id)) {
            completeFacilityLevel(state, "garden", 1, completesAt);
            unlock(state, "fieldnote_covenant_garden");
        } else if ("build_forge".equals(id)) {
            completeFacilityLevel(state, "forge", 1, completesAt);
            unlock(state, "letter_ember_forge");
        } else if ("build_fridge".equals(id)) {
            completeFacilityLevel(state, "fridge", 1, completesAt);
            unlock(state, "inventory_frost_fridge");
        } else if ("build_generator".equals(id)) {
            completeFacilityLevel(state, "generator", 1, completesAt);
            unlock(state, "schematic_elemental_generator");
        } else if (id.endsWith("_level_2")) {
            String facilityId = id.substring(0, id.length() - "_level_2".length());
            if (FACILITIES.containsKey(facilityId)) completeFacilityLevel(state, facilityId, 2, completesAt);
        }
        materializeAllProduction(state, residents, now);
        state.setActiveConstructionId("");
        state.setConstructionStartedAt(null);
        state.setConstructionCompletesAt(null);
        return true;
    }

    private void materializeProduction(KeepState state, List<Resident> residents, Instant at) {
        Instant last = state.getWoodlotLastAccruedAt();
        if (last == null) {
            state.setWoodlotLastAccruedAt(at);
            return;
        }
        if (!at.isAfter(last)) return;
        long seconds = Duration.between(last, at).getSeconds();
        int capacity = woodlotStorageCapacity(state);
        int room = Math.max(0, capacity - state.getWoodlotStored());
        double exact = seconds * woodlotRate(state, residents) / 60.0 + state.getWoodlotProductionRemainder();
        long produced = Math.max(0, (long) Math.floor(exact + 1e-9));
        int stored = (int) Math.min(room, produced);
        state.setWoodlotStored(state.getWoodlotStored() + stored);
        state.setWoodlotProductionRemainder(produced >= room ? 0 : exact - produced);
        state.setWoodlotLastAccruedAt(at);
    }

    private boolean materializeAllProduction(KeepState state, List<Resident> residents, Instant at) {
        int beforeWoodlot = state.getWoodlotStored();
        Map<String, Integer> beforeFacilities = new LinkedHashMap<>(state.getFacilityStored());
        materializeProduction(state, residents, at);
        for (String id : FACILITIES.keySet()) materializeFacilityProduction(state, residents, id, at);
        return beforeWoodlot != state.getWoodlotStored() || !beforeFacilities.equals(state.getFacilityStored());
    }

    private void materializeFacilityProduction(KeepState state, List<Resident> residents, String id, Instant at) {
        if (facilityLevel(state, id) < 1) return;
        Instant last = state.getFacilityLastAccruedAt().get(id);
        if (last == null) {
            state.getFacilityLastAccruedAt().put(id, at);
            return;
        }
        if (!at.isAfter(last)) return;
        long seconds = Duration.between(last, at).getSeconds();
        int stored = state.getFacilityStored().getOrDefault(id, 0);
        int room = Math.max(0, facilityStorageCapacity(state, id) - stored);
        double exact = seconds * facilityRate(state, residents, id) / 60.0
                + state.getFacilityProductionRemainders().getOrDefault(id, 0.0);
        long produced = Math.max(0, (long) Math.floor(exact + 1e-9));
        int accepted = (int) Math.min(room, produced);
        state.getFacilityStored().put(id, stored + accepted);
        state.getFacilityProductionRemainders().put(id, produced >= room ? 0 : exact - produced);
        state.getFacilityLastAccruedAt().put(id, at);
    }

    private int projectedWoodlotAvailable(KeepState state, List<Resident> residents, Instant now) {
        Instant last = state.getWoodlotLastAccruedAt();
        long seconds = last == null || !now.isAfter(last) ? 0 : Duration.between(last, now).getSeconds();
        long produced = Math.max(0, (long) Math.floor(
                seconds * woodlotRate(state, residents) / 60.0 + state.getWoodlotProductionRemainder() + 1e-9));
        return (int) Math.min(woodlotStorageCapacity(state), state.getWoodlotStored() + produced);
    }

    private int projectedFacilityAvailable(KeepState state, List<Resident> residents, String id, Instant now) {
        if (facilityLevel(state, id) < 1) return 0;
        Instant last = state.getFacilityLastAccruedAt().get(id);
        long seconds = last == null || !now.isAfter(last) ? 0 : Duration.between(last, now).getSeconds();
        long produced = Math.max(0, (long) Math.floor(seconds * facilityRate(state, residents, id) / 60.0
                + state.getFacilityProductionRemainders().getOrDefault(id, 0.0) + 1e-9));
        return (int) Math.min(facilityStorageCapacity(state, id), state.getFacilityStored().getOrDefault(id, 0) + produced);
    }

    private double woodlotRate(KeepState state, List<Resident> residents) {
        double base = state.getWoodlotLevel() >= 2 ? 2.0 : 1.0;
        Resident invited = residents.stream().filter(r -> r.id().equals(state.getWoodlotResidentId())).findFirst().orElse(null);
        return invited != null && stationAffinity(invited, "woodlot") ? base * 1.15 : base;
    }

    private int woodlotStorageCapacity(KeepState state) {
        int base = state.getWoodlotLevel() >= 2 ? 360 : 120;
        return (int) Math.round(base * storageMultiplier(state));
    }

    private int timberInventoryCapacity(KeepState state) {
        return TIMBER_INVENTORY_CAPACITY + state.getStorehouseLevel() * 300;
    }

    private int materialInventoryCapacity(KeepState state) {
        return 75 + state.getStorehouseLevel() * 125
                + (craftedCount(state, "covenant_crates") > 0 ? 75 : 0);
    }

    private double storageMultiplier(KeepState state) {
        return 1.0 + state.getStorehouseLevel() * .5;
    }

    private int facilityStorageCapacity(KeepState state, String id) {
        FacilityDefinition definition = FACILITIES.get(id);
        if (definition == null) return 0;
        return (int) Math.round(definition.baseStorage() * Math.max(1, facilityLevel(state, id)) * storageMultiplier(state));
    }

    private double facilityRate(KeepState state, List<Resident> residents, String id) {
        FacilityDefinition definition = FACILITIES.get(id);
        if (definition == null || facilityLevel(state, id) < 1) return 0;
        String residentId = state.getFacilityResidentIds().getOrDefault(id, "");
        Resident resident = residents.stream().filter(item -> item.id().equals(residentId)).findFirst().orElse(null);
        double affinity = resident == null ? 1.0 : stationAffinity(resident, id) ? 1.2 : "NEUTRAL".equals(resident.element()) ? 1.05 : 1.0;
        double toolBonus = craftedCount(state, definition.toolRecipeId()) > 0 ? 1.2 : 1.0;
        double networkBonus = craftedCount(state, "insulated_channels") > 0 ? 1.1 : 1.0;
        return definition.baseRatePerMinute() * facilityLevel(state, id) * affinity * toolBonus * networkBonus;
    }

    private Map<String, Object> collectEssenceStation(KeepState state, Context context, String id) {
        if (!FACILITIES.containsKey(id) || facilityLevel(state, id) < 1) {
            throw new IllegalArgumentException("Build that elemental facility before collecting from it.");
        }
        FacilityDefinition definition = FACILITIES.get(id);
        String resourceId = definition.resourceId();
        int storedInventory = state.getMaterialInventory().getOrDefault(resourceId, 0);
        int room = Math.max(0, materialInventoryCapacity(state) - storedInventory);
        int grant = Math.min(room, projectedFacilityAvailable(state, context.residents(), id, context.now()));
        if (grant <= 0) {
            throw new IllegalArgumentException(room <= 0
                    ? "Your material store is full. Craft or build something before collecting more."
                    : "That facility has not produced any materials yet.");
        }
        materializeFacilityProduction(state, context.residents(), id, context.now());
        grant = Math.min(room, state.getFacilityStored().getOrDefault(id, 0));
        state.getMaterialInventory().put(resourceId, storedInventory + grant);
        state.getFacilityStored().put(id, state.getFacilityStored().getOrDefault(id, 0) - grant);
        state.setEssenceCollectCount(state.getEssenceCollectCount() + 1);
        return Map.of("collected", Map.of("resource", resourceId, "resourceName", definition.resourceName(),
                "amount", grant, "stationId", id));
    }

    private String normalizeStationId(String stationId) {
        String id = stationId == null ? "" : stationId.trim().toLowerCase(Locale.ROOT);
        return id.isBlank() ? "woodlot" : id;
    }

    private boolean stationAvailable(KeepState state, String id) {
        return "woodlot".equals(id) || (FACILITIES.containsKey(id) && facilityLevel(state, id) > 0);
    }

    private void clearResidentAssignment(KeepState state, String residentId) {
        if (residentId.equals(state.getWoodlotResidentId())) state.setWoodlotResidentId("");
        state.getFacilityResidentIds().replaceAll((key, value) -> residentId.equals(value) ? "" : value);
    }

    private void setStationResidentId(KeepState state, String stationId, String residentId) {
        if ("woodlot".equals(stationId)) state.setWoodlotResidentId(residentId);
        else state.getFacilityResidentIds().put(stationId, residentId);
    }

    private String stationResidentId(KeepState state, String stationId) {
        return "woodlot".equals(stationId) ? state.getWoodlotResidentId()
                : state.getFacilityResidentIds().getOrDefault(stationId, "");
    }

    private boolean stationAffinity(Resident resident, String stationId) {
        if (resident == null) return false;
        Set<String> affinities = "woodlot".equals(stationId)
                ? Set.of("EARTH", "WIND", "WATER", "LIGHT")
                : FACILITIES.getOrDefault(stationId, FacilityDefinition.EMPTY).affinities();
        return affinities.contains(resident.element());
    }

    private int facilityLevel(KeepState state, String id) {
        return Math.max(0, state.getFacilityLevels().getOrDefault(id, 0));
    }

    private int craftedCount(KeepState state, String id) {
        return Math.max(0, state.getCraftedItemCounts().getOrDefault(id, 0));
    }

    private boolean hasMaterials(KeepState state, Map<String, Integer> costs) {
        return costs.entrySet().stream().allMatch(entry ->
                state.getMaterialInventory().getOrDefault(entry.getKey(), 0) >= entry.getValue());
    }

    private void requireMaterials(KeepState state, Map<String, Integer> costs, String purpose) {
        for (Map.Entry<String, Integer> entry : costs.entrySet()) {
            int owned = state.getMaterialInventory().getOrDefault(entry.getKey(), 0);
            if (owned < entry.getValue()) {
                throw new IllegalArgumentException("You need " + (entry.getValue() - owned) + " more "
                        + materialName(entry.getKey()) + " for that " + purpose + ".");
            }
        }
    }

    private void spendMaterials(KeepState state, Map<String, Integer> costs) {
        costs.forEach((id, amount) -> state.getMaterialInventory().put(id,
                Math.max(0, state.getMaterialInventory().getOrDefault(id, 0) - amount)));
    }

    private String materialName(String id) {
        return FACILITIES.values().stream().filter(definition -> definition.resourceId().equals(id))
                .map(FacilityDefinition::resourceName).findFirst().orElse(titleCase(id.replace('_', ' ')));
    }

    private boolean recipeAvailable(KeepState state, CraftRecipe recipe) {
        return "great_hall".equals(recipe.roomId()) || (FACILITIES.containsKey(recipe.roomId())
                && facilityLevel(state, recipe.roomId()) >= recipe.requiredLevel());
    }

    private void completeFacilityLevel(KeepState state, String id, int level, Instant at) {
        if (!FACILITIES.containsKey(id)) return;
        state.getFacilityLevels().put(id, Math.max(level, facilityLevel(state, id)));
        state.getFacilityStored().putIfAbsent(id, 0);
        state.getFacilityProductionRemainders().putIfAbsent(id, 0.0);
        state.getFacilityResidentIds().putIfAbsent(id, "");
        state.getFacilityLastAccruedAt().put(id, at);
    }

    private boolean allFacilitiesAtLeast(KeepState state, int level) {
        return FACILITIES.keySet().stream().allMatch(id -> facilityLevel(state, id) >= level);
    }

    private String constructionStatus(KeepState state, String levelOneId, String levelTwoId, int level) {
        if (levelOneId.equals(state.getActiveConstructionId()) || levelTwoId.equals(state.getActiveConstructionId())) {
            return "CONSTRUCTING";
        }
        return level > 0 ? "COMPLETE" : "FOUNDATIONS";
    }

    private Map<String, Object> serializeFacilityStation(KeepState state, List<Resident> residents,
                                                          String id, Instant now) {
        FacilityDefinition definition = FACILITIES.get(id);
        Resident resident = residents.stream()
                .filter(item -> item.id().equals(stationResidentId(state, id)))
                .findFirst().orElse(null);
        int available = projectedFacilityAvailable(state, residents, id, now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", definition.name());
        out.put("level", facilityLevel(state, id));
        out.put("available", available);
        out.put("storageCapacity", facilityStorageCapacity(state, id));
        out.put("ratePerMinute", facilityRate(state, residents, id));
        out.put("residentId", stationResidentId(state, id));
        out.put("resident", resident == null ? null : serializeResident(resident, id));
        out.put("resource", definition.resourceId());
        out.put("resourceName", definition.resourceName());
        out.put("isFull", available >= facilityStorageCapacity(state, id));
        out.put("affinities", definition.affinities());
        out.put("affinityNames", definition.affinities().stream().map(this::titleCase).toList());
        return out;
    }

    private Map<String, Object> offlineReport(KeepState state, Instant awaySince, Instant now,
                                               int timberBefore, Map<String, Integer> facilityBefore,
                                               String completedProject, List<String> beforeUnlocks) {
        if (awaySince == null || !now.isAfter(awaySince)
                || Duration.between(awaySince, now).compareTo(OFFLINE_REPORT_THRESHOLD) < 0) return null;
        List<Map<String, Object>> produced = new ArrayList<>();
        int timberProduced = Math.max(0, state.getWoodlotStored() - timberBefore);
        if (timberProduced > 0) produced.add(Map.of(
                "stationId", "woodlot", "stationName", "Restorative Woodlot",
                "resource", "TIMBER", "amount", timberProduced));
        for (FacilityDefinition definition : FACILITIES.values()) {
            int amount = Math.max(0, state.getFacilityStored().getOrDefault(definition.id(), 0)
                    - facilityBefore.getOrDefault(definition.id(), 0));
            if (amount > 0) produced.add(Map.of(
                    "stationId", definition.id(), "stationName", definition.name(),
                    "resource", definition.resourceId(), "resourceName", definition.resourceName(), "amount", amount));
        }
        List<String> completed = new ArrayList<>();
        BuildProject project = buildProject(completedProject);
        if (project != null) completed.add(project.name());
        List<String> loreFound = state.getUnlockedLoreIds().stream()
                .filter(id -> !beforeUnlocks.contains(id))
                .map(loreCatalog::entry)
                .filter(java.util.Objects::nonNull)
                .map(LoreEntry::title)
                .toList();
        List<String> capsReached = new ArrayList<>();
        if (state.getWoodlotStored() >= woodlotStorageCapacity(state)) capsReached.add("Restorative Woodlot");
        for (FacilityDefinition definition : FACILITIES.values()) {
            if (facilityLevel(state, definition.id()) > 0
                    && state.getFacilityStored().getOrDefault(definition.id(), 0) >= facilityStorageCapacity(state, definition.id())) {
                capsReached.add(definition.name());
            }
        }
        if (produced.isEmpty() && completed.isEmpty() && loreFound.isEmpty() && capsReached.isEmpty()) return null;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("awaySeconds", Duration.between(awaySince, now).getSeconds());
        out.put("produced", produced);
        out.put("completedProjects", completed);
        out.put("loreFound", loreFound);
        out.put("capsReached", capsReached);
        return out;
    }

    private List<Map<String, Object>> serializeMaterials(KeepState state) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (FacilityDefinition definition : FACILITIES.values()) {
            out.add(Map.of(
                    "id", definition.resourceId(),
                    "name", definition.resourceName(),
                    "amount", state.getMaterialInventory().getOrDefault(definition.resourceId(), 0),
                    "capacity", materialInventoryCapacity(state),
                    "facilityId", definition.id()
            ));
        }
        return out;
    }

    private List<Map<String, Object>> serializeMaterialCosts(Map<String, Integer> costs) {
        return costs.entrySet().stream().map(entry -> Map.<String, Object>of(
                "id", entry.getKey(), "name", materialName(entry.getKey()), "amount", entry.getValue()
        )).toList();
    }

    private List<Map<String, Object>> recipes(KeepState state) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CraftRecipe recipe : RECIPES.values()) {
            boolean available = recipeAvailable(state, recipe);
            boolean crafted = craftedCount(state, recipe.id()) > 0;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", recipe.id());
            item.put("name", recipe.name());
            item.put("type", recipe.type());
            item.put("description", recipe.description());
            item.put("roomId", recipe.roomId());
            item.put("requiredLevel", recipe.requiredLevel());
            item.put("costs", serializeMaterialCosts(recipe.materialCosts()));
            item.put("available", available);
            item.put("crafted", crafted);
            item.put("count", craftedCount(state, recipe.id()));
            item.put("canCraft", available && hasMaterials(state, recipe.materialCosts()) && (recipe.repeatable() || !crafted));
            item.put("bonus", recipe.bonusLabel());
            out.add(item);
        }
        return out;
    }

    private List<Map<String, Object>> decorations(KeepState state) {
        return RECIPES.values().stream().filter(recipe -> "DECORATION".equals(recipe.type())).map(recipe -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", recipe.id());
            item.put("name", recipe.name());
            item.put("roomId", recipe.roomId());
            item.put("crafted", craftedCount(state, recipe.id()) > 0);
            item.put("displayed", recipe.id().equals(state.getPlacedDecorations().get(recipe.roomId())));
            return item;
        }).toList();
    }

    private List<Map<String, Object>> milestones(KeepState state, PlayerProgressionEntity progression, Instant now) {
        List<Map<String, Object>> out = new ArrayList<>();
        out.add(milestone(progression, "first_harvest", "First Elemental Harvest",
                "Collect a crafted material from any facility.", state.getEssenceCollectCount() >= 1, 100, 25));
        out.add(milestone(progression, "elemental_quarter", "A Quarter in Accord",
                "Build the Garden, Forge, Fridge, and Generator.", allFacilitiesAtLeast(state, 1), 250, 75));
        out.add(milestone(progression, "masterwork_keep", "Masterwork Keep",
                "Raise every elemental facility and the Storehouse to level 2.",
                state.getStorehouseLevel() >= 2 && allFacilitiesAtLeast(state, 2), 500, 150));
        return out;
    }

    private Map<String, Object> milestone(PlayerProgressionEntity progression, String id, String name,
                                           String description, boolean complete, int gold, int remnants) {
        boolean claimed = progression.getKeepRewardClaimIds().contains(id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", name);
        out.put("description", description);
        out.put("complete", complete);
        out.put("claimed", claimed);
        out.put("canClaim", complete && !claimed);
        out.put("reward", Map.of("gold", gold, "remnants", remnants));
        return out;
    }

    private Map<String, Object> weeklyTribute(KeepState state, PlayerProgressionEntity progression, Instant now) {
        boolean unlocked = facilityLevel(state, "generator") >= 1;
        Instant next = nextTributeAt(state);
        boolean ready = unlocked && (next == null || !now.isBefore(next));
        int totalLevels = state.getStorehouseLevel() + state.getWoodlotLevel()
                + FACILITIES.keySet().stream().mapToInt(id -> facilityLevel(state, id)).sum();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", "weekly_tribute");
        out.put("unlocked", unlocked);
        out.put("ready", ready);
        out.put("nextClaimAt", next == null ? null : next.toString());
        out.put("reward", Map.of("gold", 150 + totalLevels * 35, "remnants", 25 + totalLevels * 8));
        return out;
    }

    private Instant nextTributeAt(KeepState state) {
        return state.getLastTributeClaimedAt() == null ? null : state.getLastTributeClaimedAt().plus(TRIBUTE_COOLDOWN);
    }

    private String weekKey(Instant now) {
        LocalDate date = now.atZone(ZoneOffset.UTC).toLocalDate();
        return date.get(IsoFields.WEEK_BASED_YEAR) + "-W" + date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
    }

    private BuildProject buildProject(String id) {
        if (id == null || id.isBlank()) return null;
        return switch (id) {
            case "restore_archive" -> new BuildProject(id, "Restore the Living Archive", ARCHIVE_RESTORE_COST, Map.of(), ARCHIVE_RESTORE_SECONDS);
            case "woodlot_level_2" -> new BuildProject(id, "Cultivate the Woodlot", WOODLOT_LEVEL_TWO_COST, Map.of(), WOODLOT_LEVEL_TWO_SECONDS);
            case "raise_storehouse" -> new BuildProject(id, "Raise the Covenant Storehouse", STOREHOUSE_LEVEL_ONE_COST, Map.of(), STOREHOUSE_LEVEL_ONE_SECONDS);
            case "build_garden" -> new BuildProject(id, "Plant the Covenant Garden", GARDEN_LEVEL_ONE_COST, Map.of(), GARDEN_LEVEL_ONE_SECONDS);
            case "build_forge" -> new BuildProject(id, "Kindle the Accord Forge", FORGE_LEVEL_ONE_COST, Map.of(), FORGE_LEVEL_ONE_SECONDS);
            case "build_fridge" -> new BuildProject(id, "Raise the Frost Fridge", FRIDGE_LEVEL_ONE_COST, Map.of(), FRIDGE_LEVEL_ONE_SECONDS);
            case "build_generator" -> new BuildProject(id, "Tune the Elemental Generator", GENERATOR_LEVEL_ONE_COST, Map.of(), GENERATOR_LEVEL_ONE_SECONDS);
            case "storehouse_level_2" -> new BuildProject(id, "Vault the Storehouse", 320,
                    Map.of("verdant_fiber", 18, "ember_ingot", 12, "frost_crystal", 12, "storm_cell", 8), 28_800);
            default -> {
                String suffix = "_level_2";
                String facilityId = id.endsWith(suffix) ? id.substring(0, id.length() - suffix.length()) : "";
                yield FACILITIES.containsKey(facilityId)
                        ? new BuildProject(id, "Expand the " + FACILITIES.get(facilityId).name(), 260,
                        levelTwoMaterialCosts(facilityId), 21_600)
                        : null;
            }
        };
    }

    private void validateBuild(KeepState state, BuildProject project) {
        String id = project.id();
        boolean valid = switch (id) {
            case "restore_archive" -> state.getArchiveLevel() < 1;
            case "woodlot_level_2" -> state.getArchiveLevel() >= 1 && state.getWoodlotLevel() < 2;
            case "raise_storehouse" -> state.getWoodlotLevel() >= 2 && state.getStorehouseLevel() < 1;
            case "build_garden" -> state.getStorehouseLevel() >= 1 && facilityLevel(state, "garden") < 1;
            case "build_forge" -> state.getStorehouseLevel() >= 1 && facilityLevel(state, "forge") < 1;
            case "build_fridge" -> state.getStorehouseLevel() >= 1 && facilityLevel(state, "fridge") < 1;
            case "build_generator" -> state.getStorehouseLevel() >= 1 && facilityLevel(state, "generator") < 1;
            case "storehouse_level_2" -> allFacilitiesAtLeast(state, 1) && state.getStorehouseLevel() < 2;
            default -> {
                String facilityId = id.endsWith("_level_2")
                        ? id.substring(0, id.length() - "_level_2".length()) : "";
                yield FACILITIES.containsKey(facilityId) && facilityLevel(state, facilityId) == 1;
            }
        };
        if (!valid) throw new IllegalArgumentException("That project is not available yet.");
    }

    private Map<String, Integer> levelTwoMaterialCosts(String facilityId) {
        return switch (facilityId) {
            case "garden" -> Map.of("frost_crystal", 18, "ember_ingot", 14);
            case "forge" -> Map.of("verdant_fiber", 24, "storm_cell", 10);
            case "fridge" -> Map.of("verdant_fiber", 20, "ember_ingot", 16);
            case "generator" -> Map.of("verdant_fiber", 12, "ember_ingot", 12, "frost_crystal", 12);
            default -> Map.of();
        };
    }

    private String titleCase(String value) {
        String lower = value == null ? "" : value.toLowerCase(Locale.ROOT);
        return lower.isBlank() ? lower : Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }

    private static Map<String, FacilityDefinition> createFacilities() {
        Map<String, FacilityDefinition> out = new LinkedHashMap<>();
        out.put("garden", new FacilityDefinition("garden", "Covenant Garden", "Garden Plot",
                "verdant_fiber", "Verdant Fiber", .25, 90, Set.of("EARTH", "WATER", "LIGHT", "POISON", "WIND"),
                "gardener_tools", "Choose the Garden first for flexible fiber used by decorations, storage, and cold-work upgrades."));
        out.put("forge", new FacilityDefinition("forge", "Accord Forge", "Cold Forge",
                "ember_ingot", "Ember Ingot", .20, 100, Set.of("FIRE", "METAL", "EARTH", "ELECTRIC"),
                "tempered_tongs", "Choose the Forge first for ingots used by structural upgrades, tools, and warm decorations."));
        out.put("fridge", new FacilityDefinition("fridge", "Frost Fridge", "Empty Icehouse",
                "frost_crystal", "Frost Crystal", .15, 120, Set.of("ICE", "WATER", "WIND", "UNDEAD"),
                "coldseal_kit", "Choose the Fridge first for crystals used by preservation tools and heat-safe construction."));
        out.put("generator", new FacilityDefinition("generator", "Elemental Generator", "Silent Generator",
                "storm_cell", "Storm Cell", .40, 80, Set.of("ELECTRIC", "FIRE", "LIGHT", "SHADOW", "PSYCHIC"),
                "tuning_key", "Choose the Generator first for charged cells used by advanced tools and production networks."));
        return out;
    }

    private static Map<String, CraftRecipe> createRecipes() {
        Map<String, CraftRecipe> out = new LinkedHashMap<>();
        out.put("gardener_tools", new CraftRecipe("gardener_tools", "Rootwise Pruning Kit", "TOOL", "garden", 1,
                Map.of("verdant_fiber", 12, "ember_ingot", 6), false,
                "Tools designed with resident guidance increase Garden production.", "Garden output +20%"));
        out.put("tempered_tongs", new CraftRecipe("tempered_tongs", "Consent-Forged Tongs", "TOOL", "forge", 1,
                Map.of("ember_ingot", 12, "frost_crystal", 5), false,
                "Cold-gripped tongs let partners work the forge without being bound to its heat.", "Forge output +20%"));
        out.put("coldseal_kit", new CraftRecipe("coldseal_kit", "Coldseal Preservation Kit", "TOOL", "fridge", 1,
                Map.of("frost_crystal", 12, "verdant_fiber", 8), false,
                "Woven seals hold a steady frost while leaving the resident free to rest.", "Fridge output +20%"));
        out.put("tuning_key", new CraftRecipe("tuning_key", "Resonance Tuning Key", "TOOL", "generator", 1,
                Map.of("storm_cell", 10, "ember_ingot", 6), false,
                "A many-element key balances the shared current instead of forcing it.", "Generator output +20%"));
        out.put("covenant_crates", new CraftRecipe("covenant_crates", "Covenant Storage Crates", "BONUS", "great_hall", 1,
                Map.of("verdant_fiber", 18, "ember_ingot", 10), false,
                "Labeled modular crates make every elemental material easier to preserve.", "+75 material capacity"));
        out.put("insulated_channels", new CraftRecipe("insulated_channels", "Insulated Element Channels", "BONUS", "generator", 1,
                Map.of("frost_crystal", 10, "storm_cell", 10), false,
                "Balanced channels carry surplus power safely between every workshop.", "All elemental output +10%"));
        out.put("living_trellis", new CraftRecipe("living_trellis", "Living Covenant Trellis", "DECORATION", "garden", 1,
                Map.of("verdant_fiber", 8), false,
                "A flowering trellis that bends toward willing elemental partners.", "Garden interior decoration"));
        out.put("ember_lantern", new CraftRecipe("ember_lantern", "Emberglass Lantern", "DECORATION", "forge", 1,
                Map.of("ember_ingot", 7), false,
                "A warm lantern whose flame dims whenever the Forge resident rests.", "Forge interior decoration"));
        out.put("frostglass_mobile", new CraftRecipe("frostglass_mobile", "Frostglass Memory Mobile", "DECORATION", "fridge", 1,
                Map.of("frost_crystal", 7), false,
                "Chimes of preserved ice replay faint impressions from the sanctuary.", "Fridge interior decoration"));
        out.put("harmonic_orb", new CraftRecipe("harmonic_orb", "Harmonic Current Orb", "DECORATION", "generator", 1,
                Map.of("storm_cell", 6), false,
                "A hovering model of the four workshop currents moving in accord.", "Generator interior decoration"));
        out.put("covenant_tapestry", new CraftRecipe("covenant_tapestry", "Tapestry of Four Currents", "DECORATION", "great_hall", 1,
                Map.of("verdant_fiber", 4, "ember_ingot", 4, "frost_crystal", 4, "storm_cell", 4), false,
                "A hall tapestry woven from every material produced by the Keep.", "Covenant Hall decoration"));
        return out;
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
            boolean preferred = Set.of("EARTH", "WIND", "WATER", "LIGHT").contains(element);
            out.add(new Resident(card.getId(), card.getName(), element, rarity,
                    card.getCardArtUrl() == null ? "" : card.getCardArtUrl(), preferred));
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
        return serialize(user, progression, state, residents, now, null);
    }

    private Map<String, Object> serialize(AccountUser user, PlayerProgressionEntity progression,
                                          KeepState state, List<Resident> residents, Instant now,
                                          Map<String, Object> offlineReport) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("serverTime", now.toString());
        out.put("stateVersion", state.getVersion());
        out.put("keepName", (user.getDisplayName() == null || user.getDisplayName().isBlank() ? "The Keeper" : user.getDisplayName()) + "'s Keep");
        out.put("chapter", Map.of("id", "wounded_ground", "number", 1, "title", "The Wounded Ground"));
        Map<String, Object> resources = new LinkedHashMap<>();
        resources.put("timber", state.getTimber());
        resources.put("timberCapacity", timberInventoryCapacity(state));
        resources.put("materials", serializeMaterials(state));
        resources.put("materialCapacity", materialInventoryCapacity(state));
        resources.put("gold", progression.getGold());
        resources.put("remnants", progression.getRemnants());
        out.put("resources", resources);

        int available = projectedWoodlotAvailable(state, residents, now);
        Resident invited = residents.stream().filter(r -> r.id().equals(state.getWoodlotResidentId())).findFirst().orElse(null);
        Map<String, Object> station = new LinkedHashMap<>();
        station.put("id", "woodlot");
        station.put("name", "Restorative Woodlot");
        station.put("level", state.getWoodlotLevel());
        station.put("available", available);
        station.put("storageCapacity", woodlotStorageCapacity(state));
        station.put("ratePerMinute", woodlotRate(state, residents));
        station.put("residentId", state.getWoodlotResidentId());
        station.put("resident", invited == null ? null : serializeResident(invited, "woodlot"));
        station.put("collectCount", state.getWoodlotCollectCount());
        station.put("isFull", available >= woodlotStorageCapacity(state));
        station.put("resource", "TIMBER");
        out.put("station", station);
        List<Map<String, Object>> stations = new ArrayList<>();
        stations.add(station);
        for (String id : FACILITIES.keySet()) {
            if (facilityLevel(state, id) > 0) stations.add(serializeFacilityStation(state, residents, id, now));
        }
        out.put("stations", stations);

        List<Map<String, Object>> residentPayload = residents.stream().map(this::serializeResident).toList();
        out.put("residents", residentPayload);
        out.put("buildings", buildings(state));
        out.put("buildOptions", buildOptions(state));
        out.put("activeConstruction", activeConstruction(state, now));
        Map<String, Object> visualState = new LinkedHashMap<>();
        visualState.put("archiveRestored", state.getArchiveLevel() > 0);
        visualState.put("woodlotLevel", state.getWoodlotLevel());
        visualState.put("storehouseLevel", state.getStorehouseLevel());
        visualState.put("healingStage", Math.min(3, state.getWoodlotCollectCount() + state.getArchiveLevel()));
        FACILITIES.keySet().forEach(id -> visualState.put(id + "Level", facilityLevel(state, id)));
        out.put("visualState", visualState);

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
        out.put("recipes", recipes(state));
        out.put("decorations", decorations(state));
        out.put("placedDecorations", state.getPlacedDecorations());
        out.put("milestones", milestones(state, progression, now));
        out.put("weeklyTribute", weeklyTribute(state, progression, now));
        if (offlineReport != null && !offlineReport.isEmpty()) out.put("offlineReport", offlineReport);
        out.put("progressionReady", progression.getStarterPackId() != null);
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
        out.add(building("storehouse", state.getStorehouseLevel() > 0 ? "Covenant Storehouse" : "Storehouse Foundations",
                state.getStorehouseLevel(), constructionStatus(state, "raise_storehouse", "storehouse_level_2", state.getStorehouseLevel())));
        for (FacilityDefinition definition : FACILITIES.values()) {
            int level = facilityLevel(state, definition.id());
            out.add(building(definition.id(), level > 0 ? definition.name() : definition.ruinedName(), level,
                    constructionStatus(state, "build_" + definition.id(), definition.id() + "_level_2", level)));
        }
        return out;
    }

    private Map<String, Object> building(String id, String name, int level, String status) {
        return Map.of("id", id, "name", name, "level", level, "status", status);
    }

    private List<Map<String, Object>> buildOptions(KeepState state) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (state.getArchiveLevel() < 1) {
            out.add(buildOption(state, "restore_archive", "Restore the Living Archive", ARCHIVE_RESTORE_COST, Map.of(),
                    ARCHIVE_RESTORE_SECONDS, "Raise a shelter for recovered letters and the memories held by the land.",
                    true));
            return out;
        }
        if (state.getWoodlotLevel() < 2) {
            out.add(buildOption(state, "woodlot_level_2", "Cultivate the Woodlot", WOODLOT_LEVEL_TWO_COST, Map.of(),
                    WOODLOT_LEVEL_TWO_SECONDS, "Replace clear-cutting with a grove shaped by human and Siegeling knowledge.",
                    true));
            return out;
        }
        if (state.getStorehouseLevel() < 1) {
            out.add(buildOption(state, "raise_storehouse", "Raise the Covenant Storehouse", STOREHOUSE_LEVEL_ONE_COST, Map.of(),
                    STOREHOUSE_LEVEL_ONE_SECONDS, "Double timber room and expand every workstation's offline storage.", true));
            return out;
        }
        for (FacilityDefinition definition : FACILITIES.values()) {
            if (facilityLevel(state, definition.id()) < 1) {
                BuildProject project = buildProject("build_" + definition.id());
                out.add(buildOption(state, project.id(), project.name(), project.timberCost(), project.materialCosts(),
                        project.durationSeconds(), definition.buildDescription(), true));
            }
        }
        for (FacilityDefinition definition : FACILITIES.values()) {
            if (facilityLevel(state, definition.id()) == 1) {
                BuildProject project = buildProject(definition.id() + "_level_2");
                out.add(buildOption(state, project.id(), project.name(), project.timberCost(), project.materialCosts(),
                        project.durationSeconds(), "Use materials from other workshops to improve production, storage, and the resident's contribution.", true));
            }
        }
        if (allFacilitiesAtLeast(state, 1) && state.getStorehouseLevel() < 2) {
            BuildProject project = buildProject("storehouse_level_2");
            out.add(buildOption(state, project.id(), project.name(), project.timberCost(), project.materialCosts(),
                    project.durationSeconds(), "Combine all four elemental materials into a larger sanctuary vault.", true));
        }
        return out;
    }

    private Map<String, Object> buildOption(KeepState state, String id, String name, int timberCost, Map<String, Integer> materialCosts,
                                            long seconds, String description, boolean unlocked) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", name);
        out.put("timberCost", timberCost);
        out.put("materialCosts", serializeMaterialCosts(materialCosts));
        out.put("durationSeconds", seconds);
        out.put("description", description);
        out.put("canStart", unlocked && state.getActiveConstructionId().isBlank()
                && state.getTimber() >= timberCost && hasMaterials(state, materialCosts));
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

    private Map<String, Object> serializeResident(Resident resident) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", resident.id());
        out.put("name", resident.name());
        out.put("element", resident.element());
        out.put("rarity", resident.rarity());
        out.put("artUrl", resident.artUrl());
        out.put("preferredAtWoodlot", resident.preferredAtWoodlot());
        out.put("affinityLabel", resident.preferredAtWoodlot() ? "Woodland affinity · +15%" : "Willing helper · normal rate");
        return out;
    }

    private Map<String, Object> serializeResident(Resident resident, String stationId) {
        Map<String, Object> out = serializeResident(resident);
        boolean affinity = stationAffinity(resident, stationId);
        int bonus = "woodlot".equals(stationId) ? (affinity ? 15 : 0)
                : affinity ? 20 : "NEUTRAL".equals(resident.element()) ? 5 : 0;
        out.put("hasAffinity", affinity);
        out.put("affinityBonusPercent", bonus);
        out.put("affinityLabel", bonus > 0 ? titleCase(resident.element()) + " affinity · +" + bonus + "%"
                : "Willing helper · normal rate");
        return out;
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
                "archivist_pell", "Archivist Nara Pell",
                "quartermaster_sera", "Quartermaster Sera Vale"
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
                            boolean preferredAtWoodlot) { }
    private record FacilityDefinition(String id, String name, String ruinedName, String resourceId,
                                      String resourceName, double baseRatePerMinute, int baseStorage,
                                      Set<String> affinities, String toolRecipeId, String buildDescription) {
        private static final FacilityDefinition EMPTY = new FacilityDefinition("", "", "", "", "", 0, 0,
                Set.of(), "", "");
    }
    private record CraftRecipe(String id, String name, String type, String roomId, int requiredLevel,
                               Map<String, Integer> materialCosts, boolean repeatable,
                               String description, String bonusLabel) { }
    private record BuildProject(String id, String name, int timberCost, Map<String, Integer> materialCosts,
                                long durationSeconds) { }
    private record Context(PlayerProgressionEntity progression, KeepState state, List<Resident> residents, Instant now) { }

    public static class StaleKeepStateException extends IllegalStateException {
        public StaleKeepStateException(String message) { super(message); }
    }
}
