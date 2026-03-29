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
}
