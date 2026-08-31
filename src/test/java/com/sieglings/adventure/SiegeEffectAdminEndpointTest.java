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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The dashboard endpoints behind the Siege "Ability Effects" panel. Editor auth
 * needs Firestore, which local runs do not have, so the guard and the request
 * shape are pinned here rather than against a live server.
 */
class SiegeEffectAdminEndpointTest {

    private static final String TOKEN = "editor-token";

    @Test
    @SuppressWarnings("unchecked")
    void listReturnsEveryEffectWithItsDefaultsAndApplicableFields() throws Exception {
        SiegeController controller = controller(new StubAuth(true));

        Map<String, Object> body = controller.listEffectTuning();
        List<Map<String, Object>> effects = (List<Map<String, Object>>) body.get("effects");

        assertEquals(Effect.values().length, effects.size());
        Map<String, Object> buff = effects.stream()
                .filter(e -> "BUFF_ATK".equals(e.get("effect"))).findFirst().orElseThrow();
        assertEquals(SiegeTuning.BUFF_ATK_ROUNDS, buff.get("durationRounds"));
        assertEquals(false, buff.get("isOverride"));
        assertTrue(((List<String>) buff.get("fields")).contains("durationRounds"));
        assertTrue(body.containsKey("globals"));
        assertTrue(body.containsKey("source"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void writingAnEffectUpdatesOnlyTheFieldsSentAndNullResetsOne() throws Exception {
        SiegeController controller = controller(new StubAuth(true));

        Map<String, Object> write = new HashMap<>();
        write.put("effect", "BUFF_ATK");
        write.put("durationRounds", 4);
        Map<String, Object> after = controller.setEffectTuning(TOKEN, write);
        assertEquals(4, row(after, "BUFF_ATK").get("durationRounds"));
        assertEquals(true, row(after, "BUFF_ATK").get("isOverride"));
        // A sibling effect is untouched.
        assertEquals(SiegeTuning.BUFF_SPD_ROUNDS, row(after, "BUFF_SPD").get("durationRounds"));

        // A string body value is accepted (the dashboard sends input values).
        Map<String, Object> asText = new HashMap<>();
        asText.put("effect", "DAMAGE");
        asText.put("valueBonus", "5");
        assertEquals(5, row(controller.setEffectTuning(TOKEN, asText), "DAMAGE").get("valueBonus"));

        // An explicit null clears that knob back to its default.
        Map<String, Object> clear = new HashMap<>();
        clear.put("effect", "DAMAGE");
        clear.put("valueBonus", null);
        Map<String, Object> cleared = controller.setEffectTuning(TOKEN, clear);
        assertEquals(2, row(cleared, "DAMAGE").get("valueBonus"));
        assertEquals(false, row(cleared, "DAMAGE").get("isOverride"));
        // …and the unrelated buff override is still standing.
        assertEquals(4, row(cleared, "BUFF_ATK").get("durationRounds"));

        Map<String, Object> reset = controller.resetEffectTuning(TOKEN, Map.of("effect", "BUFF_ATK"));
        assertEquals(SiegeTuning.BUFF_ATK_ROUNDS, row(reset, "BUFF_ATK").get("durationRounds"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void globalSettingsRoundTrip() throws Exception {
        SiegeController controller = controller(new StubAuth(true));

        Map<String, Object> body = new HashMap<>();
        body.put("key", "ultimateBuffRounds");
        body.put("value", 6);
        Map<String, Object> after = controller.setEffectGlobal(TOKEN, body);
        Map<String, Object> ult = ((List<Map<String, Object>>) after.get("globals")).stream()
                .filter(g -> "ultimateBuffRounds".equals(g.get("key"))).findFirst().orElseThrow();
        assertEquals(6, ult.get("value"));
        assertEquals(SiegeTuning.ULTIMATE_BUFF_ROUNDS, ult.get("defaultValue"));
        assertEquals(true, ult.get("isOverride"));
    }

    @Test
    void writesRequireAnEditorAndRejectNonsense() throws Exception {
        SiegeController signedOut = controller(new StubAuth(false));
        assertThrows(IllegalArgumentException.class,
                () -> signedOut.setEffectTuning(null, Map.of("effect", "BUFF_ATK", "durationRounds", 3)),
                "an anonymous caller cannot retune live combat");

        SiegeController controller = controller(new StubAuth(true));
        assertThrows(IllegalArgumentException.class,
                () -> controller.setEffectTuning(TOKEN, Map.of("effect", "NOPE", "valueBonus", 1)));
        assertThrows(IllegalArgumentException.class,
                () -> controller.setEffectTuning(TOKEN, Map.of("effect", "DAMAGE")),
                "a body with no settings is a no-op, not a silent success");
        assertThrows(IllegalArgumentException.class,
                () -> controller.setEffectTuning(TOKEN, Map.of("effect", "DAMAGE", "valueBonus", "twelve")));
        assertThrows(IllegalArgumentException.class,
                () -> controller.setEffectGlobal(TOKEN, Map.of("key", "", "value", 2)));
    }

    @Test
    @SuppressWarnings("unchecked")
    void bulkSavePublishesTheWholeScreenInOneRequest() throws Exception {
        SiegeController controller = controller(new StubAuth(true));

        Map<String, Object> damage = new HashMap<>();
        damage.put("effect", "DAMAGE");
        damage.put("valueBonus", 6);
        Map<String, Object> buff = new HashMap<>();
        buff.put("effect", "BUFF_ATK");
        buff.put("durationRounds", "4"); // the dashboard sends input values as text
        Map<String, Object> body = new HashMap<>();
        body.put("effects", List.of(damage, buff));
        body.put("globals", Map.of("ultimateBuffRounds", 6));

        Map<String, Object> after = controller.saveEffectTuning(TOKEN, body);
        assertEquals(6, row(after, "DAMAGE").get("valueBonus"));
        assertEquals(4, row(after, "BUFF_ATK").get("durationRounds"));
        assertEquals(6, ((List<Map<String, Object>>) after.get("globals")).stream()
                .filter(g -> "ultimateBuffRounds".equals(g.get("key"))).findFirst().orElseThrow().get("value"));

        // A reset flag in the batch drops that effect's row.
        Map<String, Object> reset = new HashMap<>();
        reset.put("effect", "DAMAGE");
        reset.put("reset", true);
        Map<String, Object> cleared = controller.saveEffectTuning(TOKEN, Map.of("effects", List.of(reset)));
        assertEquals(2, row(cleared, "DAMAGE").get("valueBonus"));
        assertEquals(false, row(cleared, "DAMAGE").get("isOverride"));
        assertEquals(4, row(cleared, "BUFF_ATK").get("durationRounds"), "other effects are untouched");
    }

    @Test
    void bulkSaveStillNeedsAnEditorAndRejectsABadBatchWhole() throws Exception {
        SiegeController signedOut = controller(new StubAuth(false));
        assertThrows(IllegalArgumentException.class,
                () -> signedOut.saveEffectTuning(null, Map.of("effects", List.of(Map.of("effect", "DAMAGE", "valueBonus", 3)))));

        SiegeController controller = controller(new StubAuth(true));
        assertThrows(IllegalArgumentException.class,
                () -> controller.saveEffectTuning(TOKEN, Map.of("effects", List.of(
                        Map.of("effect", "DAMAGE", "valueBonus", 5),
                        Map.of("effect", "HEAL", "valueBonus", 9999)))));
        assertEquals(2, row(controller.listEffectTuning(), "DAMAGE").get("valueBonus"),
                "nothing from a rejected batch is published");
        assertThrows(IllegalArgumentException.class,
                () -> controller.saveEffectTuning(TOKEN, Map.of()),
                "an empty body is a mistake, not a no-op save");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> row(Map<String, Object> body, String effect) {
        return ((List<Map<String, Object>>) body.get("effects")).stream()
                .filter(e -> effect.equals(e.get("effect"))).findFirst().orElseThrow();
    }

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

    private SiegeController controller(CardEditorAuthService auth) throws Exception {
        SiegeController controller = new SiegeController();
        inject(controller, "effectTuning", inMemoryTuning());
        inject(controller, "editorAuth", auth);
        return controller;
    }

    private static void inject(Object target, String field, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(field);
        f.setAccessible(true);
        f.set(target, value);
    }

    private SiegeEffectTuningService inMemoryTuning() {
        ObjectMapper objectMapper = new ObjectMapper();
        AtomicReference<SiegeEffectTuningService.TuningFile> holder =
                new AtomicReference<>(new SiegeEffectTuningService.TuningFile(List.of(), null));
        return new SiegeEffectTuningService(objectMapper, null, "appConfig", "siegeEffectTuning") {
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
