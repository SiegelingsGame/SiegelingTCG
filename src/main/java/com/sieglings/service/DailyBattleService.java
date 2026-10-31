package com.sieglings.service;

import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.persistence.firestore.FirestoreUserDataClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Daily Battle: one Arena opponent a day, rotating through a list the card
 * dashboard edits (seven to start, one per weekday). Each entry names the
 * opponent's SiegeKnight and preset deck, and the card it is known for; when
 * no card is named, the deck's strongest Siegeling (highest rarity, then
 * health) is featured. The rotation is by UTC day, so every player meets the
 * same opponent on the same day.
 *
 * <p>The list lives in Firestore ({@code eventConfig/dailyBattles}); without
 * Firestore (local dev) edits are kept in memory and the defaults stand in.</p>
 */
@Service
public class DailyBattleService {

    private static final Logger log = LoggerFactory.getLogger(DailyBattleService.class);

    public static final int DEFAULT_COUNT = 7;
    public static final int MAX_COUNT = 31;
    private static final String COLLECTION = "eventConfig";
    private static final String DOCUMENT = "dailyBattles";
    private static final long CACHE_TTL_MS = 60_000L;
    private static final long OP_TIMEOUT_SECONDS = 8;

    public record Entry(String id, String title, String opponentName, String trainerId, String deckId,
                        String featuredCardId, String blurb) {}

    private final CardDefinitionService cardDefs;
    private final FirestoreUserDataClient client;

    private volatile List<Entry> cached;
    private volatile long cachedAt;
    private volatile List<Entry> memory;

    @Autowired
    public DailyBattleService(CardDefinitionService cardDefs, @Autowired(required = false) FirestoreUserDataClient client) {
        this.cardDefs = cardDefs;
        this.client = client;
    }

    public boolean isPersistent() {
        return client != null && client.isAvailable();
    }

    /** The configured rotation, or the defaults when nothing has been saved. */
    public List<Entry> list() {
        List<Entry> hit = cached;
        if (hit != null && System.currentTimeMillis() - cachedAt < CACHE_TTL_MS) return hit;
        List<Entry> loaded = load();
        List<Entry> out = loaded == null || loaded.isEmpty() ? defaults() : loaded;
        cached = out;
        cachedAt = System.currentTimeMillis();
        return out;
    }

    /** Which entry a UTC day plays: the rotation simply walks the list. */
    public static int indexFor(LocalDate day, int size) {
        return size <= 0 ? 0 : (int) Math.floorMod(day.toEpochDay(), (long) size);
    }

    public Entry today(Instant now) {
        List<Entry> all = list();
        return all.get(indexFor(now.atZone(ZoneOffset.UTC).toLocalDate(), all.size()));
    }

    public Optional<Entry> find(String id) {
        return list().stream().filter(e -> e.id().equals(id)).findFirst();
    }

