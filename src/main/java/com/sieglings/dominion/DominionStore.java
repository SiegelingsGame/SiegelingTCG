package com.sieglings.dominion;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.sieglings.chronicles.ChroniclesRealm.Guild;
import com.sieglings.chronicles.ChroniclesRealm.Listing;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
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
 * Firestore-backed Dominion storage (collections dominionSaves, dominionGuilds and
 * dominionMarket, kept apart from Chronicles so the test mode can be dropped cleanly).
 * Each document holds its JSON in a "state" field with query fields beside it, like the
 * Chronicles realm. Without Firestore credentials (local dev) it falls back to memory.
 */
@Component
public class DominionStore implements DominionRepository {
    private static final long OP_TIMEOUT_SECONDS = 10;

    private final FirestoreUserDataClient client;
    private final InMemoryDominionRepository fallback = new InMemoryDominionRepository();

    @Value("${app.user-data.collection-dominion-saves:dominionSaves}")
    private String saves = "dominionSaves";

    @Value("${app.user-data.collection-dominion-guilds:dominionGuilds}")
    private String guilds = "dominionGuilds";

    @Value("${app.user-data.collection-dominion-market:dominionMarket}")
    private String market = "dominionMarket";

    public DominionStore(FirestoreUserDataClient client) {
        this.client = client;
    }

    private boolean live() {
        return client != null && client.isAvailable();
    }

    @Override
    public Optional<SaveDoc> findSave(String userId) {
        if (!live()) return fallback.findSave(userId);
        try {
            DocumentSnapshot snap = db().collection(saves).document(userId).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return snap.exists() ? Optional.of(decode(snap, SaveDoc.class)) : Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load the Dominion save.", ex);
        }
    }

    @Override
    public <T> T mutateSave(String userId, Function<SaveDoc, T> body) {
        if (!live()) return fallback.mutateSave(userId, body);
        return transaction(tx -> {
            DocumentReference ref = db().collection(saves).document(userId);
            DocumentSnapshot snap = tx.get(ref).get();
            SaveDoc doc = snap.exists() ? decode(snap, SaveDoc.class) : new SaveDoc();
            doc.userId = userId;
            T out = body.apply(doc);
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("version", doc.version);
            payload.put("guildId", doc.guildId);
            payload.put("state", InMemoryDominionRepository.write(doc));
            payload.put("updatedAt", Timestamp.now());
            tx.set(ref, payload);
            return out;
        });
    }

    @Override
    public Optional<Guild> findGuild(String id) {
        if (!live()) return fallback.findGuild(id);
        if (id == null || id.isBlank()) return Optional.empty();
        try {
            DocumentSnapshot snap = db().collection(guilds).document(id).get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!snap.exists()) return Optional.empty();
            Guild g = decode(snap, Guild.class);
            g.id = snap.getId();
            return Optional.of(g);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load the guild.", ex);
        }
    }

    @Override
    public Optional<Guild> findGuildByCode(String code) {
        if (!live()) return fallback.findGuildByCode(code);
        try {
            for (QueryDocumentSnapshot snap : db().collection(guilds).whereEqualTo("code", code).limit(1)
                    .get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS).getDocuments()) {
                Guild g = decode(snap, Guild.class);
                g.id = snap.getId();
                return Optional.of(g);
            }
            return Optional.empty();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to look up the guild.", ex);
        }
    }

    @Override
    public Guild createGuild(Guild guild) {
        if (!live()) return fallback.createGuild(guild);
        return transaction(tx -> {
            DocumentReference ref = db().collection(guilds).document(guild.id);
            if (tx.get(ref).get().exists()) throw new IllegalArgumentException("That guild already exists.");
            tx.set(ref, Map.of("code", guild.code, "state", InMemoryDominionRepository.write(guild), "updatedAt", Timestamp.now()));
            return guild;
        });
    }

    @Override
    public <T> T mutateGuild(String id, Function<Guild, T> body) {
        if (!live()) return fallback.mutateGuild(id, body);
        return transaction(tx -> {
            DocumentReference ref = db().collection(guilds).document(id);
            DocumentSnapshot snap = tx.get(ref).get();
            if (!snap.exists()) throw new IllegalArgumentException("That guild no longer exists.");
            Guild g = decode(snap, Guild.class);
            g.id = id;
            T out = body.apply(g);
            if (g.members.isEmpty()) tx.delete(ref);
            else tx.set(ref, Map.of("code", g.code, "state", InMemoryDominionRepository.write(g), "updatedAt", Timestamp.now()));
            return out;
        });
    }

    @Override
    public Listing createListing(Listing listing) {
        if (!live()) return fallback.createListing(listing);
        try {
            db().collection(market).document(listing.id).set(listingPayload(listing)).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return listing;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to post the listing.", ex);
        }
    }

    @Override
    public List<Listing> openListings(int limit) {
        if (!live()) return fallback.openListings(limit);
        return query("status", "open", limit);
    }

    @Override
    public List<Listing> listingsBySeller(String sellerId) {
        if (!live()) return fallback.listingsBySeller(sellerId);
        return query("sellerId", sellerId, 200);
    }

    @Override
    public <T> T mutateListing(String id, Function<Listing, T> body) {
        if (!live()) return fallback.mutateListing(id, body);
        return transaction(tx -> {
            DocumentReference ref = db().collection(market).document(id);
            DocumentSnapshot snap = tx.get(ref).get();
            if (!snap.exists()) throw new IllegalArgumentException("That listing is gone.");
            Listing l = decode(snap, Listing.class);
            l.id = id;
            T out = body.apply(l);
            tx.set(ref, listingPayload(l));
            return out;
        });
    }

    private List<Listing> query(String field, String value, int limit) {
        try {
            List<Listing> out = new ArrayList<>();
            for (QueryDocumentSnapshot snap : db().collection(market).whereEqualTo(field, value).limit(limit)
                    .get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS).getDocuments()) {
                Listing l = decode(snap, Listing.class);
                l.id = snap.getId();
                out.add(l);
            }
            return out;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to read the Dominion market.", ex);
        }
    }

    private static Map<String, Object> listingPayload(Listing l) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("status", l.status);
        payload.put("sellerId", l.sellerId);
        payload.put("state", InMemoryDominionRepository.write(l));
        payload.put("updatedAt", Timestamp.now());
        return payload;
    }

    private static <T> T decode(DocumentSnapshot snap, Class<T> type) {
        String raw = snap.getString("state");
        if (raw == null || raw.isBlank()) throw new IllegalStateException("Empty Dominion document.");
        return InMemoryDominionRepository.read(raw, type);
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
            throw new IllegalStateException("Dominion transaction failed.", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted during a Dominion transaction.", ex);
        } catch (Exception ex) {
            throw new IllegalStateException("Dominion transaction failed.", ex);
        }
    }

    private Firestore db() {
        return client.requireFirestore();
    }
}
