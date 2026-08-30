package com.sieglings.adventure;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Firestore-free coverage for Battlegrounds Phase 4: tier scaling + rewards,
 * the Warmarks award curve, the boon catalog + offer, fatigue lockout on loss,
 * the Warmarks shop guards, and the BG-only run state. All of these are pure /
 * static or exercised through an in-memory {@link SiegeVeteranStore} subclass, so
 * no Spring beans or Firestore are needed.
 */
class SiegeBattlegroundsPhase4Test {

    // ---- Tiers I–V raise difficulty and rewards --------------------------

    @Test
    void tierScalarAndRewardsRiseWithTier() {
        // Difficulty scalar strictly increases across the five tiers.
        for (int t = 2; t <= SiegeTuning.BG_MAX_TIER; t++) {
            assertTrue(SiegeTuning.bgTierScalar(t) > SiegeTuning.bgTierScalar(t - 1),
                    "tier " + t + " should be tougher than " + (t - 1));
            assertTrue(SiegeTuning.bgTierRewardMult(t) > SiegeTuning.bgTierRewardMult(t - 1),
                    "tier " + t + " should pay more than " + (t - 1));
        }
        assertEquals(1.0, SiegeTuning.bgTierScalar(1), 1e-9);   // tier I is the base
        assertEquals(1.0, SiegeTuning.bgTierRewardMult(1), 1e-9);
        // The tier scalar feeds the Phase-3 enemy scaling: tier V enemies are tougher.
        assertTrue(SiegeTuning.bgEnemyHpScalar(5, SiegeTuning.bgTierScalar(5))
                > SiegeTuning.bgEnemyHpScalar(5, SiegeTuning.bgTierScalar(1)));
        // clampTier bounds the range.
        assertEquals(1, SiegeTuning.clampTier(0));
        assertEquals(SiegeTuning.BG_MAX_TIER, SiegeTuning.clampTier(99));
    }

    @Test
    void secondBoonGatedToTierThreeAndUp() {
        assertFalse(SiegeTuning.enablesSecondBoon(1));
        assertFalse(SiegeTuning.enablesSecondBoon(2));
        assertTrue(SiegeTuning.enablesSecondBoon(3));
        assertTrue(SiegeTuning.enablesSecondBoon(SiegeTuning.BG_MAX_TIER));
    }

    // ---- Warmarks award curve --------------------------------------------

    @Test
    void warmarkAwardScalesWithTier() {
        int base = 100;
        assertEquals(100, SiegeTuning.bgWarmarks(base, 1));               // tier I is ×1.0
        assertTrue(SiegeTuning.bgWarmarks(base, 5) > SiegeTuning.bgWarmarks(base, 1));
        assertEquals(Math.round(base * SiegeTuning.bgTierRewardMult(3)), SiegeTuning.bgWarmarks(base, 3));
        assertEquals(0, SiegeTuning.bgWarmarks(-50, 3));                  // negatives floor at 0
    }

    // ---- Boon catalog + offer --------------------------------------------

    @Test
    void boonOfferReturnsThreeAndExcludesChosen() {
        java.util.Random rng = new java.util.Random(42);
        List<SiegeBoon> first = SiegeBoon.offer(new ArrayList<>(), rng);
        assertEquals(SiegeBoon.OFFER_SIZE, first.size());
        assertEquals(3, first.stream().map(SiegeBoon::id).distinct().count()); // distinct

        // Excluding two already-taken boons leaves only the third on offer.
        List<String> taken = List.of(SiegeBoon.FIRST_ROUND_AP.id(), SiegeBoon.BOSS_AP_DISCOUNT.id());
        List<SiegeBoon> second = SiegeBoon.offer(taken, rng);
        assertEquals(1, second.size());
        assertEquals(SiegeBoon.BATTLE_REVIVE, second.get(0));

        assertEquals(SiegeBoon.BATTLE_REVIVE, SiegeBoon.byId("battle-revive"));
        assertEquals(null, SiegeBoon.byId("nope"));
    }

