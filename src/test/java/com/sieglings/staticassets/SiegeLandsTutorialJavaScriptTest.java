package com.sieglings.staticassets;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class SiegeLandsTutorialJavaScriptTest {

    @Test
    void tutorialIntroducesTheLiveLandBannerRulesAndBossTransitionInOrder() throws Exception {
        String tutorial = Files.readString(Path.of("src/main/resources/static/js/siege-tutorial.js"));
        String html = Files.readString(Path.of("src/main/resources/static/adventure.html"));

        assertTrue(tutorial.contains("land: land, landHistory: [land], landSegment: 0, landSegmentRows: 8"),
                "the simulated expedition must render through the real Lands UI");
        assertTrue(tutorial.contains("background: '/img/lands/fire.webp'")
                        && tutorial.contains("effect: 'FIRE Siegelings start battles with +1 Attack.'"),
                "the tutorial Land must use the same wire shape and production art as a real run");

        int welcome = tutorial.indexOf("{ id: 'welcome'");
        int land = tutorial.indexOf("{ id: 'land'");
        int open = tutorial.indexOf("{ id: 'land-open'");
        int rules = tutorial.indexOf("{ id: 'land-rules'");
        int change = tutorial.indexOf("{ id: 'land-change'");
        int map = tutorial.indexOf("{ id: 'map'");
        assertTrue(welcome < land && land < open && open < rules && rules < change && change < map,
                "Lands must be taught before ordinary route navigation");

        assertTrue(tutorial.contains("target: '#mapLand'")
                        && tutorial.contains("until: function () { return !hidden('landModal'); }")
                        && tutorial.contains("target: '.land-modal-card', avoid: '#landClose'")
                        && tutorial.contains("until: function () { return hidden('landModal'); }"),
                "the coach must open and close the actual Land details panel instead of describing a mockup");
        assertTrue(tutorial.contains("<b>Rare Lands</b>") && tutorial.contains("<b>Badlands</b>"),
                "the boss transition lesson must name both later Land categories");
        assertTrue(html.contains("/js/siege-tutorial.js?v=21"),
                "the changed tutorial bundle needs a fresh production cache pin");
    }
}
