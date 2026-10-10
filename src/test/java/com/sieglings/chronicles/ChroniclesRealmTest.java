package com.sieglings.chronicles;

import com.sieglings.persistence.entity.AccountUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Guilds, Siege Operations and the marketplace, with two knights sharing one realm. */
class ChroniclesRealmTest {
    private final Instant start = Instant.parse("2026-10-12T09:00:00Z");
    private Clock clock;
    private Instant[] now;
    private Saves saves;
    private Realm realm;
    private ChroniclesService service;
    private AccountUser ari;
    private AccountUser bo;

    @BeforeEach
    void setUp() {
        now = new Instant[]{start};
        clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now[0]; }
        };
        saves = new Saves();
        realm = new Realm();
        service = new ChroniclesService(saves, null, realm);
        service.setClock(clock);
        ari = user("ari@example.com", "Ari");
        bo = user("bo@example.com", "Bo");
        service.start(ari, "sundile", "Ari", null);
        service.start(bo, "cacty", "Bo", null);
    }

    @Test
    void battlesPayCrowns() {
        service.launch(ari, "mossroot_patrol", Map.of(), null, -1);
        advance(Duration.ofMinutes(20));
        Map<String, Object> out = service.collect(ari, null, -1);
        @SuppressWarnings("unchecked")
        Map<String, Object> report = (Map<String, Object>) out.get("report");
        long crowns = ((Number) report.get("crowns")).longValue();
        assertTrue(crowns > 0 || ((Number) report.get("encountersWon")).intValue() == 0);
        assertEquals(crowns, saves.get(ari).crowns);
    }

    @Test
    void foundingNeedsRankAndOthersJoinByCode() {
        assertThrows(IllegalArgumentException.class, () -> service.createGuild(ari, "Ember Wardens", null, -1));
        edit(ari, s -> s.rankXp = ChroniclesContent.xpForLevel(10));
        service.createGuild(ari, "Ember Wardens", null, -1);
        ChroniclesState a = saves.get(ari);
        assertFalse(a.guildId.isEmpty());
        ChroniclesRealm.Guild guild = realm.guilds.get(a.guildId);
        assertEquals(6, guild.code.length());
        assertEquals(150L * 10 * 3, guild.operation.maxHp, "a rank-10 founder, counted as at least three members");
        assertEquals(1000L * 3, ChroniclesContent.threatHp(1, 2), "a floor for young guilds");
        assertEquals(150L * 40 * 5, ChroniclesContent.threatHp(5, 40), "veteran guilds face a stronger threat");

        assertThrows(IllegalArgumentException.class, () -> service.joinGuild(bo, "NOPE00", null, -1));
        service.joinGuild(bo, guild.code.toLowerCase(), null, -1);
        assertEquals(a.guildId, saves.get(bo).guildId);
        assertEquals(2, realm.guilds.get(a.guildId).members.size());
        assertThrows(IllegalArgumentException.class, () -> service.joinGuild(bo, guild.code, null, -1), "already in one");

        Map<String, Object> view = service.guildView(bo);
        @SuppressWarnings("unchecked")
        Map<String, Object> g = (Map<String, Object>) view.get("guild");
        assertEquals("Ember Wardens", g.get("name"));
        assertEquals(false, g.get("isLeader"));

        service.leaveGuild(ari, null, -1);
        assertEquals(List.of(saves.get(bo).userId), new ArrayList<>(realm.guilds.get(a.guildId).members.keySet()));
        assertEquals(saves.get(bo).userId, realm.guilds.get(a.guildId).leaderId, "leadership passes on");
        service.leaveGuild(bo, null, -1);
        assertNull(realm.guilds.get(a.guildId), "an empty guild is dissolved");
    }

    @Test
    void donationsRaiseSiegeDefenses() {
        String code = foundGuild();
        service.joinGuild(bo, code, null, -1);
        edit(bo, s -> s.inventory.put("iron_bar", 80));
        service.donate(bo, "iron_bar", 70, null, -1);
        assertEquals(10, saves.get(bo).inventory.get("iron_bar"));
        ChroniclesRealm.Guild guild = realm.guilds.get(saves.get(bo).guildId);
        assertEquals(420, guild.defensePoints);
        assertEquals(1, ChroniclesContent.defenseLevel(guild.defensePoints));
        assertThrows(IllegalArgumentException.class, () -> service.donate(bo, "sunleaf", 1, null, -1), "not a defense material");
        assertThrows(IllegalArgumentException.class, () -> service.donate(bo, "iron_bar", 11, null, -1));
        assertEquals(10, saves.get(bo).inventory.get("iron_bar"), "a refused donation takes nothing");
    }

    @Test
    void operationSortiesWearDownTheThreatAndContributorsClaim() {
        String code = foundGuild();
        service.joinGuild(bo, code, null, -1);
        String guildId = saves.get(ari).guildId;
        assertThrows(IllegalArgumentException.class, () -> service.claimOperation(ari, null, -1), "the threat still stands");
        realm.guilds.get(guildId).operation.maxHp = 1;
        edit(ari, s -> s.companions.get(0).level = 8);

        service.launch(ari, "operation:supply", Map.of(), null, -1);
        ChroniclesState.Expedition sortie = saves.get(ari).expedition;
        assertEquals("supply", sortie.operationFront);
        assertTrue(sortie.operationScore > 0, "a seasoned company scores on its sortie");
        advance(Duration.ofMinutes(ChroniclesContent.OPERATION_MINUTES + 1));
        service.collect(ari, null, -1);
        ChroniclesRealm.Operation op = realm.guilds.get(guildId).operation;
        {
            assertEquals(sortie.operationScore, op.contributions.get(saves.get(ari).userId));
            assertTrue(op.wonAt > 0, "a one-point threat breaks on the first sortie");
            assertThrows(IllegalArgumentException.class, () -> service.claimOperation(bo, null, -1), "Bo never fought");
            long relics = saves.get(ari).inventory.getOrDefault("ancient_relic", 0);
            long crowns = saves.get(ari).crowns;
            service.claimOperation(ari, null, -1);
            assertEquals(relics + 2, (long) saves.get(ari).inventory.getOrDefault("ancient_relic", 0));
            assertEquals(crowns + 500, saves.get(ari).crowns);
            assertThrows(IllegalArgumentException.class, () -> service.claimOperation(ari, null, -1), "once a week");
            assertThrows(IllegalArgumentException.class, () -> service.launch(ari, "operation:assault", Map.of(), null, -1));
        }
    }

    @Test
    void favoredClassesScoreMoreOnTheirFront() {
        foundGuild();
        ChroniclesState state = saves.get(ari);
        ChroniclesRealm.Guild guild = realm.guilds.get(state.guildId);
        ChroniclesCombat.Result result = new ChroniclesCombat.Result();
        result.levelsDefeated = 100;
        List<ChroniclesState.Companion> sundile = List.of(state.companions.get(0));
        assertEquals(125, service.operationScore(state, sundile, "supply", result, guild), "a Guardian on the supply line");
        assertEquals(100, service.operationScore(state, sundile, "scouting", result, guild));
        guild.defensePoints = 1500;
        assertEquals(150, service.operationScore(state, sundile, "supply", result, guild), "defense level 2 adds 20%");
    }

    @Test
    void aNewWeekBringsANewThreat() {
        foundGuild();
        String guildId = saves.get(ari).guildId;
        String week = realm.guilds.get(guildId).operation.week;
        realm.guilds.get(guildId).operation.damage = 999;
        advance(Duration.ofDays(7));
        service.guildView(ari);
        ChroniclesRealm.Operation op = realm.guilds.get(guildId).operation;
        assertFalse(week.equals(op.week));
        assertEquals(0, op.damage);
        assertEquals(ChroniclesService.threatForWeek(op.week).id(), op.threatId);
    }

    @Test
    void theMarketplaceEscrowsGoodsAndPaysTheSellerLess5Percent() {
        edit(ari, s -> s.inventory.put("iron_bar", 10));
        service.listItem(ari, "iron_bar", 4, 200, null, -1);
        assertEquals(6, saves.get(ari).inventory.get("iron_bar"), "listed goods leave the pack");
        String listingId = realm.listings.keySet().iterator().next();

        assertThrows(IllegalArgumentException.class, () -> service.buyListing(ari, listingId, null, -1), "not your own");
        assertThrows(IllegalArgumentException.class, () -> service.buyListing(bo, listingId, null, -1), "Bo has no crowns");
        edit(bo, s -> s.crowns = 300);
        service.buyListing(bo, listingId, null, -1);
        assertEquals(100, saves.get(bo).crowns);
        assertEquals(4, saves.get(bo).inventory.get("iron_bar"));
        assertThrows(IllegalArgumentException.class, () -> service.buyListing(bo, listingId, null, -1), "sold once");

        Map<String, Object> snap = service.getSnapshot(ari);
        assertEquals(190, saves.get(ari).crowns, "200 less the 5% fee");
        @SuppressWarnings("unchecked")
        List<String> events = (List<String>) snap.get("events");
        assertTrue(events.stream().anyMatch(e -> e.contains("190 crowns")), events.toString());
        service.getSnapshot(ari);
        assertEquals(190, saves.get(ari).crowns, "proceeds are paid once");
    }

    @Test
    void cancellingReturnsTheGoodsAndSiegelingsAndWornGearCannotBeSold() {
        edit(ari, s -> s.inventory.merge("herb_tonic", 5, Integer::sum));
        service.listItem(ari, "herb_tonic", 5, 30, null, -1);
        assertEquals(3, saves.get(ari).inventory.get("herb_tonic"), "started with 3 plus 5, listed 5");
        String id = realm.listings.keySet().iterator().next();
        assertThrows(IllegalArgumentException.class, () -> service.cancelListing(bo, id, null, -1), "not Bo's");
        service.cancelListing(ari, id, null, -1);
        assertEquals(8, saves.get(ari).inventory.get("herb_tonic"));
        assertThrows(IllegalArgumentException.class, () -> service.listItem(ari, "squires_sword", 1, 10, null, -1),
                "the only sword is in hand");
        assertThrows(IllegalArgumentException.class, () -> service.listItem(ari, "c1", 1, 10, null, -1),
                "a Siegeling is not an item");
        assertThrows(IllegalArgumentException.class, () -> service.listItem(ari, "herb_tonic", 1, 0, null, -1));
    }

    @Test
    void theKnightsOwnSaveNeverWaitsOnAnUnreachableRealm() {
        realm.down = true;
        Map<String, Object> snap = service.getSnapshot(ari);
        assertEquals(true, snap.get("started"));
        assertThrows(RuntimeException.class, () -> service.marketView(ari));
        ChroniclesService offline = new ChroniclesService(saves, null);
        offline.setClock(clock);
        assertThrows(IllegalArgumentException.class, () -> offline.createGuild(ari, "Ember Wardens", null, -1));
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private void edit(AccountUser user, java.util.function.Consumer<ChroniclesState> change) {
        ChroniclesState state = saves.get(user);
        change.accept(state);
        saves.put(state);
    }

    private String foundGuild() {
        edit(ari, s -> s.rankXp = ChroniclesContent.xpForLevel(10));
        service.createGuild(ari, "Ember Wardens", null, -1);
        return realm.guilds.get(saves.get(ari).guildId).code;
    }

    private void advance(Duration d) { now[0] = now[0].plus(d); }

    private static AccountUser user(String id, String name) {
        AccountUser u = new AccountUser();
        u.setId(id);
        u.setDisplayName(name);
        return u;
    }

    /** One save per knight, each round-tripped through JSON like Firestore. */
    private static final class Saves extends ChroniclesStore {
        final Map<String, String> docs = new HashMap<>();

        ChroniclesState get(AccountUser user) { return findByUserId(user.getId()).orElseThrow(); }
        void put(ChroniclesState state) { save(state); }

        @Override public Optional<ChroniclesState> findByUserId(String userId) {
            String json = docs.get(userId);
            if (json == null) return Optional.empty();
            try {
                ChroniclesState s = JSON.readValue(json, ChroniclesState.class);
                s.userId = userId;
                return Optional.of(s);
            } catch (Exception ex) { throw new IllegalStateException(ex); }
        }

        @Override public ChroniclesState save(ChroniclesState value) {
            try { docs.put(value.userId, JSON.writeValueAsString(value)); }
            catch (Exception ex) { throw new IllegalStateException(ex); }
            return value;
        }
    }

    /** The shared realm. A transaction body runs on a copy and commits only if it does not throw. */
    private static final class Realm extends ChroniclesRealmStore {
        final Map<String, ChroniclesRealm.Guild> guilds = new HashMap<>();
        final Map<String, ChroniclesRealm.Listing> listings = new java.util.LinkedHashMap<>();
        boolean down;

        private void check() { if (down) throw new IllegalStateException("Firestore is unavailable."); }

        private static <T> T copy(T value, Class<T> type) {
            try { return ChroniclesStore.JSON.readValue(ChroniclesStore.JSON.writeValueAsString(value), type); }
            catch (Exception ex) { throw new IllegalStateException(ex); }
        }

        @Override public Optional<ChroniclesRealm.Guild> findGuild(String id) {
            check();
            return Optional.ofNullable(guilds.get(id)).map(g -> copy(g, ChroniclesRealm.Guild.class));
        }

        @Override public Optional<ChroniclesRealm.Guild> findGuildByCode(String code) {
            check();
            return guilds.values().stream().filter(g -> g.code.equals(code)).findFirst().map(g -> copy(g, ChroniclesRealm.Guild.class));
        }

        @Override public ChroniclesRealm.Guild createGuild(ChroniclesRealm.Guild guild) {
            check();
            if (guilds.containsKey(guild.id)) throw new IllegalArgumentException("That guild already exists.");
            guilds.put(guild.id, copy(guild, ChroniclesRealm.Guild.class));
            return guild;
        }

        @Override public synchronized <T> T mutateGuild(String id, Function<ChroniclesRealm.Guild, T> body) {
            check();
            ChroniclesRealm.Guild stored = guilds.get(id);
            if (stored == null) throw new IllegalArgumentException("That guild no longer exists.");
            ChroniclesRealm.Guild working = copy(stored, ChroniclesRealm.Guild.class);
            working.id = id;
            T result = body.apply(working);
            if (working.members.isEmpty()) guilds.remove(id);
            else guilds.put(id, working);
            return result;
        }

        @Override public ChroniclesRealm.Listing createListing(ChroniclesRealm.Listing listing) {
            check();
            listings.put(listing.id, copy(listing, ChroniclesRealm.Listing.class));
            return listing;
        }

        @Override public List<ChroniclesRealm.Listing> openListings(int limit) {
            check();
            return listings.values().stream().filter(l -> "open".equals(l.status)).limit(limit)
                    .map(l -> copy(l, ChroniclesRealm.Listing.class)).toList();
        }

        @Override public List<ChroniclesRealm.Listing> listingsBySeller(String sellerId) {
            check();
            return listings.values().stream().filter(l -> sellerId.equals(l.sellerId))
                    .map(l -> copy(l, ChroniclesRealm.Listing.class)).toList();
        }

        @Override public synchronized <T> T mutateListing(String id, Function<ChroniclesRealm.Listing, T> body) {
            check();
            ChroniclesRealm.Listing stored = listings.get(id);
            if (stored == null) throw new IllegalArgumentException("That listing is gone.");
            ChroniclesRealm.Listing working = copy(stored, ChroniclesRealm.Listing.class);
            working.id = id;
            T result = body.apply(working);
            listings.put(id, working);
            return result;
        }
    }
}
