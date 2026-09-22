package com.sieglings.adventure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.CardOverrideStorageService;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The dashboard endpoints behind the Siege "Move Values" panel. Editor auth
 * needs Firestore, which local runs do not have, so the guard and the request
 * shape are pinned here rather than against a live server. The derivation those
 * rows display is covered by {@link SiegeMoveTuningTest}; what matters here is
 * that the panel's requests reach the store intact and that nothing writes
 * without an editor.
 */
class SiegeMoveAdminEndpointTest {

    private static final String TOKEN = "editor-token";

    @Test
    void writingAMovePinsOnlyTheNumbersSent() throws Exception {
        SiegeEffectTuningService tuning = inMemoryTuning();
        SiegeController controller = controller(tuning, new StubAuth(true));

        Map<String, Object> body = new HashMap<>();
        body.put("moveId", "fire-spark");
        body.put("value", 12);
        controller.setMoveTuning(TOKEN, body);

        assertEquals(12, tuning.moveValue("fire-spark"));
        assertNull(tuning.moveActionCost("fire-spark"), "an unsent field keeps deriving");

        // The dashboard sends input values as text.
        Map<String, Object> asText = new HashMap<>();
        asText.put("moveId", "fire-spark");
        asText.put("actionCost", "2");
        controller.setMoveTuning(TOKEN, asText);
        assertEquals(2, tuning.moveActionCost("fire-spark"));
        assertEquals(12, tuning.moveValue("fire-spark"), "the other number is left alone");

        // An explicit null returns that one number to derived.
        Map<String, Object> clear = new HashMap<>();
        clear.put("moveId", "fire-spark");
        clear.put("value", null);
        controller.setMoveTuning(TOKEN, clear);
        assertNull(tuning.moveValue("fire-spark"));
        assertEquals(2, tuning.moveActionCost("fire-spark"));

        controller.resetMoveTuning(TOKEN, Map.of("moveId", "fire-spark"));
        assertNull(tuning.moveActionCost("fire-spark"));
    }

    @Test
    void bulkSavePublishesEveryEditedRowInOneRequest() throws Exception {
        SiegeEffectTuningService tuning = inMemoryTuning();
        SiegeController controller = controller(tuning, new StubAuth(true));

        controller.saveMoveTuning(TOKEN, Map.of("moves", List.of(
                Map.of("moveId", "fire-spark", "value", 12),
                Map.of("moveId", "fire-ember", "actionCost", "0"))));
        assertEquals(12, tuning.moveValue("fire-spark"));
        assertEquals(0, tuning.moveActionCost("fire-ember"));

        // A reset flag in the batch drops that row and leaves the rest standing.
        controller.saveMoveTuning(TOKEN, Map.of("moves", List.of(
                Map.of("moveId", "fire-spark", "reset", true))));
        assertNull(tuning.moveValue("fire-spark"));
        assertEquals(0, tuning.moveActionCost("fire-ember"));
    }

    @Test
    void writesRequireAnEditorAndABadBatchIsRejectedWhole() throws Exception {
        SiegeEffectTuningService signedOutStore = inMemoryTuning();
        SiegeController signedOut = controller(signedOutStore, new StubAuth(false));
        assertThrows(IllegalArgumentException.class,
                () -> signedOut.setMoveTuning(null, Map.of("moveId", "fire-spark", "value", 12)),
                "an anonymous caller cannot retune live combat");
        assertThrows(IllegalArgumentException.class,
                () -> signedOut.saveMoveTuning(null, Map.of("moves", List.of(
                        Map.of("moveId", "fire-spark", "value", 12)))));
        assertNull(signedOutStore.moveValue("fire-spark"));

        SiegeEffectTuningService tuning = inMemoryTuning();
        SiegeController controller = controller(tuning, new StubAuth(true));
        assertThrows(IllegalArgumentException.class,
                () -> controller.setMoveTuning(TOKEN, Map.of("moveId", "fire-spark")),
                "a body with no numbers is a no-op, not a silent success");
        assertThrows(IllegalArgumentException.class,
                () -> controller.setMoveTuning(TOKEN, Map.of("moveId", "fire-spark", "value", "twelve")));
        assertThrows(IllegalArgumentException.class,
                () -> controller.saveMoveTuning(TOKEN, Map.of("moves", List.of())),
                "an empty batch is a mistake, not a save");

        assertThrows(IllegalArgumentException.class,
                () -> controller.saveMoveTuning(TOKEN, Map.of("moves", List.of(
                        Map.of("moveId", "fire-spark", "value", 12),
                        Map.of("moveId", "fire-ember", "value", 9999)))));
        assertNull(tuning.moveValue("fire-spark"), "nothing from a rejected batch is published");
    }

    // ---- fixtures ---------------------------------------------------------

    /** Editor auth that answers without Firestore, either signed in or not. */
    private static final class StubAuth extends CardEditorAuthService {
        private final boolean signedIn;

        StubAuth(boolean signedIn) {
            super(null, "admins", "sessions", 30);
            this.signedIn = signedIn;
        }

        @Override
        public EditorIdentity requireEditor(String token) {
            if (!signedIn) throw new IllegalArgumentException("Sign in to publish live card data.");
            return new EditorIdentity("editor@example.com", "Editor");
        }
    }

    /**
     * The listing side needs the card catalog and the move pool; this test is
     * about the write path, so the response body is stubbed out and the store is
     * asserted directly.
     */
    private static final class StubContent extends SiegeContentService {
        @Override
        public List<MoveTuningRow> listMoveTuning() {
            return List.of();
        }
    }

    private SiegeController controller(SiegeEffectTuningService tuning, CardEditorAuthService auth)
            throws Exception {
        SiegeController controller = new SiegeController();
        inject(controller, "effectTuning", tuning);
        inject(controller, "content", new StubContent());
        inject(controller, "editorAuth", auth);
        return controller;
    }

    private static void inject(Object target, String field, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(field);
        f.setAccessible(true);
        f.set(target, value);
    }

    private SiegeEffectTuningService inMemoryTuning() {
        AtomicReference<SiegeEffectTuningService.TuningFile> holder =
                new AtomicReference<>(new SiegeEffectTuningService.TuningFile(List.of(), null, List.of()));
        return new SiegeEffectTuningService(new ObjectMapper(), null, "appConfig", "siegeEffectTuning") {
            @Override
            protected StoredData loadStored() {
                return new StoredData(holder.get(),
                        CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE, null, null);
            }

            @Override
            protected StoredData saveStored(TuningFile file, String updatedByEmail) {
                holder.set(file);
                invalidateCache();
                return new StoredData(file,
                        CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE, updatedByEmail, null);
            }
        };
    }
}
