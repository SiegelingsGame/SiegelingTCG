package com.sieglings.service;

import com.sieglings.model.CardInstance;
import com.sieglings.model.ElementalAfflictionCatalog;
import com.sieglings.model.ElementalAfflictionDef;
import com.sieglings.model.GameState;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.ElementalAffliction;
import org.springframework.stereotype.Service;

/**
 * Battle-table runtime for elemental damage afflictions (Burn badges, etc.).
 * Design data lives in {@link ElementalAfflictionCatalog}; Siege keeps its own
 * apply/tick loop but reads the same element → status mapping.
 */
@Service
public class ElementalAfflictionService {

    /**
     * After elemental damage deals HP, try to apply that element's affliction badge.
     *
     * @param damageElement element of the damage (attacker or spell), may be null/NEUTRAL
     * @param hpDamageDealt HP lost after shield absorption (0 → no inflict)
     */
    public void tryInflictFromDamage(GameState state, CardInstance target, Element damageElement, int hpDamageDealt) {
        if (state == null || target == null || !target.isAlive() || hpDamageDealt <= 0) {
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
    }

    /**
     * Resolve owner-Setup ticks for living Sieglings on {@code ownerSide}.
     * Burn prototype: flat damage per stack, then clear.
     */
    public void tickOwnerSetup(GameState state, boolean ownerSide) {
        if (state == null) return;
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                CardInstance ci = state.getAt(ownerSide, r, c);
                if (ci == null || !ci.isAlive()) continue;
                tickBurnOnSetup(state, ci);
                // Future OWNER_SETUP_START rows (Toxin, Shock, …) land here.
            }
        }
        state.removeDeadSieglings();
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

    /** Element used when resolving a damage ability (Siegling source, else spell requirement). */
    public static Element damageElementFor(CardInstance source, Element spellOrAbilityElement) {
        if (source != null && source.getElement() != null) {
            return source.getElement();
        }
        return spellOrAbilityElement;
    }
}
