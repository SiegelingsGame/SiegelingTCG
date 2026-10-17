package com.sieglings.dominion;

import com.fasterxml.jackson.databind.JsonNode;
import com.sieglings.chronicles.ChroniclesContent;
import com.sieglings.chronicles.ChroniclesRealm.Guild;
import com.sieglings.chronicles.ChroniclesRealm.Listing;
import com.sieglings.chronicles.ChroniclesRealm.Member;
import com.sieglings.chronicles.ChroniclesRealm.Operation;
import com.sieglings.dominion.DominionRepository.InboxEntry;
import com.sieglings.dominion.DominionRepository.SaveDoc;
import com.sieglings.model.Card;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.CardDefinitionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.IsoFields;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Dominion test mode: the Keep and Chronicles merged. The rules engine runs in the browser
 * (dominion.js) and this service stores its save per account; what must be shared between
 * players runs here: guilds, the weekly Siege Operation and a Crowns marketplace. Realm
 * changes reach a player's save through an inbox the browser applies once, and trades are
 * checked against the inventory the player last synced, so items can be listed or donated
 * only once even across devices.
 */
@Service
public class DominionService {

    /** Thrown when a sync was based on an older save than the server holds. */
    public static class StaleSaveException extends RuntimeException {
        public final transient Map<String, Object> current;
        public StaleSaveException(Map<String, Object> current) {
            super("Your Dominion progress changed on another device. Loading the newer save.");
            this.current = current;
        }
    }

    static final int MAX_STATE_CHARS = 800_000;
    /** Chronicles asks for Rank 10; the test mode opens guilds sooner so they can be tried. */
    static final int GUILD_RANK = 3;
    static final long MAX_OPERATION_REPORT = 600;
    static final long MAX_INBOX = 200;
    /** Keep goods and Dominion-only goods that may be listed, beside Chronicles' tradeable kinds. */
    static final Set<String> DOMINION_GOODS = Set.of("timber", "stone", "ore", "fiber", "produce", "provisions", "ember", "frost",
            "storm", "glass", "alloy", "rations", "relic", "insight", "fittings", "living_mortar", "covenant_keystone", "aether_core", "heartwood_relic");
    /** In Dominion a Knight wears only what they crafted, so gear never changes hands. */
    static final Set<String> GEAR_KINDS = Set.of("WEAPON", "ARMOR", "HELMET", "BOOTS", "ACCESSORY", "RELIC");
    /** Chronicles ids the browser folds into Keep goods; listing them under the old id would duplicate stock. */
    static final Set<String> ALIASED = Set.of("pine_log", "copper_ore", "frost_crystal", "relic_shard", "flax");
    private static final long ART_TTL_MS = 5 * 60_000L;

    private final DominionRepository repo;
    private final CardDefinitionService cards;
    private Clock clock = Clock.systemUTC();
    private volatile Map<String, String> artCache = Map.of();
    private volatile long artCachedAt;

    @Autowired
    public DominionService(DominionRepository repo, CardDefinitionService cards) {
        this.repo = repo;
        this.cards = cards;
    }

    void setClock(Clock clock) { this.clock = clock; }

    private long now() { return clock.millis(); }

    // ── Save sync ────────────────────────────────────────────────────────────

