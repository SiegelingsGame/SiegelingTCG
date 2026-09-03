package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.service.PlayerProgressionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Siegelings met on an expedition become permanent starter picks when the run
 * ends. Finding any stage earns the whole line, because warband select only
 * ever offers stage-1 cards — so a stage-2/3 find has to resolve down to its
 * base or it would unlock nothing pickable at all.
 */
@SpringBootTest
class SiegeSieglingUnlockTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    @Autowired
    private PlayerProgressionService progressionService;

    @Autowired
    private com.sieglings.service.CardDefinitionService cardDefs;

    /** Any catalog Siegeling that is itself an evolution of another card. */
    private SieglingCard anyEvolution() {
        for (com.sieglings.model.Card card : cardDefs.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard s && s.getEvolvesFromId() != null && !s.getEvolvesFromId().isBlank()) {
                return s;
            }
        }
        return null;
    }

    @Test
    void baseFormIdWalksAnEvolutionDownToItsStageOneRoot() {
        SieglingCard evo = anyEvolution();
        assertNotNull(evo, "catalog has no evolution cards to test with");

        String base = content.baseFormId(evo.getId());

        assertNotEqualsId(evo.getId(), base);
        assertEquals(1, content.stageOf(content.findAnySiegling(base).orElseThrow()),
                "an evolution must resolve to a stage-1 card");
        // A root resolves to itself — the walk is idempotent.
        assertEquals(base, content.baseFormId(base));
    }

    @Test
    void bankingADiscoveryUnlocksThatSieglingAsAStarter() throws Exception {
        SieglingCard target = lockedSiegling();
        assertNotNull(target, "no non-starter Siegeling in the catalog to unlock");
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        assertFalse(progressionService.isSiegeSieglingUnlocked(progression, target.getId()));

        SiegeRun run = new SiegeRun("test-token");
        run.getDiscoveredSieglingIds().add(target.getId());
        List<String> announced = bank(progression, run);

        assertTrue(progressionService.isSiegeSieglingUnlocked(progression, target.getId()),
                "a found Siegeling should be unlocked after the run banks it");
        assertTrue(announced.contains(target.getName()),
                "a newly pickable Siegeling should be announced on the result screen");
    }

    @Test
    void findingAnEvolutionUnlocksItsWholeLineIncludingTheStageOneBase() throws Exception {
        SieglingCard evo = anyEvolution();
        assertNotNull(evo);
        String baseId = content.baseFormId(evo.getId());
        PlayerProgressionEntity progression = new PlayerProgressionEntity();

        SiegeRun run = new SiegeRun("test-token");
        run.getDiscoveredSieglingIds().add(evo.getId());
        bank(progression, run);

        assertTrue(progressionService.isSiegeSieglingUnlocked(progression, baseId),
                "finding an evolved form must unlock the base form you can actually pick");
        assertTrue(progressionService.isSiegeSieglingUnlocked(progression, evo.getId()),
                "the found form itself is banked too");
    }

    @Test
    void rebankingAnAlreadyUnlockedSieglingAnnouncesNothingAndDoesNotDuplicate() throws Exception {
        SieglingCard target = lockedSiegling();
        assertNotNull(target);
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        SiegeRun run = new SiegeRun("test-token");
        run.getDiscoveredSieglingIds().add(target.getId());

        bank(progression, run);
        int afterFirst = progression.getSiegeUnlockedSieglings().size();
        List<String> secondRun = bank(progression, run);

        assertTrue(secondRun.isEmpty(), "a re-found Siegeling is not a new unlock");
        assertEquals(afterFirst, progression.getSiegeUnlockedSieglings().size(),
                "re-banking must not duplicate stored ids");
    }

    @Test
    void discoveriesSurviveARunSnapshotRoundTrip() throws Exception {
        SieglingCard target = content.selectableSieglings().getFirst();
        Set<String> restored = snapshotRoundTripDiscoveries(target.getId());
        assertTrue(restored.contains(target.getId()),
                "a resumed run must remember what it already found — unlocks only bank at the end");
    }

    @Test
    void startingARunRecordsItsWarbandAsDiscovered() throws Exception {
        com.sieglings.model.TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        SieglingCard siegling = content.selectableSieglings().getFirst();
        List<String> warband = SiegeStarterTestSupport.starterIds(content, knight, siegling);

        Map<String, Object> started = siegeService.newRun(null, knight.getId(), warband, "STANDARD");
        SiegeRun run = activeRun(String.valueOf(started.get("token")));

        assertTrue(run.getDiscoveredSieglingIds().containsAll(warband),
                "every Siegeling that joins the warband must be recorded as met");
    }

    /**
     * The gate warband select reads. Account lookup and progression are stubbed
     * because the unlock is per-account and this environment has no Firestore.
     */
    @Test
    void rosterReportsAnAccountUnlockedSieglingAsAStarter() throws Exception {
        SieglingCard target = lockedSiegling();
        assertNotNull(target);
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setSiegeUnlockedSieglings(List.of(target.getId()));

        com.sieglings.service.AccountService accounts = org.mockito.Mockito.mock(com.sieglings.service.AccountService.class);
        com.sieglings.persistence.entity.AccountUser user = new com.sieglings.persistence.entity.AccountUser();
        user.setId("unlock-test-user");
        org.mockito.Mockito.when(accounts.findUser(org.mockito.ArgumentMatchers.anyString())).thenReturn(user);
        PlayerProgressionService progressions = org.mockito.Mockito.mock(PlayerProgressionService.class);
        org.mockito.Mockito.when(progressions.getOrCreate(user)).thenReturn(progression);
        org.mockito.Mockito.when(progressions.isSiegeSieglingUnlocked(
                org.mockito.ArgumentMatchers.eq(progression), org.mockito.ArgumentMatchers.anyString()))
                .thenAnswer(inv -> target.getId().equalsIgnoreCase(inv.getArgument(1)));

        Object realAccounts = swapField("accountService", accounts);
        Object realProgressions = swapField("progressionService", progressions);
        try {
            Map<String, Object> roster = siegeService.roster("Bearer test");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> sieglings = (List<Map<String, Object>>) roster.get("siegelings");
            Map<String, Object> row = sieglings.stream()
                    .filter(m -> target.getId().equals(m.get("id")))
                    .findFirst().orElseThrow();
            assertEquals(Boolean.TRUE, row.get("expeditionStarter"),
                    "a Siegeling unlocked on a past run must be pickable at warband select");
        } finally {
            swapField("accountService", realAccounts);
            swapField("progressionService", realProgressions);
        }
    }

    /**
     * The #711 unlock only updated {@code roster()}. {@code newRun} still keyed
     * off the catalog flag, so a found Siegeling that the picker offered was
     * rejected at Start. Force the lead card off the catalog-starter list so
     * this holds even when the local catalog has not flagged any starters.
     */
    @Test
    void startingARunRejectsACatalogLockedSieglingUntilItIsUnlocked() throws Exception {
        SieglingCard target = lockedSiegling();
        assertNotNull(target);
        com.sieglings.model.TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        List<String> warband = SiegeStarterTestSupport.starterIds(content, knight, target);

        SiegeContentService spyContent = org.mockito.Mockito.spy(content);
        org.mockito.Mockito.doAnswer(inv -> {
            SieglingCard s = inv.getArgument(0);
            if (s != null && target.getId().equals(s.getId())) {
                return false;
            }
            return inv.callRealMethod();
        }).when(spyContent).isExpeditionStarter(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyBoolean());

        Object realContent = swapField("content", spyContent);
        try {
            IllegalArgumentException locked = assertThrows(IllegalArgumentException.class,
                    () -> siegeService.newRun(null, knight.getId(), warband, "STANDARD"),
                    "a catalog-locked Siegeling must not start a run for a guest");
            assertTrue(locked.getMessage().contains("locked"), locked.getMessage());

            PlayerProgressionEntity progression = new PlayerProgressionEntity();
            progression.setSiegeUnlockedSieglings(List.of(target.getId()));
            com.sieglings.service.AccountService accounts = org.mockito.Mockito.mock(com.sieglings.service.AccountService.class);
            com.sieglings.persistence.entity.AccountUser user = new com.sieglings.persistence.entity.AccountUser();
            user.setId("unlock-start-user");
            org.mockito.Mockito.when(accounts.findUser(org.mockito.ArgumentMatchers.anyString())).thenReturn(user);
            PlayerProgressionService progressions = org.mockito.Mockito.mock(PlayerProgressionService.class);
            org.mockito.Mockito.when(progressions.getOrCreate(user)).thenReturn(progression);
            org.mockito.Mockito.when(progressions.isSiegeSieglingUnlocked(
                    org.mockito.ArgumentMatchers.eq(progression), org.mockito.ArgumentMatchers.anyString()))
                    .thenAnswer(inv -> target.getId().equalsIgnoreCase(inv.getArgument(1)));

            Object realAccounts = swapField("accountService", accounts);
            Object realProgressions = swapField("progressionService", progressions);
            try {
                Map<String, Object> started = assertDoesNotThrow(
                        () -> siegeService.newRun("Bearer test", knight.getId(), warband, "STANDARD"),
                        "an account unlock must be enough to start with that Siegeling");
                assertNotNull(started.get("token"), "the run must actually start");
            } finally {
                swapField("accountService", realAccounts);
                swapField("progressionService", realProgressions);
            }
        } finally {
            swapField("content", realContent);
        }
    }

    // ---- helpers ---------------------------------------------------------

    private Object swapField(String name, Object value) throws Exception {
        java.lang.reflect.Field f = SiegeService.class.getDeclaredField(name);
        f.setAccessible(true);
        Object previous = f.get(siegeService);
        f.set(siegeService, value);
        return previous;
    }

    @SuppressWarnings("unchecked")
    private SiegeRun activeRun(String token) throws Exception {
        java.lang.reflect.Field sessions = SiegeService.class.getDeclaredField("runs");
        sessions.setAccessible(true);
        Object session = ((Map<String, Object>) sessions.get(siegeService)).get(token);
        assertNotNull(session, "run session not found for token " + token);
        java.lang.reflect.Field runField = session.getClass().getDeclaredField("run");
        runField.setAccessible(true);
        return (SiegeRun) runField.get(session);
    }

    /** A Siegeling that is NOT a catalog starter, i.e. one an unlock can change. */
    private SieglingCard lockedSiegling() {
        boolean configured = content.expeditionStartersConfigured();
        for (SieglingCard s : content.selectableSieglings()) {
            if (!content.isExpeditionStarter(s, configured)) {
                return s;
            }
        }
        // Every Siegeling is a starter in this catalog; any card still exercises banking.
        return content.selectableSieglings().isEmpty() ? null : content.selectableSieglings().getFirst();
    }

    @SuppressWarnings("unchecked")
    private List<String> bank(PlayerProgressionEntity progression, SiegeRun run) throws Exception {
        Method m = SiegeService.class.getDeclaredMethod(
                "bankSieglingDiscoveries", PlayerProgressionEntity.class, SiegeRun.class);
        m.setAccessible(true);
        return (List<String>) m.invoke(siegeService, progression, run);
    }

    @SuppressWarnings("unchecked")
    private Set<String> snapshotRoundTripDiscoveries(String discoveredId) throws Exception {
        SiegeRun run = new SiegeRun("snapshot-token");
        run.getDiscoveredSieglingIds().add(discoveredId);
        Method snapshot = SiegeService.class.getDeclaredMethod("snapshotRun", SiegeRun.class);
        snapshot.setAccessible(true);
        java.util.Map<String, Object> snap = (java.util.Map<String, Object>) snapshot.invoke(siegeService, run);

        assertTrue(snap.get("discoveredSieglings") instanceof List,
                "the run snapshot must carry discoveries");
        SiegeRun rebuilt = new SiegeRun("snapshot-token");
        for (Object id : (List<Object>) snap.get("discoveredSieglings")) {
            rebuilt.getDiscoveredSieglingIds().add(String.valueOf(id));
        }
        return rebuilt.getDiscoveredSieglingIds();
    }

    private static void assertNotEqualsId(String evolutionId, String baseId) {
        assertFalse(evolutionId.equals(baseId), "an evolution is not its own base form");
    }
}
