package com.sieglings.persistence.entity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * A registered account. Stored in Firestore at {@code accountUsers/{id}} where {@code id} is the
 * normalized (lowercase, trimmed) email — that gives uniqueness for free and lets us look up users
 * by email with a single document read.
 */
public class AccountUser {

    private String id;
    private String email;
    private String passwordHash;
    private String displayName;
    private List<String> friendEmails = new ArrayList<>();
    private Instant createdAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public List<String> getFriendEmails() {
        return friendEmails;
    }

    public void setFriendEmails(List<String> friendEmails) {
        this.friendEmails = friendEmails == null ? new ArrayList<>() : new ArrayList<>(friendEmails);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
