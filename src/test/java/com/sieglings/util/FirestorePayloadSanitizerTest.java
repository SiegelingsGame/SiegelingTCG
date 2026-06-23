package com.sieglings.util;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FirestorePayloadSanitizerTest {

    @Test
    void stripsNullMapEntriesAndNestedArraysAreRejected() {
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("id", "demo");
        card.put("ability", null);
        card.put("notches", List.of(Map.of("direction", "NORTH", "element", "FIRE")));

        @SuppressWarnings("unchecked")
        Map<String, Object> sanitized = (Map<String, Object>) FirestorePayloadSanitizer.sanitize(card);

        assertEquals("demo", sanitized.get("id"));
        assertTrue(sanitized.containsKey("notches"));
        assertTrue(!sanitized.containsKey("ability"));

        assertThrows(IllegalArgumentException.class, () -> FirestorePayloadSanitizer.sanitize(List.of(List.of("nested"))));
    }
}
