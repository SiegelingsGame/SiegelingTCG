package com.sieglings.service;

import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Calculates energy from linked notches, persistent perimeter call wells, and
 * {@code energy_boost} passives.
 * Linked pairs grant connection energy once per connection.
 * A dedicated outer socket becomes a call well the first time an elemental
 * notch touches it and contributes one baseline energy for the rest of the match.
 * An {@code energy_boost} passive generates its energy from the card itself, so it
 * needs neither a link nor a socket.
 */
@Service
public class EnergyService {

    private final PlacementService placementService;

    /** Null when a non-Spring caller builds the service with links/sockets only. */
    private MovesPoolService movesPoolService;

    /** Board passives are unreadable without the moves pool, so link/socket energy is all this form sees. */
    public EnergyService(PlacementService placementService) {
        this.placementService = placementService;
    }

    @org.springframework.beans.factory.annotation.Autowired
    public EnergyService(PlacementService placementService, MovesPoolService movesPoolService) {
        this.placementService = placementService;
        this.movesPoolService = movesPoolService;
    }

    public record ComboPoint(
            int x,
            int y,
            List<Element> elements,
            String signature,
            int size
    ) {}

    /**
     * Lattice intersection where 2–4 in-board notches meet (visual nexus tier = notchCount).
     */
    public record NexusPoint(
            int x,
            int y,
            int notchCount,
            List<Element> contributingElements
    ) {}

    public record EnergyBreakdown(
            int fireTotal,
            int fireInternal,
            int fireExternal,
            int earthTotal,
            int earthInternal,
            int earthExternal,
            int windTotal,
            int windInternal,
            int windExternal,
            int waterTotal,
            int waterInternal,
            int waterExternal,
            int iceTotal,
            int iceInternal,
            int iceExternal,
            int shadowTotal,
            int shadowInternal,
            int shadowExternal,
            int electricTotal,
            int electricInternal,
            int electricExternal,
            int metalTotal,
            int metalInternal,
            int metalExternal,
            int undeadTotal,
            int undeadInternal,
            int undeadExternal,
            int psychicTotal,
            int psychicInternal,
            int psychicExternal,
            int comboTwoCount,
            int comboThreeCount,
            int comboFourCount,
            List<ComboPoint> comboPoints,
            List<NexusPoint> nexusPoints,
            boolean mistActive,
            /** Link-free energy from {@code energy_boost} passives, already folded into the totals. */
            Map<Element, Integer> passiveEnergy
    ) {
        public int passiveEnergyFor(Element element) {
            return element == null ? 0 : passiveEnergy.getOrDefault(element, 0);
        }
    }

    public void recalculateEnergy(GameState state) {
        EnergyBreakdown playerEnergy = analyze(state, true);
        applyEnergyTotals(state.getPlayer(), playerEnergy);
        state.getPlayer().setMistActive(playerEnergy.mistActive());

        EnergyBreakdown enemyEnergy = analyze(state, false);
        applyEnergyTotals(state.getEnemy(), enemyEnergy);
        state.getEnemy().setMistActive(enemyEnergy.mistActive());
    }

    /** Finds newly touched call wells on the live board. GameState latches them for the match. */
    private Map<String, Element> collectExternalSocketTouches(GameState state, boolean isPlayer) {
        Map<String, Element> detected = new LinkedHashMap<>();
        for (CardInstance ci : state.getBoardSieglings(isPlayer)) {
            for (Notch notch : ci.getNotches()) {
                int adjRow = ci.getBoardRow() + getBoardRowDelta(notch, isPlayer);
                int adjCol = ci.getBoardCol() + notch.direction().getDx();
                if (adjRow >= 0 && adjRow <= 2 && adjCol >= 0 && adjCol <= 2) {
                    continue;
                }
                String externalSocketKey = placementService.resolveExternalSocketKey(
                        ci.getBoardRow(),
                        ci.getBoardCol(),
                        isPlayer,
                        notch.direction()
                );
                if (externalSocketKey != null && notch.element() != Element.NEUTRAL) {
                    detected.putIfAbsent(externalSocketKey, notch.element());
                }
            }
        }
        return detected;
    }

    public EnergyBreakdown getBreakdown(GameState state, boolean isPlayer) {
        return analyze(state, isPlayer);
    }

