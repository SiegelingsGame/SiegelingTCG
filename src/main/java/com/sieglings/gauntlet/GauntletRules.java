package com.sieglings.gauntlet;

import com.sieglings.model.enums.Rarity;

/**
 * Every Gauntlet number in one place, so tuning the climb never means hunting
 * through the service. A floor's place in its ten-floor act drives most curves:
 * floors 1-9 of an act are wild fights, floor 5 is the elite, floor 10 the knight.
 */
public final class GauntletRules {

    public static final int DRAFT_SIZE = 10;
    public static final int DRAFT_SIEGLINGS = 6;
    public static final int DRAFT_SPELLS = 2;
    public static final int DRAFT_TRAPS = 2;

    public static final int PLAYER_BASE_HP = 25;
    public static final int VITALITY_HP = 4;
    public static final int BASE_OPENING_HAND = 5;
    public static final int MAX_TACTICS = 2;
    public static final int STARTING_LIVES = 3;
    public static final int MAX_LIVES = 3;
    public static final int STARTING_GOLD = 40;

    public static final int ACT_LENGTH = 10;
    public static final int ELITE_FLOOR_IN_ACT = 5;
    public static final int KNIGHT_BOSS_HP = 30;

    public static final int MAX_CARD_LEVEL = 6;
    public static final int MIN_DECK_SIZE = 6;
    public static final int MAX_KNIGHT_LEVEL = 10;

    private GauntletRules() {}

    /** 1-10: the floor's place inside its act. */
    public static int floorInAct(int floor) {
        return ((Math.max(1, floor) - 1) % ACT_LENGTH) + 1;
    }

    /** 0 for floors 1-10, 1 for 11-20, ... */
    public static int act(int floor) {
        return (Math.max(1, floor) - 1) / ACT_LENGTH;
    }

    public static boolean isKnightFloor(int floor) {
        return floorInAct(floor) == ACT_LENGTH;
    }

    public static boolean isEliteFloor(int floor) {
        return floorInAct(floor) == ELITE_FLOOR_IN_ACT;
    }

    /** Wild enemies start with only a little health and grow through the act. */
    public static int wildEnemyHp(int floor) {
        return 4 + 2 * floorInAct(floor) + 3 * act(floor);
    }

    public static int eliteEnemyHp(int floor) {
        return 16 + 3 * act(floor);
    }

    /** Every tenth floor: a SiegeKnight with 30 HP, a little more each act after the first. */
    public static int knightEnemyHp(int floor) {
        return KNIGHT_BOSS_HP + 5 * act(floor);
    }

    /**
     * Later acts toughen every enemy creature; the first few floors soften them instead,
     * because a fresh ten-card deck has little energy to fight with yet.
     */
    public static int enemyCreatureHealthBonus(int floor) {
        if (act(floor) == 0 && floorInAct(floor) <= 4) {
            return -2;
        }
        return 2 * act(floor);
    }

    public static int knightLevelFor(int floor) {
        return 1 + 2 * act(floor);
    }

    public static int winGold(int floor, boolean elite, boolean knight) {
        if (knight) return 60 + 10 * act(floor);
        if (elite) return 30 + 6 * act(floor);
        return 12 + 2 * floorInAct(floor) + 4 * act(floor);
    }

    public static int winXp(boolean elite, boolean knight) {
        if (knight) return 4;
        if (elite) return 2;
        return 1;
    }

    /** XP needed to go from {@code level} to the next. */
    public static int xpToNext(int level) {
        return 2 + level;
    }

    public static int forgeCost(int cardLevel) {
        return 15 + 10 * Math.max(0, cardLevel - 1);
    }

    public static int cardPrice(Rarity rarity) {
        if (rarity == null) return 30;
        return switch (rarity) {
            case COMMON -> 25;
            case UNCOMMON -> 40;
            case RARE -> 60;
            case EPIC -> 85;
            case LEGENDARY -> 120;
        };
    }

    public static final int LIFE_PRICE = 70;
    public static final int REMOVE_PRICE = 40;
    public static final int REWARD_SKIP_GOLD = 10;
    public static final int PLUNDER_PERCENT = 25;

    public static int applyPlunder(int gold, int plunderStacks) {
        return gold + (gold * PLUNDER_PERCENT * Math.max(0, plunderStacks)) / 100;
    }
}
