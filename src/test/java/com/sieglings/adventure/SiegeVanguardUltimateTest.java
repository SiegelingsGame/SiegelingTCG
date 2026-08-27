package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Vanguard Charge must cancel the next enemy action even when the player acted
 * second. Statuses tick at endRound, so a 1-round STUN expires before
 * resolveEnemyTurn in that case — the same reason applyStatus uses 2 rounds.
 */
class SiegeVanguardUltimateTest {

    private SiegeCombatEngine engine;

    @BeforeEach
    void setUp() throws Exception {
        engine = new SiegeCombatEngine();
        Field content = SiegeCombatEngine.class.getDeclaredField("content");
        content.setAccessible(true);
        content.set(engine, new SiegeContentService());
    }

    private SiegeRun vanguardBattle() {
        SiegeRun run = new SiegeRun("t-vanguard");
        run.setKnightName("Gale Knight");
        run.setKnightPassive(KnightPassive.SPEED);
        run.setKnightAccountLevel(1);

        Combatant knight = new Combatant("k1", "Gale Knight", Element.WIND, Side.PLAYER, 40, 6, null, true);
        run.setKnightUnit(knight);
        Combatant ally = new Combatant("a1", "Cacty", Element.EARTH, Side.PLAYER, 50, 1, null);
        ally.setPosition(0);
        Combatant foe = new Combatant("f1", "Cinder Husk", Element.FIRE, Side.ENEMY, 40, 99, null);
        Combatant foe2 = new Combatant("f2", "Ash Whelp", Element.FIRE, Side.ENEMY, 30, 99, null);

        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        battle.setRoundNumber(1);
        battle.setPhase(BattlePhase.PLAYER_INPUT);
        battle.setActionPoints(SiegeBattle.ACTIONS_PER_TURN);
        battle.setKnightCharge(SiegeBattle.KNIGHT_ULT_COST);
        battle.setPlayerActsFirst(false);
        battle.getCombatants().add(ally);
        battle.getCombatants().add(knight);
        battle.getCombatants().add(foe);
        battle.getCombatants().add(foe2);
        run.setBattle(battle);
        return run;
    }

    @Test
    void vanguardStunOutlivesOneRoundTick() {
        SiegeRun run = vanguardBattle();
        List<Combatant> foes = List.copyOf(run.getBattle().living(Side.ENEMY));
        assertTrue(engine.useKnightUltimate(run, new Random(1)).ok);
        for (Combatant foe : foes) {
            foe.tickStatuses();
            assertTrue(foe.has(StatusKind.STUN),
                    foe.getName() + " must still be stunned after the end-of-round tick");
        }
    }

    @Test
    void vanguardStunCancelsTheNextEnemyTurnWhenTheyActFirst() {
        SiegeRun run = vanguardBattle();
        assertTrue(engine.useKnightUltimate(run, new Random(1)).ok);
        engine.endPlayerTurn(run, new Random(1));
        // Stunned enemies contribute 0 team Speed, so the next round opens as
        // the player's turn; their cancelled action is resolveEnemyTurn after
        // that turn ends.
        if (run.getBattle() != null && run.getBattle().getPhase() == BattlePhase.PLAYER_INPUT) {
            engine.endPlayerTurn(run, new Random(1));
        }
        assertTrue(run.getBattle().getLog().stream().anyMatch(line -> line.contains("skips its action")),
                "the next enemy action after Vanguard Charge must still be cancelled");
    }
}
