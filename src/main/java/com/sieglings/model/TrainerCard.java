package com.sieglings.model;

import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;

/**
 * A trainer card providing passive and/or active effects.
 */
public class TrainerCard extends Card {
    private Ability activeAbility;  // usable once per turn or once per game
    private boolean activeUsedThisTurn;
    private boolean activeUsedThisGame;
    private boolean oncePerGame;     // if true, active can only be used once total

    public TrainerCard() {
        setCardType(CardType.TRAINER);
    }

    public TrainerCard(String id, String name, Element element, Rarity rarity,
                       Ability passiveAbility, Ability activeAbility, boolean oncePerGame) {
        super(id, name, CardType.TRAINER, element, rarity);
        setAbility(passiveAbility);
        this.activeAbility = activeAbility;
        this.oncePerGame = oncePerGame;
    }

    public TrainerCard copy() {
        return new TrainerCard(getId(), getName(), getElement(), getRarity(),
                getAbility(), activeAbility, oncePerGame);
    }

    public boolean canUseActive() {
        if (activeAbility == null) return false;
        if (oncePerGame && activeUsedThisGame) return false;
        return !activeUsedThisTurn;
    }

    public void useActive() {
        activeUsedThisTurn = true;
        if (oncePerGame) activeUsedThisGame = true;
    }

    public void resetTurn() {
        activeUsedThisTurn = false;
    }

    public Ability getActiveAbility() { return activeAbility; }
    public void setActiveAbility(Ability activeAbility) { this.activeAbility = activeAbility; }
    public boolean isActiveUsedThisTurn() { return activeUsedThisTurn; }
    public boolean isActiveUsedThisGame() { return activeUsedThisGame; }
    public boolean isOncePerGame() { return oncePerGame; }
}
