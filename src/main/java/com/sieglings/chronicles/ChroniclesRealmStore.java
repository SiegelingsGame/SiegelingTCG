package com.sieglings.chronicles;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.Transaction;
import com.sieglings.chronicles.ChroniclesRealm.Guild;
import com.sieglings.chronicles.ChroniclesRealm.Listing;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * Firestore persistence for guilds and marketplace listings. Bodies are JSON like a
 * knight's save; the fields a query filters on ({@code code}, {@code status},
 * {@code sellerId}) are stored beside the JSON so equality-only queries serve them
 * without composite indexes. Every change is a transaction, because several
 * knights write the same document.
 */
@Component
public class ChroniclesRealmStore {
    private static final long OP_TIMEOUT_SECONDS = 10;

    /**
     * Reads and staged writes for one Firestore transaction. Every read has to
     * happen before any write — the transaction API rejects a read that follows
     * a write. Callers read the documents they need, then stage writes; the
     * surrounding commit flushes them.
     */
    public interface RealmBatch {
        /** The listing, or null when that id is not posted. */
        ChroniclesRealm.Listing readListing(String id);

        void writeListing(ChroniclesRealm.Listing listing);

        /** The guild, or null when that id is not founded. */
        ChroniclesRealm.Guild readGuild(String id);

        void writeGuild(ChroniclesRealm.Guild guild);
    }

    @Autowired
    private FirestoreUserDataClient client;

    @Value("${app.user-data.collection-chronicles-guilds:chroniclesGuilds}")
    private String guilds = "chroniclesGuilds";

    @Value("${app.user-data.collection-chronicles-market:chroniclesMarket}")
    private String market = "chroniclesMarket";

    // ── guilds ───────────────────────────────────────────────────────────────

    public Optional<Guild> findGuild(String id) {
        if (id == null || id.isBlank()) return Optional.empty();
        try {
            DocumentSnapshot snap = db().collection(guilds).document(id).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return snap.exists() ? Optional.of(guildFrom(snap)) : Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load the guild.", ex);
        }
    }