    /**
     * Subtract energy from the player's current pool (does NOT recalculate from board).
     * Used when casting spells/traps so the cost is deducted until the next phase restore.
     */
    public void spendEnergy(GameState state, boolean isPlayer, Element costElement, int costAmount) {
        if (costElement == null || costAmount <= 0) return;
        var player = isPlayer ? state.getPlayer() : state.getEnemy();
        switch (costElement) {
            case FIRE -> consumeEnergy(player, Element.FIRE, costAmount);
            case EARTH -> consumeEnergy(player, Element.EARTH, costAmount);
            case WIND -> consumeEnergy(player, Element.WIND, costAmount);
            case WATER -> consumeEnergy(player, Element.WATER, costAmount);
            case ICE -> consumeEnergy(player, Element.ICE, costAmount);
            case SHADOW -> consumeEnergy(player, Element.SHADOW, costAmount);
            case ELECTRIC -> consumeEnergy(player, Element.ELECTRIC, costAmount);
            case METAL -> consumeEnergy(player, Element.METAL, costAmount);
            case UNDEAD -> consumeEnergy(player, Element.UNDEAD, costAmount);
            case PSYCHIC -> consumeEnergy(player, Element.PSYCHIC, costAmount);
            case POISON, LIGHT -> { /* no energy pools — spells use NEUTRAL cost */ }
            case NEUTRAL -> spendNeutral(player, costAmount);
        }
    }

    /** Spend NEUTRAL cost from whichever pools have energy, largest-first. */
    private void spendNeutral(com.sieglings.model.Player player, int amount) {
        int remaining = amount;
        // Drain from largest pool first
        while (remaining > 0) {
            int max = 0;
            String maxEl = null;
            if (player.getFireEnergy() > max) { max = player.getFireEnergy(); maxEl = "FIRE"; }
            if (player.getEarthEnergy() > max) { max = player.getEarthEnergy(); maxEl = "EARTH"; }
            if (player.getWindEnergy() > max) { max = player.getWindEnergy(); maxEl = "WIND"; }
            if (player.getWaterEnergy() > max) { max = player.getWaterEnergy(); maxEl = "WATER"; }
            if (player.getIceEnergy() > max) { max = player.getIceEnergy(); maxEl = "ICE"; }
            if (player.getShadowEnergy() > max) { max = player.getShadowEnergy(); maxEl = "SHADOW"; }
            if (player.getElectricEnergy() > max) { max = player.getElectricEnergy(); maxEl = "ELECTRIC"; }
            if (player.getMetalEnergy() > max) { max = player.getMetalEnergy(); maxEl = "METAL"; }
            if (player.getUndeadEnergy() > max) { max = player.getUndeadEnergy(); maxEl = "UNDEAD"; }
            if (player.getPsychicEnergy() > max) { max = player.getPsychicEnergy(); maxEl = "PSYCHIC"; }
            if (maxEl == null) break;
            switch (maxEl) {
                case "FIRE" -> consumeEnergy(player, Element.FIRE, 1);
                case "EARTH" -> consumeEnergy(player, Element.EARTH, 1);
                case "WIND" -> consumeEnergy(player, Element.WIND, 1);
                case "WATER" -> consumeEnergy(player, Element.WATER, 1);
                case "ICE" -> consumeEnergy(player, Element.ICE, 1);
                case "SHADOW" -> consumeEnergy(player, Element.SHADOW, 1);
                case "ELECTRIC" -> consumeEnergy(player, Element.ELECTRIC, 1);
                case "METAL" -> consumeEnergy(player, Element.METAL, 1);
                case "UNDEAD" -> consumeEnergy(player, Element.UNDEAD, 1);
                case "PSYCHIC" -> consumeEnergy(player, Element.PSYCHIC, 1);
            }
            remaining--;
        }
    }

