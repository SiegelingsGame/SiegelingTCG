package com.sieglings.service;

import com.sieglings.model.enums.Element;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Rotating daily tournaments for online Battle.
 *
 * <p>A tournament is a ladder, not a bracket: it runs for one UTC day under a
 * deck rule that rotates through {@link #ROTATION}. Players host and join
 * ordinary 1v1 lobbies tagged with the day's tournament id; the server checks
 * both loadouts against the rule, the finished match is recorded with the id,
 * and standings are read straight back out of match history. Nothing about a
 * tournament is stored on its own - the schedule is a pure function of the
 * date, which is what lets it rotate forever with no admin and no scheduler.
 *
 * <p>Prizes are claimed, not pushed: once a day closes, its top three can claim
 * their Siegecoins from the Lobbies page. The claim is recorded on progression,
 * so it is paid at most once per account per tournament.
 */
@Service
public class TournamentService {

    /** Siegecoins for 1st, 2nd and 3rd. */
    public static final List<Integer> PRIZES = List.of(500, 300, 150);
    /** Standings points: a win is worth three of a loss, so playing is rewarded but winning decides. */
    public static final int POINTS_WIN = 3;
    public static final int POINTS_LOSS = 1;
    public static final int POINTS_DRAW = 1;
    static final Duration STANDINGS_TTL = Duration.ofSeconds(60);
    private static final int CLAIM_HISTORY_LIMIT = 90;

    /**
     * One rule of the rotation. {@code allowed} limits the elements a deck may
     * carry (null = any); {@code presetOnly} refuses custom decks;
     * {@code monoElement} needs a deck of exactly one element.
     */
    public record Rule(String id, String name, String tagline, String element,
                       Set<Element> allowed, boolean presetOnly, boolean monoElement) {

        public String describe() {
            List<String> parts = new ArrayList<>();
            if (allowed != null) {
                parts.add(String.join(" / ", allowed.stream().map(TournamentService::label).toList()) + " decks only");
            }
            if (monoElement) parts.add("single-element decks only");
            if (presetOnly) parts.add("preset decks only");
            return parts.isEmpty() ? "Any deck" : String.join(" · ", parts);
        }
    }

    public record Tournament(String id, Rule rule, LocalDate day, Instant startsAt, Instant endsAt) {}

    public record Standing(String userId, String displayName, int points, int wins, int losses, int played,
                           Instant lastPlayed) {}

    /**
     * Seven rules, so each one comes round on the same weekday. Every rule can be
     * entered with at least one free preset deck (Fire, Earth, Wind or Ice - Water
     * and Electric are purchases), so no one is locked out of a day.
     */
    static final List<Rule> ROTATION = List.of(
            new Rule("open", "Open Arena", "Bring anything. Every deck, every element.",
                    "NEUTRAL", null, false, false),
            new Rule("ember-frost", "Ember & Frost Cup", "Only Fire and Ice may enter the ring.",
                    "FIRE", EnumSet.of(Element.FIRE, Element.ICE), false, false),
            new Rule("presets", "Preset Clash", "Premade decks only - pure piloting, no brewing.",
                    "METAL", null, true, false),
            new Rule("gale-stone", "Gale & Stone Open", "Wind and Earth decks only.",
                    "WIND", EnumSet.of(Element.WIND, Element.EARTH), false, false),
            new Rule("mono", "Purebred Masters", "One element per deck. Commit to it.",
                    "LIGHT", null, false, true),
            // Water and Electric are bought, not free, so Wind rides along: the
            // day must stay enterable with a free preset (Gale Talons).
            new Rule("tide-storm", "Tide & Storm Trials", "Water, Electric and Wind decks only.",
                    "WATER", EnumSet.of(Element.WATER, Element.ELECTRIC, Element.WIND), false, false),
            new Rule("elemental-four", "Founders' Four", "Fire, Earth, Wind and Ice - the four that started it.",
                    "EARTH", EnumSet.of(Element.FIRE, Element.EARTH, Element.WIND, Element.ICE), false, false)
    );

    @Autowired(required = false)
    private MatchHistoryStore matchHistoryStore;

    @Autowired(required = false)
    private PlayerProgressionService playerProgressionService;

    private record CachedStandings(Instant builtAt, List<Standing> standings) {}
    private final Map<String, CachedStandings> standingsCache = new ConcurrentHashMap<>();

    // ---- schedule ------------------------------------------------------------

    public Tournament current(Instant now) {
        return forDay(LocalDate.ofInstant(now, ZoneOffset.UTC));
    }

    public List<Tournament> upcoming(Instant now, int count) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        List<Tournament> out = new ArrayList<>();
        for (int i = 1; i <= count; i++) out.add(forDay(today.plusDays(i)));
        return out;
    }

    public Tournament forDay(LocalDate day) {
        int index = Math.floorMod(day.toEpochDay(), ROTATION.size());
        Rule rule = ROTATION.get(index);
        Instant start = day.atStartOfDay(ZoneOffset.UTC).toInstant();
        return new Tournament(rule.id() + "@" + day, rule, day, start, start.plus(Duration.ofDays(1)));
    }

    /** Parses an id like {@code ember-frost@2026-10-06}; empty when it names no real day of the rotation. */
    public Optional<Tournament> find(String tournamentId) {
        if (tournamentId == null) return Optional.empty();
        int at = tournamentId.lastIndexOf('@');
        if (at <= 0) return Optional.empty();
        LocalDate day;
        try {
            day = LocalDate.parse(tournamentId.substring(at + 1));
        } catch (DateTimeParseException ex) {
            return Optional.empty();
        }
        Tournament t = forDay(day);
        return t.id().equals(tournamentId) ? Optional.of(t) : Optional.empty();
    }

    /** The tournament a new table may be opened for: only the one running right now. */
    public Tournament requireOpen(String tournamentId, Instant now) {
        Tournament t = find(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("That tournament doesn't exist."));
        if (now.isBefore(t.startsAt()) || !now.isBefore(t.endsAt())) {
            throw new IllegalArgumentException("That tournament isn't running right now. Today's is " + current(now).rule().name() + ".");
        }
        return t;
    }

    // ---- rules ---------------------------------------------------------------

    /** Throws with a player-facing reason when a loadout breaks the tournament's rule. */
    public void checkLoadout(Tournament t, List<Element> deckElements, boolean customDeck) {
        Rule rule = t.rule();
        if (rule.presetOnly() && customDeck) {
            throw new IllegalArgumentException(rule.name() + " is preset decks only. Pick one of the premade decks.");
        }
        List<Element> elements = deckElements == null ? List.of() : deckElements.stream()
                .filter(e -> e != null && e != Element.NEUTRAL).distinct().toList();
        if (rule.monoElement() && elements.size() != 1) {
            throw new IllegalArgumentException(rule.name() + " needs a single-element deck.");
        }
        if (rule.allowed() != null) {
            for (Element e : elements) {
                if (!rule.allowed().contains(e)) {
                    throw new IllegalArgumentException(rule.name() + " allows " + rule.describe()
                            + " - your deck uses " + label(e) + ".");
                }
            }
        }
    }

    // ---- standings -----------------------------------------------------------

    public List<Standing> standings(String tournamentId, Instant now) {
        Instant closes = find(tournamentId).map(Tournament::endsAt).orElse(Instant.MAX);
        CachedStandings cached = standingsCache.get(tournamentId);
        if (cached != null && cacheFresh(cached, now, closes)) {
            return cached.standings();
        }
        List<MatchHistoryEntity> matches = matchHistoryStore == null
                ? List.of() : matchHistoryStore.findByTournamentId(tournamentId);
        // A rematch started before midnight can finish after the day closes; it
        // must not move a final standing (and so a prize) after the fact.
        List<Standing> built = rank(matches.stream()
                .filter(m -> m.getFinishedAt() == null || m.getFinishedAt().isBefore(closes))
                .toList());
        standingsCache.put(tournamentId, new CachedStandings(now, built));
        return built;
    }

    /**
     * A board cached while the day was still open must not be reused once the
     * day has closed. Claims pay from this list, and a match that finished in
     * the last minute would otherwise be missing for the whole TTL — the
     * Lobbies page offers the prize the moment the countdown hits zero.
     */
    private static boolean cacheFresh(CachedStandings cached, Instant now, Instant closes) {
        if (Duration.between(cached.builtAt(), now).compareTo(STANDINGS_TTL) >= 0) {
            return false;
        }
        return now.isBefore(closes) || !cached.builtAt().isBefore(closes);
    }

    /** Points first, then wins, then whoever got there first. Pure, so it is tested directly. */
    static List<Standing> rank(List<MatchHistoryEntity> matches) {
        Map<String, int[]> tally = new HashMap<>();          // points, wins, losses, played
        Map<String, String> names = new HashMap<>();
        Map<String, Instant> last = new HashMap<>();
        for (MatchHistoryEntity m : matches) {
            if (m == null || m.getUserId() == null || !"ONLINE".equals(m.getMatchType())) continue;
            int[] t = tally.computeIfAbsent(m.getUserId(), k -> new int[4]);
            String result = String.valueOf(m.getResult());
            if ("WIN".equals(result)) { t[0] += POINTS_WIN; t[1]++; }
            else if ("LOSS".equals(result)) { t[0] += POINTS_LOSS; t[2]++; }
            else if ("DRAW".equals(result)) { t[0] += POINTS_DRAW; }
            else continue;
            t[3]++;
            if (m.getUserDisplayName() != null) names.put(m.getUserId(), m.getUserDisplayName());
            Instant at = m.getFinishedAt();
            if (at != null) last.merge(m.getUserId(), at, (a, b) -> a.isAfter(b) ? a : b);
        }
        List<Standing> out = new ArrayList<>();
        tally.forEach((user, t) -> out.add(new Standing(user, names.getOrDefault(user, "Player"),
                t[0], t[1], t[2], t[3], last.get(user))));
        out.sort(Comparator.comparingInt(Standing::points).reversed()
                .thenComparing(Comparator.comparingInt(Standing::wins).reversed())
                .thenComparing(s -> s.lastPlayed() == null ? Instant.MAX : s.lastPlayed()));
        return out;
    }

    /** 1-based place of a user, or 0 when they have not played. */
    public static int placeOf(List<Standing> standings, String userId) {
        for (int i = 0; i < standings.size(); i++) {
            if (standings.get(i).userId().equals(userId)) return i + 1;
        }
        return 0;
    }

    // ---- prizes --------------------------------------------------------------

    /** Finished tournaments (most recent first) where this user placed in the money and has not claimed. */
    public List<Map<String, Object>> claimable(AccountUser user, Instant now, int lookbackDays) {
        if (user == null || playerProgressionService == null) return List.of();
        PlayerProgressionEntity progression = playerProgressionService.getOrCreate(user);
        List<String> claimed = progression.getClaimedTournamentIds();
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 1; i <= lookbackDays; i++) {
            Tournament t = forDay(today.minusDays(i));
            if (claimed.contains(t.id())) continue;
            int place = placeOf(standings(t.id(), now), user.getId());
            if (place >= 1 && place <= PRIZES.size()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("tournamentId", t.id());
                row.put("name", t.rule().name());
                row.put("day", t.day().toString());
                row.put("place", place);
                row.put("prize", PRIZES.get(place - 1));
                out.add(row);
            }
        }
        return out;
    }

    /** Pays a finished tournament's prize once. Returns the coins awarded. */
    public int claim(AccountUser user, String tournamentId, Instant now) {
        if (user == null) throw new IllegalArgumentException("Sign in to claim tournament prizes.");
        Tournament t = find(tournamentId).orElseThrow(() -> new IllegalArgumentException("That tournament doesn't exist."));
        if (now.isBefore(t.endsAt())) {
            throw new IllegalArgumentException("Prizes unlock when the tournament ends.");
        }
        if (playerProgressionService == null) throw new IllegalStateException("Progression is unavailable.");
        int place = placeOf(standings(t.id(), now), user.getId());
        if (place < 1 || place > PRIZES.size()) {
            throw new IllegalArgumentException("Only the top " + PRIZES.size() + " can claim a prize.");
        }
        int prize = PRIZES.get(place - 1);
        return playerProgressionService.claimTournamentPrize(user, t.id(), prize, CLAIM_HISTORY_LIMIT);
    }

    // ---- serialisation ------------------------------------------------------

    public Map<String, Object> describe(Tournament t) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", t.id());
        out.put("ruleId", t.rule().id());
        out.put("name", t.rule().name());
        out.put("tagline", t.rule().tagline());
        out.put("rule", t.rule().describe());
        out.put("element", t.rule().element());
        out.put("allowedElements", t.rule().allowed() == null ? null
                : t.rule().allowed().stream().map(Enum::name).toList());
        out.put("presetOnly", t.rule().presetOnly());
        out.put("monoElement", t.rule().monoElement());
        out.put("day", t.day().toString());
        out.put("startsAt", t.startsAt().toString());
        out.put("endsAt", t.endsAt().toString());
        out.put("prizes", PRIZES);
        return out;
    }

    public static Map<String, Object> describe(Standing s, int place) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("place", place);
        out.put("userId", s.userId());
        out.put("displayName", s.displayName());
        out.put("points", s.points());
        out.put("wins", s.wins());
        out.put("losses", s.losses());
        out.put("played", s.played());
        return out;
    }

    static String label(Element e) {
        String n = e.name();
        return n.charAt(0) + n.substring(1).toLowerCase();
    }
}