    @Test
    void runStoresTierAndChosenBoon() {
        SiegeRun run = new SiegeRun("t-bg");
        run.setMode(RunMode.BATTLEGROUNDS);
        assertTrue(run.isBattlegrounds());
        run.setBgTier(9);                                 // clamps to max
        assertEquals(SiegeTuning.BG_MAX_TIER, run.getBgTier());
        run.getBoons().add(SiegeBoon.FIRST_ROUND_AP.id());
        assertTrue(run.hasBoon(SiegeBoon.FIRST_ROUND_AP));
        assertFalse(run.hasBoon(SiegeBoon.BATTLE_REVIVE));
    }

    // ---- Fatigue lockout on a Battlegrounds loss -------------------------

    @Test
    void lostRunLocksTeamsAndExposesLockOnFlattenedVeterans() {
        InMemoryVeteranStore store = new InMemoryVeteranStore();
        store.saveTeam(USER, teamSnapshot("A"));
        store.saveTeam(USER, teamSnapshot("B"));
        long now = System.currentTimeMillis();
        long until = now + SiegeTuning.BG_FATIGUE_LOCKOUT_MS;

        store.lockTeams(USER, List.of("A"), until);
        List<Map<String, Object>> teams = store.listTeams(USER);
        Map<String, Object> a = teams.stream().filter(t -> "A".equals(t.get("teamId"))).findFirst().orElseThrow();
        Map<String, Object> b = teams.stream().filter(t -> "B".equals(t.get("teamId"))).findFirst().orElseThrow();

        assertTrue(SiegeVeteranStore.isLocked(a, now), "team A is fatigued");
        assertFalse(SiegeVeteranStore.isLocked(b, now), "team B was not in the losing squad");
        assertFalse(SiegeVeteranStore.isLocked(a, until + 1), "lock expires after the timer");

        // The flattened veteran list carries lockedUntil so the lobby can gray members out.
        List<Map<String, Object>> flat = SiegeVeteranStore.flattenVeterans(teams);
        Map<String, Object> aMember = flat.stream()
                .filter(v -> "A".equals(v.get("teamId"))).findFirst().orElseThrow();
        assertEquals(until, ((Number) aMember.get("lockedUntil")).longValue());
    }

    // ---- Warmarks shop guards (no Spring beans wired) --------------------

    @Test
    void shopCatalogListsItemsAndGuardsSpending() {
        SiegeService service = new SiegeService();
        // With no progression beans a bare service returns the guest catalog view.
        Map<String, Object> shop = service.battlegroundsShop(null);
        assertEquals(0, shop.get("warmarks"));
        assertFalse((Boolean) shop.get("loggedIn"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) shop.get("items");
        assertEquals(SiegeService.BG_SHOP.size(), items.size());
        assertTrue(items.stream().allMatch(i -> i.get("cost") instanceof Integer && (Integer) i.get("cost") > 0));
        assertTrue(items.stream().noneMatch(i -> (Boolean) i.get("owned")));

        // A guest cannot spend Warmarks; an unknown item is rejected.
        assertThrows(IllegalArgumentException.class, () -> service.buyBattlegroundsItem(null, "frame_warlord"));
    }

    // ---- helpers ---------------------------------------------------------

    private static final String USER = "player@example.com";

    private static final class InMemoryVeteranStore extends SiegeVeteranStore {
        private final Map<String, List<Map<String, Object>>> data = new HashMap<>();

        @Override
        protected List<Map<String, Object>> loadRaw(String userId) {
            List<Map<String, Object>> teams = data.get(userId);
            return teams == null ? new ArrayList<>() : new ArrayList<>(teams);
        }

        @Override
        protected boolean persistRaw(String userId, List<Map<String, Object>> teams) {
            data.put(userId, new ArrayList<>(teams));
            return true;
        }
    }

    private static Map<String, Object> teamSnapshot(String teamId) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("teamId", teamId);
        t.put("extractedAt", System.currentTimeMillis());
        List<Map<String, Object>> members = new ArrayList<>();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("sourceCardId", "s-" + teamId);
        m.put("name", "Vet " + teamId);
        m.put("element", "FIRE");
        m.put("level", 3);
        m.put("itemId", null);
        members.add(m);
        t.put("members", members);
        t.put("deck", new ArrayList<>());
        return t;
    }
}