    /**
     * Turns on an active energy buff. The energy is spendable immediately — trainer actives
     * deliberately skip the energy recalculation, so the pool is topped up here as well as
     * recorded — and rides the pool through the owner's next Setup phase.
     * {@link #clearOvercharge} drops it as the Battle phase opens.
     */
    public static void grantOverchargeEnergy(com.sieglings.model.Player player, Element element, int amount) {
        if (player == null || !hasEnergyPool(element) || amount <= 0) {
            return;
        }
        player.addOverchargeEnergy(element, amount);
        switch (element) {
            case FIRE -> player.setFireEnergy(player.getFireEnergy() + amount);
            case EARTH -> player.setEarthEnergy(player.getEarthEnergy() + amount);
            case WIND -> player.setWindEnergy(player.getWindEnergy() + amount);
            case WATER -> player.setWaterEnergy(player.getWaterEnergy() + amount);
            case ICE -> player.setIceEnergy(player.getIceEnergy() + amount);
            case SHADOW -> player.setShadowEnergy(player.getShadowEnergy() + amount);
            case ELECTRIC -> player.setElectricEnergy(player.getElectricEnergy() + amount);
            case METAL -> player.setMetalEnergy(player.getMetalEnergy() + amount);
            case UNDEAD -> player.setUndeadEnergy(player.getUndeadEnergy() + amount);
            case PSYCHIC -> player.setPsychicEnergy(player.getPsychicEnergy() + amount);
            case POISON, LIGHT, NEUTRAL -> { /* no pools — filtered by hasEnergyPool */ }
        }
    }

    /**
     * Ends every live overcharge. Called as the Battle phase opens, which is the one place
     * an active energy buff always expires however late in the round it was used.
     */
    public void clearOvercharge(GameState state) {
        if (state == null) {
            return;
        }
        state.getPlayer().clearOverchargeEnergy();
        state.getEnemy().clearOverchargeEnergy();
    }

    private void applyEnergyTotals(com.sieglings.model.Player player, EnergyBreakdown breakdown) {
        player.setFireEnergy(poolFor(player, breakdown.fireTotal(), Element.FIRE));
        player.setEarthEnergy(poolFor(player, breakdown.earthTotal(), Element.EARTH));
        player.setWindEnergy(poolFor(player, breakdown.windTotal(), Element.WIND));
        player.setWaterEnergy(poolFor(player, breakdown.waterTotal(), Element.WATER));
        player.setIceEnergy(poolFor(player, breakdown.iceTotal(), Element.ICE));
        player.setShadowEnergy(poolFor(player, breakdown.shadowTotal(), Element.SHADOW));
        player.setElectricEnergy(poolFor(player, breakdown.electricTotal(), Element.ELECTRIC));
        player.setMetalEnergy(poolFor(player, breakdown.metalTotal(), Element.METAL));
        player.setUndeadEnergy(poolFor(player, breakdown.undeadTotal(), Element.UNDEAD));
        player.setPsychicEnergy(poolFor(player, breakdown.psychicTotal(), Element.PSYCHIC));
    }

    /** Board energy, plus claim-style temporary energy, plus any live overcharge. */
    private int poolFor(com.sieglings.model.Player player, int boardTotal, Element element) {
        return Math.max(0, boardTotal
                + player.getTemporaryEnergyAdjustment(element)
                + player.getOverchargeEnergy(element));
    }

    private void consumeEnergy(com.sieglings.model.Player player, Element element, int amount) {
        if (player == null || element == null || amount <= 0) {
            return;
        }
        switch (element) {
            case FIRE -> player.setFireEnergy(Math.max(0, player.getFireEnergy() - amount));
            case EARTH -> player.setEarthEnergy(Math.max(0, player.getEarthEnergy() - amount));
            case WIND -> player.setWindEnergy(Math.max(0, player.getWindEnergy() - amount));
            case WATER -> player.setWaterEnergy(Math.max(0, player.getWaterEnergy() - amount));
            case ICE -> player.setIceEnergy(Math.max(0, player.getIceEnergy() - amount));
            case SHADOW -> player.setShadowEnergy(Math.max(0, player.getShadowEnergy() - amount));
            case ELECTRIC -> player.setElectricEnergy(Math.max(0, player.getElectricEnergy() - amount));
            case METAL -> player.setMetalEnergy(Math.max(0, player.getMetalEnergy() - amount));
            case UNDEAD -> player.setUndeadEnergy(Math.max(0, player.getUndeadEnergy() - amount));
            case PSYCHIC -> player.setPsychicEnergy(Math.max(0, player.getPsychicEnergy() - amount));
            case POISON, LIGHT, NEUTRAL -> {
                return;
            }
        }
        player.adjustTemporaryEnergy(element, -amount);
    }

