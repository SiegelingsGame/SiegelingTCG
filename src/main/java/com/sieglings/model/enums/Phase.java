package com.sieglings.model.enums;

public enum Phase {
    MULLIGAN,
    DRAW,
    SETUP,
    BATTLE,
    END;

    public Phase next() {
        return switch (this) {
            case MULLIGAN -> DRAW;
            case DRAW -> SETUP;
            case SETUP -> BATTLE;
            case BATTLE -> END;
            case END -> DRAW;
        };
    }
}
