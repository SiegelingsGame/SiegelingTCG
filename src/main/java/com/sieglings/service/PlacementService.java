package com.sieglings.service;

import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.Notch;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.NotchDirection;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Determines legal placement positions for Sieglings on the board.
 */
@Service
public class PlacementService {

    private static final int MAX_BOARD_SIEGLINGS = 5;

    /**
     * Get all legal placement positions for the given player.
     * Returns list of [row, col] pairs.
     */
    public List<int[]> getLegalPlacements(GameState state, boolean isPlayer) {
        return getLegalPlacements(state, isPlayer, null);
    }

    public List<int[]> getLegalPlacements(GameState state, boolean isPlayer, SieglingCard candidate) {
        List<int[]> positions = new ArrayList<>();

        if (candidate != null && candidate.isEvolutionCard()) {
            for (int row = 0; row < 3; row++) {
                for (int col = 0; col < 3; col++) {
                    if (isEvolutionPlacement(state, isPlayer, row, col, candidate)) {
                        positions.add(new int[]{row, col});
                    }
                }
            }
            return positions;
        }

        boolean hasAnySiegling = state.countBoardSieglings(isPlayer) > 0;

        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 3; col++) {
                if (state.countBoardSieglings(isPlayer) >= MAX_BOARD_SIEGLINGS) {
                    return positions;
                }

                if (state.getAt(isPlayer, row, col) != null) continue;

                if (!hasAnySiegling) {
                    // First placement: any open square on your side of the board
                    positions.add(new int[]{row, col});
                } else {
                    // Subsequent placements: can either complete a reciprocal notch link
                    // or anchor directly to one of the board's perimeter sockets.
                    if (isConnectedByAnchor(state, isPlayer, row, col, candidate)) {
                        positions.add(new int[]{row, col});
                    }
                }
            }
        }

        return positions;
    }

    /**
     * Check if a position is connected to any existing friendly card's active notch.
     */
    private boolean isConnectedByAnchor(GameState state, boolean isPlayer, int targetRow, int targetCol, SieglingCard candidate) {
        List<CardInstance> sieglings = getFoundationSieglings(state, isPlayer);

        for (CardInstance ci : sieglings) {
            for (Notch notch : ci.getNotches()) {
                int adjRow = ci.getBoardRow() + getBoardRowDelta(notch, isPlayer);
                int adjCol = ci.getBoardCol() + notch.direction().getDx();

                if (adjRow == targetRow && adjCol == targetCol && candidateCanLink(candidate, notch.direction())) {
                    return true;
                }
            }
        }

        for (NotchDirection socketDirection : getExternalSocketDirections(targetRow, targetCol, isPlayer)) {
            if (candidateCanLink(candidate, socketDirection.opposite())) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if a specific placement is legal.
     */
    public boolean isLegalPlacement(GameState state, boolean isPlayer, int row, int col) {
        return isLegalPlacement(state, isPlayer, row, col, null);
    }

    public boolean isLegalPlacement(GameState state, boolean isPlayer, int row, int col, SieglingCard candidate) {
        for (int[] pos : getLegalPlacements(state, isPlayer, candidate)) {
            if (pos[0] == row && pos[1] == col) return true;
        }
        return false;
    }

    public boolean isEvolutionPlacement(GameState state, boolean isPlayer, int row, int col, SieglingCard candidate) {
        if (candidate == null || !candidate.isEvolutionCard()) {
            return false;
        }
        CardInstance existing = state.getAt(isPlayer, row, col);
        return existing != null && candidate.getEvolvesFromId().equals(existing.getCard().getId());
    }

    public CardInstance createPlacedInstance(CardInstance existing, SieglingCard candidate, boolean owner, int row, int col) {
        SieglingCard placedCard = candidate.copy();
        if (existing != null && candidate.isEvolutionCard() && candidate.getEvolvesFromId().equals(existing.getCard().getId())) {
            placedCard.setNotches(mergeNotches(existing.getNotches(), placedCard.getNotches()));
            CardInstance evolved = new CardInstance(placedCard, row, col, owner);
            int damageTaken = existing.getCard().getHealth() - existing.getCurrentHealth();
            evolved.setCurrentHealth(Math.max(1, placedCard.getHealth() - Math.max(0, damageTaken)));
            evolved.setPlacementOrder(existing.getPlacementOrder());
            return evolved;
        }

        return new CardInstance(placedCard, row, col, owner);
    }

    private int getBoardRowDelta(Notch notch, boolean isPlayer) {
        return isPlayer ? -notch.direction().getDy() : notch.direction().getDy();
    }

    private boolean candidateCanLink(SieglingCard candidate, NotchDirection existingDirection) {
        if (candidate == null) {
            return true;
        }

        NotchDirection neededDirection = existingDirection.opposite();
        return candidate.getNotches().stream().anyMatch(notch -> notch.direction() == neededDirection);
    }

    public List<CardInstance> getFoundationSieglings(GameState state, boolean isPlayer) {
        List<CardInstance> sieglings = state.getBoardSieglings(isPlayer);
        if (sieglings.size() <= 1) {
            return sieglings;
        }

        CardInstance root = sieglings.stream()
                .min(Comparator.comparingInt(CardInstance::getPlacementOrder))
                .orElse(null);
        if (root == null) {
            return sieglings;
        }

        List<CardInstance> connected = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        collectConnected(root, sieglings, isPlayer, connected, visited);
        for (CardInstance siegling : sieglings) {
            if (hasExternalSocketAnchor(siegling, isPlayer)) {
                collectConnected(siegling, sieglings, isPlayer, connected, visited);
            }
        }
        return connected;
    }

    boolean hasExternalSocketAnchor(CardInstance card, boolean isPlayer) {
        return card.getNotches().stream()
                .map(Notch::direction)
                .anyMatch(direction -> resolveExternalSocketKey(card.getBoardRow(), card.getBoardCol(), isPlayer, direction) != null);
    }

    public List<CardInstance> getConnectedSieglings(GameState state, CardInstance source) {
        if (state == null || source == null || !source.isAlive()) {
            return List.of();
        }

        List<CardInstance> sieglings = state.getBoardSieglings(source.isOwner());
        if (sieglings.isEmpty()) {
            return List.of();
        }

        List<CardInstance> connected = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        collectConnected(source, sieglings, source.isOwner(), connected, visited);
        return connected;
    }

    public List<CardInstance> getConnectedAllies(GameState state, CardInstance source) {
        return getConnectedSieglings(state, source).stream()
                .filter(candidate -> candidate != source)
                .toList();
    }

    String resolveExternalSocketKey(int row, int col, boolean isPlayer, NotchDirection direction) {
        return switch (direction) {
            case LEFT -> col == 0 ? "left-" + row : null;
            case RIGHT -> col == 2 ? "right-" + row : null;
            case BOTTOM -> isPlayer && row == 0 ? "outer-" + col : null;
            case TOP -> !isPlayer && row == 0 ? "outer-" + col : null;
            default -> null;
        };
    }

    private List<NotchDirection> getExternalSocketDirections(int row, int col, boolean isPlayer) {
        List<NotchDirection> directions = new ArrayList<>();
        if (col == 0) {
            directions.add(NotchDirection.LEFT);
        }
        if (col == 2) {
            directions.add(NotchDirection.RIGHT);
        }
        if (row == 0) {
            directions.add(isPlayer ? NotchDirection.BOTTOM : NotchDirection.TOP);
        }
        return directions;
    }

    private void collectConnected(CardInstance current, List<CardInstance> allSieglings, boolean isPlayer,
                                  List<CardInstance> connected, Set<String> visited) {
        if (!visited.add(current.getInstanceId())) {
            return;
        }

        connected.add(current);
        for (CardInstance candidate : allSieglings) {
            if (candidate == current) {
                continue;
            }
            if (hasReciprocalLink(current, candidate, isPlayer)) {
                collectConnected(candidate, allSieglings, isPlayer, connected, visited);
            }
        }
    }

    private boolean hasReciprocalLink(CardInstance source, CardInstance target, boolean isPlayer) {
        for (Notch notch : source.getNotches()) {
            int adjRow = source.getBoardRow() + getBoardRowDelta(notch, isPlayer);
            int adjCol = source.getBoardCol() + notch.direction().getDx();
            if (adjRow == target.getBoardRow() && adjCol == target.getBoardCol()) {
                if (target.getNotches().stream().anyMatch(targetNotch -> targetNotch.direction() == notch.direction().opposite())) {
                    return true;
                }
            }
        }
        return false;
    }

    private List<Notch> mergeNotches(List<Notch> inherited, List<Notch> added) {
        Map<String, Notch> merged = new LinkedHashMap<>();
        for (Notch notch : inherited) {
            merged.put(notch.direction().name() + ":" + notch.element().name(), notch);
        }
        for (Notch notch : added) {
            merged.put(notch.direction().name() + ":" + notch.element().name(), notch);
        }
        return new ArrayList<>(merged.values());
    }
}
