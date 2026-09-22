package com.sieglings.adventure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.Move;
import com.sieglings.model.MoveCategory;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.TargetType;
import com.sieglings.service.CardOverrideStorageService;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Per-move Siege tuning: a designer naming one move's AP cost and magnitude in
 * the dashboard, instead of letting both derive from the board card and the
 * shared per-effect knobs.
 *
 * <p>The invariant that matters: an unpinned move must behave exactly as it did
 * before this existed, so shipping the screen changes no balance until someone
 * types a number. {@code toSpec} is private, so this reaches it by reflection
 * rather than widening the content service's surface.
 */
class SiegeMoveTuningTest {

    @Test
    void anUnpinnedMoveStillDerivesEverythingItUsedTo() throws Exception {
        SiegeContentService content = contentWith(tuning());

        AbilitySpec spec = spec(content, damageMove("fire-spark", 3, 1));

        // 3 printed + the DAMAGE effect's +2 bonus; 1 energy prices at 1 AP.
        assertEquals(5, spec.value());
        assertEquals(1, spec.actionCost());
    }

    @Test
    void aPinnedMoveUsesTheTypedNumbersInsteadOfTheDerivedOnes() throws Exception {
        SiegeEffectTuningService tuning = tuning();
        tuning.applyMoveChanges(List.of(new SiegeEffectTuningService.MovePatch("fire-spark",
                Map.of(SiegeEffectTuningService.FIELD_MOVE_VALUE, 12,
                        SiegeEffectTuningService.FIELD_MOVE_ACTION_COST, 3), false)), "editor@example.com");
        SiegeContentService content = contentWith(tuning);

        AbilitySpec spec = spec(content, damageMove("fire-spark", 3, 1));
        assertEquals(12, spec.value());
        assertEquals(3, spec.actionCost());

        // The move next to it is untouched — this is a pin, not a rebalance.
        AbilitySpec neighbour = spec(content, damageMove("fire-ember", 4, 1));
        assertEquals(6, neighbour.value());
        assertEquals(1, neighbour.actionCost());
    }

    @Test
    void pinningOneNumberLeavesTheOtherDeriving() throws Exception {
        SiegeEffectTuningService tuning = tuning();
        tuning.applyMoveChanges(List.of(new SiegeEffectTuningService.MovePatch("fire-spark",
                Map.of(SiegeEffectTuningService.FIELD_MOVE_ACTION_COST, 0), false)), "editor@example.com");

        AbilitySpec spec = spec(contentWith(tuning), damageMove("fire-spark", 3, 2));
        assertEquals(0, spec.actionCost(), "a free move is a legitimate thing to author");
        assertEquals(5, spec.value(), "the magnitude still follows the card");
    }

    @Test
    void aPinnedCostBeatsThePerEffectApFloor() throws Exception {
        SiegeEffectTuningService tuning = tuning();
        // EXECUTE ships with a 3 AP floor so a 0-energy destroy card is not a
        // free kill; naming the cost on one move is how that is overridden.
        Move execute = new Move("shadow-doom", "Doom", Element.SHADOW, MoveCategory.STANDARD,
                TargetType.SINGLE_ENEMY, null, null, 1, "destroy", 4, 0, "Destroy a Siegeling",
                false, null, null);
        assertEquals(SiegeContentService.EXECUTE_MIN_AP, spec(contentWith(tuning), execute).actionCost());

        tuning.applyMoveChanges(List.of(new SiegeEffectTuningService.MovePatch("shadow-doom",
                Map.of(SiegeEffectTuningService.FIELD_MOVE_ACTION_COST, 2), false)), "editor@example.com");
        assertEquals(2, spec(contentWith(tuning), execute).actionCost());
    }

    @Test
    void anEffectWithNoMagnitudeIgnoresAPinnedValue() throws Exception {
        SiegeEffectTuningService tuning = tuning();
        tuning.applyMoveChanges(List.of(new SiegeEffectTuningService.MovePatch("shadow-doom",
                Map.of(SiegeEffectTuningService.FIELD_MOVE_VALUE, 40), false)), "editor@example.com");
        Move execute = new Move("shadow-doom", "Doom", Element.SHADOW, MoveCategory.STANDARD,
                TargetType.SINGLE_ENEMY, null, null, 1, "destroy", 4, 0, "Destroy a Siegeling",
                false, null, null);

        // An execute kills; a magnitude on it would be a number the engine never
        // reads, so the dashboard does not offer one and the engine ignores it.
        assertEquals(0, spec(contentWith(tuning), execute).value());
        assertNull(tuning.moveOverrides().get("shadow-doom").actionCost());
    }

    // ---- fixtures ---------------------------------------------------------

    private static Move damageMove(String id, int value, int energy) {
        return new Move(id, "Spark", Element.FIRE, MoveCategory.STANDARD, TargetType.SINGLE_ENEMY,
                null, null, 1, "damage", value, energy, "Deal damage", false, null, null);
    }

    private static AbilitySpec spec(SiegeContentService content, Move move) throws Exception {
        Method toSpec = SiegeContentService.class.getDeclaredMethod("toSpec", Move.class);
        toSpec.setAccessible(true);
        return (AbilitySpec) toSpec.invoke(content, move);
    }

    /** A bare content service with only the tuning collaborator this path needs. */
    private static SiegeContentService contentWith(SiegeEffectTuningService tuning) throws Exception {
        SiegeContentService content = new SiegeContentService();
        Field f = SiegeContentService.class.getDeclaredField("effectTuning");
        f.setAccessible(true);
        f.set(content, tuning);
        return content;
    }

    /** Tuning backed by an in-memory document — no Firestore, no repo file. */
    private static SiegeEffectTuningService tuning() {
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