    public Map<String, Object> snapshot(AccountUser user) {
        SaveDoc doc = repo.findSave(user.getId()).orElse(null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", displayName(user));
        out.put("serverNow", now());
        out.put("version", doc == null ? 0 : doc.version);
        out.put("state", doc == null || doc.state.isBlank() ? null : doc.state);
        out.put("inbox", doc == null ? List.of() : doc.inbox);
        out.put("guildId", doc == null ? "" : doc.guildId);
        return out;
    }

    /**
     * Stores the browser's save if it was based on the latest version. Inbox entries the
     * browser reports as applied are dropped, and the inventory snapshot is refreshed so
     * realm checks see what the player really holds.
     */
    public Map<String, Object> putSave(AccountUser user, String state, long baseVersion, List<String> applied) {
        if (state == null || state.isBlank()) throw new IllegalArgumentException("Nothing to save.");
        if (state.length() > MAX_STATE_CHARS) throw new IllegalArgumentException("That save is too large.");
        JsonNode root;
        try { root = InMemoryDominionRepository.JSON.readTree(state); }
        catch (Exception ex) { throw new IllegalArgumentException("That save could not be read."); }
        if (root == null || !root.isObject()) throw new IllegalArgumentException("That save could not be read.");
        String name = displayName(user);
        return repo.mutateSave(user.getId(), doc -> {
            if (doc.version > 0 && baseVersion != doc.version) throw new StaleSaveException(view(doc));
            doc.name = name;
            doc.state = state;
            doc.inv = inventoryOf(root);
            doc.rankXp = root.path("knight").path("rankXp").asLong(0);
            if (applied != null && !applied.isEmpty()) doc.inbox.removeIf(e -> applied.contains(e.id));
            doc.version++;
            doc.updatedAt = now();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("version", doc.version);
            out.put("inbox", doc.inbox);
            out.put("serverNow", now());
            return out;
        });
    }

    private static Map<String, Object> view(SaveDoc doc) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", doc.version);
        out.put("state", doc.state);
        out.put("inbox", doc.inbox);
        return out;
    }

    static Map<String, Long> inventoryOf(JsonNode root) {
        Map<String, Long> inv = new LinkedHashMap<>();
        root.path("inv").fields().forEachRemaining(e -> {
            long v = (long) Math.floor(e.getValue().asDouble(0) + 1e-9);
            if (v > 0) inv.put(e.getKey(), v);
        });
        return inv;
    }

    /** What a player can spend now: the last synced stock plus inbox changes not yet applied. */
    static long available(SaveDoc doc, String itemId) {
        long have = doc.inv.getOrDefault(itemId, 0L);
        for (InboxEntry e : doc.inbox) have += e.delta.getOrDefault(itemId, 0L);
        return have;
    }

    private void deliver(String userId, String note, Map<String, Long> delta) {
        repo.mutateSave(userId, doc -> {
            push(doc, note, delta);
            return null;
        });
    }

    private InboxEntry push(SaveDoc doc, String note, Map<String, Long> delta) {
        InboxEntry e = new InboxEntry("ib-" + UUID.randomUUID(), now(), note, delta);
        doc.inbox.add(e);
        while (doc.inbox.size() > MAX_INBOX) doc.inbox.remove(0);
        return e;
    }

    private static int rank(SaveDoc doc) {
        return ChroniclesContent.levelForXp(doc.rankXp);
    }

    private SaveDoc requireSynced(AccountUser user) {
        SaveDoc doc = repo.findSave(user.getId()).orElse(null);
        if (doc == null || doc.version == 0) throw new IllegalArgumentException("Sync your Dominion save before using the realm.");
        return doc;
    }

    // ── Guilds and the weekly Siege Operation ────────────────────────────────

