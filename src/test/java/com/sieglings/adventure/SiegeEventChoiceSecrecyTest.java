package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * An event choice is a gamble, so the button may name only the action. The
 * flavour line, the outcome code and its value all describe the *result*, and a
 * client that has them can render — or a player read in devtools — what a choice
 * pays before committing to it. None of them leave the server.
 */
@SpringBootTest
class SiegeEventChoiceSecrecyTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private String starterKnightId;
    private List<String> starterWarband;

    @BeforeEach
    void setUp() {
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        SieglingCard siegling = content.selectableSieglings().getFirst();
        starterKnightId = knight.getId();
        starterWarband = SiegeStarterTestSupport.starterIds(content, knight, siegling);
    }

    @Test
    void serializedEventOptionsCarryTheActionAndNoOutcome() throws Exception {
        // Every authored event, not a sampled one: openEvent() rolls a puzzle a
        // third of the time, so driving a random node would test this by luck.
        for (SiegeContentService.EventDef def : content.allEvents()) {
            Map<String, Object> event = serializeEventFor(def);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> options = (List<Map<String, Object>>) event.get("options");
            assertNotNull(options, def.id() + " serializes options");
            assertEquals(def.choices().size(), options.size(), def.id() + " serializes every choice");

            for (int i = 0; i < options.size(); i++) {
                Map<String, Object> om = options.get(i);
                SiegeContentService.EventChoice ch = def.choices().get(i);
                String where = def.id() + " / " + ch.label();

                assertEquals(ch.label(), om.get("title"), where + " keeps its action label");
                assertNull(om.get("desc"), where + " must not ship the outcome flavour");
                assertEquals("EVENT_CHOICE", om.get("kind"), where + " must not ship the outcome code");
                assertEquals(0, ((Number) om.get("templateIndex")).intValue(),
                        where + " must not ship the outcome value");
                // The flavour is authored and still exists — it is simply withheld
                // until the choice is made, which is what makes the check meaningful.
                assertFalse(ch.flavor().isBlank(), where + " still authors a reveal line");
            }
        }
    }

    @Test
    void authoredChoiceLabelsNameAnActionRatherThanItsResult() {
        // "Fight them (ambush!)" and "Bleed for a relic (-15 HP)" printed the
        // outcome on the button, which is the same leak by another route.
        String[] spoilers = { "ambush", "relic", "blessing", "treasure", "item", "recruit" };
        for (SiegeContentService.EventDef def : content.allEvents()) {
            for (SiegeContentService.EventChoice ch : def.choices()) {
                String label = ch.label().toLowerCase(Locale.ROOT);
                for (String spoiler : spoilers) {
                    assertFalse(label.contains(spoiler),
                            def.id() + " choice \"" + ch.label() + "\" names its outcome (" + spoiler + ")");
                }
            }
        }
    }

    /** Stages {@code def} as the run's live event and returns the serialized stop. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> serializeEventFor(SiegeContentService.EventDef def) throws Exception {
        Map<String, Object> started = siegeService.newRun(null, starterKnightId, starterWarband, "STANDARD");
        String token = (String) started.get("token");
        SiegeRun run = siegeService.lookup(token).orElseThrow();

        run.setInEvent(true);
        run.setEventTitle(def.title());
        run.setEventIcon(def.icon());
        run.setEventPrompt(def.prompt());
        run.getEventOptions().clear();
        int oid = 0;
        for (SiegeContentService.EventChoice ch : def.choices()) {
            run.getEventOptions().add(CampOption.event("e" + (oid++), ch.outcome(), ch.label(), ch.flavor(), 0, ch.value()));
        }

        Map<String, Object> event = (Map<String, Object>) siegeService.state(token).get("event");
        assertNotNull(event, def.id() + " serializes an event stop");
        assertTrue(event.containsKey("prompt"), def.id() + " keeps its scene text");
        return event;
    }
}
