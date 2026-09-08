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
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;

/**
 * Two reported Battlegrounds defects that share a cause: the mode was treated as a
 * second-class copy of the expedition.
 *
 * <p>Veteran snapshots bank stats, not art, so every rebuilt Siegeling was served with
 * a null {@code artUrl} and drew as an element glyph — on the battlefield, in the party
 * rail and on the resume prompt alike. And a single account checkpoint document meant
 * starting either mode silently discarded the other's save.</p>
 *
 * <p>The catalog on the classpath carries no art (art lives in the Firestore overrides),
 * so these drive a stub catalog rather than the live one — otherwise every art assertion
 * would compare null to null and pass without proving anything.</p>
 */
class SiegeModeSaveSlotTest {

    private static final String ART = "https://example.test/art/rooty.png";
    private static final String KNIGHT_ART = "https://example.test/art/warden.png";

    private static SiegeService serviceWithStubCatalog() throws Exception {
        SiegeService service = new SiegeService();
        setField(service, "content", new StubContent());
        return service;
    }

    @Test
    void aRebuiltBattlegroundsSquadKeepsItsCardArt() throws Exception {
        SiegeService service = serviceWithStubCatalog();
        Map<String, Object> team = team("T", "warden", member("rooty", "Rooty"));

        SiegeService.BgBuild build = service.buildBattlegroundsParty(
                List.of(team), List.of(new String[] { "T", "rooty" },
                        new String[] { "T", "rooty" },
                        new String[] { "T", "rooty" }), "T");

        assertEquals(3, build.party.size());
        for (Combatant member : build.party) {
            assertEquals(ART, member.getArtUrl(),
                    member.getName() + " came back from the veteran bank with no art to draw");
        }
        assertEquals(KNIGHT_ART, build.knightUnit.getArtUrl(),
                "the veteran knight must be drawn from its own trainer card");
    }

    /**
     * Even a run banked before the rebuild resolved art has to render, because the
     * serializer falls back to the card the unit is drawn from.
     */
    @Test
    void aUnitSavedWithoutArtStillSerializesItsCardArt() throws Exception {
        SiegeService service = serviceWithStubCatalog();
        Combatant bare = new Combatant("ally-0-rooty", "Rooty", Element.EARTH, Side.PLAYER, 40, 6, null);
        bare.setSourceCardId("rooty");

        Method serialize = SiegeService.class.getDeclaredMethod(
                "serializeCombatant", Combatant.class, boolean.class);
        serialize.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> m = (Map<String, Object>) serialize.invoke(service, bare, false);

        assertEquals(ART, m.get("artUrl"),
                "a unit with no stored art must fall back to the card it is drawn from");
    }

    /** A unit that carries its own art keeps it — the fallback must not overwrite. */
    @Test
    void storedArtWinsOverTheCatalogFallback() throws Exception {
        SiegeService service = serviceWithStubCatalog();
        Combatant drawn = new Combatant("ally-0-rooty", "Rooty", Element.EARTH, Side.PLAYER, 40, 6,
                "https://example.test/art/shade.png");
        drawn.setSourceCardId("rooty");

        Method serialize = SiegeService.class.getDeclaredMethod(
                "serializeCombatant", Combatant.class, boolean.class);
        serialize.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> m = (Map<String, Object>) serialize.invoke(service, drawn, false);

        assertEquals("https://example.test/art/shade.png", m.get("artUrl"));
    }

    /**
     * The slots are what let a player hold one save per mode. EXPEDITION deliberately
     * keeps the original unsuffixed document id so saves written before slots existed
     * still resume.
     */
    @Test
    void eachModeOccupiesItsOwnAccountSaveSlot() throws Exception {
        assertEquals(RunSlot.EXPEDITION, RunSlot.of(RunMode.STANDARD));
        assertEquals(RunSlot.EXPEDITION, RunSlot.of(RunMode.ENDLESS));
        assertEquals(RunSlot.BATTLEGROUNDS, RunSlot.of(RunMode.BATTLEGROUNDS));

        Method docId = SiegeCheckpointStore.class.getDeclaredMethod(
                "accountDocumentId", String.class, RunSlot.class);
        docId.setAccessible(true);
        String expedition = (String) docId.invoke(null, "player/1", RunSlot.EXPEDITION);
        String battlegrounds = (String) docId.invoke(null, "player/1", RunSlot.BATTLEGROUNDS);

        assertNotNull(expedition);
        assertNotEquals(expedition, battlegrounds,
                "both modes would write the same document and overwrite each other");
        assertTrue(battlegrounds.startsWith(expedition + "-"),
                "the Battlegrounds slot must be a suffix of the account id, got " + battlegrounds);
        assertEquals(expedition, docId.invoke(null, "player/1", (Object) null),
                "a null slot must keep resolving to the pre-slot document id");
    }