    public Map<String, Object> guild(AccountUser user) {
        SaveDoc doc = repo.findSave(user.getId()).orElse(null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("guildRank", GUILD_RANK);
        out.put("rank", doc == null ? 1 : rank(doc));
        out.put("inbox", doc == null ? List.of() : doc.inbox);
        Guild g = doc == null || doc.guildId.isBlank() ? null : repo.findGuild(doc.guildId).orElse(null);
        if (g != null) {
            refreshOperation(g);
            out.put("guild", guildView(g, user.getId()));
        } else {
            out.put("guild", null);
        }
        return out;
    }

    public Map<String, Object> createGuild(AccountUser user, String name) {
        String clean = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        if (clean.length() < 3 || clean.length() > 24) throw new IllegalArgumentException("Guild names are 3 to 24 characters.");
        SaveDoc doc = requireSynced(user);
        if (!doc.guildId.isBlank()) throw new IllegalArgumentException("Leave your guild first.");
        if (rank(doc) < GUILD_RANK) throw new IllegalArgumentException("Founding a guild needs Knight Rank " + GUILD_RANK + ".");
        Guild g = new Guild();
        g.id = "dg-" + UUID.randomUUID().toString().substring(0, 12);
        g.name = clean;
        g.code = code();
        g.leaderId = user.getId();
        g.createdAt = now();
        g.members.put(user.getId(), member(user));
        refreshOperation(g);
        repo.createGuild(g);
        repo.mutateSave(user.getId(), d -> { d.guildId = g.id; return null; });
        return guild(user);
    }

    public Map<String, Object> joinGuild(AccountUser user, String code) {
        SaveDoc doc = requireSynced(user);
        if (!doc.guildId.isBlank()) throw new IllegalArgumentException("Leave your guild first.");
        if (rank(doc) < GUILD_RANK) throw new IllegalArgumentException("Joining a guild needs Knight Rank " + GUILD_RANK + ".");
        Guild found = repo.findGuildByCode(code == null ? "" : code.trim().toUpperCase(Locale.ROOT))
                .orElseThrow(() -> new IllegalArgumentException("No guild has that code."));
        repo.mutateGuild(found.id, g -> {
            if (g.members.size() >= ChroniclesContent.GUILD_MAX_MEMBERS) throw new IllegalArgumentException("That guild is full.");
            g.members.put(user.getId(), member(user));
            return null;
        });
        repo.mutateSave(user.getId(), d -> { d.guildId = found.id; return null; });
        return guild(user);
    }

    public Map<String, Object> leaveGuild(AccountUser user) {
        SaveDoc doc = requireSynced(user);
        if (doc.guildId.isBlank()) throw new IllegalArgumentException("You are not in a guild.");
        try {
            repo.mutateGuild(doc.guildId, g -> {
                g.members.remove(user.getId());
                if (user.getId().equals(g.leaderId) && !g.members.isEmpty()) g.leaderId = g.members.keySet().iterator().next();
                return null;
            });
        } catch (IllegalArgumentException gone) {
            // The guild was disbanded already; clearing the player's link is all that is left.
        }
        repo.mutateSave(user.getId(), d -> { d.guildId = ""; return null; });
        return guild(user);
    }

    /** Donating builds the guild's siege defenses (Chronicles' DONATION_POINTS). */
    public Map<String, Object> donate(AccountUser user, String itemId, int qty) {
        Integer points = ChroniclesContent.DONATION_POINTS.get(itemId);
        if (points == null) throw new IllegalArgumentException("The guild does not take that donation.");
        if (qty < 1 || qty > 999) throw new IllegalArgumentException("Donate between 1 and 999.");
        SaveDoc doc = requireSynced(user);
        if (doc.guildId.isBlank()) throw new IllegalArgumentException("Join a guild first.");
        repo.mutateSave(user.getId(), d -> {
            if (available(d, itemId) < qty) throw new IllegalArgumentException("You do not have " + qty + " of that.");
            push(d, "Donated to your guild", Map.of(itemId, (long) -qty));
            return null;
        });
        repo.mutateGuild(doc.guildId, g -> {
            g.defensePoints += (long) points * qty;
            return null;
        });
        return guild(user);
    }

    public Map<String, Object> reportOperation(AccountUser user, String reportId, String front, long damage) {
        if (!ChroniclesContent.FRONTS.containsKey(front)) throw new IllegalArgumentException("Unknown front.");
        if (reportId == null || reportId.isBlank()) throw new IllegalArgumentException("Missing report.");
        SaveDoc doc = requireSynced(user);
        if (doc.guildId.isBlank()) throw new IllegalArgumentException("Join a guild first.");
        long dealt = Math.max(0, Math.min(MAX_OPERATION_REPORT, damage));
        // The report id makes a return count once, however often the browser retries it.
        boolean fresh = repo.mutateSave(user.getId(), d -> d.reports.add(reportId));
        if (fresh) {
            repo.mutateGuild(doc.guildId, g -> {
                refreshOperation(g);
                Operation op = g.operation;
                long boosted = Math.round(dealt * (1 + 0.1 * defenseLevel(g)));
                op.damage += boosted;
                op.contributions.merge(user.getId(), boosted, Long::sum);
                op.fronts.merge(front, boosted, Long::sum);
                if (op.wonAt == 0 && op.damage >= op.maxHp) op.wonAt = now();
                return null;
            });
        }
        return guild(user);
    }

    public Map<String, Object> claimOperation(AccountUser user) {
        SaveDoc doc = requireSynced(user);
        if (doc.guildId.isBlank()) throw new IllegalArgumentException("Join a guild first.");
        Map<String, Long> reward = repo.mutateGuild(doc.guildId, g -> {
            refreshOperation(g);
            Operation op = g.operation;
            if (op.wonAt == 0) throw new IllegalArgumentException("The threat still stands.");
            if (op.contributions.getOrDefault(user.getId(), 0L) <= 0) throw new IllegalArgumentException("Fight in this week's operation to share its spoils.");
            if (Boolean.TRUE.equals(op.claimed.get(user.getId()))) throw new IllegalArgumentException("You already claimed this week's spoils.");
            op.claimed.put(user.getId(), true);
            String element = threat(op.threatId).element().name().toLowerCase(Locale.ROOT);
            Map<String, Long> out = new LinkedHashMap<>();
            out.put("crowns", 150L + 50L * defenseLevel(g));
            out.put("relic", 3L);
            out.put("ancient_relic", 1L);
            out.put("essence_" + element, 3L);
            return out;
        });
        deliver(user.getId(), "Siege Operation spoils", reward);
        return guild(user);
    }

    private void refreshOperation(Guild g) {
        String week = weekKey();
        if (week.equals(g.operation.week)) return;
        Operation op = new Operation();
        op.week = week;
        List<ChroniclesContent.Threat> threats = ChroniclesContent.THREATS;
        op.threatId = threats.get(Math.floorMod((g.id + week).hashCode(), threats.size())).id();
        op.maxHp = 1500 + 500L * Math.max(1, g.members.size());
        g.operation = op;
    }

    private static ChroniclesContent.Threat threat(String id) {
        return ChroniclesContent.THREATS.stream().filter(t -> t.id().equals(id)).findFirst().orElse(ChroniclesContent.THREATS.get(0));
    }

    static int defenseLevel(Guild g) {
        int level = 0;
        for (long t : ChroniclesContent.DEFENSE_THRESHOLDS) if (g.defensePoints >= t) level++;
        return level;
    }

    private String weekKey() {
        LocalDate d = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
        return d.get(IsoFields.WEEK_BASED_YEAR) + "-W" + d.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
    }

    private Map<String, Object> guildView(Guild g, String userId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", g.id);
        out.put("name", g.name);
        out.put("code", g.code);
        out.put("leader", userId.equals(g.leaderId));
        out.put("defensePoints", g.defensePoints);
        out.put("defenseLevel", defenseLevel(g));
        out.put("defenseThresholds", ChroniclesContent.DEFENSE_THRESHOLDS);
        List<Map<String, Object>> members = new ArrayList<>();
        g.members.forEach((id, m) -> members.add(Map.of("name", m.name, "you", id.equals(userId),
                "contribution", g.operation.contributions.getOrDefault(id, 0L))));
        out.put("members", members);
        Operation op = g.operation;
        ChroniclesContent.Threat t = threat(op.threatId);
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("week", op.week);
        o.put("threat", t.name());
        o.put("element", t.element().name());
        o.put("blurb", t.blurb());
        o.put("maxHp", op.maxHp);
        o.put("damage", op.damage);
        o.put("won", op.wonAt > 0);
        o.put("fronts", op.fronts);
        o.put("yours", op.contributions.getOrDefault(userId, 0L));
        o.put("claimed", Boolean.TRUE.equals(op.claimed.get(userId)));
        out.put("operation", o);
        return out;
    }

    private Member member(AccountUser user) {
        Member m = new Member();
        m.name = displayName(user);
        m.joinedAt = now();
        return m;
    }

    private static String code() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder sb = new StringBuilder();
        java.util.concurrent.ThreadLocalRandom r = java.util.concurrent.ThreadLocalRandom.current();
        for (int i = 0; i < 6; i++) sb.append(alphabet.charAt(r.nextInt(alphabet.length())));
        return sb.toString();
    }

