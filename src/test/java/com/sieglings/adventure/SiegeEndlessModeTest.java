package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;

/**
 * Endless as a mode of its own: a team of fresh and banked-veteran Siegelings, its
 * own save slot, enemies that compound every floor, and a run the player can end
 * between fights to bank the score — without that choice paying out like a win.
 */
class SiegeEndlessModeTest {

    @Test
    void endlessHasItsOwnSaveSlotAndRemembersTheLegacyOne() throws Exception {
        assertEquals(RunSlot.ENDLESS, RunSlot.of(RunMode.ENDLESS));
        assertEquals(RunSlot.EXPEDITION, RunSlot.legacyOf(RunMode.ENDLESS),
                "Endless runs saved before the split live in the expedition pointer");
        assertNull(RunSlot.legacyOf(RunMode.STANDARD));
        assertNull(RunSlot.legacyOf(RunMode.BATTLEGROUNDS));

        Method docId = SiegeCheckpointStore.class.getDeclaredMethod(
                "accountDocumentId", String.class, RunSlot.class);
        docId.setAccessible(true);
        String expedition = (String) docId.invoke(null, "player/1", RunSlot.EXPEDITION);
        String endless = (String) docId.invoke(null, "player/1", RunSlot.ENDLESS);
        String battlegrounds = (String) docId.invoke(null, "player/1", RunSlot.BATTLEGROUNDS);
        assertNotEquals(expedition, endless);
        assertNotEquals(battlegrounds, endless);
        assertTrue(endless.startsWith(expedition + "-"));
    }

    @Test
    void enemiesCompoundEveryFloorWithoutACeilingInReach() {
        assertEquals(1.0, SiegeTuning.endlessEnemyHpScalar(1), 1e-9);
        assertEquals(1.0, SiegeTuning.endlessEnemyDamageScalar(1), 1e-9);
        assertEquals(1.0, SiegeTuning.endlessEnemyHpScalar(0), 1e-9, "a floor before the map is floor 1");
        double prevHp = 1.0;
        double prevDmg = 1.0;
        for (int floor = 2; floor <= 200; floor++) {
            double hp = SiegeTuning.endlessEnemyHpScalar(floor);
            double dmg = SiegeTuning.endlessEnemyDamageScalar(floor);
            assertTrue(hp > prevHp, "HP must grow on floor " + floor);
            assertTrue(dmg > prevDmg, "damage must grow on floor " + floor);
            prevHp = hp;
            prevDmg = dmg;
        }
        assertEquals(Math.pow(1.02, 23), SiegeTuning.endlessEnemyHpScalar(24), 1e-9);
        assertEquals(SiegeTuning.ENDLESS_SCALAR_CAP, SiegeTuning.endlessEnemyHpScalar(100_000), 1e-9,
                "the guard keeps foe HP inside an int");
    }

    @Test
    void anEndlessTeamMixesFreshAndLeveledVeterans() throws Exception {
        Fixture f = new Fixture();
        Map<String, Object> started = f.service.newRun("Bearer t", "warden", List.of("rooty"), "ENDLESS",
                List.of(Map.of("teamId", "T", "sourceCardId", "tide")));

        assertEquals("ENDLESS", started.get("mode"));
        assertEquals("ENDLESS", started.get("slot"));
        assertEquals(RunSlot.ENDLESS, f.checkpoints.savedSlot,
                "the Endless save must not overwrite the expedition slot");

        SiegeRun run = f.run(started);
        assertEquals(2, run.getParty().size());
        Combatant fresh = run.getParty().get(0);
        Combatant veteran = run.getParty().get(1);
        assertEquals("rooty", fresh.getSourceCardId());
        assertEquals(1, fresh.getLevel(), "a roster pick starts fresh");
        assertEquals("tide", veteran.getSourceCardId());
        assertTrue(veteran.getLevel() > 1, "a banked veteran marches at the level it was extracted at");
        assertEquals("sigil-x", veteran.getItemId());
        assertTrue(run.getDeckTemplates().stream()
                        .anyMatch(c -> c.getOwnerId().equals(veteran.getId()) && "Honed Splash".equals(c.getSpec().name())),
                "the veteran keeps its upgraded card, rebound to its new unit");
    }

    @Test
    void anEndlessTeamCanBeAllVeterans() throws Exception {
        Fixture f = new Fixture();
        Map<String, Object> started = f.service.newRun("Bearer t", "warden", null, "ENDLESS",
                List.of(Map.of("teamId", "T", "sourceCardId", "tide")));
        assertEquals(1, f.run(started).getParty().size());
    }

