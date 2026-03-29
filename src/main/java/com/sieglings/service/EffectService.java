package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.StatusEffect;
import com.sieglings.model.enums.TargetType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Resolves card abilities and spell effects using universal targeting/effect rules.
 */
@Service
public class EffectService {

    /**
     * Resolve an ability, applying effects to appropriate targets.
     * @param ability the ability to resolve
     * @param source the card using the ability (null for spells/trainers)
     * @param isPlayerSource true if the source belongs to the player
     * @param targetRow specific target row (for targeted abilities), -1 if auto
     * @param targetCol specific target col, -1 if auto
     */
    public void resolveAbility(GameState state, Ability ability, CardInstance source,
                                boolean isPlayerSource, int targetRow, int targetCol) {
        if (ability == null) return;
        if (ability.isPassive()) return; // Passives are applied differently

        // Check reaction requirement
        if (ability.getRequiredReaction() == Reaction.MIST) {
            var player = isPlayerSource ? state.getPlayer() : state.getEnemy();
            if (!player.isMistActive()) {
                state.log("Cannot use " + ability.getName() + " — Mist reaction not active!");
                return;
            }
        }

        if (ability.getTargetType() == TargetType.ENEMY_PLAYER) {
            applyPlayerEffect(state, ability, isPlayerSource);
            return;
        }

        List<CardInstance> targets = resolveTargets(state, ability, source, isPlayerSource, targetRow, targetCol);

        if (targets.isEmpty()) {
            state.log(ability.getName() + " found no valid targets.");
            return;
        }

        applyEffect(state, ability, source, targets);
    }

    private List<CardInstance> resolveTargets(GameState state, Ability ability, CardInstance source,
                                              boolean isPlayerSource, int targetRow, int targetCol) {
        List<CardInstance> targets = new ArrayList<>();

        switch (ability.getTargetType()) {
            case SINGLE_ENEMY -> {
                // If specific target given
                if (targetRow >= 0 && targetCol >= 0) {
                    CardInstance t = state.getAt(!isPlayerSource, targetRow, targetCol);
                    if (t != null && t.isAlive()) targets.add(t);
                } else {
                    // Auto-target: front row first, then middle, then back
                    CardInstance t = findFirstEnemy(state, !isPlayerSource, ability.getTargetRow());
                    if (t != null) targets.add(t);
                }
            }
            case ALL_ENEMIES -> {
                targets.addAll(state.getBoardSieglings(!isPlayerSource));
            }
            case ROW_ENEMIES -> {
                Row row = ability.getTargetRow();
                if (row != null) {
                    targets.addAll(getSieglingsInRow(state, !isPlayerSource, row.getIndex()));
                }
            }
            case SINGLE_ALLY -> {
                if (targetRow >= 0 && targetCol >= 0) {
                    CardInstance t = state.getAt(isPlayerSource, targetRow, targetCol);
                    if (t != null && t.isAlive()) targets.add(t);
                } else {
                    // Auto: pick first ally
                    var allies = state.getBoardSieglings(isPlayerSource);
                    if (!allies.isEmpty()) targets.add(allies.get(0));
                }
            }
            case ALL_ALLIES -> {
                targets.addAll(state.getBoardSieglings(isPlayerSource));
            }
            case ROW_ALLIES -> {
                Row row = ability.getTargetRow();
                if (row != null) {
                    targets.addAll(getSieglingsInRow(state, isPlayerSource, row.getIndex()));
                }
            }
            case SELF -> {
                if (source != null && source.isAlive()) {
                    targets.add(source);
                }
            }
            case PASSIVE -> {
                // No targets
            }
        }

        return targets;
    }

    private void applyEffect(GameState state, Ability ability, CardInstance source, List<CardInstance> targets) {
        String effectType = ability.getEffectType();
        int value = ability.getEffectValue();

        for (CardInstance target : targets) {
            switch (effectType) {
                case "damage" -> {
                    int damage = value;
                    boolean weaknessBonus = false;
                    if (source != null && isWeakTo(source.getElement(), target.getElement())) {
                        damage += 1;
                        weaknessBonus = true;
                    }

                    target.takeRawDamage(damage);
                    state.log(ability.getName() + " deals " + damage + " damage to " + target.getName()
                            + (weaknessBonus ? " (weakness +1)" : "")
                            + " (HP: " + target.getCurrentHealth() + ")");
                }
                case "heal" -> {
                    target.healDamage(value);
                    state.log(ability.getName() + " heals " + target.getName() + " for " + value
                            + " (HP: " + target.getCurrentHealth() + ")");
                }
                case "freeze" -> {
                    target.getStatusEffects().add(StatusEffect.FREEZE);
                    state.log(ability.getName() + " freezes " + target.getName() + "!");
                }
                case "speed_zero" -> {
                    target.getStatusEffects().add(StatusEffect.SPEED_ZERO);
                    state.log(ability.getName() + " reduces " + target.getName() + "'s Speed to 0!");
                }
                case "atk_boost" -> {
                    target.getStatusEffects().add(StatusEffect.ATK_BOOST);
                    state.log(ability.getName() + " boosts " + target.getName() + "'s Attack!");
                }
                case "def_boost" -> {
                    target.getStatusEffects().add(StatusEffect.DEF_BOOST);
                    state.log(ability.getName() + " boosts " + target.getName() + "'s Defense!");
                }
                case "speed_boost" -> {
                    target.setCurrentSpeed(target.getCurrentSpeed() + value);
                    state.log(ability.getName() + " increases " + target.getName() + "'s Speed by " + value + "!");
                }
                case "destroy" -> {
                    target.takeRawDamage(target.getCurrentHealth());
                    state.log(ability.getName() + " destroys " + target.getName() + "!");
                }
                case "move_link" -> {
                    if (!moveToLinkedPoint(state, target)) {
                        state.log(ability.getName() + " cannot find an open linked point.");
                    }
                }
                default -> state.log("Unknown effect: " + effectType);
            }
        }
    }

