package com.sieglings.keep;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.CardOverrideStorageService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The dashboard's Keep page talks to these endpoints. Firestore-backed editor auth is not
 * reachable from a local runtime, so the guard and the payload shape are covered here.
 */
class KeepTuningControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicReference<KeepTuning> stored = new AtomicReference<>(KeepTuning.EMPTY);

    @Test
    void loadExposesTheShippedDefaultsTheDashboardRendersAsPlaceholders() {
        Map<String, Object> response = controller(true).load();

        assertEquals(KeepTuning.EMPTY, response.get("tuning"));
        @SuppressWarnings("unchecked")
        Map<String, Object> defaults = (Map<String, Object>) response.get("defaults");
        assertEquals(6, ((List<?>) defaults.get("buildings")).size(), "Every workshop must be tunable.");
        assertTrue(((List<?>) defaults.get("projects")).size() >= 20, "Every construction project must be tunable.");
        assertTrue(((List<?>) defaults.get("recipes")).size() > 50, "Every tool and decoration must be tunable.");
        assertEquals(13, ((Map<?, ?>) defaults.get("elementTasks")).size(), "Every element ships a task ladder.");
        assertEquals(6, ((List<?>) defaults.get("bondTasks")).size());
        assertEquals(KeepEnclaveTaskCatalog.EVENT_TYPES.size(), ((List<?>) defaults.get("taskEvents")).size());
        @SuppressWarnings("unchecked")
        Map<String, Object> buffs = (Map<String, Object>) defaults.get("buffs");
        assertEquals(KeepTuning.DEFAULT_RAPPORT_STEP_PERCENT, buffs.get("rapportStepPercent"));
        assertEquals(KeepTuning.DEFAULT_RAPPORT_THRESHOLDS, buffs.get("rapportThresholds"));
        assertNotNull(buffs.get("favoritePercentByRarity"));
    }

    @Test
    void savingRequiresAnEditorAndPersistsThePostedOverrides() {
        KeepTuningController guarded = controller(false);
        Map<String, Object> body = Map.of("tuning", Map.of("buffs", Map.of("rapportStepPercent", 25)));
        assertThrows(IllegalArgumentException.class, () -> guarded.save("bad-token", body));
        assertSame(KeepTuning.EMPTY, stored.get(), "A rejected save must not touch the live document.");

        Map<String, Object> saved = controller(true).save("good-token", Map.of("tuning", Map.of(
                "buildings", List.of(Map.of("id", "garden", "ratePerMinute", 0.5, "storage", 250)),
                "buffs", Map.of("rapportStepPercent", 25, "favoritePercentByRarity", Map.of("LEGENDARY", 30)),
                "tasks", Map.of("elements", Map.of("FIRE", List.of(Map.of(
                        "id", "fire_custom", "event", "CRAFTING", "goal", 4, "name", "Retuned Fire",
                        "description", "{name} asks.", "rapport", 6, "gold", 120, "remnants", 30)))))));

        KeepTuning live = stored.get();
        assertEquals(0.5, live.ratePerMinute("garden", 0.25), 0.0001);
        assertEquals(250, live.storage("garden", 90));
        assertEquals(25, live.rapportStepPercent());
        assertEquals(30, live.favoritePercent("LEGENDARY"));
        assertEquals(1, live.elementTasks("FIRE").size());
        assertEquals(live, saved.get("tuning"));
        assertEquals(20, live.facilityAffinityPercent(), "Untouched fields keep the shipped value.");
    }

    @Test
    void resetClearsEveryOverrideAndAMalformedPayloadIsRefused() {
        stored.set(new KeepTuning(List.of(new KeepTuning.Building("garden", 9.0, 999)),
                List.of(), null, List.of(), null));
        KeepTuningController controller = controller(true);

        assertThrows(IllegalArgumentException.class, () -> controller.save("good-token", Map.of()));
        assertThrows(IllegalArgumentException.class,
                () -> controller.save("good-token", Map.of("tuning", Map.of("buildings", "not-a-list"))));
        assertEquals(9.0, stored.get().ratePerMinute("garden", 0.25), 0.0001);

        controller.reset("good-token");
        assertEquals(KeepTuning.EMPTY, stored.get());
        assertEquals(0.25, stored.get().ratePerMinute("garden", 0.25), 0.0001);
    }

    private KeepTuningController controller(boolean signedIn) {
        KeepTuningService tuningService = new KeepTuningService(objectMapper, null, "appConfig", "keepTuning") {
            @Override
            public LoadSnapshot loadSnapshot() {
                return new LoadSnapshot(stored.get(),
                        CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE, "in-memory", null, null);
            }

            @Override
            public LoadSnapshot save(KeepTuning tuning, String updatedByEmail) {
                stored.set(KeepTuning.orEmpty(tuning));
                return loadSnapshot();
            }
        };
        CardEditorAuthService auth = new CardEditorAuthService(null, "admins", "sessions", 30) {
            @Override
            public EditorIdentity requireEditor(String token) {
                if (!signedIn) throw new IllegalArgumentException("Sign in to publish live card data.");
                return new EditorIdentity("editor@example.com", "Editor");
            }
        };
        return new KeepTuningController(tuningService, auth, objectMapper);
    }
}
