package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Post-battle spoils must sometimes include an evolution sigil — the item that
 * starts a Siegeling's next battle already evolved — and only when somebody in
 * the warband can actually equip it.
 */
@SpringBootTest
class SiegeSigilRewardTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private String newRunWith(SieglingCard starter) {
        TrainerCard knight = content.selectableKnights().stream()
                .filter(k -> "squire-bob".equalsIgnoreCase(k.getId()))
                .findFirst()
                .orElseGet(() -> content.selectableKnights().getFirst());
        Map<String, Object> run = siegeService.newRun(null, knight.getId(), List.of(starter.getId()), "STANDARD");
        return (String) run.get("token");
    }

    private void generateRewards(SiegeRun run, boolean elite) throws Exception {
        Method m = SiegeService.class.getDeclaredMethod("generateRewards", SiegeRun.class, boolean.class);
        m.setAccessible(true);
        m.invoke(siegeService, run, elite);
    }

    @Test
    void evolvingWarbandsAreSometimesOfferedAnEvolutionSigil() throws Exception {
        SieglingCard evolving = content.selectableSieglings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isPresent())
                .findFirst()
                .orElseThrow();
        SiegeRun run = siegeService.lookup(newRunWith(evolving)).orElseThrow();

        RewardOption sigil = null;
        // The offer is deliberately occasional, so sample enough elite rolls that
        // a working generator is overwhelmingly likely to produce one.
        for (int i = 0; i < 400 && sigil == null; i++) {
            run.getInventory().clear();
            generateRewards(run, true);
            sigil = run.getPendingRewards().stream()
                    .filter(o -> "ITEM".equals(o.kind()))
                    .findFirst().orElse(null);
        }

        assertNotNull(sigil, "an evolving warband should sometimes be offered an evolution sigil");
        SiegeItem item = content.findItem(sigil.itemId());
        assertNotNull(item, "the offered item resolves in the catalog");
        assertTrue(item.evolutionSigil(), "item rewards are evolution sigils, got " + item.kind());
    }

    @Test
    void chosenSigilLandsInTheInventory() throws Exception {
        SieglingCard evolving = content.selectableSieglings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isPresent())
                .findFirst()
                .orElseThrow();
        String token = newRunWith(evolving);
        SiegeRun run = siegeService.lookup(token).orElseThrow();

        RewardOption sigil = null;
        for (int i = 0; i < 400 && sigil == null; i++) {
            run.getInventory().clear();
            generateRewards(run, true);
            sigil = run.getPendingRewards().stream()
                    .filter(o -> "ITEM".equals(o.kind()))
                    .findFirst().orElse(null);
        }
        assertNotNull(sigil);

        siegeService.chooseReward(token, sigil.id());
        assertTrue(run.getInventory().contains(sigil.itemId()),
                "picking the sigil puts it in the pack");
        // And it is then equippable on the Siegeling that can evolve.
        String memberId = run.getParty().getFirst().getId();
        siegeService.equipItem(token, sigil.itemId(), memberId);
        assertEquals(sigil.itemId(), run.getParty().getFirst().getItemId());
    }

    @Test
    void warbandsWithNoEvolutionPathAreNeverOfferedASigil() throws Exception {
        SieglingCard terminal = content.selectableSieglings().stream()
                .filter(s -> content.evolutionOf(s.getId()).isEmpty())
                .findFirst()
                .orElse(null);
        if (terminal == null) return; // every catalog Siegeling evolves
        SiegeRun run = siegeService.lookup(newRunWith(terminal)).orElseThrow();

        for (int i = 0; i < 400; i++) {
            run.getInventory().clear();
            generateRewards(run, true);
            assertFalse(run.getPendingRewards().stream().anyMatch(o -> "ITEM".equals(o.kind())),
                    "a warband with no evolution path must not be offered a dead sigil");
        }
    }
}
