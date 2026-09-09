package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SiegeAdvantageTest {

    @Test
    void buildsSharedOrderBySpeedThenPositionAndWrapsUsingCurrentSpeed() {
        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        battle.setPlayerActsFirst(true);
        Combatant fastFoe = unit("foe-fast", "Foe", Element.ICE, Side.ENEMY, 8, 1);
        Combatant tiedLater = unit("ally-later", "Later", Element.FIRE, Side.PLAYER, 6, 2);
        Combatant tiedEarlier = unit("ally-earlier", "Earlier", Element.EARTH, Side.PLAYER, 6, 0);
        battle.getCombatants().addAll(List.of(tiedLater, fastFoe, tiedEarlier));

        SiegeAdvantage.ensureOrder(battle);

        assertEquals(List.of("foe-fast", "ally-earlier", "ally-later"), battle.getAdvantageOrder());
        assertEquals("foe-fast", battle.getAdvantageHolderId());

        SiegeAdvantage.advance(battle);
        assertEquals("ally-earlier", battle.getAdvantageHolderId());
        tiedLater.setSpeed(12);
        SiegeAdvantage.advance(battle);
        assertEquals("ally-later", battle.getAdvantageHolderId(), "the current cycle stays frozen");
        SiegeAdvantage.advance(battle);

        assertEquals("ally-later", battle.getAdvantageHolderId(), "wrap rebuilds from current effective Speed");
        assertEquals(2, battle.getAdvantageCycle());
    }

    @Test
    void skipsDefeatedEntriesWhenPassingTheToken() {
        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        Combatant first = unit("first", "First", Element.WIND, Side.PLAYER, 9, 0);
        Combatant fallen = unit("fallen", "Fallen", Element.WATER, Side.ENEMY, 7, 0);
        Combatant third = unit("third", "Third", Element.METAL, Side.PLAYER, 5, 1);
        battle.getCombatants().addAll(List.of(first, fallen, third));
        SiegeAdvantage.ensureOrder(battle);
        fallen.setHp(0);

        SiegeAdvantage.advance(battle);

        assertEquals("third", battle.getAdvantageHolderId());
    }

    @Test
    void eachHolderKeepsAdvantageUntilItsOwnTeamCompletesATurn() {
        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        battle.setPlayerActsFirst(true);
        Combatant breezee = unit("breezee", "Breezee", Element.WIND, Side.PLAYER, 12, 0);
        Combatant draco = unit("draco", "Draco", Element.FIRE, Side.PLAYER, 10, 1);
        Combatant shellshock = unit("shellshock", "Shellshock", Element.WATER, Side.ENEMY, 8, 0);
        battle.getCombatants().addAll(List.of(draco, shellshock, breezee));
        SiegeAdvantage.ensureOrder(battle);

        assertEquals(List.of("breezee", "draco", "shellshock"), battle.getAdvantageOrder());
        assertEquals("breezee", battle.getAdvantageHolderId());

        SiegeAdvantage.advanceAfterTeamTurn(battle, Side.PLAYER);
        assertEquals("draco", battle.getAdvantageHolderId(), "the next overall Siegeling receives the token");

        SiegeAdvantage.advanceAfterTeamTurn(battle, Side.ENEMY);
        assertEquals("draco", battle.getAdvantageHolderId(),
                "Draco must keep Advantage through the enemy turn so his cards can use it");

        SiegeAdvantage.advanceAfterTeamTurn(battle, Side.PLAYER);
        assertEquals("shellshock", battle.getAdvantageHolderId());
        SiegeAdvantage.advanceAfterTeamTurn(battle, Side.PLAYER);
        assertEquals("shellshock", battle.getAdvantageHolderId(),
                "an enemy holder likewise waits for the enemy team's turn");
        SiegeAdvantage.advanceAfterTeamTurn(battle, Side.ENEMY);
        assertEquals("breezee", battle.getAdvantageHolderId());
        assertEquals(2, battle.getAdvantageCycle());
    }

    @Test
    void fireHolderAddsItsHostileRiderAfterTheCardResolves() {
        SiegeRun run = new SiegeRun("advantage-test");
        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        battle.setPhase(BattlePhase.PLAYER_INPUT);
        battle.setActionPoints(5);
        Combatant attacker = unit("draco", "Draco", Element.FIRE, Side.PLAYER, 9, 0);
        Combatant target = unit("target", "Target", Element.EARTH, Side.ENEMY, 4, 0);
        target.setMaxHp(20);
        target.setHp(20);
        battle.getCombatants().addAll(List.of(attacker, target));
        SiegeAdvantage.ensureOrder(battle);
        AbilitySpec strike = new AbilitySpec("strike", "Strike", Element.FIRE, Effect.DAMAGE, 4,
                TargetKind.ENEMY_SINGLE, 1, "Deal 4 damage.");
        battle.getHand().add(new SiegeCard("card-1", attacker.getId(), strike));
        run.setBattle(battle);

        SiegeCombatEngine.PlayResult result = new SiegeCombatEngine()
                .playCard(run, "card-1", target.getId(), new Random(1));

        assertTrue(result.ok);
        assertEquals(14, target.getHp());
        assertTrue(battle.getEvents().stream().anyMatch(e -> "advantage-trigger".equals(e.get("type"))));

        // The card's own strike must keep its projectile; only the Sear rider that
        // follows it burns. Stamping every hit would mute all of Siege's combat.
        List<Map<String, Object>> hits = battle.getEvents().stream()
                .filter(e -> "hit".equals(e.get("type"))).toList();
        assertEquals(2, hits.size(), "the strike and its Sear rider");
        assertEquals(null, hits.getFirst().get("visual"), "the card's own strike still flies");
        assertEquals("burn", hits.getLast().get("visual"), "Sear burns on the card already struck");
    }

    @Test
    void everyActiveElementHasHostileAndFriendlyInlineCopy() {
        List<Element> active = List.of(Element.FIRE, Element.ICE, Element.WATER, Element.EARTH, Element.WIND,
                Element.SHADOW, Element.ELECTRIC, Element.METAL, Element.UNDEAD, Element.PSYCHIC);
        for (Element element : active) {
            String hostile = SiegeAdvantage.riderText(element, TargetKind.ENEMY_SINGLE);
            String friendly = SiegeAdvantage.riderText(element, TargetKind.ALLY_SINGLE);
            assertNotNull(hostile, element.name());
            assertNotNull(friendly, element.name());
            assertFalse(hostile.isBlank(), element.name());
            assertFalse(friendly.isBlank(), element.name());
        }
    }

    @SuppressWarnings("unchecked")
    @Test
    void battlePayloadMarksHolderAndItsCardsWithInlineRiderCopy() throws Exception {
        SiegeRun run = new SiegeRun("payload-test");
        run.setKnightName("Knight");
        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        battle.setPhase(BattlePhase.PLAYER_INPUT);
        Combatant holder = unit("holder", "Holder", Element.WATER, Side.PLAYER, 9, 0);
        Combatant foe = unit("foe", "Foe", Element.FIRE, Side.ENEMY, 5, 0);
        battle.getCombatants().addAll(List.of(holder, foe));
        SiegeAdvantage.ensureOrder(battle);
        battle.getHand().add(new SiegeCard("card-1", holder.getId(),
                new AbilitySpec("mend", "Mend", Element.WATER, Effect.HEAL, 3,
                        TargetKind.ALLY_SINGLE, 1, "Heal 3.")));
        run.setBattle(battle);

        Method method = SiegeService.class.getDeclaredMethod("serializeBattle", SiegeRun.class, SiegeBattle.class);
        method.setAccessible(true);
        SiegeService service = new SiegeService();
        var contentField = SiegeService.class.getDeclaredField("content");
        contentField.setAccessible(true);
        contentField.set(service, new SiegeContentService());
        var engineField = SiegeService.class.getDeclaredField("engine");
        engineField.setAccessible(true);
        engineField.set(service, new SiegeCombatEngine());
        Map<String, Object> payload = (Map<String, Object>) method.invoke(service, run, battle);
        List<Map<String, Object>> hand = (List<Map<String, Object>>) payload.get("hand");

        assertEquals("holder", payload.get("advantageHolderId"));
        assertEquals(true, payload.get("advantageActiveForPlayer"));
        assertEquals(2, ((List<?>) payload.get("advantageOrder")).size());
        assertEquals(true, hand.getFirst().get("advantaged"));
        assertTrue(String.valueOf(hand.getFirst().get("advantageText")).contains("Mend"));
    }

    @Test
    void everyActiveElementExecutesBothRiderBranches() throws Exception {
        Method method = SiegeCombatEngine.class.getDeclaredMethod("applyAdvantageRider", SiegeBattle.class,
                Combatant.class, AbilitySpec.class, List.class, Random.class);
        method.setAccessible(true);
        List<Element> active = List.of(Element.FIRE, Element.ICE, Element.WATER, Element.EARTH, Element.WIND,
                Element.SHADOW, Element.ELECTRIC, Element.METAL, Element.UNDEAD, Element.PSYCHIC);

        for (Element element : active) {
            for (boolean friendly : List.of(false, true)) {
                SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
                Combatant source = unit("source", "Source", element, Side.PLAYER, 10, 0);
                Combatant target = unit("target", "Target", Element.NEUTRAL,
                        friendly ? Side.PLAYER : Side.ENEMY, 5, 1);
                target.setHp(6);
                battle.getCombatants().addAll(List.of(source, target));
                SiegeAdvantage.ensureOrder(battle);
                AbilitySpec spec = new AbilitySpec("test", "Test", element,
                        friendly ? Effect.HEAL : Effect.DAMAGE, 1,
                        friendly ? TargetKind.ALLY_SINGLE : TargetKind.ENEMY_SINGLE, 1, "Test.");

                method.invoke(new SiegeCombatEngine(), battle, source, spec, List.of(target), new Random(1));

                assertTrue(battle.getEvents().stream().anyMatch(e -> "advantage-trigger".equals(e.get("type"))),
                        element + " " + (friendly ? "friendly" : "hostile"));
            }
        }
    }

    /**
     * The Electric rider is chain lightning: the arc's projectile has to leave
     * the enemy the attack just struck, not the attacker, so the hit it emits
     * carries that card as its presentation origin.
     */
    @Test
    void electricArcLaunchesFromTheStruckTargetNotTheAttacker() throws Exception {
        Method method = SiegeCombatEngine.class.getDeclaredMethod("applyAdvantageRider", SiegeBattle.class,
                Combatant.class, AbilitySpec.class, List.class, Random.class);
        method.setAccessible(true);

        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        Combatant source = unit("source", "Source", Element.ELECTRIC, Side.PLAYER, 10, 0);
        Combatant struck = unit("struck", "Struck", Element.NEUTRAL, Side.ENEMY, 5, 0);
        Combatant bystander = unit("bystander", "Bystander", Element.NEUTRAL, Side.ENEMY, 4, 1);
        struck.setHp(6);
        bystander.setHp(4);
        battle.getCombatants().addAll(List.of(source, struck, bystander));
        SiegeAdvantage.ensureOrder(battle);
        AbilitySpec spec = new AbilitySpec("bolt", "Bolt", Element.ELECTRIC, Effect.DAMAGE, 1,
                TargetKind.ENEMY_SINGLE, 1, "Deal 1 damage.");

        method.invoke(new SiegeCombatEngine(), battle, source, spec, List.of(struck), new Random(1));

        Map<String, Object> arc = battle.getEvents().stream()
                .filter(e -> "hit".equals(e.get("type")))
                .reduce((a, b) -> b).orElse(null);
        assertNotNull(arc, "the Electric rider should arc into a second enemy");
        assertEquals("bystander", arc.get("targetId"));
        assertEquals("struck", arc.get("originId"), "the bolt jumps off the card that was hit");
        assertEquals("source", arc.get("sourceId"), "credit still belongs to the attacker");
        assertEquals(null, arc.get("visual"), "the arc really does cross the stage, so it keeps its projectile");
        assertEquals(2, bystander.getHp(), "the arc still deals its 2 damage");
    }

    /**
     * Sear and the other riders that add damage to the card the attack already
     * struck must not fire a second projectile down the path the attacker's own
     * bolt just travelled — they burn the element around the target instead.
     */
    @Test
    void sameTargetRiderDamageBurnsOnTheTargetInsteadOfFiringAProjectile() throws Exception {
        Method method = SiegeCombatEngine.class.getDeclaredMethod("applyAdvantageRider", SiegeBattle.class,
                Combatant.class, AbilitySpec.class, List.class, Random.class);
        method.setAccessible(true);
        // Every hostile rider that lands on the focus, with the HP each one needs
        // to actually fire: Reap only triggers below half HP.
        Map<Element, Integer> sameTargetRiders = Map.of(
                Element.FIRE, 6, Element.METAL, 6, Element.SHADOW, 6, Element.UNDEAD, 4);

        for (Map.Entry<Element, Integer> entry : sameTargetRiders.entrySet()) {
            Element element = entry.getKey();
            SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
            Combatant source = unit("source", "Source", element, Side.PLAYER, 10, 0);
            Combatant target = unit("target", "Target", Element.NEUTRAL, Side.ENEMY, 5, 0);
            target.setHp(entry.getValue());
            battle.getCombatants().addAll(List.of(source, target));
            SiegeAdvantage.ensureOrder(battle);
            AbilitySpec spec = new AbilitySpec("hit", "Hit", element, Effect.DAMAGE, 1,
                    TargetKind.ENEMY_SINGLE, 1, "Deal 1 damage.");

            method.invoke(new SiegeCombatEngine(), battle, source, spec, List.of(target), new Random(1));

            Map<String, Object> hit = battle.getEvents().stream()
                    .filter(e -> "hit".equals(e.get("type")))
                    .reduce((a, b) -> b).orElse(null);
            assertNotNull(hit, element + " rider should have dealt its damage");
            assertEquals("target", hit.get("targetId"), element.name());
            assertEquals("burn", hit.get("visual"),
                    element + " lands on the card already struck, so it must not fly a projectile");
            assertEquals(null, hit.get("originId"), element.name());
            assertEquals("source", hit.get("sourceId"), element + " keeps the attacker's kill credit");
        }
    }

    private static Combatant unit(String id, String name, Element element, Side side, int speed, int position) {
        Combatant c = new Combatant(id, name, element, side, 20, speed, null);
        c.setPosition(position);
        return c;
    }
}
