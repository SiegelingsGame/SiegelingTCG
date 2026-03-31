package com.sieglings.model;

import com.sieglings.model.enums.Row;

/**
 * A single space on the 3x3 board grid.
 */
public class BoardSpace {
    private final int col; // 0-2
    private final Row row;
    private SieglingCard occupant;

    public BoardSpace(Row row, int col) {
        this.row = row;
        this.col = col;
    }

    public Row getRow() { return row; }
    public int getCol() { return col; }
    public SieglingCard getOccupant() { return occupant; }
    public boolean isEmpty() { return occupant == null; }

    public void place(SieglingCard card) {
        this.occupant = card;
    }

    public SieglingCard remove() {
        SieglingCard removed = this.occupant;
        this.occupant = null;
        return removed;
    }
}
