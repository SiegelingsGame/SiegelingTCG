package com.sieglings.adventure;

import com.sieglings.model.Move;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Evolving has to change the cards in hand, not just animate them. The client's morph FX
 * flipped the owner's cards to the new stage and the next render pulled the untouched
 * precursor cards straight back, because the server only shuffled the new moves into the
 * deck and sent cosmetic previews.
 */
@SpringBootTest
class SiegeEvolutionHandTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    @Autowired
    private SiegeCombatEngine engine;

    @Test
    void evolvingRewritesTheOwnersCardsInHand() throws Exception {
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        SieglingCard base = content.selectableSieglings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isPresent()
                        && !playableMoveIds(s).isEmpty())
                .filter(s -> {
                    SieglingCard evo = content.evolutionOf(s.getId()).orElseThrow();
                    Set<String> evoMoves = playableMoveIds(evo);
                    return !evoMoves.isEmpty() && !evoMoves.containsAll(playableMoveIds(s));
                })
                .findFirst()
                .orElse(null);
        // The catalog must contain at least one line whose stages differ, or nothing is proved.
        assertTrue(base != null, "no evolution line with distinct stage move sets in the catalog");

        Map<String, Object> runMap = siegeService.newRun(
                null, knight.getId(), SiegeStarterTestSupport.starterIds(content, knight, base), "STANDARD");
        String token = (String) runMap.get("token");
        @SuppressWarnings("unchecked")
        String memberId = ((List<Map<String, Object>>) runMap.get("party")).getFirst().get("id").toString();

        SiegeRun run = siegeService.lookup(token).orElseThrow();
        run.getInventory().add("evolution-sigil");
        siegeService.equipItem(token, "evolution-sigil", memberId);

        Combatant ally = run.getParty().getFirst();
        SieglingCard evo = content.evolutionOf(ally.getSourceCardId()).orElseThrow();
        Set<String> baseOnly = new HashSet<>(playableMoveIds(base));
        baseOnly.removeAll(playableMoveIds(evo));

        startBattle(run, List.of(new Combatant("foe-0", "Raider", ally.getElement(), Side.ENEMY, 20, 4, null)));

        List<SiegeCard> owned = run.getBattle().getHand().stream()
                .filter(c -> memberId.equals(c.getOwnerId()))
                .toList();
        assertFalse(owned.isEmpty(), "the opening hand dealt the member no cards — nothing to check");
        for (SiegeCard card : owned) {
            String id = card.getSpec().id();
            assertFalse(baseOnly.contains(id),
                    "precursor move " + id + " is still in hand after evolving into " + evo.getName());
        }
    }

    private Set<String> playableMoveIds(SieglingCard card) {
        try {
            Method m = SiegeContentService.class.getDeclaredMethod("playableMoves", SieglingCard.class);
            m.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<Move> moves = (List<Move>) m.invoke(content, card);
            Set<String> ids = new HashSet<>();
            for (Move move : new ArrayList<>(moves)) ids.add(move.id());
            return ids;
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private void startBattle(SiegeRun run, List<Combatant> enemies) throws Exception {
        Method m = SiegeCombatEngine.class.getDeclaredMethod(
                "startBattle", SiegeRun.class, NodeType.class, List.class, Random.class);
        m.setAccessible(true);
        m.invoke(engine, run, NodeType.BATTLE, enemies, new Random(42));
    }
}
