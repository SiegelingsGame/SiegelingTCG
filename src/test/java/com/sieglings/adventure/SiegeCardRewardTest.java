package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class SiegeCardRewardTest {

    @Autowired
    private SiegeContentService content;

    private final Random rng = new Random(42);

    private SieglingCard fireSiegling;

    @BeforeEach
    void setUp() {
        fireSiegling = content.selectableSieglings().stream()
                .filter(s -> s.getElement() == Element.FIRE)
                .findFirst()
                .orElse(null);
    }

    @Test
    void rewardMovesMatchOwnerElementOrAreNeutral() {
        if (fireSiegling == null) return;
        Set<Element> seen = new HashSet<>();
        for (int i = 0; i < 40; i++) {
            AbilitySpec spec = content.randomCardRewardFor(Element.FIRE, rng);
            seen.add(spec.element());
            assertTrue(spec.element() == Element.FIRE || spec.element() == Element.NEUTRAL,
                    "Reward move must be FIRE or neutral, got " + spec.element());
        }
        assertTrue(seen.contains(Element.FIRE) || seen.contains(Element.NEUTRAL));
    }

    @Test
    void proceduralNeutralMovesAreUniversal() {
        for (int i = 0; i < 20; i++) {
            AbilitySpec spec = content.randomCardRewardFor(Element.ICE, new Random(i));
            if (spec.element() == Element.NEUTRAL) {
                assertTrue(spec.id().startsWith("neutral-gen-") || spec.description().contains("universal"));
            }
        }
        var move = content.generateNeutralMove(new Random(7));
        assertEquals(Element.NEUTRAL, move.element());
        assertFalse(move.name().isBlank());
    }

    @Test
    void evolvedPreviewMovesComeFromEvolvedForm() {
        SieglingCard base = content.selectableSieglings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isPresent())
                .findFirst()
                .orElse(null);
        if (base == null) return;
        SieglingCard evo = content.evolutionOf(base.getId()).orElseThrow();
        Set<String> evoMoveNames = new HashSet<>();
        content.moveSpecs(evo).forEach(s -> evoMoveNames.add(s.name()));

        // Upgrading the hand both rewrites the cards and reports the previews the client morphs to.
        List<SiegeCard> hand = new ArrayList<>();
        for (AbilitySpec spec : content.moveSpecs(base)) {
            hand.add(new SiegeCard("hand-" + spec.id(), "member-1", spec));
        }
        assertFalse(hand.isEmpty());
        List<Map<String, Object>> previews = content.upgradeHandCards(evo, "member-1", hand, rng);
        assertEquals(hand.size(), previews.size(), "every owned card in hand is rewritten");
        for (SiegeCard card : hand) {
            assertTrue(evoMoveNames.contains(card.getSpec().name()),
                    "Hand card should be an evolved-form move: " + card.getSpec().name());
        }
        for (Map<String, Object> preview : previews) {
            assertTrue(evoMoveNames.contains(preview.get("name")),
                    "Preview move should be from evolved form: " + preview.get("name"));
        }
    }
}
