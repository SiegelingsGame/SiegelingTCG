package com.sieglings.service;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.DirectMessageEntity;
import com.sieglings.persistence.firestore.DirectMessageStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class SocialMessagingService {
  private static final int MAX_MESSAGE_LENGTH = 500;

  @Autowired
  private DirectMessageStore messageStore;

  @Autowired
  private AccountService accountService;

  public DirectMessageEntity send(AccountUser sender, String recipientId, String text) {
    String recipient = normalizeUserId(recipientId);
    if (recipient.equals(sender.getId())) {
      throw new IllegalArgumentException("You cannot message yourself.");
    }
    if (accountService.findByEmail(recipient) == null) {
      throw new IllegalArgumentException("No account exists for that player.");
    }
    ensureCanMessage(sender, recipient);
    String trimmed = text == null ? "" : text.trim();
    if (trimmed.isBlank()) {
      throw new IllegalArgumentException("Enter a message first.");
    }
    if (trimmed.length() > MAX_MESSAGE_LENGTH) {
      throw new IllegalArgumentException("Messages must be " + MAX_MESSAGE_LENGTH + " characters or fewer.");
    }
    DirectMessageEntity message = new DirectMessageEntity();
    message.setThreadId(SocialThreadUtil.threadId(sender.getId(), recipient));
    message.setSenderId(sender.getId());
    message.setRecipientId(recipient);
    message.setText(trimmed);
    message.setCreatedAt(Instant.now());
    return messageStore.save(message);
  }

  public List<Map<String, Object>> listThreads(AccountUser user) {
    List<DirectMessageEntity> recent = messageStore.listRecentForUser(user.getId(), 120);
    Map<String, DirectMessageEntity> latestByPeer = new LinkedHashMap<>();
    for (DirectMessageEntity message : recent) {
      String peer = user.getId().equals(message.getSenderId()) ? message.getRecipientId() : message.getSenderId();
      latestByPeer.putIfAbsent(peer, message);
    }
    List<Map<String, Object>> threads = new ArrayList<>();
    for (Map.Entry<String, DirectMessageEntity> entry : latestByPeer.entrySet()) {
      threads.add(serializeThreadSummary(user.getId(), entry.getKey(), entry.getValue()));
    }
    threads.sort(Comparator.comparing((Map<String, Object> row) -> String.valueOf(row.get("lastMessageAt"))).reversed());
    return threads;
  }

  public List<Map<String, Object>> listConversation(AccountUser user, String peerId, Instant since) {
    String peer = normalizeUserId(peerId);
    ensureCanMessage(user, peer);
    String threadId = SocialThreadUtil.threadId(user.getId(), peer);
    return messageStore.listThreadMessages(threadId, since).stream()
        .map(message -> serializeMessageForViewer(message, user.getId()))
        .toList();
  }

  private void ensureCanMessage(AccountUser user, String peerId) {
    Set<String> allowed = new LinkedHashSet<>(user.getFriendEmails() == null ? List.of() : user.getFriendEmails());
    allowed.add(user.getId());
    if (!allowed.contains(peerId)) {
      throw new IllegalArgumentException("You can only message players on your friends list.");
    }
  }

  private Map<String, Object> serializeThreadSummary(String viewerId, String peerId, DirectMessageEntity latest) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("peerId", peerId);
    out.put("threadId", latest.getThreadId());
    out.put("lastMessage", latest.getText());
    out.put("lastMessageAt", latest.getCreatedAt() == null ? null : latest.getCreatedAt().toString());
    out.put("lastSenderId", latest.getSenderId());
    out.put("unread", !viewerId.equals(latest.getSenderId()));
    return out;
  }

  private Map<String, Object> serializeMessage(DirectMessageEntity message) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", message.getId());
    out.put("threadId", message.getThreadId());
    out.put("senderId", message.getSenderId());
    out.put("recipientId", message.getRecipientId());
    out.put("text", message.getText());
    out.put("createdAt", message.getCreatedAt() == null ? null : message.getCreatedAt().toString());
    out.put("mine", false);
    return out;
  }

  public Map<String, Object> serializeMessageForViewer(DirectMessageEntity message, String viewerId) {
    Map<String, Object> out = serializeMessage(message);
    out.put("mine", viewerId != null && viewerId.equals(message.getSenderId()));
    return out;
  }

  private String normalizeUserId(String userId) {
    String normalized = userId == null ? "" : userId.trim().toLowerCase(Locale.ROOT);
    if (!normalized.contains("@")) {
      throw new IllegalArgumentException("Enter a valid player email.");
    }
    return normalized;
  }
}
