package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Focused coverage for the Siege in-run leveling system: the {@link SiegeTuning}
 * curve/multiplier math and {@link Combatant}'s XP → level-up → stat-scaling
 * behaviour (including the idempotency guarantee on repeated {@code applyLevel}
 * calls, which is what makes checkpoint restore safe).
 */
class SiegeLevelingTest {

    // ---- SiegeTuning.levelForXp boundaries -------------------------------

    @Test
    void levelForXpAtBoundaries() {
        assertEquals(1, SiegeTuning.levelForXp(0));    // floor
        assertEquals(1, SiegeTuning.levelForXp(49));   // just below L2
        assertEquals(2, SiegeTuning.levelForXp(50));   // exactly L2
        assertEquals(2, SiegeTuning.levelForXp(119));
        assertEquals(3, SiegeTuning.levelForXp(120));
        assertEquals(8, SiegeTuning.levelForXp(1519));
        assertEquals(9, SiegeTuning.levelForXp(1520));
        assertEquals(10, SiegeTuning.levelForXp(2000));  // cap threshold
        assertEquals(10, SiegeTuning.levelForXp(999999)); // stays capped
    }

    @Test
    void xpHelpersAreConsistent() {
        assertEquals(0, SiegeTuning.xpForLevel(1));
        assertEquals(50, SiegeTuning.xpForLevel(2));
        assertEquals(2000, SiegeTuning.xpForLevel(10));
        // xpToNext: from 0 XP you need 50 to reach L2; at cap it is 0.
        assertEquals(50, SiegeTuning.xpToNext(0));
        assertEquals(1, SiegeTuning.xpToNext(49));
        assertEquals(70, SiegeTuning.xpToNext(50));   // 120 - 50
        assertEquals(0, SiegeTuning.xpToNext(2000));
        assertEquals(0, SiegeTuning.xpToNext(5000));
    }

    // ---- Multipliers ------------------------------------------------------

    @Test
    void multipliersMatchSpec() {
        // +6% max HP / level (Siegeling).
        assertEquals(1.00, SiegeTuning.hpMultiplier(1), 1e-9);
        assertEquals(1.12, SiegeTuning.hpMultiplier(3), 1e-9);
        assertEquals(1.54, SiegeTuning.hpMultiplier(10), 1e-9);
        // +4% move value / level.
        assertEquals(1.00, SiegeTuning.moveValueMultiplier(1), 1e-9);
        assertEquals(1.20, SiegeTuning.moveValueMultiplier(6), 1e-9);
        // +5% max HP / level (Knight).
        assertEquals(1.00, SiegeTuning.knightHpMultiplier(1), 1e-9);
        assertEquals(1.45, SiegeTuning.knightHpMultiplier(10), 1e-9);
    }

    @Test
    void speedBonusUnlocksAtThreeSixNine() {
        assertEquals(0, SiegeTuning.speedBonus(1));
        assertEquals(0, SiegeTuning.speedBonus(2));
        assertEquals(1, SiegeTuning.speedBonus(3));
        assertEquals(1, SiegeTuning.speedBonus(5));
        assertEquals(2, SiegeTuning.speedBonus(6));
        assertEquals(3, SiegeTuning.speedBonus(9));
        assertEquals(3, SiegeTuning.speedBonus(10));
    }

    @Test
    void knightPassiveBonusEveryTwoLevels() {
        assertEquals(0, SiegeTuning.knightPassiveBonus(1));
        assertEquals(0, SiegeTuning.knightPassiveBonus(2));
        assertEquals(1, SiegeTuning.knightPassiveBonus(3));
        assertEquals(1, SiegeTuning.knightPassiveBonus(4));
        assertEquals(2, SiegeTuning.knightPassiveBonus(5));
        assertEquals(4, SiegeTuning.knightPassiveBonus(9));
    }

    // ---- Combatant XP + stat scaling -------------------------------------

    private Combatant siegeling(int baseMaxHp, int speed) {
        return new Combatant("ally-0-x", "Test", Element.FIRE, Side.PLAYER, baseMaxHp, speed, null);
    }

    @Test
    void gainingXpLevelsUpAndScalesFromBaseWithoutCompounding() {
        Combatant c = siegeling(100, 5);
        assertEquals(1, c.getLevel());
        assertEquals(100, c.getMaxHp());
        assertEquals(100, c.getHp());

        // 120 XP → level 3: maxHp = ceil(100 * 1.12) + 5 flat per level past 1
        // = 112 + 10 = 122, and a level-up restores the unit to full.
        int gained = c.addXp(120);
        assertEquals(2, gained);
        assertEquals(3, c.getLevel());
        assertEquals(122, c.getMaxHp());
        assertEquals(122, c.getHp());       // a level-up heals to full
        assertEquals(6, c.getSpeed());      // +1 speed at level 3

        // Re-applying the level must NOT compound the scaling (idempotent).
        c.applyLevel();
        c.applyLevel();
        assertEquals(122, c.getMaxHp());

        // loadLeveling from the same XP reproduces the exact leveled max HP.
        Combatant restored = siegeling(100, 5);
        restored.loadLeveling(c.getXp());
        assertEquals(3, restored.getLevel());
        assertEquals(122, restored.getMaxHp());
    }

    @Test
    void addBaseMaxHpFoldsIntoBaseAndSurvivesLevelUp() {
        Combatant c = siegeling(100, 5);
        c.addBaseMaxHp(20);                 // e.g. a VITALITY item at level 1
        assertEquals(120, c.getMaxHp());
        assertEquals(120, c.getBaseMaxHp());

        // Level up: scaling now derives from the raised base, not the innate 100.
        c.addXp(120);                       // → level 3
        assertEquals(3, c.getLevel());
        assertEquals(SiegeTuning.scaledMaxHp(120, 3), c.getMaxHp()); // 145, bonus preserved
        assertEquals(145, c.getMaxHp());   // ceil(120 * 1.12) = 135, plus 5 flat per level
    }

    @Test
    void killingBlowStyleTinyGainStillLevels() {
        Combatant c = siegeling(50, 4);
        assertEquals(0, c.addXp(0));        // no-op
        assertEquals(1, c.getLevel());
        c.addXp(50);                        // exactly L2
        assertEquals(2, c.getLevel());
        assertTrue(c.isLeveledRecently());
        c.setLeveledRecently(false);
        c.addXp(10);                        // still L2, no level flag
        assertEquals(2, c.getLevel());
        assertTrue(!c.isLeveledRecently());
    }

    @Test
    void knightScalesWithFivePercentPerLevel() {
        Combatant knight = new Combatant("knight-unit", "Knight", Element.ICE, Side.PLAYER, 40, 5, null, true);
        assertEquals(40, knight.getMaxHp());
        knight.loadLeveling(2000);          // level 10
        assertEquals(10, knight.getLevel());
        assertEquals(58, knight.getMaxHp()); // ceil(40 * 1.45) = 58
        // Knights get no per-level speed milestones.
        assertEquals(5, knight.leveledBaseSpeed());
    }
}
