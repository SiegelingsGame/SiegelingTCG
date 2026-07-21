package com.sieglings.keep;

import com.sieglings.keep.KeepLoreCatalog.Conversation;
import com.sieglings.keep.KeepLoreCatalog.ConversationChoice;
import com.sieglings.keep.KeepLoreCatalog.LoreEntry;
import com.sieglings.keep.KeepLoreCatalog.Outcome;
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
    private static final Duration OFFLINE_REPORT_THRESHOLD = Duration.ofMinutes(5);
    private static final Duration TRIBUTE_COOLDOWN = Duration.ofDays(7);
    private static final Duration VISITOR_ROLL_COOLDOWN = Duration.ofHours(2);
    private static final int MAX_ACTIVE_VISITORS = 3;
    private static final int REQUEST_HISTORY_LIMIT = 120;
    private static final Object[] LOCKS = createLocks();
    private static final Map<String, FacilityDefinition> FACILITIES = createFacilities();
    private static final Map<String, CraftRecipe> RECIPES = createRecipes();
    /** The original four workshops; long-standing gates and milestones stay keyed
        to these so adding the Quarry/Kitchen never retro-locks progress. */
    private static final Set<String> ELEMENTAL_FACILITIES = Set.of("garden", "forge", "fridge", "generator");
    public static final int HALL_MAX_LEVEL = 8;
    /** Keep ranks by Covenant Hall level â€” the visible progression arc of the sanctuary. */
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
            state.setLastVisitedAt(context.now());
            if (completed || produced || visitorsChanged) {
                bump(context.state(), context.now());
                store.save(state);
            } else {
                store.save(state);
            }
            if (completed) {
                recordKeepStats(context.progression(),
                        p -> p.setKeepProjectsCompleted(p.getKeepProjectsCompleted() + completedProjects.size()));
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
            advanceEnclaveMissions(state, "TIMBER_COLLECTION");
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
            if (!hasFreeConstructionSlot(state)) {
                throw new IllegalArgumentException(constructionSlots(state) > 1
                        ? "Both construction crews are busy. Finish a current project first."
                        : "Finish the current construction project first.");
            }
            if (id.equals(state.getActiveConstructionId()) || id.equals(state.getActiveConstructionId2())) {
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
            if (state.getActiveConstructionId().isBlank()) {
                state.setActiveConstructionId(id);
                state.setConstructionStartedAt(context.now());
                state.setConstructionCompletesAt(context.now().plusSeconds(project.durationSeconds()));
            } else {
                state.setActiveConstructionId2(id);
                state.setConstructionStartedAt2(context.now());
                state.setConstructionCompletesAt2(context.now().plusSeconds(project.durationSeconds()));
            }
            return Map.of("constructionStarted", id);
        });
    }

    /** The Builder's Yard staffs a second construction crew. */
    private int constructionSlots(KeepState state) {
        return state.getBuildersYardLevel() >= 1 ? 2 : 1;
    }

    private boolean hasFreeConstructionSlot(KeepState state) {
        if (state.getActiveConstructionId().isBlank()) return true;
        return constructionSlots(state) >= 2 && state.getActiveConstructionId2().isBlank();
    }

    private boolean isConstructing(KeepState state, String projectId) {
        return projectId.equals(state.getActiveConstructionId()) || projectId.equals(state.getActiveConstructionId2());
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
            int relationshipDelta = choiß}¼êÚ$z{-®éÜj×7F'FVDBÓÒçVÆÂòçVÆÂ¢7F'FVDBçFõ7G&–ær‚’“°Ð¢÷WBçWB‚&6ö×ÆWFW4B"Â6ö×ÆWFW4BçFõ7G&–ær‚’“°Ð¢÷WBçWB‚'&VÖ–æ–æu6V6öæG2"Â&VÖ–æ–ær“°Ð¢÷WBçWB‚'&öw&W72"ÂÖF‚æÖ‚ƒÂÖF‚æÖ–âƒÂ‡F÷FÂÒ&VÖ–æ–ær’ò†F÷V&ÆR’F÷FÂ’’“°Ð¢&WGW&â÷WC°Ð¢ÐÐ Ð¢&—fFRÖÅ7G&–ærÂö&¦V7Câ6W&–Æ—¦U&W6–FVçB…&W6–FVçB&W6–FVçB’°Ð¢ÖÅ7G&–ærÂö&¦V7Câ÷WBÒæWrÆ–æ¶VD†6„ÖÃâ‚“°Ð¢÷WBçWB‚&–B"Â&W6–FVçBæ–B‚’“°Ð¢÷WBçWB‚&æÖR"Â&W6–FVçBææÖR‚’“°Ð¢÷WBçWB‚&VÆVÖVçB"Â&W6–FVçBæVÆVÖVçB‚’“°Ð¢÷WBçWB‚'&&—G’"Â&W6–FVçBç&&—G’‚’“°Ð¢÷WBçWB‚&'EW&Â"Â&W6–FVçBæ'EW&Â‚’“°Ð¢÷WBçWB‚'&VfW'&VDEvööFÆ÷B"Â&W6–FVçBç&VfW'&VDEvööFÆ÷B‚’“°Ð¢÷WBçWB‚&ff–æ—G”Æ&VÂ"Â&W6–FVçBç&VfW'&VDEvööFÆ÷B‚’ò%vööFÆæBff–æ—G’+r³RR"¢%v–ÆÆ–ær†VÇW"+ræ÷&ÖÂ&FR"“°Ð¢&WGW&â÷WC°Ð¢ÐÐ Ð¢&—fFRÖÅ7G&–ærÂö&¦V7Câ6W&–Æ—¦U&W6–FVçB…&W6–FVçB&W6–FVçBÂ7G&–ær7FF–öä–B’°Ð¢ÖÅ7G&–ærÂö&¦V7Câ÷WBÒ6W&–Æ—¦U&W6–FVçB‡&W6–FVçB“°Ð¢&ööÆVâff–æ—G’Ò7FF–öäff–æ—G’‡&W6–FVçBÂ7FF–öä–B“°Ð¢–çB&öçW2Ò'vööFÆ÷B"æWVÇ2‡7FF–öä–B’ò†ff–æ—G’òR¢Ð¢¢ff–æ—G’ò#¢$äUUE$Â"æWVÇ2‡&W6–FVçBæVÆVÖVçB‚’’òR¢°Ð¢÷WBçWB‚&†4ff–æ—G’"Âff–æ—G’“°Ð¢÷WBçWB‚&ff–æ—G”&öçW5W&6VçB"Â&öçW2“°Ð¢÷WBçWB‚&ff–æ—G”Æ&VÂ"Â&öçW2âòF—FÆT66R‡&W6–FVçBæVÆVÖVçB‚’’²"ff–æ—G’+r²"²&öçW2²"R Ð¢¢%v–ÆÆ–ær†VÇW"+ræ÷&ÖÂ&FR"“°Ð¢&WGW&â÷WC°Ð¢ÐÐ Ð¢&—fFRÆ—7CÄÖÅ7G&–ærÂö&¦V7Cãâf–Æ&ÆT6öçfW'6F–öç2„¶VW7FFR7FFR’°Ð¢Æ—7CÄÖÅ7G&–ærÂö&¦V7Cãâ÷WBÒæWr'&”Æ—7CÃâ‚“°Ð¢f÷"„6öçfW'6F–öâ6öçfW'6F–öâ¢Æ÷&T6FÆöræÆÄ6öçfW'6F–öç2‚’’°Ð¢–b‚—46öçfW'6F–öäf–Æ&ÆR‡7FFRÂ6öçfW'6F–öâ’’6öçF–çVS°Ð¢ÖÅ7G&–ærÂö&¦V7Câ—FVÒÒæWrÆ–æ¶VD†6„ÖÃâ‚“°Ð¢—FVÒçWB‚&–B"Â6öçfW'6F–öâæ–B‚’“°Ð¢—FVÒçWB‚&ç4–B"Â6öçfW'6F–öâæç4–B‚’“°Ð¢—FVÒçWB‚&ç4æÖR"Â6öçfW'6F–öâæç4æÖR‚’“°Ð¢—FVÒçWB‚&ç5&öÆR"Â6öçfW'6F–öâæç5&öÆR‚’“°Ð¢—FVÒçWB‚&¶–6¶W""Â6öçfW'6F–öâæ¶–6¶W"‚’“°Ð¢—FVÒçWB‚'&ö×B"Â6öçfW'6F–öâç&ö×B‚’“°Ð¢—FVÒçWB‚&¶–æB"Â6öçfW'6F–öâæ¶–æB‚’“°Ð¢—FVÒçWB‚&6†ö–6W2"Â6öçfW'6F–öâæ6†ö–6W2‚’ç7G&VÒ‚’æÖ†6†ö–6RÓâ°Ð¢ÖÅ7G&–ærÂö&¦V7Câ6†ö–6T÷WBÒæWrÆ–æ¶VD†6„ÖÃâ‚“°Ð¢6†ö–6T÷WBçWB‚&–B"Â6†ö–6Ræ–B‚’“°Ð¢6†ö–6T÷WBçWB‚&Æ&VÂ"Â6†ö–6RæÆ&VÂ‚’“°Ð¢6†ö–6T÷WBçWB‚'F–Ö&W$6÷7B"Â6†ö–6RçF–Ö&W$6÷7B‚’“°Ð¢6†ö–6T÷WBçWB‚&ÖFW&–Ä6÷7G2"Â6W&–Æ—¦TÖFW&–Ä6÷7G2†6†ö–6RæÖFW&–Ä6÷7G2‚’’“°Ð¢6†ö–6T÷WBçWB‚&†5&ær"Â6†ö–6Ræ÷WF6öÖW2‚’æ—4V×G’‚’“°Ð¢6†ö–6T÷WBçWB‚&ff÷&F&ÆR"Â7FFRævWEF–Ö&W"‚’ãÒ6†ö–6RçF–Ö&W$6÷7B‚Ð¢bb†4ÖFW&–Ç2‡7FFRÂ6†ö–6RæÖFW&–Ä6÷7G2‚’’“°Ð¢&WGW&â6†ö–6T÷WC°Ð¢Ò’çFôÆ—7B‚’“°Ð¢÷WBæFB†—FVÒ“°Ð¢ÐÐ¢&WGW&â÷WC°Ð¢ÐÐ Ð¢&—fFR&ööÆVâ—46öçfW'6F–öäf–Æ&ÆR„¶VW7FFR7FFRÂ6öçfW'6F–öâ6öçfW'6F–öâ’°Ð¢–b‚7FFRævWEVæÆö6¶VDÆ÷&T–G2‚’æ6öçF–ç4ÆÂ†6öçfW'6F–öâç&WV—&W4Æ÷&T–G2‚’’’&WGW&âfÇ6S°Ð¢–b‚7FFRævWD6†ö–6TfÆw2‚’æ6öçF–ç4ÆÂ†6öçfW'6F–öâç&WV—&W4fÆw2‚’’’&WGW&âfÇ6S°Ð¢–b‡7FFRævWE7F÷&V†÷W6TÆWfVÂ‚’Â6öçfW'6F–öâæÖ–å7F÷&V†÷W6TÆWfVÂ‚’’&WGW&âfÇ6S°Ð¢–b†Æ÷&T6FÆöræ—5f—6—F÷"†6öçfW'6F–öâ’’°Ð¢&WGW&â7FFRævWD7F—fUf—6—F÷$–G2‚’æ6öçF–ç2†6öçfW'6F–öâæ–B‚’“°Ð¢ÐÐ¢&WGW&â7FFRævWD6ö×ÆWFVD6öçfW'6F–öä–G2‚’æ6öçF–ç2†6öçfW'6F–öâæ–B‚’“°Ð¢ÐÐ Ð¢&—fFR&ööÆVâ&Vg&W6…f—6—F÷'2„¶VW7FFR7FFRÂ–ç7FçBæ÷r’°Ð¢Æ—7CÅ7G&–æsâ7F—fRÒ7FFRævWD7F—fUf—6—F÷$–G2‚“°Ð¢7F—fRç&VÖ÷fT–b†–BÓâ°Ð¢6öçfW'6F–öâ6öçfW'6F–öâÒÆ÷&T6FÆöræ6öçfW'6F–öâ†–B“°Ð¢&WGW&â6öçfW'6F–öâÓÒçVÆÂÇÂÆ÷&T6FÆöræ—5f—6—F÷"†6öçfW'6F–öâ“°Ð¢Ò“°Ð¢&ööÆVâ6†ævVBÒfÇ6S°Ð¢&ööÆVâ&öÆÅ&VG’Ò7FFRævWDÆ7Ef—6—F÷%&öÆÄB‚’ÓÒçVÆÀÐ¢ÇÂæ÷ræ—4&Vf÷&R‡7FFRævWDÆ7Ef—6—F÷%&öÆÄB‚’çÇW2…d•4•Dõ%õ$ôÄÅô4ôôÄDõtâ’“°Ð¢–b‚&öÆÅ&VG’ÇÂ7F—fRç6—¦R‚’ãÒÔ…ô5D•dUõd•4•Dõ%2’°Ð¢7FFRç6WD7F—fUf—6—F÷$–G2†7F—fR“°Ð¢&WGW&âfÇ6S°Ð¢ÐÐ¢Æ—7CÄ6öçfW'6F–öãâ6æF–FFW2ÒæWr'&”Æ—7CÃâ‚“°Ð¢f÷"„6öçfW'6F–öâf—6—F÷"¢Æ÷&T6FÆörçf—6—F÷%FV×ÆFW2‚’’°Ð¢–b†7F—fRæ6öçF–ç2‡f—6—F÷"æ–B‚’’’6öçF–çVS°Ð¢–b‚ÖVWG5f—6—F÷%&WV—&VÖVçG2‡7FFRÂf—6—F÷"Âæ÷r’’6öçF–çVS°Ð¢6æF–FFW2æFB‡f—6—F÷"“°Ð¢ÐÐ¢–b†6æF–FFW2æ—4V×G’‚’’°Ð¢7FFRç6WD7F—fUf—6—F÷$–G2†7F—fR“°Ð¢&WGW&âfÇ6S°Ð¢ÐÐ¢v†–ÆR†7F—fRç6—¦R‚’ÂÔ…ô5D•dUõd•4•Dõ%2bb6æF–FFW2æ—4V×G’‚’’°Ð¢6öçfW'6F–öâ–6¶VBÒvV–v‡FVE–6²†6æF–FFW2“°Ð¢7F—fRæFB‡–6¶VBæ–B‚’“°Ð¢6æF–FFW2ç&VÖ÷fR‡–6¶VB“°Ð¢6†ævVBÒG'VS°Ð¢ÐÐ¢–b†6†ævVB’7FFRç6WDÆ7Ef—6—F÷%&öÆÄB†æ÷r“°Ð¢7FFRç6WD7F—fUf—6—F÷$–G2†7F—fR“°Ð¢&WGW&â6†ævVC°Ð¢ÐÐ Ð¢&—fFR&ööÆVâÖVWG5f—6—F÷%&WV—&VÖVçG2„¶VW7FFR7FFRÂ6öçfW'6F–öâf—6—F÷"Â–ç7FçBæ÷r’°Ð¢–b‚7FFRævWEVæÆö6¶VDÆ÷&T–G2‚’æ6öçF–ç4ÆÂ‡f—6—F÷"ç&WV—&W4Æ÷&T–G2‚’’’&WGW&âfÇ6S°Ð¢–b‚7FFRævWD6†ö–6TfÆw2‚’æ6öçF–ç4ÆÂ‡f—6—F÷"ç&WV—&W4fÆw2‚’’’&WGW&âfÇ6S°Ð¢–b‡7FFRævWE7F÷&V†÷W6TÆWfVÂ‚’Âf—6—F÷"æÖ–å7F÷&V†÷W6TÆWfVÂ‚’’&WGW&âfÇ6S°Ð¢–ç7FçBf–Æ&ÆTBÒ7FFRævWEf—6—F÷$f–Æ&ÆTB‚’ævWB‡f—6—F÷"æ–B‚’“°Ð¢&WGW&âf–Æ&ÆTBÓÒçVÆÂÇÂæ÷ræ—4&Vf÷&R†f–Æ&ÆTB“°Ð¢ÐÐ Ð¢&—fFR6öçfW'6F–öâvV–v‡FVE–6²„Æ—7CÄ6öçfW'6F–öãâ6æF–FFW2’°Ð¢–çBF÷FÂÒ6æF–FFW2ç7G&VÒ‚’æÖFô–çB„6öçfW'6F–öã£§vV–v‡B’ç7VÒ‚“°Ð¢–çB&öÆÂÒF÷FÂÃÒò¢&æFöÒææW‡D–çB‡F÷FÂ“°Ð¢–çB7W'6÷"Ò°Ð¢f÷"„6öçfW'6F–öâ6æF–FFR¢6æF–FFW2’°Ð¢7W'6÷"³Ò6æF–FFRçvV–v‡B‚“°Ð¢–b‡&öÆÂÂ7W'6÷"’&WGW&â6æF–FFS°Ð¢ÐÐ¢&WGW&â6æF–FFW2ævWB†6æF–FFW2ç6—¦R‚’Ò“°Ð¢ÐÐ Ð¢&—fFR÷WF6öÖR&öÆÄ÷WF6öÖR„Æ—7CÄ÷WF6öÖSâ÷WF6öÖW2’°Ð¢–çBF÷FÂÒ÷WF6öÖW2ç7G&VÒ‚’æÖFô–çB„÷WF6öÖS£§vV–v‡B’ç7VÒ‚“°Ð¢–çB&öÆÂÒF÷FÂÃÒò¢&æFöÒææW‡D–çB‡F÷FÂ“°Ð¢–çB7W'6÷"Ò°Ð¢f÷"„÷WF6öÖR÷WF6öÖR¢÷WF6öÖW2’°Ð¢7W'6÷"³Ò÷WF6öÖRçvV–v‡B‚“°Ð¢–b‡&öÆÂÂ7W'6÷"’&WGW&â÷WF6öÖS°Ð¢ÐÐ¢&WGW&â÷WF6öÖW2ævWB†÷WF6öÖW2ç6—¦R‚’Ò“°Ð¢ÐÐ Ð¢&—fFR–çBÇ•F–Ö&W$FVÇF„¶VW7FFR7FFRÂ–çBFVÇF’°Ð¢–b†FVÇFÓÒ’&WGW&â°Ð¢–b†FVÇFÂ’°Ð¢–çB7VçBÒÖF‚æÖ–â‡7FFRævWEF–Ö&W"‚’ÂÖFVÇF“°Ð¢7FFRç6WEF–Ö&W"‡7FFRævWEF–Ö&W"‚’Ò7VçB“°Ð¢&WGW&â×7VçC°Ð¢ÐÐ¢–çB&ööÒÒÖF‚æÖ‚ƒÂF–Ö&W$–çfVçF÷'”66—G’‡7FFR’Ò7FFRævWEF–Ö&W"‚’“°Ð¢–çBv–æVBÒÖF‚æÖ–â‡&ööÒÂFVÇF“°Ð¢7FFRç6WEF–Ö&W"‡7FFRævWEF–Ö&W"‚’²v–æVB“°Ð¢&WGW&âv–æVC°Ð¢ÐÐ Ð¢&—fFRÖÅ7G&–ærÂ–çFVvW#âÇ”ÖFW&–ÄFVÇF2„¶VW7FFR7FFRÂÖÅ7G&–ærÂ–çFVvW#âFVÇF2’°Ð¢ÖÅ7G&–ærÂ–çFVvW#âÆ–VBÒæWrÆ–æ¶VD†6„ÖÃâ‚“°Ð¢–b†FVÇF2ÓÒçVÆÂÇÂFVÇF2æ—4V×G’‚’’&WGW&âÆ–VC°Ð¢–çB66—G’ÒÖFW&–Ä–çfVçF÷'”66—G’‡7FFR“°Ð¢f÷"„ÖäVçG'“Å7G&–ærÂ–çFVvW#âVçG'’¢FVÇF2æVçG'•6WB‚’’°Ð¢–çBFVÇFÒVçG'’ævWEfÇVR‚’ÓÒçVÆÂò¢VçG'’ævWEfÇVR‚“°Ð¢–b†FVÇFÓÒ’6öçF–çVS°Ð¢–çB÷væVBÒ7FFRævWDÖFW&–Ä–çfVçF÷'’‚’ævWD÷$FVfVÇB†VçG'’ævWD¶W’‚’Â“°Ð¢–b†FVÇFÂ’°Ð¢–çB7VçBÒÖF‚æÖ–â†÷væVBÂÖFVÇF“°Ð¢7FFRævWDÖFW&–Ä–çfVçF÷'’‚’çWB†VçG'’ævWD¶W’‚’Â÷væVBÒ7VçB“°Ð¢Æ–VBçWB†VçG'’ævWD¶W’‚’Â×7VçB“°Ð¢ÒVÇ6R°Ð¢–çB&ööÒÒÖF‚æÖ‚ƒÂ66—G’Ò÷væVB“°Ð¢–çBv–æVBÒÖF‚æÖ–â‡&ööÒÂFVÇF“°Ð¢7FFRævWDÖFW&–Ä–çfVçF÷'’‚’çWB†VçG'’ævWD¶W’‚’Â÷væVB²v–æVB“°Ð¢–b†v–æVBÒ’Æ–VBçWB†VçG'’ævWD¶W’‚’Âv–æVB“°Ð¢ÐÐ¢ÐÐ¢&WGW&âÆ–VC°Ð¢ÐÐ Ð¢&—fFRÆ—7CÄÖÅ7G&–ærÂö&¦V7Cãâ6W&–Æ—¦TÖFW&–ÄFVÇF2„ÖÅ7G&–ærÂ–çFVvW#âFVÇF2’°Ð¢&WGW&âFVÇF2æVçG'•6WB‚’ç7G&VÒ‚’æÖ†VçG'’Óâ°Ð¢ÖÅ7G&–ærÂö&¦V7Câ—FVÒÒæWrÆ–æ¶VD†6„ÖÃâ‚“°Ð¢—FVÒçWB‚&–B"ÂVçG'’ævWD¶W’‚’“°Ð¢—FVÒçWB‚&æÖR"ÂÖFW&–ÄæÖR†VçG'’ævWD¶W’‚’’“°Ð¢—FVÒçWB‚&Ö÷VçB"ÂVçG'’ævWEfÇVR‚’“°Ð¢&WGW&â—FVÓ°Ð¢Ò’çFôÆ—7B‚“°Ð¢ÐÐ Ð¢&—fFR7G&–ærF–ÆöwVU7VÖÖ'’†–çBF–Ö&W%7VçBÂ–çBF–Ö&W$FVÇFÂÖÅ7G&–ærÂ–çFVvW#âÖFW&–Ä6÷7G2ÀÐ¢ÖÅ7G&–ærÂ–çFVvW#âÖFW&–ÄFVÇF2’°Ð¢Æ—7CÅ7G&–æsâ'G2ÒæWr'&”Æ—7CÃâ‚“°Ð¢–b‡F–Ö&W%7VçBâ’'G2æFB‚'7VçB"²F–Ö&W%7VçB²"F–Ö&W""“°Ð¢–b‡F–Ö&W$FVÇFâ’'G2æFB‚&v–æVB"²F–Ö&W$FVÇF²"F–Ö&W""“°Ð¢–b‡F–Ö&W$FVÇFÂ’'G2æFB‚&Æ÷7B"²‚×F–Ö&W$FVÇF’²"F–Ö&W""“°Ð¢ÖFW&–Ä6÷7G2æf÷$V6‚‚†–BÂÖ÷VçB’Óâ°Ð¢–b†Ö÷VçBÒçVÆÂbbÖ÷VçBâ’'G2æFB‚'7VçB"²Ö÷VçB²""²ÖFW&–ÄæÖR†–B’“°Ð¢Ò“°Ð¢ÖFW&–ÄFVÇF2æf÷$V6‚‚†–BÂÖ÷VçB’Óâ°Ð¢–b†Ö÷VçBÓÒçVÆÂÇÂÖ÷VçBÓÒ’&WGW&ã°Ð¢'G2æFB‚†Ö÷VçBâò&v–æVB"¢&Æ÷7B"’²ÖF‚æ'2†Ö÷VçB’²""²ÖFW&–ÄæÖR†–B’“°Ð¢Ò“°Ð¢&WGW&â'G2æ—4V×G’‚’ò$æò7F÷&W26†ævVBâ"¢7G&–æræ¦ö–â‚#²"Â'G2’²"â#°Ð¢ÐÐ Ð¢&—fFRÆ—7CÄÖÅ7G&–ærÂö&¦V7Cãâ&VÆF–öç6†—2„¶VW7FFR7FFR’°Ð¢ÖÅ7G&–ærÂ7G&–æsâæÖW2ÒæWrÆ–æ¶VD†6„ÖÃâ‚“°Ð¢f÷"„6öçfW'6F–öâ6öçfW'6F–öâ¢Æ÷&T6FÆöræÆÄ6öçfW'6F–öç2‚’’°Ð¢æÖW2çWD–d'6VçB†6öçfW'6F–öâæç4–B‚’Â6öçfW'6F–öâæç4æÖR‚’“°Ð¢ÐÐ¢Æ—7CÄÖÅ7G&–ærÂö&¦V7Cãâ÷WBÒæWr'&”Æ—7CÃâ‚“°Ð¢f÷"„ÖäVçG'“Å7G&–ærÂ–çFVvW#âVçG'’¢7FFRævWDç5G'W7B‚’æVçG'•6WB‚’’°Ð¢–çBG'W7BÒÖF‚æÖ‚ƒÂVçG'’ævWEfÇVR‚’“°Ð¢7G&–ær7FvRÒG'W7BãÒrò$&öæFVB"¢G'W7BãÒ2ò%G'W7FVB"¢G'W7BãÒò$7V–çFVB"¢%v'’#°Ð¢ÖÅ7G&–ærÂö&¦V7Câ&÷rÒæWrÆ–æ¶VD†6„ÖÃâ‚“°Ð¢&÷rçWB‚&ç4–B"ÂVçG'’ævWD¶W’‚’“°Ð¢&÷rçWB‚&ç4æÖR"ÂæÖW2ævWD÷$FVfVÇB†VçG'’ævWD¶W’‚’ÂVçG'’ævWD¶W’‚’’“°Ð¢&÷rçWB‚'7FvR"Â7FvR“°Ð¢òòG'W7DÖ‚ÖF6†W2F†R&öæFVBF‡&W6†öÆB6òF†Rfö–6W27V7G'VÒ6â&VæFW"Æ–¶^(iFF—6Æ–¶RàÐ¢&÷rçWB‚'G'W7B"ÂG'W7B“°Ð¢&÷rçWB‚'G'W7DÖ‚"Âr“°Ð¢÷WBæFB‡&÷r“°Ð¢ÐÐ¢&WGW&â÷WC°Ð¢ÐÐ Ð¢ò¢¢Æ–fWF–ÖR¶VW7FG2÷vW"¶VW6†–WfVÖVçG2æBF—FÆW3²&V6÷&F–ær—2&W7BÖVff÷'BæB×W7BæWfW"f–Â¶VW7F–öââ¢ðÐ¢&—fFRfö–B&V6÷&D¶VW7FG2…Æ–W%&öw&W76–öäVçF—G’&öw&W76–öâÂ6öç7VÖW#ÅÆ–W%&öw&W76–öäVçF—G“âWFFR’°Ð¢–b‡&öw&W76–öâÓÒçVÆÂ’&WGW&ã°Ð¢G'’°Ð¢WFFRæ66WB‡&öw&W76–öâ“°Ð¢&öw&W76–öâç6WEWFFVDB†6Æö6²æ–ç7FçB‚’“°Ð¢–b‡&öw&W76–öå7F÷&RÒçVÆÂ’&öw&W76–öå7F÷&Rç6fR‡&öw&W76–öâ“°Ð¢Ò6F6‚„W†6WF–öâ–væ÷&VB’°Ð¢òòF†R¶VW7F–öâ7FæG2V—F†W"vÐ¢ÐÐ¢ÐÐ Ð¢&—fFRfö–BVæÆö6²„¶VW7FFR7FFRÂ7G&–ærÆ÷&T–B’°Ð¢–b†Æ÷&T6FÆöræVçG'’†Æ÷&T–B’ÓÒçVÆÂ’F‡&÷ræWr–ÆÆVvÅ7FFTW†6WF–öâ‚%Væ¶æ÷vâ¶VWÆ÷&R–C¢"²Æ÷&T–B“°Ð¢FEVæ—VR‡7FFRævWEVæÆö6¶VDÆ÷&T–G2‚’ÂÆ÷&T–B“°Ð¢ÐÐ Ð¢&—fFRfö–B&VÖVÖ&W%&WVW7B„¶VW7FFR7FFRÂ7G&–ær&WVW7D–B’°Ð¢7G&–ær–BÒæ÷&ÖÆ—¦U&WVW7D–B‡&WVW7D–B“°Ð¢7FFRævWE&ö6W76VE&WVW7D–G2‚’ç&VÖ÷fR†–B“°Ð¢7FFRævWE&ö6W76VE&WVW7D–G2‚’æFB†–B“°Ð¢v†–ÆR‡7FFRævWE&ö6W76VE&WVW7D–G2‚’ç6—¦R‚’â$UTU5Eô„•5Dõ%•ôÄ”Ô•B’7FFRævWE&ö6W76VE&WVW7D–G2‚’ç&VÖ÷fRƒ“°Ð¢ÐÐ Ð¢&—fFRfö–BFDæWuVæÆö6·2„ÖÅ7G&–ærÂö&¦V7Câ÷WBÂ¶VW7FFR7FFRÂÆ—7CÅ7G&–æsâ&Vf÷&UVæÆö6·2’°Ð¢Æ—7CÅ7G&–æsâæWuVæÆö6·2Ò7FFRævWEVæÆö6¶VDÆ÷&T–G2‚’ç7G&VÒ‚’æf–ÇFW"†–BÓâ&Vf÷&UVæÆö6·2æ6öçF–ç2†–B’’çFôÆ—7B‚“°Ð¢–b‚æWuVæÆö6·2æ—4V×G’‚’’÷WBçWB‚&æWtÆ÷&UVæÆö6·2"ÂæWuVæÆö6·2“°Ð¢ÐÐ Ð¢&—fFR7G&–æræ÷&ÖÆ—¦U&WVW7D–B…7G&–ær&WVW7D–B’°Ð¢7G&–ær–BÒ&WVW7D–BÓÒçVÆÂò""¢&WVW7D–BçG&–Ò‚“°Ð¢–b†–Bæ—4&Ææ²‚’ÇÂ–BæÆVæwF‚‚’â’F‡&÷ræWr–ÆÆVvÄ&wVÖVçDW†6WF–öâ‚$fÆ–B&WVW7B–B—2&WV—&VBâ"“°Ð¢&WGW&â–C°Ð¢ÐÐ Ð¢&—fFRfö–B'V×„¶VW7FFR7FFRÂ–ç7FçBæ÷r’°Ð¢7FFRç6WEfW'6–öâ‡7FFRævWEfW'6–öâ‚’²“°Ð¢7FFRç6WEWFFVDB†æ÷r“°Ð¢ÐÐ Ð¢&—fFRö&¦V7BÆö6²„66÷VçEW6W"W6W"’°Ð¢7G&–ær–BÒW6W"ÓÒçVÆÂÇÂW6W"ævWD–B‚’ÓÒçVÆÂò""¢W6W"ævWD–B‚“°Ð¢&WGW&âÄô4µ5´ÖF‚æfÆö÷$ÖöB†–BçFôÆ÷vW$66R„Æö6ÆRå$ôõB’æ†6„6öFR‚’ÂÄô4µ2æÆVæwF‚•Ó°Ð¢ÐÐ Ð¢&—fFR7FF–2ö&¦V7EµÒ7&VFTÆö6·2‚’°Ð¢ö&¦V7EµÒÆö6·2ÒæWrö&¦V7E³cEÓ°Ð¢f÷"†–çB’Ò²’ÂÆö6·2æÆVæwFƒ²’²²’Æö6·5¶•ÒÒæWrö&¦V7B‚“°Ð¢&WGW&âÆö6·3°Ð¢ÐÐ Ð¢&—fFR7FF–2fö–BFEVæ—VR„Æ—7CÅ7G&–æsâF&vWBÂ7G&–ærfÇVR’°Ð¢–b‡fÇVRÒçVÆÂbbfÇVRæ—4&Ææ²‚’bbF&vWBæ6öçF–ç2‡fÇVR’’F&vWBæFB‡fÇVR“°Ð¢ÐÐ Ð¢fö–B6WD6Æö6²„6Æö6²6Æö6²’°Ð¢F†—2æ6Æö6²Ò6Æö6²ÓÒçVÆÂò6Æö6²ç7—7FVÕUD2‚’¢6Æö6³°Ð¢ÐÐ Ð¢fö–B6WE&æFöÒ…&æFöÒ&æFöÒ’°Ð¢F†—2ç&æFöÒÒ&æFöÒÓÒçVÆÂòæWr&æFöÒ‚’¢&æFöÓ°Ð¢ÐÐ Ð¢&—fFR&V6÷&B&W6–FVçB…7G&–ær–BÂ7G&–æræÖRÂ7G&–ærVÆVÖVçBÂ7G&–ær&&—G’Â7G&–ær'EW&ÂÀÐ¢&ööÆVâ&VfW'&VDEvööFÆ÷B’²ÐÐ¢&—fFR&V6÷&Bf6–Æ—G”FVf–æ—F–öâ…7G&–ær–BÂ7G&–æræÖRÂ7G&–ær'V–æVDæÖRÂ7G&–ær&W6÷W&6T–BÀÐ¢7G&–ær&W6÷W&6TæÖRÂF÷V&ÆR&6U&FUW$Ö–çWFRÂ–çB&6U7F÷&vRÀÐ¢6WCÅ7G&–æsâff–æ—F–W2Â7G&–ærFööÅ&V6—T–BÂ7G&–ær'V–ÆDFW67&—F–öâ’°Ð¢&—fFR7FF–2f–æÂf6–Æ—G”FVf–æ—F–öâTÕE’ÒæWrf6–Æ—G”FVf–æ—F–öâ‚""Â""Â""Â""Â""ÂÂÀÐ¢6WBæöb‚’Â""Â""“°Ð¢ÐÐ¢&—fFR&V6÷&B†ÆÅF†VÖR…7G&–ær–BÂ7G&–æræÖRÂ7G&–ær66VçBÂ7G&–ærG&–Ò’²ÐÐ¢&—fFR&V6÷&B7&gE&V6—R…7G&–ær–BÂ7G&–æræÖRÂ7G&–ærG—RÂ7G&–ær&ööÔ–BÂ–çB&WV—&VDÆWfVÂÀ¢ÖÅ7G&–ærÂ–çFVvW#âÖFW&–Ä6÷7G2Â&ööÆVâ&WVF&ÆRÀ¢7G&–ærFW67&—F–öâÂ7G&–ær&öçW4Æ&VÂÂ–çBF–W"Â7G&–ær&W&WV—6—FT–B’²Ð¢&—fFR&V6÷&BÖ—76–öäFVf–æ—F–öâ…7G&–ærG—RÂ7G&–æræÖRÂ7G&–ærFW67&—F–öâÂ–çBvöÂÀ¢–çBvöÆBÂ–çB&VÖæçG2’²Ð¢&—fFR&V6÷&B'V–ÆE&ö¦V7B…7G&–ær–BÂ7G&–æræÖRÂ–çBF–Ö&W$6÷7BÂÖÅ7G&–ærÂ–çFVvW#âÖFW&–Ä6÷7G2ÀÐ¢ÆöærGW&F–öå6V6öæG2’²ÐÐ¢&—fFR&V6÷&B6öçFW‡B…Æ–W%&öw&W76–öäVçF—G’&öw&W76–öâÂ¶VW7FFR7FFRÂÆ—7CÅ&W6–FVçCâ&W6–FVçG2Â–ç7FçBæ÷r’²ÐÐ Ð¢V&Æ–27FF–26Æ727FÆT¶VW7FFTW†6WF–öâW‡FVæG2–ÆÆVvÅ7FFTW†6WF–öâ°Ð¢V&Æ–27FÆT¶VW7FFTW†6WF–öâ…7G&–ærÖW76vR’²7WW"†ÖW76vR“²ÐÐ¢ÐÐ§ÐÐ 