    public boolean canAfford(GameState state, boolean isPlayer, Element costElement, int costAmount) {
        if (costElement == null || costAmount <= 0) return true;
        var player = isPlayer ? state.getPlayer() : state.getEnemy();
        return switch (costElement) {
            case FIRE -> player.getFireEnergy() >= costAmount;
            case EARTH -> player.getEarthEnergy() >= costAmount;
            case WIND -> player.getWindEnergy() >= costAmount;
            case WATER -> player.getWaterEnergy() >= costAmount;
            case ICE -> player.getIceEnergy() >= costAmount;
            case SHADOW -> player.getShadowEnergy() >= costAmount;
            case ELECTRIC -> player.getElectricEnergy() >= costAmount;
            case METAL -> player.getMetalEnergy() >= costAmount;
            case UNDEAD -> player.getUndeadEnergy() >= costAmount;
            case PSYCHIC -> player.getPsychicEnergy() >= costAmount;
            case POISON, LIGHT -> false; // no energy pools; use NEUTRAL cost
            case NEUTRAL -> (player.getFireEnergy() + player.getEarthEnergy()
                    + player.getWindEnergy() + player.getWaterEnergy() + player.getIceEnergy()
                    + player.getShadowEnergy() + player.getElectricEnergy()
                    + player.getMetalEnergy() + player.getUndeadEnergy()
                    + player.getPsychicEnergy()) >= costAmount;
        };
    }

    public boolean canCastSpell(GameState state, boolean isPlayer, SpellCard spell) {
        if (!canAfford(state, isPlayer, spell.getCostElement(), spell.getCostAmount())) {
            return false;
        }

        EnergyBreakdown breakdown = analyze(state, isPlayer);
        if (spell.getRequiredComboSize() > 0
                && !hasComboRequirement(breakdown, spell.getRequiredComboSize(), spell.getRequiredComboSignature())) {
            return false;
        }

        if (spell.getRequiredReaction() != null) {
            var player = isPlayer ? state.getPlayer() : state.getEnemy();
            if (!player.isMistActive()) {
                return false;
            }
        }

        return true;
    }

    public boolean canTriggerTrap(GameState state, boolean isPlayer, TrapCard trap) {
        return canAfford(state, !isPlayer, trap.getCostElement(), trap.getCostAmount());
    }

