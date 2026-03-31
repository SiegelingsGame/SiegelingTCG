package com.sieglings.service;

import com.sieglings.model.*;
import com.sieglings.model.enums.Phase;
import com.sieglings.model.enums.TargetType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Simple AI that can draw, place Sieglings, and cast spells.
 * Not smart, but functional.
 */
@Service
public class AIService {

    @Autowired
    private PlacementService placementService;

    @Autowired
    private EnergyService energyService;

    @Autowired
    private EffectService effectService;

    private final Random random = new Random();

    /**
     * Execute the AI's full turn (draw + setup phases).
     */
    public void executeAITurn(GameState state) {
        state.resetPlacementsForTurn(false);
        if (state.getEnemy().getActiveTrainer() != null) {
            state.getEnemy().getActiveTrainer().resetTurn();
        }

        state.log("AI Draw phase.");
        // Draw phase: draw 1 card
        Card drawn = state.getEnemy().drawCard();
        if (drawn != null) {
            state.log("AI draws a card. (Hand: " + state.getEnemy().getHand().size() + ")");
        }

        energyService.recalculateEnergy(state);

        state.setCurrentPhase(Phase.SETUP);
        state.log("AI Setup phase.");
        // Setup phase: try to place Sieglings and cast spells
        aiPlaceSieglings(state);
        aiCastSpells(state);
        aiUseTraps(state);
    }

    private void aiPlaceSieglings(GameState state) {
        if (state.hasPlacedSieglingThisTurn(false)) {
            return;
        }

        List<Card> hand = new ArrayList<>(state.getEnemy().getHand());

        for (Card card : hand) {
            if (!(card instanceof SieglingCard siegling)) continue;

            // Check cost
            if (!energyService.canAfford(state, false, siegling.getCostElement(), siegling.getCostAmount())) {
                continue;
            }

            List<int[]> placements = placementService.getLegalPlacements(state, false, siegling);
            if (placements.isEmpty()) break;

            // Pick a placement — prefer the row matching the card's preferred row
            int[] chosen = pickPlacement(placements, siegling);

            CardInstance existing = state.getAt(false, chosen[0], chosen[1]);
            boolean evolutionPlacement = placementService.isEvolutionPlacement(state, false, chosen[0], chosen[1], siegling);
            CardInstance instance = placementService.createPlacedInstance(existing, siegling, false, chosen[0], chosen[1]);
            if (!evolutionPlacement) {
                instance.setPlacementOrder(state.consumePlacementOrder());
            }
            state.setAt(false, chosen[0], chosen[1], instance);
            state.recordSieglingPlacement(false);
            state.getEnemy().removeFromHand(card);
            if (evolutionPlacement && existing != null) {
                state.log("AI evolves " + existing.getName() + " into " + siegling.getName()
                        + " at row " + rowName(chosen[0]) + " col " + chosen[1]);
            } else {
                state.log("AI places " + siegling.getName() + " at row " + rowName(chosen[0]) + " col " + chosen[1]);
            }

            energyService.recalculateEnergy(state);
            break;
        }
    }

    private void aiCastSpells(GameState state) {
        List<Card> hand = new ArrayList<>(state.getEnemy().getHand());

        for (Card card : hand) {
            if (!(card instanceof SpellCard spell)) continue;

            // Check cost
            if (!energyService.canCastSpell(state, false, spell)) {
                continue;
            }

            // Must have targets
            if (state.getBoardSieglings(true).isEmpty() &&
                spell.getAbility().getTargetType().name().contains("ENEM")) {
                continue;
            }

            // Cast the spell
            effectService.resolveAbility(state, spell.getAbility(), null, false, -1, -1);
            state.getEnemy().removeFromHand(card);
            state.getEnemy().getDiscard().add(card);
            state.log("AI casts " + spell.getName() + "!");

            // Spend energy from pool (restores at next phase)
            energyService.spendEnergy(state, false, spell.getCostElement(), spell.getCostAmount());
            state.removeDeadSieglings();
            break; // Cast 1 spell per turn max
        }
    }

    private void aiUseTraps(GameState state) {
        List<Card> hand = new ArrayList<>(state.getEnemy().getHand());

        for (Card card : hand) {
            if (!(card instanceof TrapCard trap)) continue;

            if (!energyService.canTriggerTrap(state, false, trap)) {
                continue;
            }

            TargetType targetType = trap.getAbility().getTargetType();
            if (targetType != TargetType.ENEMY_PLAYER
                    && state.getBoardSieglings(true).isEmpty()
                    && targetType.name().contains("ENEM")) {
                continue;
            }

            effectService.resolveAbility(state, trap.getAbility(), null, false, -1, -1);
            state.getEnemy().removeFromHand(card);
            state.getEnemy().getDiscard().add(card);
            state.log("AI springs trap " + trap.getName() + "!");

            // Spend energy from pool (restores at next phase)
            energyService.spendEnergy(state, false, trap.getCostElement(), trap.getCostAmount());
            state.removeDeadSieglings();
            break; // Spring 1 trap per turn max
        }
    }

    private int[] pickPlacement(List<int[]> placements, SieglingCard card) {
        if (card.getPreferredRow() != null) {
            int prefRow = card.getPreferredRow().getIndex();
            for (int[] pos : placements) {
                if (pos[0] == prefRow) return pos;
            }
        }
        return placements.get(random.nextInt(placements.size()));
    }

    private String rowName(int row) {
        return switch (row) {
            case 0 -> "Back";
            case 1 -> "Middle";
            case 2 -> "Front";
            default -> "?";
        };
    }
}
