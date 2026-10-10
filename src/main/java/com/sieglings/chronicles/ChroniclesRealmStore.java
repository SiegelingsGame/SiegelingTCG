package com.sieglings.chronicles;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
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
