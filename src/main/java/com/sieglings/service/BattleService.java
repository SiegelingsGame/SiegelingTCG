package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.BattleAbilityOption;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.StatusEffect;
import com.sieglings.model.enums.TargetType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * Resolves the battle phase as a speed-ordered action queue.
 * AI turns resolve automatically, while human-controlled turns pause for UI input.
 */
@Service
public class BattleService {

    private static final Set<String> ZERO_COST_WEAK_ATTACKERS = Set.of(
            "emberfox",
            "splashfin",
            "applehead",
            "ragguette"
    );

    private static final Set<String> ZERO_COST_MOVERS = Set.of(
            "pylook",
            "spoutyl",
            "squirebud",
            "breezee"
    );

    @Autowired
    private EffectService effectService;

    @Autowired
    private EnergyService energyService;

    public void initializeBattle(GameState state) {
        state.log("=== BATTLE PHASE ===");

        List<CardInstance> allSieglings = new ArrayList<>();
        allSieglings.addAll(state.getBoardSieglings(true));
        allSieglings.addAll(state.getBoardSieglings(false));
        allSieglings.sort(Comparator.comparingInt(CardInstance::getEffectiveSpeed).reversed());

        List<String> queue = allSieglings.stream().map(CardInstance::getInstanceId).toList();
        state.setBattleQueue(new ArrayList<>(queue));
        state.setBattleCursor(0);
        state.setPendingBattleInstanceId(null);
    }

    public void advanceBattle(GameState state) {
        while (state.getBattleCursor() < state.getBattleQueue().size()) {
            String instanceId = state.getBattleQueue().get(state.getBattleCursor());
            state.setBattleCursor(state.getBattleCursor() + 1);

            CardInstance attacker = state.findByInstanceId(instanceId);
            if (attacker == null || !attacker.isAlive()) {
                continue;
            }

            if (attacker.isFrozen()) {
                state.log(attacker.getName() + " is frozen and cannot act!");
                attacker.getStatusEffects().remove(StatusEffect.FREEZE);
                continue;
            }

            List<BattleAbilityOption> abilities = getAvailableAbilities(state, attacker);
            boolean hasAffordableAbility = abilities.stream().anyMatch(BattleAbilityOption::isAffordable);
            if (!hasAffordableAbility) {
                state.log(attacker.getName() + " cannot find an ability it can afford.");
                continue;
            }

            if (isHumanControlled(state, attacker.isOwner())) {
                state.setPendingBattleInstanceId(attacker.getInstanceId());
                return;
            }

            BattleAbilityOption choice = pickAiAbility(abilities);
            resolveBattleAction(state, attacker, choice.getIndex(), -1, -1);
            if (state.isGameOver()) {
                return;
            }
        }

        finishBattle(state);
    }

    public CardInstance getPendingAttacker(GameState state) {
        return state.getPendingBattleInstanceId() == null ? null : state.findByInstanceId(state.getPendingBattleInstanceId());
    }

    public List<BattleAbilityOption> getAvailableAbilities(GameState state, CardInstance attacker) {
        List<Ability> battleAbilities = buildBattleAbilities(attacker);
        List<BattleAbilityOption> options = new ArrayList<>();

        for (int i = 0; i < battleAbilities.size(); i++) {
            Ability ability = battleAbilities.get(i);
            boolean affordable = energyService.canAfford(
                    state,
                    attacker.isOwner(),
                    ability.getRequiredElement(),
                    ability.getRequiredEnergy()
            );
            options.add(new BattleAbilityOption(i, ability, ability.getRequiredElement(), ability.getRequiredEnergy(), affordable));
        }

        return options;
    }

    public void resolvePlayerAction(GameState state, int abilityIndex, int targetRow, int targetCol) {
        CardInstance attacker = getPendingAttacker(state);
        if (attacker == null) {
            return;
        }

        resolveBattleAction(state, attacker, abilityIndex, targetRow, targetCol);
        state.setPendingBattleInstanceId(null);

        if (!state.isGameOver()) {
            advanceBattle(state);
        }
    }

