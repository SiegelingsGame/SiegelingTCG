package com.sieglings.model;

import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.SieglingSize;

import java.util.ArrayList;
import java.util.List;

/**
 * A Siegling creature card with health, speed, notches, and up to five moves from the shared pool.
 */
public class SieglingCard extends Card {
    private int health;
    private int speed;
    private List<Notch> notches = new ArrayList<>();
    /** Up to five ids referencing {@link com.sieglings.service.MovesPoolService}. */
    private List<String> moveIds = new ArrayList<>();
    private Row preferredRow;
    private String evolvesFromId;
    private String evolvesFromName;
    /** When true, pickable at expedition warband assembly; false = locked until found on the path. */
    private Boolean expeditionStarter;
    /** Null means "derive from rarity" — see {@link SieglingSize#defaultFor}. */
    private SieglingSize size;
    /**
     * Per-copy move loadout that replaces the pool lookup for {@link #moveIds}. Only Gauntlet
     * runs set it: a forged move (more damage, cheaper, extra riders) belongs to that one
     * copy of the card, so it cannot live in the shared moves pool.
     */
    private List<Ability> customMoves;

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
        c.setMoveIds(new ArrayList<>(moveIds));
        c.setAbility(getAbility() == null ? null : getAbility().copy());
        c.setCostElement(getCostElement());
        c.setCostAmount(getCostAmount());
        c.setEvolvesFromId(evolvesFromId);
        c.setEvolvesFromName(evolvesFromName);
        c.setCardArtUrl(getCardArtUrl());
        c.setHolographicCardArtUrl(getHolographicCardArtUrl());
        c.setHolographicCardArtScale(getHolographicCardArtScale());
        c.setHolographicCardArtMode(getHolographicCardArtMode());
        c.setHolographicCardArtOffsetXPct(getHolographicCardArtOffsetXPct());
        c.setHolographicCardArtOffsetYPct(getHolographicCardArtOffsetYPct());
        c.setHolographicCardArtRotation(getHolographicCardArtRotation());
        c.setCardArtMode(getCardArtMode());
        c.setCardArtOffsetX(getCardArtOffsetX());
        c.setCardArtOffsetY(getCardArtOffsetY());
        c.setCardArtOffsetXPct(getCardArtOffsetXPct());
        c.setCardArtOffsetYPct(getCardArtOffsetYPct());
        c.setCardArtScale(getCardArtScale());
        c.setCardArtRotation(getCardArtRotation());
        c.setHolographic(isHolographic());
        c.setDescription(getDescription());
        c.setExpeditionStarter(getExpeditionStarter());
        c.setSize(size);
        if (customMoves != null) {
            List<Ability> moves = new ArrayList<>();
            for (Ability move : customMoves) {
                moves.add(move.copy());
            }
            c.customMoves = moves;
        }
        return c;
    }

    public int getHealth() { return health; }
    public void setHealth(int health) { this.health = health; }
    public int getSpeed() { return speed; }
    public void setSpeed(int speed) { this.speed = speed; }
    public List<Notch> getNotches() { return notches; }
    public void setNotches(List<Notch> notches) { this.notches = notches; }
    public List<String> getMoveIds() { return moveIds; }
    public void setMoveIds(List<String> moveIds) {
        this.moveIds = normalizeMoveIds(moveIds);
    }

    public static final int MAX_MOVES_PER_SIEGLING = 5;

    /** Trims, drops blanks, caps at {@link #MAX_MOVES_PER_SIEGLING}. */
    public static List<String> normalizeMoveIds(List<String> moveIds) {
        if (moveIds == null || moveIds.isEmpty()) {
            return new ArrayList<>();
        }
        List<String> out = new ArrayList<>();
        for (String id : moveIds) {
            if (id == null || id.isBlank()) {
                continue;
            }
            out.add(id.trim());
            if (out.size() >= MAX_MOVES_PER_SIEGLING) {
                break;
            }
        }
        return out;
    }
    public boolean hasMoveLoadout() {
        return (moveIds != null && !moveIds.isEmpty()) || hasCustomMoves();
    }
    public List<Ability> getCustomMoves() { return customMoves; }
    public void setCustomMoves(List<Ability> customMoves) { this.customMoves = customMoves; }
    public boolean hasCustomMoves() { return customMoves != null && !customMoves.isEmpty(); }
    public Row getPreferredRow() { return preferredRow; }
    public void setPreferredRow(Row preferredRow) { this.preferredRow = preferredRow; }
    public String getEvolvesFromId() { return evolvesFromId; }
    public void setEvolvesFromId(String evolvesFromId) { this.evolvesFromId = evolvesFromId; }
    public String getEvolvesFromName() { return evolvesFromName; }
    public void setEvolvesFromName(String evolvesFromName) { this.evolvesFromName = evolvesFromName; }
    public boolean isEvolutionCard() { return evolvesFromId != null && !evolvesFromId.isBlank(); }
    public Boolean getExpeditionStarter() { return expeditionStarter; }
    public void setExpeditionStarter(Boolean expeditionStarter) { this.expeditionStarter = expeditionStarter; }
    public SieglingSize getSize() { return size; }
    public void setSize(SieglingSize size) { this.size = size; }

    @Override
    public void setAbility(Ability ability) {
        super.setAbility(ability);
    }
}
