package com.sieglings.dominion;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.sieglings.chronicles.ChroniclesRealm.Guild;
import com.sieglings.chronicles.ChroniclesRealm.Listing;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

/**
 * Storage for the Dominion test mode. A player's save is opaque JSON written by the browser
 * engine; beside it sit the server-owned pieces the realm needs: an inventory snapshot taken
 * at each sync (to check trades and donations against), the inbox of realm deltas the
 * browser has not applied yet, and the ids of operation reports already counted. Guild and
 * listing documents reuse the Chronicles realm shapes.
 */
public interface DominionRepository {

    @JsonIgnoreProperties(ignoreUnknown = true)
    class SaveDoc {
        public String userId = "";
        public String name = "";
        public long version;
        /** The browser engine's save, stored verbatim. */
        public String state = "";
        public Map<String, Long> inv = new LinkedHashMap<>();
        public long rankXp;
        public String guildId = "";
        public List<InboxEntry> inbox = new ArrayList<>();
        public Set<String> reports = new LinkedHashSet<>();
        public long updatedAt;
    }

    /** A realm change for the browser to apply exactly once (it records the id it applied). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    class InboxEntry {
        public String id = "";
        public long at;
        public String note = "";
        public Map<String, Long> delta = new LinkedHashMap<>();

        public InboxEntry() { }

        public InboxEntry(String id, long at, String note, Map<String, Long> delta) {
            this.id = id;
            this.at = at;
            this.note = note;
            this.delta = new LinkedHashMap<>(delta);
        }
    }

    Optional<SaveDoc> findSave(String userId);

    /** Reads, changes and writes a save atomically, creating it if absent; the body may throw to abort. */
    <T> T mutateSave(String userId, Function<SaveDoc, T> body);

    Optional<Guild> findGuild(String id);

    Optional<Guild> findGuildByCode(String code);

    Guild createGuild(Guild guild);

    <T> T mutateGuild(String id, Function<Guild, T> body);

    Listing createListing(Listing listing);

    List<Listing> openListings(int limit);

    List<Listing> listingsBySeller(String sellerId);

    <T> T mutateListing(String id, Function<Listing, T> body);
}