    // ── Marketplace (Crowns, 5% fee) ─────────────────────────────────────────

    static boolean tradeable(String itemId) {
        if (itemId == null || itemId.isBlank() || ALIASED.contains(itemId)) return false;
        if (DOMINION_GOODS.contains(itemId)) return true;
        ChroniclesContent.Item item = ChroniclesContent.ITEMS.get(itemId);
        return item != null && ChroniclesContent.TRADEABLE.contains(item.kind()) && !GEAR_KINDS.contains(item.kind().name());
    }

    public Map<String, Object> market(AccountUser user) {
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> open = new ArrayList<>();
        for (Listing l : repo.openListings(200)) open.add(listingView(l, user.getId()));
        open.sort((a, b) -> Long.compare((Long) b.get("createdAt"), (Long) a.get("createdAt")));
        out.put("open", open);
        List<Map<String, Object>> mine = new ArrayList<>();
        for (Listing l : repo.listingsBySeller(user.getId())) if (!"cancelled".equals(l.status)) mine.add(listingView(l, user.getId()));
        out.put("mine", mine);
        out.put("fee", ChroniclesContent.MARKET_FEE);
        out.put("maxListings", ChroniclesContent.MARKET_MAX_LISTINGS);
        SaveDoc doc = repo.findSave(user.getId()).orElse(null);
        out.put("inbox", doc == null ? List.of() : doc.inbox);
        return out;
    }

