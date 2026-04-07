package com.sieglings.service;

import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Calculates energy from linked notches and explicit perimeter sockets.
 * Linked pairs grant connection energy once per connection.
 * External energy only comes from the board's dedicated outer sockets.
 */
@Service
public class EnergyService {

    private final PlacementService placementService;

    public EnergyService(PlacementService placementService) {
        this.placementService = placementService;
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
            boolean mistActive
    ) {}

    public void recalculateEnergy(GameState state) {
        EnergyBreakdown playerEnergy = analyze(state, true);
        applyEnergyTotals(state.getPlayer(), playerEnergy);
        state.getPlayer().setMistActive(playerEnergy.mistActive());

        EnergyBreakdown enemyEnergy = analyze(state, false);
        applyEnergyTotals(state.getEnemy(), enemyEnergy);
        state.getEnemy().setMistActive(enemyEnergy.mistActive());
    }

    /**
     * Any Siegling currently touching a perimeter socket activates that socket for the match
     * (merged into GameState); energy persists if the Sieglink breaks. Setup placement budget is snapshotted
     * from total pooled energy when setup begins, not from socket count.
     */
    private void mergeDetectedExternalSockets(GameState state, boolean isPlayer) {
        state.mergeExternalSocketActivations(isPlayer, collectExternalSocketTouches(state, isPlayer));
    }

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

    private void applyEnergyTotals(com.sieglings.model.Player player, EnergyBreakdown breakdown) {
        player.setFireEnergy(Math.max(0, breakdown.fireTotal() + player.getTemporaryEnergyAdjustment(Element.FIRE)));
        player.setEarthEnergy(Math.max(0, breakdown.earthTotal() + player.getTemporaryEnergyAdjustment(Element.EARTH)));
        player.setWindEnergy(Math.max(0, breakdown.windTotal() + player.getTemporaryEnergyAdjustment(Element.WIND)));
        player.setWaterEnergy(Math.max(0, breakdown.waterTotal() + player.getTemporaryEnergyAdjustment(Element.WATER)));
        player.setIceEnergy(Math.max(0, breakdown.iceTotal() + player.getTemporaryEnergyAdjustment(Element.ICE)));
        player.setShadowEnergy(Math.max(0, breakdown.shadowTotal() + player.getTemporaryEnergyAdjustment(Element.SHADOW)));
        player.setElectricEnergy(Math.max(0, breakdown.electricTotal() + player.getTemporaryEnergyAdjustment(Element.ELECTRIC)));
        player.setMetalEnergy(Math.max(0, breakdown.metalTotal() + player.getTemporaryEnergyAdjustment(Element.METAL)));
        player.setUndeadEnergy(Math.max(0, breakdown.undeadTotal() + player.getTemporaryEnergyAdjustment(Element.UNDEAD)));
        player.setPsychicEnergy(Math.max(0, breakdown.psychicTotal() + player.getTemporaryEnergyAdjustment(Element.PSYCHIC)));
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
        mergeDetectedExternalSockets(state, isPlayer);

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

                if (point.x() > 0 && point.x() < 6 && point.y() > 0 && point.y() < 6) {
                    pointContributions
                            .computeIfAbsent(point.key(), ignored -> new ArrayList<>())
                            .add(notch.element());
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

        for (Element element : state.getExternalSocketActivations(isPlayer).values()) {
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
                fireInternal + fireExternal,
                fireInternal,
                fireExternal,
                earthInternal + earthExternal,
                earthInternal,
                earthExternal,
                windInternal + windExternal,
                windInternal,
                windExternal,
                waterInternal + waterExternal,
                waterInternal,
                waterExternal,
                iceInternal + iceExternal,
                iceInternal,
                iceExternal,
                shadowInternal + shadowExternal,
                shadowInternal,
                shadowExternal,
                electricInternal + electricExternal,
                electricInternal,
                electricExternal,
                metalInternal + metalExternal,
                metalInternal,
                metalExternal,
                undeadInternal + undeadExternal,
                undeadInternal,
                undeadExternal,
                psychicInternal + psychicExternal,
                psychicInternal,
                psychicExternal,
                comboTwoCount,
                comboThreeCount,
                comboFourCount,
                comboPoints,
                nexusPoints,
                mistActive
        );
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
