package com.sieglings.keep;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.service.CardOverrideStorageService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KeepTuningServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void anEmptyOrPartialDocumentFallsBackToTheShippedBalance() {
        KeepTuning empty = KeepTuning.EMPTY;

        assertEquals(0.25, empty.ratePerMinute("garden", 0.25), 0.0001);
        assertEquals(90, empty.storage("garden", 90));
        assertEquals(240, empty.timberCost("build_enclave", 240));
        assertEquals(7_200L, empty.durationSeconds("build_enclave", 7_200L));
        assertEquals(KeepTuning.DEFAULT_FACILITY_AFFINITY_PERCENT, empty.facilityAffinityPercent());
        assertEquals(KeepTuning.DEFAULT_RAPPORT_STEP_PERCENT, empty.rapportStepPercent());
        assertEquals(20, empty.favoritePercent("LEGENDARY"));
        assertEquals(5, empty.favoritePercent("nonsense"), "An unknown rarity falls back to Common.");
        assertEquals("Shipped Name", empty.recipeName("living_trellis", "Shipped Name"));
        assertEquals(KeepTuning.DEFAULT_RAPPORT_THRESHOLDS, empty.rapportThresholds());
        assertEquals(5, empty.rapportMaxLevel());

        // A row that only overrides one field leaves the rest on the shipped value.
        KeepTuning partial = new KeepTuning(List.of(new KeepTuning.Building("garden", null, 500)),
                List.of(), null, List.of(), null);
        assertEquals(0.25, partial.ratePerMinute("garden", 0.25), 0.0001);
        assertEquals(500, partial.storage("garden", 90));
        assertEquals(90, partial.storage("forge", 90), "An override applies only to the workshop it names.");
    }

    @Test
    void malformedNumbersAndThresholdsAreRepairedRatherThanBreakingALiveKeep() {
        KeepTuning tuning = new KeepTuning(
                List.of(new KeepTuning.Building("garden", -3.0, 0)),
                List.of(new KeepTuning.Project("build_enclave", -1, 0L)),
                new KeepTuning.Buffs(null, null, null, null, null, Map.of("RARE", -4), null,
                        // Descending and duplicate thresholds would make levels unreachable.
                        List.of(9, 4, 4, 30)),
                List.of(new KeepTuning.Recipe("living_trellis", "  ", "", Map.of("verdant_fiber", 0))),
                null);

        assertEquals(0.25, tuning.ratePerMinute("garden", 0.25), 0.0001);
        assertEquals(90, tuning.storage("garden", 90));
        assertEquals(240, tuning.timberCost("build_enclave", 240));
        assertEquals(7_200L, tuning.durationSeconds("build_enclave", 7_200L));
        assertEquals(12, tuning.favoritePercent("RARE"));
        assertEquals(List.of(0, 4, 5, 30), tuning.rapportThresholds(),
                "Thresholds are forced to start at zero and strictly ascend.");
        assertEquals("Shipped", tuning.recipeName("living_trellis", "Shipped"));
        assertEquals(Map.of("verdant_fiber", 8), tuning.recipeCosts("living_trellis", Map.of("verdant_fiber", 8)),
                "A cost list with no positive amounts is ignored.");
    }

    @Test
    void tuningRoundTripsThroughStorageAndABrokenDocumentDegradesToDefaults() {
        AtomicReference<KeepTuning> holder = new AtomicReference<>(KeepTuning.EMPTY);
        KeepTuningService service = inMemoryService(holder, false);

        KeepTuning saved = new KeepTuning(List.of(new KeepTuning.Building("forge", 0.9, 300)), List.of(),
                new KeepTuning.Buffs(45, null, null, null, null, null, 25, null), List.of(),
                new KeepTuning.Tasks(Map.of("FIRE", List.of(new KeepTuning.Task(
                        "fire_custom", "CRAFTING", 4, "Retuned", "{name} asks.", 6, 12, 3))), Map.of()));
        service.save(saved, "editor@example.com");

        KeepTuning current = service.current();
        assertEquals(0.9, current.ratePerMinute("forge", 0.2), 0.0001);
        assertEquals(45, current.facilityAffinityPercent());
        assertEquals(25, current.rapportStepPercent());
        assertEquals(1, current.elementTasks("fire").size(), "Element lookup is case insensitive.");

        // A storage failure must not take My Keep down with it.
        KeepTuningService broken = inMemoryService(holder, true);
        assertSame(KeepTuning.EMPTY, broken.current());
    }

    @Test
    void parseRejectsAPayloadThatIsNotAKeepTuningDocument() {
        KeepTuningService service = inMemoryService(new AtomicReference<>(KeepTuning.EMPTY), false);
        JsonNode nonsense = objectMapper.createObjectNode().put("buildings", "not-a-list");

        assertThrows(IllegalArgumentException.class, () -> service.parse(nonsense));
        assertSame(KeepTuning.EMPTY, service.parse(null));
    }

    @Test
    void everyElementShipsATaskLadderAndEachSiegelingGetsItsOwnBondTask() {
        for (String element : KeepEnclaveTaskCatalog.elementKeys()) {
            List<KeepEnclaveTaskCatalog.TaskDefinition> tasks =
                    KeepEnclaveTaskCatalog.tasksFor(KeepTuning.EMPTY, "card_" + element, "Test", element);
            assertEquals(3, tasks.size(), element + " must offer two element tasks plus a personal one.");
            assertEquals("BOND", tasks.get(2).source());
            for (KeepEnclaveTaskCatalog.TaskDefinition task : tasks) {
                assertTrue(KeepEnclaveTaskCatalog.EVENT_TYPES.contains(task.event()),
                        task.id() + " watches an event the Keep never raises: " + task.event());
                assertTrue(task.goal() > 0 && task.rapport() > 0, task.id() + " must be completable and pay rapport.");
            }
        }
        // The personal task is a function of the card id, so it is stable but not shared.
        assertEquals(KeepEnclaveTaskCatalog.bondTask("emberling"), KeepEnclaveTaskCatalog.bondTask("emberling"));
        long distinct = List.of("emberling", "mossling", "aurorix", "frostkin", "voltfang", "gravemoss").stream()
                .map(KeepEnclaveTaskCatalog::bondTask).distinct().count();
        assertTrue(distinct > 1, "Bond tasks must vary between Siegelings.");
    }

    /** A tuning service backed by an in-memory holder instead of Firestore or the project file. */
    private KeepTuningService inMemoryService(AtomicReference<KeepTuning> holder, boolean failing) {
        // The storage collaborator is never reached: both entry points are overridden below.
        return new KeepTuningService(objectMapper, null, "appConfig", "keepTuning") {
            @Override
            public LoadSnapshot loadSnapshot() {
                if (failing) throw new IllegalStateException("storage unavailable");
                return new LoadSnapshot(holder.get(),
                        CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE, "in-memory", null, null);
            }

            @Override
            public LoadSnapshot save(KeepTuning tuning, String updatedByEmail) {
                holder.set(KeepTuning.orEmpty(tuning));
                return loadSnapshot();
            }
        };
    }
}