    public Optional<Guild> findGuildByCode(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        try {
            for (QueryDocumentSnapshot snap : db().collection(guilds).whereEqualTo("code", code).limit(1)
                    .get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS).getDocuments()) {
                return Optional.of(guildFrom(snap));
            }
            return Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to look up the guild.", ex);
        }
    }

    /** Creates a guild; fails if its id is already taken. */
    public Guild createGuild(Guild guild) {
        return transaction(tx -> {
            DocumentReference ref = db().collection(guilds).document(guild.id);
            if (tx.get(ref).get().exists()) throw new IllegalArgumentException("That guild already exists.");
            tx.set(ref, guildPayload(guild));
            return guild;
        });
    }

    /** Reads, changes and writes a guild atomically; the body may throw to abort. */
    public <T> T mutateGuild(String id, Function<Guild, T> body) {
        return transaction(tx -> {
            DocumentReference ref = db().collection(guilds).document(id);
            DocumentSnapshot snap = tx.get(ref).get();
            if (!snap.exists()) throw new IllegalArgumentException("That guild no longer exists.");
            Guild guild = guildFrom(snap);
            T result = body.apply(guild);
            if (guild.members.isEmpty()) tx.delete(ref);
            else tx.set(ref, guildPayload(guild));
            return result;
        });
    }

    // ── marketplace ──────────────────────────────────────────────────────────

    public Optional<Listing> findListing(String id) {
        if (id == null || id.isBlank()) return Optional.empty();
        try {
            DocumentSnapshot snap = db().collection(market).document(id).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return snap.exists() ? Optional.of(listingFrom(snap)) : Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load the listing.", ex);
        }
    }

    public Listing createListing(Listing listing) {
        try {
            db().collection(market).document(listing.id).set(listingPayload(listing)).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return listing;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to post the listing.", ex);
        }
    }

    public List<Listing> openListings(int limit) {
        return query("status", "open", limit);
    }

    public List<Listing> listingsBySeller(String sellerId) {
        return query("sellerId", sellerId, 200);
    }

    public <T> T mutateListing(String id, Function<Listing, T> body) {
        return transaction(tx -> {
            DocumentReference ref = db().collection(market).document(id);
            DocumentSnapshot snap = tx.get(ref).get();
            if (!snap.exists()) throw new IllegalArgumentException("That listing is gone.");
            Listing listing = listingFrom(snap);
            T result = body.apply(listing);
            tx.set(ref, listingPayload(listing));
            return result;
        });
    }

    // ── plumbing ─────────────────────────────────────────────────────────────

    private List<Listing> query(String field, String value, int limit) {
        try {
            List<Listing> out = new ArrayList<>();
            for (QueryDocumentSnapshot snap : db().collection(market).whereEqualTo(field, value).limit(limit)
                    .get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS).getDocuments()) {
                out.add(listingFrom(snap));
            }
            return out;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to read the marketplace.", ex);
        }
    }

    private interface TxBody<T> {
        T run(com.google.cloud.firestore.Transaction tx) throws Exception;
    }

    private <T> T transaction(TxBody<T> body) {
        try {
            return db().runTransaction(body::run).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (ExecutionException ex) {
            // The body's own refusal ("that listing is gone") is the useful message.
            Throwable cause = ex.getCause();
            if (cause instanceof IllegalArgumentException illegal) throw illegal;
            if (cause instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException("Realm transaction failed.", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted during a realm transaction.", ex);
        } catch (Exception ex) {
            throw new IllegalStateException("Realm transaction failed.", ex);
        }
    }

    private Firestore db() {
        return client.requireFirestore();
    }

    /** Reads, lets {@code work} stage updates, then writes. Reads stay ahead of writes. */
    void apply(Transaction tx, java.util.function.Consumer<RealmBatch> work) {
        FirestoreRealmBatch batch = new FirestoreRealmBatch(tx);
        if (work != null) work.accept(batch);
        batch.flush();
    }

    private final class FirestoreRealmBatch implements RealmBatch {
        private final Transaction tx;
        private final Map<String, Listing> listingReads = new LinkedHashMap<>();
        private final Map<String, Guild> guildReads = new LinkedHashMap<>();
        private final Map<String, Listing> listingWrites = new LinkedHashMap<>();
        private final Map<String, Guild> guildWrites = new LinkedHashMap<>();
        private boolean writing;

        private FirestoreRealmBatch(Transaction tx) {
            this.tx = tx;
        }

        @Override
        public Listing readListing(String id) {
            requireRead();
            if (listingReads.containsKey(id)) return listingReads.get(id);
            try {
                DocumentSnapshot snap = tx.get(db().collection(market).document(id)).get();
                Listing listing = snap.exists() ? listingFrom(snap) : null;
                listingReads.put(id, listing);
                return listing;
            } catch (Exception ex) {
                throw new IllegalStateException("Unable to read the listing.", ex);
            }
        }

        @Override
        public void writeListing(Listing listing) {
            writing = true;
            listingWrites.put(listing.id, listing);
        }

        @Override
        public Guild readGuild(String id) {
            requireRead();
            if (guildReads.containsKey(id)) return guildReads.get(id);
            try {
                DocumentSnapshot snap = tx.get(db().collection(guilds).document(id)).get();
                Guild guild = snap.exists() ? guildFrom(snap) : null;
                guildReads.put(id, guild);
                return guild;
            } catch (Exception ex) {
                throw new IllegalStateException("Unable to read the guild.", ex);
            }
        }

        @Override
        public void writeGuild(Guild guild) {
            writing = true;
            guildWrites.put(guild.id, guild);
        }

        private void requireRead() {
            if (writing) throw new IllegalStateException("Realm batch must read every document before it writes.");
        }

        private void flush() {
            listingWrites.forEach((id, listing) -> tx.set(db().collection(market).document(id), listingPayload(listing)));
            guildWrites.forEach((id, guild) -> {
                DocumentReference ref = db().collection(guilds).document(id);
                if (guild.members == null || guild.members.isEmpty()) tx.delete(ref);
                else tx.set(ref, guildPayload(guild));
            });
        }
    }

    private static Map<String, Object> guildPayload(Guild guild) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("code", guild.code);
            payload.put("state", ChroniclesStore.JSON.writeValueAsString(guild));
            payload.put("updatedAt", Timestamp.now());
            return payload;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to encode the guild.", ex);
        }
    }

    private static Guild guildFrom(DocumentSnapshot snap) {
        try {
            Guild guild = ChroniclesStore.JSON.readValue(snap.getString("state"), Guild.class);
            guild.id = snap.getId();
            return guild;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to decode the guild.", ex);
        }
    }

    private static Map<String, Object> listingPayload(Listing listing) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("status", listing.status);
            payload.put("sellerId", listing.sellerId);
            payload.put("state", ChroniclesStore.JSON.writeValueAsString(listing));
            payload.put("updatedAt", Timestamp.now());
            return payload;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to encode the listing.", ex);
        }
    }

    private static Listing listingFrom(DocumentSnapshot snap) {
        try {
            Listing listing = ChroniclesStore.JSON.readValue(snap.getString("state"), Listing.class);
            listing.id = snap.getId();
            return listing;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to decode the listing.", ex);
        }
    }
}