    private void applyPlayerEffect(GameState state, Ability ability, boolean isPlayerSource) {
        var targetPlayer = isPlayerSource ? state.getEnemy() : state.getPlayer();
        int value = ability.getEffectValue();

        switch (ability.getEffectType()) {
            case "damage", "player_damage" -> {
                targetPlayer.takeDirectDamage(value);
                state.log(ability.getName() + " deals " + value + " direct damage to " + targetPlayer.getName() + "!");
            }
            case "heal" -> {
                targetPlayer.healPlayer(value);
                state.log(ability.getName() + " heals " + targetPlayer.getName() + " for " + value + ".");
            }
            default -> state.log("Unknown player effect: " + ability.getEffectType());
        }
    }

    private CardInstance findFirstEnemy(GameState state, boolean side, Row preferredRow) {
        // Check preferred row first if specified
        if (preferredRow != null) {
            var inRow = getSieglingsInRow(state, side, preferredRow.getIndex());
            if (!inRow.isEmpty()) return inRow.get(0);
        }
        // Otherwise front -> middle -> back
        for (int r = 2; r >= 0; r--) {
            var inRow = getSieglingsInRow(state, side, r);
            if (!inRow.isEmpty()) return inRow.get(0);
        }
        return null;
    }

    private List<CardInstance> getSieglingsInRow(GameState state, boolean isPlayer, int row) {
        List<CardInstance> list = new ArrayList<>();
        for (int c = 0; c < 3; c++) {
            CardInstance ci = state.getAt(isPlayer, row, c);
            if (ci != null && ci.isAlive()) list.add(ci);
        }
        return list;
    }

    /**
     * Adapted from the Roblox reference chart:
     * Water > Fire, Earth | Earth > Wind, Electric | Wind > Fire | Electric > Water.
     * Shadow's current Roblox strengths target Psychic-only matchups, so Shadow remains neutral
     * within the live TCG element set for now.
     */
    private boolean isWeakTo(com.sieglings.model.enums.Element attacker, com.sieglings.model.enums.Element defender) {
        return switch (attacker) {
            case WATER -> defender == com.sieglings.model.enums.Element.FIRE
                    || defender == com.sieglings.model.enums.Element.EARTH;
            case EARTH -> defender == com.sieglings.model.enums.Element.WIND
                    || defender == com.sieglings.model.enums.Element.ELECTRIC;
            case WIND -> defender == com.sieglings.model.enums.Element.FIRE;
            case ELECTRIC -> defender == com.sieglings.model.enums.Element.WATER;
            case FIRE, SHADOW, NEUTRAL -> false;
        };
    }

    private boolean moveToLinkedPoint(GameState state, CardInstance source) {
        List<int[]> candidates = new ArrayList<>();

        for (Notch notch : source.getNotches()) {
            int nextRow = source.getBoardRow() + getBoardRowDelta(notch, source.isOwner());
            int nextCol = source.getBoardCol() + notch.direction().getDx();
            if (nextRow < 0 || nextRow > 2 || nextCol < 0 || nextCol > 2) {
                continue;
            }
            if (state.getAt(source.isOwner(), nextRow, nextCol) != null) {
                continue;
            }

            boolean alreadyListed = candidates.stream().anyMatch(pos -> pos[0] == nextRow && pos[1] == nextCol);
            if (!alreadyListed) {
                candidates.add(new int[] { nextRow, nextCol });
            }
        }

        if (candidates.isEmpty()) {
            return false;
        }

        candidates.sort((left, right) -> {
            int rowCompare = Integer.compare(right[0], left[0]);
            if (rowCompare != 0) return rowCompare;
            return Integer.compare(Math.abs(left[1] - 1), Math.abs(right[1] - 1));
        });

        int[] chosen = candidates.get(0);
        state.setAt(source.isOwner(), source.getBoardRow(), source.getBoardCol(), null);
        source.setBoardRow(chosen[0]);
        source.setBoardCol(chosen[1]);
        state.setAt(source.isOwner(), chosen[0], chosen[1], source);
        state.log(source.getName() + " moves to " + rowName(chosen[0]) + " row, col " + chosen[1] + ".");
        return true;
    }

    private int getBoardRowDelta(Notch notch, boolean isPlayer) {
        return isPlayer ? -notch.direction().getDy() : notch.direction().getDy();
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
