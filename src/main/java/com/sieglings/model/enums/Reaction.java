package com.sieglings.model.enums;

public enum Reaction {
    MIST;   // Fire + Water

    public String description() {
        return switch (this) {
            case MIST -> "Fire + Water creates Mist";
        };
    }
}