    @Test
    void veteranPicksAreCheckedAgainstTheBank() throws Exception {
        Fixture f = new Fixture();
        assertThrows(IllegalArgumentException.class, () -> f.service.newRun("Bearer t", "warden", List.of(),
                "ENDLESS", List.of(Map.of("teamId", "T", "sourceCardId", "nobody"))));
        assertThrows(IllegalArgumentException.class, () -> f.service.newRun("Bearer t", "warden", List.of(),
                "ENDLESS", List.of(Map.of("teamId", "other", "sourceCardId", "tide"))));
        assertThrows(IllegalArgumentException.class, () -> f.service.newRun("Bearer t", "warden", List.of("tide"),
                "ENDLESS", List.of(Map.of("teamId", "T", "sourceCardId", "tide"))),
                "the same Siegeling cannot march twice, fresh and veteran");
        assertThrows(IllegalArgumentException.class, () -> f.service.newRun("Bearer t", "warden", List.of(),
                "ENDLESS", List.of()), "an empty team");
    }

    @Test
    void aFatiguedVeteranRestsInEndlessToo() throws Exception {
        Fixture f = new Fixture();
        f.team.put("lockedUntil", System.currentTimeMillis() + 60_000);
        assertThrows(IllegalArgumentException.class, () -> f.service.newRun("Bearer t", "warden", List.of(),
                "ENDLESS", List.of(Map.of("teamId", "T", "sourceCardId", "tide"))));
    }

    @Test
    void guestsCannotBringVeterans() throws Exception {
        Fixture f = new Fixture();
        Mockito.when(f.accounts.findUser(anyString())).thenReturn(null);
        assertThrows(IllegalArgumentException.class, () -> f.service.newRun("Bearer t", "warden", List.of(),
                "ENDLESS", List.of(Map.of("teamId", "T", "sourceCardId", "tide"))));
    }

    @Test
    void veteransAreEndlessOnly() throws Exception {
        Fixture f = new Fixture();
        Map<String, Object> started = f.service.newRun("Bearer t", "warden", List.of("rooty"), "STANDARD",
                List.of(Map.of("teamId", "T", "sourceCardId", "tide")));
        assertEquals(1, f.run(started).getParty().size(), "a standard run ignores veteran picks");
    }