    private void resolveBattleAction(GameState state, CardInstance attacker, int abilityIndex, int targetRow, int targetCol) {
        List<BattleAbilityOption> options = getAvailableAbilities(state, attacker);
        if (abilityIndex < 0 || abilityIndex >= options.size()) {
            state.log(attacker.getName() + " hesitates and loses its action.");
            return;
        }

        BattleAbilityOption choice = options.get(abilityIndex);
        if (!choice.isAffordable()) {
            state.log(attacker.getName() + " cannot afford " + choice.getAbility().getName() + ".");
            return;
        }

        Ability ability = choice.getAbility();
        boolean targetEnemy = ability.getTargetType().name().contains("ENEM");
        boolean enemyBoardEmpty = targetEnemy && state.getBoardSieglings(!attacker.isOwner()).isEmpty();

        state.log(attacker.getName() + " uses " + ability.getName() + ".");

        if (enemyBoardEmpty && "damage".equals(ability.getEffectType())) {
            int directDamage = Math.max(1, ability.getEffectValue());
            var opposingPlayer = attacker.isOwner() ? state.getEnemy() : state.getPlayer();
            opposingPlayer.takeDirectDamage(directDamage);
            state.log(opposingPlayer.getName() + " takes " + directDamage + " direct damage!");
        } else {
            effectService.resolveAbility(state, ability, attacker, attacker.isOwner(), targetRow, targetCol);
        }

        state.removeDeadSieglings();
        energyService.recalculateEnergy(state);
        updateWinnerFromHealth(state);
    }

    private BattleAbilityOption pickAiAbility(List<BattleAbilityOption> options) {
        return options.stream()
                .filter(BattleAbilityOption::isAffordable)
                .max(Comparator.comparingInt(o -> o.getRequiredEnergy() * 10 + o.getAbility().getEffectValue()))
                .orElse(options.get(0));
    }

    private List<Ability> buildBattleAbilities(CardInstance attacker) {
        List<Ability> abilities = new ArrayList<>();
        Element element = attacker.getElement();
        int baseDmg = baseBattleDamage(attacker) + attacker.getDamageBoost();
        String cardId = attacker.getCard().getId();

        if (attacker.getCard().getRarity() == Rarity.COMMON
                && (ZERO_COST_WEAK_ATTACKERS.contains(cardId) || ZERO_COST_MOVERS.contains(cardId))) {
            Ability commonFallback = buildCommonFallbackAbility(attacker);
            abilities.add(commonFallback);
        } else {
            // Option 1: Light strike — 1 energy, scaled-down single-target damage
            int lightDmg = Math.max(1, baseDmg - 1);
            Ability basicStrike = Ability.damage(
                    attacker.getName() + " Strike",
                    "Deal " + lightDmg + " damage to 1 enemy",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1,
                    lightDmg
            );
            basicStrike.setRequiredElement(element);
            basicStrike.setRequiredEnergy(1);
            abilities.add(basicStrike);
        }

        if (attacker.getCard().getRarity() != Rarity.COMMON) {
            // Option 2: Signature — 2-3 energy, medium damage
            // Same damage as Option 1 ONLY if targeting is different (AOE/row vs single)
            Ability signature = buildSignatureAbility(attacker);
            boolean signatureIsAoe = signature.getTargetType() == TargetType.ROW_ENEMIES
                    || signature.getTargetType() == TargetType.ALL_ENEMIES;
            int sigCost = signatureIsAoe ? 2 : 3;
            if (!signatureIsAoe && "damage".equals(signature.getEffectType())) {
                // Single-target signature should deal MORE than Option 1
                int boosted = Math.max(signature.getEffectValue(), baseDmg + 1);
                signature.setEffectValue(boosted);
                signature.setDescription("Deal " + boosted + " damage to 1 enemy");
            }
            signature.setRequiredElement(element);
            signature.setRequiredEnergy(sigCost);
            abilities.add(signature);
        }

        if (attacker.getCard().getRarity() == Rarity.RARE
                || attacker.getCard().getRarity() == Rarity.EPIC
                || attacker.getCard().getRarity() == Rarity.LEGENDARY) {
            // Option 3: Finisher — high energy, high damage AOE
            int finisherDamage = baseDmg + (attacker.getCard().getRarity() == Rarity.LEGENDARY ? 3 : 2);
            Ability finisher = Ability.damage(
                    attacker.getName() + " Burst",
                    "Deal " + finisherDamage + " damage to all enemies in Front Row",
                    TargetType.ROW_ENEMIES,
                    Row.FRONT,
                    0,
                    finisherDamage
            );
            finisher.setRequiredElement(element);
            int finisherCost = switch (attacker.getCard().getRarity()) {
                case LEGENDARY -> 5;
                case EPIC -> 4;
                default -> 3;
            };
            finisher.setRequiredEnergy(finisherCost);
            abilities.add(finisher);
        }

        return abilities;
    }

