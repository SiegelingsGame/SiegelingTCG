package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
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
    private final PlacementService placementService = new PlacementService();

    /**
     * Spells/traps with {@code move_link} on a single enemy require an explicit empty destination cell
     * on that unit's board (no notch link required).
     */
    public static boolean isForcedBoardMoveSpell(Ability ability) {
        return ability != null
                && AbilityEffectKeys.MOVE_LINK.equals(ability.getEffectType())
                && ability.getTargetType() == TargetType.SINGLE_ENEMY;
    }

    /**
     * Resolve an ability, applying effects to appropriate targets.
     * @param ability the ability to resolve
     * @param source the card using the ability (null for spells/trainers)
     * @param isPlayerSource true if the source belongs to the player
     * @param targetRow specific target row (for targeted abilities), -1 if auto
     * @param targetCol specific target col, -1 if auto
     * @param destRow destination row for forced enemy reposition spells, -1 if unused
     * @param destCol destination col for forced enemy reposition spells, -1 if unused
     */
    public void resolveAbility(GameState state, Ability ability, CardInstance source,
                                boolean isPlayerSource, int targetRow, int targetCol) {
        resolveAbility(state, ability, source, isPlayerSource, targetRow, targetCol, -1, -1);
    }

    public void resolveAbility(GameState state, Ability ability, CardInstance source,
                                boolean isPlayerSource, int targetRow, int targetCol,
                                int destRow, int destCol) {
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

        applyEffect(state, ability, source, targets, destRow, destCol);
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

    private void applyEffect(GameState state, Ability ability, CardInstance source, List<CardInstance> targets,
                             int destRow, int destCol) {
        String effectType = ability.getEffectType();
        int value = ability.getEffectValue();

        if (AbilityEffectKeys.CONNECTED_ALLIES_DAMAGE_BOOST.equals(effectType)) {
            applyConnectedAlliesDamageBoost(state, ability, source, Math.max(1, value));
            return;
        }
        if (AbilityEffectKeys.CONNECTED_ALLIES_HEALTH_BOOST.equals(effectType)) {
            applyConnectedAlliesHealthBoost(state, ability, source, Math.max(1, value));
            return;
        }
        if (AbilityEffectKeys.CONNECTED_ALLIES_SPEED_BOOST.equals(effectType)) {
            applyConnectedAlliesSpeedBoost(state, ability, source, Math.max(1, value));
            return;
        }

        for (CardInstance target : targets) {
            switch (effectType) {
                case AbilityEffectKeys.DAMAGE -> {
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
                case AbilityEffectKeys.HEAL -> {
                    target.healDamage(value);
                    state.log(ability.getName() + " heals " + target.getName() + " for " + value
                            + " (HP: " + target.getCurrentHealth() + ")");
                }
                case AbilityEffectKeys.FREEZE -> {
                    target.getStatusEffects().add(StatusEffect.FREEZE);
                    state.log(ability.getName() + " freezes " + target.getName() + "!");
                }
                case AbilityEffectKeys.SPEED_ZERO -> {
                    target.setCurrentSpeed(0);
                    target.getStatusEffects().add(StatusEffect.SPEED_ZERO);
                    state.log(ability.getName() + " reduces " + target.getName() + "'s Speed to 0!");
                }
                case AbilityEffectKeys.DAMAGE_BOOST -> {
                    target.addDamageBuff(Math.max(1, value));
                    state.log(ability.getName() + " boosts " + target.getName() + "'s attack damage by " + Math.max(1, value) + "!");
                }
                case AbilityEffectKeys.HEALTH_BOOST -> {
                    target.addHealthBuff(Math.max(1, value));
                    state.log(ability.getName() + " raises " + target.getName() + "'s max Health by " + Math.max(1, value)
                            + " (HP: " + target.getCurrentHealth() + "/" + target.getEffectiveMaxHealth() + ")");
                }
                case AbilityEffectKeys.SPEED_BOOST -> {
                    target.setCurrentSpeed(target.getCurrentSpeed() + value);
                    if (target.getCurrentSpeed() > 0) {
                        target.getStatusEffects().remove(StatusEffect.SPEED_ZERO);
                    }
                    state.log(ability.getName() + " increases " + target.getName() + "'s Speed by " + value + "!");
                }
                case AbilityEffectKeys.DESTROY -> {
                    target.takeRawDamage(target.getCurrentHealth());
                    state.log(ability.getName() + " destroys " + target.getName() + "!");
                }
                case AbilityEffectKeys.MOVE_LINK -> {
                    if (source == null && isForcedBoardMoveSpell(ability)) {
                        if (!moveUnitToAbsoluteCell(state, target, destRow, destCol)) {
                            state.log(ability.getName() + " could not move the target to that cell.");
                        }
                    } else if (!moveToLinkedPoint(state, target)) {
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
            case AbilityEffectKeys.DAMAGE, AbilityEffectKeys.PLAYER_DAMAGE -> {
                targetPlayer.takeDirectDamage(value);
                state.log(ability.getName() + " deals " + value + " direct damage to " + targetPlayer.getName() + "!");
            }
            case AbilityEffectKeys.HEAL -> {
                targetPlayer.healPlayer(value);
                state.log(ability.getName() + " heals " + targetPlayer.getName() + " for " + value + ".");
            }
            default -> state.log("Unknown player effect: " + ability.getEffectType());
        }
    }

    private void applyConnectedAlliesHealthBoost(GameState state, Ability ability, CardInstance source, int value) {
        if (source == null) {
            state.log(ability.getName() + " has no source card to trace connected allies.");
            return;
        }

        List<CardInstance> connectedAllies = placementService.getConnectedAllies(state, source).stream()
                .filter(CardInstance::isAlive)
                .toList();
        if (connectedAllies.isEmpty()) {
            state.log(ability.getName() + " found no connected allies.");
            return;
        }

        for (CardInstance ally : connectedAllies) {
            ally.addHealthBuff(value);
            state.log(ability.getName() + " raises " + ally.getName() + "'s max Health by " + value
                    + " through a live connection"
                    + " (HP: " + ally.getCurrentHealth() + "/" + ally.getEffectiveMaxHealth() + ")");
        }
    }

    private void applyConnectedAlliesDamageBoost(GameState state, Ability ability, CardInstance source, int value) {
        if (source == null) {
            state.log(ability.getName() + " has no source card to trace connected allies.");
            return;
        }

        List<CardInstance> connectedAllies = placementService.getConnectedAllies(state, source).stream()
                .filter(CardInstance::isAlive)
                .toList();
        if (connectedAllies.isEmpty()) {
            state.log(ability.getName() + " found no connected allies.");
            return;
        }

        for (CardInstance ally : connectedAllies) {
            ally.addDamageBuff(value);
            state.log(ability.getName() + " raises " + ally.getName() + "'s attack damage by " + value
                    + " through a live connection.");
        }
    }

    private void applyConnectedAlliesSpeedBoost(GameState state, Ability ability, CardInstance source, int value) {
        if (source == null) {
            state.log(ability.getName() + " has no source card to trace connected allies.");
            return;
        }

        List<CardInstance> connectedAllies = placementService.getConnectedAllies(state, source).stream()
                .filter(CardInstance::isAlive)
                .toList();
        if (connectedAllies.isEmpty()) {
            state.log(ability.getName() + " found no connected allies.");
            return;
        }

        for (CardInstance ally : connectedAllies) {
            ally.setCurrentSpeed(ally.getCurrentSpeed() + value);
            if (ally.getCurrentSpeed() > 0) {
                ally.getStatusEffects().remove(StatusEffect.SPEED_ZERO);
            }
            state.log(ability.getName() + " raises " + ally.getName() + "'s Speed by " + value
                    + " through a live connection.");
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
     * Shadow's current Roblox strengths target Psychic-only matchups, and Ice does not yet use
     * an elemental weakness relationship in the live TCG rule set, so both remain neutral here.
     */
    private boolean isWeakTo(com.sieglings.model.enums.Element attacker, com.sieglings.model.enums.Element defender) {
        return switch (attacker) {
            case WATER -> defender == com.sieglings.model.enums.Element.FIRE
                    || defender == com.sieglings.model.enums.Element.EARTH;
            case EARTH -> defender == com.sieglings.model.enums.Element.WIND
                    || defender == com.sieglings.model.enums.Element.ELECTRIC;
            case WIND -> defender == com.sieglings.model.enums.Element.FIRE;
            case ELECTRIC -> defender == com.sieglings.model.enums.Element.WATER;
            default -> false;
        };
    }

    /**
     * Move a board unit to any empty cell on its owner's board (used by forced-move spells on enemies).
     */
    private boolean moveUnitToAbsoluteCell(GameState state, CardInstance unit, int destRow, int destCol) {
        if (unit == null || !unit.isAlive()) {
            return false;
        }
        if (destRow < 0 || destRow > 2 || destCol < 0 || destCol > 2) {
            return false;
        }
        boolean side = unit.isOwner();
        if (state.getAt(side, destRow, destCol) != null) {
            return false;
        }
        int fromRow = unit.getBoardRow();
        int fromCol = unit.getBoardCol();
        state.setAt(side, fromRow, fromCol, null);
        unit.setBoardRow(destRow);
        unit.setBoardCol(destCol);
        state.setAt(side, destRow, destCol, unit);
        state.log(unit.getName() + " is moved to " + rowName(destRow) + " row, col " + destCol + ".");
        return true;
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
