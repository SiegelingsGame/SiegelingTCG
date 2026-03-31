package com.sieglings.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Represents a player's state: deck, hand, discard, trainer, and energy.
 */
public class Player {
    private static final int STARTING_HEALTH = 100;

    private String name;
    private boolean isHuman;
    private List<Card> deck = new ArrayList<>();
    private List<Card> hand = new ArrayList<>();
    private List<Card> discard = new ArrayList<>();
    private TrainerCard activeTrainer;
    private int health = STARTING_HEALTH;

    private int fireEnergy;
    private int earthEnergy;
    private int windEnergy;
    private int waterEnergy;
    private int shadowEnergy;
    private int electricEnergy;
    private boolean mistActive;

    public Player() {}

    public Player(String name, boolean isHuman) {
        this.name = name;
        this.isHuman = isHuman;
    }

    public void shuffleDeck() {
        Collections.shuffle(deck);
    }

    public Card drawCard() {
        if (deck.isEmpty()) return null;
        Card card = deck.remove(0);
        hand.add(card);
        return card;
    }

    public void removeFromHand(Card card) {
        hand.remove(card);
    }

    public void takeDirectDamage(int amount) {
        health = Math.max(0, health - Math.max(0, amount));
    }

    public void healPlayer(int amount) {
        health = Math.min(STARTING_HEALTH, health + Math.max(0, amount));
    }

    public String getName() { return name; }
    public boolean isHuman() { return isHuman; }
    public List<Card> getDeck() { return deck; }
    public void setDeck(List<Card> deck) { this.deck = deck; }
    public List<Card> getHand() { return hand; }
    public List<Card> getDiscard() { return discard; }
    public TrainerCard getActiveTrainer() { return activeTrainer; }
    public void setActiveTrainer(TrainerCard activeTrainer) { this.activeTrainer = activeTrainer; }
    public int getFireEnergy() { return fireEnergy; }
    public void setFireEnergy(int fireEnergy) { this.fireEnergy = fireEnergy; }
    public int getEarthEnergy() { return earthEnergy; }
    public void setEarthEnergy(int earthEnergy) { this.earthEnergy = earthEnergy; }
    public int getWindEnergy() { return windEnergy; }
    public void setWindEnergy(int windEnergy) { this.windEnergy = windEnergy; }
    public int getWaterEnergy() { return waterEnergy; }
    public void setWaterEnergy(int waterEnergy) { this.waterEnergy = waterEnergy; }
    public int getShadowEnergy() { return shadowEnergy; }
    public void setShadowEnergy(int shadowEnergy) { this.shadowEnergy = shadowEnergy; }
    public int getElectricEnergy() { return electricEnergy; }
    public void setElectricEnergy(int electricEnergy) { this.electricEnergy = electricEnergy; }
    public boolean isMistActive() { return mistActive; }
    public void setMistActive(boolean mistActive) { this.mistActive = mistActive; }
    public int getHealth() { return health; }
    public void setHealth(int health) { this.health = health; }
}
