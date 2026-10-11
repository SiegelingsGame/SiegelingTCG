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
import java.util.function.Consumer;
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
        saves.realm = realm;
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
    void aFailedSaveDoesNotLeaveGoodsListedOrCrownsUnpaid() throws Exception {
        edit(ari, s -> s.inventory.put("iron_bar", 10));
        saves.failNextCommit = true;
        assertThrows(IllegalStateException.class, () -> service.listItem(ari, "iron_bar", 4, 200, null, -1));
        assertEquals(10, saves.get(ari).inventory.get("iron_bar"), "the pack is unchanged when the save fails");
        assertTrue(realm.listings.isEmpty(), "no listing is posted without the debit");

        ChroniclesState stale = saves.get(ari);
        long loaded = stale.version;
        service.listItem(ari, "iron_bar", 4, 200, null, -1);
        assertEquals(6, saves.get(ari).inventory.get("iron_bar"));
        String listingId = realm.listings.keySet().iterator().next();
        stale.version = loaded + 1;
        assertThrows(ChroniclesService.StaleStateException.class,
                () -> saves.commit(stale, loaded, null), "a poll that read the pre-list chronicle cannot restore the bars");
        assertEquals(6, saves.get(ari).inventory.get("iron_bar"));
        assertEquals(1, realm.listings.size());

        edit(bo, s -> s.crowns = 300);
        saves.failNextCommit = true;
        assertThrows(IllegalStateException.class, () -> service.buyListing(bo, listingId, null, -1));
        assertEquals("open", realm.listings.get(listingId).status, "the sale rolls back with the buyer's save");
        assertEquals(300, saves.get(bo).crowns);
        assertNull(saves.get(bo).inventory.get("iron_bar"));

        service.buyListing(bo, listingId, null, -1);
        saves.failNextCommit = true;
        assertThrows(IllegalStateException.class, () -> service.getSnapshot(ari));
        assertEquals(0, saves.get(ari).crowns, "proceeds stay unclaimed so the next visit can pay them");
        assertFalse(realm.listings.get(listingId).claimed);
        Map<String, Object> paid = service.getSnapshot(ari);
        assertEquals(190, saves.get(ari).crowns);
        assertTrue(realm.listings.get(listingId).claimed);
        @SuppressWarnings("unchecked")
        List<String> events = (List<String>) paid.get("events");
        assertTrue(events.stream().anyMatch(e -> e.contains("190 crowns")), events.toString());
    }

    @Test
    void anOperationScoreIsAppliedOnceWhenCollectIsRetried() throws Exception {
        foundGuild();
        String guildId = saves.get(ari).guildId;
        realm.guilds.get(guildId).operation.maxHp = 1;
        edit(ari, s -> s.companions.get(0).level = 8);
        service.launch(ari, "operation:supply", Map.of(), null, -1);
        advance(Duration.ofMinutes(ChroniclesContent.OPERATION_MINUTES + 1));
        long score = saves.get(ari).expedition.operationScore;
        String departure = ChroniclesStore.JSON.writeValueAsString(saves.get(ari).expedition);

        saves.failNextCommit = true;
        assertThrows(IllegalStateException.class, () -> service.collect(ari, null, -1));
        assertEquals(0, realm.guilds.get(guildId).operation.damage, "a failed collect does not keep the score");
        assertNotNull(saves.get(ari).expedition);

        service.collect(ari, null, -1);
        assertEquals(score, realm.guilds.get(guildId).operation.damage);
        edit(ari, s -> {
            try {
                s.expedition = ChroniclesStore.JSON.readValue(departure, ChroniclesState.Expedition.class);
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
        });
        service.collect(ari, null, -1);
        assertEquals(score, realm.guilds.get(guildId).operation.damage, "the same departure cannot score twice");
        assertEquals(score, realm.guilds.get(guildId).operation.contributions.get(ari.getId()));
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
        Realm realm;
        boolean failNextCommit;

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

        private long storedVersion(String userId) {
            String json = docs.get(userId);
            if (json == null) return ABSENT_VERSION;
            try { return JSON.readValue(json, ChroniclesState.class).version; }
            catch (Exception ex) { throw new IllegalStateException(ex); }
        }

        @Override public ChroniclesState commit(ChroniclesState value, long expectedVersion,
                                                Consumer<ChroniclesRealmStore.RealmBatch> work) {
            if (storedVersion(value.userId) != expectedVersion) {
                throw new ChroniclesService.StaleStateException("Your chronicle changed on another device. Refreshing.");
            }
            if (failNextCommit) {
                failNextCommit = false;
                if (work != null) realm.openStage();
                try {
                    if (work != null) work.accept(realm.stageBatch());
                    throw new IllegalStateException("Unable to save Siegeknight Chronicles to Firestore.");
                } catch (RuntimeException ex) {
                    if (work != null) realm.discardStage();
                    throw ex;
                }
            }
            if (work != null) {
                realm.openStage();
                try {
                    work.accept(realm.stageBatch());
                    realm.flushStage();
                } catch (RuntimeException ex) {
                    realm.discardStage();
                    throw ex;
                }
            }
            return save(value);
        }
    }

    /** The shared realm. A transaction body runs on a copy and commits only if it does not throw. */
    private static final class Realm extends ChroniclesRealmStore {
        final Map<String, ChroniclesRealm.Guild> guilds = new HashMap<>();
        final Map<String, ChroniclesRealm.Listing> listings = new java.util.LinkedHashMap<>();
        boolean down;
        private final Map<String, ChroniclesRealm.Listing> stagedListings = new java.util.LinkedHashMap<>();
        private final Map<String, ChroniclesRealm.Guild> stagedGuilds = new HashMap<>();
        private boolean staging;
        private boolean writing;

        void openStage() {
            stagedListings.clear();
            stagedGuilds.clear();
            staging = true;
            writing = false;
        }

        void discardStage() {
            stagedListings.clear();
            stagedGuilds.clear();
            staging = false;
            writing = false;
        }

        void flushStage() {
            stagedListings.forEach((id, listing) -> listings.put(id, copy(listing, ChroniclesRealm.Listing.class)));
            stagedGuilds.forEach((id, guild) -> {
                if (guild.members == null || guild.members.isEmpty()) guilds.remove(id);
                else guilds.put(id, copy(guild, ChroniclesRealm.Guild.class));
            });
            discardStage();
        }

        ChroniclesRealmStore.RealmBatch stageBatch() {
            return new ChroniclesRealmStore.RealmBatch() {
                @Override public ChroniclesRealm.Listing readListing(String id) {
                    if (writing) throw new IllegalStateException("Realm batch must read every document before it writes.");
                    if (stagedListings.containsKey(id) && stagedListings.get(id) != null && !listings.containsKey(id)) {
                        return stagedListings.get(id);
                    }
                    ChroniclesRealm.Listing live = listings.get(id);
                    return live == null ? null : copy(live, ChroniclesRealm.Listing.class);
                }

                @Override public void writeListing(ChroniclesRealm.Listing listing) {
                    writing = true;
                    stagedListings.put(listing.id, listing);
                }

                @Override public ChroniclesRealm.Guild readGuild(String id) {
                    if (writing) throw new IllegalStateException("Realm batch must read every document before it writes.");
                    ChroniclesRealm.Guild live = guilds.get(id);
                    return live == null ? null : copy(live, ChroniclesRealm.Guild.class);
                }

                @Override public void writeGuild(ChroniclesRealm.Guild guild) {
                    writing = true;
                    stagedGuilds.put(guild.id, guild);
                }
            };
        }

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

        @Override public Optional<ChroniclesRealm.Listing> findListing(String id) {
            check();
            ChroniclesRealm.Listing listing = listings.get(id);
            return listing == null ? Optional.empty() : Optional.of(copy(listing, ChroniclesRealm.Listing.class));
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
