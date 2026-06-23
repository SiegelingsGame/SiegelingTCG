package com.sieglings.persistence.entity;

import java.time.Instant;

/**
 * A pending friend request from one account to another. Stored in Firestore at
 * {@code friendRequests/{id}} where {@code id} is {@code fromUserId__toUserId}.
 */
public class FriendRequestEntity {

    private String id;
    private String fromUserId;
    private String toUserId;
    private Instant createdAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getFromUserId() {
        return fromUserId;
    }

    public void setFromUserId(String fromUserId) {
        this.fromUserId = fromUserId;
    }

    public String getToUserId() {
        return toUserId;
    }

    public void setToUserId(String toUserId) {
        this.toUserId = toUserId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public static String buildId(String fromUserId, String toUserId) {
        return fromUserId + "__" + toUserId;
    }
}
