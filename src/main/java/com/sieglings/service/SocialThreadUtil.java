package com.sieglings.service;

public final class SocialThreadUtil {
    private SocialThreadUtil() {
    }

    public static String threadId(String userA, String userB) {
        String left = userA == null ? "" : userA.trim().toLowerCase();
        String right = userB == null ? "" : userB.trim().toLowerCase();
        if (left.isBlank() || right.isBlank()) {
            throw new IllegalArgumentException("Both users are required for a message thread.");
        }
        if (left.compareTo(right) <= 0) {
            return left + "__" + right;
        }
        return right + "__" + left;
    }
}
