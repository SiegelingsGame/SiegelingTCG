package com.sieglings.keep;

import com.sieglings.keep.KeepLoreCatalog.Conversation;
import com.sieglings.keep.KeepLoreCatalog.ConversationChoice;
import com.sieglings.keep.KeepLoreCatalog.LoreEntry;
import com.sieglings.keep.KeepLoreCatalog.Outcome;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.SieglingSize;
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
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
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
    public static final int ENCLAVE_BUILD_COST = 240;
    public static final long ENCLAVE_BUILD_SECONDS = 7_200;
    private static final int ENCLAVE_CAPACITY = 5;
    // ── Keeper leveling / battlepass ──────────────────────────────────────────
    public static final int KEEPER_MAX_LEVEL = 25;
    private static final int KEEPER_DAILY_LOGIN_XP = 60;
    private static final int KEEPER_TIMBER_COLLECT_XP = 10;
    private static final int KEEPER_MATERIAL_COLLECT_XP = 15;
    private static final int KEEPER_PROJECT_XP = 40;
    private static final int KEEPER_QUEST_XP = 50;
    private static final int KEEPER_RESOURCE_XP_DAILY_CAP = 150;
    private static final int KEEPER_LEVELS_PER_CHAPTER = 5;
    /** Decoration granted at specific Keeper Levels (owned outright, placeable once its room is built). */
    private static final Map<Integer, String> KEEPER_LEVEL_DECORATIONS = Map.ofEntries(
            Map.entry(3, "carved_waypost"), Map.entry(4, "living_trellis"),
            Map.entry(6, "ember_lantern"), Map.entry(9, "frostglass_mobile"),
            Map.entry(11, "harmonic_orb"), Map.entry(14, "stone_sentinel"),
            Map.entry(18, "hearth_garland"), Map.entry(22, "covenant_tapestry"));
    /** Chapter titles for the battlepass timeline; each spans 5 Keeper Levels. */
    private static final String[][] KEEPER_CHAPTERS = {
            {"The Wounded Ground", "Build a sanctuary that takes nothing without giving something back."},
            {"Roots in the Ash", "Coax the first workshops from a land still learning to trust you."},
            {"Halls Remembered", "Raise real stone, and let the keep hold its own history again."},
            {"The Elements Answer", "Master every element and the residents who carry them."},
            {"A Sanctuary Renowned", "A grand keep whose light reaches Akhar's distant front."}
    };
    private static final Duration OFFLINE_REPORT_THRESHOLD = Duration.ofMinutes(5);
    private static final Duration TRIBUTE_COOLDOWN = Duration.ofDays(7);
    private static final Duration VISITOR_ROLL_COOLDOWN = Duration.ofHours(2);
    private static final int MAX_ACTIVE_VISITORS = 3;
    /** Bonded threshold / Voices spectrum ceiling — also the soft cap for npcTrust. */
    public static final int NPC_TRUST_MAX = 7;
    /** Previously spoken Interaction/Visitor NPCs are more likely to return for affinity play. */
    private static final int RETURNING_NPC_WEIGHT_MULT = 3;
    private static final int REQUEST_HISTORY_LIMIT = 120;
    private static final Object[] LOCKS = createLocks();
    private static final Map<String, FacilityDefinition> FACILITIES = createFacilities();
    private static final Map<String, CraftRecipe> RECIPES = createRecipes();
    /** The original four workshops; long-standing gates and milestones stay keyed
        to these so adding the Quarry/Kitchen never retro-locks progress. */
    private static final Set<String> ELEMENTAL_FACILITIES = Set.of("garden", "forge", "fridge", "generator");
    public static final int HALL_MAX_LEVEL = 8;
    /** Keep ranks by Covenant Hall level — the visible progression arc of the sanctuary. */
    private static final String[] HALL_RANKS = {
            "Ruined Camp", "Timber Outpost", "Settled Courtyard", "Stonehold",
            "Walled Keep", "Elemental Stronghold", "High Castle", "Grand Keep"
    };
    private static final Map<String, HallTheme> HALL_THEMES = createHallThemes();

    private final KeepStore store;
    private final PlayerProgressionService progressionService;
    private final CardDefinitionService cardDefinitionService;
    private final KeepLoreCatalog loreCatalog;
    @Autowired(required = false)
    private PlayerProgressionStore progressionStore;
    /** Optional so tests (and a Firestore-less runtime) fall back to the shipped balance. */
    @Autowired(required = false)
    private KeepTuningService tuningService;
    private Clock clock = Clock.systemUTC();
    private Random random = new Random();

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
            List<String> completedProjects = materializeConstructions(state, context.residents(), context.now());
            boolean completed = !completedProjects.isEmpty();
            boolean returning = awaySince != null
                    && Duration.between(awaySince, context.now()).compareTo(OFFLINE_REPORT_THRESHOLD) >= 0;
            boolean produced = completed || (returning && materializeAllProduction(state, context.residents(), context.now()));
            boolean visitorsChanged = refreshVisitors(state, context.now());
            Map<String, Object> offlineReport = offlineReport(state, awaySince, context.now(), timberBefore,
                    facilityBefore, completedProjects, beforeUnlocks);
            int dailyXp = grantDailyKeeperXp(state, context.now());
            state.setLastVisitedAt(context.now());
            if (completed || produced || visitorsChanged || dailyXp > 0) {
                bump(context.state(), context.now());
                store.save(state);
            } else {
                store.save(state);
            }
            if (completed) {
                recordKeepStats(context.progression(),
                        p -> p.setKeepProjectsCompleted(p.getKeepProjectsCompleted() + completedProjects.size()));
            }
            Map<String, Object> snapshot = serialize(user, context.progression(), state, context.residents(), context.now(), offlineReport);
            if (dailyXp > 0) snapshot.put("keeperDailyXpAwarded", dailyXp);
            return snapshot;
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
            advanceEnclaveTasks(state, context.residents(), "TIMBER_COLLECTION");
            if (state.getWoodlotCollectCount() == 1) unlock(state, "letter_forester_maren");
            if (state.getWoodlotCollectCount() >= 3) unlock(state, "memorabilia_petrified_root");
            final int granted = grant;
            recordKeepStats(context.progression(), p -> p.setKeepTimberCollected(p.getKeepTimberCollected() + granted));
            int xpGained = grantResourceKeeperXp(state, context.now(), KEEPER_TIMBER_COLLECT_XP);
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("collected", Map.of("resource", "TIMBER", "amount", grant));
            if (xpGained > 0) extra.put("keeperXpAwarded", xpGained);
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
            if (!hasFreeConstructionSlot(state)) {
                throw new IllegalArgumentException("All construction teams are active. Finish a current project first.");
            }
            if (constructionSlotsInUse(state).stream().anyMatch(slot -> id.equals(slot.id()))) {
                throw new IllegalArgumentException("That project is already underway.");
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
            addConstruction(state, id, context.now(), context.now().plusSeconds(project.durationSeconds()));
            return Map.of("constructionStarted", id);
        });
    }

    /** Keeper journey milestones add one team at levels 5, 10, 15, 20, and 25. */
    private int constructionSlots(KeepState state) {
        return 1 + Math.min(5, keeperLevel(state.getKeeperXp()) / 5);
    }

    private boolean hasFreeConstructionSlot(KeepState state) {
        return constructionSlotsInUse(state).size() < constructionSlots(state);
    }

    private boolean isConstructing(KeepState state, String projectId) {
        return constructionSlotsInUse(state).stream().anyMatch(slot -> projectId.equals(slot.id()));
    }

    private void addConstruction(KeepState state, String id, Instant startedAt, Instant completesAt) {
        if (state.getActiveConstructionId().isBlank()) {
            state.setActiveConstructionId(id);
            state.setConstructionStartedAt(startedAt);
            state.setConstructionCompletesAt(completesAt);
            return;
        }
        if (state.getActiveConstructionId2().isBlank()) {
            state.setActiveConstructionId2(id);
            state.setConstructionStartedAt2(startedAt);
            state.setConstructionCompletesAt2(completesAt);
            return;
        }
        state.getAdditionalConstructionIds().add(id);
        state.getAdditionalConstructionStartedAts().add(startedAt);
        state.getAdditionalConstructionCompletesAts().add(completesAt);
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
            refreshVisitors(state, context.now());
            Conversation conversation = loreCatalog.conversation(conversationId);
            if (conversation == null || !isConversationAvailable(state, conversation)) {
                throw new IllegalArgumentException("That conversation is not available.");
            }
            ConversationChoice choice = conversation.choices().stream()
                    .filter(item -> item.id().equals(choiceId))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Unknown conversation choice."));
            if (state.getTimber() < choice.timberCost()) {
                throw new IllegalArgumentException("You need " + choice.timberCost() + " timber for that choice.");
            }
            requireMaterials(state, choice.materialCosts(), "choice");
            state.setTimber(state.getTimber() - choice.timberCost());
            spendMaterials(state, choice.materialCosts());

            String response = choice.response();
            int relationshipDelta = choice.relationshipDelta();
            String flag = choice.flag();
            int timberDelta = choice.timberDelta();
            Map<String, Integer> materialDeltas = new LinkedHashMap<>(choice.materialDeltas());
            String unlockLoreId = choice.unlockLoreId();
            String outcomeId = "";
            if (!choice.outcomes().isEmpty()) {
                Outcome outcome = rollOutcome(choice.outcomes());
                outcomeId = outcome.id();
                response = outcome.response() == null || outcome.response().isBlank() ? response : outcome.response();
                relationshipDelta = outcome.relationshipDelta();
                flag = outcome.flag() != null ? outcome.flag() : flag;
                timberDelta = outcome.timberDelta();
                materialDeltas = new LinkedHashMap<>(outcome.materialDeltas());
                if (outcome.unlockLoreId() != null) unlockLoreId = outcome.unlockLoreId();
            }

            int appliedTimber = applyTimberDelta(state, timberDelta);
            Map<String, Integer> appliedMaterials = applyMaterialDeltas(state, materialDeltas);
            if (flag != null && !flag.isBlank()) addUnique(state.getChoiceFlags(), flag);
            if (unlockLoreId != null) unlock(state, unlockLoreId);
            int trustBefore = Math.max(0, state.getNpcTrust().getOrDefault(conversation.npcId(), 0));
            int trustAfter = Math.max(0, Math.min(NPC_TRUST_MAX, trustBefore + relationshipDelta));
            state.getNpcTrust().put(conversation.npcId(), trustAfter);

            if (loreCatalog.isRollingEncounter(conversation)) {
                // Visitors and Interaction NPCs leave the active slate and return after cooldown.
                state.getActiveVisitorIds().remove(conversation.id());
                state.getVisitorAvailableAt().put(conversation.id(),
                        context.now().plus(Duration.ofHours(conversation.cooldownHours())));
            } else {
                addUnique(state.getCompletedConversationIds(), conversation.id());
            }
            recordKeepStats(context.progression(), p -> p.setKeepConversationsCompleted(p.getKeepConversationsCompleted() + 1));
            advanceEnclaveTasks(state, context.residents(), "CONVERSATION");

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("npcId", conversation.npcId());
            result.put("npcName", conversation.npcName());
            result.put("kind", conversation.kind());
            result.put("response", response);
            result.put("outcomeId", outcomeId);
            result.put("relationshipDelta", relationshipDelta);
            result.put("trust", trustAfter);
            result.put("trustMax", NPC_TRUST_MAX);
            result.put("stage", relationshipStage(trustAfter));
            result.put("timberSpent", choice.timberCost());
            result.put("timberDelta", appliedTimber);
            result.put("materialCosts", serializeMaterialCosts(choice.materialCosts()));
            result.put("materialDeltas", serializeMaterialDeltas(appliedMaterials));
            result.put("summary", dialogueSummary(choice.timberCost(), appliedTimber, choice.materialCosts(), appliedMaterials));
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
            CraftRecipe recipe = recipeById(id);
            if (recipe == null) throw new IllegalArgumentException("Unknown Keep recipe.");
            if (!recipeRoomAvailable(state, recipe)) throw new IllegalArgumentException("Build the required workshop before crafting that item.");
            if (!recipePrerequisiteMet(state, recipe)) throw new IllegalArgumentException("Craft the previous tool upgrade first.");
            if (craftedCount(state, id) > 0 && !recipe.repeatable()) {
                throw new IllegalArgumentException("That Keep item has already been crafted.");
            }
            requireMaterials(state, recipe.materialCosts(), "recipe");
            spendMaterials(state, recipe.materialCosts());
            state.getCraftedItemCounts().merge(id, 1, Integer::sum);
            state.setCraftCount(state.getCraftCount() + 1);
            advanceEnclaveTasks(state, context.residents(), "CRAFTING");
            return Map.of("crafted", Map.of("id", id, "name", recipe.name(), "type", recipe.type()));
        });
    }

    public Map<String, Object> placeDecoration(AccountUser user, String roomId, String decorationId,
                                                boolean displayed, String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String room = normalizeStationId(roomId);
            String id = decorationId == null ? "" : decorationId.trim();
            CraftRecipe recipe = recipeById(id);
            if (recipe == null || !"DECORATION".equals(recipe.type()) || !room.equals(recipe.roomId())) {
                throw new IllegalArgumentException("That decoration does not belong in this room.");
            }
            if (craftedCount(state, id) < 1) throw new IllegalArgumentException("Craft that decoration before placing it.");
            LinkedHashSet<String> placed = placedDecorationIds(state, room);
            if (displayed) {
                if (placed.size() >= 5 && !placed.contains(id)) {
                    throw new IllegalArgumentException("That room already displays five decorations.");
                }
                // Only a newly displayed decoration counts — re-placing the same one cannot farm rapport.
                if (!placed.contains(id)) advanceEnclaveTasks(state, context.residents(), "DECORATION");
                placed.add(id);
            } else {
                placed.remove(id);
            }
            if (placed.isEmpty()) state.getPlacedDecorations().remove(room);
            else state.getPlacedDecorations().put(room, String.join(",", placed));
            return Map.of("decorationChanged", id, "roomId", room, "displayed", displayed);
        });
    }

    public Map<String, Object> setEnclaveResident(AccountUser user, int slot, String residentId,
                                                   String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            if (state.getEnclaveLevel() < 1) throw new IllegalArgumentException("Build the Siegeling Enclave first.");
            if (slot < 0 || slot >= ENCLAVE_CAPACITY) throw new IllegalArgumentException("Choose one of the five enclave spaces.");
            String normalized = residentId == null ? "" : residentId.trim();
            if (!normalized.isBlank() && context.residents().stream().noneMatch(item -> item.id().equals(normalized))) {
                throw new IllegalArgumentException("That Siegeling has not joined your collection yet.");
            }
            List<String> assignments = normalizedEnclaveResidents(state);
            if (!normalized.isBlank()) {
                for (int index = 0; index < assignments.size(); index++) {
                    if (normalized.equals(assignments.get(index))) assignments.set(index, "");
                }
            }
            assignments.set(slot, normalized);
            state.setEnclaveResidentIds(assignments);
            return Map.of("enclaveResidentChanged", true, "slot", slot, "residentId", normalized);
        });
    }

    public Map<String, Object> setFavorite(AccountUser user, String residentId,
                                           String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String normalized = residentId == null ? "" : residentId.trim();
            Resident resident = context.residents().stream()
                    .filter(item -> item.id().equals(normalized)).findFirst().orElse(null);
            if (!normalized.isBlank() && resident == null) {
                throw new IllegalArgumentException("That Siegeling has not joined your collection yet.");
            }
            // The favorite changes every production rate, so settle accrual first.
            materializeAllProduction(state, context.residents(), context.now());
            state.setFavoriteResidentId(normalized);
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("favoriteChanged", Map.of(
                    "residentId", normalized,
                    "name", resident == null ? "" : resident.name(),
                    "bonusPercent", (int) Math.round(favoriteBoost(state, context.residents()) * 100)));
            return extra;
        });
    }

    /** The keep-wide favorite bonus scales with the chosen Siegeling's rarity and
        applies to every station's output plus tribute and weekly-order income.
        Rapport multiplies it, which widens the rarity gaps rather than flattening them:
        a Legendary partner always out-earns a Common one, and the distance between them
        grows by the same threshold as the bonus itself. */
    private double favoriteBoost(KeepState state, List<Resident> residents) {
        Resident favorite = favoriteResident(state, residents);
        if (favorite == null) return 0;
        return tuning().favoritePercent(favorite.rarity()) / 100.0 * rapportMultiplier(state, favorite.id());
    }

    // ── Rapport ───────────────────────────────────────────────────────────────

    private int rapportPoints(KeepState state, String residentId) {
        if (residentId == null || residentId.isBlank()) return 0;
        return Math.max(0, state.getResidentRapport().getOrDefault(residentId, 0));
    }

    /** Rapport level for a point total, clamped to the configured ladder. */
    private int rapportLevel(KeepState state, String residentId) {
        List<Integer> thresholds = tuning().rapportThresholds();
        int points = rapportPoints(state, residentId);
        int level = 0;
        for (int index = 1; index < thresholds.size(); index++) {
            if (points >= thresholds.get(index)) level = index;
        }
        return level;
    }

    /** Points still needed for the next level, or 0 once a resident is fully bonded. */
    private int rapportPointsToNextLevel(KeepState state, String residentId) {
        List<Integer> thresholds = tuning().rapportThresholds();
        int level = rapportLevel(state, residentId);
        if (level >= thresholds.size() - 1) return 0;
        return Math.max(0, thresholds.get(level + 1) - rapportPoints(state, residentId));
    }

    /**
     * The single multiplier rapport applies to every buff a resident grants. A resident who
     * grants no bonus at a station still grants none — rapport raises what they already give.
     */
    private double rapportMultiplier(KeepState state, String residentId) {
        return 1 + rapportLevel(state, residentId) * (tuning().rapportStepPercent() / 100.0);
    }

    private String rapportLabel(int level, int maxLevel) {
        if (level <= 0) return "Newly arrived";
        if (level >= maxLevel) return "Bonded";
        return switch (level) {
            case 1 -> "Familiar";
            case 2 -> "Trusted";
            case 3 -> "Kindred";
            default -> "Sworn";
        };
    }

    private Map<String, Object> serializeRapport(KeepState state, String residentId) {
        int maxLevel = tuning().rapportMaxLevel();
        int level = rapportLevel(state, residentId);
        List<Integer> thresholds = tuning().rapportThresholds();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("points", rapportPoints(state, residentId));
        out.put("level", level);
        out.put("maxLevel", maxLevel);
        out.put("label", rapportLabel(level, maxLevel));
        out.put("pointsToNextLevel", rapportPointsToNextLevel(state, residentId));
        out.put("nextLevelPoints", level >= maxLevel ? 0 : thresholds.get(level + 1));
        out.put("levelPoints", thresholds.get(Math.min(level, thresholds.size() - 1)));
        out.put("buffPercent", (int) Math.round((rapportMultiplier(state, residentId) - 1) * 100));
        return out;
    }

    private Resident favoriteResident(KeepState state, List<Resident> residents) {
        return residents.stream()
                .filter(item -> item.id().equals(state.getFavoriteResidentId()))
                .findFirst().orElse(null);
    }

    public Map<String, Object> setHallTheme(AccountUser user, String themeId,
                                            String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String id = themeId == null ? "" : themeId.trim().toLowerCase(Locale.ROOT);
            if (!id.isBlank() && !HALL_THEMES.containsKey(id)) {
                throw new IllegalArgumentException("Unknown hall theme.");
            }
            state.setHallThemeId(id);
            HallTheme theme = HALL_THEMES.getOrDefault(id, HALL_THEMES.get("covenant"));
            return Map.of("themeChanged", Map.of("id", id.isBlank() ? "covenant" : id, "name", theme.name()));
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
            String grantedDecorationId = "";
            Map<String, Integer> orderCosts = null;
            boolean repeatableClaim = false;
            String rapportResidentId = "";
            int rapportAward = 0;
            if ("first_harvest".equals(id)) {
                if (state.getEssenceCollectCount() < 1) throw new IllegalArgumentException("Complete an elemental harvest first.");
                gold = 100;
                remnants = 25;
            } else if ("elemental_quarter".equals(id)) {
                if (!elementalFacilitiesAtLeast(state, 1)) throw new IllegalArgumentException("Complete all four elemental facilities first.");
                gold = 250;
                remnants = 75;
            } else if ("masterwork_keep".equals(id)) {
                if (state.getStorehouseLevel() < 2 || !elementalFacilitiesAtLeast(state, 2)) {
                    throw new IllegalArgumentException("Raise every elemental facility and the Storehouse to level 2 first.");
                }
                gold = 500;
                remnants = 150;
            } else if ("provisioned_keep".equals(id)) {
                if (facilityLevel(state, "quarry") < 1 || facilityLevel(state, "kitchen") < 1
                        || state.getBuildersYardLevel() < 1) {
                    throw new IllegalArgumentException("Open the Quarry and Kitchen, then raise the Builder's Yard first.");
                }
                gold = 300;
                remnants = 90;
            } else if ("weekly_tribute".equals(id)) {
                if (facilityLevel(state, "generator") < 1) throw new IllegalArgumentException("Build the Elemental Generator first.");
                Instant next = nextTributeAt(state);
                if (next != null && context.now().isBefore(next)) throw new IllegalArgumentException("The next sanctuary tribute is not ready yet.");
                double boost = 1 + favoriteBoost(state, context.residents());
                int totalLevels = totalBuildLevels(state);
                gold = (int) Math.round((150 + totalLevels * 35) * boost);
                remnants = (int) Math.round((25 + totalLevels * 8) * boost);
                claimKey = "weekly_tribute:" + weekKey(context.now());
                state.setLastTributeClaimedAt(context.now());
            } else if ("weekly_order".equals(id)) {
                if (facilityLevel(state, "kitchen") < 1) {
                    throw new IllegalArgumentException("Warm the Garden Kitchen before taking weekly orders.");
                }
                String week = weekKey(context.now());
                claimKey = "weekly_order:" + week;
                Map<String, Integer> requirements = weeklyOrderRequirements(state, week);
                if (requirements.isEmpty()) throw new IllegalArgumentException("This week's order is not ready yet.");
                requireMaterials(state, requirements, "order");
                orderCosts = requirements;
                double boost = 1 + favoriteBoost(state, context.residents());
                int totalLevels = totalBuildLevels(state);
                gold = (int) Math.round((90 + totalLevels * 20) * boost);
                remnants = (int) Math.round((15 + totalLevels * 5) * boost);
            } else if (id.startsWith("enclave_task:") || id.startsWith("enclave_mission:")) {
                // "enclave_mission:<residentId>" is the pre-rapport client's id; it still resolves
                // to the resident's first task so a cached page claims something sensible.
                String remainder = id.startsWith("enclave_task:")
                        ? id.substring("enclave_task:".length()) : id.substring("enclave_mission:".length());
                int split = remainder.indexOf(':');
                String residentId = split < 0 ? remainder : remainder.substring(0, split);
                String taskId = split < 0 ? "" : remainder.substring(split + 1);
                Resident resident = context.residents().stream().filter(item -> item.id().equals(residentId))
                        .findFirst().orElseThrow(() -> new IllegalArgumentException("That Siegeling task is no longer available."));
                if (state.getEnclaveLevel() < 1 || !normalizedEnclaveResidents(state).contains(residentId)) {
                    throw new IllegalArgumentException("Invite that Siegeling to the Enclave first.");
                }
                List<KeepEnclaveTaskCatalog.TaskDefinition> tasks = enclaveTasks(resident);
                KeepEnclaveTaskCatalog.TaskDefinition task = tasks.stream()
                        .filter(item -> item.id().equals(taskId)).findFirst()
                        .orElse(taskId.isBlank() && !tasks.isEmpty() ? tasks.get(0) : null);
                if (task == null) throw new IllegalArgumentException("That Siegeling task is no longer available.");
                if (enclaveTaskProgress(state, residentId, task) < task.goal()) {
                    throw new IllegalArgumentException("Complete " + resident.name() + "'s task first.");
                }
                // Tasks repeat, so banking one clears its progress instead of locking the id
                // away in the permanent claim set.
                repeatableClaim = true;
                state.getEnclaveTaskProgress().put(taskKey(residentId, task.id()), 0);
                state.getEnclaveTaskCompletions().merge(taskKey(residentId, task.id()), 1, Integer::sum);
                rapportResidentId = residentId;
                rapportAward = task.rapport();
                gold = task.gold();
                remnants = task.remnants();
            } else if (id.startsWith("keeper_level:")) {
                int lv;
                try { lv = Integer.parseInt(id.substring("keeper_level:".length())); }
                catch (NumberFormatException e) { throw new IllegalArgumentException("Unknown sanctuary reward."); }
                if (lv < 1 || lv > KEEPER_MAX_LEVEL) throw new IllegalArgumentException("Unknown sanctuary reward.");
                if (keeperLevel(state.getKeeperXp()) < lv) {
                    throw new IllegalArgumentException("Reach Keeper Level " + lv + " to claim that reward.");
                }
                KeeperReward levelReward = keeperReward(lv);
                gold = levelReward.gold();
                remnants = levelReward.remnants();
                grantedDecorationId = levelReward.decorationId();
                claimKey = "keeper_level:" + lv;
            } else {
                throw new IllegalArgumentException("Unknown sanctuary reward.");
            }
            PlayerProgressionEntity progression = context.progression();
            if (!repeatableClaim && progression.getKeepRewardClaimIds().contains(claimKey)) {
                throw new IllegalArgumentException("That sanctuary reward has already been claimed.");
            }
            if (orderCosts != null) spendMaterials(state, orderCosts);
            if (grantedDecorationId != null && !grantedDecorationId.isBlank()) {
                state.getCraftedItemCounts().merge(grantedDecorationId, 1, Integer::sum);
            }
            if (rapportAward > 0 && !rapportResidentId.isBlank()) {
                // Rapport raises every rate this resident feeds, so settle accrual at the old
                // rate before the new multiplier applies.
                materializeAllProduction(state, context.residents(), context.now());
                state.getResidentRapport().merge(rapportResidentId, rapportAward, Integer::sum);
            }
            progression.setGold(progression.getGold() + gold);
            progression.setRemnants(progression.getRemnants() + remnants);
            if (!repeatableClaim) progression.getKeepRewardClaimIds().add(claimKey);
            progression.setUpdatedAt(context.now());
            if (progressionStore != null) progressionStore.save(progression);
            // Completing a quest is itself a progression beat; claiming the battlepass
            // payout is not (that XP is what earned the level in the first place).
            int questXp = id.startsWith("keeper_level:") ? 0 : awardKeeperXp(state, KEEPER_QUEST_XP);
            Map<String, Object> reward = new LinkedHashMap<>();
            reward.put("id", id);
            reward.put("gold", gold);
            reward.put("remnants", remnants);
            reward.put("goldBalance", progression.getGold());
            reward.put("remnantsBalance", progression.getRemnants());
            if (questXp > 0) reward.put("keeperXpAwarded", questXp);
            if (grantedDecorationId != null && !grantedDecorationId.isBlank()) {
                reward.put("decorationId", grantedDecorationId);
                reward.put("decorationName", recipeName(grantedDecorationId));
            }
            if (rapportAward > 0 && !rapportResidentId.isBlank()) {
                final String bondedId = rapportResidentId;
                reward.put("rapportGained", rapportAward);
                reward.put("rapportResidentId", bondedId);
                reward.put("rapportResidentName", context.residents().stream()
                        .filter(item -> item.id().equals(bondedId)).map(Resident::name).findFirst().orElse(""));
                reward.put("rapport", serializeRapport(state, bondedId));
            }
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
            List<String> completedProjects = materializeConstructions(state, context.residents(), context.now());
            boolean completed = !completedProjects.isEmpty();
            boolean produced = materializeAllProduction(state, context.residents(), context.now());
            refreshVisitors(state, context.now());
            if (completed) {
                recordKeepStats(context.progression(),
                        p -> p.setKeepProjectsCompleted(p.getKeepProjectsCompleted() + completedProjects.size()));
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
        backfillKeeperXp(state);
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

    /** Completes every due project across all level-provided teams, earliest first. */
    private List<String> materializeConstructions(KeepState state, List<Resident> residents, Instant now) {
        List<String> completed = new ArrayList<>();
        while (true) {
            ConstructionSlot due = constructionSlotsInUse(state).stream()
                    .filter(slot -> slot.completesAt() != null && !now.isBefore(slot.completesAt()))
                    .min(Comparator.comparing(ConstructionSlot::completesAt))
                    .orElse(null);
            if (due == null) break;
            materializeAllProduction(state, residents, due.completesAt());
            applyConstructionEffects(state, due.id(), due.completesAt());
            clearConstruction(state, due.index());
            completed.add(due.id());
            awardKeeperXp(state, KEEPER_PROJECT_XP);
            advanceEnclaveTasks(state, residents, "CONSTRUCTION");
        }
        if (!completed.isEmpty()) materializeAllProduction(state, residents, now);
        return completed;
    }

    private List<ConstructionSlot> constructionSlotsInUse(KeepState state) {
        List<ConstructionSlot> out = new ArrayList<>();
        if (!state.getActiveConstructionId().isBlank()) {
            out.add(new ConstructionSlot(0, state.getActiveConstructionId(), state.getConstructionStartedAt(),
                    state.getConstructionCompletesAt()));
        }
        if (!state.getActiveConstructionId2().isBlank()) {
            out.add(new ConstructionSlot(1, state.getActiveConstructionId2(), state.getConstructionStartedAt2(),
                    state.getConstructionCompletesAt2()));
        }
        List<String> ids = state.getAdditionalConstructionIds();
        List<Instant> starts = state.getAdditionalConstructionStartedAts();
        List<Instant> completes = state.getAdditionalConstructionCompletesAts();
        for (int index = 0; index < ids.size(); index++) {
            String id = ids.get(index);
            if (id == null || id.isBlank()) continue;
            out.add(new ConstructionSlot(index + 2, id, index < starts.size() ? starts.get(index) : null,
                    index < completes.size() ? completes.get(index) : null));
        }
        return out;
    }

    private void clearConstruction(KeepState state, int index) {
        if (index == 0) {
            state.setActiveConstructionId("");
            state.setConstructionStartedAt(null);
            state.setConstructionCompletesAt(null);
            return;
        }
        if (index == 1) {
            state.setActiveConstructionId2("");
            state.setConstructionStartedAt2(null);
            state.setConstructionCompletesAt2(null);
            return;
        }
        int additionalIndex = index - 2;
        if (additionalIndex < state.getAdditionalConstructionIds().size()) {
            state.getAdditionalConstructionIds().remove(additionalIndex);
        }
        if (additionalIndex < state.getAdditionalConstructionStartedAts().size()) {
            state.getAdditionalConstructionStartedAts().remove(additionalIndex);
        }
        if (additionalIndex < state.getAdditionalConstructionCompletesAts().size()) {
            state.getAdditionalConstructionCompletesAts().remove(additionalIndex);
        }
    }

    private void applyConstructionEffects(KeepState state, String id, Instant completesAt) {
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
        } else if ("build_quarry".equals(id)) {
            completeFacilityLevel(state, "quarry", 1, completesAt);
        } else if ("build_kitchen".equals(id)) {
            completeFacilityLevel(state, "kitchen", 1, completesAt);
        } else if ("build_builders_yard".equals(id)) {
            state.setBuildersYardLevel(Math.max(1, state.getBuildersYardLevel()));
        } else if ("build_enclave".equals(id)) {
            state.setEnclaveLevel(1);
        } else if (id.startsWith("hall_level_")) {
            int level = parseHallLevel(id);
            if (level > 0) state.setHallLevel(Math.max(state.getHallLevel(), level));
        } else if (id.endsWith("_level_2")) {
            String facilityId = id.substring(0, id.length() - "_level_2".length());
            if (FACILITIES.containsKey(facilityId)) completeFacilityLevel(state, facilityId, 2, completesAt);
        }
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
        double rate = base * (1 + stationBonus(state, invited, "woodlot"));
        return rate * toolMultiplier(state, "woodlot") * (1 + favoriteBoost(state, residents));
    }

    /**
     * The fraction a resident adds to their station's output. Rapport multiplies it, so the
     * same partner is worth more once you have actually spent time with them.
     */
    private double stationBonus(KeepState state, Resident resident, String stationId) {
        return stationBonusPercent(state, resident, stationId) / 100.0;
    }

    private double stationBonusPercent(KeepState state, Resident resident, String stationId) {
        if (resident == null) return 0;
        KeepTuning tuning = tuning();
        int base;
        if ("woodlot".equals(stationId)) {
            base = stationAffinity(resident, stationId) ? tuning.woodlotAffinityPercent() : 0;
        } else if (stationAffinity(resident, stationId)) {
            base = tuning.facilityAffinityPercent();
        } else {
            base = "NEUTRAL".equals(resident.element()) ? tuning.facilityNeutralPercent() : 0;
        }
        return base * rapportMultiplier(state, resident.id());
    }

    private int woodlotStorageCapacity(KeepState state) {
        int base = state.getWoodlotLevel() >= 2 ? 360 : 120;
        return (int) Math.round(base * storageMultiplier(state));
    }

    private int timberInventoryCapacity(KeepState state) {
        return TIMBER_INVENTORY_CAPACITY + state.getStorehouseLevel() * 300
                + (hallLevel(state) - 1) * 50;
    }

    private int materialInventoryCapacity(KeepState state) {
        return 75 + state.getStorehouseLevel() * 125
                + (craftedCount(state, "covenant_crates") > 0 ? 75 : 0)
                + (hallLevel(state) - 1) * 15;
    }

    private int hallLevel(KeepState state) {
        return Math.min(HALL_MAX_LEVEL, Math.max(1, state.getHallLevel()));
    }

    private String rankName(int hallLevel) {
        return HALL_RANKS[Math.min(HALL_RANKS.length - 1, Math.max(0, hallLevel - 1))];
    }

    private double storageMultiplier(KeepState state) {
        return 1.0 + state.getStorehouseLevel() * .5;
    }

    private int facilityStorageCapacity(KeepState state, String id) {
        FacilityDefinition definition = FACILITIES.get(id);
        if (definition == null) return 0;
        return (int) Math.round(tuning().storage(id, definition.baseStorage())
                * Math.max(1, facilityLevel(state, id)) * storageMultiplier(state));
    }

    private double facilityRatePerMinute(String id) {
        FacilityDefinition definition = FACILITIES.get(id);
        return definition == null ? 0 : tuning().ratePerMinute(id, definition.baseRatePerMinute());
    }

    private double facilityRate(KeepState state, List<Resident> residents, String id) {
        FacilityDefinition definition = FACILITIES.get(id);
        if (definition == null || facilityLevel(state, id) < 1) return 0;
        String residentId = state.getFacilityResidentIds().getOrDefault(id, "");
        Resident resident = residents.stream().filter(item -> item.id().equals(residentId)).findFirst().orElse(null);
        double affinity = 1 + stationBonus(state, resident, id);
        double toolBonus = toolMultiplier(state, id);
        double networkBonus = craftedCount(state, "insulated_channels") > 0
                ? 1 + tuning().elementalNetworkPercent() / 100.0 : 1.0;
        return facilityRatePerMinute(id) * facilityLevel(state, id) * affinity * toolBonus * networkBonus
                * (1 + favoriteBoost(state, residents));
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
        advanceEnclaveTasks(state, context.residents(), "MATERIAL_COLLECTION");
        int xpGained = grantResourceKeeperXp(state, context.now(), KEEPER_MATERIAL_COLLECT_XP);
        Map<String, Object> collected = new LinkedHashMap<>();
        collected.put("collected", Map.of("resource", resourceId, "resourceName", definition.resourceName(),
                "amount", grant, "stationId", id));
        if (xpGained > 0) collected.put("keeperXpAwarded", xpGained);
        return collected;
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

    private LinkedHashSet<String> placedDecorationIds(KeepState state, String roomId) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        String stored = state.getPlacedDecorations().getOrDefault(roomId, "");
        for (String id : stored.split(",")) {
            String normalized = id.trim();
            if (!normalized.isBlank()) ids.add(normalized);
        }
        return ids;
    }

    private List<String> normalizedEnclaveResidents(KeepState state) {
        List<String> residents = new ArrayList<>(state.getEnclaveResidentIds());
        if (residents.size() > ENCLAVE_CAPACITY) residents = new ArrayList<>(residents.subList(0, ENCLAVE_CAPACITY));
        while (residents.size() < ENCLAVE_CAPACITY) residents.add("");
        return residents;
    }

    /** The rapport tasks a resident currently offers — element defaults, dashboard overrides,
        and one personal task bound to the Siegeling itself. */
    private List<KeepEnclaveTaskCatalog.TaskDefinition> enclaveTasks(Resident resident) {
        return KeepEnclaveTaskCatalog.tasksFor(tuning(), resident.id(), resident.name(), resident.element());
    }

    /**
     * Raises the progress bucket of every Enclave resident whose current task watches this
     * event. Progress is per task rather than per event type, so two residents asking for the
     * same kind of help each advance their own task.
     */
    private void advanceEnclaveTasks(KeepState state, List<Resident> residents, String eventType) {
        if (state.getEnclaveLevel() < 1) return;
        Map<String, Resident> byId = residents.stream().collect(Collectors.toMap(Resident::id,
                Function.identity(), (left, right) -> left, LinkedHashMap::new));
        for (String residentId : normalizedEnclaveResidents(state)) {
            if (residentId.isBlank()) continue;
            Resident resident = byId.get(residentId);
            if (resident == null) continue;
            for (KeepEnclaveTaskCatalog.TaskDefinition task : enclaveTasks(resident)) {
                if (!task.event().equals(eventType)) continue;
                String key = taskKey(residentId, task.id());
                if (state.getEnclaveTaskProgress().getOrDefault(key, 0) >= task.goal()) continue;
                state.getEnclaveTaskProgress().merge(key, 1, Integer::sum);
            }
        }
    }

    private static String taskKey(String residentId, String taskId) {
        return residentId + ":" + taskId;
    }

    private int enclaveTaskProgress(KeepState state, String residentId,
                                     KeepEnclaveTaskCatalog.TaskDefinition task) {
        return Math.min(task.goal(), Math.max(0,
                state.getEnclaveTaskProgress().getOrDefault(taskKey(residentId, task.id()), 0)));
    }

    private int enclaveTaskCompletions(KeepState state, String residentId,
                                        KeepEnclaveTaskCatalog.TaskDefinition task) {
        return Math.max(0, state.getEnclaveTaskCompletions().getOrDefault(taskKey(residentId, task.id()), 0));
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

    /** A blueprint with the dashboard's name/bonus/cost overrides applied. */
    private CraftRecipe recipeById(String id) {
        CraftRecipe shipped = RECIPES.get(id);
        return shipped == null ? null : applyTuning(shipped);
    }

    private List<CraftRecipe> allRecipes() {
        return RECIPES.values().stream().map(this::applyTuning).toList();
    }

    private CraftRecipe applyTuning(CraftRecipe recipe) {
        KeepTuning tuning = tuning();
        return new CraftRecipe(recipe.id(), tuning.recipeName(recipe.id(), recipe.name()), recipe.type(),
                recipe.roomId(), recipe.requiredLevel(), tuning.recipeCosts(recipe.id(), recipe.materialCosts()),
                recipe.repeatable(), recipe.description(),
                tuning.recipeBonusLabel(recipe.id(), recipe.bonusLabel()), recipe.tier(), recipe.prerequisiteId());
    }

    private boolean recipeRoomAvailable(KeepState state, CraftRecipe recipe) {
        if (!recipeRoomBuilt(state, recipe)) return false;
        if ("great_hall".equals(recipe.roomId())) return true;
        if ("woodlot".equals(recipe.roomId())) return state.getWoodlotLevel() >= recipe.requiredLevel();
        return facilityLevel(state, recipe.roomId()) >= recipe.requiredLevel();
    }

    private boolean recipeRoomBuilt(KeepState state, CraftRecipe recipe) {
        if ("great_hall".equals(recipe.roomId()) || "woodlot".equals(recipe.roomId())) return true;
        return FACILITIES.containsKey(recipe.roomId()) && facilityLevel(state, recipe.roomId()) > 0;
    }

    private boolean recipePrerequisiteMet(KeepState state, CraftRecipe recipe) {
        return recipe.prerequisiteId().isBlank() || craftedCount(state, recipe.prerequisiteId()) > 0;
    }

    private double toolMultiplier(KeepState state, String roomId) {
        long tier = RECIPES.values().stream().filter(recipe -> "TOOL".equals(recipe.type())
                        && roomId.equals(recipe.roomId()) && craftedCount(state, recipe.id()) > 0).count();
        return 1 + Math.min(5, tier) * (tuning().toolTierPercent() / 100.0);
    }

    private void completeFacilityLevel(KeepState state, String id, int level, Instant at) {
        if (!FACILITIES.containsKey(id)) return;
        state.getFacilityLevels().put(id, Math.max(level, facilityLevel(state, id)));
        state.getFacilityStored().putIfAbsent(id, 0);
        state.getFacilityProductionRemainders().putIfAbsent(id, 0.0);
        state.getFacilityResidentIds().putIfAbsent(id, "");
        state.getFacilityLastAccruedAt().put(id, at);
    }

    private boolean elementalFacilitiesAtLeast(KeepState state, int level) {
        return ELEMENTAL_FACILITIES.stream().allMatch(id -> facilityLevel(state, id) >= level);
    }

    private String constructionStatus(KeepState state, String levelOneId, String levelTwoId, int level) {
        if (isConstructing(state, levelOneId) || isConstructing(state, levelTwoId)) {
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
        out.put("resident", resident == null ? null : serializeResident(state, resident, id));
        out.put("resource", definition.resourceId());
        out.put("resourceName", definition.resourceName());
        out.put("isFull", available >= facilityStorageCapacity(state, id));
        out.put("affinities", definition.affinities());
        out.put("affinityNames", definition.affinities().stream().map(this::titleCase).toList());
        return out;
    }

    private Map<String, Object> offlineReport(KeepState state, Instant awaySince, Instant now,
                                               int timberBefore, Map<String, Integer> facilityBefore,
                                               List<String> completedProjects, List<String> beforeUnlocks) {
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
        for (String completedId : completedProjects == null ? List.<String>of() : completedProjects) {
            BuildProject project = buildProject(completedId);
            if (project != null) completed.add(project.name());
        }
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
        for (CraftRecipe recipe : allRecipes()) {
            boolean roomBuilt = recipeRoomBuilt(state, recipe);
            boolean levelMet = recipeRoomAvailable(state, recipe);
            boolean prerequisiteMet = recipePrerequisiteMet(state, recipe);
            boolean crafted = craftedCount(state, recipe.id()) > 0;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", recipe.id());
            item.put("name", recipe.name());
            item.put("type", recipe.type());
            item.put("description", recipe.description());
            item.put("roomId", recipe.roomId());
            item.put("requiredLevel", recipe.requiredLevel());
            item.put("tier", recipe.tier());
            item.put("prerequisiteMet", prerequisiteMet);
            item.put("levelMet", levelMet);
            item.put("costs", serializeMaterialCosts(recipe.materialCosts()));
            item.put("available", roomBuilt);
            item.put("crafted", crafted);
            item.put("count", craftedCount(state, recipe.id()));
            item.put("canCraft", levelMet && prerequisiteMet && hasMaterials(state, recipe.materialCosts()) && (recipe.repeatable() || !crafted));
            item.put("bonus", recipe.bonusLabel());
            out.add(item);
        }
        return out;
    }

    private List<Map<String, Object>> decorations(KeepState state) {
        return allRecipes().stream().filter(recipe -> "DECORATION".equals(recipe.type())).map(recipe -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", recipe.id());
            item.put("name", recipe.name());
            item.put("roomId", recipe.roomId());
            item.put("tier", recipe.tier());
            item.put("crafted", craftedCount(state, recipe.id()) > 0);
            item.put("displayed", placedDecorationIds(state, recipe.roomId()).contains(recipe.id()));
            return item;
        }).toList();
    }

    private Map<String, Object> enclave(KeepState state, PlayerProgressionEntity progression, List<Resident> residents) {
        Map<String, Resident> residentsById = residents.stream().collect(Collectors.toMap(Resident::id,
                Function.identity(), (left, right) -> left, LinkedHashMap::new));
        List<Map<String, Object>> slots = new ArrayList<>();
        List<String> assigned = normalizedEnclaveResidents(state);
        int readyTasks = 0;
        for (int index = 0; index < ENCLAVE_CAPACITY; index++) {
            String residentId = assigned.get(index);
            Resident resident = residentsById.get(residentId);
            Map<String, Object> slot = new LinkedHashMap<>();
            slot.put("slot", index);
            slot.put("residentId", resident == null ? "" : resident.id());
            slot.put("resident", resident == null ? null : serializeResident(state, resident));
            if (resident != null) {
                List<Map<String, Object>> tasks = new ArrayList<>();
                for (KeepEnclaveTaskCatalog.TaskDefinition task : enclaveTasks(resident)) {
                    int progress = enclaveTaskProgress(state, resident.id(), task);
                    boolean complete = progress >= task.goal();
                    if (complete) readyTasks++;
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", "enclave_task:" + resident.id() + ":" + task.id());
                    item.put("taskId", task.id());
                    item.put("name", task.name());
                    item.put("description", task.description());
                    item.put("event", task.event());
                    item.put("source", task.source());
                    item.put("progress", progress);
                    item.put("goal", task.goal());
                    item.put("complete", complete);
                    item.put("completions", enclaveTaskCompletions(state, resident.id(), task));
                    item.put("rapport", task.rapport());
                    item.put("gold", task.gold());
                    item.put("remnants", task.remnants());
                    tasks.add(item);
                }
                slot.put("tasks", tasks);
                slot.put("rapport", serializeRapport(state, resident.id()));
                // Legacy key: pre-rapport clients render a single mission card per slot.
                slot.put("mission", tasks.isEmpty() ? null : tasks.get(0));
            } else {
                slot.put("tasks", List.of());
                slot.put("rapport", null);
                slot.put("mission", null);
            }
            slots.add(slot);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("built", state.getEnclaveLevel() > 0);
        out.put("level", state.getEnclaveLevel());
        out.put("capacity", ENCLAVE_CAPACITY);
        out.put("residentCount", assigned.stream().filter(id -> !id.isBlank()).count());
        out.put("readyTaskCount", readyTasks);
        out.put("slots", slots);
        return out;
    }

    /** Where a Siegeling is currently working, so the Enclave can offer the unassigned ones
        first and tag the rest as a reassignment rather than a free invite. */
    private Map<String, Object> residentAssignment(KeepState state, String residentId) {
        Map<String, Object> out = new LinkedHashMap<>();
        String type = "";
        String id = "";
        String label = "";
        if (residentId.equals(state.getWoodlotResidentId())) {
            type = "STATION";
            id = "woodlot";
            label = "Restorative Woodlot";
        } else {
            for (Map.Entry<String, String> entry : state.getFacilityResidentIds().entrySet()) {
                if (residentId.equals(entry.getValue()) && facilityLevel(state, entry.getKey()) > 0) {
                    type = "STATION";
                    id = entry.getKey();
                    label = FACILITIES.getOrDefault(entry.getKey(), FacilityDefinition.EMPTY).name();
                    break;
                }
            }
            if (type.isEmpty() && state.getEnclaveLevel() > 0) {
                List<String> enclaveIds = normalizedEnclaveResidents(state);
                int slot = enclaveIds.indexOf(residentId);
                if (slot >= 0) {
                    type = "ENCLAVE";
                    id = String.valueOf(slot);
                    label = "Enclave space " + (slot + 1);
                }
            }
        }
        out.put("assigned", !type.isEmpty());
        out.put("type", type);
        out.put("id", id);
        out.put("label", label);
        return out;
    }

    private List<Map<String, Object>> milestones(KeepState state, PlayerProgressionEntity progression, Instant now) {
        List<Map<String, Object>> out = new ArrayList<>();
        out.add(milestone(progression, "first_harvest", "First Elemental Harvest",
                "Collect a crafted material from any facility.", state.getEssenceCollectCount() >= 1, 100, 25));
        out.add(milestone(progression, "elemental_quarter", "A Quarter in Accord",
                "Build the Garden, Forge, Fridge, and Generator.", elementalFacilitiesAtLeast(state, 1), 250, 75));
        out.add(milestone(progression, "provisioned_keep", "A Keep Provisioned",
                "Open the Quarry and Kitchen, then raise the Builder's Yard.",
                facilityLevel(state, "quarry") >= 1 && facilityLevel(state, "kitchen") >= 1
                        && state.getBuildersYardLevel() >= 1, 300, 90));
        out.add(milestone(progression, "masterwork_keep", "Masterwork Keep",
                "Raise every elemental facility and the Storehouse to level 2.",
                state.getStorehouseLevel() >= 2 && elementalFacilitiesAtLeast(state, 2), 500, 150));
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

    private Map<String, Object> weeklyTribute(KeepState state, PlayerProgressionEntity progression,
                                              List<Resident> residents, Instant now) {
        boolean unlocked = facilityLevel(state, "generator") >= 1;
        Instant next = nextTributeAt(state);
        boolean ready = unlocked && (next == null || !now.isBefore(next));
        double boost = 1 + favoriteBoost(state, residents);
        int totalLevels = totalBuildLevels(state);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", "weekly_tribute");
        out.put("unlocked", unlocked);
        out.put("ready", ready);
        out.put("nextClaimAt", next == null ? null : next.toString());
        out.put("reward", Map.of("gold", (int) Math.round((150 + totalLevels * 35) * boost),
                "remnants", (int) Math.round((25 + totalLevels * 8) * boost)));
        return out;
    }

    private int totalBuildLevels(KeepState state) {
        return state.getStorehouseLevel() + state.getWoodlotLevel() + state.getBuildersYardLevel()
                + FACILITIES.keySet().stream().mapToInt(id -> facilityLevel(state, id)).sum();
    }

    /** A deterministic weekly crafting order rotates through the built workshops. */
    private Map<String, Integer> weeklyOrderRequirements(KeepState state, String week) {
        List<FacilityDefinition> built = FACILITIES.values().stream()
                .filter(definition -> facilityLevel(state, definition.id()) >= 1).toList();
        if (built.isEmpty()) return Map.of();
        int seed = week.hashCode();
        Map<String, Integer> out = new LinkedHashMap<>();
        int picks = Math.min(3, built.size());
        for (int i = 0; i < picks; i++) {
            FacilityDefinition definition = built.get(Math.floorMod(seed + i * 7, built.size()));
            int amount = 4 + Math.floorMod(seed >> (2 + i), 4) + facilityLevel(state, definition.id()) * 2;
            out.merge(definition.resourceId(), amount, Integer::sum);
        }
        return out;
    }

    private Map<String, Object> weeklyOrder(KeepState state, PlayerProgressionEntity progression,
                                            List<Resident> residents, Instant now) {
        boolean unlocked = facilityLevel(state, "kitchen") >= 1;
        String week = weekKey(now);
        boolean claimed = progression.getKeepRewardClaimIds().contains("weekly_order:" + week);
        Map<String, Integer> requirements = unlocked ? weeklyOrderRequirements(state, week) : Map.of();
        double boost = 1 + favoriteBoost(state, residents);
        int totalLevels = totalBuildLevels(state);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", "weekly_order");
        out.put("unlocked", unlocked);
        out.put("week", week);
        out.put("claimed", claimed);
        out.put("requirements", requirements.entrySet().stream().map(entry -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", entry.getKey());
            item.put("name", materialName(entry.getKey()));
            item.put("amount", entry.getValue());
            item.put("have", state.getMaterialInventory().getOrDefault(entry.getKey(), 0));
            return item;
        }).toList());
        out.put("canClaim", unlocked && !claimed && !requirements.isEmpty() && hasMaterials(state, requirements));
        out.put("reward", Map.of("gold", (int) Math.round((90 + totalLevels * 20) * boost),
                "remnants", (int) Math.round((15 + totalLevels * 5) * boost)));
        return out;
    }

    private Instant nextTributeAt(KeepState state) {
        return state.getLastTributeClaimedAt() == null ? null : state.getLastTributeClaimedAt().plus(TRIBUTE_COOLDOWN);
    }

    private String weekKey(Instant now) {
        LocalDate date = now.atZone(ZoneOffset.UTC).toLocalDate();
        return date.get(IsoFields.WEEK_BASED_YEAR) + "-W" + date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
    }

    /** Construction project with the dashboard's cost/duration overrides applied. */
    private BuildProject buildProject(String id) {
        BuildProject shipped = shippedBuildProject(id);
        if (shipped == null) return null;
        KeepTuning tuning = tuning();
        return new BuildProject(shipped.id(), shipped.name(),
                tuning.timberCost(shipped.id(), shipped.timberCost()), shipped.materialCosts(),
                tuning.durationSeconds(shipped.id(), shipped.durationSeconds()));
    }

    /** Every project id the dashboard may retune, in the order players meet them. */
    private static final List<String> PROJECT_IDS = List.of(
            "restore_archive", "woodlot_level_2", "raise_storehouse", "build_garden", "build_forge",
            "build_fridge", "build_generator", "build_quarry", "build_kitchen", "build_builders_yard",
            "build_enclave", "storehouse_level_2", "garden_level_2", "forge_level_2", "fridge_level_2",
            "generator_level_2", "quarry_level_2", "kitchen_level_2", "hall_level_2", "hall_level_3",
            "hall_level_4", "hall_level_5", "hall_level_6", "hall_level_7", "hall_level_8");

    /** Shipped workshop output, for the dashboard's "default" column. */
    public static List<Map<String, Object>> shippedBuildingDefaults() {
        List<Map<String, Object>> out = new ArrayList<>();
        FACILITIES.forEach((id, definition) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", id);
            item.put("name", definition.name());
            item.put("resourceName", definition.resourceName());
            item.put("ratePerMinute", definition.baseRatePerMinute());
            item.put("storage", definition.baseStorage());
            out.add(item);
        });
        return out;
    }

    /** Shipped construction cost and duration for every retunable project. */
    public static List<Map<String, Object>> shippedProjectDefaults() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String id : PROJECT_IDS) {
            BuildProject project = shippedBuildProject(id);
            if (project == null) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", project.id());
            item.put("name", project.name());
            item.put("timberCost", project.timberCost());
            item.put("seconds", project.durationSeconds());
            item.put("materialCosts", project.materialCosts());
            out.add(item);
        }
        return out;
    }

    /** Shipped tool and decoration blueprints, grouped by the room that hosts them. */
    public static List<Map<String, Object>> shippedRecipeDefaults() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CraftRecipe recipe : RECIPES.values()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", recipe.id());
            item.put("name", recipe.name());
            item.put("type", recipe.type());
            item.put("roomId", recipe.roomId());
            item.put("tier", recipe.tier());
            item.put("bonusLabel", recipe.bonusLabel());
            item.put("costs", recipe.materialCosts());
            out.add(item);
        }
        return out;
    }

    private static BuildProject shippedBuildProject(String id) {
        if (id == null || id.isBlank()) return null;
        return switch (id) {
            case "restore_archive" -> new BuildProject(id, "Restore the Living Archive", ARCHIVE_RESTORE_COST, Map.of(), ARCHIVE_RESTORE_SECONDS);
            case "woodlot_level_2" -> new BuildProject(id, "Cultivate the Woodlot", WOODLOT_LEVEL_TWO_COST, Map.of(), WOODLOT_LEVEL_TWO_SECONDS);
            case "raise_storehouse" -> new BuildProject(id, "Raise the Covenant Storehouse", STOREHOUSE_LEVEL_ONE_COST, Map.of(), STOREHOUSE_LEVEL_ONE_SECONDS);
            case "build_garden" -> new BuildProject(id, "Plant the Covenant Garden", GARDEN_LEVEL_ONE_COST, Map.of(), GARDEN_LEVEL_ONE_SECONDS);
            case "build_forge" -> new BuildProject(id, "Kindle the Accord Forge", FORGE_LEVEL_ONE_COST, Map.of(), FORGE_LEVEL_ONE_SECONDS);
            case "build_fridge" -> new BuildProject(id, "Raise the Frost Fridge", FRIDGE_LEVEL_ONE_COST, Map.of(), FRIDGE_LEVEL_ONE_SECONDS);
            case "build_generator" -> new BuildProject(id, "Tune the Elemental Generator", GENERATOR_LEVEL_ONE_COST, Map.of(), GENERATOR_LEVEL_ONE_SECONDS);
            case "build_quarry" -> new BuildProject(id, "Open the Covenant Quarry", 240, Map.of(), 7_200);
            case "build_kitchen" -> new BuildProject(id, "Warm the Garden Kitchen", 210, Map.of(), 5_400);
            case "build_builders_yard" -> new BuildProject(id, "Raise the Builder's Yard", 260, Map.of("stone", 18), 10_800);
            case "build_enclave" -> new BuildProject(id, "Raise the Siegeling Enclave", ENCLAVE_BUILD_COST, Map.of(), ENCLAVE_BUILD_SECONDS);
            case "storehouse_level_2" -> new BuildProject(id, "Vault the Storehouse", 320,
                    Map.of("verdant_fiber", 18, "ember_ingot", 12, "frost_crystal", 12, "storm_cell", 8), 28_800);
            case "hall_level_2" -> new BuildProject(id, "Raise the Timber Outpost", 120, Map.of(), 900);
            case "hall_level_3" -> new BuildProject(id, "Settle the Courtyard", 220, Map.of(), 5_400);
            case "hall_level_4" -> new BuildProject(id, "Cut the Stonehold", 300,
                    Map.of("stone", 16, "ember_ingot", 10), 14_400);
            case "hall_level_5" -> new BuildProject(id, "Raise the Keep Walls", 380,
                    Map.of("stone", 22, "verdant_fiber", 12, "ember_ingot", 12), 28_800);
            case "hall_level_6" -> new BuildProject(id, "Awaken the Elemental Stronghold", 460,
                    Map.of("verdant_fiber", 16, "ember_ingot", 16, "frost_crystal", 12, "storm_cell", 10), 43_200);
            case "hall_level_7" -> new BuildProject(id, "Crown the High Castle", 540,
                    Map.of("verdant_fiber", 22, "ember_ingot", 22, "frost_crystal", 18, "storm_cell", 14), 64_800);
            case "hall_level_8" -> new BuildProject(id, "Consecrate the Grand Keep", 640,
                    Map.of("verdant_fiber", 28, "ember_ingot", 28, "frost_crystal", 22, "storm_cell", 18), 86_400);
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
            case "build_quarry" -> state.getStorehouseLevel() >= 1 && facilityLevel(state, "quarry") < 1;
            case "build_kitchen" -> state.getStorehouseLevel() >= 1 && facilityLevel(state, "kitchen") < 1;
            case "build_builders_yard" -> facilityLevel(state, "quarry") >= 1 && state.getBuildersYardLevel() < 1;
            case "build_enclave" -> state.getArchiveLevel() >= 1 && state.getEnclaveLevel() < 1;
            case "storehouse_level_2" -> elementalFacilitiesAtLeast(state, 1) && state.getStorehouseLevel() < 2
                    && state.getBuildersYardLevel() >= 1;
            case "hall_level_2", "hall_level_3", "hall_level_4", "hall_level_5",
                 "hall_level_6", "hall_level_7", "hall_level_8" -> {
                int level = parseHallLevel(id);
                yield hallLevel(state) == level - 1 && hallUpgradeGateMet(state, level);
            }
            default -> {
                String facilityId = id.endsWith("_level_2")
                        ? id.substring(0, id.length() - "_level_2".length()) : "";
                yield FACILITIES.containsKey(facilityId) && facilityLevel(state, facilityId) == 1
                        && state.getBuildersYardLevel() >= 1;
            }
        };
        if (!valid) throw new IllegalArgumentException("That project is not available yet.");
        int requiredLevel = keeperUnlockLevel(project.id());
        if (keeperLevel(state.getKeeperXp()) < requiredLevel) {
            throw new IllegalArgumentException("Reach Keeper Level " + requiredLevel + " to begin this project.");
        }
    }

    private int parseHallLevel(String projectId) {
        if (projectId == null || !projectId.startsWith("hall_level_")) return 0;
        try {
            int level = Integer.parseInt(projectId.substring("hall_level_".length()));
            return level >= 2 && level <= HALL_MAX_LEVEL ? level : 0;
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    /** Each keep rank requires the restoration chain that thematically precedes it. */
    private boolean hallUpgradeGateMet(KeepState state, int level) {
        return switch (level) {
            case 2 -> state.getArchiveLevel() >= 1;
            case 3 -> state.getWoodlotLevel() >= 2 && state.getStorehouseLevel() >= 1;
            case 4 -> facilityLevel(state, "quarry") >= 1
                    && ELEMENTAL_FACILITIES.stream().filter(id -> facilityLevel(state, id) >= 1).count() >= 2;
            case 5 -> elementalFacilitiesAtLeast(state, 1);
            case 6 -> state.getStorehouseLevel() >= 2;
            case 7 -> elementalFacilitiesAtLeast(state, 2);
            case 8 -> elementalFacilitiesAtLeast(state, 2) && state.getStorehouseLevel() >= 2
                    && FACILITIES.values().stream().allMatch(definition -> craftedCount(state, definition.toolRecipeId()) > 0);
            default -> false;
        };
    }

    private String hallUpgradeGateHint(int level) {
        return switch (level) {
            case 2 -> "Restore the Living Archive to plan the outpost.";
            case 3 -> "Cultivate the Woodlot and raise the Storehouse first.";
            case 4 -> "Open the Covenant Quarry and two elemental workshops to cut stone footings.";
            case 5 -> "Complete all four elemental facilities to enclose the yard.";
            case 6 -> "Vault the Storehouse to channel the elements through the walls.";
            case 7 -> "Expand every elemental facility to level 2.";
            case 8 -> "Craft every workshop tool to consecrate the keep.";
            default -> "";
        };
    }

    private String hallUpgradeDescription(int level) {
        return switch (level) {
            case 2 -> "Timber palisade posts, a proper roof, and a second banner over the hall.";
            case 3 -> "A settled courtyard: paths, planters, and lantern light around the hall.";
            case 4 -> "Stone footings replace timber — the hall gains masonry and a taller silhouette.";
            case 5 -> "Curtain walls and a gate enclose the sanctuary. The keep becomes a true stronghold.";
            case 6 -> "The towers awaken with elemental light drawn from every workshop.";
            case 7 -> "A high crown of banners and beacons visible from Akhar's distant front.";
            case 8 -> "The central landmark is consecrated — the Grand Keep stands complete.";
            default -> "";
        };
    }

    private static Map<String, Integer> levelTwoMaterialCosts(String facilityId) {
        return switch (facilityId) {
            case "garden" -> Map.of("frost_crystal", 18, "ember_ingot", 14);
            case "forge" -> Map.of("verdant_fiber", 24, "storm_cell", 10);
            case "fridge" -> Map.of("verdant_fiber", 20, "ember_ingot", 16);
            case "generator" -> Map.of("verdant_fiber", 12, "ember_ingot", 12, "frost_crystal", 12);
            case "quarry" -> Map.of("ember_ingot", 14, "storm_cell", 8);
            case "kitchen" -> Map.of("stone", 14, "frost_crystal", 10);
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
        out.put("quarry", new FacilityDefinition("quarry", "Covenant Quarry", "Collapsed Quarry",
                "stone", "Cut Stone", .22, 110, Set.of("EARTH", "METAL", "FIRE", "UNDEAD"),
                "mason_mauls", "Open the Quarry for cut stone that raises the Builder's Yard, keep ranks, and heavy construction."));
        out.put("kitchen", new FacilityDefinition("kitchen", "Garden Kitchen", "Cold Kitchen",
                "provisions", "Provisions", .30, 100, Set.of("WATER", "FIRE", "EARTH", "LIGHT", "NEUTRAL"),
                "hearth_set", "Warm the Kitchen for provisions that fill weekly orders and feed visiting Siegelings."));
        return out;
    }

    private static Map<String, CraftRecipe> createRecipes() {
        Map<String, CraftRecipe> out = new LinkedHashMap<>();
        out.put("gardener_tools", new CraftRecipe("gardener_tools", "Rootwise Pruning Kit", "TOOL", "garden", 1,
                Map.of("verdant_fiber", 12, "ember_ingot", 6), false,
                "Tools designed with resident guidance increase Garden production.", "Garden output +20%", 1, ""));
        out.put("tempered_tongs", new CraftRecipe("tempered_tongs", "Consent-Forged Tongs", "TOOL", "forge", 1,
                Map.of("ember_ingot", 12, "frost_crystal", 5), false,
                "Cold-gripped tongs let partners work the forge without being bound to its heat.", "Forge output +20%", 1, ""));
        out.put("coldseal_kit", new CraftRecipe("coldseal_kit", "Coldseal Preservation Kit", "TOOL", "fridge", 1,
                Map.of("frost_crystal", 12, "verdant_fiber", 8), false,
                "Woven seals hold a steady frost while leaving the resident free to rest.", "Fridge output +20%", 1, ""));
        out.put("tuning_key", new CraftRecipe("tuning_key", "Resonance Tuning Key", "TOOL", "generator", 1,
                Map.of("storm_cell", 10, "ember_ingot", 6), false,
                "A many-element key balances the shared current instead of forcing it.", "Generator output +20%", 1, ""));
        out.put("covenant_crates", new CraftRecipe("covenant_crates", "Covenant Storage Crates", "BONUS", "great_hall", 1,
                Map.of("verdant_fiber", 18, "ember_ingot", 10), false,
                "Labeled modular crates make every elemental material easier to preserve.", "+75 material capacity", 0, ""));
        out.put("insulated_channels", new CraftRecipe("insulated_channels", "Insulated Element Channels", "BONUS", "generator", 1,
                Map.of("frost_crystal", 10, "storm_cell", 10), false,
                "Balanced channels carry surplus power safely between every workshop.", "All elemental output +10%", 0, ""));
        out.put("living_trellis", new CraftRecipe("living_trellis", "Living Covenant Trellis", "DECORATION", "garden", 1,
                Map.of("verdant_fiber", 8), false,
                "A flowering trellis that bends toward willing elemental partners.", "Garden interior decoration", 1, ""));
        out.put("ember_lantern", new CraftRecipe("ember_lantern", "Emberglass Lantern", "DECORATION", "forge", 1,
                Map.of("ember_ingot", 7), false,
                "A warm lantern whose flame dims whenever the Forge resident rests.", "Forge interior decoration", 1, ""));
        out.put("frostglass_mobile", new CraftRecipe("frostglass_mobile", "Frostglass Memory Mobile", "DECORATION", "fridge", 1,
                Map.of("frost_crystal", 7), false,
                "Chimes of preserved ice replay faint impressions from the sanctuary.", "Fridge interior decoration", 1, ""));
        out.put("harmonic_orb", new CraftRecipe("harmonic_orb", "Harmonic Current Orb", "DECORATION", "generator", 1,
                Map.of("storm_cell", 6), false,
                "A hovering model of the four workshop currents moving in accord.", "Generator interior decoration", 1, ""));
        out.put("covenant_tapestry", new CraftRecipe("covenant_tapestry", "Tapestry of Four Currents", "DECORATION", "great_hall", 1,
                Map.of("verdant_fiber", 4, "ember_ingot", 4, "frost_crystal", 4, "storm_cell", 4), false,
                "A hall tapestry woven from every material produced by the Keep.", "Covenant Hall decoration", 1, ""));
        out.put("mason_mauls", new CraftRecipe("mason_mauls", "Stonewise Mason Mauls", "TOOL", "quarry", 1,
                Map.of("stone", 12, "ember_ingot", 6), false,
                "Balanced mauls split stone along its willing grain instead of forcing it.", "Quarry output +20%", 1, ""));
        out.put("hearth_set", new CraftRecipe("hearth_set", "Shared-Table Hearth Set", "TOOL", "kitchen", 1,
                Map.of("stone", 8, "ember_ingot", 8), false,
                "Pots sized for residents and visitors alike keep the kitchen turning.", "Kitchen output +20%", 1, ""));
        out.put("stone_sentinel", new CraftRecipe("stone_sentinel", "Quarry Stone Sentinel", "DECORATION", "quarry", 1,
                Map.of("stone", 8), false,
                "A carved guardian watching over the cut faces of the quarry.", "Quarry interior decoration", 1, ""));
        out.put("hearth_garland", new CraftRecipe("hearth_garland", "Harvest Hearth Garland", "DECORATION", "kitchen", 1,
                Map.of("provisions", 7), false,
                "Dried blooms and braided grain hung over the kitchen hearth.", "Kitchen interior decoration", 1, ""));

        out.put("coppice_hooks", new CraftRecipe("coppice_hooks", "Coppice Hooks", "TOOL", "woodlot", 1,
                Map.of("verdant_fiber", 8), false,
                "Curved hooks guide fallen growth without scarring living trunks.", "Woodlot output +20%", 1, ""));
        out.put("carved_waypost", new CraftRecipe("carved_waypost", "Carved Covenant Waypost", "DECORATION", "woodlot", 1,
                Map.of("verdant_fiber", 6), false,
                "A waypost marking the paths the grove has agreed to share.", "Woodlot interior decoration", 1, ""));

        addRoomExpansions(out, "woodlot", "Woodlot", "verdant_fiber", new String[]{"ember_ingot", "stone"}, "coppice_hooks",
                new String[][]{
                        {"sapling_spades", "Sapling Spades", "Narrow iron blades lift seedlings without tearing the root ball."},
                        {"resin_saws", "Resin-Safe Saws", "Cold-set teeth cut without heating resin, so a wounded trunk still seals itself."},
                        {"grove_pulleys", "Grove Pulleys", "Counterweighted lines carry fallen limbs out of the grove instead of dragging them through it."},
                        {"renewal_rig", "Renewal Harvest Rig", "A rolling frame that fells, sorts, and replants in one pass agreed with the grove."}},
                new String[][]{
                        {"seedling_rack", "Seedling Rack", "Stepped trays where next season's saplings wait out the frost."},
                        {"sunwoven_blind", "Sunwoven Blind", "A rolled blind of split cane that rations the grove window's light."},
                        {"moss_lanterns", "Moss Lanterns", "Glass jars of luminous moss hung from the rafters, fed on nothing but damp air."},
                        {"covenant_chimes", "Covenant Wind Chimes", "Hollow limbs tuned to the grove's own creak, hung where the door draught reaches them."}});
        addRoomExpansions(out, "garden", "Garden", "verdant_fiber", new String[]{"frost_crystal", "stone"}, "gardener_tools",
                new String[][]{
                        {"dewline_irrigator", "Dewline Irrigator", "Chilled coils pull water from morning air so the beds never draw down the spring."},
                        {"pollinator_lanterns", "Pollinator Lanterns", "Soft lights that invite night pollinators to work the beds on their own schedule."},
                        {"root_survey_table", "Root Survey Table", "A glass-topped table for reading root maps before a single bed is disturbed."},
                        {"symbiotic_trellis_rig", "Symbiotic Trellis Rig", "Movable frames that let climbing growth choose its own direction each season."}},
                new String[][]{
                        {"seed_banners", "Seed Banners", "Linen pouches hung in rows, each holding a strain the garden has promised to keep."},
                        {"rain_basin", "Rain Basin", "A shallow catch basin of polished stone that keeps the bed edges damp."},
                        {"blossom_arch", "Blossom Arch", "A flowering arch framing the garden window, replanted every spring."},
                        {"covenant_topiary", "Covenant Topiary", "A shrub clipped into the sanctuary's mark, trimmed only where it agrees to grow."}});
        addRoomExpansions(out, "forge", "Forge", "ember_ingot", new String[]{"stone", "storm_cell"}, "tempered_tongs",
                new String[][]{
                        {"ember_bellows", "Ember Bellows", "Stone-weighted bellows hold an even heat without anyone pumping through the night."},
                        {"resonance_anvil", "Resonance Anvil", "A tuned face that rings the moment metal is worked past its willingness."},
                        {"cooling_rack", "Balanced Cooling Rack", "Staged racks let finished work cool slowly instead of being quenched in shock."},
                        {"accord_hammer", "Hammer of Accord", "A charged head that shapes with pressure rather than force."}},
                new String[][]{
                        {"oathwork_shield", "Oathwork Shield", "A ceremonial shield hung above the bellows, never carried into a fight."},
                        {"spark_banner", "Spark Banner", "Scorch-dyed cloth that catches every flare thrown from the hearth."},
                        {"ingot_mosaic", "Ingot Mosaic", "Offcut ingots set into the forge floor in a spiral of cooling colors."},
                        {"forge_chimes", "Forge Chimes", "Failed blade blanks rehung as chimes, so nothing made here is wasted."}});
        addRoomExpansions(out, "fridge", "Fridge", "frost_crystal", new String[]{"verdant_fiber", "storm_cell"}, "coldseal_kit",
                new String[][]{
                        {"crystal_tongs", "Crystal Tongs", "Fiber-wrapped grips move raw crystal without leaching warmth into it."},
                        {"hoarfrost_shelves", "Hoarfrost Shelves", "Deep shelves that hold their own frost line without a resident tending them."},
                        {"thermal_gauge", "Thermal Accord Gauge", "A charged gauge that warns before the vault chills past what stored life can take."},
                        {"stasis_cabinet", "Stasis Cabinet", "A sealed cabinet where nothing ages and nothing is forced to stay."}},
                new String[][]{
                        {"snowflake_screen", "Snowflake Screen", "A folding screen of frosted panes that breaks the vault draught."},
                        {"memory_crystals", "Memory Crystals", "A cluster of clouded crystals that replay the day they were cut."},
                        {"aurora_lamp", "Aurora Lamp", "A charged ribbon of light drawn across the ceiling like a captive aurora."},
                        {"ice_sculpture", "Covenant Ice Sculpture", "A carved figure that renews itself from the vault's own frost."}});
        addRoomExpansions(out, "generator", "Generator", "storm_cell", new String[]{"ember_ingot", "frost_crystal"}, "tuning_key",
                new String[][]{
                        {"balanced_coils", "Balanced Coils", "Paired coils share the load so neither side of the current is overdrawn."},
                        {"current_dampers", "Current Dampers", "Frost-cored dampers absorb the surges that used to shake the workshop."},
                        {"spectrum_console", "Spectrum Console", "A wide console that reads all four workshop currents at once."},
                        {"maestro_regulator", "Maestro Regulator", "A regulator that conducts the whole keep's power like a held chord."}},
                new String[][]{
                        {"prism_banners", "Prism Banners", "Split-light banners that scatter the conduit glow across the back wall."},
                        {"conduit_globe", "Conduit Globe", "A glass globe holding a slow, contained storm on a brass stand."},
                        {"thunder_chimes", "Thunder Chimes", "Hanging rods that answer the coils with a low roll of sound."},
                        {"covenant_orrery", "Covenant Orrery", "Nested rings modelling every workshop current turning in accord."}});
        addRoomExpansions(out, "quarry", "Quarry", "stone", new String[]{"ember_ingot", "verdant_fiber"}, "mason_mauls",
                new String[][]{
                        {"grain_compass", "Stone-Grain Compass", "An iron needle that finds the seam a block is already willing to split along."},
                        {"dustless_chisel", "Dustless Chisel", "A damped chisel that keeps cutting dust out of the diggers' lungs."},
                        {"counterweight_crane", "Counterweight Crane", "Rope and counterweight lift cut blocks that no resident should be asked to carry."},
                        {"covenant_cutter", "Covenant Stone Cutter", "A guided cutter that takes only the stone the face has already loosened."}},
                new String[][]{
                        {"rune_mosaic", "Runestone Mosaic", "Quarry marks reset into the back wall as a record of every face worked."},
                        {"crystal_sconce", "Crystal Sconce", "A wall sconce of quarry crystal that keeps the cut faces readable."},
                        {"mason_banner", "Mason Banner", "A dust-grey banner carrying the marks of every mason who worked here."},
                        {"echo_fountain", "Echo Fountain", "A basin cut from a single block; the quarry answers whatever is said over it."}});
        addRoomExpansions(out, "kitchen", "Kitchen", "provisions", new String[]{"verdant_fiber", "stone"}, "hearth_set",
                new String[][]{
                        {"garden_knives", "Garden Knives", "Fiber-handled knives sized for hands and claws alike."},
                        {"preserving_jars", "Preserving Jars", "Stone-stoppered jars that hold a season's surplus without a cold vault."},
                        {"shared_oven", "Shared Hearth Oven", "A second oven mouth so visitors can cook beside the residents, not after them."},
                        {"abundance_table", "Table of Abundance", "A long table built so no one at the meal sits at its end."}},
                new String[][]{
                        {"painted_crocks", "Painted Crocks", "Glazed crocks painted by residents with the meal each one holds."},
                        {"recipe_tapestry", "Recipe Tapestry", "A woven record of every dish the sanctuary has cooked for a guest."},
                        {"communal_bench", "Communal Bench", "A low bench pulled up to the hearth for whoever arrives hungry."},
                        {"lantern_wreath", "Lantern Wreath", "A ring of small lanterns hung over the table for late meals."}});
        return out;
    }

    /**
     * Room expansions deliberately cost the workshop's own material plus one or two partner
     * materials, so later tiers cannot be finished by farming a single station. The partner
     * amounts stay small at tier 2 and grow with the tier to keep the first expansion reachable.
     */
    private static void addRoomExpansions(Map<String, CraftRecipe> out, String roomId, String roomName,
                                          String resourceId, String[] partnerResourceIds, String firstToolId,
                                          String[][] tools, String[][] decorations) {
        String previous = firstToolId;
        for (int index = 0; index < tools.length; index++) {
            int tier = index + 2;
            String id = tools[index][0];
            out.put(id, new CraftRecipe(id, tools[index][1], "TOOL", roomId, tier >= 4 ? 2 : 1,
                    expansionCost(resourceId, partnerResourceIds, 8 + tier * 4, tier, true), false,
                    tools[index][2], roomName + " output +20%", tier, previous));
            previous = id;
        }
        for (int index = 0; index < decorations.length; index++) {
            int tier = index + 2;
            String id = decorations[index][0];
            out.put(id, new CraftRecipe(id, decorations[index][1], "DECORATION", roomId, tier >= 4 ? 2 : 1,
                    expansionCost(resourceId, partnerResourceIds, 4 + tier * 3, tier, false), false,
                    decorations[index][2], roomName + " interior decoration", tier, ""));
        }
    }

    private static Map<String, Integer> expansionCost(String resourceId, String[] partnerResourceIds,
                                                      int primaryAmount, int tier, boolean tool) {
        Map<String, Integer> costs = new LinkedHashMap<>();
        costs.put(resourceId, primaryAmount);
        int first = tool ? 2 * tier : tier + 1;
        int second = tool ? 2 * tier - 3 : tier - 1;
        if (partnerResourceIds.length > 0) costs.merge(partnerResourceIds[0], first, Integer::sum);
        if (partnerResourceIds.length > 1 && tier >= 4) costs.merge(partnerResourceIds[1], second, Integer::sum);
        return java.util.Collections.unmodifiableMap(costs);
    }

    private static Map<String, HallTheme> createHallThemes() {
        Map<String, HallTheme> out = new LinkedHashMap<>();
        out.put("covenant", new HallTheme("covenant", "Covenant Gold", "#f4cc62", "#b96b3e"));
        out.put("ember", new HallTheme("ember", "Ember Accord", "#ff6a3d", "#8e3225"));
        out.put("verdant", new HallTheme("verdant", "Verdant Bough", "#8fce6f", "#3f6b3a"));
        out.put("tide", new HallTheme("tide", "Tidewoven", "#4da8ff", "#2a5b8e"));
        out.put("frost", new HallTheme("frost", "Frostglass", "#a9e8f2", "#4a7f8b"));
        out.put("storm", new HallTheme("storm", "Stormcall", "#ffe63c", "#6d5c15"));
        out.put("shadow", new HallTheme("shadow", "Shadowveil", "#b087e0", "#4d3a70"));
        out.put("light", new HallTheme("light", "Dawnlight", "#ffe9a8", "#c99b4a"));
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
            SieglingSize size = card.getSize() != null ? card.getSize()
                    : SieglingSize.defaultFor(card.getRarity(), 0);
            out.add(new Resident(card.getId(), card.getName(), element, rarity,
                    card.getCardArtUrl() == null ? "" : card.getCardArtUrl(), size.name(), preferred));
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
        station.put("resident", invited == null ? null : serializeResident(state, invited, "woodlot"));
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

        List<Map<String, Object>> residentPayload = residents.stream()
                .map(resident -> serializeResident(state, resident)).toList();
        out.put("residents", residentPayload);
        int siegelingSlotCapacity = 1 + (int) FACILITIES.keySet().stream()
                .filter(id -> facilityLevel(state, id) > 0).count()
                + (state.getEnclaveLevel() > 0 ? ENCLAVE_CAPACITY : 0);
        int activeSiegelingSlots = (state.getWoodlotResidentId().isBlank() ? 0 : 1)
                + (int) FACILITIES.keySet().stream()
                .filter(id -> facilityLevel(state, id) > 0)
                .filter(id -> !state.getFacilityResidentIds().getOrDefault(id, "").isBlank()).count()
                + (state.getEnclaveLevel() > 0
                    ? (int) normalizedEnclaveResidents(state).stream().filter(id -> !id.isBlank()).count() : 0);
        out.put("siegelingSlots", Map.of(
                "active", activeSiegelingSlots,
                "capacity", siegelingSlotCapacity,
                "available", Math.max(0, siegelingSlotCapacity - activeSiegelingSlots)));
        out.put("buildings", buildings(state));
        out.put("buildOptions", buildOptions(state));
        List<Map<String, Object>> constructions = activeConstructions(state, now);
        out.put("activeConstruction", constructions.isEmpty() ? null : constructions.get(0));
        out.put("activeConstructions", constructions);
        out.put("constructionSlots", constructionSlots(state));
        Map<String, Object> visualState = new LinkedHashMap<>();
        visualState.put("archiveRestored", state.getArchiveLevel() > 0);
        visualState.put("woodlotLevel", state.getWoodlotLevel());
        visualState.put("storehouseLevel", state.getStorehouseLevel());
        visualState.put("healingStage", Math.min(3, state.getWoodlotCollectCount() + state.getArchiveLevel()));
        visualState.put("hallLevel", hallLevel(state));
        visualState.put("hallTheme", state.getHallThemeId().isBlank() ? "covenant" : state.getHallThemeId());
        visualState.put("buildersYardLevel", state.getBuildersYardLevel());
        visualState.put("enclaveLevel", state.getEnclaveLevel());
        visualState.put("favoriteSet", !state.getFavoriteResidentId().isBlank());
        FACILITIES.keySet().forEach(id -> visualState.put(id + "Level", facilityLevel(state, id)));
        out.put("visualState", visualState);

        Resident favoriteRes = favoriteResident(state, residents);
        int favoritePercent = (int) Math.round(favoriteBoost(state, residents) * 100);
        Map<String, Object> favoriteOut = new LinkedHashMap<>();
        favoriteOut.put("residentId", state.getFavoriteResidentId());
        favoriteOut.put("resident", favoriteRes == null ? null : serializeResident(state, favoriteRes));
        favoriteOut.put("bonusPercent", favoritePercent);
        favoriteOut.put("label", favoriteRes == null ? "No favorite chosen"
                : titleCase(favoriteRes.rarity()) + " favorite · +" + favoritePercent + "% keep-wide");
        out.put("favorite", favoriteOut);

        HallTheme activeTheme = HALL_THEMES.getOrDefault(state.getHallThemeId(), HALL_THEMES.get("covenant"));
        Map<String, Object> keepRank = new LinkedHashMap<>();
        keepRank.put("level", hallLevel(state));
        keepRank.put("maxLevel", HALL_MAX_LEVEL);
        keepRank.put("name", rankName(hallLevel(state)));
        keepRank.put("nextName", hallLevel(state) >= HALL_MAX_LEVEL ? null : rankName(hallLevel(state) + 1));
        keepRank.put("nextHint", hallLevel(state) >= HALL_MAX_LEVEL ? null : hallUpgradeGateHint(hallLevel(state) + 1));
        out.put("keepRank", keepRank);
        out.put("hallTheme", Map.of("id", activeTheme.id(), "name", activeTheme.name(),
                "accent", activeTheme.accent(), "trim", activeTheme.trim()));
        out.put("hallThemes", HALL_THEMES.values().stream().map(theme -> Map.<String, Object>of(
                "id", theme.id(), "name", theme.name(), "accent", theme.accent(), "trim", theme.trim(),
                "active", theme.id().equals(activeTheme.id()))).toList());

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
        out.put("enclave", enclave(state, progression, residents));
        out.put("milestones", milestones(state, progression, now));
        out.put("weeklyTribute", weeklyTribute(state, progression, residents, now));
        out.put("weeklyOrder", weeklyOrder(state, progression, residents, now));
        if (offlineReport != null && !offlineReport.isEmpty()) out.put("offlineReport", offlineReport);
        out.put("keeper", keeperBlock(state, progression, now));
        out.put("progressionReady", progression.getStarterPackId() != null);
        return out;
    }

    private List<Map<String, Object>> buildings(KeepState state) {
        List<Map<String, Object>> out = new ArrayList<>();
        int hall = hallLevel(state);
        boolean hallConstructing = constructionSlotsInUse(state).stream()
                .anyMatch(slot -> slot.id().startsWith("hall_level_"));
        out.add(building("great_hall", "Covenant Hall", hall, hallConstructing ? "CONSTRUCTING" : "COMPLETE"));
        out.add(building("builders_yard", state.getBuildersYardLevel() > 0 ? "Builder's Yard" : "Yard Foundations",
                state.getBuildersYardLevel(), isConstructing(state, "build_builders_yard") ? "CONSTRUCTING"
                        : state.getBuildersYardLevel() > 0 ? "COMPLETE" : "FOUNDATIONS"));
        out.add(building("walls", "Keep Walls", hall >= 5 ? 1 : 0, hall >= 5 ? "COMPLETE" : "FOUNDATIONS"));
        out.add(building("gate", "Covenant Gate", hall >= 5 ? 1 : 0, hall >= 5 ? "COMPLETE" : "FOUNDATIONS"));
        out.add(building("towers", "Elemental Towers", hall >= 6 ? 1 : 0, hall >= 6 ? "COMPLETE" : "FOUNDATIONS"));
        out.add(building("landmark", "Grand Landmark", hall >= 8 ? 1 : 0, hall >= 8 ? "COMPLETE" : "FOUNDATIONS"));
        out.add(building("woodlot", "Restorative Woodlot", state.getWoodlotLevel(),
                isConstructing(state, "woodlot_level_2") ? "CONSTRUCTING" : "COMPLETE"));
        out.add(building("archive", state.getArchiveLevel() > 0 ? "Living Archive" : "Ruined Archive", state.getArchiveLevel(),
                isConstructing(state, "restore_archive") ? "CONSTRUCTING"
                        : state.getArchiveLevel() > 0 ? "COMPLETE" : "RUINED"));
        out.add(building("enclave", state.getEnclaveLevel() > 0 ? "Siegeling Enclave" : "Enclave Clearing",
                state.getEnclaveLevel(), isConstructing(state, "build_enclave") ? "CONSTRUCTING"
                        : state.getEnclaveLevel() > 0 ? "COMPLETE" : "FOUNDATIONS"));
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

    /**
     * A project stays "available" by its prerequisites while its crew works — facility levels only
     * rise on completion — so an in-progress project would otherwise be offered again and fail at
     * startBuild. Drop it here so a free team only ever sees projects it can actually take.
     */
    private List<Map<String, Object>> buildOptions(KeepState state) {
        List<Map<String, Object>> out = collectBuildOptions(state);
        out.removeIf(option -> isConstructing(state, String.valueOf(option.get("id"))));
        return out;
    }

    private List<Map<String, Object>> collectBuildOptions(KeepState state) {
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
            addHallUpgradeOption(state, out);
            addEnclaveBuildOption(state, out);
            return out;
        }
        if (state.getStorehouseLevel() < 1) {
            out.add(buildOption(state, "raise_storehouse", "Raise the Covenant Storehouse", STOREHOUSE_LEVEL_ONE_COST, Map.of(),
                    STOREHOUSE_LEVEL_ONE_SECONDS, "Double timber room and expand every workstation's offline storage.", true));
            addHallUpgradeOption(state, out);
            addEnclaveBuildOption(state, out);
            return out;
        }
        for (FacilityDefinition definition : FACILITIES.values()) {
            if (facilityLevel(state, definition.id()) < 1) {
                BuildProject project = buildProject("build_" + definition.id());
                out.add(buildOption(state, project.id(), project.name(), project.timberCost(), project.materialCosts(),
                        project.durationSeconds(), definition.buildDescription(), true));
            }
        }
        if (facilityLevel(state, "quarry") >= 1 && state.getBuildersYardLevel() < 1) {
            BuildProject project = buildProject("build_builders_yard");
            out.add(buildOption(state, project.id(), project.name(), project.timberCost(), project.materialCosts(),
                    project.durationSeconds(),
                    "Advanced construction recipes: level-2 expansions unlock while Keeper Level determines simultaneous teams.", true));
        }
        if (state.getBuildersYardLevel() >= 1) {
            for (FacilityDefinition definition : FACILITIES.values()) {
                if (facilityLevel(state, definition.id()) == 1) {
                    BuildProject project = buildProject(definition.id() + "_level_2");
                    out.add(buildOption(state, project.id(), project.name(), project.timberCost(), project.materialCosts(),
                            project.durationSeconds(), "Use materials from other workshops to improve production, storage, and the resident's contribution.", true));
                }
            }
            if (elementalFacilitiesAtLeast(state, 1) && state.getStorehouseLevel() < 2) {
                BuildProject project = buildProject("storehouse_level_2");
                out.add(buildOption(state, project.id(), project.name(), project.timberCost(), project.materialCosts(),
                        project.durationSeconds(), "Combine all four elemental materials into a larger sanctuary vault.", true));
            }
        }
        addHallUpgradeOption(state, out);
        addEnclaveBuildOption(state, out);
        return out;
    }

    private void addEnclaveBuildOption(KeepState state, List<Map<String, Object>> out) {
        if (state.getArchiveLevel() < 1 || state.getEnclaveLevel() > 0 || isConstructing(state, "build_enclave")) return;
        BuildProject project = buildProject("build_enclave");
        out.add(buildOption(state, project.id(), project.name(), project.timberCost(), project.materialCosts(),
                project.durationSeconds(),
                "A home apart from the work quarter, with five resident spaces and a personal mission from every guest.", true));
    }

    /** The next hall rank appears alongside other projects once its gate is met. */
    private void addHallUpgradeOption(KeepState state, List<Map<String, Object>> out) {
        int nextLevel = hallLevel(state) + 1;
        if (nextLevel > HALL_MAX_LEVEL || !hallUpgradeGateMet(state, nextLevel)) return;
        BuildProject project = buildProject("hall_level_" + nextLevel);
        if (project == null) return;
        Map<String, Object> option = buildOption(state, project.id(), project.name(), project.timberCost(),
                project.materialCosts(), project.durationSeconds(),
                hallUpgradeDescription(nextLevel) + " Raises the keep to " + rankName(nextLevel) + ".", true);
        option.put("rankName", rankName(nextLevel));
        out.add(option);
    }

    private Map<String, Object> buildOption(KeepState state, String id, String name, int timberCost, Map<String, Integer> materialCosts,
                                            long seconds, String description, boolean unlocked) {
        int requiredLevel = keeperUnlockLevel(id);
        boolean levelMet = keeperLevel(state.getKeeperXp()) >= requiredLevel;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", name);
        out.put("timberCost", timberCost);
        out.put("materialCosts", serializeMaterialCosts(materialCosts));
        out.put("durationSeconds", seconds);
        out.put("description", description);
        out.put("requiredLevel", requiredLevel);
        out.put("levelMet", levelMet);
        out.put("canStart", unlocked && levelMet && hasFreeConstructionSlot(state)
                && state.getTimber() >= timberCost && hasMaterials(state, materialCosts));
        return out;
    }

    private List<Map<String, Object>> activeConstructions(KeepState state, Instant now) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ConstructionSlot slot : constructionSlotsInUse(state)) {
            Map<String, Object> entry = constructionEntry(slot.id(), slot.startedAt(), slot.completesAt(), now);
            if (entry != null) out.add(entry);
        }
        return out;
    }

    private Map<String, Object> constructionEntry(String id, Instant startedAt, Instant completesAt, Instant now) {
        if (id == null || id.isBlank() || completesAt == null) return null;
        long total = startedAt == null ? 1 : Math.max(1, Duration.between(startedAt, completesAt).getSeconds());
        long remaining = Math.max(0, Duration.between(now, completesAt).getSeconds());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("startedAt", startedAt == null ? null : startedAt.toString());
        out.put("completesAt", completesAt.toString());
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
        out.put("size", resident.size());
        out.put("artUrl", resident.artUrl());
        out.put("preferredAtWoodlot", resident.preferredAtWoodlot());
        out.put("affinityLabel", resident.preferredAtWoodlot() ? "Woodland affinity · +15%" : "Willing helper · normal rate");
        return out;
    }

    /** Resident payload with the live rapport and assignment the Enclave picker needs. */
    private Map<String, Object> serializeResident(KeepState state, Resident resident) {
        Map<String, Object> out = serializeResident(resident);
        out.put("rapport", serializeRapport(state, resident.id()));
        out.put("assignment", residentAssignment(state, resident.id()));
        return out;
    }

    private Map<String, Object> serializeResident(KeepState state, Resident resident, String stationId) {
        Map<String, Object> out = serializeResident(resident, stationId);
        out.put("rapport", serializeRapport(state, resident.id()));
        out.put("assignment", residentAssignment(state, resident.id()));
        // The station bonus a player actually receives already includes rapport, so the
        // posted percentage must too or the room card would understate a bonded partner.
        int effective = (int) Math.round(stationBonusPercent(state, resident, stationId));
        int level = rapportLevel(state, resident.id());
        out.put("affinityBonusPercent", effective);
        out.put("affinityLabel", effective > 0
                ? titleCase(resident.element()) + " affinity · +" + effective + "%"
                        + (level > 0 ? " (rapport " + level + ")" : "")
                : "Willing helper · normal rate");
        return out;
    }

    private Map<String, Object> serializeResident(Resident resident, String stationId) {
        Map<String, Object> out = serializeResident(resident);
        boolean affinity = stationAffinity(resident, stationId);
        int bonus = "woodlot".equals(stationId)
                ? (affinity ? tuning().woodlotAffinityPercent() : 0)
                : affinity ? tuning().facilityAffinityPercent()
                : "NEUTRAL".equals(resident.element()) ? tuning().facilityNeutralPercent() : 0;
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
            item.put("kind", conversation.kind());
            item.put("choices", conversation.choices().stream().map(choice -> {
                Map<String, Object> choiceOut = new LinkedHashMap<>();
                choiceOut.put("id", choice.id());
                choiceOut.put("label", choice.label());
                choiceOut.put("timberCost", choice.timberCost());
                choiceOut.put("materialCosts", serializeMaterialCosts(choice.materialCosts()));
                choiceOut.put("hasRng", !choice.outcomes().isEmpty());
                choiceOut.put("affordable", state.getTimber() >= choice.timberCost()
                        && hasMaterials(state, choice.materialCosts()));
                return choiceOut;
            }).toList());
            out.add(item);
        }
        return out;
    }

    private boolean isConversationAvailable(KeepState state, Conversation conversation) {
        if (!state.getUnlockedLoreIds().containsAll(conversation.requiresLoreIds())) return false;
        if (!state.getChoiceFlags().containsAll(conversation.requiresFlags())) return false;
        if (state.getStorehouseLevel() < conversation.minStorehouseLevel()) return false;
        if (loreCatalog.isRollingEncounter(conversation)) {
            return state.getActiveVisitorIds().contains(conversation.id());
        }
        return !state.getCompletedConversationIds().contains(conversation.id());
    }

    private boolean refreshVisitors(KeepState state, Instant now) {
        List<String> active = state.getActiveVisitorIds();
        active.removeIf(id -> {
            Conversation conversation = loreCatalog.conversation(id);
            return conversation == null || !loreCatalog.isRollingEncounter(conversation);
        });
        boolean changed = false;
        boolean rollReady = state.getLastVisitorRollAt() == null
                || !now.isBefore(state.getLastVisitorRollAt().plus(VISITOR_ROLL_COOLDOWN));
        if (!rollReady) {
            state.setActiveVisitorIds(active);
            return false;
        }
        List<Conversation> candidates = new ArrayList<>();
        for (Conversation visitor : loreCatalog.visitorTemplates()) {
            if (active.contains(visitor.id())) continue;
            if (!meetsVisitorRequirements(state, visitor, now)) continue;
            candidates.add(visitor);
        }
        if (candidates.isEmpty()) {
            state.setActiveVisitorIds(active);
            return false;
        }
        // Prefer seating one returning voice so affinity can climb or fall over time.
        // If the slate is full of first meetings, swap one out when a returnee is ready.
        List<Conversation> returnees = candidates.stream()
                .filter(candidate -> state.getNpcTrust().containsKey(candidate.npcId()))
                .collect(Collectors.toCollection(ArrayList::new));
        boolean returneeSeated = active.stream().anyMatch(id -> isReturningNpc(state, loreCatalog.conversation(id)));
        if (!returnees.isEmpty() && !returneeSeated) {
            if (active.size() >= MAX_ACTIVE_VISITORS) {
                for (int i = active.size() - 1; i >= 0; i--) {
                    if (!isReturningNpc(state, loreCatalog.conversation(active.get(i)))) {
                        active.remove(i);
                        break;
                    }
                }
            }
            if (active.size() < MAX_ACTIVE_VISITORS) {
                Conversation picked = weightedPick(returnees, state);
                active.add(picked.id());
                candidates.remove(picked);
                changed = true;
            }
        }
        while (active.size() < MAX_ACTIVE_VISITORS && !candidates.isEmpty()) {
            Conversation picked = weightedPick(candidates, state);
            active.add(picked.id());
            candidates.remove(picked);
            changed = true;
        }
        if (changed) state.setLastVisitorRollAt(now);
        state.setActiveVisitorIds(active);
        return changed;
    }

    private boolean isReturningNpc(KeepState state, Conversation conversation) {
        return conversation != null && state.getNpcTrust().containsKey(conversation.npcId());
    }

    private boolean meetsVisitorRequirements(KeepState state, Conversation visitor, Instant now) {
        if (!state.getUnlockedLoreIds().containsAll(visitor.requiresLoreIds())) return false;
        if (!state.getChoiceFlags().containsAll(visitor.requiresFlags())) return false;
        if (state.getStorehouseLevel() < visitor.minStorehouseLevel()) return false;
        Instant availableAt = state.getVisitorAvailableAt().get(visitor.id());
        return availableAt == null || !now.isBefore(availableAt);
    }

    private Conversation weightedPick(List<Conversation> candidates, KeepState state) {
        int total = 0;
        int[] weights = new int[candidates.size()];
        for (int i = 0; i < candidates.size(); i++) {
            Conversation candidate = candidates.get(i);
            int weight = Math.max(1, candidate.weight());
            if (state != null && state.getNpcTrust().containsKey(candidate.npcId())) {
                weight *= RETURNING_NPC_WEIGHT_MULT;
            }
            weights[i] = weight;
            total += weight;
        }
        int roll = total <= 1 ? 0 : random.nextInt(total);
        int cursor = 0;
        for (int i = 0; i < candidates.size(); i++) {
            cursor += weights[i];
            if (roll < cursor) return candidates.get(i);
        }
        return candidates.get(candidates.size() - 1);
    }

    private Conversation weightedPick(List<Conversation> candidates) {
        return weightedPick(candidates, null);
    }

    private Outcome rollOutcome(List<Outcome> outcomes) {
        int total = outcomes.stream().mapToInt(Outcome::weight).sum();
        int roll = total <= 1 ? 0 : random.nextInt(total);
        int cursor = 0;
        for (Outcome outcome : outcomes) {
            cursor += outcome.weight();
            if (roll < cursor) return outcome;
        }
        return outcomes.get(outcomes.size() - 1);
    }

    private int applyTimberDelta(KeepState state, int delta) {
        if (delta == 0) return 0;
        if (delta < 0) {
            int spent = Math.min(state.getTimber(), -delta);
            state.setTimber(state.getTimber() - spent);
            return -spent;
        }
        int room = Math.max(0, timberInventoryCapacity(state) - state.getTimber());
        int gained = Math.min(room, delta);
        state.setTimber(state.getTimber() + gained);
        return gained;
    }

    private Map<String, Integer> applyMaterialDeltas(KeepState state, Map<String, Integer> deltas) {
        Map<String, Integer> applied = new LinkedHashMap<>();
        if (deltas == null || deltas.isEmpty()) return applied;
        int capacity = materialInventoryCapacity(state);
        for (Map.Entry<String, Integer> entry : deltas.entrySet()) {
            int delta = entry.getValue() == null ? 0 : entry.getValue();
            if (delta == 0) continue;
            int owned = state.getMaterialInventory().getOrDefault(entry.getKey(), 0);
            if (delta < 0) {
                int spent = Math.min(owned, -delta);
                state.getMaterialInventory().put(entry.getKey(), owned - spent);
                applied.put(entry.getKey(), -spent);
            } else {
                int room = Math.max(0, capacity - owned);
                int gained = Math.min(room, delta);
                state.getMaterialInventory().put(entry.getKey(), owned + gained);
                if (gained != 0) applied.put(entry.getKey(), gained);
            }
        }
        return applied;
    }

    private List<Map<String, Object>> serializeMaterialDeltas(Map<String, Integer> deltas) {
        return deltas.entrySet().stream().map(entry -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", entry.getKey());
            item.put("name", materialName(entry.getKey()));
            item.put("amount", entry.getValue());
            return item;
        }).toList();
    }

    private String dialogueSummary(int timberSpent, int timberDelta, Map<String, Integer> materialCosts,
                                   Map<String, Integer> materialDeltas) {
        List<String> parts = new ArrayList<>();
        if (timberSpent > 0) parts.add("spent " + timberSpent + " timber");
        if (timberDelta > 0) parts.add("gained " + timberDelta + " timber");
        if (timberDelta < 0) parts.add("lost " + (-timberDelta) + " timber");
        materialCosts.forEach((id, amount) -> {
            if (amount != null && amount > 0) parts.add("spent " + amount + " " + materialName(id));
        });
        materialDeltas.forEach((id, amount) -> {
            if (amount == null || amount == 0) return;
            parts.add((amount > 0 ? "gained " : "lost ") + Math.abs(amount) + " " + materialName(id));
        });
        return parts.isEmpty() ? "No stores changed." : String.join("; ", parts) + ".";
    }

    private List<Map<String, Object>> relationships(KeepState state) {
        Map<String, String> names = new LinkedHashMap<>();
        for (Conversation conversation : loreCatalog.allConversations()) {
            names.putIfAbsent(conversation.npcId(), conversation.npcName());
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : state.getNpcTrust().entrySet()) {
            int trust = Math.max(0, Math.min(NPC_TRUST_MAX, entry.getValue()));
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("npcId", entry.getKey());
            row.put("npcName", names.getOrDefault(entry.getKey(), entry.getKey()));
            row.put("stage", relationshipStage(trust));
            // trustMax matches the Bonded threshold so the Voices spectrum can render like↔dislike.
            row.put("trust", trust);
            row.put("trustMax", NPC_TRUST_MAX);
            out.add(row);
        }
        return out;
    }

    static String relationshipStage(int trust) {
        int value = Math.max(0, trust);
        if (value >= NPC_TRUST_MAX) return "Bonded";
        if (value >= 3) return "Trusted";
        if (value >= 1) return "Acquainted";
        return "Distant";
    }

    /** Lifetime keep stats power keep achievements and titles; recording is best-effort and must never fail a keep action. */
    // ── Keeper leveling / battlepass ──────────────────────────────────────────

    /** Cumulative XP required to reach a level. Step L→L+1 costs 50L+50, so
     *  reach(L) = 25(L-1)(L+2): reach(2)=100, reach(3)=250, … reach(25)=16200. */
    private static long keeperXpToReach(int level) {
        int l = Math.max(1, Math.min(KEEPER_MAX_LEVEL, level));
        return 25L * (l - 1) * (l + 2);
    }

    private int keeperLevel(long xp) {
        int level = 1;
        while (level < KEEPER_MAX_LEVEL && xp >= keeperXpToReach(level + 1)) level++;
        return level;
    }

    private String dayKey(Instant now) {
        return now.atZone(ZoneOffset.UTC).toLocalDate().toString();
    }

    /** Adds XP up to the level cap; returns the amount actually applied. */
    private int awardKeeperXp(KeepState state, int amount) {
        if (state == null || amount <= 0) return 0;
        long max = keeperXpToReach(KEEPER_MAX_LEVEL);
        long before = state.getKeeperXp();
        long after = Math.min(max, before + amount);
        state.setKeeperXp(after);
        return (int) (after - before);
    }

    /** First visit of a new UTC day grants login XP. Returns XP applied (0 if already claimed today). */
    private int grantDailyKeeperXp(KeepState state, Instant now) {
        String today = dayKey(now);
        String lastDay = state.getKeeperDailyXpAt() == null ? "" : dayKey(state.getKeeperDailyXpAt());
        if (today.equals(lastDay)) return 0;
        state.setKeeperDailyXpAt(now);
        return awardKeeperXp(state, KEEPER_DAILY_LOGIN_XP);
    }

    /** Resource-collection XP, throttled by a per-day cap so idle-collecting can't be farmed. */
    private int grantResourceKeeperXp(KeepState state, Instant now, int desired) {
        String today = dayKey(now);
        if (!today.equals(state.getKeeperResourceXpDay())) {
            state.setKeeperResourceXpDay(today);
            state.setKeeperResourceXpToday(0);
        }
        int room = Math.max(0, KEEPER_RESOURCE_XP_DAILY_CAP - state.getKeeperResourceXpToday());
        int grant = Math.min(room, Math.max(0, desired));
        if (grant <= 0) return 0;
        state.setKeeperResourceXpToday(state.getKeeperResourceXpToday() + grant);
        return awardKeeperXp(state, grant);
    }

    /** One-time seeding so keeps that predate leveling start at a level matching their progress. */
    private void backfillKeeperXp(KeepState state) {
        if (state.isKeeperXpBackfilled()) return;
        long floor = (long) totalBuildLevels(state) * 40L
                + (long) state.getWoodlotCollectCount() * 10L
                + (long) state.getEssenceCollectCount() * 15L
                + (long) state.getCraftCount() * 20L
                + (long) state.getUnlockedLoreIds().size() * 12L
                + (long) Math.max(0, hallLevel(state) - 1) * 120L;
        long max = keeperXpToReach(KEEPER_MAX_LEVEL);
        state.setKeeperXp(Math.min(max, Math.max(state.getKeeperXp(), floor)));
        state.setKeeperXpBackfilled(true);
    }

    /** Keeper Level required to begin a project. The prerequisite-sequenced restoration
     *  chain stays ungated (level 1); the keep-RANK upgrades are what leveling unlocks,
     *  so raising to hall rank N asks for Keeper Level N. */
    private int keeperUnlockLevel(String projectId) {
        if (projectId != null && projectId.startsWith("hall_level_")) {
            int n = parseHallLevel(projectId);
            return n <= 0 ? 1 : Math.min(KEEPER_MAX_LEVEL, n);
        }
        return 1;
    }

    /** Timeline copy for what a level opens: keep-rank ups (the buildings) map to real
     *  rank names; otherwise a granted decoration or the milestone cache. */
    private String keeperUnlockLabel(int level) {
        if (level >= 2 && level <= HALL_MAX_LEVEL) return "Keep rank up · " + rankName(level);
        String decoration = KEEPER_LEVEL_DECORATIONS.getOrDefault(level, "");
        if (!decoration.isBlank()) return "New decoration · " + recipeName(decoration);
        if (level % KEEPER_LEVELS_PER_CHAPTER == 0) return "Milestone cache · bonus Siegecoins & Remnants";
        return "";
    }

    private Map<String, Object> keeperBlock(KeepState state, PlayerProgressionEntity progression, Instant now) {
        long xp = state.getKeeperXp();
        int level = keeperLevel(xp);
        boolean atMax = level >= KEEPER_MAX_LEVEL;
        long start = keeperXpToReach(level);
        long end = atMax ? start : keeperXpToReach(level + 1);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("level", level);
        out.put("maxLevel", KEEPER_MAX_LEVEL);
        out.put("totalXp", xp);
        out.put("levelStartXp", start);
        out.put("levelEndXp", end);
        out.put("xpIntoLevel", xp - start);
        out.put("xpForLevel", Math.max(0, end - start));
        out.put("atMax", atMax);
        out.put("rankName", rankName(hallLevel(state)));
        String lastDay = state.getKeeperDailyXpAt() == null ? "" : dayKey(state.getKeeperDailyXpAt());
        out.put("dailyXpClaimed", dayKey(now).equals(lastDay));
        out.put("dailyLoginXp", KEEPER_DAILY_LOGIN_XP);
        out.put("resourceXpToday", dayKey(now).equals(state.getKeeperResourceXpDay()) ? state.getKeeperResourceXpToday() : 0);
        out.put("resourceXpDailyCap", KEEPER_RESOURCE_XP_DAILY_CAP);

        List<Map<String, Object>> chapters = new ArrayList<>();
        for (int c = 0; c < KEEPER_CHAPTERS.length; c++) {
            int from = c * KEEPER_LEVELS_PER_CHAPTER + 1;
            int to = (c + 1) * KEEPER_LEVELS_PER_CHAPTER;
            Map<String, Object> chapter = new LinkedHashMap<>();
            chapter.put("id", "chapter_" + (c + 1));
            chapter.put("number", c + 1);
            chapter.put("title", KEEPER_CHAPTERS[c][0]);
            chapter.put("subtitle", KEEPER_CHAPTERS[c][1]);
            chapter.put("fromLevel", from);
            chapter.put("toLevel", to);
            chapter.put("current", level >= from && level <= to);
            chapter.put("complete", level > to);
            chapters.add(chapter);
        }
        out.put("chapters", chapters);

        List<Map<String, Object>> levels = new ArrayList<>();
        int unclaimed = 0;
        for (int lv = 1; lv <= KEEPER_MAX_LEVEL; lv++) {
            boolean reached = level >= lv;
            boolean claimed = progression.getKeepRewardClaimIds().contains("keeper_level:" + lv);
            boolean canClaim = reached && !claimed;
            if (canClaim) unclaimed++;
            KeeperReward reward = keeperReward(lv);
            Map<String, Object> rewardOut = new LinkedHashMap<>();
            rewardOut.put("gold", reward.gold());
            rewardOut.put("remnants", reward.remnants());
            if (!reward.decorationId().isBlank()) {
                rewardOut.put("decorationId", reward.decorationId());
                rewardOut.put("decorationName", recipeName(reward.decorationId()));
            }
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("level", lv);
            node.put("chapterNumber", (lv - 1) / KEEPER_LEVELS_PER_CHAPTER + 1);
            node.put("reward", rewardOut);
            node.put("unlockLabel", keeperUnlockLabel(lv));
            node.put("requiredXp", keeperXpToReach(lv));
            node.put("reached", reached);
            node.put("claimed", claimed);
            node.put("canClaim", canClaim);
            node.put("current", lv == level);
            levels.add(node);
        }
        out.put("levels", levels);
        out.put("unclaimedRewards", unclaimed);
        return out;
    }

    /** Free-track reward for a Keeper Level: gold + remnants every level (milestone bonus every 5th),
     *  plus an owned decoration on the levels in KEEPER_LEVEL_DECORATIONS. */
    private KeeperReward keeperReward(int level) {
        int gold = 40 + level * 12;
        int remnants = 8 + level * 3;
        if (level % KEEPER_LEVELS_PER_CHAPTER == 0) { gold += 120; remnants += 40; }
        return new KeeperReward(gold, remnants, KEEPER_LEVEL_DECORATIONS.getOrDefault(level, ""));
    }

    private String recipeName(String recipeId) {
        CraftRecipe recipe = recipeById(recipeId);
        return recipe == null ? "" : recipe.name();
    }

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

    void setTuningService(KeepTuningService tuningService) {
        this.tuningService = tuningService;
    }

    /** Live designer tuning, or the shipped defaults when no tuning source is wired. */
    private KeepTuning tuning() {
        return tuningService == null ? KeepTuning.EMPTY : tuningService.current();
    }

    void setRandom(Random random) {
        this.random = random == null ? new Random() : random;
    }

    private record Resident(String id, String name, String element, String rarity, String artUrl,
                            String size, boolean preferredAtWoodlot) { }
    private record FacilityDefinition(String id, String name, String ruinedName, String resourceId,
                                      String resourceName, double baseRatePerMinute, int baseStorage,
                                      Set<String> affinities, String toolRecipeId, String buildDescription) {
        private static final FacilityDefinition EMPTY = new FacilityDefinition("", "", "", "", "", 0, 0,
                Set.of(), "", "");
    }
    private record HallTheme(String id, String name, String accent, String trim) { }
    private record CraftRecipe(String id, String name, String type, String roomId, int requiredLevel,
                               Map<String, Integer> materialCosts, boolean repeatable,
                               String description, String bonusLabel, int tier, String prerequisiteId) { }
    private record BuildProject(String id, String name, int timberCost, Map<String, Integer> materialCosts,
                                long durationSeconds) { }
    private record ConstructionSlot(int index, String id, Instant startedAt, Instant completesAt) { }
    private record KeeperReward(int gold, int remnants, String decorationId) { }
    private record Context(PlayerProgressionEntity progression, KeepState state, List<Resident> residents, Instant now) { }

    public static class StaleKeepStateException extends IllegalStateException {
        public StaleKeepStateException(String message) { super(message); }
    }
}
