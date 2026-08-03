package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
class SiegeRunSaveTest {

    @SuppressWarnings("unchecked")
    @Test
    void explicitSavePersistsAndReportsAResumableCheckpoint() throws Exception {
        SiegeService service = new SiegeService();
        RecordingCheckpointStore checkpoints = new RecordingCheckpointStore();
        setField(service, "checkpoints", checkpoints);
        setField(service, "content", new SiegeContentService());
        SiegeRun run = new SiegeRun("save-test");
        addRun(service, run);

        Map<String, Object> response = service.saveRun("save-test");

        assertEquals(Boolean.TRUE, response.get("checkpoint"));
        assertTrue(run.isCheckpointSaved());
        assertEquals("save-test", checkpoints.savedToken);
        assertEquals(1, checkpoints.saveCount);
        assertEquals(1, checkpoints.savedSnapshot.get("version"));
    }

    @Test
    void explicitSaveRejectsMissingRun() {
        SiegeService service = new SiegeService();
        assertThrows(IllegalArgumentException.class, () -> service.saveRun(null));
    }

    @Test
    void explicitSaveRejectsFinishedBattles() throws Exception {
        SiegeService service = new SiegeService();
        RecordingCheckpointStore checkpoints = new RecordingCheckpointStore();
        setField(service, "checkpoints", checkpoints);
        setField(service, "content", new SiegeContentService());
        SiegeRun run = new SiegeRun("save-won");
        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        battle.setPhase(BattlePhase.WON);
        battle.getCombatants().add(new Combatant("ally", "Sprout", Element.EARTH, Side.PLAYER, 60, 6, null));
        run.setBattle(battle);
        addRun(service, run);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.saveRun("save-won"));
        assertTrue(ex.getMessage().toLowerCase().contains("finished battle")
                || ex.getMessage().toLowerCase().contains("claim victory"));
        assertEquals(0, checkpoints.saveCount, "WON battles must never be written by explicit Save");
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    @SuppressWarnings("unchecked")
    private static void addRun(SiegeService service, SiegeRun run) throws Exception {
        Class<?> sessionType = Class.forName("com.sieglings.adventure.SiegeService$Session");
        Constructor<?> constructor = sessionType.getDeclaredConstructor(SiegeRun.class);
        constructor.setAccessible(true);
        Object session = constructor.newInstance(run);
        Field runsField = SiegeService.class.getDeclaredField("runs");
        runsField.setAccessible(true);
        ((Map<String, Object>) runsField.get(service)).put(run.getToken(), session);
    }

    private static final class RecordingCheckpointStore extends SiegeCheckpointStore {
        private String savedToken;
        private Map<String, Object> savedSnapshot;
        private int saveCount;

        @Override
        boolean save(String token, Map<String, Object> snapshot) {
            savedToken = token;
            savedSnapshot = snapshot;
            saveCount++;
            return true;
        }
    }
}
