package com.sieglings.adventure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.service.CardOverrideStorageService;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The shared per-effect settings the dashboard edits. The invariant that matters
 * most: an empty override document must behave exactly like the hardcoded
 * balance this build ships with, so publishing the feature changes nothing until
 * someone actually edits a row.
 */
class SiegeEffectTuningServiceTest {

    @Test
    void defaultsMatchTheShippedBalance() {
        SiegeEffectTuningService service = inMemory();

        assertEquals(2, service.valueBonus(Effect.DAMAGE));
        assertEquals(3, service.valueBonus(Effect.HEAL));
        assertEquals(3, service.valueBonus(Effect.SHIELD));
        assertEquals(3, service.valueBonus(Effect.MAX_HP_BOOST));
        assertEquals(0, service.valueBonus(Effect.BUFF_ATK));
        assertEquals(SiegeContentService.MAX_DRAW_CARDS, service.valueCap(Effect.DRAW));
        assertEquals(SiegeContentService.MAX_AP_GAIN, service.valueCap(Effect.GAIN_AP));
        assertEquals(SiegeContentService.EXECUTE_MIN_AP, service.minActionCost(Effect.EXECUTE));
        assertEquals(SiegeTuning.BUFF_ATK_ROUNDS, service.durationRounds(Effect.BUFF_ATK));
        assertEquals(SiegeTuning.BUFF_SPD_ROUNDS, service.durationRounds(Effect.BUFF_SPD));
        assertEquals(SiegeTuning.ULTIMATE_BUFF_ROUNDS, service.globalValue("ultimateBuffRounds"));
        assertEquals(SiegeTuning.AMP_VALUE_BONUS, service.globalValue("ampValueBonus"));
        assertEquals(SiegeCombatEngine.EXECUTE_BOSS_FRACTION, service.executeBossFraction(), 0.0001);

        assertTrue(service.buildSnapshot().effects().stream().noneMatch(SiegeEffectTuningService.EffectRow::isOverride));
    }

    @Test
    void everyEffectHasARowAndOnlyOffersKnobsItReads() {
        SiegeEffectTuningService service = inMemory();
        List<SiegeEffectTuningService.EffectRow> rows = service.buildSnapshot().effects();

        assertEquals(Effect.values().length, rows.size(), "every Siege effect is editable or explicitly inert");
        for (Effect effect : Effect.values()) {
            assertTrue(rows.stream().anyMatch(r -> r.effect() == effect), effect + " needs a row");
        }
        SiegeEffectTuningService.EffectRow draw = row(rows, Effect.DRAW);
        assertTrue(draw.fields().contains(SiegeEffectTuningService.FIELD_VALUE_CAP));
        // A duration on DRAW would be a promise the engine never keeps.
        assertFalse(draw.fields().contains(SiegeEffectTuningService.FIELD_DURATION_ROUNDS));
        assertTrue(row(rows, Effect.BUFF_ATK).fields().contains(SiegeEffectTuningService.FIELD_DURATION_ROUNDS));
        assertTrue(row(rows, Effect.STUN).fields().isEmpty(), "stun has no magnitude to tune");
    }

    @Test
    void overrideWinsAndResetRestoresTheDefault() {
        SiegeEffectTuningService service = inMemory();

        service.setEffect(Effect.BUFF_ATK, Map.of(SiegeEffectTuningService.FIELD_DURATION_ROUNDS, 4),
                "editor@example.com");
        assertEquals(4, service.durationRounds(Effect.BUFF_ATK));
        // Another effect's window is untouched.
        assertEquals(SiegeTuning.BUFF_SPD_ROUNDS, service.durationRounds(Effect.BUFF_SPD));
        assertTrue(row(service.buildSnapshot().effects(), Effect.BUFF_ATK).isOverride());

        service.resetEffect(Effect.BUFF_ATK, "editor@example.com");
        assertEquals(SiegeTuning.BUFF_ATK_ROUNDS, service.durationRounds(Effect.BUFF_ATK));
        assertFalse(row(service.buildSnapshot().effects(), Effect.BUFF_ATK).isOverride());
    }

    @Test
    void writingOneKnobLeavesTheOthersOnTheRowAlone() {
        SiegeEffectTuningService service = inMemory();

        service.setEffect(Effect.SHIELD, Map.of(SiegeEffectTuningService.FIELD_VALUE_BONUS, 7),
                "editor@example.com");
        service.setEffect(Effect.SHIELD, Map.of(SiegeEffectTuningService.FIELD_DURATION_ROUNDS, 3),
                "editor@example.com");

        assertEquals(7, service.valueBonus(Effect.SHIELD), "the earlier edit survives the later one");
        assertEquals(3, service.durationRounds(Effect.SHIELD));

        // An explicitly null field clears just that knob.
        Map<String, Integer> clear = new HashMap<>();
        clear.put(SiegeEffectTuningService.FIELD_VALUE_BONUS, null);
        service.setEffect(Effect.SHIELD, clear, "editor@example.com");
        assertEquals(3, service.valueBonus(Effect.SHIELD), "value bonus is back to its default");
        assertEquals(3, service.durationRounds(Effect.SHIELD), "the duration override is still standing");
    }

