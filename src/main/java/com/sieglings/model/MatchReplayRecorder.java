package com.sieglings.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds the step-by-step replay a finished match is reviewed from.
 *
 * <p>One frame per log line: the line itself, turn, phase and both players'
 * health. The board rides along only on frames where it differs from the last
 * one recorded (the client carries it forward), which is what keeps a long match
 * a few tens of KB rather than hundreds. Card identity (name, element, rarity,
 * notches, art) is written once per card id in {@link #cards()} instead of on
 * every cell.
 *
 * <p>Both hands ride along the same way (only on frames where either changed),
 * so the review can show what each side drew and held. A replay is only opened
 * after the match is over, by its owner or their mutual friends, so showing the
 * opponent's hand there reveals nothing that still matters; decks stay private.
 */
public class MatchReplayRecorder {

    /** Hard stop so a pathological match cannot grow the replay doc without bound. */
    static final int MAX_FRAMES = 1500;

    private final List<Map<String, Object>> frames = new ArrayList<>();
    private final Map<String, Map<String, Object>> cards = new LinkedHashMap<>();
    private String lastBoardSignature;
    private String lastHandSignature;

    public void record(GameState state, String message) {
        if (state == null || frames.size() >= MAX_FRAMES) {
            return;
        }
        Map<String, Object> frame = new LinkedHashMap<>();
        frame.put("t", state.getTurnNumber());
        frame.put("p", state.getCurrentPhase() == null ? "" : state.getCurrentPhase().name());
        frame.put("m", message);
        frame.put("ph", state.getPlayer() == null ? 0 : state.getPlayer().getHealth());
        frame.put("eh", state.getEnemy() == null ? 0 : state.getEnemy().getHealth());

        List<Map<String, Object>> board = new ArrayList<>();
        StringBuilder signature = new StringBuilder();
        snapshotSide(state, true, board, signature);
        snapshotSide(state, false, board, signature);
        String sig = signature.toString();
        if (!sig.equals(lastBoardSignature)) { // null on the first frame, so it always carries the board
            frame.put("b", board);
            lastBoardSignature = sig;
        }
        List<String> playerHand = handIds(state.getPlayer());
        List<String> enemyHand = handIds(state.getEnemy());
        String handSig = playerHand + "|" + enemyHand;
        if (!handSig.equals(lastHandSignature)) {
            Map<String, Object> hands = new LinkedHashMap<>();
            hands.put("p", playerHand);
            hands.put("e", enemyHand);
            frame.put("hd", hands);
            lastHandSignature = handSig;
        }
        frames.add(frame);
    }

    private void snapshotSide(GameState state, boolean isPlayer, List<Map<String, Object>> out, StringBuilder signature) {
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                CardInstance unit = state.getAt(isPlayer, r, c);
                if (unit == null || unit.getCard() == null) {
                    continue;
                }
                SieglingCard card = unit.getCard();
                rememberCard(card);
                Map<String, Object> cell = new LinkedHashMap<>();
                cell.put("s", isPlayer ? "p" : "e");
                cell.put("r", r);
                cell.put("c", c);
                cell.put("id", card.getId());
                cell.put("hp", Math.max(0, unit.getCurrentHealth()));
                cell.put("mx", unit.getEffectiveMaxHealth());
                if (!unit.isAlive()) {
                    cell.put("dead", true);
                }
                out.add(cell);
                signature.append(isPlayer ? 'p' : 'e').append(r).append(c).append(':')
                        .append(card.getId()).append(':').append(unit.getCurrentHealth())
                        .append(':').append(unit.getEffectiveMaxHealth()).append(unit.isAlive() ? "" : "x").append(';');
            }
        }
    }

    private List<String> handIds(Player player) {
        List<String> ids = new ArrayList<>();
        if (player == null || player.getHand() == null) {
            return ids;
        }
        for (Card card : player.getHand()) {
            if (card != null && card.getId() != null) {
                rememberCard(card);
                ids.add(card.getId());
            }
        }
        return ids;
    }

    private void rememberCard(Card card) {
        if (card.getId() == null || cards.containsKey(card.getId())) {
            return;
        }
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("name", card.getName());
        info.put("element", card.getElement() == null ? "NEUTRAL" : card.getElement().name());
        info.put("rarity", card.getRarity() == null ? null : card.getRarity().name());
        info.put("type", card.getCardType() == null ? null : card.getCardType().name());
        if (card instanceof SieglingCard siegling) {
            info.put("speed", siegling.getSpeed());
            List<String> notches = new ArrayList<>();
            if (siegling.getNotches() != null) {
                for (Notch notch : siegling.getNotches()) {
                    if (notch != null && notch.direction() != null) {
                        notches.add(notch.direction().name() + ":" + (notch.element() == null ? "NEUTRAL" : notch.element().name()));
                    }
                }
            }
            info.put("notches", notches);
        }
        if (card.getCardArtUrl() != null && !card.getCardArtUrl().isBlank()) {
            info.put("art", card.getCardArtUrl());
        }
        cards.put(card.getId(), info);
    }

    public List<Map<String, Object>> frames() {
        return frames;
    }

    public Map<String, Map<String, Object>> cards() {
        return cards;
    }

    public boolean isEmpty() {
        return frames.isEmpty();
    }
}
