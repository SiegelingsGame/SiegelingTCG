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
        assertTrue(tutorial.contains("type: 'RIFT'") && tutorial.contains("label: 'Rift'"),
                "the tutorial map must place a Rift beside the cache");
        assertTrue(tutorial.contains("label: 'Buried Cache', next: [11]")
                        && tutorial.contains("label: 'Rift', next: [12]")
                        && tutorial.contains("label: 'Deep Rift', next: [13]")
                        && tutorial.contains("label: 'Sealed Cache', next: [13]"),
                "Cache/Rift must be a Merc-Post→Ember-Forge diamond: each first pick edges to the other type");
        assertTrue(tutorial.contains("{ id: 'branch-3'")
                        && tutorial.contains("{ id: 'rift-a'")
                        && tutorial.contains("{ id: 'other-lane-3'"),
                "cache and Rift must be taught as a choose-one-then-the-other fork");
        assertTrue(tutorial.contains("/api/siege/rift/cross")
                        && tutorial.contains("Frostveil"),
                "the simulated Rift must cross through the real endpoint and show a new Land");
        assertTrue(tutorial.contains("artUrl: '/img/knights/squire-bob-full-card.png'")
                        && tutorial.contains("artUrl: k.artUrl || null"),
                "tutorial Squire Bob must carry the same knight card art a live run uses");
        assertTrue(tutorial.contains("/api/siege/rift/pass")
                        && tutorial.contains("travel past"),
                "tutorial must teach that a Rift can be passed without changing Land");
        assertTrue(html.contains("/js/siege-tutorial.js?v=27"),
                "the changed tutorial bundle needs a fresh production cache pin");
        assertTrue(html.contains("id=\"riftScreen\"") && html.contains("id=\"riftCrossBtn\"")
                        && html.contains("id=\"riftPassBtn\"")
                        && html.contains("Travel past"),
                "the Rift location screen must offer step-through and travel-past");
        assertTrue(html.contains("/js/adventure.js?v=100"),
                "adventure.js must be cache-bumped with the Rift pass handler");
    }
}
