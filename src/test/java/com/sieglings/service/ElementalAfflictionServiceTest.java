package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.CardInstance;
import com.sieglings.model.ElementalAfflictionCatalog;
import com.sieglings.model.ElementalAfflictions;
import com.sieglings.model.GameState;
import com.sieglings.model.Player;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.ElementalAffliction;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ElementalAfflictionServiceTest {

    private final ElementalAfflictionService afflictions = new ElementalAfflictionService();
    private final EffectService effectService = new EffectService();
    private final BattleService battleService = new BattleService();
    private final EnergyService energyService = new EnergyService(new PlacementService());
    private final GameService gameService = new GameService();

    @BeforeEach
    void wire() {
        ElementalAfflictions.setEnabled(true);
        ReflectionTestUtils.setField(effectService, "elementalAfflictionService", afflictions);
        ReflectionTestUtils.setField(battleService, "effectService", effectService);
        ReflectionTestUtils.setField(battleService, "energyService", energyService);
        ReflectionTestUtils.setField(battleService, "elementalAfflictionService", afflictions);
        ReflectionTestUtils.setField(gameService, "elementalAfflictionService", afflictions);
        ReflectionTestUtils.setField(gameService, "energyService", energyService);
        ReflectionTestUtils.setField(gameService, "placementService", new PlacementService());
        ReflectionTestUtils.setField(gameService, "effectService", effectService);
    }

    @AfterEach
    void restoreToggle() {
        ElementalAfflictions.setEnabled(true);
    }

    @Test
    void masterToggleDisablesInflictAndPassiveTaxes() {
        ElementalAfflictions.setEnabled(false);
        GameState state = battleState();
        CardInstance attacker = instance("ember", Element.FIRE, 1, 0, true);
        CardInstance target = instance("frost", Element.ICE, 1, 1, false);
        target.addAfflictionStacks(ElementalAffliction.SOAK, 3, 5);
        target.addAfflictionStacks(ElementalAffliction.BURN, 2, 5);
        state.setAt(true, 1, 0, attacker);
        state.setAt(false, 1, 1, target);

        effectService.resolveAbility(state,
                Ability.damage("Ember Strike", "Deal 3", TargetType.SINGLE_ENEMY, null, 1, 3),
                attacker, true, 1, 1);

        // Weakness still applies; Soak tax and Burn inflict do not.
        assertEquals(6, target.getCurrentHealth());
        assertEquals(2, target.getAfflictionStacks(ElementalAffliction.BURN)); // pre-seeded, not increased
        assertEquals(0, afflictions.soakBonus(target));
        assertEquals(0, afflictions.shockSpendTax(attacker));

        afflictions.tickOwnerSetup(state, false);
        assertEquals(2, target.getAfflictionStacks(ElementalAffliction.BURN), "Setup ticks are off");
        assertEquals(6, target.getCurrentHealth());
    }

    @Test
    void allNonNeutralAfflictionsAreBattleEnabled() {
        assertEquals(12, ElementalAfflictionCatalog.battleEnabled().size());
    }

    @Test
    void fireDamageAppliesBurnAndTicksOnSetup() {
        GameState state = battleState();
        CardInstance attacker = instance("ember", Element.FIRE, 1, 0, true);
        CardInstance target = instance("frost", Element.ICE, 1, 1, false);
        state.setAt(true, 1, 0, attacker);
        state.setAt(false, 1, 1, target);

        effectService.resolveAbility(state,
                Ability.damage("Ember Strike", "Deal 3", TargetType.SINGLE_ENEMY, null, 1, 3),
                attacker, true, 1, 1);

        assertEquals(1, target.getAfflictionStacks(ElementalAffliction.BURN));
        // Move target to player board for owner-setup tick ownership
        state.setAt(false, 1, 1, null);
        state.setAt(true, 0, 0, target);
        target.setBoardRow(0);
        target.setBoardCol(0);
        // owner flag on instance still false — tickOwnerSetup uses board side, not owner flag
        afflictions.tickOwnerSetup(state, true);
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.BURN));
    }

    @Test
    void chillSlowsThenFreezesAtThreeAndThawsOnSetup() {
        GameState state = battleState();
        CardInstance target = instance("torch", Element.FIRE, 1, 1, true);
        target.setCurrentSpeed(5);
        state.setAt(true, 1, 1, target);

        afflictions.tryInflictFromDamage(state, target, Element.ICE, 1, false);
        afflictions.tryInflictFromDamage(state, target, Element.ICE, 1, false);
        assertEquals(3, target.getEffectiveSpeed());
        assertFalse(target.isFrozen());

        afflictions.tryInflictFromDamage(state, target, Element.ICE, 1, false);
        // The badges are spent by the freeze they triggered — Frozen replaces Chill x3.
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.CHILL));
        assertTrue(target.isFrozen());
        assertTrue(afflictions.isChillFrozen(target));

        // Ice hits on an already-frozen card must not start a fresh badge stack.
        afflictions.tryInflictFromDamage(state, target, Element.ICE, 1, false);
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.CHILL));
        assertTrue(afflictions.isChillFrozen(target));

        afflictions.tickOwnerSetup(state, true);
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.CHILL));
        assertFalse(target.isFrozen());
        assertFalse(afflictions.isChillFrozen(target));
        assertEquals(5, target.getEffectiveSpeed());
    }

    @Test
    void toxinBlocksHealAndStripsStacks() {
        GameState state = battleState();
        CardInstance target = instance("bud", Element.WIND, 1, 1, true);
        target.takeRawDamage(5);
        target.addAfflictionStacks(ElementalAffliction.TOXIN, 3, 5);
        state.setAt(true, 1, 1, target);

        int restored = afflictions.applyHealWithToxin(state, target, 2);
        assertEquals(0, restored);
        assertEquals(1, target.getAfflictionStacks(ElementalAffliction.TOXIN));
        assertEquals(5, target.getCurrentHealth());

        restored = afflictions.applyHealWithToxin(state, target, 4);
        assertEquals(0, restored);
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.TOXIN));

        restored = afflictions.applyHealWithToxin(state, target, 3);
        assertEquals(3, restored);
        assertEquals(8, target.getCurrentHealth());
    }

    @Test
    void soakAndRustModifyIncomingAttackDamage() {
        GameState state = battleState();
        CardInstance metal = instance("gear", Element.METAL, 1, 0, true);
        CardInstance target = instance("leaf", Element.WIND, 1, 1, false);
        target.addAfflictionStacks(ElementalAffliction.SOAK, 2, 5);
        target.addAfflictionStacks(ElementalAffliction.RUST, 3, 3);
        state.setAt(true, 1, 0, metal);
        state.setAt(false, 1, 1, target);

        // 2 base + weakness(Metal>Wind)+1 + soak 2 + rust 3 = 8
        effectService.resolveAbility(state,
                Ability.damage("Clang", "Deal 2", TargetType.SINGLE_ENEMY, null, 1, 2),
                metal, true, 1, 1);

        assertEquals(2, target.getCurrentHealth());
        // Rust cleared mid-hit, then Metal damage re-inflicts Rust ×1.
        assertEquals(1, target.getAfflictionStacks(ElementalAffliction.RUST));
        assertEquals(2, target.getAfflictionStacks(ElementalAffliction.SOAK));
    }

    @Test
    void insightAtThreeDrawsForInflicterAndClears() {
        GameState state = battleState();
        Player player = state.getPlayer();
        player.getDeck().add(new SpellCard("s1", "Spark", Element.FIRE, Rarity.COMMON, 0, null));
        CardInstance target = instance("mind", Element.WATER, 1, 1, false);
        state.setAt(false, 1, 1, target);

        afflictions.tryInflictFromDamage(state, target, Element.PSYCHIC, 1, true);
        afflictions.tryInflictFromDamage(state, target, Element.PSYCHIC, 1, true);
        assertEquals(2, target.getAfflictionStacks(ElementalAffliction.INSIGHT));
        assertEquals(0, player.getHand().size());

        afflictions.tryInflictFromDamage(state, target, Element.PSYCHIC, 1, true);
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.INSIGHT));
        assertEquals(1, player.getHand().size());
    }

    @Test
    void disorientRaisesOnlyLowestCostAbilityAndShockTaxesSpend() {
        CardInstance attacker = instance("shocky", Element.ELECTRIC, 1, 0, true);
        attacker.addAfflictionStacks(ElementalAffliction.DISORIENT, 2, 3);
        attacker.addAfflictionStacks(ElementalAffliction.SHOCK, 1, 5);

        Ability cheap = Ability.damage("Nip", "1", TargetType.SINGLE_ENEMY, null, 1, 1);
        cheap.setRequiredElement(Element.EARTH);
        cheap.setRequiredEnergy(1);
        Ability alsoCheap = Ability.damage("Nib", "1", TargetType.SINGLE_ENEMY, null, 1, 1);
        alsoCheap.setRequiredElement(Element.EARTH);
        alsoCheap.setRequiredEnergy(1);
        Ability dear = Ability.damage("Slam", "4", TargetType.SINGLE_ENEMY, null, 1, 4);
        dear.setRequiredElement(Element.EARTH);
        dear.setRequiredEnergy(3);
        List<Ability> abs = List.of(cheap, alsoCheap, dear);

        assertEquals(3, afflictions.modifiedAbilityCost(attacker, abs, 0)); // 1 + 2 disorient
        assertEquals(1, afflictions.modifiedAbilityCost(attacker, abs, 1)); // tie → first only
        assertEquals(3, afflictions.modifiedAbilityCost(attacker, abs, 2));

        GameState state = battleState();
        state.getPlayer().setEarthEnergy(3);
        // cost 3 + shock 1 = 4 needed; only 3 available → unaffordable
        assertFalse(energyService.canAfford(state, true, Element.EARTH,
                afflictions.modifiedAbilityCost(attacker, abs, 0) + afflictions.shockSpendTax(attacker)));
        state.getPlayer().setEarthEnergy(4);
        assertTrue(energyService.canAfford(state, true, Element.EARTH,
                afflictions.modifiedAbilityCost(attacker, abs, 0) + afflictions.shockSpendTax(attacker)));
    }

    @Test
    void leechSecondEarthHitHealsAttackerForHpDamageAndClears() {
        GameState state = battleState();
        CardInstance attacker = instance("rootfang", Element.EARTH, 1, 0, true);
        CardInstance target = instance("dummy", Element.EARTH, 1, 1, false);
        attacker.takeRawDamage(6);
        state.setAt(true, 1, 0, attacker);
        state.setAt(false, 1, 1, target);
        Ability hit = Ability.damage("Root Bite", "Deal 3", TargetType.SINGLE_ENEMY, null, 1, 3);

        effectService.resolveAbility(state, hit, attacker, true, 1, 1);
        assertEquals(1, target.getAfflictionStacks(ElementalAffliction.LEECH));
        assertEquals(4, attacker.getCurrentHealth(), "first Earth hit only marks the target");

        effectService.resolveAbility(state, hit, attacker, true, 1, 1);
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.LEECH));
        assertEquals(7, attacker.getCurrentHealth(), "second hit heals for the 3 HP dealt");
    }

    @Test
    void leechSecondEarthHitUsesActualLethalDamage() {
        GameState state = battleState();
        CardInstance attacker = instance("rootfang", Element.EARTH, 1, 0, true);
        CardInstance target = instance("dummy", Element.EARTH, 1, 1, false);
        attacker.takeRawDamage(6);
        target.takeRawDamage(8);
        target.addAfflictionStacks(ElementalAffliction.LEECH, 1, 2);
        state.setAt(true, 1, 0, attacker);
        state.setAt(false, 1, 1, target);

        effectService.resolveAbility(state,
                Ability.damage("Root Bite", "Deal 3", TargetType.SINGLE_ENEMY, null, 1, 3),
                attacker, true, 1, 1);

        assertEquals(0, target.getCurrentHealth());
        assertEquals(6, attacker.getCurrentHealth(), "only the target's remaining 2 HP may be leeched");
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.LEECH));
    }

    @Test
    void toxinAbsorbsLeechHealAndBothBadgesClear() {
        GameState state = battleState();
        CardInstance attacker = instance("rootfang", Element.EARTH, 1, 0, true);
        CardInstance target = instance("dummy", Element.EARTH, 1, 1, false);
        attacker.takeRawDamage(6);
        attacker.addAfflictionStacks(ElementalAffliction.TOXIN, 2, 5);
        target.addAfflictionStacks(ElementalAffliction.LEECH, 1, 2);
        state.setAt(true, 1, 0, attacker);
        state.setAt(false, 1, 1, target);

        effectService.resolveAbility(state,
                Ability.damage("Root Bite", "Deal 3", TargetType.SINGLE_ENEMY, null, 1, 3),
                attacker, true, 1, 1);

        assertEquals(4, attacker.getCurrentHealth(), "Toxin blocks all Leech healing");
        assertEquals(0, attacker.getAfflictionStacks(ElementalAffliction.TOXIN));
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.LEECH));
    }

    @Test
    void curseBlocksClaimAndEvolve() {
        GameState state = battleState();
        state.setCurrentPhase(Phase.SETUP);
        state.setPlayerTurn(true);
        CardInstance cursed = instance("shade", Element.SHADOW, 1, 1, true);
        cursed.setBattlePhasesSeen(1);
        cursed.addAfflictionStacks(ElementalAffliction.CURSE, 1, 2);
        state.setAt(true, 1, 1, cursed);

        gameService.claimSiegling(state, true, 1, 1);
        assertEquals(cursed, state.getAt(true, 1, 1));
        assertTrue(state.getGameLog().stream().anyMatch(l -> l.contains("Cursed") && l.contains("claimed")));

        SieglingCard evo = new SieglingCard("shade-evo", "Shade Evo", Element.SHADOW, Rarity.UNCOMMON,
                12, 4, List.of(), Row.MIDDLE);
        evo.setEvolvesFromId("shade");
        state.getPlayer().getHand().add(evo);
        state.getPlayer().adjustTemporaryEnergy(Element.SHADOW, 5);
        state.captureSieglingSetupPlacementBonusFromEnergy(true);
        gameService.placeSiegling(state, true, "shade-evo", 1, 1);
        assertEquals("shade", state.getAt(true, 1, 1).getCard().getId());
        assertTrue(state.getGameLog().stream().anyMatch(l -> l.contains("Cursed") && l.contains("evolve")));
    }

    @Test
    void blindReducesOutgoingDamage() {
        GameState state = battleState();
        CardInstance attacker = instance("glare", Element.LIGHT, 1, 0, true);
        attacker.addAfflictionStacks(ElementalAffliction.BLIND, 2, 3);
        CardInstance target = instance("rock", Element.EARTH, 1, 1, false);
        state.setAt(true, 1, 0, attacker);
        state.setAt(false, 1, 1, target);

        // 5 - 2 blind = 3
        effectService.resolveAbility(state,
                Ability.damage("Flash", "Deal 5", TargetType.SINGLE_ENEMY, null, 1, 5),
                attacker, true, 1, 1);
        assertEquals(7, target.getCurrentHealth());
    }

    @Test
    void witherClampsHpOnSetup() {
        GameState state = battleState();
        CardInstance target = instance("bone", Element.UNDEAD, 1, 1, true);
        // max 10, current 10, wither 2 → clamp to 8
        target.addAfflictionStacks(ElementalAffliction.WITHER, 2, 3);
        state.setAt(true, 1, 1, target);

        afflictions.tickOwnerSetup(state, true);
        assertEquals(8, target.getCurrentHealth());
        assertEquals(0, target.getAfflictionStacks(ElementalAffliction.WITHER));
    }

    @Test
    void aiTurnTicksBurnOnItsOwnSieglings() {
        // The AI never goes through GameService.draw, so its Setup-tick afflictions
        // only fire if executeAITurn ticks them itself — otherwise Burn stacked on
        // an enemy Siegling would sit there forever.
        AIService ai = new AIService();
        ReflectionTestUtils.setField(ai, "placementService", new PlacementService());
        ReflectionTestUtils.setField(ai, "energyService", energyService);
        ReflectionTestUtils.setField(ai, "effectService", effectService);
        ReflectionTestUtils.setField(ai, "elementalAfflictionService", afflictions);

        GameState state = battleState();
        state.setPlayerTurn(false);
        CardInstance burning = instance("kindling", Element.ELECTRIC, 1, 1, false);
        burning.takeRawDamage(burning.getEffectiveMaxHealth() - 2); // 2 HP left
        burning.addAfflictionStacks(ElementalAffliction.BURN, 3, 5);
        state.setAt(false, 1, 1, burning);

        ai.executeAITurn(state);

        assertEquals(0, burning.getAfflictionStacks(ElementalAffliction.BURN));
        assertFalse(burning.isAlive(), "3 Burn stacks should finish a 2 HP Siegling");
        assertTrue(state.getEnemy().getHealth() < 50, "the burn kill should pay its bounty");
    }

    private static GameState battleState() {
        GameState state = new GameState();
        state.setPlayer(new Player("Player", true));
        state.setEnemy(new Player("Enemy", false));
        state.setCurrentPhase(Phase.BATTLE);
        state.setPlayerTurn(true);
        return state;
    }

    private static CardInstance instance(String id, Element element, int row, int col, boolean owner) {
        SieglingCard card = new SieglingCard(id, id, element, Rarity.COMMON, 10, 5, List.of(), Row.MIDDLE);
        return new CardInstance(card, row, col, owner);
    }
}
