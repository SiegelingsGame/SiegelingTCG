package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.CardInstance;
import com.sieglings.model.ElementalAfflictionCatalog;
import com.sieglings.model.ElementalAfflictionDef;
import com.sieglings.model.ElementalAfflictions;
import com.sieglings.model.GameState;
import com.sieglings.model.Player;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.ElementalAffliction;
import com.sieglings.model.enums.StatusEffect;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Battle-table runtime for elemental damage afflictions.
 * Design data: {@link ElementalAfflictionCatalog} / {@code docs/ELEMENTAL_STATUS_EFFECTS.md}.
 * Master switch: {@code app.battle.elemental-afflictions-enabled} → {@link ElementalAfflictions}.
 */
@Service
public class ElementalAfflictionService {

    @Value("${app.battle.elemental-afflictions-enabled:true}")
    private boolean configuredEnabled = true;

    @PostConstruct
    void applyConfiguredToggle() {
        ElementalAfflictions.setEnabled(configuredEnabled);
    }

    public boolean isEnabled() {
        return ElementalAfflictions.isEnabled();
    }

    /**
     * After elemental damage deals HP, apply that element's affliction badge and
     * fire stack-threshold payoffs (Insight draw, Chill→Freeze).
     */
    public void tryInflictFromDamage(
            GameState state,
            CardInstance target,
            Element damageElement,
            int hpDamageDealt,
            boolean inflicterIsPlayer
    ) {
        if (!isEnabled() || state == null || target == null || !target.isAlive() || hpDamageDealt <= 0) {
            return;
        }
        ElementalAfflictionDef def = ElementalAfflictionCatalog.forElement(damageElement).orElse(null);
        if (def == null || !def.battleEnabled()) {
            return;
        }
        int stacks = target.addAfflictionStacks(def.affliction(), def.stacksPerHit(), def.stackCap());
        if (stacks <= 0) {
            return;
        }
        state.log(target.getName() + " is afflicted with " + def.displayName()
                + " (" + def.shortLabel() + " x" + stacks + ").");

        if (def.affliction() == ElementalAffliction.CHILL && stacks >= def.stackCap()) {
            target.getStatusEffects().add(StatusEffect.FREEZE);
            state.log(target.getName() + " is Frozen by Chill!");
        }
        if (def.affliction() == ElementalAffliction.INSIGHT && stacks >= def.stackCap()) {
            resolveInsightPayoff(state, target, inflicterIsPlayer);
        }
    }

    /** Legacy overload — Insight draw goes to the non-owner of the target when unknown. */
    public void tryInflictFromDamage(GameState state, CardInstance target, Element damageElement, int hpDamageDealt) {
        boolean inflicterIsPlayer = target == null || !target.isOwner();
        tryInflictFromDamage(state, target, damageElement, hpDamageDealt, inflicterIsPlayer);
    }

