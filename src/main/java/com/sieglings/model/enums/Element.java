package com.sieglings.model.enums;

public enum Element {
    FIRE,
    EARTH,
    WIND,
    WATER,
    SHADOW,
    ELECTRIC,
    NEUTRAL;

    public String color() {
        return switch (this) {
            case FIRE -> "#ff501e";
            case EARTH -> "#b48c50";
            case WIND -> "#96ffb4";
            case WATER -> "#3296ff";
            case SHADOW -> "#7832b4";
            case ELECTRIC -> "#ffe63c";
            case NEUTRAL -> "#95a5a6";
        };
    }
}
