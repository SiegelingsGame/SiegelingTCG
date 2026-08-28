package com.sieglings.adventure;

import com.sieglings.model.TrainerCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The battle sheet lets a player read the draw and discard piles, not just the
 * hand, so the serialized battle has to carry both as full card faces — and the
 * draw pile must not leak the order it will be drawn in.
 */
@SpringBootTest
class SiegePileViewTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private String startRunInBattle() {
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        List<String> warband = SiegeStarterTestSupport.starterIds(
                content, knight, content.selectableSieglings().getFirst());
        String token = (String) siegeService.newRun(null, knight.getId(), warband, "STANDARD").get("token");
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        siegeService.enterNode(token, run.reachableNodeIds().stream().findFirst().orElseThrow());
        assertNotNull(run.getBattle(), "row 0 is a battle node");
        return token;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> battle(Map<String, Object> state) {
        return (Map<String, Object>) state.get("battle");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> pile(Map<String, Object> battle, String key) {
        return (List<Map<String, Object>>) battle.get(key);
    }

    @Test
    void deckAndDiscardAreSerializedAsReadableCards() {
        String token = startRunInBattle();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        SiegeBattle battle = run.getBattle();

        // A starter hand can swallow the whole deck, so play a card to be sure
        // there is something in each list worth reading.
        SiegeCard played = battle.getHand().stream()
                .filter(c -> c.getSpec().effect() != Effect.EVOLVE).findFirst().orElseThrow();
        String foe = battle.living(Side.ENEMY).getFirst().getId();
        siegeService.playCard(token, played.getInstanceId(), foe);

        Map<String, Object> b = battle(siegeService.state(token));
        List<Map<String, Object>> deck = pile(b, "deck");
        List<Map<String, Object>> discard = pile(b, "discard");
        assertNotNull(deck);
        assertEquals(b.get("deckCount"), deck.size(), "deck list matches the HUD counter");
        assertEquals(b.get("discardCount"), discard.size(), "discard list matches the HUD counter");
        assertFalse(discard.isEmpty(), "the card just played is in the discard");

        Map<String, Object> card = discard.getFirst();
        assertEquals(played.getInstanceId(), card.get("instanceId"));
        for (String field : List.of("instanceId", "name", "element", "effect",
                "value", "target", "actionCost", "description", "ownerId", "ownerName")) {
            assertNotNull(card.get(field), field + " is on a pile card face");
        }
        assertFalse(card.containsKey("playable"), "pile cards are a reference, not a play");
    }

    @Test
    void drawPileIsSortedRatherThanInDrawOrder() {
        String token = startRunInBattle();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        SiegeBattle battle = run.getBattle();
        // Force cards back into the draw pile so there is an order to compare.
        battle.getDeck().addAll(new ArrayList<>(battle.getHand()));
        battle.getHand().clear();
        assertFalse(battle.getDeck().isEmpty());

        List<Map<String, Object>> deck = pile(battle(siegeService.state(token)), "deck");
        List<String> wireNames = deck.stream()
                .map(c -> c.get("ownerId") + "|" + c.get("name")).toList();
        List<String> expected = new ArrayList<>(battle.getDeck().stream()
                .map(c -> c.getOwnerId() + "|" + c.getSpec().name()).toList());
        expected.sort(null);
        assertEquals(expected, wireNames, "wire order is sorted by owner then card name");
    }

    @Test
    void discardRunsMostRecentFirst() {
        String token = startRunInBattle();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        SiegeBattle battle = run.getBattle();
        String foe = battle.living(Side.ENEMY).getFirst().getId();
        List<SiegeCard> plays = battle.getHand().stream()
                .filter(c -> c.getSpec().effect() != Effect.EVOLVE
                        && c.getSpec().actionCost() == 0).limit(2).toList();
        assertTrue(plays.size() >= 2, "the starter hand has two free plays");
        for (SiegeCard c : plays) siegeService.playCard(token, c.getInstanceId(), foe);

        List<Map<String, Object>> discard = pile(battle(siegeService.state(token)), "discard");
        assertEquals(run.getBattle().getDiscard().size(), discard.size());
        assertEquals(plays.get(1).getInstanceId(), discard.getFirst().get("instanceId"),
                "the most recently played card reads first");
    }
}
