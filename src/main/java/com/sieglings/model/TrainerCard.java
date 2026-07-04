package com.sieglings.model;

import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;

/**
 * A trainer card providing passive and/or active effects.
 */
public class TrainerCard extends Card {
    private String tier = "SiegeKnight";
    private Ability activeAbility;  // usable once per turn or once per game
    private boolean activeUsedThisTurn;
    private boolean activeUsedThisGame;
    private boolean oncePerGame;     // if true, active can only be used once total

    public TrainerCard() {
        setCardType(CardType.TRAINER);
    }

    public TrainerCard(String id, String name, Element element, Rarity rarity,
                       Ability passiveAbility, Ability activeAbility, boolean oncePerGame) {
        this(id, name, element, rarity, "SiegeKnight", passiveAbility, activeAbility, oncePerGame);
    }

    public TrainerCard(String id, String name, Element element, Rarity rarity, String tier,
                       Ability passiveAbility, Ability activeAbility, boolean oncePerGame) {
        super(id, name, CardType.TRAINER, element, rarity);
        this.tier = tier;
        setAbility(passiveAbility);
        this.activeAbility = activeAbility;
        this.oncePerGame = oncePerGame;
    }

    public TrainerCard copy() {
        TrainerCard copy = new TrainerCard(
                getId(),
                getName(),
                getElement(),
                getRarity(),
                tier,
                getAbility() == null ? null : getAbility().copy(),
                activeAbility == null ? null : activeAbility.copy(),
                oncePerGame
        );
        copy.setCardArtUrl(getCardArtUrl());
        copy.setCardArtMode(getCardArtMode());
        copy.setCardArtOffsetX(getCardArtOffsetX());
        copy.setCardArtOffsetY(getCardArtOffsetY());
        copy.setCardArtOffsetXPct(getCardArtOffsetXPct());
        copy.setCardArtOffsetYPct(getCardArtOffsetYPct());
        copy.setCardArtScale(getCardArtScale());
        copy.setCardArtRotation(getCardArtRotation());
        copy.setHolographic(isHolographic());
        return copy;
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

    public String getTier() { return tier; }
    public void setTier(String tier) { this.tier = tier; }
    public Ability getActiveAbility() { return activeAbility; }
    public void setActiveAbility(Ability activeAbility) { this.activeAbility = activeAbility; }
    public boolean isActiveUsedThisTurn() { return activeUsedThisTurn; }
    public boolean isActiveUsedThisGame() { return activeUsedThisGame; }
    public boolean isOncePerGame() { return oncePerGame; }
}
