package com.sieglings.model;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.NotchDirection;

/**
 * Represents one notch on a card. A notch has a direction and an element.
 */
public record Notch(NotchDirection direction, Element element) {
}
