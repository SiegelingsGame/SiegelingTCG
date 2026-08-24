package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.SieglingSize;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Battlefield sprites are sized by the card's authored size band — the dashboard
 * field the Keep already sizes residents by — not by evolution depth. The reported
 * failures were both units drawn from a card they do not "own": a boss wearing
 * stage-3 art and a rented Kilokong marked LARGE, each rendering starter-sized
 * because the payload carried nothing the client could size them from.
 */
@SpringBootTest
class SiegeSpriteSizeTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private String startRun() {
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        List<String> warband = SiegeStarterTestSupport.starterIds(
                content, knight, content.selectableSieglings().getFirst());
        return (String) siegeService.newRun(null, knight.getId(), warband, "STANDARD").get("token");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> enterFirstBattle(String token) {
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        int firstNode = run.reachableNodeIds().stream().findFirst().orElseThrow();
        Map<String, Object> state = siegeService.enterNode(token, firstNode);
        Map<String, Object> battle = (Map<String, Object>) state.get("battle");
        assertNotNull(battle, "entering a battle node starts a battle");
        return battle;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> unitsOf(Map<String, Object> battle) {
        List<Map<String, Object>> units = new ArrayList<>();
        units.addAll((List<Map<String, Object>>) battle.get("allies"));
        units.addAll((List<Map<String, Object>>) battle.get("enemies"));
        return units;
    }

    /** The band the client keys off must be on every unit, on both sides. */
    @Test
    void everyBattlefieldUnitReportsASizeBand() {
        List<Map<String, Object>> units = unitsOf(enterFirstBattle(startRun()));
        assertTrue(units.size() >= 2, "expected allies and foes, got " + units.size());
        List<String> bands = List.of("SMALL", "MEDIUM", "LARGE", "GIGANTIC");
        int checked = 0;
        for (Map<String, Object> u : units) {
            // The classpath catalog carries no art, so foes fall back to synthetic
            // names and have no card to size from — allies always do.
            if (u.get("artUrl") == null && !"PLAYER".equals(u.get("side"))) continue;
            Object size = u.get("size");
            assertNotNull(size, "no size band on " + u.get("name"));
            assertTrue(bands.contains(size), "unknown band " + size + " on " + u.get("name"));
            checked++;
        }
        assertTrue(checked > 0, "the run produced no sizeable unit — the test proved nothing");
    }

    /**
     * The band has to be the card's, not a constant: a unit's size must track the
     * dashboard field, which is what a stage-1 bruiser marked LARGE depends on.
     */
    @Test
    void theBandMatchesTheCardTheUnitIsDrawnFrom() {
        int checked = 0;
        for (Map<String, Object> u : unitsOf(enterFirstBattle(startRun()))) {
            String cardId = (String) u.get("sourceCardId");
            if (cardId == null) continue;
            SieglingCard card = content.findAnySiegling(cardId).orElse(null);
            if (card == null) continue;
            SieglingSize expected = card.getSize() != null ? card.getSize()
                    : SieglingSize.defaultFor(card.getRarity(), content.stageOf(card) - 1);
            assertEquals(expected.name(), u.get("size"),
                    "the band served for " + u.get("name") + " is not its card's");
            checked++;
        }
        assertTrue(checked > 0, "no unit resolved to a card — the test proved nothing");
    }

    /**
     * A merc carries no sourceCardId on purpose (it must not be offered evolution
     * cards), so before artCardId existed there was nothing to resolve a band from
     * and every rental rendered at the default size.
     */
    @Test
    void aMercIsSizedFromItsOwnCard() {
        SieglingCard card = content.selectableSieglings().stream()
                .filter(s -> s.getSize() != null || s.getRarity() != null)
                .findFirst().orElseThrow();
        Combatant merc = content.toMercCombatant(card);
        assertEquals(card.getId(), merc.getDisplayCardId(),
                "a merc has to resolve back to the card it was hired from");
    }
}
