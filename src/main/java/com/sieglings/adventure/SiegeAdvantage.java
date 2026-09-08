package com.sieglings.adventure;

import com.sieglings.model.enums.Element;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Server-authoritative ordering and card-copy rules for Siege Advantage. */
final class SiegeAdvantage {
    private SiegeAdvantage() {}

    static void ensureOrder(SiegeBattle battle) {
        if (battle.getAdvantageOrder().isEmpty()) rebuild(battle, false);
    }

    static void rebuild(SiegeBattle battle, boolean wrapped) {
        List<Combatant> ordered = livingParticipants(battle);
        ordered.sort(Comparator
                .comparingInt(Combatant::effectiveSpeed).reversed()
                .thenComparingInt(c -> c.getPosition() < 0 ? Integer.MAX_VALUE : c.getPosition())
                .thenComparingInt(c -> sideRank(c, battle))
                .thenComparing(Combatant::getId));

        battle.getAdvantageOrder().clear();
        for (Combatant c : ordered) battle.getAdvantageOrder().add(c.getId());
        battle.setAdvantageIndex(ordered.isEmpty() ? -1 : 0);
        if (wrapped || battle.getAdvantageCycle() == 0) {
            battle.setAdvantageCycle(battle.getAdvantageCycle() + 1);
        }
        battle.event("advantage-order", "order", new ArrayList<>(battle.getAdvantageOrder()),
                "holderId", battle.getAdvantageHolderId(), "cycle", battle.getAdvantageCycle());
    }

    static void advance(SiegeBattle battle) {
        ensureOrder(battle);
        if (battle.getAdvantageOrder().isEmpty()) return;

        int start = Math.max(-1, battle.getAdvantageIndex());
        for (int i = start + 1; i < battle.getAdvantageOrder().size(); i++) {
            Combatant candidate = battle.findCombatant(battle.getAdvantageOrder().get(i));
            if (eligible(candidate)) {
                setHolder(battle, i);
                return;
            }
        }
        rebuild(battle, true);
    }

    /**
     * The token belongs to one Siegeling, not to the clock. It only passes once
     * that holder's team has had its turn; otherwise a mixed-side speed order
     * can give a player Siegeling the token during the enemy turn and take it
     * away before any of its cards are playable.
     */
    static void advanceAfterTeamTurn(SiegeBattle battle, Side completedSide) {
        ensureOrder(battle);
        Combatant holder = battle.findCombatant(battle.getAdvantageHolderId());
        if (!eligible(holder) || holder.getSide() == completedSide) {
            advance(battle);
        }
    }

    static boolean holds(SiegeBattle battle, Combatant combatant) {
        return combatant != null && combatant.getId().equals(battle.getAdvantageHolderId())
                && eligible(combatant);
    }

    static String riderText(Element element, TargetKind target) {
        if (element == null || target == null) return null;
        boolean friendly = switch (target) {
            case ALLY_SINGLE, ALLY_ALL, SELF -> true;
            case ENEMY_SINGLE, ALL_ENEMIES -> false;
        };
        return switch (element) {
            case FIRE -> friendly ? "Kindle: target gains +1 Attack for this battle."
                    : "Sear: deal 2 additional damage.";
            case EARTH -> friendly ? "Fortify: grant 4 Shield."
                    : "Stagger: apply Slow.";
            case WIND -> friendly ? "Tailwind: recover 1 AP after this card."
                    : "Headwind: apply Shock.";
            case WATER -> friendly ? "Mend: heal 3 additional HP."
                    : "Flow: heal the Advantage holder for 2.";
            case ICE -> friendly ? "Frostguard: grant 3 Shield."
                    : "Deep Chill: Slow, or Stun an already-Slow target.";
            case ELECTRIC -> friendly ? "Charge: gain 1 Knight Ultimate Charge."
                    : "Arc: deal 2 damage to another enemy.";
            case METAL -> friendly ? "Plate: grant 5 Shield."
                    : "Expose: break 4 Shield, or deal 1 damage.";
            case SHADOW -> friendly ? "Veil: heal 2 and grant 2 Shield."
                    : "Drain: deal 2 damage and heal the holder for 2.";
            case UNDEAD -> friendly ? "Graveguard: heal 3 if the target is below half HP."
                    : "Reap: deal 3 damage if the target is below half HP.";
            case PSYCHIC -> friendly ? "Insight: draw 1 card."
                    : "Confuse: apply Shock.";
            default -> null;
        };
    }

    private static List<Combatant> livingParticipants(SiegeBattle battle) {
        List<Combatant> out = new ArrayList<>();
        for (Combatant c : battle.getCombatants()) if (eligible(c)) out.add(c);
        return out;
    }

    private static boolean eligible(Combatant c) {
        return c != null && c.isAlive() && !c.isKnight();
    }

    private static int sideRank(Combatant c, SiegeBattle battle) {
        Side first = battle.isPlayerActsFirst() ? Side.PLAYER : Side.ENEMY;
        return c.getSide() == first ? 0 : 1;
    }

    private static void setHolder(SiegeBattle battle, int index) {
        String previous = battle.getAdvantageHolderId();
        battle.setAdvantageIndex(index);
        battle.event("advantage-pass", "fromId", previous,
                "holderId", battle.getAdvantageHolderId(), "cycle", battle.getAdvantageCycle());
    }
}
