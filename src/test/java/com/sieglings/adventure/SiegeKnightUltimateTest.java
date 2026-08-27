package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Rarity;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Every leadership class fires its own Ultimate, and both the Ultimate and the
 * battle-start passive scale with the level the account raised the SiegeKnight
 * card to in the collection.
 */
@SpringBootTest
class SiegeKnightUltimateTest {

    @Autowired
    private SiegeContentService content;

    @Autowired
    private SiegeCombatEngine engine;

    // ---- Crossover scaling ------------------------------------------------

    @Test
    void collectionLevelRaisesTheLeadershipPassive() {
        int atOne = content.knightPassiveValue(KnightPassive.SHIELD, 1, Rarity.COMMON);
        int atMax = content.knightPassiveValue(KnightPassive.SHIELD, 5, Rarity.COMMON);
        assertEquals(content.knightPassiveValue(KnightPassive.SHIELD), atOne,
                "an unlevelled Common leads at the printed value");
        assertTrue(atMax > atOne, "a levelled knight leads with a stronger passive");
    }

    @Test
    void rarityRaisesTheLeadershipPassive() {
        assertTrue(content.knightPassiveValue(KnightPassive.SHIELD, 1, Rarity.LEGENDARY)
                > content.knightPassiveValue(KnightPassive.SHIELD, 1, Rarity.COMMON));
    }

    @Test
    void marshalHeadcountNeverScales() {
        // A bigger warband would blow past the party cap, so the Marshal's extra
        // Siegeling stays one however levelled the knight is.
        assertEquals(content.knightPassiveValue(KnightPassive.MARSHAL),
                content.knightPassiveValue(KnightPassive.MARSHAL, 5, Rarity.LEGENDARY));
    }

    @Test
    void everyClassHasItsOwnUltimate() {
        for (KnightPassive kind : KnightPassive.values()) {
            String name = content.knightUltimateName(kind);
            assertNotNull(name);
            assertFalse(name.isBlank(), kind + " must name its Ultimate");
            assertFalse(content.knightUltimateDescription(kind, 1, Rarity.COMMON, 1).isBlank(),
                    kind + " must describe its Ultimate");
        }
        assertEquals(KnightPassive.values().length,
                java.util.Arrays.stream(KnightPassive.values())
                        .map(content::knightUltimateName).distinct().count(),
                "no two classes share an Ultimate");
    }

    @Test
    void ultimateMagnitudeGrowsWithStanding() {
        int weak = content.knightUltimateValue(KnightPassive.HEALTH, 1, Rarity.COMMON, 1);
        int strong = content.knightUltimateValue(KnightPassive.HEALTH, 5, Rarity.LEGENDARY, 10);
        assertTrue(strong > weak, "level, rarity and run level all feed the Ultimate");
    }

    // ---- Firing each Ultimate --------------------------------------------

    private SiegeRun runLedBy(KnightPassive passive) {
        TrainerCard knight = content.selectableKnights().stream()
                .filter(k -> content.knightPassiveKind(k) == passive)
                .findFirst().orElse(null);
        if (knight == null) return null;
        SiegeRun run = new SiegeRun("t-" + passive);
        run.setKnightId(knight.getId());
        run.setKnightName(knight.getName());
        run.setKnightElement(knight.getElement());
        run.setKnightRarity(knight.getRarity());
        run.setKnightAccountLevel(3);
        run.setKnightPassive(passive);
        run.setKnightPassiveValue(content.knightPassiveValue(passive, 3, knight.getRarity()));
        run.setKnightUnit(content.toKnightCombatant(knight));
        List<SieglingCard> starters = content.selectableSieglings();
        for (int i = 0; i < Math.min(2, starters.size()); i++) {
            Combatant member = content.toPartyCombatant(starters.get(i), i);
            run.getParty().add(member);
            run.getDeckTemplates().addAll(content.deckCardsFor(starters.get(i), member.getId()));
        }
        Random rng = new Random(7);
        engine.startBattle(run, NodeType.BATTLE,
                content.generateOpeningEnemies(rng, List.of(knight.getElement())), rng);
        run.getBattle().setKnightCharge(SiegeBattle.KNIGHT_ULT_COST);
        return run;
    }

