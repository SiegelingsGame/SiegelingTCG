package com.sieglings.model.enums;

public enum Row {
    BACK(0),
    MIDDLE(1),
    FRONT(2);

    private final int index;

    Row(int index) {
        this.index = index;
    }

    public int getIndex() {
        return index;
    }

    public static Row fromIndex(int index) {
        return switch (index) {
            case 0 -> BACK;
            case 1 -> MIDDLE;
            case 2 -> FRONT;
            default -> throw new IllegalArgumentException("Invalid row index: " + index);
        };
    }
}
