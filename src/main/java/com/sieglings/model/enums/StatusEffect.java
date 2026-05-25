package com.sieglings.model.enums;

public enum StatusEffect {
    FREEZE,       // Cannot act next battle phase
    SPEED_ZERO,   // Acts last / effectively disabled
    HEALTH_BOOST, // Temporary shield health
    DAMAGE_BOOST, // Temporary attack-damage boost
    SPEED_BOOST   // Temporary speed boost (e.g. trainer passive)
}
