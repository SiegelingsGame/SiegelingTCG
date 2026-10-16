package com.sieglings.gauntlet;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * One Gauntlet run: the drafted deck with every card's upgrades, the SiegeKnight's level
 * and perks, gold, lives, and whichever choice the player owes next. Plain fields so the
 * whole run round-trips through Jackson into a single Firestore document.
 */
@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY,
        getterVisibility = JsonAutoDetect.Visibility.NONE,
        isGetterVisibility = JsonAutoDetect.Visibility.NONE)
@JsonIgnoreProperties(ignoreUnknown = true)
public class GauntletRun {

    /** What the run is waiting on. Every endpoint checks it before changing anything. */
    public enum Phase {
        /** The ten drafted cards are shown; the player may redraw once, then begins. */
        DRAFT,
        /** Between floors: forge, shop, or step into the next fight. */
        CAMP,
        /** A Battle Table match is live under {@link #battleToken}. */
        BATTLE,
        /** A fight was won: pick one of the offered cards or take gold instead. */
        REWARD,
        /** The SiegeKnight levelled: pick a perk. */
        LEVEL_UP,
        /** Out of lives. */
        OVER
    }

    String token;
    String ownerUserId;
    String playerName;
    long seed;
    long createdAt;
    long updatedAt;

    String deckId;
    String deckName;
    List<String> elements = new ArrayList<>();

    String knightId;
    int knightLevel = 1;
    int knightXp;
    /** Perk stacks taken at level-ups. */
    int perkVitality;
    int perkCommand;
    int perkTactics;
    int perkPlunder;

    int floor = 1;
    int bestFloor = 1;
    int lives = GauntletRules.STARTING_LIVES;
    int gold = GauntletRules.STARTING_GOLD;
    /** Free upgrades earned from elites, knights and the Forgemaster perk. */
    int freeForges;
    boolean draftRerolled;
    int nextCardUid = 1;

    Phase phase = Phase.DRAFT;
    List<GauntletCard> deck = new ArrayList<>();

    /** Solo-game token of the live battle while {@link Phase#BATTLE}. */
    String battleToken;

    /** Card ids offered after a win. */
    List<String> rewardOptions = new ArrayList<>();
    int rewardSkipGold;
    /** Perk keys offered on a level-up. */
    List<String> perkOptions = new ArrayList<>();
    /** Level-ups still owed after the current one (several can land on one boss win). */
    int pendingLevelUps;

    /** Forge offers, kept per card so closing and reopening the forge cannot reroll them. */
    List<ForgeOffer> forgeOffers = new ArrayList<>();
    List<ShopItem> shop = new ArrayList<>();
    int shopFloor;
    int cardsRemoved;

    /** What happened in the last fight, for the camp banner. */
    LastBattle lastBattle;
    List<String> journal = new ArrayList<>();

    int maxHealth() {
        return GauntletRules.PLAYER_BASE_HP + perkVitality * GauntletRules.VITALITY_HP;
    }

    int openingHandSize() {
        return GauntletRules.BASE_OPENING_HAND + perkTactics;
    }

    int knightPowerLevel() {
        return knightLevel + perkCommand;
    }

    GauntletCard findCard(String uid) {
        if (uid == null) return null;
        for (GauntletCard card : deck) {
            if (uid.equals(card.uid)) return card;
        }
        return null;
    }

    void log(String line) {
        journal.add(0, "Floor " + floor + ": " + line);
        if (journal.size() > 30) {
            journal = new ArrayList<>(journal.subList(0, 30));
        }
    }

    /** A deck card: its catalog id plus the upgrades forged onto this copy, in order. */
    @JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY,
            getterVisibility = JsonAutoDetect.Visibility.NONE,
            isGetterVisibility = JsonAutoDetect.Visibility.NONE)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GauntletCard {
        String uid;
        String cardId;
        List<Upgrade> upgrades = new ArrayList<>();

        GauntletCard() {}

        GauntletCard(String uid, String cardId) {
            this.uid = uid;
            this.cardId = cardId;
        }

        int level() {
            return 1 + upgrades.size();
        }
    }

    /**
     * One forged change. {@code moveIndex} counts the card's printed moves in order;
     * {@code element} is the new element for an infusion; {@code rider} names a
     * {@link GauntletUpgrades.Rider}.
     */
    public record Upgrade(String type, int moveIndex, int value, String element, String rider, String label) {}

    @JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY,
            getterVisibility = JsonAutoDetect.Visibility.NONE,
            isGetterVisibility = JsonAutoDetect.Visibility.NONE)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ForgeOffer {
        String cardUid;
        List<Upgrade> options = new ArrayList<>();

        ForgeOffer() {}

        ForgeOffer(String cardUid, List<Upgrade> options) {
            this.cardUid = cardUid;
            this.options = options;
        }
    }

    @JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY,
            getterVisibility = JsonAutoDetect.Visibility.NONE,
            isGetterVisibility = JsonAutoDetect.Visibility.NONE)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ShopItem {
        String id;
        /** CARD, LIFE or REMOVE. */
        String kind;
        String cardId;
        int price;
        boolean sold;

        ShopItem() {}

        ShopItem(String id, String kind, String cardId, int price) {
            this.id = id;
            this.kind = kind;
            this.cardId = cardId;
            this.price = price;
        }
    }

    public record LastBattle(int floor, String encounter, boolean won, int gold, int xp, String note) {}
}
