package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Encounter shape: every Siege battle fields a squad of 2–3 foes (bosses and
 * elites bring minions rather than standing alone), and the squad's combined
 * HP/damage stays in the same band the old one-or-two-foe encounter occupied.
 *
 * <p>Spring-wired because {@link SiegeContentService#generateEnemies} reaches the
 * card catalog for shade art. The classpath catalog carries no uploaded art (that
 * only ever arrives from the dashboard — see {@code SiegeShadeEnemyTest}), so every
 * foe here falls back to a synthetic themed name, which is the path the name and
 * element assertions below read.
 */
@SpringBootTest
class SiegeEnemySquadTest {

    @Autowired
    private SiegeContentService content;

    /** A spread of depths rather than every floor: each call walks the card catalog. */
    private static final int[] FLOORS = { 1, 4, 7, 10 };

    private static final List<Element> PALETTE = List.of(
            Element.FIRE, Element.WATER, Element.EARTH, Element.WIND, Element.ICE);

    /** What a single rank-and-file foe used to be worth at this floor/party size. */
    private static double soloBaselineHp(int floor, int partySize) {
        return (30 + floor * 9 + 4.5) * (0.48 + 0.175 * partySize);
    }

    private List<Combatant> squad(NodeType type, int floor, int partySize, long seed) {
        return content.generateEnemies(type, floor, partySize, 1, new Random(seed), PALETTE);
    }

    // ---- Squad size -------------------------------------------------------

    @Test
    void everyEncounterFieldsTwoOrThreeFoes() {
        for (NodeType type : List.of(NodeType.BATTLE, NodeType.ELITE, NodeType.BOSS)) {
            for (int floor : FLOORS) {
                for (int partySize = 1; partySize <= 3; partySize++) {
                    for (long seed = 0; seed < 3; seed++) {
                        int size = squad(type, floor, partySize, seed).size();
                        assertTrue(size >= 2 && size <= 3,
                                type + " floor " + floor + " party " + partySize + " fielded " + size + " foes");
                    }
                }
            }
        }
    }

    /** The opener is pinned, but it is still a squad — see SiegeTuning. */
    @Test
    void theOpeningFightIsAPairToo() {
        assertTrue(SiegeTuning.OPENING_FIGHT_FOES >= 2 && SiegeTuning.OPENING_FIGHT_FOES <= 3,
                "the fixed opener must field a squad like every other battle");
        List<Combatant> opener = content.generateOpeningEnemies(new Random(11), PALETTE);
        assertEquals(SiegeTuning.OPENING_FIGHT_FOES, opener.size());
        // Difficulty parity with the single 30 HP / 5 damage foe it replaced: the
        // split pair is worth ~15% more raw, which the focus-fire decay gives back.
        int totalHp = opener.stream().mapToInt(Combatant::getMaxHp).sum();
        assertTrue(totalHp >= 30 && totalHp <= 40, "opener total HP drifted: " + totalHp);
    }

    @Test
    void bossesAndElitesBringMinionsBehindOneLeader() {
        for (NodeType type : List.of(NodeType.BOSS, NodeType.ELITE)) {
            for (long seed = 0; seed < 5; seed++) {
                List<Combatant> foes = squad(type, 6, 3, seed);
                assertEquals(3, foes.size(), type + " should field a leader plus two minions");
                assertEquals(1, foes.stream().filter(Combatant::isLeader).count(),
                        type + " should have exactly one leader");
                assertTrue(foes.getFirst().isLeader(), "the leader leads the line");
                // The headline foe is the one worth focusing: tougher and harder hitting.
                for (int i = 1; i < foes.size(); i++) {
                    assertTrue(foes.getFirst().getMaxHp() > foes.get(i).getMaxHp(),
                            type + " leader should outlast its minions");
                    assertTrue(topDamage(foes.getFirst()) > topDamage(foes.get(i)),
                            type + " leader should out-hit its minions");
                }
            }
        }
    }

    @Test
    void plainBattlesHaveNoLeader() {
        for (long seed = 0; seed < 5; seed++) {
            for (Combatant foe : squad(NodeType.BATTLE, 6, 3, seed)) {
                assertFalse(foe.isLeader(), "rank-and-file squads have no headline foe");
            }
        }
    }

    // ---- Budget: more bodies, proportionally weaker ones ------------------

    @Test
    void rankAndFileAreWeakerThanTheOldSoloFoe() {
        double solo = soloBaselineHp(6, 3);
        for (long seed = 0; seed < 5; seed++) {
            List<Combatant> foes = squad(NodeType.BATTLE, 6, 3, seed);
            int total = foes.stream().mapToInt(Combatant::getMaxHp).sum();
            for (Combatant foe : foes) {
                assertTrue(foe.getMaxHp() < solo * 0.85,
                        "each foe in a squad should be well under a whole old foe: " + foe.getMaxHp());
            }
            // The squad as a whole still sits inside the old 1–2 foe encounter band.
            assertTrue(total > solo && total < solo * 2.4,
                    "squad total HP " + total + " outside the old encounter band around " + solo);
        }
    }

    @Test
    void bossKeepsMostOfItsOwnStatBlock() {
        double solo = soloBaselineHp(6, 3);
        for (long seed = 0; seed < 5; seed++) {
            Combatant boss = squad(NodeType.BOSS, 6, 3, seed).getFirst();
            // ~85% of the old solo-boss block (2.2x a rank-and-file foe at segment 1).
            assertTrue(boss.getMaxHp() > solo * 1.5 && boss.getMaxHp() < solo * 2.2,
                    "boss HP " + boss.getMaxHp() + " should stay near its old stat block");
        }
    }

    // ---- Attack variety ---------------------------------------------------

    @Test
    void atMostOneSweeperPerSquad() {
        for (NodeType type : List.of(NodeType.BATTLE, NodeType.ELITE, NodeType.BOSS)) {
            for (int floor : FLOORS) {
                for (long seed = 0; seed < 4; seed++) {
                    long sweepers = squad(type, floor, 3, seed).stream()
                            .filter(f -> f.getAbilities().stream()
                                    .anyMatch(a -> a.target() == TargetKind.ALL_ENEMIES))
                            .count();
                    assertTrue(sweepers <= 1,
                            type + " floor " + floor + " gave " + sweepers + " foes a party-wide sweep");
                }
            }
        }
    }

    @Test
    void squadMatesUseDifferentElementsWhileThePaletteAllows() {
        for (long seed = 0; seed < 5; seed++) {
            List<Combatant> foes = squad(NodeType.BOSS, 6, 3, seed);
            Set<Element> elements = new HashSet<>();
            Set<String> names = new HashSet<>();
            for (Combatant foe : foes) {
                elements.add(foe.getElement());
                names.add(foe.getName());
            }
            assertEquals(foes.size(), elements.size(), "a squad should telegraph distinct elements");
            assertEquals(foes.size(), names.size(), "a squad should not repeat a name");
        }
    }

    private int topDamage(Combatant foe) {
        return foe.getAbilities().stream()
                .filter(a -> a.effect() == Effect.DAMAGE)
                .mapToInt(AbilitySpec::value).max().orElse(0);
    }
}
