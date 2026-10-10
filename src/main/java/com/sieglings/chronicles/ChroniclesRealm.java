package com.sieglings.chronicles;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Shared, multi-player documents for Siegeknight Chronicles: guilds (with their
 * weekly Siege Operation) and marketplace listings. Unlike a knight's save, these
 * are written by many players, so every change goes through a store transaction.
 */
public final class ChroniclesRealm {

    private ChroniclesRealm() {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Guild {
        public String id = "";
        public String name = "";
        public String code = "";
        public String leaderId = "";
        public long createdAt;
        public Map<String, Member> members = new LinkedHashMap<>();
        /** Points donated toward siege defenses. */
        public long defensePoints;
        public Operation operation = new Operation();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Member {
        public String name = "";
        public int rank = 1;
        public long joinedAt;
    }

    /** One week's threat. A new week starts a new operation the first time anyone looks. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Operation {
        public String week = "";
        public String threatId = "";
        public long maxHp;
        public long damage;
        public Map<String, Long> contributions = new LinkedHashMap<>();
        public Map<String, Long> fronts = new LinkedHashMap<>();
        public long wonAt;
        public Map<String, Boolean> claimed = new LinkedHashMap<>();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Listing {
        public String id = "";
        public String sellerId = "";
        public String sellerName = "";
        public String itemId = "";
        public int qty;
        public long price;
        /** open, sold or cancelled. */
        public String status = "open";
        public String buyerId = "";
        /** The seller has collected the proceeds of a sale. */
        public boolean claimed;
        public long createdAt;
        public long soldAt;
    }
}