    @Test
    void rejectsUnknownEffectsKnobsThatDoNotApplyAndOutOfRangeValues() {
        SiegeEffectTuningService service = inMemory();

        assertThrows(IllegalArgumentException.class, () -> SiegeEffectTuningService.parseEffect("NOPE"));
        assertThrows(IllegalArgumentException.class,
                () -> service.setEffect(Effect.DRAW, Map.of(SiegeEffectTuningService.FIELD_DURATION_ROUNDS, 2), "e@x.com"),
                "draw grants nothing that expires");
        assertThrows(IllegalArgumentException.class,
                () -> service.setEffect(Effect.STUN, Map.of(SiegeEffectTuningService.FIELD_VALUE_BONUS, 1), "e@x.com"),
                "stun has no settings at all");
        assertThrows(IllegalArgumentException.class,
                () -> service.setEffect(Effect.DAMAGE, Map.of(SiegeEffectTuningService.FIELD_VALUE_BONUS, -1), "e@x.com"));
        assertThrows(IllegalArgumentException.class,
                () -> service.setEffect(Effect.DAMAGE,
                        Map.of(SiegeEffectTuningService.FIELD_VALUE_BONUS,
                                SiegeEffectTuningService.MAX_VALUE_BONUS + 1), "e@x.com"));
        assertThrows(IllegalArgumentException.class, () -> service.setGlobal("nonsense", 2, "e@x.com"));
    }

    @Test
    void globalsOverrideAndReportTheirDefaults() {
        SiegeEffectTuningService service = inMemory();

        service.setGlobal("ultimateBuffRounds", 5, "editor@example.com");
        assertEquals(5, service.globalValue("ultimateBuffRounds"));
        assertEquals(SiegeTuning.RIDER_BUFF_ROUNDS, service.globalValue("riderBuffRounds"));

        service.setGlobal("executeBossPercent", 40, "editor@example.com");
        assertEquals(0.40, service.executeBossFraction(), 0.0001);

        SiegeEffectTuningService.GlobalRow ult = service.buildSnapshot().globals().stream()
                .filter(g -> g.key().equals("ultimateBuffRounds")).findFirst().orElseThrow();
        assertTrue(ult.isOverride());
        assertEquals(SiegeTuning.ULTIMATE_BUFF_ROUNDS, ult.defaultValue());
        assertNotNull(ult.label());

        service.setGlobal("ultimateBuffRounds", null, "editor@example.com");
        assertEquals(SiegeTuning.ULTIMATE_BUFF_ROUNDS, service.globalValue("ultimateBuffRounds"),
                "clearing a global returns it to the shipped value");
    }

    @Test
    void oneBatchAppliesEveryEditAtOnce() {
        SiegeEffectTuningService service = inMemory();

        service.applyChanges(List.of(
                new SiegeEffectTuningService.EffectPatch(Effect.DAMAGE,
                        Map.of(SiegeEffectTuningService.FIELD_VALUE_BONUS, 6), false),
                new SiegeEffectTuningService.EffectPatch(Effect.BUFF_ATK,
                        Map.of(SiegeEffectTuningService.FIELD_DURATION_ROUNDS, 4), false)),
                Map.of("ultimateBuffRounds", 6), "editor@example.com");

        assertEquals(6, service.valueBonus(Effect.DAMAGE));
        assertEquals(4, service.durationRounds(Effect.BUFF_ATK));
        assertEquals(6, service.globalValue("ultimateBuffRounds"));
        assertEquals(3, service.valueBonus(Effect.HEAL), "an untouched effect keeps its default");

        // A reset rides in the same batch as edits to other effects.
        service.applyChanges(List.of(
                new SiegeEffectTuningService.EffectPatch(Effect.DAMAGE, Map.of(), true),
                new SiegeEffectTuningService.EffectPatch(Effect.HEAL,
                        Map.of(SiegeEffectTuningService.FIELD_VALUE_BONUS, 5), false)),
                Map.of(), "editor@example.com");
        assertEquals(2, service.valueBonus(Effect.DAMAGE), "the reset landed");
        assertEquals(5, service.valueBonus(Effect.HEAL));
        assertEquals(4, service.durationRounds(Effect.BUFF_ATK), "an edit from the earlier batch survives");
    }

