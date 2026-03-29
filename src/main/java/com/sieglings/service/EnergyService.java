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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Calculates energy from linked notches and board-edge notches.
 * Linked pairs grant connection energy once per connection.
 * Notches that point off the map grant external energy.
 */
@Service
public class EnergyService {

    public record ComboPoint(
            int x,
            int y,
            List<Element> elements,
            String signature,
            int size
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
            int shadowTotal,
            int shadowInternal,
            int shadowExternal,
            int electricTotal,
            int electricInternal,
            int electricExternal,
            int comboTwoCount,
            int comboThreeCount,
            int comboFourCount,
            List<ComboPoint> comboPoints,
            boolean mistActive
    ) {}

    public void recalculateEnergy(GameState state) {
        EnergyBreakdown playerEnergy = analyze(state, true);
        state.getPlayer().setFireEnergy(playerEnergy.fireTotal());
        state.getPlayer().setEarthEnergy(playerEnergy.earthTotal());
        state.getPlayer().setWindEnergy(playerEnergy.windTotal());
        state.getPlayer().setWaterEnergy(playerEnergy.waterTotal());
        state.getPlayer().setShadowEnergy(playerEnergy.shadowTotal());
        state.getPlayer().setElectricEnergy(playerEnergy.electricTotal());
        state.getPlayer().setMistActive(playerEnergy.mistActive());

        EnergyBreakdown enemyEnergy = analyze(state, false);
        state.getEnemy().setFireEnergy(enemyEnergy.fireTotal());
        state.getEnemy().setEarthEnergy(enemyEnergy.earthTotal());
        state.getEnemy().setWindEnergy(enemyEnergy.windTotal());
        state.getEnemy().setWaterEnergy(enemyEnergy.waterTotal());
        state.getEnemy().setShadowEnergy(enemyEnergy.shadowTotal());
        state.getEnemy().setElectricEnergy(enemyEnergy.electricTotal());
        state.getEnemy().setMistActive(enemyEnergy.mistActive());
    }

    public EnergyBreakdown getBreakdown(GameState state, boolean isPlayer) {
        return analyze(state, isPlayer);
    }

    public boolean canAfford(GameState state, boolean isPlayer, Element costElement, int costAmount) {
        if (costElement == null || costAmount <= 0) return true;
        var player = isPlayer ? state.getPlayer() : state.getEnemy();
        return switch (costElement) {
            case FIRE -> player.getFireEnergy() >= costAmount;
            case EARTH -> player.getEarthEnergy() >= costAmount;
            case WIND -> player.getWindEnergy() >= costAmount;
            case WATER -> player.getWaterEnergy() >= costAmount;
            case SHADOW -> player.getShadowEnergy() >= costAmount;
            case ELECTRIC -> player.getElectricEnergy() >= costAmount;
            case NEUTRAL -> (player.getFireEnergy() + player.getEarthEnergy()
                    + player.getWindEnergy() + player.getWaterEnergy()
                    + player.getShadowEnergy() + player.getElectricEnergy()) >= costAmount;
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
        int fireInternal = 0;
        int fireExternal = 0;
        int earthInternal = 0;
        int earthExternal = 0;
        int windInternal = 0;
        int windExternal = 0;
        int waterInternal = 0;
        int waterExternal = 0;
        int shadowInternal = 0;
        int shadowExternal = 0;
        int electricInternal = 0;
        int electricExternal = 0;

        List<CardInstance> sieglings = state.getBoardSieglings(isPlayer);
        Set<String> countedConnections = new HashSet<>();
        Map<String, Set<Element>> pointElements = new HashMap<>();

        for (CardInstance ci : sieglings) {
            for (Notch notch : ci.getNotches()) {
                int adjRow = ci.getBoardRow() + getBoardRowDelta(notch, isPlayer);
                int adjCol = ci.getBoardCol() + notch.direction().getDx();
                BoardPoint point = toBoardPoint(ci, notch, isPlayer);

                if (adjRow < 0 || adjRow > 2 || adjCol < 0 || adjCol > 2) {
                    switch (notch.element()) {
                        case FIRE -> fireExternal++;
                        case EARTH -> earthExternal++;
                        case WIND -> windExternal++;
                        case WATER -> waterExternal++;
                        case SHADOW -> shadowExternal++;
                        case ELECTRIC -> electricExternal++;
                        case NEUTRAL -> { }
                    }
                    continue;
                }

                if (point.x() > 0 && point.x() < 6 && point.y() > 0 && point.y() < 6) {
                    pointElements
                            .computeIfAbsent(point.key(), ignored -> new LinkedHashSet<>())
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
                        case SHADOW -> shadowInternal++;
                        case ELECTRIC -> electricInternal++;
                        case NEUTRAL -> { }
                    }
                }
            }
        }

        List<ComboPoint> comboPoints = pointElements.entrySet().stream()
                .map(entry -> toComboPoint(entry.getKey(), entry.getValue()))
                .filter(comboPoint -> comboPoint.size() >= 2)
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
                shadowInternal + shadowExternal,
                shadowInternal,
                shadowExternal,
                electricInternal + electricExternal,
                electricInternal,
                electricExternal,
                comboTwoCount,
                comboThreeCount,
                comboFourCount,
                comboPoints,
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

    private ComboPoint toComboPoint(String key, Set<Element> elements) {
        String[] parts = key.split(":");
        List<Element> sortedElements = elements.stream()
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
