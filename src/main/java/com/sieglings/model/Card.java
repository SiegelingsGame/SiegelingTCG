package com.sieglings.model;

import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;

/**
 * Base class for all card types.
 */
public abstract class Card {
    private String id;
    private String name;
    private CardType cardType;
    private Element element;
    private Rarity rarity;
    private Ability ability;

    // Energy cost to play
    private Element costElement;
    private int costAmount;

    /** Optional flavor/description text shown on the card in the binder and card detail view. */
    private String description;

    /** Optional custom art for the cards menu binder preview (URL or data URI). */
    private String cardArtUrl;
    /** Optional complete-card artwork shown in binder views when this card is holographic. */
    private String holographicCardArtUrl;
    /** REPLACE replaces the element icon; OVERLAY draws art on top of the default frame; FULL_CARD renders the image as the complete card. */
    private String cardArtMode;
    /** Custom art transform within the binder art frame (pixels / scale / degrees). */
    private Double cardArtOffsetX;
    private Double cardArtOffsetY;
    /** Card-relative offsets (percent of the art element). Preferred over the pixel
     *  offsets above so a dragged position holds the same relative spot at any card size. */
    private Double cardArtOffsetXPct;
    private Double cardArtOffsetYPct;
    private Double cardArtScale;
    private Double cardArtRotation;
    /** When true, the card renders with a rainbow foil shimmer in binder and loadout views. */
    private boolean holographic;

    protected Card() {}

    protected Card(String id, String name, CardType cardType, Element element, Rarity rarity) {
        this.id = id;
        this.name = name;
        this.cardType = cardType;
        this.element = element;
        this.rarity = rarity;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public CardType getCardType() { return cardType; }
    public void setCardType(CardType cardType) { this.cardType = cardType; }
    public Element getElement() { return element; }
    public void setElement(Element element) { this.element = element; }
    public Rarity getRarity() { return rarity; }
    public void setRarity(Rarity rarity) { this.rarity = rarity; }
    public Ability getAbility() { return ability; }
    public void setAbility(Ability ability) { this.ability = ability; }
    public Element getCostElement() { return costElement; }
    public void setCostElement(Element costElement) { this.costElement = costElement; }
    public int getCostAmount() { return costAmount; }
    public void setCostAmount(int costAmount) { this.costAmount = costAmount; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCardArtUrl() { return cardArtUrl; }
    public void setCardArtUrl(String cardArtUrl) { this.cardArtUrl = cardArtUrl; }
    public String getHolographicCardArtUrl() { return holographicCardArtUrl; }
    public void setHolographicCardArtUrl(String holographicCardArtUrl) { this.holographicCardArtUrl = holographicCardArtUrl; }
    public String getCardArtMode() { return cardArtMode; }
    public void setCardArtMode(String cardArtMode) { this.cardArtMode = cardArtMode; }
    public Double getCardArtOffsetX() { return cardArtOffsetX; }
    public void setCardArtOffsetX(Double cardArtOffsetX) { this.cardArtOffsetX = cardArtOffsetX; }
    public Double getCardArtOffsetY() { return cardArtOffsetY; }
    public void setCardArtOffsetY(Double cardArtOffsetY) { this.cardArtOffsetY = cardArtOffsetY; }
    public Double getCardArtOffsetXPct() { return cardArtOffsetXPct; }
    public void setCardArtOffsetXPct(Double cardArtOffsetXPct) { this.cardArtOffsetXPct = cardArtOffsetXPct; }
    public Double getCardArtOffsetYPct() { return cardArtOffsetYPct; }
    public void setCardArtOffsetYPct(Double cardArtOffsetYPct) { this.cardArtOffsetYPct = cardArtOffsetYPct; }
    public Double getCardArtScale() { return cardArtScale; }
    public void setCardArtScale(Double cardArtScale) { this.cardArtScale = cardArtScale; }
    public Double getCardArtRotation() { return cardArtRotation; }
    public void setCardArtRotation(Double cardArtRotation) { this.cardArtRotation = cardArtRotation; }
    public boolean isHolographic() { return holographic; }
    public void setHolographic(boolean holographic) { this.holographic = holographic; }
}
