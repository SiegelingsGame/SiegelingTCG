package com.sieglings.model;

import com.sieglings.model.enums.Row;

import java.util.ArrayList;
import java.util.List;

/**
 * 3x3 board for one player. Rows: BACK(0), MIDDLE(1), FRONT(2). Columns: 0-2.
 */
public class Board {
    private final BoardSpace[][] grid = new BoardSpace[3][3]; // [row][col]

    public Board() {
        for (Row row : Row.values()) {
            for (int col = 0; col < 3; col++) {
                grid[row.getIndex()][col] = new BoardSpace(row, col);
            }
        }
    }

    public BoardSpace getSpace(Row row, int col) {
        return grid[row.getIndex()][col];
    }

    public BoardSpace getSpace(int rowIndex, int col) {
        return grid[rowIndex][col];
    }

    public List<SieglingCard> getAllSieglings() {
        List<SieglingCard> result = new ArrayList<>();
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (!grid[r][c].isEmpty()) {
                    result.add(grid[r][c].getOccupant());
                }
            }
        }
        return result;
    }

    public List<SieglingCard> getSieglingsInRow(Row row) {
        List<SieglingCard> result = new ArrayList<>();
        for (int c = 0; c < 3; c++) {
            if (!grid[row.getIndex()][c].isEmpty()) {
                result.add(grid[row.getIndex()][c].getOccupant());
            }
        }
        return result;
    }

    public int getSieglingCount() {
        return getAllSieglings().size();
    }

    public List<BoardSpace> getEmptySpaces() {
        List<BoardSpace> empty = new ArrayList<>();
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (grid[r][c].isEmpty()) {
                    empty.add(grid[r][c]);
                }
            }
        }
        return empty;
    }

    /** Find the board position of a given card, or null if not found. */
    public int[] findCard(SieglingCard card) {
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (grid[r][c].getOccupant() == card) {
                    return new int[]{r, c};
                }
            }
        }
        return null;
    }

    public BoardSpace[][] getGrid() { return grid; }
}
