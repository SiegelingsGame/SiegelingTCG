package com.sieglings.model.enums;

public enum Element {
    FIRE,
    ICE,
    WATER,
    EARTH,
    WIND,
    SHADOW,
    ELECTRIC,
    METAL,
    UNDEAD,
    PSYCHIC,
    POISON,
    LIGHT,
    NEUTRAL;

    public String color() {
        return switch (this) {
            case FIRE -> "#ff501e";
            case EARTH -> "#b48c50";
            case WIND -> "#96ffb4";
            case WATER -> "#3296ff";
            case ICE -> "#76e6ff";
            case SHADOW -> "#7832b4";
            case ELECTRIC -> "#ffe63c";
            case METAL -> "#a0aab4";
            case UNDEAD -> "#8c78a0";
            case PSYCHIC -> "#c896ff";
            case POISON -> "#78dc50";
            case LIGHT -> "#fffac8";
            case NEUTRAL -> "#95a5a6";
        };
    }
}
