package com.sieglings.model;

import com.sieglings.model.enums.Element;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

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
    private Long accountUserId;
    private String loadoutLabel;

    private int fireEnergy;
    private int earthEnergy;
    private int windEnergy;
    private int waterEnergy;
    private int iceEnergy;
    private int shadowEnergy;
    private int electricEnergy;
    private int metalEnergy;
    private int undeadEnergy;
    private int psychicEnergy;
    private boolean mistActive;
    private final Map<Element, Integer> temporaryEnergyAdjustments = new EnumMap<>(Element.class);

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

    public void mulliganHand(int handSize) {
        deck.addAll(hand);
        hand.clear();
        shuffleDeck();
        for (int i = 0; i < handSize; i++) {
            drawCard();
        }
    }

    /**
     * Shuffles the chosen hand cards into the deck, then draws the same number of replacements.
     * Indices are 0-based positions in the current hand before any removal.
     */
    public void mulliganHandAtIndices(List<Integer> indices) {
        if (indices == null || indices.isEmpty()) {
            return;
        }
        int n = hand.size();
        LinkedHashSet<Integer> unique = new LinkedHashSet<>(indices);
        for (int i : unique) {
            if (i < 0 || i >= n) {
                throw new IllegalArgumentException("Invalid hand index for mulligan: " + i);
            }
        }
        List<Integer> sortedDesc = new ArrayList<>(unique);
        sortedDesc.sort(Collections.reverseOrder());
        List<Card> returning = new ArrayList<>();
        for (int idx : sortedDesc) {
            returning.add(hand.remove(idx));
        }
        deck.addAll(returning);
        shuffleDeck();
        for (int j = 0; j < returning.size(); j++) {
            drawCard();
        }
    }

    public int getTemporaryEnergyAdjustment(Element element) {
        if (element == null) {
            return 0;
        }
        return temporaryEnergyAdjustments.getOrDefault(element, 0);
    }

    public void adjustTemporaryEnergy(Element element, int delta) {
        if (element == null || delta == 0) {
            return;
        }
        int next = temporaryEnergyAdjustments.getOrDefault(element, 0) + delta;
        if (next == 0) {
            temporaryEnergyAdjustments.remove(element);
        } else {
            temporaryEnergyAdjustments.put(element, next);
        }
    }

    public void clearTemporaryEnergyAdjustments() {
        temporaryEnergyAdjustments.clear();
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
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
    public int getIceEnergy() { return iceEnergy; }
    public void setIceEnergy(int iceEnergy) { this.iceEnergy = iceEnergy; }
    public int getShadowEnergy() { return shadowEnergy; }
    public void setShadowEnergy(int shadowEnergy) { this.shadowEnergy = shadowEnergy; }
    public int getElectricEnergy() { return electricEnergy; }
    public void setElectricEnergy(int electricEnergy) { this.electricEnergy = electricEnergy; }
    public int getMetalEnergy() { return metalEnergy; }
    public void setMetalEnergy(int metalEnergy) { this.metalEnergy = metalEnergy; }
    public int getUndeadEnergy() { return undeadEnergy; }
    public void setUndeadEnergy(int undeadEnergy) { this.undeadEnergy = undeadEnergy; }
    public int getPsychicEnergy() { return psychicEnergy; }
    public void setPsychicEnergy(int psychicEnergy) { this.psychicEnergy = psychicEnergy; }
    public boolean isMistActive() { return mistActive; }
    public void setMistActive(boolean mistActive) { this.mistActive = mistActive; }
    public int getHealth() { return health; }
    public void setHealth(int health) { this.health = health; }
    public Long getAccountUserId() { return accountUserId; }
    public void setAccountUserId(Long accountUserId) { this.accountUserId = accountUserId; }
    public String getLoadoutLabel() { return loadoutLabel; }
    public void setLoadoutLabel(String loadoutLabel) { this.loadoutLabel = loadoutLabel; }
}
