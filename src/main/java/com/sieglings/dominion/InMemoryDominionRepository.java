package com.sieglings.dominion;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.chronicles.ChroniclesRealm.Guild;
import com.sieglings.chronicles.ChroniclesRealm.Listing;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

/**
 * Process-local storage, used by tests and by a local server without Firestore credentials.
 * Every document is round-tripped through JSON and bodies run on copies that are only kept
 * when they return normally, so it behaves like a Firestore transaction.
 */
public class InMemoryDominionRepository implements DominionRepository {
    static final ObjectMapper JSON = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private final Map<String, String> saves = new LinkedHashMap<>();
    private final Map<String, String> guilds = new LinkedHashMap<>();
    private final Map<String, String> listings = new LinkedHashMap<>();

    @Override
    public synchronized Optional<SaveDoc> findSave(String userId) {
        String raw = saves.get(userId);
        return raw == null ? Optional.empty() : Optional.of(read(raw, SaveDoc.class));
    }

    @Override
    public synchronized <T> T mutateSave(String userId, Function<SaveDoc, T> body) {
        SaveDoc doc = findSave(userId).orElseGet(() -> {
            SaveDoc fresh = new SaveDoc();
            fresh.userId = userId;
            return fresh;
        });
        T out = body.apply(doc);
        saves.put(userId, write(doc));
        return out;
    }

    @Override
    public synchronized Optional<Guild> findGuild(String id) {
        String raw = guilds.get(id);
        return raw == null ? Optional.empty() : Optional.of(read(raw, Guild.class));
    }

    @Override
    public synchronized Optional<Guild> findGuildByCode(String code) {
        for (String raw : guilds.values()) {
            Guild g = read(raw, Guild.class);
            if (g.code.equals(code)) return Optional.of(g);
        }
        return Optional.empty();
    }

    @Override
    public synchronized Guild createGuild(Guild guild) {
        if (guilds.containsKey(guild.id)) throw new IllegalArgumentException("That guild already exists.");
        guilds.put(guild.id, write(guild));
        return guild;
    }

    @Override
    public synchronized <T> T mutateGuild(String id, Function<Guild, T> body) {
        Guild g = findGuild(id).orElseThrow(() -> new IllegalArgumentException("That guild no longer exists."));
        T out = body.apply(g);
        if (g.members.isEmpty()) guilds.remove(id);
        else guilds.put(id, write(g));
        return out;
    }

    @Override
    public synchronized Listing createListing(Listing listing) {
        listings.put(listing.id, write(listing));
        return listing;
    }

    @Override
    public synchronized List<Listing> openListings(int limit) {
        List<Listing> out = new ArrayList<>();
        for (String raw : listings.values()) {
            Listing l = read(raw, Listing.class);
            if ("open".equals(l.status) && out.size() < limit) out.add(l);
        }
        return out;
    }

    @Override
    public synchronized List<Listing> listingsBySeller(String sellerId) {
        List<Listing> out = new ArrayList<>();
        for (String raw : listings.values()) {
            Listing l = read(raw, Listing.class);
            if (l.sellerId.equals(sellerId)) out.add(l);
        }
        return out;
    }

    @Override
    public synchronized <T> T mutateListing(String id, Function<Listing, T> body) {
        String raw = listings.get(id);
        if (raw == null) throw new IllegalArgumentException("That listing is gone.");
        Listing l = read(raw, Listing.class);
        T out = body.apply(l);
        listings.put(id, write(l));
        return out;
    }

    static String write(Object value) {
        try { return JSON.writeValueAsString(value); }
        catch (Exception ex) { throw new IllegalStateException("Unable to encode a Dominion document.", ex); }
    }

    static <T> T read(String raw, Class<T> type) {
        try { return JSON.readValue(raw, type); }
        catch (Exception ex) { throw new IllegalStateException("Unable to decode a Dominion document.", ex); }
    }
}
