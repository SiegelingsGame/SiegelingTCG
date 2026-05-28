package com.sieglings.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Converts Jackson-serialized catalog payloads into Firestore-safe values:
 * no null map entries, no nested arrays, and only supported scalar types.
 */
public final class FirestorePayloadSanitizer {

    private FirestorePayloadSanitizer() {
    }

    public static Object sanitize(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Map<?, ?> map) {
            return sanitizeMap(map);
        }
        if (value instanceof List<?> list) {
            return sanitizeList(list);
        }
        if (value instanceof Enum<?> enumValue) {
            return enumValue.name();
        }
        if (value instanceof Number number) {
            double doubleValue = number.doubleValue();
            if (Double.isNaN(doubleValue) || Double.isInfinite(doubleValue)) {
                throw new IllegalArgumentException("Firestore numbers must be finite.");
            }
            if (number instanceof Float || number instanceof Double) {
                return doubleValue;
            }
            return number.longValue();
        }
        if (value instanceof String || value instanceof Boolean) {
            return value;
        }
        throw new IllegalArgumentException("Unsupported Firestore value type: " + value.getClass().getName());
    }

    public static Map<String, Object> sanitizeMap(Map<?, ?> map) {
        LinkedHashMap<String, Object> sanitized = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getKey() == null) {
                continue;
            }
            Object sanitizedValue = sanitize(entry.getValue());
            if (sanitizedValue != null) {
                sanitized.put(String.valueOf(entry.getKey()), sanitizedValue);
            }
        }
        return sanitized;
    }

    private static List<Object> sanitizeList(List<?> list) {
        List<Object> sanitized = new ArrayList<>(list.size());
        for (Object item : list) {
            if (item instanceof List<?>) {
                throw new IllegalArgumentException("Firestore does not support nested arrays.");
            }
            Object sanitizedItem = sanitize(item);
            if (sanitizedItem != null) {
                sanitized.add(sanitizedItem);
            }
        }
        return sanitized;
    }
}