    /**
     * Ending is allowed before any boss, but it banks only the score: there is no
     * leveled team to bank yet, and a voluntary end is not a victory.
     */
    @Test
    void endingBeforeABossBanksTheScoreButNotTheTeam() throws Exception {
        Fixture f = new Fixture();
        Map<String, Object> started = f.service.newRun("Bearer t", "warden", List.of("rooty"), "ENDLESS", null);
        SiegeRun run = f.run(started);
        run.getMap().get(0).setCleared(true);

        Map<String, Object> ended = f.service.extract(run.getToken(), "Bearer t");

        assertEquals("WON", ended.get("status"));
        assertFalse(run.isVeteranExtracted(), "nothing is banked before a boss falls");
        assertEquals(1, run.floorReached());
        @SuppressWarnings("unchecked")
        Map<String, Object> breakdown = (Map<String, Object>) ended.get("scoreBreakdown");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) breakdown.get("lines");
        assertTrue(lines.stream().noneMatch(l -> "victory".equals(l.get("key"))),
                "ending an Endless run is not a victory");
        assertTrue(lines.stream().anyMatch(l -> "depth".equals(l.get("key"))
                && ((Number) l.get("points")).longValue() == SiegeScore.DEPTH_PER_FLOOR));
        @SuppressWarnings("unchecked")
        Map<String, Object> rewards = (Map<String, Object>) ended.get("endRewards");
        assertNull(rewards.get("card"), "ending on loop 1 earns no card prize");
    }

    @Test
    void endingAfterABossAlsoBanksTheTeam() throws Exception {
        Fixture f = new Fixture();
        SiegeRun run = f.run(f.service.newRun("Bearer t", "warden", List.of("rooty"), "ENDLESS", null));
        run.setBossKills(1);
        f.service.extract(run.getToken(), "Bearer t");
        assertTrue(run.isVeteranExtracted());
    }

    @Test
    void onlyEndlessRunsCanBeEndedEarly() throws Exception {
        Fixture f = new Fixture();
        SiegeRun run = f.run(f.service.newRun("Bearer t", "warden", List.of("rooty"), "STANDARD", null));
        assertThrows(IllegalArgumentException.class, () -> f.service.extract(run.getToken(), "Bearer t"));
    }

    // ---- fixtures --------------------------------------------------------

    private static final class Fixture {
        final SiegeService service = new SiegeService();
        final RecordingCheckpoints checkpoints = new RecordingCheckpoints();
        final AccountService accounts = Mockito.mock(AccountService.class);
        final Map<String, Object> team = veteranTeam();

        Fixture() throws Exception {
            setField(service, "content", new StubContent());
            setField(service, "checkpoints", checkpoints);
            AccountUser user = new AccountUser();
            user.setId("player-endless-1");
            Mockito.when(accounts.findUser(anyString())).thenReturn(user);
            setField(service, "accountService", accounts);
            setField(service, "veterans", new SiegeVeteranStore() {
                @Override
                List<Map<String, Object>> listTeams(String userId) {
                    return List.of(team);
                }

                @Override
                List<Map<String, Object>> saveTeam(String userId, Map<String, Object> teamSnapshot) {
                    return List.of(team);
                }
            });
        }

        SiegeRun run(Map<String, Object> started) throws Exception {
            Method require = SiegeService.class.getDeclaredMethod("require", String.class);
            require.setAccessible(true);
            return (SiegeRun) require.invoke(service, String.valueOf(started.get("token")));
        }
    }

    /** One banked team whose only member, Tide, has levels, an item and a chiselled card. */
    private static Map<String, Object> veteranTeam() {
        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("knightId", "warden");
        knight.put("knightName", "Warden");
        knight.put("element", "EARTH");
        knight.put("maxHp", 40);
        knight.put("baseMaxHp", 40);
        knight.put("xp", 0);

        Map<String, Object> tide = new LinkedHashMap<>();
        tide.put("sourceCardId", "tide");
        tide.put("name", "Tide");
        tide.put("element", "WATER");
        tide.put("maxHp", 40);
        tide.put("baseMaxHp", 40);
        tide.put("baseSpeed", 6);
        tide.put("xp", 500);
        tide.put("itemId", "sigil-x");

        Map<String, Object> spec = new LinkedHashMap<>();
        spec.put("id", "splash+");
        spec.put("name", "Honed Splash");
        spec.put("element", "WATER");
        spec.put("effect", "DAMAGE");
        spec.put("value", 9);
        spec.put("target", "ENEMY_SINGLE");
        spec.put("cost", 1);
        spec.put("desc", "");
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("iid", "c0");
        card.put("owner", "ally-0-tide");
        card.put("spec", spec);

        Map<String, Object> team = new LinkedHashMap<>();
        team.put("teamId", "T");
        team.put("knight", knight);
        team.put("members", new ArrayList<>(List.of(tide)));
        team.put("deck", new ArrayList<>(List.of(card)));
        return team;
    }

    /** One fresh Siegeling and one starter knight; nothing locked. */
    private static final class StubContent extends SiegeContentService {
        private final SieglingCard card = new SieglingCard("rooty", "Rooty", Element.EARTH, Rarity.COMMON, 10, 6,
                new ArrayList<>(), null);
        private final TrainerCard knight = new TrainerCard("warden", "Warden", Element.EARTH, Rarity.RARE,
                null, null, false);

        @Override
        List<Element> defaultPalette() { return List.of(Element.EARTH); }

        @Override
        Optional<SieglingCard> findAnySiegling(String id) {
            return "rooty".equals(id) ? Optional.of(card) : Optional.empty();
        }

        @Override
        Optional<SieglingCard> findSiegling(String id) {
            return findAnySiegling(id);
        }

        @Override
        Optional<TrainerCard> findKnight(String id) {
            return "warden".equals(id) ? Optional.of(knight) : Optional.empty();
        }

        @Override
        boolean expeditionStartersConfigured() { return false; }

        @Override
        boolean isExpeditionKnightStarter(TrainerCard k) { return true; }

        @Override
        boolean isExpeditionStarter(SieglingCard s, boolean startersConfigured) { return true; }

        @Override
        boolean isSiegePurchaseSiegling(SieglingCard s) { return false; }

        @Override
        int stageOf(SieglingCard s) { return 1; }

        @Override
        Optional<SieglingCard> evolutionOf(String cardId) { return Optional.empty(); }

        @Override
        boolean hasStage3EvolutionChain(String cardId) { return false; }
    }

    private static final class RecordingCheckpoints extends SiegeCheckpointStore {
        private RunSlot savedSlot;

        @Override
        boolean save(String token, Map<String, Object> snapshot) { return true; }

        @Override
        boolean saveForUser(String userId, RunSlot slot, Map<String, Object> snapshot) {
            savedSlot = slot;
            return true;
        }

        @Override
        Optional<Map<String, Object>> loadForUser(String userId, RunSlot slot) { return Optional.empty(); }

        @Override
        void delete(String token) { }

        @Override
        void deleteForUser(String userId, RunSlot slot, String token) { }
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