    private Ability buildCommonFallbackAbility(CardInstance attacker) {
        String cardId = attacker.getCard().getId();
        if (ZERO_COST_MOVERS.contains(cardId)) {
            Ability move = new Ability(
                    attacker.getName() + " Drift",
                    "Move this Siegling to an open linked point",
                    TargetType.SELF,
                    null,
                    1,
                    "move_link",
                    0,
                    false
            );
            move.setRequiredEnergy(0);
            return move;
        }

        int weakDamage = 1 + attacker.getDamageBoost();
        Ability poke = Ability.damage(
                attacker.getName() + " Poke",
                "Deal " + weakDamage + " damage to 1 enemy",
                TargetType.SINGLE_ENEMY,
                null,
                1,
                weakDamage
        );
        poke.setRequiredEnergy(0);
        return poke;
    }

    private Ability buildSignatureAbility(CardInstance attacker) {
        Ability printed = attacker.getCard().getAbility();
        if (printed == null) {
            int slashDamage = baseBattleDamage(attacker) + attacker.getDamageBoost() + 1;
            Ability fallback = Ability.damage(
                    attacker.getName() + " Slash",
                    "Deal " + slashDamage + " damage to 1 enemy",
                    TargetType.SINGLE_ENEMY,
                    null,
                    1,
                    slashDamage
            );
            return fallback;
        }

        if (!printed.isPassive()) {
            return applyAttackerDamageBonus(attacker, printed.copy());
        }

        Ability converted = new Ability(
                printed.getName(),
                printed.getDescription(),
                TargetType.SINGLE_ALLY,
                null,
                1,
                printed.getEffectType(),
                printed.getEffectValue(),
                false
        );
        converted.setRequiredReaction(printed.getRequiredReaction());
        return converted;
    }

    private Ability applyAttackerDamageBonus(CardInstance attacker, Ability ability) {
        if (!"damage".equals(ability.getEffectType())) {
            return ability;
        }
        int boostedDamage = Math.max(1, ability.getEffectValue() + attacker.getDamageBoost());
        ability.setEffectValue(boostedDamage);
        if (ability.getDescription() != null && ability.getDescription().startsWith("Deal ")) {
            ability.setDescription(ability.getDescription().replaceFirst("Deal \\d+", "Deal " + boostedDamage));
        }
        return ability;
    }

    private int baseBattleDamage(CardInstance attacker) {
        Ability printed = attacker.getCard().getAbility();
        if (printed != null && "damage".equals(printed.getEffectType())) {
            return switch (printed.getTargetType()) {
                case ALL_ENEMIES -> Math.max(2, printed.getEffectValue() - 2);
                case ROW_ENEMIES -> Math.max(2, printed.getEffectValue() - 1);
                default -> Math.max(2, printed.getEffectValue());
            };
        }

        int baseDamage = switch (attacker.getCard().getRarity()) {
            case COMMON -> 2;
            case UNCOMMON -> 3;
            case RARE -> 4;
            case EPIC -> 5;
            case LEGENDARY -> 5;
        };

        if (attacker.getCard().getPreferredRow() == Row.FRONT) {
            baseDamage += 1;
        } else if (attacker.getCard().getPreferredRow() == Row.BACK) {
            baseDamage = Math.max(1, baseDamage - 1);
        }

        if (attacker.getCard().getSpeed() >= 7) {
            baseDamage += 1;
        }

        return baseDamage;
    }

    private void finishBattle(GameState state) {
        state.clearBattleState();
        state.log("=== BATTLE PHASE END ===");
    }

    private boolean isHumanControlled(GameState state, boolean canonicalPlayerSide) {
        return canonicalPlayerSide || state.isEnemyHumanControlled();
    }

    private void updateWinnerFromHealth(GameState state) {
        if (state.getPlayer().getHealth() <= 0 && state.getEnemy().getHealth() <= 0) {
            state.setGameOver(true);
            state.setWinner("Draw");
        } else if (state.getPlayer().getHealth() <= 0) {
            state.setGameOver(true);
            state.setWinner(state.getEnemy().getName());
        } else if (state.getEnemy().getHealth() <= 0) {
            state.setGameOver(true);
            state.setWinner(state.getPlayer().getName());
        }
    }
}
