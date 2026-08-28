package com.sieglings.adventure;

import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A level-up pays a Siegeling three ways: flat max HP, a full heal, and one of
 * three of its own cards amplified by the player's choice. Driven through a real
 * won battle so the offer, the pick and the rewritten deck all go through the
 * paths the client actually hits.
 */
@SpringBootTest
class SiegeLevelUpAmpTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    private static final String SWAP_MOVE_ID = "test-move-link";

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

    /** Wins the current battle outright and collects the post-battle state. */
    private Map<String, Object> winBattle(String token, SiegeRun run) {
        for (Combatant foe : run.getBattle().getCombatants()) {
            if (foe.getSide() == Side.ENEMY) foe.setHp(0);
        }
        siegeService.endTurn(token);
        return siegeService.continueRun(token, null);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> ampChoice(Map<String, Object> state) {
        return (Map<String, Object>) state.get("ampChoice");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> options(Map<String, Object> offer) {
        return (List<Map<String, Object>>) offer.get("options");
    }

    @Test
    void levellingGrantsHpAFullHealAndAThreeCardAmpChoice() {
        String token = startRunInBattle();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        Combatant hero = run.getParty().getFirst();

        // A swap move in the deck proves the swap-only amplifications are offered.
        run.getDeckTemplates().add(new SiegeCard(hero.getId() + "-swap", hero.getId(),
                new AbilitySpec(SWAP_MOVE_ID, "Move Link", Element.NEUTRAL, Effect.SWAP, 0,
                        TargetKind.ALLY_SINGLE, 1, "Trade notches with an ally.")));

        // One XP short of level 2, and wounded, so both level-up payouts show.
        hero.addXp(SiegeTuning.xpForLevel(2) - hero.getXp() - 1);
        int maxHpBefore = hero.getMaxHp();
        hero.setHp(1);

        Map<String, Object> state = winBattle(token, run);

        assertEquals(2, hero.getLevel(), "the battle XP must carry the hero to level 2");
        assertTrue(hero.getMaxHp() >= maxHpBefore + SiegeTuning.LEVELUP_BONUS_HP,
                "a level-up pays flat max HP on top of the curve: " + maxHpBefore + " -> " + hero.getMaxHp());
        assertEquals(hero.getMaxHp(), hero.getHp(), "a level-up heals the unit to full");

        Map<String, Object> offer = ampChoice(state);
        assertNotNull(offer, "a levelled Siegeling must be offered an amplification");
        assertEquals(hero.getId(), offer.get("unitId"));
        List<Map<String, Object>> opts = options(offer);
        assertEquals(3, opts.size(), "the player picks one of three cards: " + opts);
        assertEquals(3, opts.stream().map(o -> o.get("id")).distinct().count(), "options must be distinct");

        // Swap cards cannot grow a magnitude, so they are offered a rider or a cheaper cost.
        List<Map<String, Object>> swapOpts = opts.stream()
                .filter(o -> SWAP_MOVE_ID.equals(o.get("moveId"))).toList();
        for (Map<String, Object> o : swapOpts) {
            assertTrue(List.of("COST", "SWAP_HEAL", "SWAP_SHIELD", "SWAP_ATTACK").contains(o.get("kind")),
                    "a swap amp must be a cost cut or a rider, never a bigger number: " + o);
        }
        for (Map<String, Object> o : opts) {
            if (SWAP_MOVE_ID.equals(o.get("moveId"))) continue;
            assertTrue(List.of("VALUE", "COST").contains(o.get("kind")),
                    "a normal amp raises the value or drops the cost: " + o);
        }
    }

    @Test
    void pickingAnAmpRewritesEveryCopyOfThatCardForTheRestOfTheRun() {
        String token = startRunInBattle();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        Combatant hero = run.getParty().getFirst();
        run.getDeckTemplates().add(new SiegeCard(hero.getId() + "-swap", hero.getId(),
                new AbilitySpec(SWAP_MOVE_ID, "Move Link", Element.NEUTRAL, Effect.SWAP, 0,
                        TargetKind.ALLY_SINGLE, 1, "Trade notches with an ally.")));
        hero.addXp(SiegeTuning.xpForLevel(2) - hero.getXp() - 1);

        Map<String, Object> state = winBattle(token, run);
        Map<String, Object> offer = ampChoice(state);
        assertNotNull(offer);
        Map<String, Object> pick = options(offer).getFirst();
        String moveId = String.valueOf(pick.get("moveId"));
        AbilitySpec before = run.getDeckTemplates().stream()
                .filter(c -> c.getSpec().id().equals(moveId)).findFirst().orElseThrow().getSpec();

        Map<String, Object> after = siegeService.chooseAmp(token, String.valueOf(pick.get("id")));

        List<SiegeCard> copies = run.getDeckTemplates().stream()
                .filter(c -> c.getOwnerId().equals(hero.getId()) && c.getSpec().id().equals(moveId)).toList();
        assertTrue(copies.size() >= 1, "the move must still be in the deck");
        for (SiegeCard copy : copies) {
            AbilitySpec spec = copy.getSpec();
            boolean stronger = spec.value() > before.value()
                    || spec.actionCost() < before.actionCost()
                    || spec.hasRider();
            assertTrue(stronger, "every copy of the picked card must be amplified: " + spec);
            assertTrue(spec.name().endsWith("★"), "an amplified card is marked: " + spec.name());
        }
        assertNull(ampChoice(after), "one Siegeling, one pick — the offer is spent");
    }

    @Test
    void aSwapRiderPaysBothSiegelingsWhenTheMoveResolves() {
        String token = startRunInBattle();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        SiegeBattle battle = run.getBattle();
        List<Combatant> allies = battle.living(Side.PLAYER);
        if (allies.size() < 2) return; // a solo warband cannot trade notches

        Combatant mover = allies.get(0), partner = allies.get(1);
        mover.setHp(Math.max(1, mover.getMaxHp() - 12));
        partner.setHp(Math.max(1, partner.getMaxHp() - 12));
        int moverHp = mover.getHp(), partnerHp = partner.getHp();

        SiegeCard amped = new SiegeCard("swap-amped", mover.getId(),
                new AbilitySpec(SWAP_MOVE_ID, "Move Link ★", Element.NEUTRAL, Effect.SWAP, 0,
                        TargetKind.ALLY_SINGLE, 0, "Trade notches with an ally.",
                        null, 0, AmpRider.HEAL, SiegeTuning.AMP_SWAP_HEAL));
        battle.getHand().add(amped);

        siegeService.playCard(token, amped.getInstanceId(), partner.getId());

        assertTrue(mover.getHp() > moverHp, "the HEAL rider must heal the mover: " + moverHp + " -> " + mover.getHp());
        assertTrue(partner.getHp() > partnerHp,
                "the HEAL rider must heal its partner too: " + partnerHp + " -> " + partner.getHp());
    }

    @Test
    void upgradingAnAmpedSwapStillPaysTheRider() {
        String token = startRunInBattle();
        SiegeRun run = siegeService.lookup(token).orElseThrow();
        SiegeBattle battle = run.getBattle();
        List<Combatant> allies = battle.living(Side.PLAYER);
        if (allies.size() < 2) return;

        Combatant mover = allies.get(0), partner = allies.get(1);
        mover.setHp(Math.max(1, mover.getMaxHp() - 12));
        partner.setHp(Math.max(1, partner.getMaxHp() - 12));
        int moverHp = mover.getHp(), partnerHp = partner.getHp();

        AbilitySpec amped = new AbilitySpec(SWAP_MOVE_ID, "Move Link ★", Element.NEUTRAL, Effect.SWAP, 0,
                TargetKind.ALLY_SINGLE, 0, "Trade notches with an ally.",
                null, 0, AmpRider.HEAL, SiegeTuning.AMP_SWAP_HEAL);
        SiegeCard upgraded = new SiegeCard("swap-amped-up", mover.getId(), content.upgradeSpec(amped));
        battle.getHand().add(upgraded);

        siegeService.playCard(token, upgraded.getInstanceId(), partner.getId());

        assertTrue(mover.getHp() > moverHp,
                "chiseling an amped swap must still heal the mover: " + moverHp + " -> " + mover.getHp());
        assertTrue(partner.getHp() > partnerHp,
                "chiseling an amped swap must still heal its partner: " + partnerHp + " -> " + partner.getHp());
    }
}
