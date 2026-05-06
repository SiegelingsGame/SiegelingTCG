package com.sieglings.model.enums;

public enum TargetType {
    SINGLE_ENEMY,       // Select 1 enemy target
    ALL_ENEMIES,        // All enemy targets
    ROW_ENEMIES,        // All enemies in a specific row
    SINGLE_ALLY,        // Select 1 allied target
    ALL_ALLIES,         // All allied targets
    ROW_ALLIES,         // All allies in a specific row
    ROW_SELECT_ENEMIES, // Player selects an enemy row at battle time
    ROW_SELECT_ALLIES,  // Player selects an allied row at battle time
    ENEMY_PLAYER,       // Directly affect the opposing player's health
    SELF,               // The card itself
    PASSIVE             // No targeting needed, always active
}