    @Test
    void abadValueAnywhereInABatchPublishesNothing() {
        SiegeEffectTuningService service = inMemory();

        assertThrows(IllegalArgumentException.class, () -> service.applyChanges(List.of(
                new SiegeEffectTuningService.EffectPatch(Effect.DAMAGE,
                        Map.of(SiegeEffectTuningService.FIELD_VALUE_BONUS, 5), false),
                new SiegeEffectTuningService.EffectPatch(Effect.HEAL,
                        Map.of(SiegeEffectTuningService.FIELD_VALUE_BONUS, 9999), false)),
                Map.of(), "editor@example.com"));

        // The good edit in the same batch must not have been published either.
        assertEquals(2, service.valueBonus(Effect.DAMAGE), "a half-applied batch would be worse than none");
        assertEquals(3, service.valueBonus(Effect.HEAL));

        assertThrows(IllegalArgumentException.class,
                () -> service.applyChanges(List.of(), Map.of(), "editor@example.com"),
                "an empty batch is a mistake, not a silent success");
    }

    @Test
    void moveOverridesPinOneMoveAndLeaveTheRestDerived() {
        SiegeEffectTuningService service = inMemory();

        assertNull(service.moveValue("fire-spark"), "nothing is pinned until someone edits a row");
        assertNull(service.moveActionCost("fire-spark"));

        service.applyMoveChanges(List.of(new SiegeEffectTuningService.MovePatch("fire-spark",
                Map.of(SiegeEffectTuningService.FIELD_MOVE_VALUE, 12,
                        SiegeEffectTuningService.FIELD_MOVE_ACTION_COST, 2), false)), "editor@example.com");

        assertEquals(12, service.moveValue("fire-spark"));
        assertEquals(2, service.moveActionCost("fire-spark"));
        // Case is how the catalog prints it, but a lookup must not depend on that.
        assertEquals(12, service.moveValue("FIRE-SPARK"));
        assertNull(service.moveValue("fire-ember"), "one pin must not leak onto its neighbours");
        // Pinning a move is not an edit to the shared effect knobs.
        assertEquals(2, service.valueBonus(Effect.DAMAGE));
    }

    @Test
    void oneNumberCanBePinnedWhileTheOtherKeepsDeriving() {
        SiegeEffectTuningService service = inMemory();

        service.applyMoveChanges(List.of(new SiegeEffectTuningService.MovePatch("fire-ember",
                Map.of(SiegeEffectTuningService.FIELD_MOVE_ACTION_COST, 3), false)), "editor@example.com");
        assertNull(service.moveValue("fire-ember"), "an unsent field is left alone, not zeroed");
        assertEquals(3, service.moveActionCost("fire-ember"));

        // A field sent as null clears just that number back to derived.
        Map<String, Integer> clearCost = new HashMap<>();
        clearCost.put(SiegeEffectTuningService.FIELD_MOVE_ACTION_COST, null);
        service.applyMoveChanges(List.of(new SiegeEffectTuningService.MovePatch("fire-ember", clearCost, false)),
                "editor@example.com");
        assertNull(service.moveActionCost("fire-ember"));
        assertTrue(service.moveOverrides().isEmpty(), "a row with nothing pinned is dropped, not stored empty");
    }

    @Test
    void outOfRangeMoveNumbersAreRejectedBeforeAnythingIsWritten() {
        SiegeEffectTuningService service = inMemory();
        service.applyMoveChanges(List.of(new SiegeEffectTuningService.MovePatch("fire-spark",
                Map.of(SiegeEffectTuningService.FIELD_MOVE_VALUE, 10), false)), "editor@example.com");

        assertThrows(IllegalArgumentException.class, () -> service.applyMoveChanges(List.of(
                new SiegeEffectTuningService.MovePatch("fire-ember",
                        Map.of(SiegeEffectTuningService.FIELD_MOVE_VALUE, 7), false),
                new SiegeEffectTuningService.MovePatch("fire-fire-burst",
                        Map.of(SiegeEffectTuningService.FIELD_MOVE_ACTION_COST, 99), false)),
                "editor@example.com"));

        assertNull(service.moveValue("fire-ember"), "a half-applied batch would be worse than none");
        assertEquals(10, service.moveValue("fire-spark"), "the earlier publish stands");

        assertThrows(IllegalArgumentException.class, () -> service.applyMoveChanges(
                List.of(new SiegeEffectTuningService.MovePatch(" ", Map.of(
                        SiegeEffectTuningService.FIELD_MOVE_VALUE, 5), false)), "editor@example.com"),
                "a row with no move id names nothing");
    }

