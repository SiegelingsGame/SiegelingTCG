package com.sieglings.adventure;

/** A single node on the Siege run map. */
class SiegeNode {
    private final int index;
    private final NodeType type;
    private final String label;
    private boolean cleared;

    SiegeNode(int index, NodeType type, String label) {
        this.index = index;
        this.type = type;
        this.label = label;
    }

    int getIndex() { return index; }
    NodeType getType() { return type; }
    String getLabel() { return label; }
    boolean isCleared() { return cleared; }
    void setCleared(boolean cleared) { this.cleared = cleared; }

    boolean isBattle() {
        return type == NodeType.BATTLE || type == NodeType.ELITE || type == NodeType.BOSS;
    }
}