    public Map<String, Object> list(AccountUser user, String itemId, int qty, long price) {
        if (!tradeable(itemId)) throw new IllegalArgumentException("That cannot be traded.");
        if (qty < 1 || qty > 999) throw new IllegalArgumentException("List between 1 and 999.");
        if (price < 1 || price > ChroniclesContent.MARKET_MAX_PRICE) throw new IllegalArgumentException("Set a price between 1 and " + ChroniclesContent.MARKET_MAX_PRICE + " Crowns.");
        requireSynced(user);
        long active = repo.listingsBySeller(user.getId()).stream().filter(l -> "open".equals(l.status)).count();
        if (active >= ChroniclesContent.MARKET_MAX_LISTINGS) throw new IllegalArgumentException("You have the most listings allowed (" + ChroniclesContent.MARKET_MAX_LISTINGS + ").");
        Listing l = new Listing();
        l.id = "dl-" + UUID.randomUUID();
        l.sellerId = user.getId();
        l.sellerName = displayName(user);
        l.itemId = itemId;
        l.qty = qty;
        l.price = price;
        l.createdAt = now();
        // Escrow first: the goods leave the seller's stock before the listing appears.
        repo.mutateSave(user.getId(), d -> {
            if (available(d, itemId) < qty) throw new IllegalArgumentException("You do not have " + qty + " of that.");
            push(d, "Listed on the market", Map.of(itemId, (long) -qty));
            return null;
        });
        repo.createListing(l);
        return market(user);
    }