    public void tickOwnerSetup(GameState state, boolean ownerSide) {
        if (!isEnabled() || state == null) return;
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                CardInstance ci = state.getAt(ownerSide, r, c);
                if (ci == null || !ci.isAlive()) continue;
                tickBurnOnSetup(state, ci);
                tickWitherOnSetup(state, ci);
                thawChillOnSetup(state, ci);
            }
        }
        state.removeDeadSieglings();
    }

    public boolean hasCurse(CardInstance ci) {
        return isEnabled() && ci != null && ci.getAfflictionStacks(ElementalAffliction.CURSE) > 0;
    }

    public boolean isChillFrozen(CardInstance ci) {
        return isEnabled() && ci != null && ci.getAfflictionStacks(ElementalAffliction.CHILL) >= 3;
    }

    public boolean isStaggeredToBack(CardInstance ci) {
        return isEnabled() && ci != null && ci.getAfflictionStacks(ElementalAffliction.STAGGER) >= 2;
    }

    public int chillSpeedPenalty(CardInstance ci) {
        if (!isEnabled() || ci == null) return 0;
        return ci.getAfflictionStacks(ElementalAffliction.CHILL);
    }

    public int soakBonus(CardInstance target) {
        if (!isEnabled() || target == null) return 0;
        return target.getAfflictionStacks(ElementalAffliction.SOAK);
    }

    /**
     * Bonus damage from Rust when the hit is Metal; clears Rust after contributing.
     */
    public int rustBonusAndClear(GameState state, CardInstance target, Element damageElement) {
        if (!isEnabled() || target == null || damageElement != Element.METAL) {
            return 0;
        }
        int rust = target.getAfflictionStacks(ElementalAffliction.RUST);
        if (rust <= 0) {
            return 0;
        }
        target.clearAffliction(ElementalAffliction.RUST);
        if (state != null) {
            state.log(target.getName() + "'s Rust shatters (+" + rust + " from Metal)!");
        }
        return rust;
    }

    /** Blind reduces outgoing ability values (floor 0; callers may enforce min 1 for damage). */
    public int applyBlindToValue(CardInstance source, int value) {
        if (!isEnabled() || source == null || value <= 0) {
            return value;
        }
        int blind = source.getAfflictionStacks(ElementalAffliction.BLIND);
        if (blind <= 0) {
            return value;
        }
        return Math.max(0, value - blind);
    }

    /**
     * Toxin: while stacks remain, heals strip stacks instead of restoring HP.
     *
     * @return HP actually restored
     */
    public int applyHealWithToxin(GameState state, CardInstance target, int healAmount) {
        if (target == null || healAmount <= 0) {
            return 0;
        }
        if (!isEnabled()) {
            int before = target.getCurrentHealth();
            target.healDamage(healAmount);
            return Math.max(0, target.getCurrentHealth() - before);
        }
        int toxin = target.getAfflictionStacks(ElementalAffliction.TOXIN);
        if (toxin <= 0) {
            int before = target.getCurrentHealth();
            target.healDamage(healAmount);
            return Math.max(0, target.getCurrentHealth() - before);
        }
        int removed = Math.min(toxin, healAmount);
        int remaining = toxin - removed;
        if (remaining <= 0) {
            target.clearAffliction(ElementalAffliction.TOXIN);
        } else {
            target.getAfflictionStacks().put(ElementalAffliction.TOXIN, remaining);
        }
        if (state != null) {
            state.log(target.getName() + "'s Toxin absorbs the heal ("
                    + removed + " stack" + (removed == 1 ? "" : "s") + " removed"
                    + "; Toxin x" + Math.max(0, remaining) + ").");
        }
        return 0;
    }

    /**
     * Disorient raises the cost of the single lowest-cost ability (first in list on ties).
     */
    public int modifiedAbilityCost(CardInstance attacker, List<Ability> abilities, int index) {
        if (attacker == null || abilities == null || index < 0 || index >= abilities.size()) {
            return 0;
        }
        Ability ability = abilities.get(index);
        int cost = Math.max(0, ability.getRequiredEnergy());
        if (!isEnabled()) {
            return cost;
        }
        int disorient = attacker.getAfflictionStacks(ElementalAffliction.DISORIENT);
        if (disorient <= 0 || abilities.isEmpty()) {
            return cost;
        }
        int minCost = Integer.MAX_VALUE;
        int firstMinIndex = -1;
        for (int i = 0; i < abilities.size(); i++) {
            int c = Math.max(0, abilities.get(i).getRequiredEnergy());
            if (c < minCost) {
                minCost = c;
                firstMinIndex = i;
            }
        }
        if (index == firstMinIndex) {
            cost += disorient;
        }
        return cost;
    }

    /**
     * Shock: this card can only spend {@code available - stacks}. Equivalent gate:
     * must afford {@code cost + shockStacks}.
     */
    public int shockSpendTax(CardInstance attacker) {
        if (!isEnabled() || attacker == null) return 0;
        return attacker.getAfflictionStacks(ElementalAffliction.SHOCK);
    }

    public static Element damageElementFor(CardInstance source, Element spellOrAbilityElement) {
        if (source != null && source.getElement() != null) {
            return source.getElement();
        }
        return spellOrAbilityElement;
    }

    private void resolveInsightPayoff(GameState state, CardInstance target, boolean inflicterIsPlayer) {
        Player actor = inflicterIsPlayer ? state.getPlayer() : state.getEnemy();
        target.clearAffliction(ElementalAffliction.INSIGHT);
        if (actor.drawCard() != null) {
            state.log("Insight peaks on " + target.getName() + " — " + actor.getName() + " draws a card!");
        } else {
            state.log("Insight peaks on " + target.getName() + " — " + actor.getName()
                    + " would draw, but their deck is empty.");
        }
    }

    private void tickBurnOnSetup(GameState state, CardInstance ci) {
        ElementalAfflictionDef burn = ElementalAfflictionCatalog.forAffliction(ElementalAffliction.BURN).orElse(null);
        if (burn == null || !burn.battleEnabled()) return;
        int stacks = ci.getAfflictionStacks(ElementalAffliction.BURN);
        if (stacks <= 0) return;

        int damage = stacks * Math.max(0, burn.damagePerStack());
        if (damage > 0) {
            ci.takeRawDamage(damage);
            state.log(ci.getName() + " takes " + damage + " burn damage"
                    + " (HP: " + ci.getCurrentHealth() + ").");
        }
        if (burn.clearsOnTick()) {
            ci.clearAffliction(ElementalAffliction.BURN);
        }
    }

    private void tickWitherOnSetup(GameState state, CardInstance ci) {
        ElementalAfflictionDef wither = ElementalAfflictionCatalog.forAffliction(ElementalAffliction.WITHER).orElse(null);
        if (wither == null || !wither.battleEnabled()) return;
        int stacks = ci.getAfflictionStacks(ElementalAffliction.WITHER);
        if (stacks <= 0) return;

        int clampedMax = Math.max(1, ci.getEffectiveMaxHealth() - stacks);
        int overflow = Math.max(0, ci.getCurrentHealth() - clampedMax);
        if (overflow > 0) {
            ci.takeRawDamage(overflow);
            state.log(ci.getName() + " withers (clamped by " + stacks
                    + "; HP: " + ci.getCurrentHealth() + ").");
        } else {
            state.log(ci.getName() + "'s Wither fades without cutting HP.");
        }
        ci.clearAffliction(ElementalAffliction.WITHER);
    }

    private void thawChillOnSetup(GameState state, CardInstance ci) {
        int chill = ci.getAfflictionStacks(ElementalAffliction.CHILL);
        if (chill <= 0) return;
        ci.clearAffliction(ElementalAffliction.CHILL);
        ci.getStatusEffects().remove(StatusEffect.FREEZE);
        state.log(ci.getName() + " thaws (Chill clears).");
    }
}
