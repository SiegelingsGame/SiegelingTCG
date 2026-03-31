package com.sieglings.model;

import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;

import java.util.ArrayList;
import java.util.List;

/**
 * A Siegling creature card with health, speed, notches, and an ability.
 */
public class SieglingCard extends Card {
    private int health;
    private int speed;
    private List<Notch> notches = new ArrayList<>();
    private Row preferredRow;
    private String evolvesFromId;
    private String evolvesFromName;

    public SieglingCard() {
        setCardType(CardType.SIEGLING);
    }

    public SieglingCard(String id, String name, Element element, Rarity rarity,
                        int health, int speed, List<Notch> notches, Row preferredRow) {
        super(id, name, CardType.SIEGLING, element, rarity);
        this.health = health;
        this.speed = speed;
        this.notches = notches != null ? notches : new ArrayList<>();
        this.preferredRow = preferredRow;
    }

    /** Create a deep copy for use as a card instance in game */
    public SieglingCard copy() {
        SieglingCard c = new SieglingCard(getId(), getName(), getElement(), getRarity(),
                health, speed, new ArrayList<>(notches), preferredRow);
        c.setAbility(getAbility());
        c.setCostElement(getCostElement());
        c.setCostAmount(getCostAmount());
        c.setEvolvesFromId(evolvesFromId);
        c.setEvolvesFromName(evolvesFromName);
        return c;
    }

    public int getHealth() { return health; }
    public void setHealth(int health) { this.health = health; }
    public int getSpeed() { return speed; }
    public void setSpeed(int speed) { this.speed = speed; }
    public List<Notch> getNotches() { return notches; }
    public void setNotches(List<Notch> notches) { this.notches = notches; }
    public Row getPreferredRow() { return preferredRow; }
    public void setPreferredRow(Row preferredRow) { this.preferredRow = preferredRow; }
    public String getEvolvesFromId() { return evolvesFromId; }
    public void setEvolvesFromId(String evolvesFromId) { this.evolvesFromId = evolvesFromId; }
    public String getEvolvesFromName() { return evolvesFromName; }
    public void setEvolvesFromName(String evolvesFromName) { this.evolvesFromName = evolvesFromName; }
    public boolean isEvolutionCard() { return evolvesFromId != null && !evolvesFromId.isBlank(); }
}
