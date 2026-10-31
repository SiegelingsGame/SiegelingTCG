package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Daily Battle rotates one opponent per UTC day through a dashboard-edited list
 * (seven to start), and features the card the opponent is known for, or the
 * deck's strongest Siegeling when none is named.
 */
@SpringBootTest
class DailyBattleServiceTest {

    @Autowired
    private DailyBattleService service;

    @Autowired
    private GameService gameService;

    @Autowired
    private CardDefinitionService cardDefs;

    @Test
    void sevenDefaultBattlesEachWithADeckAndKnight() {
        List<DailyBattleService.Entry> defaults = service.defaults();
        assertEquals(DailyBattleService.DEFAULT_COUNT, defaults.size());
        assertEquals(defaults.size(), defaults.stream().map(DailyBattleService.Entry::id).distinct().count());
    }

    @Test
    void theRotationWalksOneBattleADay() {
        LocalDate day = LocalDate.of(2026, 10, 31);
        int today = DailyBattleService.indexFor(day, 7);
        assertEquals((today + 1) % 7, DailyBattleService.indexFor(day.plusDays(1), 7));
        assertEquals(today, DailyBattleService.indexFor(day.plusDays(7), 7), "a week later, the same battle");
        assertTrue(DailyBattleService.indexFor(LocalDate.of(1960, 1, 1), 7) >= 0, "never negative");
    }

    @Test
    void theFeaturedCardIsTheDecksStrongestSiegelingUnlessNamed() {
        DailyBattleService.Entry e = service.defaults().get(0);
        Card featured = service.featuredCard(e).orElseThrow();
        assertTrue(featured instanceof SieglingCard);
        // Nothing in the deck outranks it: rarity first, then health.
        for (Card c : cardDefs.buildDeckById(e.deckId())) {
            if (!(c instanceof SieglingCard s)) continue;
            int cmp = Integer.compare(s.getRarity().ordinal(), featured.getRarity().ordinal());
            assertTrue(cmp < 0 || (cmp == 0 && s.getHealth() <= ((SieglingCard) featured).getHealth()));
        }
    }

    @Test
    void savingValidatesAndRotatesTheNewList() {
        List<DailyBattleService.Entry> defaults = service.defaults();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (DailyBattleService.Entry e : defaults) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", e.id());
            r.put("trainerId", e.trainerId());
            r.put("deckId", e.deckId());
            r.put("opponentName", "Rival " + e.id());
            rows.add(r);
        }
        List<DailyBattleService.Entry> saved = service.save(rows);
        assertEquals(rows.size(), saved.size());
        assertEquals("Rival " + saved.get(0).id(), service.describe(saved.get(0)).get("opponentName"));

        Map<String, Object> bad = new LinkedHashMap<>(rows.get(0));
        bad.put("deckId", "no-such-deck");
        assertThrows(IllegalArgumentException.class, () -> service.save(List.of(bad)));
        Map<String, Object> wrongCard = new LinkedHashMap<>(rows.get(0));
        wrongCard.put("featuredCardId", "not-in-this-deck");
        assertThrows(IllegalArgumentException.class, () -> service.save(List.of(wrongCard)));
        assertThrows(IllegalArgumentException.class, () -> service.save(List.of()));
    }

    @Test
    void theDailyMatchPutsTheDaysOpponentOnTheTable() {
        DailyBattleService.Entry e = service.today(Instant.now());
        GameService.SoloHandle handle = gameService.newDailyBattleGame(
                new GameService.StartOptions(null, null, null, null), "Tester", e.deckId(), e.trainerId(), "Rival");
        assertNotNull(handle.state().getEnemy().getActiveTrainer());
        assertEquals(e.trainerId(), handle.state().getEnemy().getActiveTrainer().getId());
        assertEquals("Rival", handle.state().getEnemy().getName());
        assertNotEquals(handle.state().getPlayer().getName(), handle.state().getEnemy().getName());
    }

    @Test
    void theFeedNamesTodayAndTomorrow() {
        Map<String, Object> feed = service.todayFeed(Instant.parse("2026-10-31T12:00:00Z"));
        assertEquals("2026-10-31", feed.get("day"));
        assertEquals("2026-11-01T00:00:00Z", feed.get("endsAt"));
        assertNotNull(feed.get("featured"));
        assertNotNull(feed.get("tomorrow"));
    }
}
