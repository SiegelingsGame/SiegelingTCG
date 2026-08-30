package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Beating the Siegelord (or extracting Endless) banks the squad as a veteran
 * team. A Firestore blip on that write must not seal {@code veteranExtracted}
 * and must not SET a one-team document over the rest of the bank.
 */
class SiegeVeteranExtractTest {

    private static final String USER = "u-vet-1";

    private SiegeService service;
    private ControllableVeteranStore store;

    @BeforeEach
    void setUp() throws Exception {
        service = new SiegeService();
        store = new ControllableVeteranStore();
        store.saveTeam(USER, team("old-alpha"));
        store.saveTeam(USER, team("old-beta"));
        store.saveTeam(USER, team("old-gamma"));
        store.persistCount = 0;

        setField(service, "content", new SiegeContentService());
        setField(service, "veterans", store);

        AccountUser user = new AccountUser();
        user.setId(USER);
        user.setDisplayName("tester");
        setField(service, "accountService", new AccountService() {
            @Override
            public AccountUser findUser(String authorizationHeader) {
                return "Bearer ok".equals(authorizationHeader) ? user : null;
            }
        });
    }

    @Test
    void failedBankLeavesExtractRetryableAndDoesNotWipeTheBank() throws Exception {
        SiegeRun run = wonRun("extract-fail");
        store.failNextLoad = true;

        invokeExtract(run, "Bearer ok");

        assertFalse(run.isVeteranExtracted(),
                "A failed bank must not seal veteranExtracted or the squad is lost forever.");
        assertNotNull(run.getVeteranTeam(), "The snapshot must stay on the run for retry.");
        store.failNextLoad = false;
        assertEquals(3, store.listTeams(USER).size(),
                "The existing bank must survive a failed extract read.");
        assertEquals(List.of("old-gamma", "old-beta", "old-alpha"),
                store.listTeams(USER).stream().map(t -> t.get("teamId")).toList());

        invokeExtract(run, "Bearer ok");

        assertTrue(run.isVeteranExtracted());
        List<Map<String, Object>> teams = store.listTeams(USER);
        assertEquals(4, teams.size(), "Retry must prepend the new team, not replace the bank.");
        assertEquals(run.getVeteranTeam().get("teamId"), teams.get(0).get("teamId"));
        assertEquals("old-gamma", teams.get(1).get("teamId"));
    }

    @Test
    void stateRetryBanksAFailedExtract() throws Exception {
        SiegeRun run = wonRun("extract-state-retry");
        store.failNextLoad = true;
        invokeExtract(run, "Bearer ok");
        assertFalse(run.isVeteranExtracted());

        store.failNextLoad = false;
        Method maybeRetry = SiegeService.class.getDeclaredMethod(
                "maybeRetryExtract", SiegeRun.class, String.class);
        maybeRetry.setAccessible(true);
        maybeRetry.invoke(service, run, "Bearer ok");

        assertTrue(run.isVeteranExtracted());
        assertEquals(4, store.listTeams(USER).size());
    }

    @Test
    void guestsStillSealThePreviewWithoutAnAccount() throws Exception {
        SiegeRun run = wonRun("extract-guest");
        invokeExtract(run, null);

        assertTrue(run.isVeteranExtracted());
        assertEquals(3, store.listTeams(USER).size(),
                "A guest extract must not write the signed-in player's bank.");
        assertEquals(0, store.persistCount, "Guest extract must not touch Firestore.");
    }

    private SiegeRun wonRun(String token) {
        SiegeRun run = new SiegeRun(token);
        run.setKnightId("squire-bob");
        run.setKnightName("Squire Bob");
        Combatant knight = new Combatant("knight", "Squire Bob", Element.FIRE, Side.PLAYER, 40, 5, null, true);
        run.setKnightUnit(knight);
        Combatant ally = new Combatant("ally-0", "Sprout", Element.EARTH, Side.PLAYER, 60, 6, null);
        ally.setSourceCardId("sproutling");
        ally.setPosition(0);
        run.getParty().add(ally);
        run.setStatus(RunStatus.WON);
        run.setNodesCleared(12);
        run.setBossKills(3);
        run.setScore(400L);
        return run;
    }

    private void invokeExtract(SiegeRun run, String authorizationHeader) throws Exception {
        Method method = SiegeService.class.getDeclaredMethod(
                "extractTeam", SiegeRun.class, String.class);
        method.setAccessible(true);
        method.invoke(service, run, authorizationHeader);
    }

    private static Map<String, Object> team(String teamId) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("teamId", teamId);
        t.put("members", new ArrayList<>());
        return t;
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static final class ControllableVeteranStore extends SiegeVeteranStore {
        private final Map<String, List<Map<String, Object>>> data = new HashMap<>();
        volatile boolean failNextLoad;
        int persistCount;

        @Override
        protected List<Map<String, Object>> loadRaw(String userId) {
            if (failNextLoad) return null;
            List<Map<String, Object>> teams = data.get(userId);
            return teams == null ? new ArrayList<>() : new ArrayList<>(teams);
        }

        @Override
        protected boolean persistRaw(String userId, List<Map<String, Object>> teams) {
            persistCount++;
            data.put(userId, new ArrayList<>(teams));
            return true;
        }
    }
}