    private EnergyBreakdown analyze(GameState state, boolean isPlayer) {
        state.mergeExternalSocketActivations(isPlayer, collectExternalSocketTouches(state, isPlayer));
        Map<String, Element> callWells = state.getExternalSocketActivations(isPlayer);

        int fireInternal = 0;
        int fireExternal = 0;
        int earthInternal = 0;
        int earthExternal = 0;
        int windInternal = 0;
        int windExternal = 0;
        int waterInternal = 0;
        int waterExternal = 0;
        int iceInternal = 0;
        int iceExternal = 0;
        int shadowInternal = 0;
        int shadowExternal = 0;
        int electricInternal = 0;
        int electricExternal = 0;
        int metalInternal = 0;
        int metalExternal = 0;
        int undeadInternal = 0;
        int undeadExternal = 0;
        int psychicInternal = 0;
        int psychicExternal = 0;

        List<CardInstance> sieglings = placementService.getFoundationSieglings(state, isPlayer);
        Set<String> countedConnections = new HashSet<>();
        Map<String, List<Element>> pointContributions = new HashMap<>();

        for (CardInstance ci : sieglings) {
            for (Notch notch : ci.getNotches()) {
                int adjRow = ci.getBoardRow() + getBoardRowDelta(notch, isPlayer);
                int adjCol = ci.getBoardCol() + notch.direction().getDx();
                BoardPoint point = toBoardPoint(ci, notch, isPlayer);

                if (adjRow < 0 || adjRow > 2 || adjCol < 0 || adjCol > 2) {
                    continue;
                }

                CardInstance adjacent = state.getAt(isPlayer, adjRow, adjCol);
                if (adjacent == null) {
                    continue;
                }

                NotchDirection opposite = notch.direction().opposite();
                Notch matchingNotch = adjacent.getNotches().stream()
                        .filter(adjNotch -> adjNotch.direction() == opposite)
                        .findFirst()
                        .orElse(null);

                if (matchingNotch == null) {
                    continue;
                }

                String connectionKey = buildConnectionKey(ci, adjacent);
                if (!countedConnections.add(connectionKey)) {
                    continue;
                }

                // Nexus bubbles mirror actual reciprocal links. Two corner notches can
                // touch the same visual point without pointing at each other.
                BoardPoint adjPoint = toBoardPoint(adjacent, matchingNotch, isPlayer);
                addReciprocalNexusContributions(pointContributions, point, notch.element(), adjPoint, matchingNotch.element());

                if (notch.element() == matchingNotch.element()) {
                    switch (notch.element()) {
                        case FIRE -> fireInternal++;
                        case EARTH -> earthInternal++;
                        case WIND -> windInternal++;
                        case WATER -> waterInternal++;
                        case ICE -> iceInternal++;
                        case SHADOW -> shadowInternal++;
                        case ELECTRIC -> electricInternal++;
                        case METAL -> metalInternal++;
                        case UNDEAD -> undeadInternal++;
                        case PSYCHIC -> psychicInternal++;
                        case POISON, LIGHT, NEUTRAL -> { }
                    }
                }
            }
        }

        Map<Element, Integer> passiveEnergy = collectPassiveEnergy(state, isPlayer);

        for (Element element : callWells.values()) {
            switch (element) {
                case FIRE -> fireExternal++;
                case EARTH -> earthExternal++;
                case WIND -> windExternal++;
                case WATER -> waterExternal++;
                case ICE -> iceExternal++;
                case SHADOW -> shadowExternal++;
                case ELECTRIC -> electricExternal++;
                case METAL -> metalExternal++;
                case UNDEAD -> undeadExternal++;
                case PSYCHIC -> psychicExternal++;
                case POISON, LIGHT, NEUTRAL -> { }
            }
        }

        List<NexusPoint> nexusPoints = pointContributions.entrySet().stream()
                .filter(e -> e.getValue().size() >= 2)
                .map(e -> toNexusPoint(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingInt(NexusPoint::y).thenComparingInt(NexusPoint::x))
                .toList();

        List<ComboPoint> comboPoints = pointContributions.entrySet().stream()
                .map(entry -> toComboPoint(entry.getKey(), entry.getValue()))
                .filter(comboPoint -> comboPoint != null && comboPoint.size() >= 2)
                .sorted(Comparator.comparingInt(ComboPoint::y).thenComparingInt(ComboPoint::x))
                .toList();

        int comboTwoCount = (int) comboPoints.stream().filter(point -> point.size() == 2).count();
        int comboThreeCount = (int) comboPoints.stream().filter(point -> point.size() == 3).count();
        int comboFourCount = (int) comboPoints.stream().filter(point -> point.size() >= 4).count();
        boolean mistActive = comboPoints.stream().anyMatch(point ->
                point.elements().contains(Element.FIRE) && point.elements().contains(Element.WATER));

        return new EnergyBreakdown(
                fireInternal + fireExternal + passiveEnergy.getOrDefault(Element.FIRE, 0),
                fireInternal,
                fireExternal,
                earthInternal + earthExternal + passiveEnergy.getOrDefault(Element.EARTH, 0),
                earthInternal,
                earthExternal,
                windInternal + windExternal + passiveEnergy.getOrDefault(Element.WIND, 0),
                windInternal,
                windExternal,
                waterInternal + waterExternal + passiveEnergy.getOrDefault(Element.WATER, 0),
                waterInternal,
                waterExternal,
                iceInternal + iceExternal + passiveEnergy.getOrDefault(Element.ICE, 0),
                iceInternal,
                iceExternal,
                shadowInternal + shadowExternal + passiveEnergy.getOrDefault(Element.SHADOW, 0),
                shadowInternal,
                shadowExternal,
                electricInternal + electricExternal + passiveEnergy.getOrDefault(Element.ELECTRIC, 0),
                electricInternal,
                electricExternal,
                metalInternal + metalExternal + passiveEnergy.getOrDefault(Element.METAL, 0),
                metalInternal,
                metalExternal,
                undeadInternal + undeadExternal + passiveEnergy.getOrDefault(Element.UNDEAD, 0),
                undeadInternal,
                undeadExternal,
                psychicInternal + psychicExternal + passiveEnergy.getOrDefault(Element.PSYCHIC, 0),
                psychicInternal,
                psychicExternal,
                comboTwoCount,
                comboThreeCount,
                comboFourCount,
                comboPoints,
                nexusPoints,
                mistActive,
                Map.copyOf(passiveEnergy)
        );
    }

    /**
     * Link-free energy generated by {@code energy_boost} passives: live board Sieglings
     * and the side's SiegeKnight. Recomputed from the board on every energy pass, so the
     * grant appears the moment the card lands and disappears when it leaves.
     */
    private Map<Element, Integer> collectPassiveEnergy(GameState state, boolean isPlayer) {
        Map<Element, Integer> totals = new EnumMap<>(Element.class);

        for (CardInstance ci : state.getBoardSieglings(isPlayer)) {
            if (ci == null || !ci.isAlive()) {
                continue;
            }
            for (Ability ability : printedAbilities(ci.getCard())) {
                if (!isEnergyBoostPassive(ability)) {
                    continue;
                }
                addPassiveEnergyFor(state, totals, ability, ci, isPlayer);
            }
        }

        TrainerCard trainer = (isPlayer ? state.getPlayer() : state.getEnemy()).getActiveTrainer();
        Ability trainerPassive = trainer == null ? null : trainer.getAbility();
        if (isEnergyBoostPassive(trainerPassive)) {
            addPassiveEnergyFor(state, totals, trainerPassive, null, isPlayer, trainer.getElement());
        }

        return totals;
    }

    private void addPassiveEnergyFor(GameState state, Map<Element, Integer> totals,
                                     Ability ability, CardInstance source, boolean isPlayer) {
        addPassiveEnergyFor(state, totals, ability, source, isPlayer, source.getElement());
    }

    /**
     * A passive aimed at allies reads each ally it names, so with no energy type chosen it
     * generates every named ally's own element. Aimed at itself (the usual PASSIVE/SELF form)
     * it falls back to the card carrying it.
     */
    private void addPassiveEnergyFor(GameState state, Map<Element, Integer> totals, Ability ability,
                                     CardInstance source, boolean isPlayer, Element fallbackElement) {
        List<CardInstance> named = passiveTargets(state, ability, source, isPlayer);
        if (named.isEmpty()) {
            addPassiveEnergy(totals, resolveEnergyElement(ability, fallbackElement), ability.getEffectValue());
            return;
        }
        for (CardInstance target : named) {
            addPassiveEnergy(totals, resolveEnergyElement(ability, target.getElement()), ability.getEffectValue());
        }
    }

    /**
     * Cards a continuously-applied passive names. Only board-wide shapes can be resolved without
     * a player choice — {@code SINGLE_ALLY} has nobody to pick it every turn, so it stays on the
     * carrier like {@code PASSIVE}/{@code SELF}.
     */
    private List<CardInstance> passiveTargets(GameState state, Ability ability,
                                              CardInstance source, boolean isPlayer) {
        if (ability.getTargetType() == null) {
            return List.of();
        }
        return switch (ability.getTargetType()) {
            case ALL_ALLIES -> state.getBoardSieglings(isPlayer).stream()
                    .filter(ci -> ci != null && ci.isAlive())
                    .toList();
            case ROW_ALLIES -> ability.getTargetRow() == null ? List.of()
                    : state.getBoardSieglings(isPlayer).stream()
                            .filter(ci -> ci != null && ci.isAlive()
                                    && ci.getBoardRow() == ability.getTargetRow().getIndex())
                            .toList();
            default -> List.of();
        };
    }

    private List<Ability> printedAbilities(SieglingCard card) {
        if (movesPoolService == null || card == null || !card.hasMoveLoadout()) {
            return List.of();
        }
        return movesPoolService.resolvePrintedAbilities(card);
    }

    private static boolean isEnergyBoostPassive(Ability ability) {
        return ability != null
                && ability.isPassive()
                && AbilityEffectKeys.ENERGY_BOOST.equals(ability.getEffectType());
    }

    private void addPassiveEnergy(Map<Element, Integer> totals, Element element, int value) {
        if (element == null || value <= 0) {
            return;
        }
        totals.merge(element, value, Integer::sum);
    }

    /**
     * The energy type an {@code energy_boost} generates: the element chosen on the ability,
     * falling back to the card's own element. Elements without a pool (Poison, Light, Neutral)
     * generate nothing rather than silently paying into another element's pool.
     */
    public static Element resolveEnergyElement(Ability ability, Element sourceElement) {
        if (ability == null) {
            return null;
        }
        Element chosen = ability.getTargetElement();
        if (hasEnergyPool(chosen)) {
            return chosen;
        }
        if (chosen != null && chosen != Element.NEUTRAL) {
            // An explicit poolless pick (Poison/Light) is a design mistake, not a request
            // to fall back to the card's element — generate nothing so it is visible.
            return null;
        }
        return hasEnergyPool(sourceElement) ? sourceElement : null;
    }

    /** True for elements that have a spendable energy pool on the battle table. */
    public static boolean hasEnergyPool(Element element) {
        if (element == null) {
            return false;
        }
        return switch (element) {
            case FIRE, EARTH, WIND, WATER, ICE, SHADOW, ELECTRIC, METAL, UNDEAD, PSYCHIC -> true;
            case POISON, LIGHT, NEUTRAL -> false;
        };
    }

    private void addReciprocalNexusContributions(Map<String, List<Element>> pointContributions,
                                                 BoardPoint point,
                                                 Element element,
                                                 BoardPoint adjacentPoint,
                                                 Element adjacentElement) {
        String key = null;
        if (point.key().equals(adjacentPoint.key())) {
            key = point.key();
        } else if ((point.x() + adjacentPoint.x()) % 2 == 0 && (point.y() + adjacentPoint.y()) % 2 == 0) {
            key = ((point.x() + adjacentPoint.x()) / 2) + ":" + ((point.y() + adjacentPoint.y()) / 2);
        }
        if (key == null || !isInteriorBoardPoint(key)) {
            return;
        }
        pointContributions.computeIfAbsent(key, ignored -> new ArrayList<>()).add(element);
        pointContributions.computeIfAbsent(key, ignored -> new ArrayList<>()).add(adjacentElement);
    }

    private boolean isInteriorBoardPoint(String key) {
        String[] parts = key.split(":");
        if (parts.length != 2) {
            return false;
        }
        int x = Integer.parseInt(parts[0]);
        int y = Integer.parseInt(parts[1]);
        return x > 0 && x < 6 && y > 0 && y < 6;
    }

    private String buildConnectionKey(CardInstance a, CardInstance b) {
        String first = a.getBoardRow() + ":" + a.getBoardCol();
        String second = b.getBoardRow() + ":" + b.getBoardCol();
        return first.compareTo(second) <= 0 ? first + "|" + second : second + "|" + first;
    }

    private int getBoardRowDelta(Notch notch, boolean isPlayer) {
        return isPlayer ? -notch.direction().getDy() : notch.direction().getDy();
    }

    private boolean hasComboRequirement(EnergyBreakdown breakdown, int requiredComboSize, String requiredSignature) {
        return breakdown.comboPoints().stream().anyMatch(point ->
                point.size() >= requiredComboSize
                        && (requiredSignature == null || requiredSignature.isBlank()
                        || point.signature().equals(requiredSignature)));
    }

    private NexusPoint toNexusPoint(String key, List<Element> contributions) {
        String[] parts = key.split(":");
        return new NexusPoint(
                Integer.parseInt(parts[0]),
                Integer.parseInt(parts[1]),
                contributions.size(),
                List.copyOf(contributions)
        );
    }

    /** Combo typing uses distinct elements only (multiset collapse). */
    private ComboPoint toComboPoint(String key, List<Element> contributions) {
        Set<Element> distinct = new LinkedHashSet<>(contributions);
        if (distinct.size() < 2) {
            return null;
        }
        String[] parts = key.split(":");
        List<Element> sortedElements = distinct.stream()
                .sorted(Comparator.comparing(Enum::name))
                .toList();
        return new ComboPoint(
                Integer.parseInt(parts[0]),
                Integer.parseInt(parts[1]),
                sortedElements,
                sortedElements.stream().map(Enum::name).collect(Collectors.joining("+")),
                sortedElements.size()
        );
    }

    private BoardPoint toBoardPoint(CardInstance card, Notch notch, boolean isPlayer) {
        int[] local = switch (notch.direction()) {
            case TOP -> new int[] {1, 0};
            case TOP_RIGHT -> new int[] {2, 0};
            case RIGHT -> new int[] {2, 1};
            case BOTTOM_RIGHT -> new int[] {2, 2};
            case BOTTOM -> new int[] {1, 2};
            case BOTTOM_LEFT -> new int[] {0, 2};
            case LEFT -> new int[] {0, 1};
            case TOP_LEFT -> new int[] {0, 0};
        };

        int localX = local[0];
        int localY = isPlayer ? 2 - local[1] : local[1];
        int x = (card.getBoardCol() * 2) + localX;
        int y = (card.getBoardRow() * 2) + localY;
        return new BoardPoint(x, y);
    }

    private record BoardPoint(int x, int y) {
        private String key() {
            return x + ":" + y;
        }
    }
}
