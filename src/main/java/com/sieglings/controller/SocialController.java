package com.sieglings.controller;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.DirectMessageEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.persistence.entity.UserPresenceEntity;
import com.sieglings.service.AccountService;
import com.sieglings.service.PresenceService;
import com.sieglings.service.ProfileSettingsService;
import com.sieglings.service.FriendRequestService;
import com.sieglings.service.PublicProfileService;
import com.sieglings.service.SocialMessagingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
public class SocialController {

    @Autowired
    private AccountService accountService;

    @Autowired
    private ProfileSettingsService profileSettingsService;

    @Autowired
    private PresenceService presenceService;

    @Autowired
    private SocialMessagingService messagingService;

    @Autowired
    private PublicProfileService publicProfileService;

    @PostMapping("/api/profile/settings")
    public Map<String, Object> saveProfileSettings(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                                   @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            ProfileSettingsEntity saved = profileSettingsService.save(user, req == null ? Map.of() : req);
            return Map.of(
                    "ok", true,
                    "profileSettings", profileSettingsService.serialize(saved, user)
            );
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @GetMapping("/api/profile/settings")
    public Map<String, Object> getProfileSettings(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            ProfileSettingsEntity settings = profileSettingsService.getOrCreate(user);
            return Map.of("profileSettings", profileSettingsService.serialize(settings, user));
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/social/presence/heartbeat")
    public Map<String, Object> heartbeat(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                         @RequestBody(required = false) Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            String status = req == null ? null : (String) req.get("status");
            String currentRoomId = req == null ? null : (String) req.get("currentRoomId");
            UserPresenceEntity presence = presenceService.heartbeat(user, status, currentRoomId);
            return Map.of("presence", presenceService.serialize(presence, Instant.now()));
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/social/presence/offline")
    public Map<String, Object> markOffline(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            presenceService.markOffline(user);
            return Map.of("ok", true);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @GetMapping("/api/social/presence")
    public Map<String, Object> listFriendPresence(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            Instant now = Instant.now();
            List<String> friendIds = user.getFriendEmails() == null ? List.of() : user.getFriendEmails();
            List<Map<String, Object>> friends = new ArrayList<>();
            for (String friendId : friendIds) {
                AccountUser friend = accountService.findByEmail(friendId);
                if (friend == null) {
                    continue;
                }
                ProfileSettingsEntity settings = profileSettingsService.getOrCreate(friend);
                UserPresenceEntity presence = presenceService.listFriendPresence(List.of(friendId)).stream().findFirst().orElse(null);
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("userId", friend.getId());
                row.put("displayName", settings.getDisplayName() == null || settings.getDisplayName().isBlank()
                        ? friend.getDisplayName()
                        : settings.getDisplayName());
                row.put("profileSettings", profileSettingsService.serialize(settings, friend));
                row.put("presence", presenceService.serialize(presence, now));
                friends.add(row);
            }
            return Map.of("friends", friends, "serverTime", now.toString());
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @GetMapping("/api/social/players/{userId}/profile")
    public Map<String, Object> viewPlayerProfile(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                                 @PathVariable("userId") String userId) {
        try {
            AccountUser viewer = accountService.findUser(authorizationHeader);
            return publicProfileService.buildPublicProfile(viewer, userId);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @GetMapping("/api/social/messages/threads")
    public Map<String, Object> listThreads(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            return Map.of("threads", messagingService.listThreads(user));
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @GetMapping("/api/social/messages/with/{peerId}")
    public Map<String, Object> listMessages(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                            @PathVariable("peerId") String peerId) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            return Map.of("messages", messagingService.listConversation(user, peerId, null));
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/social/messages/send")
    public Map<String, Object> sendMessage(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                           @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            DirectMessageEntity message = messagingService.send(
                    user,
                    req == null ? null : (String) req.get("recipientId"),
                    req == null ? null : (String) req.get("text")
            );
            return Map.of("message", messagingService.serializeMessageForViewer(message, user.getId()));
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }
}
