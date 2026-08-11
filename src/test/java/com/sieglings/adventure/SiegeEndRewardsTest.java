package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.PlayerProgressionStore;
import com.sieglings.service.AccountService;
import com.sieglings.service.PlayerProgressionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Authenticated end-of-run spoils must not seal as granted when the progression
 * write fails — otherwise continue/state can never retry and the player
 * permanently loses Siegecoins/Remnants/card prizes.
 */
class SiegeEndRewardsTest {

    private SiegeService service;
    private final AtomicReference<PlayerProgressionEntity> persisted = new AtomicReference<>();
    private final AtomicInteger saveCalls = new AtomicInteger();
    private volatile boolean failNextSave;

    @BeforeEach
    void setUp() throws Exception {
        service = new SiegeService();
        setField(service, "content", new SiegeContentService());

        PlayerProgressionEntity seed = new PlayerProgressionEntity();
        seed.setUserId("u-1");
        seed.setGold(100);
        seed.setRemnants(20);
        persisted.set(copyProgression(seed));

        AccountUser user = new AccountUser();
        user.setId("u-1");
        user.setDisplayName("tester");

        setField(service, "accountService", new AccountService() {
            @Override
            public AccountUser findUser(String authorizationHeader) {
                return "Bearer ok".equals(authorizationHeader) ? user : null;
            }
        });

        setField(service, "progressionService", new PlayerProgressionService() {
            @Override
            public PlayerProgressionEntity getOrCreate(AccountUser accountUser) {
                // Mirror Firestore: a failed save never mutated the durable doc.
                return copyProgression(persisted.get());
            }
        });

        setField(service, "progressionStore", new PlayerProgressionStore() {
            @Override
            public PlayerProgressionEntity save(PlayerProgressionEntity entity) {
                saveCalls.incrementAndGet();
                if (failNextSave) {
                    failNextSave = false;
                    throw new RuntimeException("firestore blip");
                }
                persisted.set(copyProgression(entity));
                return entity;
            }
        });
    }

    @Test
    void failedProgressionSaveLeavesEndRewardsRetryable() throws Exception {
        SiegeRun run = finishedRun("end-rewards-fail");
        failNextSave = true;

        invokeGrant(run, "Bearer ok");

        assertFalse(run.isEndRewardsGranted(),
                "A failed bank must not seal endRewardsGranted or the payout is lost forever.");
        assertFalse(Boolean.TRUE.equals(run.getEndRewards().get("claimed")));
        assertFalse(Boolean.TRUE.equals(run.getEndRewards().get("guestPreview")),
                "Signed-in failed banks are not guest previews.");
        assertEquals(100, persisted.get().getGold(), "Gold must not stick after a failed save.");
        assertEquals(1, saveCalls.get());

        Object firstGold = run.getEndRewards().get("gold");

        invokeGrant(run, "Bearer ok");

        assertTrue(run.isEndRewardsGranted());
        assertTrue(Boolean.TRUE.equals(run.getEndRewards().get("claimed")));
        assertEquals(firstGold, run.getEndRewards().get("gold"),
                "Retry must reuse the spoils the player already saw.");
        assertTrue(persisted.get().getGold() > 100);
        assertEquals(2, saveCalls.get());
    }

    @Test
    void finishedRunRetriesUnclaimedEndRewardsViaMaybeRetry() throws Exception {
        SiegeRun run = finishedRun("end-rewards-state");
        failNextSave = true;
        invokeGrant(run, "Bearer ok");
        assertFalse(run.isEndRewardsGranted());

        Method maybeRetry = SiegeService.class.getDeclaredMethod(
                "maybeRetryEndRewards", SiegeRun.class, String.class);
        maybeRetry.setAccessible(true);
        maybeRetry.invoke(service, run, "Bearer ok");

        assertTrue(run.isEndRewardsGranted());
        assertTrue(Boolean.TRUE.equals(run.getEndRewards().get("claimed")));
        assertTrue(persisted.get().getGold() > 100);
    }

    @Test
    void guestsStillSealPreviewWithoutAnAccount() throws Exception {
        SiegeRun run = finishedRun("end-rewards-guest");
        invokeGrant(run, null);

        assertTrue(run.isEndRewardsGranted());
        assertFalse(Boolean.TRUE.equals(run.getEndRewards().get("claimed")));
        assertTrue(Boolean.TRUE.equals(run.getEndRewards().get("guestPreview")));
        assertEquals(0, saveCalls.get());
    }

    private SiegeRun finishedRun(String token) {
        SiegeRun run = new SiegeRun(token);
        run.setKnightId("squire-bob");
        run.setKnightName("Squire Bob");
        Combatant knight = new Combatant("knight", "Squire Bob", Element.FIRE, Side.PLAYER, 40, 5, null, true);
        run.setKnightUnit(knight);
        Combatant ally = new Combatant("ally-0", "Sprout", Element.EARTH, Side.PLAYER, 60, 6, null);
        ally.setSourceCardId("sproutling");
        ally.setPosition(0);
        run.getParty().add(ally);
        run.setStatus(RunStatus.LOST);
        run.setNodesCleared(3);
        run.setBossKills(0);
        run.setScore(40L);
        return run;
    }

    private void invokeGrant(SiegeRun run, String authorizationHeader) throws Exception {
        Method method = SiegeService.class.getDeclaredMethod(
                "grantEndRewards", SiegeRun.class, String.class, double.class);
        method.setAccessible(true);
        method.invoke(service, run, authorizationHeader, 1.0);
    }

    private static PlayerProgressionEntity copyProgression(PlayerProgressionEntity source) {
        PlayerProgressionEntity copy = new PlayerProgressionEntity();
        copy.setUserId(source.getUserId());
        copy.setGold(source.getGold());
        copy.setRemnants(source.getRemnants());
        copy.setSiegeRuns(source.getSiegeRuns());
        copy.setSiegeWins(source.getSiegeWins());
        copy.setSiegeBossKills(source.getSiegeBossKills());
        copy.setSiegeNodesCleared(source.getSiegeNodesCleared());
        copy.setSiegeBestScore(source.getSiegeBestScore());
        copy.setOwnedCards(source.getOwnedCards());
        return copy;
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
