package com.sieglings.keep;

import com.sieglings.keep.KeepLoreCatalog.Conversation;
import com.sieglings.keep.KeepLoreCatalog.ConversationChoice;
import com.sieglings.keep.KeepLoreCatalog.LoreEntry;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.PlayerProgressionService;
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
    private static final int REQUEST_HISTORY_LIMIT = 120;
    private static final Object[] LOCKS = createLocks();

    private final KeepStore store;
    private final PlayerProgressionService progressionService;
    private final CardDefinitionService cardDefinitionService;
    private final KeepLoreCatalog loreCatalog;
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
            if (materializeConstruction(context.state(), context.residents(), context.now())) {
                bump(context.state(), context.now());
                store.save(context.state());
            }
            return serialize(user, context.progression(), context.state(), context.residents(), context.now());
        }
    }

    public Map<String, Object> collect(AccountUser user, String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            int room = Math.max(0, TIMBER_INVENTORY_CAPACITY - state.getTimber());
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
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("collected", Map.of("resource", "TIMBER", "amount", grant));
            return extra;
        });
    }

    public Map<String, Object> inviteResident(AccountUser user, String residentId,
                                               String requestId, long expectedVersion) {
        return mutate(user, requestId, expectedVersion, context -> {
            KeepState state = context.state();
            String normalized = residentId == null ? "" : residentId.trim();
            if (!normalized.isBlank() && context.residents().stream().noneMatch(r -> r.id().equals(normalized))) {
                throw new IllegalArgumentException("That Siegling has not joined your collection yet.");
            }
            materializeProduction(state, context.residents(), context.now());
            state.setWoodlotResidentId(normalized);
            return Map.of("residentChanged", true);
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
            int cost;
            long duration;
            if ("restore_archive".equals(id)) {
                if (state.getArchiveLevel() > 0) throw new IllegalArgumentException("The Archive is already restored.");
                cost = ARCHIVE_RESTORE_COST;
                duration = ARCHIVE_RESTORE_SECONDS;
            } else if ("woodlot_level_2".equals(id)) {
                if (state.getArchiveLevel() < 1) throw new IllegalArgumentException("Restore the Archive before expanding the Woodlot.");
                if (state.getWoodlotLevel() >= 2) throw new IllegalArgumentException("The Woodlot is already level 2.");
                cost = WOODLOT_LEVEL_TWO_COST;
                duration = WOODLOT_LEVEL_TWO_SECONDS;
            } else {
                throw new IllegalArgumentException("Unknown construction project.");
            }
            if (state.getTimber() < cost) throw new IllegalArgumentException("You need " + cost + " timber for that project.");
            state.setTimber(state.getTimber() - cost);
            state.setActiveConstructionId(id);
            state.setConstructionStartedAt(context.now());
            state.setConstructionCompletesAt(context.now().plusSeconds(duration));
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
            addUnique(state.getReadLoreIds(), id);
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
            boolean completed = materializeConstruction(state, context.residents(), context.now());
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

    private boolean materializeConstruction(KeepState state, List<Resident> residents, Instant now) {
        String id = state.getActiveConstructionId();
        Instant completesAt = state.getConstructionCompletesAt();
        if (id == null || id.isBlank() || completesAt == null || now.isBefore(completesAt)) return false;
        if ("woodlot_level_2".equals(id)) {
            materializeProduction(state, residents, completesAt);
            state.setWoodlotLevel(2);
            unlock(state, "letter_green_covenant");
            materializeProduction(state, residents, now);
        } else if ("restore_archive".equals(id)) {
            state.setArchiveLevel(1);
            unlock(state, "chronicle_living_elements");
            unlock(state, "letter_pre_covenant_watch");
        }
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

    private int projectedWoodlotAvailable(KeepState state, List<Resident> residents, Instant now) {
        Instant last = state.getWoodlotLastAccruedAt();
        long seconds = last == null || !now.isAfter(last) ? 0 : Duration.between(last, now).getSeconds();
        long produced = Math.max(0, (long) Math.floor(
                seconds * woodlotRate(state, residents) / 60.0 + state.getWoodlotProductionRemainder() + 1e-9));
        return (int) Math.min(woodlotStorageCapacity(state), state.getWoodlotStored() + produced);
    }

    private double woodlotRate(KeepState state, List<Resident> residents) {
        double base = state.getWoodlotLevel() >= 2 ? 2.0 : 1.0;
        Resident invited = residents.stream().filter(r -> r.id().equals(state.getWoodlotResidentId())).findFirst().orElse(null);
        return invited != null && invited.preferredAtWoodlot() ? base * 1.15 : base;
    }

    private int woodlotStorageCapacity(KeepState state) {
        return state.getWoodlotLevel() >= 2 ? 360 : 120;
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
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("serverTime", now.toString());
        out.put("stateVersion", state.getVersion());
        out.put("keepName", (user.getDisplayName() == null || user.getDisplayName().isBlank() ? "The Keeper" : user.getDisplayName()) + "'s Keep");
        out.put("chapter", Map.of("id", "wounded_ground", "number", 1, "title", "The Wounded Ground"));
        out.put("resources", Map.of(
                "timber", state.getTimber(),
                "timberCapacity", TIMBER_INVENTORY_CAPACITY
        ));

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
        station.put("resident", invited == null ? null : serializeResident(invited));
        station.put("collectCount", state.getWoodlotCollectCount());
        out.put("station", station);

        List<Map<String, Object>> residentPayload = residents.stream().map(this::serializeResident).toList();
        out.put("residents", residentPayload);
        out.put("buildings", buildings(state));
        out.put("buildOptions", buildOptions(state));
        out.put("activeConstruction", activeConstruction(state, now));
        out.put("visualState", Map.of(
                "archiveRestored", state.getArchiveLevel() > 0,
                "woodlotLevel", state.getWoodlotLevel(),
                "healingStage", Math.min(3, state.getWoodlotCollectCount() + state.getArchiveLevel())
        ));

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

    private List<Map<String, Object>> buildings(KeepState state) {
        return List.of(
                building("great_hall", "Covenant Hall", 1, "COMPLETE"),
                building("woodlot", "Restorative Woodlot", state.getWoodlotLevel(),
                        "woodlot_level_2".equals(state.getActiveConstructionId()) ? "CONSTRUCTING" : "COMPLETE"),
                building("archive", state.getArchiveLevel() > 0 ? "Living Archive" : "Ruined Archive", state.getArchiveLevel(),
                        "restore_archive".equals(state.getActiveConstructionId()) ? "CONSTRUCTING"
                                : state.getArchiveLevel() > 0 ? "COMPLETE" : "RUINED")
        );
    }

    private Map<String, Object> building(String id, String name, int level, String status) {
        return Map.of("id", id, "name", name, "level", level, "status", status);
    }

    private List<Map<String, Object>> buildOptions(KeepState state) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (state.getArchiveLevel() < 1) {
            out.add(buildOption("restore_archive", "Restore the Living Archive", ARCHIVE_RESTORE_COST,
                    ARCHIVE_RESTORE_SECONDS, "Raise a shelter for recovered letters and the memories held by the land.",
                    state.getActiveConstructionId().isBlank() && state.getTimber() >= ARCHIVE_RESTORE_COST));
        } else if (state.getWoodlotLevel() < 2) {
            out.add(buildOption("woodlot_level_2", "Cultivate the Woodlot", WOODLOT_LEVEL_TWO_COST,
                    WOODLOT_LEVEL_TWO_SECONDS, "Replace clear-cutting with a grove shaped by human and Siegling knowledge.",
                    state.getActiveConstructionId().isBlank() && state.getTimber() >= WOODLOT_LEVEL_TWO_COST));
        }
        return out;
    }

    private Map<String, Object> buildOption(String id, String name, int timberCost, long seconds,
                                            String description, boolean canStart) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", name);
        out.put("timberCost", timberCost);
        out.put("durationSeconds", seconds);
        out.put("description", description);
        out.put("canStart", canStart);
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
    private record Context(PlayerProgressionEntity progression, KeepState state, List<Resident> residents, Instant now) { }

    public static class StaleKeepStateException extends IllegalStateException {
        public StaleKeepStateException(String message) { super(message); }
    }
}
