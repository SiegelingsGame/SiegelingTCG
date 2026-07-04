package com.sieglings.adventure;

import java.util.ArrayList;
import java.util.List;

/**
 * A single node on the Siege expedition map. The map is a branching DAG laid
 * out in rows (row 0 = expedition start, last row = the Siegelord boss); each
 * node links forward to one or more nodes on the following row.
 */
class SiegeNode {
    private final int id;
    private final int row;
    private final int col;
    private final NodeType type;
    private final String label;
    private boolean cleared;
    /** Ids of the nodes on the next row this node connects to. */
    private final List<Integer> next = new ArrayList<>();

    SiegeNode(int id, int row, int col, NodeType type, String label) {
        this.id = id;
        this.row = row;
        this.col = col;
        this.type = type;
        this.label = label;
    }

    int getId() { return id; }
    int getRow() { return row; }
    int getCol() { return col; }
    NodeType getType() { return type; }
    String getLabel() { return label; }
    boolean isCleared() { return cleared; }
    void setCleared(boolean cleared) { this.cleared = cleared; }
    List<Integer> getNext() { return next; }

    boolean isBattle() {
        return type == NodeType.BATTLE || type == NodeType.ELITE || type == NodeType.BOSS;
    }
}
