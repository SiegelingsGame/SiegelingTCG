package com.sieglings.dominion;

import com.sieglings.persistence.entity.AccountUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Dominion save sync, inbox, guilds, Siege Operations and the market, with two players. */
class DominionServiceTest {
    private Instant[] now;
    private InMemoryDominionRepository repo;
    private DominionService service;
    private AccountUser ari;
    private AccountUser bo;

    @BeforeEach
    void setUp() {
        now = new Instant[]{Instant.parse("2026-10-14T09:00:00Z")};
        repo = new InMemoryDominionRepository();
        service = new DominionService(repo, null);
        service.setClock(new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now[0]; }
        });
        ari = user("ari", "Ari");
        bo = user("bo", "Bo");
    }

    private static AccountUser user(String id, String name) {
        AccountUser u = new AccountUser();
        u.setId(id);
        u.setDisplayName(name);
        return u;
    }

    /** A minimal browser save: rank 5 (rankXp 880) and the given stock. */
    private static String state(String inv) {
        return "{\"schema\":2,\"knight\":{\"name\":\"K\",\"rankXp\":880},\"inv\":{" + inv + "}}";
    }

    private long sync(AccountUser u, String inv) {
        long base = ((Number) service.snapshot(u).get("version")).longValue();
        return ((Number) service.putSave(u, state(inv), base, List.of()).get("version")).longValue();
    }

    @SuppressWarnings("unchecked")
    private static List<DominionRepository.InboxEntry> inbox(Map<String, Object> view) {
        return (List<DominionRepository.InboxEntry>) view.get("inbox");
    }

    private long sum(AccountUser u, String item) {
        DominionRepository.SaveDoc doc = repo.findSave(u.getId()).orElseThrow();
        return DominionService.available(doc, item);
    }

    @Test
    void savesAreVersionedAndAStaleSyncIsRefused() {
        assertEquals(1, sync(ari, "\"timber\":10.7"));
        assertEquals(10, repo.findSave("ari").orElseThrow().inv.get("timber"), "inventory snapshot is floored");
        assertThrows(DominionService.StaleSaveException.class, () -> service.putSave(ari, state("\"timber\":1"), 0, List.of()));
        Map<String, Object> snap = service.snapshot(ari);
        assertEquals(1L, ((Number) snap.get("version")).longValue());
        assertNotNull(snap.get("state"));
    }

    @Test
    void oversizedOrBrokenSavesAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> service.putSave(ari, "not json", 0, List.of()));
        assertThrows(IllegalArgumentException.class, () -> service.putSave(ari, "x".repeat(DominionService.MAX_STATE_CHARS + 1), 0, List.of()));
    }

    @Test
    void listingEscrowsGoodsAndBuyingPaysTheSellerLessTheFee() {
        sync(ari, "\"glass\":5");
        sync(bo, "\"crowns\":500");
        Map<String, Object> m = service.list(ari, "glass", 3, 100);
        assertEquals(2, sum(ari, "glass"), "3 glass held in escrow by an inbox debit");
        assertThrows(IllegalArgumentException.class, () -> service.list(ari, "glass", 3, 100), "cannot list the same goods twice");
        @SuppressWarnings("unchecked")
        String id = (String) ((List<Map<String, Object>>) m.get("open")).get(0).get("id");
        assertThrows(IllegalArgumentException.class, () -> service.buy(ari, id), "no buying your own listing");
        service.buy(bo, id);
        assertEquals(400, sum(bo, "crowns"));
        assertEquals(3, sum(bo, "glass"));
        assertEquals(95, sum(ari, "crowns"), "5% market fee");
        assertThrows(IllegalArgumentException.class, () -> service.buy(bo, id), "a sold listing cannot be bought again");
    }

    @Test
    void buyerNeedsTheCrownsAndCancellingReturnsGoods() {
        sync(ari, "\"rune_stone\":4");
        sync(bo, "\"crowns\":10");
        @SuppressWarnings("unchecked")
        String id = (String) ((List<Map<String, Object>>) service.list(ari, "rune_stone", 4, 50).get("open")).get(0).get("id");
        assertThrows(IllegalArgumentException.class, () -> service.buy(bo, id));
        assertEquals(0, sum(ari, "rune_stone"));
        service.cancel(ari, id);
        assertEquals(4, sum(ari, "rune_stone"));
        assertThrows(IllegalArgumentException.class, () -> service.cancel(ari, id));
    }

    @Test
    void aliasedAndUnknownItemsAreNotTradeable() {
        assertTrue(DominionService.tradeable("timber"));
        assertTrue(DominionService.tradeable("iron_bar"));
        assertFalse(DominionService.tradeable("pine_log"), "pine logs are Timber in Dominion");
        assertFalse(DominionService.tradeable("crowns"));
        assertFalse(DominionService.tradeable("made_up"));
        assertFalse(DominionService.tradeable("copper_sword"), "gear must be crafted, never bought");
        assertFalse(DominionService.tradeable("copper_mail"), "gear must be crafted, never bought");
    }

    @Test
    void appliedInboxEntriesAreDroppedOnTheNextSync() {
        sync(ari, "\"glass\":5");
        service.list(ari, "glass", 2, 10);
        List<DominionRepository.InboxEntry> pending = inbox(service.snapshot(ari));
        assertEquals(1, pending.size());
        long base = ((Number) service.snapshot(ari).get("version")).longValue();
        // The browser applied the debit, so its synced stock is now 3 and the entry is cleared.
        Map<String, Object> out = service.putSave(ari, state("\"glass\":3"), base, List.of(pending.get(0).id));
        assertTrue(inbox(out).isEmpty());
        assertEquals(3, sum(ari, "glass"), "no double debit after the inbox is applied");
    }

    @Test
    void guildsNeedRankAndASyncedSaveAndJoinByCode() {
        assertThrows(IllegalArgumentException.class, () -> service.createGuild(ari, "Rootwardens"));
        service.putSave(ari, "{\"knight\":{\"rankXp\":0},\"inv\":{}}", 0, List.of());
        assertThrows(IllegalArgumentException.class, () -> service.createGuild(ari, "Rootwardens"), "rank 1 cannot found a guild");
        sync(ari, "");
        Map<String, Object> g = service.createGuild(ari, "Rootwardens");
        @SuppressWarnings("unchecked")
        Map<String, Object> view = (Map<String, Object>) g.get("guild");
        String code = (String) view.get("code");
        sync(bo, "");
        service.joinGuild(bo, code);
        @SuppressWarnings("unchecked")
        Map<String, Object> bv = (Map<String, Object>) service.guild(bo).get("guild");
        assertEquals("Rootwardens", bv.get("name"));
        assertEquals(2, ((List<?>) bv.get("members")).size());
        service.leaveGuild(bo);
        assertNull(service.guild(bo).get("guild"));
    }

    @Test
    void donationsSpendGoodsAndRaiseDefense() {
        sync(ari, "\"iron_bar\":100");
        service.createGuild(ari, "Rootwardens");
        assertThrows(IllegalArgumentException.class, () -> service.donate(ari, "timber", 5), "not a donation item");
        service.donate(ari, "iron_bar", 70);
        assertEquals(30, sum(ari, "iron_bar"));
        assertThrows(IllegalArgumentException.class, () -> service.donate(ari, "iron_bar", 31));
        @SuppressWarnings("unchecked")
        Map<String, Object> view = (Map<String, Object>) service.guild(ari).get("guild");
        assertEquals(420L, view.get("defensePoints"));
        assertEquals(1, view.get("defenseLevel"));
    }

    @Test
    void operationReportsCountOnceAndTheWinPaysEachFighterOnce() {
        sync(ari, "");
        service.createGuild(ari, "Rootwardens");
        service.reportOperation(ari, "x1", "assault", 5000);
        service.reportOperation(ari, "x1", "assault", 5000);
        @SuppressWarnings("unchecked")
        Map<String, Object> op = (Map<String, Object>) ((Map<String, Object>) service.guild(ari).get("guild")).get("operation");
        assertEquals(600L, op.get("damage"), "capped at 600 and counted once");
        assertThrows(IllegalArgumentException.class, () -> service.claimOperation(ari));
        service.reportOperation(ari, "x2", "supply", 600);
        service.reportOperation(ari, "x3", "scouting", 600);
        service.reportOperation(ari, "x4", "assault", 600);
        @SuppressWarnings("unchecked")
        Map<String, Object> won = (Map<String, Object>) ((Map<String, Object>) service.guild(ari).get("guild")).get("operation");
        assertEquals(true, won.get("won"));
        service.claimOperation(ari);
        assertEquals(150, sum(ari, "crowns"));
        assertThrows(IllegalArgumentException.class, () -> service.claimOperation(ari));
    }

    @Test
    void aNewWeekBringsANewOperation() {
        sync(ari, "");
        service.createGuild(ari, "Rootwardens");
        service.reportOperation(ari, "x1", "assault", 300);
        now[0] = now[0].plusSeconds(8L * 24 * 3600);
        @SuppressWarnings("unchecked")
        Map<String, Object> op = (Map<String, Object>) ((Map<String, Object>) service.guild(ari).get("guild")).get("operation");
        assertEquals(0L, op.get("damage"));
    }
}
