package com.sieglings.model.enums;

public enum Phase {
    DRAW,
    SETUP,
    BATTLE,
    END;

    public Phase next() {
        return switch (this) {
            case DRAW -> SETUP;
            case SETUP -> BATTLE;
            case BATTLE -> END;
            case END -> DRAW;
        };
    }
}
