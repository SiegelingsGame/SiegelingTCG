package com.sieglings.model.enums;

public enum NotchDirection {
    TOP(0, -1),
    TOP_RIGHT(1, -1),
    RIGHT(1, 0),
    BOTTOM_RIGHT(1, 1),
    BOTTOM(0, 1),
    BOTTOM_LEFT(-1, 1),
    LEFT(-1, 0),
    TOP_LEFT(-1, -1);

    private final int dx;
    private final int dy;

    NotchDirection(int dx, int dy) {
        this.dx = dx;
        this.dy = dy;
    }

    public int getDx() { return dx; }
    public int getDy() { return dy; }

    /** Returns the opposite direction (e.g., TOP -> BOTTOM) */
    public NotchDirection opposite() {
        return switch (this) {
            case TOP -> BOTTOM;
            case TOP_RIGHT -> BOTTOM_LEFT;
            case RIGHT -> LEFT;
            case BOTTOM_RIGHT -> TOP_LEFT;
            case BOTTOM -> TOP;
            case BOTTOM_LEFT -> TOP_RIGHT;
            case LEFT -> RIGHT;
            case TOP_LEFT -> BOTTOM_RIGHT;
        };
    }
}