    @Test
    void wardenUltimateHealsTheWarband() {
        SiegeRun run = runLedBy(KnightPassive.HEALTH);
        if (run == null) return;
        Combatant ally = run.getBattle().living(Side.PLAYER).stream()
                .filter(c -> !c.isKnight()).findFirst().orElseThrow();
        ally.setHp(1);
        assertTrue(engine.useKnightUltimate(run, new Random(1)).ok);
        assertTrue(ally.getHp() > 1, "the Warden Ultimate heals the line");
    }

    @Test
    void bulwarkUltimateShieldsTheWarband() {
        SiegeRun run = runLedBy(KnightPassive.SHIELD);
        if (run == null) return;
        Combatant ally = run.getBattle().living(Side.PLAYER).stream()
                .filter(c -> !c.isKnight()).findFirst().orElseThrow();
        int before = ally.getShield();
        assertTrue(engine.useKnightUltimate(run, new Random(1)).ok);
        assertTrue(ally.getShield() > before, "the Bulwark Ultimate stacks a heavy shield");
    }

    @Test
    void warlordUltimateTearsPercentageHpOffEveryEnemy() {
        SiegeRun run = runLedBy(KnightPassive.ATTACK);
        if (run == null) return;
        List<Combatant> foes = List.copyOf(run.getBattle().living(Side.ENEMY));
        int before = foes.stream().mapToInt(Combatant::getHp).sum();
        assertTrue(engine.useKnightUltimate(run, new Random(1)).ok);
        int after = run.getBattle().getCombatants().stream()
                .filter(c -> c.getSide() == Side.ENEMY).mapToInt(Combatant::getHp).sum();
        assertTrue(after < before, "the Warlord Ultimate hits the whole enemy line");
    }

    @Test
    void vanguardUltimateStunsEveryEnemyAndQuickensTheLine() {
        SiegeRun run = runLedBy(KnightPassive.SPEED);
        if (run == null) return;
        Combatant ally = run.getBattle().living(Side.PLAYER).stream()
                .filter(c -> !c.isKnight()).findFirst().orElseThrow();
        int speedBefore = ally.getSpeed();
        List<Combatant> foes = List.copyOf(run.getBattle().living(Side.ENEMY));
        assertTrue(engine.useKnightUltimate(run, new Random(1)).ok);
        assertTrue(ally.getSpeed() > speedBefore, "allies speed up");
        for (Combatant foe : foes) {
            assertTrue(foe.has(StatusKind.STUN), foe.getName() + " should lose its next action");
        }
    }

    @Test
    void quartermasterUltimateFindsAnItem() {
        SiegeRun run = runLedBy(KnightPassive.LOOT);
        if (run == null) return;
        int before = run.getInventory().size();
        assertTrue(engine.useKnightUltimate(run, new Random(1)).ok);
        assertTrue(run.getInventory().size() > before, "the baggage train yields gear");
    }

    @Test
    void marshalUltimateSpendsChargeAndAlwaysDoesSomething() {
        SiegeRun run = runLedBy(KnightPassive.MARSHAL);
        if (run == null) return;
        int logBefore = run.getBattle().getLog().size();
        assertTrue(engine.useKnightUltimate(run, new Random(1)).ok);
        assertEquals(0, run.getBattle().getKnightCharge(), "the Ultimate spends the Charge");
        assertTrue(run.getBattle().getLog().size() > logBefore,
                "a free evolution — or its fallback — is always announced");
    }

    @Test
    void ultimateRefusesWithoutCharge() {
        SiegeRun run = runLedBy(KnightPassive.HEALTH);
        if (run == null) return;
        run.getBattle().setKnightCharge(0);
        assertFalse(engine.useKnightUltimate(run, new Random(1)).ok);
    }
}