    /** Validates and stores a new rotation (the dashboard's save). */
    public List<Entry> save(List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new IllegalArgumentException("Add at least one Daily Battle.");
        }
        if (rows.size() > MAX_COUNT) {
            throw new IllegalArgumentException("A Daily Battle rotation holds at most " + MAX_COUNT + " battles.");
        }
        List<Entry> entries = new ArrayList<>();
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> r = rows.get(i);
            String id = text(r.get("id"));
            if (id == null) id = "daily-" + (i + 1);
            if (!ids.add(id)) throw new IllegalArgumentException("Daily Battle ids must be unique (" + id + ").");
            String deckId = text(r.get("deckId"));
            String trainerId = text(r.get("trainerId"));
            if (deckId == null || cardDefs.getDeckOptions().stream().noneMatch(d -> d.id().equals(deckId))) {
                throw new IllegalArgumentException("Battle " + (i + 1) + ": choose a preset deck.");
            }
            if (trainerId == null || cardDefs.getActiveTrainerById(trainerId).isEmpty()) {
                throw new IllegalArgumentException("Battle " + (i + 1) + ": choose an active SiegeKnight.");
            }
            String featured = text(r.get("featuredCardId"));
            if (featured != null && cardDefs.buildDeckById(deckId).stream().noneMatch(c -> featured.equals(c.getId()))) {
                throw new IllegalArgumentException("Battle " + (i + 1) + ": the featured card must be in its deck.");
            }
            String opponent = text(r.get("opponentName"));
            entries.add(new Entry(id, limit(text(r.get("title")), 60), limit(opponent, 40), trainerId, deckId,
                    featured, limit(text(r.get("blurb")), 200)));
        }
        persist(entries);
        cached = List.copyOf(entries);
        cachedAt = System.currentTimeMillis();
        return cached;
    }

    /** One entry as the Events page and the dashboard show it, with its knight, deck and featured card resolved. */
    public Map<String, Object> describe(Entry e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", e.id());
        Optional<TrainerCard> trainer = cardDefs.getActiveTrainerById(e.trainerId());
        String opponent = e.opponentName() != null ? e.opponentName() : trainer.map(Card::getName).orElse("Daily Rival");
        out.put("opponentName", opponent);
        out.put("blurb", e.blurb());
        // What the dashboard stored, as opposed to what is shown: blank fields fall back.
        Map<String, Object> stored = new LinkedHashMap<>();
        stored.put("opponentName", e.opponentName());
        stored.put("title", e.title());
        stored.put("featuredCardId", e.featuredCardId());
        out.put("stored", stored);
        out.put("trainerId", e.trainerId());
        out.put("deckId", e.deckId());
        trainer.ifPresent(t -> {
            Map<String, Object> k = new LinkedHashMap<>();
            k.put("id", t.getId());
            k.put("name", t.getName());
            k.put("element", t.getElement() == null ? null : t.getElement().name());
            k.put("artUrl", t.getCardArtUrl());
            out.put("knight", k);
        });
        cardDefs.getDeckOptions().stream().filter(d -> d.id().equals(e.deckId())).findFirst().ifPresent(d -> {
            out.put("deckName", d.name());
            out.put("deckElements", d.elements().stream().map(Enum::name).toList());
            if (e.title() == null) out.put("title", d.name());
        });
        if (e.title() != null) out.put("title", e.title());
        featuredCard(e).ifPresent(c -> {
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("id", c.getId());
            f.put("name", c.getName());
            f.put("element", c.getElement() == null ? null : c.getElement().name());
            f.put("rarity", c.getRarity() == null ? null : c.getRarity().name());
            f.put("artUrl", c.getCardArtUrl());
            if (c instanceof SieglingCard s) f.put("health", s.getHealth());
            out.put("featured", f);
        });
        return out;
    }

    /** Today's battle for the Events page: the entry plus when the day turns over. */
    public Map<String, Object> todayFeed(Instant now) {
        List<Entry> all = list();
        LocalDate day = now.atZone(ZoneOffset.UTC).toLocalDate();
        int idx = indexFor(day, all.size());
        Map<String, Object> out = describe(all.get(idx));
        out.put("day", day.toString());
        out.put("endsAt", day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toString());
        out.put("rotationIndex", idx);
        out.put("rotationSize", all.size());
        Map<String, Object> next = describe(all.get(indexFor(day.plusDays(1), all.size())));
        out.put("tomorrow", Map.of("opponentName", next.get("opponentName"), "title", String.valueOf(next.get("title"))));
        return out;
    }

    /** The named card, else the deck's strongest Siegeling: highest rarity, then most health. */
    Optional<Card> featuredCard(Entry e) {
        List<Card> deck = cardDefs.buildDeckById(e.deckId());
        if (e.featuredCardId() != null) {
            Optional<Card> named = deck.stream().filter(c -> e.featuredCardId().equals(c.getId())).findFirst();
            if (named.isPresent()) return named;
        }
        return deck.stream()
                .filter(c -> c instanceof SieglingCard)
                .max(Comparator.<Card>comparingInt(c -> c.getRarity() == null ? 0 : c.getRarity().ordinal())
                        .thenComparingInt(c -> ((SieglingCard) c).getHealth()));
    }

    /** Seven battles from the preset decks, each with its recommended knight. */
    List<Entry> defaults() {
        List<CardDefinitionService.DeckOption> decks = new ArrayList<>(cardDefs.getDeckOptions());
        decks.sort(Comparator.comparing(CardDefinitionService.DeckOption::id));
        List<Entry> out = new ArrayList<>();
        for (CardDefinitionService.DeckOption d : decks) {
            if (out.size() >= DEFAULT_COUNT) break;
            String trainerId = d.recommendedTrainerId();
            if (trainerId == null || cardDefs.getActiveTrainerById(trainerId).isEmpty()) continue;
            out.add(new Entry("daily-" + (out.size() + 1), null, null, trainerId, d.id(), null, null));
        }
        if (out.isEmpty()) throw new IllegalStateException("No preset deck with an active SiegeKnight for Daily Battle.");
        return out;
    }

    private List<Entry> load() {
        if (!isPersistent()) return memory;
        try {
            DocumentSnapshot doc = client.requireFirestore().collection(COLLECTION).document(DOCUMENT)
                    .get().get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!doc.exists() || !(doc.get("battles") instanceof List<?> rows)) return null;
            List<Entry> out = new ArrayList<>();
            for (Object o : rows) {
                if (!(o instanceof Map<?, ?> r)) continue;
                out.add(new Entry(text(r.get("id")), text(r.get("title")), text(r.get("opponentName")),
                        text(r.get("trainerId")), text(r.get("deckId")), text(r.get("featuredCardId")), text(r.get("blurb"))));
            }
            // An entry whose deck or knight has since been removed is skipped rather than breaking the day.
            out.removeIf(e -> e.id() == null || e.deckId() == null || e.trainerId() == null
                    || cardDefs.getActiveTrainerById(e.trainerId()).isEmpty()
                    || cardDefs.getDeckOptions().stream().noneMatch(d -> d.id().equals(e.deckId())));
            return out;
        } catch (Exception ex) {
            log.warn("Unable to load the Daily Battle rotation; using the defaults.", ex);
            return null;
        }
    }

    private void persist(List<Entry> entries) {
        if (!isPersistent()) {
            memory = List.copyOf(entries);
            return;
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Entry e : entries) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", e.id());
            r.put("title", e.title());
            r.put("opponentName", e.opponentName());
            r.put("trainerId", e.trainerId());
            r.put("deckId", e.deckId());
            r.put("featuredCardId", e.featuredCardId());
            r.put("blurb", e.blurb());
            rows.add(r);
        }
        try {
            client.requireFirestore().collection(COLLECTION).document(DOCUMENT)
                    .set(Map.of("battles", rows, "updatedAt", Instant.now().toString()))
                    .get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to save the Daily Battle rotation.", ex);
        }
    }

    private static String text(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        return s.isEmpty() ? null : s;
    }

    private static String limit(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
