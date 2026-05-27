package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.FriendRequestEntity;
import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.persistence.firestore.FriendRequestStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class FriendRequestService {

    @Autowired
    private FriendRequestStore requestStore;

    @Autowired
    private AccountUserStore userStore;

    public void sendRequest(AccountUser sender, String targetEmail) {
        if (sender == null) {
            throw new IllegalArgumentException("Sign in to send friend requests.");
        }
        String normalizedTarget = normalizeEmail(targetEmail);
        if (normalizedTarget.equals(sender.getId())) {
            throw new IllegalArgumentException("You cannot add yourself.");
        }
        AccountUser target = userStore.findById(normalizedTarget)
                .orElseThrow(() -> new IllegalArgumentException("No account exists for that email."));
        if (areMutualFriends(sender, target)) {
            throw new IllegalArgumentException("You are already friends with that player.");
        }
        if (requestStore.findPending(sender.getId(), target.getId()).isPresent()) {
            throw new IllegalArgumentException("Friend request already sent.");
        }
        Optional<FriendRequestEntity> incoming = requestStore.findPending(target.getId(), sender.getId());
        if (incoming.isPresent()) {
            throw new IllegalArgumentException("That player already sent you a request. Accept or decline it below.");
        }

        FriendRequestEntity request = new FriendRequestEntity();
        request.setFromUserId(sender.getId());
        request.setToUserId(target.getId());
        request.setCreatedAt(Instant.now());
        requestStore.save(request);
    }

    public AccountUser acceptRequest(AccountUser recipient, String fromUserId) {
        if (recipient == null) {
            throw new IllegalArgumentException("Sign in to respond to friend requests.");
        }
        String normalizedFrom = normalizeEmail(fromUserId);
        FriendRequestEntity request = requestStore.findPending(normalizedFrom, recipient.getId())
                .orElseThrow(() -> new IllegalArgumentException("No pending friend request from that player."));
        AccountUser sender = userStore.findById(normalizedFrom)
                .orElseThrow(() -> new IllegalArgumentException("Player not found."));
        addMutualFriendship(sender, recipient);
        requestStore.deleteById(request.getId());
        requestStore.deleteById(FriendRequestEntity.buildId(recipient.getId(), sender.getId()));
        return userStore.findById(recipient.getId()).orElse(recipient);
    }

    public AccountUser denyRequest(AccountUser recipient, String fromUserId) {
        if (recipient == null) {
            throw new IllegalArgumentException("Sign in to respond to friend requests.");
        }
        String normalizedFrom = normalizeEmail(fromUserId);
        FriendRequestEntity request = requestStore.findPending(normalizedFrom, recipient.getId())
                .orElseThrow(() -> new IllegalArgumentException("No pending friend request from that player."));
        requestStore.deleteById(request.getId());
        return recipient;
    }

    public void syncLegacyPendingRequests(AccountUser user) {
        if (user == null || user.getFriendEmails() == null) {
            return;
        }
        for (String email : user.getFriendEmails()) {
            AccountUser peer = userStore.findById(email).orElse(null);
            if (peer == null || areMutualFriends(user, peer)) {
                continue;
            }
            if (requestStore.findPending(user.getId(), peer.getId()).isPresent()
                    || requestStore.findPending(peer.getId(), user.getId()).isPresent()) {
                continue;
            }
            FriendRequestEntity request = new FriendRequestEntity();
            request.setFromUserId(user.getId());
            request.setToUserId(peer.getId());
            request.setCreatedAt(Instant.now());
            requestStore.save(request);
        }
    }

    public List<Map<String, Object>> listIncoming(AccountUser user) {
        syncLegacyPendingRequests(user);
        return requestStore.listIncoming(user.getId()).stream()
                .map(request -> serializeRequest(request, user))
                .toList();
    }

    public List<Map<String, Object>> listOutgoing(AccountUser user) {
        syncLegacyPendingRequests(user);
        return requestStore.listOutgoing(user.getId()).stream()
                .map(request -> serializeRequest(request, user))
                .toList();
    }

    public static boolean areMutualFriends(AccountUser left, AccountUser right) {
        if (left == null || right == null) {
            return false;
        }
        List<String> leftFriends = left.getFriendEmails() == null ? List.of() : left.getFriendEmails();
        List<String> rightFriends = right.getFriendEmails() == null ? List.of() : right.getFriendEmails();
        return leftFriends.contains(right.getId()) && rightFriends.contains(left.getId());
    }

    private void addMutualFriendship(AccountUser first, AccountUser second) {
        addFriendEmail(first, second.getId());
        addFriendEmail(second, first.getId());
        userStore.save(first);
        userStore.save(second);
    }

    private void addFriendEmail(AccountUser user, String email) {
        LinkedHashSet<String> friends = new LinkedHashSet<>(user.getFriendEmails() == null ? List.of() : user.getFriendEmails());
        friends.add(email);
        user.setFriendEmails(friends.stream().toList());
    }

    private Map<String, Object> serializeRequest(FriendRequestEntity request, AccountUser viewer) {
        boolean incoming = viewer.getId().equals(request.getToUserId());
        String peerId = incoming ? request.getFromUserId() : request.getToUserId();
        AccountUser peer = userStore.findById(peerId).orElse(null);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", request.getId());
        row.put("fromUserId", request.getFromUserId());
        row.put("toUserId", request.getToUserId());
        row.put("direction", incoming ? "incoming" : "outgoing");
        row.put("peerId", peerId);
        row.put("peerEmail", peerId);
        row.put("displayName", peer == null ? peerId : peer.getDisplayName());
        row.put("createdAt", request.getCreatedAt() == null ? null : request.getCreatedAt().toString());
        return row;
    }

    private String normalizeEmail(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (!normalized.contains("@") || normalized.startsWith("@") || normalized.endsWith("@")) {
            throw new IllegalArgumentException("Enter a valid email address.");
        }
        if (normalized.length() > 190) {
            throw new IllegalArgumentException("That email is too long.");
        }
        return normalized;
    }
}
