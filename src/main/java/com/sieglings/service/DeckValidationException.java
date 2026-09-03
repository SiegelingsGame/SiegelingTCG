package com.sieglings.service;

/**
 * A save/play rejection the player can act on, tagged with the deck-builder control
 * they need to fix ("name", "trainer", "cards") so the client can scroll to and
 * highlight it instead of showing a bare popup.
 */
public class DeckValidationException extends IllegalArgumentException {

    private final String field;

    public DeckValidationException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() {
        return field;
    }
}
