package com.sieglings.adventure;

import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.service.CardDefinitionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Siege foes are corrupted Siegelings drawn from the real card catalog — the same
 * treatment Akhar's raiders get in the Keep — rather than nameless silhouettes.
 * Card art only ever arrives from the dashboard (Firestore), so the classpath
 * catalog these tests run against carries none: the shade catalog is injected
 * here to exercise the path production takes, and one case covers the artless
 * fallback that the rest of the suite runs on.
 */
@SpringBootTest
class SiegeShadeEnemyTest {

    @Autowired
    private SiegeContentService content;

    private Object originalCardDefs;

    private static final String ART_PREFIX = "https://example.test/art/";

    /** Returns a fixed catalog, standing in for a dashboard that has uploaded art. */
    private static class StubCatalog extends CardDefinitionService {
        private final List<Card> cards;

        StubCatalog(List<Card> cards) {
            this.cards = cards;
        }

        @Override
        public List<Card> getDeckBuilderCatalog() {
            return cards;
        }
    }

    /**
     * The real catalog with art painted onto every Siegeling. Copies of real cards
     * keep their move ids valid, which matters: a card whose moves do not resolve is
     * skipped by the same filter that feeds recruits.
     */
    private List<Card> catalogWithArt(boolean withArt) {
        CardDefinitionService live = (CardDefinitionService) ReflectionTestUtils.getField(content, "cardDefs");
        List<Card> out = new ArrayList<>();
        for (Card card : live.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard s) {
                SieglingCard copy = s.copy();
                copy.setCardArtUrl(withArt ? ART_PREFIX + s.getId() + ".png" : null);
                out.add(copy);
            } else {
                out.add(card);
            }
        }
        return out;
    }

    private void useCatalog(List<Card> cards) {
        if (originalCardDefs == null) {
            originalCardDefs = ReflectionTestUtils.getField(content, "cardDefs");
        }
        ReflectionTestUtils.setField(content, "cardDefs", new StubCatalog(cards));
    }

    @AfterEach
    void restoreCatalog() {
        if (originalCardDefs != null) {
            ReflectionTestUtils.setField(content, "cardDefs", originalCardDefs);
            originalCardDefs = null;
        }
    }

    private List<Combatant> battle(NodeType type, int floor, long seed) {
        return content.generateEnemies(type, floor, 2, 0, new Random(seed),
                List.of(Element.FIRE, Element.WATER, Element.EARTH, Element.WIND));
    }

    @Test
    void enemiesCarryCatalogArtAndShadeNames() {
        useCatalog(catalogWithArt(true));
        for (long seed = 1; seed <= 12; seed++) {
            for (Combatant foe : battle(NodeType.BATTLE, 3, seed)) {
                assertNotNull(foe.getArtUrl(), "a foe should wear real card art");
                assertTrue(foe.getArtUrl().startsWith(ART_PREFIX), foe.getArtUrl());
                assertTrue(foe.getName().startsWith("Shade of "),
                        "foes read as corrupted Siegelings, got " + foe.getName());
            }
        }
    }

    @Test
    void openingFightAlsoUsesAShade() {
        useCatalog(catalogWithArt(true));
        List<Combatant> opener = content.generateOpeningEnemies(new Random(7), List.of(Element.FIRE, Element.ICE));
        assertFalse(opener.isEmpty());
        for (Combatant foe : opener) {
            assertNotNull(foe.getArtUrl(), "the opening foe should wear real card art");
            assertTrue(foe.getName().startsWith("Shade of "), foe.getName());
        }
    }

    /** The whole point is that the fight looks different, not that it plays differently. */
    @Test
    void shadesDoNotChangeTheEncounterShape() {
        record Shape(int foes, int hp, int speed, int abilities, int topDamage) { }
        java.util.function.Function<List<Combatant>, Shape> shapeOf = foes -> new Shape(
                foes.size(),
                foes.stream().mapToInt(Combatant::getMaxHp).sum(),
                foes.stream().mapToInt(Combatant::getSpeed).max().orElse(0),
                foes.stream().mapToInt(f -> f.getAbilities().size()).sum(),
                foes.stream().flatMap(f -> f.getAbilities().stream())
                        .mapToInt(AbilitySpec::value).max().orElse(0));

        useCatalog(catalogWithArt(false));
        List<Shape> withoutArt = new ArrayList<>();
        for (long seed = 1; seed <= 8; seed++) withoutArt.add(shapeOf.apply(battle(NodeType.BATTLE, 4, seed)));

        useCatalog(catalogWithArt(true));
        List<Shape> withArt = new ArrayList<>();
        for (long seed = 1; seed <= 8; seed++) withArt.add(shapeOf.apply(battle(NodeType.BATTLE, 4, seed)));

        assertEquals(withoutArt, withArt,
                "HP, speed and the ability set must not depend on which shade shows up");
    }

    /** A catalog with no uploaded art must still produce playable foes, not blanks. */
    @Test
    void artlessCatalogFallsBackToTheThemedNames() {
        useCatalog(catalogWithArt(false));
        List<Combatant> foes = battle(NodeType.BATTLE, 2, 5);
        assertFalse(foes.isEmpty());
        for (Combatant foe : foes) {
            assertNull(foe.getArtUrl(), "no art in the catalog means no art on the foe");
            assertFalse(foe.getName().isBlank());
            assertFalse(foe.getName().startsWith("Shade of "),
                    "an artless catalog cannot promise a shade, got " + foe.getName());
        }
    }

    /** Bosses are named antagonists; they take the cutout but keep their own title. */
    @Test
    void bossesKeepTheirTitleButStillGetArt() {
        useCatalog(catalogWithArt(true));
        for (long seed = 1; seed <= 8; seed++) {
            for (Combatant boss : content.generateEnemies(NodeType.BOSS, 6, 2, 0, new Random(seed),
                    List.of(Element.SHADOW, Element.FIRE))) {
                assertNotNull(boss.getArtUrl(), "a boss should not be the one fight without art");
                assertFalse(boss.getName().startsWith("Shade of "),
                        "bosses keep their own name, got " + boss.getName());
            }
        }
    }

    /** Which creature turns up varies — a fixed cast would be as flat as one silhouette. */
    @Test
    void differentRunsMeetDifferentShades() {
        useCatalog(catalogWithArt(true));
        Set<String> seen = new HashSet<>();
        for (long seed = 1; seed <= 20; seed++) {
            battle(NodeType.BATTLE, 3, seed).forEach(f -> seen.add(f.getName()));
        }
        assertTrue(seen.size() > 1, "expected a varied cast of shades, got " + seen);
    }
}