    public Map<String, Object> buy(AccountUser user, String listingId) {
        requireSynced(user);
        Listing sold = repo.mutateListing(listingId, l -> {
            if (!"open".equals(l.status)) throw new IllegalArgumentException("That listing is no longer open.");
            if (l.sellerId.equals(user.getId())) throw new IllegalArgumentException("That is your own listing.");
            return l;
        });
        repo.mutateSave(user.getId(), d -> {
            if (available(d, "crowns") < sold.price) throw new IllegalArgumentException("You need " + sold.price + " Crowns.");
            return null;
        });
        Listing closed = repo.mutateListing(listingId, l -> {
            if (!"open".equals(l.status)) throw new IllegalArgumentException("That listing is no longer open.");
            l.status = "sold";
            l.buyerId = user.getId();
            l.soldAt = now();
            l.claimed = true;
            return l;
        });
        Map<String, Long> got = new LinkedHashMap<>();
        got.put("crowns", -closed.price);
        got.put(closed.itemId, got.getOrDefault(closed.itemId, 0L) + closed.qty);
        deliver(user.getId(), "Bought on the market", got);
        long proceeds = Math.max(0, Math.round(closed.price * (1 - ChroniclesContent.MARKET_FEE)));
        deliver(closed.sellerId, "Market sale", Map.of("crowns", proceeds));
        return market(user);
    }

    public Map<String, Object> cancel(AccountUser user, String listingId) {
        Listing l = repo.mutateListing(listingId, x -> {
            if (!x.sellerId.equals(user.getId())) throw new IllegalArgumentException("That is not your listing.");
            if (!"open".equals(x.status)) throw new IllegalArgumentException("That listing is no longer open.");
            x.status = "cancelled";
            return x;
        });
        deliver(user.getId(), "Listing cancelled", Map.of(l.itemId, (long) l.qty));
        return market(user);
    }

    private static Map<String, Object> listingView(Listing l, String userId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", l.id);
        out.put("itemId", l.itemId);
        out.put("qty", l.qty);
        out.put("price", l.price);
        out.put("seller", l.sellerName);
        out.put("mine", l.sellerId.equals(userId));
        out.put("status", l.status);
        out.put("createdAt", l.createdAt);
        return out;
    }

    // ── Art ──────────────────────────────────────────────────────────────────

    /** Live card art by species id, so tamed Siegelings show their real portraits. */
    public Map<String, String> art() {
        long t = System.currentTimeMillis();
        if (cards == null) return Map.of();
        if (t - artCachedAt < ART_TTL_MS && !artCache.isEmpty()) return artCache;
        try {
            Map<String, String> map = new HashMap<>();
            for (Card card : cards.getDeckBuilderCatalog()) {
                if (card.getId() != null && card.getCardArtUrl() != null && !card.getCardArtUrl().isBlank()) {
                    map.put(card.getId().toLowerCase(Locale.ROOT), card.getCardArtUrl());
                }
            }
            // Every SiegeKnight can be met and won over as a mentor. The tier (squire, knight, raider,
            // lord) sets how hard that is; full-card art can't be cut out, so it is flagged and the
            // client frames it as a card instead. Keys are namespaced so they never meet a species id.
            for (com.sieglings.model.TrainerCard k : cards.getTrainerOptions()) {
                if (k.getId() == null || k.getCardArtUrl() == null || k.getCardArtUrl().isBlank()) continue;
                String id = k.getId().toLowerCase(Locale.ROOT);
                map.put("knight:" + id, k.getCardArtUrl());
                map.put("knight-name:" + id, k.getName() == null ? id : k.getName());
                map.put("knight-el:" + id, k.getElement() == null ? "NEUTRAL" : k.getElement().name());
                map.put("knight-tier:" + id, k.getTier() == null ? "SiegeKnight" : k.getTier());
                if (!"OVERLAY".equalsIgnoreCase(String.valueOf(k.getCardArtMode()))) map.put("knight-full:" + id, "1");
            }
            artCache = map;
            artCachedAt = t;
        } catch (RuntimeException ignored) {
            // Art is decoration; a catalog hiccup must not block the page.
        }
        return artCache;
    }

    private static String displayName(AccountUser user) {
        String n = user.getDisplayName();
        if (n == null || n.isBlank()) n = user.getEmail() == null ? "Knight" : user.getEmail().split("@")[0];
        return n.length() > 24 ? n.substring(0, 24) : n;
    }
}
