package com.sieglings.model;

import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Reaction;

/**
 * A spell card with an elemental cost and effect.
 */
public class SpellCard extends Card {
    private Reaction requiredReaction;
    private int requiredComboSize;
    private String requiredComboSignature;

    public SpellCard() {
        setCardType(CardType.SPELL);
    }

    public SpellCard(String id, String name, Element element, Rarity rarity,
                     int costAmount, Ability effect) {
        super(id, name, CardType.SPELL, element, rarity);
        setCostElement(element);
        setCostAmount(costAmount);
        setAbility(effect);
    }

    public SpellCard copy() {
        SpellCard c = new SpellCard(getId(), getName(), getElement(), getRarity(),
                getCostAmount(), getAbility());
        c.setCostElement(getCostElement());
        c.setRequiredReaction(requiredReaction);
        c.setRequiredComboSize(requiredComboSize);
        c.setRequiredComboSignature(requiredComboSignature);
        c.setCardArtUrl(getCardArtUrl());
        c.setCardArtMode(getCardArtMode());
        c.setCardArtOffsetX(getCardArtOffsetX());
        c.setCardArtOffsetY(getCardArtOffsetY());
        c.setCardArtOffsetXPct(getCardArtOffsetXPct());
        c.setCardArtOffsetYPct(getCardArtOffsetYPct());
        c.setCardArtScale(getCardArtScale());
        c.setCardArtRotation(getCardArtRotation());
        c.setHolographic(isHolographic());
        c.setDescription(getDescription());
        return c;
    }

    public Reaction getRequiredReaction() { return requiredReaction; }
    public void setRequiredReaction(Reaction requiredReaction) { this.requiredReaction = requiredReaction; }
    public int getRequiredComboSize() { return requiredComboSize; }
    public void setRequiredComboSize(int requiredComboSize) { this.requiredComboSize = requiredComboSize; }
    public String getRequiredComboSignature() { return requiredComboSignature; }
    public void setRequiredComboSignature(String requiredComboSignature) { this.requiredComboSignature = requiredComboSignature; }
}
