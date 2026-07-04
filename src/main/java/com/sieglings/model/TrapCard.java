package com.sieglings.model;

import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;

/**
 * Trap cards punish the opponent based on energy in their bucket.
 */
public class TrapCard extends Card {

    public TrapCard() {
        setCardType(CardType.TRAP);
    }

    public TrapCard(String id, String name, Element element, Rarity rarity,
                    Element opponentBucketElement, int opponentBucketAmount, Ability effect) {
        super(id, name, CardType.TRAP, element, rarity);
        setCostElement(opponentBucketElement);
        setCostAmount(opponentBucketAmount);
        setAbility(effect);
    }

    public TrapCard copy() {
        TrapCard copy = new TrapCard(getId(), getName(), getElement(), getRarity(),
                getCostElement(), getCostAmount(), getAbility());
        copy.setCardArtUrl(getCardArtUrl());
        copy.setCardArtMode(getCardArtMode());
        copy.setCardArtOffsetX(getCardArtOffsetX());
        copy.setCardArtOffsetY(getCardArtOffsetY());
        copy.setCardArtOffsetXPct(getCardArtOffsetXPct());
        copy.setCardArtOffsetYPct(getCardArtOffsetYPct());
        copy.setCardArtScale(getCardArtScale());
        copy.setCardArtRotation(getCardArtRotation());
        copy.setHolographic(isHolographic());
        copy.setDescription(getDescription());
        return copy;
    }
}
