package com.sieglings.service;

import com.sieglings.model.enums.Element;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TournamentServiceTest {

    private final TournamentService service = new TournamentService();

    @Test
    void rotationCyclesThroughEveryRuleOnceAWeek() {
        Set<String> rules = new HashSet<>();
        LocalDate start = LocalDate.parse("2026-10-06");
        for (int i = 0; i < 7; i++) rules.add(service.forDay(start.plusDays(i)).rule().id());
        assertEquals(TournamentService.ROTATION.size(), rules.size());
        assertEquals(service.forDay(start).rule().id(), service.forDay(start.plusDays(7)).rule().id());
    }

    @Test
    void currentTournamentSpansTheUtcDayAndRoundTripsById() {
        TournamentService.Tournament t = service.current(Instant.parse("2026-10-06T15:30:00Z"));
        assertEquals(Instant.parse("2026-10-06T00:00:00Z"), t.startsAt());
        assertEquals(Instant.parse("2026-10-07T00:00:00Z"), t.endsAt());
        assertTrue(t.id().endsWith("@2026-10-06"));
        assertEquals(t, service.find(t.id()).orElseThrow());
        // An id naming the wrong rule for its day is not a real tournament.
        String other = TournamentService.ROTATION.stream().map(TournamentService.Rule::id)
                .filter(id -> !id.equals(t.rule().id())).findFirst().orElseThrow();
        assertTrue(service.find(other + "@2026-10-06").isEmpty());
        assertTrue(service.find("garbage").isEmpty());
    }

    @Test
    void onlyTodaysTournamentAcceptsNewTables() {
        Instant now = Instant.parse("2026-10-06T12:00:00Z");
        String today = service.current(now).id();
        String yesterday = service.forDay(LocalDate.parse("2026-10-05")).id();
        String tomorrow = service.forDay(LocalDate.parse("2026-10-07")).id();
        assertEquals(today, service.requireOpen(today, now).id());
        assertThrows(IllegalArgumentException.class, () -> service.requireOpen(yesterday, now));
        assertThrows(IllegalArgumentException.class, () -> service.requireOpen(tomorrow, now));
    }

    @Test
    void deckRulesAreEnforced() {
        TournamentService.Tournament emberFrost = byRule("ember-frost");
        service.checkLoadout(emberFrost, List.of(Element.FIRE, Element.ICE), true);
        assertThrows(IllegalArgumentException.class,
                () -> service.checkLoadout(emberFrost, List.of(Element.FIRE, Element.WIND), false));

        TournamentService.Tournament presets = byRule("presets");
        service.checkLoadout(presets, List.of(Element.WATER), false);
        assertThrows(IllegalArgumentException.class,
                () -> service.checkLoadout(presets, List.of(Element.WATER), true));

        TournamentService.Tournament mono = byRule("mono");
        service.checkLoadout(mono, List.of(Element.EARTH, Element.NEUTRAL), true);
        assertThrows(IllegalArgumentException.class,
                () -> service.checkLoadout(mono, List.of(Element.EARTH, Element.FIRE), false));

        service.checkLoadout(byRule("open"), List.of(Element.SHADOW, Element.LIGHT, Element.METAL), true);
    }

    @Test
    void everyRuleCanBeEnteredWithAFreePresetDeck() {
        // Fire, Earth, Wind and Ice are the always-free single-element presets.
        List<Element> free = List.of(Element.FIRE, Element.EARTH, Element.WIND, Element.ICE, Element.WATER);
        for (TournamentService.Rule rule : TournamentService.ROTATION) {
            TournamentService.Tournament t = byRule(rule.id());
            boolean ok = free.stream().anyMatch(e -> {
                try { service.checkLoadout(t, List.of(e), false); return true; }
                catch (IllegalArgumentException ex) { return false; }
            });
            assertTrue(ok, rule.id() + " has no free preset that fits");
        }
    }

    @Test
    void standingsRankByPointsThenWinsAndIgnoreSoloMatches() {
        List<MatchHistoryEntity> matches = List.of(
                match("a", "WIN", "ONLINE"), match("a", "WIN", "ONLINE"),
                match("b", "WIN", "ONLINE"), match("b", "LOSS", "ONLINE"), match("b", "LOSS", "ONLINE"), match("b", "LOSS", "ONLINE"),
                match("c", "LOSS", "ONLINE"),
                match("d", "WIN", "SOLO"));
        List<TournamentService.Standing> s = TournamentService.rank(matches);
        assertEquals(List.of("a", "b", "c"), s.stream().map(TournamentService.Standing::userId).toList());
        assertEquals(6, s.get(0).points());
        assertEquals(6, s.get(1).points());           // 3 + 1 + 1 + 1, behind a on wins
        assertEquals(4, s.get(1).played());
        assertEquals(2, TournamentService.placeOf(s, "b"));
        assertEquals(0, TournamentService.placeOf(s, "d"));
    }

    @Test
    void matchesFinishedAfterTheDayClosesDoNotCount() throws Exception {
        TournamentService.Tournament t = service.forDay(LocalDate.parse("2026-10-05"));
        List<MatchHistoryEntity> stored = new ArrayList<>();
        MatchHistoryEntity inside = match("a", "WIN", "ONLINE");
        inside.setFinishedAt(Instant.parse("2026-10-05T23:59:00Z"));
        MatchHistoryEntity late = match("b", "WIN", "ONLINE");
        late.setFinishedAt(Instant.parse("2026-10-06T00:05:00Z"));
        stored.add(inside);
        stored.add(late);
        inject(service, "matchHistoryStore", new MatchHistoryStore() {
            @Override
            public List<MatchHistoryEntity> findByTournamentId(String id) {
                return id.equals(t.id()) ? stored : List.of();
            }
        });
        List<TournamentService.Standing> s = service.standings(t.id(), Instant.parse("2026-10-06T08:00:00Z"));
        assertEquals(1, s.size());
        assertEquals("a", s.get(0).userId());
    }

    @Test
    void prizesCannotBeClaimedBeforeTheDayEnds() {
        Instant now = Instant.parse("2026-10-06T12:00:00Z");
        com.sieglings.persistence.entity.AccountUser user = new com.sieglings.persistence.entity.AccountUser();
        user.setId("u1");
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.claim(user, service.current(now).id(), now));
        assertFalse(ex.getMessage().isBlank());
    }

    private TournamentService.Tournament byRule(String ruleId) {
        LocalDate day = LocalDate.parse("2026-10-06");
        for (int i = 0; i < 7; i++) {
            TournamentService.Tournament t = service.forDay(day.plusDays(i));
            if (t.rule().id().equals(ruleId)) return t;
        }
        throw new IllegalStateException(ruleId);
    }

    private static MatchHistoryEntity match(String user, String result, String type) {
        MatchHistoryEntity m = new MatchHistoryEntity();
        m.setUserId(user);
        m.setUserDisplayName(user.toUpperCase());
        m.setResult(result);
        m.setMatchType(type);
        m.setFinishedAt(Instant.parse("2026-10-05T10:00:00Z"));
        return m;
    }

    private static void inject(Object target, String field, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(field);
        f.setAccessible(true);
        f.set(target, value);
    }
}