    @Test
    void resettingAMoveReturnsItToDerivedAndKeepsEffectTuning() {
        SiegeEffectTuningService service = inMemory();
        service.applyChanges(
                List.of(new SiegeEffectTuningService.EffectPatch(Effect.DAMAGE,
                        Map.of(SiegeEffectTuningService.FIELD_VALUE_BONUS, 5), false)),
                Map.of(),
                List.of(new SiegeEffectTuningService.MovePatch("fire-spark",
                        Map.of(SiegeEffectTuningService.FIELD_MOVE_VALUE, 12), false)),
                "editor@example.com");
        assertEquals(5, service.valueBonus(Effect.DAMAGE));
        assertEquals(12, service.moveValue("fire-spark"));

        service.applyMoveChanges(List.of(
                new SiegeEffectTuningService.MovePatch("fire-spark", Map.of(), true)), "editor@example.com");

        assertNull(service.moveValue("fire-spark"));
        assertEquals(5, service.valueBonus(Effect.DAMAGE), "clearing a move must not clear the effect knobs");
    }

    /**
     * A Firestore read failure falls back to an empty local document so combat
     * keeps running. Publishing must not write that fallback back: the save is a
     * full-document replace, and the fallback does not contain the live pins.
     */
    @Test
    void publishRefusesToReplaceFirestoreWithTheReadFallback() {
        AtomicInteger saves = new AtomicInteger();
        SiegeEffectTuningService service = firestorePublish(saves, new AtomicReference<>(
                new SiegeEffectTuningService.StoredData(
                        new SiegeEffectTuningService.TuningFile(List.of(), null, List.of()),
                        CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE, null, null)));

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> service.applyMoveChanges(
                List.of(new SiegeEffectTuningService.MovePatch("fire-spark",
                        Map.of(SiegeEffectTuningService.FIELD_MOVE_VALUE, 12), false)),
                "editor@example.com"));

        assertTrue(ex.getMessage().contains("not published"));
        assertEquals(0, saves.get(), "the fallback document must not be written to Firestore");
    }

    @Test
    void publishAfterACachedFallbackRereadsFirestoreAndKeepsExistingPins() {
        AtomicInteger saves = new AtomicInteger();
        AtomicReference<SiegeEffectTuningService.StoredData> stored = new AtomicReference<>(
                new SiegeEffectTuningService.StoredData(
                        new SiegeEffectTuningService.TuningFile(List.of(), null, List.of()),
                        CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE, null, null));
        SiegeEffectTuningService service = firestorePublish(saves, stored);
        service.buildSnapshot(); // caches the fallback the way a combat read would

        stored.set(new SiegeEffectTuningService.StoredData(
                new SiegeEffectTuningService.TuningFile(
                        List.of(new SiegeEffectTuningService.EffectOverride("DAMAGE", 9, null, null, null)),
                        null, List.of()),
                CardOverrideStorageService.StorageBackend.FIRESTORE, "editor@example.com", null));

        service.applyMoveChanges(List.of(new SiegeEffectTuningService.MovePatch("fire-spark",
                Map.of(SiegeEffectTuningService.FIELD_MOVE_VALUE, 12), false)), "editor@example.com");

        assertEquals(1, saves.get());
        assertEquals(9, service.valueBonus(Effect.DAMAGE));
        assertEquals(12, service.moveValue("fire-spark"));
    }

    private static SiegeEffectTuningService.EffectRow row(
            List<SiegeEffectTuningService.EffectRow> rows, Effect effect) {
        return rows.stream().filter(r -> r.effect() == effect).findFirst().orElseThrow();
    }

    /**
     * Firestore is the publish target, but {@code loadStored} is still in-memory
     * so the test can hand back a read-fallback document or a live one.
     */
    private SiegeEffectTuningService firestorePublish(
            AtomicInteger saves, AtomicReference<SiegeEffectTuningService.StoredData> stored) {
        return new SiegeEffectTuningService(new ObjectMapper(), null, "appConfig", "siegeEffectTuning") {
            @Override
            protected boolean publishesToFirestore() {
                return true;
            }

            @Override
            protected StoredData loadStored() {
                return stored.get();
            }

            @Override
            protected StoredData saveStored(TuningFile file, String updatedByEmail) {
                saves.incrementAndGet();
                StoredData written = new StoredData(file,
                        CardOverrideStorageService.StorageBackend.FIRESTORE, updatedByEmail, null);
                stored.set(written);
                return written;
            }
        };
    }

    /**
     * The service backed by an in-memory document instead of Firestore or the
     * project file, so the test touches neither the network nor the repo.
     */
    private SiegeEffectTuningService inMemory() {
        ObjectMapper objectMapper = new ObjectMapper();
        // The storage client is only reached through loadStored/saveStored, both
        // overridden below, so this fixture needs no Firestore plumbing at all.
        AtomicReference<SiegeEffectTuningService.TuningFile> holder =
                new AtomicReference<>(new SiegeEffectTuningService.TuningFile(List.of(), null, List.of()));
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
