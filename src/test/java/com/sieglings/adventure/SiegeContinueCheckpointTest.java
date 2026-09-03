package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A finished battle must not be written as a checkpoint. Persisting WON lets a
 * Cloud Run recycle restore that snapshot after {@code continueRun} already
 * applied spoils (rewards themselves are not checkpointed), so a second
 * Continue would double gold/XP/end-rewards.
 */
class SiegeContinueCheckpointTest {

    private SiegeService service;
    private final AtomicInteger saveCount = new AtomicInteger();
    private final AtomicReference<Map<String, Object>> lastSnapshot = new AtomicReference<>();

    @BeforeEach
    void setUp() throws Exception {
        service = new SiegeService();
        SiegeContentService content = new SiegeContentService();
        setField(service, "content", content);
        SiegeCombatEngine engine = new SiegeCombatEngine();
        setField(engine, "content", content);
        setField(service, "engine", engine);
        setField(service, "checkpoints", new SiegeCheckpointStore() {
            @Override
            boolean save(String token, Map<String, Object> snapshot) {
                saveCount.incrementAndGet();
                lastSnapshot.set(new LinkedHashMap<>(snapshot));
                return true;
            }

            @Override
            Optional<Map<String, Object>> load(String token) {
                Map<String, Object> snap = lastSnapshot.get();
                return snap == null ? Optional.empty() : Optional.of(new LinkedHashMap<>(snap));
            }

            @Override
            void delete(String token) {
                lastSnapshot.set(null);
            }
        });
    }

    @Test
    void continueRunSerializesOnTheSessionMonitor() throws Exception {
        // Timeout retries / double Claim Rewards must not re-enter grantEndRewards
        // while the first continue is still writing progression gold.
        String source = java.nio.file.Files.readString(
                java.nio.file.Path.of("src/main/java/com/sieglings/adventure/SiegeService.java"));
        assertTrue(
                source.contains("Session session = requireSession(token);")
                        && source.contains("synchronized (session)")
                        && source.contains("continueRunLocked("),
                "continueRun must lock the in-memory Session before applying battle spoils."
        );
        assertTrue(
                source.contains("Map<String, Object> extract(String token, String authorizationHeader)")
                        && source.indexOf("synchronized (session)", source.indexOf("Map<String, Object> extract(String token"))
                        > source.indexOf("Map<String, Object> extract(String token"),
                "extract must use the same Session lock before banking end rewards."
        );
    }

    @Test
    void checkpointSkipsFinishedBattles() throws Exception {
        SiegeRun run = baseRun();
        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        battle.setPhase(BattlePhase.WON);
        battle.getCombatants().add(run.getParty().getFirst());
        battle.getCombatants().add(run.getKnightUnit());
        run.setBattle(battle);
        registerRun(run);

        invokeCheckpoint(run);

        assertEquals(0, saveCount.get(), "WON battles must not overwrite the last mid-fight checkpoint");
        assertFalse(run.isCheckpointSaved());
    }

    @Test
    void checkpointStillSavesLiveBattles() throws Exception {
        SiegeRun run = baseRun();
        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        battle.setPhase(BattlePhase.PLAYER_INPUT);
        battle.getCombatants().add(run.getParty().getFirst());
        battle.getCombatants().add(run.getKnightUnit());
        run.setBattle(battle);
        registerRun(run);

        invokeCheckpoint(run);

        assertEquals(1, saveCount.get());
        assertTrue(run.isCheckpointSaved());
        assertTrue(lastSnapshot.get().containsKey("battle"));
    }

    @Test
    void wonCheckpointDoesNotOverwritePriorMidFightSnapshot() throws Exception {
        SiegeRun run = baseRun();
        SiegeBattle live = new SiegeBattle(NodeType.BATTLE);
        live.setPhase(BattlePhase.PLAYER_INPUT);
        live.getCombatants().add(run.getParty().getFirst());
        live.getCombatants().add(run.getKnightUnit());
        run.setBattle(live);
        registerRun(run);

        invokeCheckpoint(run);
        assertEquals(1, saveCount.get());
        assertTrue(lastSnapshot.get().containsKey("battle"));

        // Victory screen: previously this called checkpoint and replaced the
        // mid-fight blob with WON, so a recycle + Continue re-applied spoils.
        live.setPhase(BattlePhase.WON);
        invokeCheckpoint(run);

        assertEquals(1, saveCount.get(), "finished battles must leave the prior mid-fight snapshot alone");
        @SuppressWarnings("unchecked")
        Map<String, Object> battleBlob = (Map<String, Object>) lastSnapshot.get().get("battle");
        assertEquals("PLAYER_INPUT", String.valueOf(battleBlob.get("phase")),
                "resume must still land mid-fight, not on a re-Continueable WON screen");
    }

    private SiegeRun baseRun() {
        SiegeRun run = new SiegeRun("continue-cp");
        run.setKnightId("squire-bob");
        run.setKnightName("Squire Bob");
        Combatant knight = new Combatant("knight", "Squire Bob", Element.FIRE, Side.PLAYER, 40, 5, null, true);
        run.setKnightUnit(knight);
        Combatant ally = new Combatant("ally-0", "Sprout", Element.EARTH, Side.PLAYER, 60, 6, null);
        ally.setSourceCardId("sproutling");
        ally.setPosition(0);
        run.getParty().add(ally);
        run.setGold(10);
        return run;
    }

    @SuppressWarnings("unchecked")
    private void registerRun(SiegeRun run) throws Exception {
        Map<String, Object> runs = (Map<String, Object>) getField(service, "runs");
        Class<?> sessionClass = Class.forName("com.sieglings.adventure.SiegeService$Session");
        Constructor<?> ctor = sessionClass.getDeclaredConstructor(SiegeRun.class);
        ctor.setAccessible(true);
        runs.put(run.getToken(), ctor.newInstance(run));
    }

    private void invokeCheckpoint(SiegeRun run) throws Exception {
        Method m = SiegeService.class.getDeclaredMethod("checkpoint", SiegeRun.class);
        m.setAccessible(true);
        m.invoke(service, run);
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }

    private static Object getField(Object target, String name) throws Exception {
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        return f.get(target);
    }
}
