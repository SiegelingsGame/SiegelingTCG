package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
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

    @SuppressWarnings("unchecked")
    @Test
    void signedInRunAlsoWritesTheAccountResumeCheckpoint() throws Exception {
        SiegeService service = new SiegeService();
        RecordingCheckpointStore checkpoints = new RecordingCheckpointStore();
        setField(service, "checkpoints", checkpoints);
        setField(service, "content", new SiegeContentService());
        SiegeRun run = new SiegeRun("account-save");
        run.setOwnerId("player/with-a-safe-id");
        addRun(service, run);

        service.saveRun("account-save");

        assertEquals("player/with-a-safe-id", checkpoints.savedUserId);
        assertEquals("account-save", checkpoints.accountSnapshot.get("token"));
        assertEquals("player/with-a-safe-id", checkpoints.accountSnapshot.get("ownerId"));
        // A standard expedition lands in the expedition slot; Battlegrounds has its own,
        // so starting one mode no longer discards the other mode's save.
        assertEquals(RunSlot.EXPEDITION, checkpoints.savedSlot);
    }

    /**
     * Desktop starts a new expedition (account pointer moves to T2). The phone
     * is still sitting on T1 and checkpoints. Before this guard that write stole
     * the account resume pointer back, so the new run vanished from
     * {@code /api/siege/run/active}.
     */
    @Test
    void aSupersededRunCannotStealTheAccountResumePointer() throws Exception {
        SiegeService service = new SiegeService();
        MemoryCheckpointStore checkpoints = new MemoryCheckpointStore();
        setField(service, "checkpoints", checkpoints);
        setField(service, "content", new SiegeContentService());

        SiegeRun stale = ownedRun("stale-phone", 12);
        addRun(service, stale);
        service.saveRun("stale-phone");
        assertEquals("stale-phone", checkpoints.accountToken("player-1", RunSlot.EXPEDITION));

        SiegeRun newer = ownedRun("desktop-new", 40);
        addRun(service, newer);
        invokeSaveCheckpoint(service, newer, true);
        assertEquals("desktop-new", checkpoints.accountToken("player-1", RunSlot.EXPEDITION));
        assertEquals(40, checkpoints.accountGold("player-1", RunSlot.EXPEDITION));

        stale.setGold(99);
        service.saveRun("stale-phone");

        assertEquals("desktop-new", checkpoints.accountToken("player-1", RunSlot.EXPEDITION),
                "a leftover device must not overwrite the account slot after a newer run took it");
        assertEquals(40, checkpoints.accountGold("player-1", RunSlot.EXPEDITION),
                "the newer expedition's progress must stay on the account pointer");
        assertEquals(99, checkpoints.tokenGold("stale-phone"),
                "the leftover client may still refresh its own token snapshot");
    }

    @Test
    void theSameRunCanStillUpdateItsAccountCheckpoint() throws Exception {
        SiegeService service = new SiegeService();
        MemoryCheckpointStore checkpoints = new MemoryCheckpointStore();
        setField(service, "checkpoints", checkpoints);
        setField(service, "content", new SiegeContentService());

        SiegeRun run = ownedRun("same-run", 10);
        addRun(service, run);
        service.saveRun("same-run");
        run.setGold(25);
        service.saveRun("same-run");

        assertEquals("same-run", checkpoints.accountToken("player-1", RunSlot.EXPEDITION));
        assertEquals(25, checkpoints.accountGold("player-1", RunSlot.EXPEDITION));
    }

    @Test
    void startingANewRunEvictsThePreviousAccountSave() throws Exception {
        SiegeService service = new SiegeService();
        MemoryCheckpointStore checkpoints = new MemoryCheckpointStore();
        setField(service, "checkpoints", checkpoints);
        setField(service, "content", new SiegeContentService());

        SiegeRun stale = ownedRun("old-token", 12);
        addRun(service, stale);
        service.saveRun("old-token");

        invokeEvict(service, "player-1", RunSlot.EXPEDITION);

        assertFalse(runsMap(service).containsKey("old-token"),
                "the superseded session must leave memory so it cannot keep playing");
        assertNull(checkpoints.tokens.get("old-token"),
                "the old token document must be deleted or lookup will revive it after a recycle");
        assertNull(checkpoints.accountToken("player-1", RunSlot.EXPEDITION),
                "the account pointer is cleared so the incoming run can take the slot");
    }

    private static SiegeRun ownedRun(String token, int gold) {
        SiegeRun run = new SiegeRun(token);
        run.setOwnerId("player-1");
        run.setGold(gold);
        return run;
    }

    private static void invokeSaveCheckpoint(SiegeService service, SiegeRun run, boolean replace)
            throws Exception {
        Method method = SiegeService.class.getDeclaredMethod("saveCheckpoint", SiegeRun.class, boolean.class);
        method.setAccessible(true);
        method.invoke(service, run, replace);
    }

    private static void invokeEvict(SiegeService service, String ownerId, RunSlot slot) throws Exception {
        Method method = SiegeService.class.getDeclaredMethod("evictSupersededAccountRun", String.class, RunSlot.class);
        method.setAccessible(true);
        method.invoke(service, ownerId, slot);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> runsMap(SiegeService service) throws Exception {
        Field runsField = SiegeService.class.getDeclaredField("runs");
        runsField.setAccessible(true);
        return (Map<String, Object>) runsField.get(service);
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
        private String savedUserId;
        private RunSlot savedSlot;
        private Map<String, Object> accountSnapshot;
        private int saveCount;

        @Override
        boolean save(String token, Map<String, Object> snapshot) {
            savedToken = token;
            savedSnapshot = snapshot;
            saveCount++;
            return true;
        }

        @Override
        boolean saveForUser(String userId, RunSlot slot, Map<String, Object> snapshot) {
            savedUserId = userId;
            savedSlot = slot;
            accountSnapshot = snapshot;
            return true;
        }

        @Override
        Optional<Map<String, Object>> loadForUser(String userId, RunSlot slot) {
            return Optional.empty();
        }
    }

    /** Token docs and account slots as separate maps, matching production. */
    private static final class MemoryCheckpointStore extends SiegeCheckpointStore {
        private final Map<String, Map<String, Object>> tokens = new LinkedHashMap<>();
        private final Map<String, Map<String, Object>> accounts = new LinkedHashMap<>();

        @Override
        boolean save(String token, Map<String, Object> snapshot) {
            tokens.put(token, copy(snapshot));
            return true;
        }

        @Override
        Optional<Map<String, Object>> load(String token) {
            Map<String, Object> snapshot = tokens.get(token);
            return snapshot == null ? Optional.empty() : Optional.of(copy(snapshot));
        }

        @Override
        void delete(String token) {
            tokens.remove(token);
        }

        @Override
        boolean saveForUser(String userId, RunSlot slot, Map<String, Object> snapshot) {
            accounts.put(accountKey(userId, slot), copy(snapshot));
            return true;
        }

        @Override
        Optional<Map<String, Object>> loadForUser(String userId, RunSlot slot) {
            Map<String, Object> snapshot = accounts.get(accountKey(userId, slot));
            return snapshot == null ? Optional.empty() : Optional.of(copy(snapshot));
        }

        @Override
        void deleteForUser(String userId, RunSlot slot, String token) {
            String key = accountKey(userId, slot);
            Map<String, Object> existing = accounts.get(key);
            if (existing != null && token != null && token.equals(existing.get("token"))) {
                accounts.remove(key);
            }
        }

        private String accountToken(String userId, RunSlot slot) {
            Map<String, Object> snapshot = accounts.get(accountKey(userId, slot));
            return snapshot == null || snapshot.get("token") == null ? null : String.valueOf(snapshot.get("token"));
        }

        private int accountGold(String userId, RunSlot slot) {
            return intVal(accounts.get(accountKey(userId, slot)), "gold");
        }

        private int tokenGold(String token) {
            return intVal(tokens.get(token), "gold");
        }

        private static String accountKey(String userId, RunSlot slot) {
            return userId + "|" + (slot == null ? "NONE" : slot.name());
        }

        private static Map<String, Object> copy(Map<String, Object> snapshot) {
            return snapshot == null ? new LinkedHashMap<>() : new LinkedHashMap<>(snapshot);
        }

        private static int intVal(Map<String, Object> snapshot, String key) {
            if (snapshot == null || !(snapshot.get(key) instanceof Number number)) {
                return 0;
            }
            return number.intValue();
        }
    }
}