    /**
     * newRun stamps ownerId before the first checkpoint; newBattlegrounds did not.
     * Boot then asks /api/siege/run/active (account slots only) and, when any
     * expedition save exists, never falls through to the device-local token —
     * so a Battlegrounds march started beside an expedition disappeared on the
     * next refresh, and never showed up on another device.
     */
    @Test
    void startingBattlegroundsWritesTheAccountSaveSlot() throws Exception {
        SiegeService service = serviceWithStubCatalog();
        RecordingCheckpoints checkpoints = new RecordingCheckpoints();
        setField(service, "checkpoints", checkpoints);

        AccountUser user = new AccountUser();
        user.setId("player-bg-1");
        AccountService accounts = Mockito.mock(AccountService.class);
        Mockito.when(accounts.findUser(anyString())).thenReturn(user);
        setField(service, "accountService", accounts);

        Map<String, Object> team = team("T", "warden",
                member("rooty", "Rooty"),
                member("tide", "Tide"),
                member("gale", "Gale"));
        setField(service, "veterans", new SiegeVeteranStore() {
            @Override
            List<Map<String, Object>> listTeams(String userId) {
                return List.of(team);
            }
        });

        List<Map<String, Object>> members = List.of(
                Map.of("teamId", "T", "sourceCardId", "rooty"),
                Map.of("teamId", "T", "sourceCardId", "tide"),
                Map.of("teamId", "T", "sourceCardId", "gale"));
        Map<String, Object> started = service.newBattlegrounds("Bearer test", members, "T", 1);

        assertEquals("player-bg-1", checkpoints.savedUserId,
                "a signed-in Battlegrounds start must write the account checkpoint, not only the token doc");
        assertEquals(RunSlot.BATTLEGROUNDS, checkpoints.savedSlot,
                "the march has to land in its own slot so it does not overwrite the expedition");
        assertEquals(started.get("token"), checkpoints.accountSnapshot.get("token"));
        assertEquals("player-bg-1", checkpoints.accountSnapshot.get("ownerId"));
        assertEquals("BATTLEGROUNDS", started.get("slot"));
    }

    // ---- fixtures --------------------------------------------------------

    /** A catalog with exactly one Siegeling and one knight, both carrying art. */
    private static final class StubContent extends SiegeContentService {
        private final SieglingCard card = card();
        private final TrainerCard knight = knight();

        @Override
        List<Element> defaultPalette() { return List.of(Element.EARTH); }

        private static SieglingCard card() {
            SieglingCard s = new SieglingCard("rooty", "Rooty", Element.EARTH, Rarity.COMMON, 10, 6,
                    new ArrayList<>(), null);
            s.setCardArtUrl(ART);
            return s;
        }

        private static TrainerCard knight() {
            TrainerCard t = new TrainerCard("warden", "Warden", Element.EARTH, Rarity.RARE,
                    null, null, false);
            t.setCardArtUrl(KNIGHT_ART);
            return t;
        }

        @Override
        Optional<SieglingCard> findAnySiegling(String id) {
            return "rooty".equals(id) ? Optional.of(card) : Optional.empty();
        }

        @Override
        Optional<TrainerCard> findKnight(String id) {
            return "warden".equals(id) ? Optional.of(knight) : Optional.empty();
        }

        // The serializer also asks about evolution depth and chains; this stub catalog
        // is one standalone card, so answer without touching the real definitions.
        @Override
        int stageOf(SieglingCard s) {
            return 1;
        }

        @Override
        Optional<SieglingCard> evolutionOf(String cardId) {
            return Optional.empty();
        }

        @Override
        boolean hasStage3EvolutionChain(String cardId) {
            return false;
        }
    }

    /** The shape SiegeService#buildVeteranSnapshot banks. */
    private static Map<String, Object> team(String teamId, String knightId, Map<String, Object>... membersIn) {
        Map<String, Object> knight = new LinkedHashMap<>();
        knight.put("knightId", knightId);
        knight.put("knightName", "Warden");
        knight.put("element", "EARTH");
        knight.put("maxHp", 40);
        knight.put("baseMaxHp", 40);
        knight.put("xp", 0);

        List<Map<String, Object>> members = new ArrayList<>();
        for (Map<String, Object> member : membersIn) members.add(member);

        Map<String, Object> team = new LinkedHashMap<>();
        team.put("teamId", teamId);
        team.put("knight", knight);
        team.put("members", members);
        team.put("deck", new ArrayList<>());
        return team;
    }

    /** Captures token + account checkpoint writes without talking to Firestore. */
    private static final class RecordingCheckpoints extends SiegeCheckpointStore {
        private String savedUserId;
        private RunSlot savedSlot;
        private Map<String, Object> accountSnapshot;

        @Override
        boolean save(String token, Map<String, Object> snapshot) {
            return true;
        }

        @Override
        boolean saveForUser(String userId, RunSlot slot, Map<String, Object> snapshot) {
            savedUserId = userId;
            savedSlot = slot;
            accountSnapshot = snapshot;
            return true;
        }
    }

    private static Map<String, Object> member(String sourceCardId, String name) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("sourceCardId", sourceCardId);
        m.put("name", name);
        m.put("element", "EARTH");
        m.put("maxHp", 40);
        m.put("baseMaxHp", 40);
        m.put("baseSpeed", 6);
        m.put("xp", 0);
        return m;
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
