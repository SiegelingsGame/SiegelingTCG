package com.sieglings.controller;

import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.PlayerAdminService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Dashboard admin endpoints for registered player accounts. Listing and detail reads
 * require an editor session so account emails stay off unauthenticated clients; writes
 * use the same {@code X-Card-Editor-Token} guard as shop/siege admin panels.
 */
@RestController
public class PlayerAdminController {

    private static final String EDITOR_TOKEN_HEADER = "X-Card-Editor-Token";

    private final PlayerAdminService playerAdminService;
    private final CardEditorAuthService editorAuth;

    public PlayerAdminController(PlayerAdminService playerAdminService, CardEditorAuthService editorAuth) {
        this.playerAdminService = playerAdminService;
        this.editorAuth = editorAuth;
    }

    @GetMapping("/api/players/admin")
    public Map<String, Object> listPlayers(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken) {
        editorAuth.requireEditor(editorToken);
        return playerAdminService.listPlayers();
    }

    // `{userId:.+}` keeps the email TLD — Spring's default path matcher would
    // otherwise treat ".com" as a file extension and drop it from the id.
    @GetMapping("/api/players/admin/{userId:.+}")
    public Map<String, Object> getPlayer(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @PathVariable String userId) {
        editorAuth.requireEditor(editorToken);
        return playerAdminService.getPlayer(userId);
    }

    @PostMapping("/api/players/admin/{userId:.+}")
    public Map<String, Object> updatePlayer(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @PathVariable String userId,
            @RequestBody Map<String, Object> body) {
        editorAuth.requireEditor(editorToken).email();
        return playerAdminService.updatePlayer(userId, body);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleServerError(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", ex.getMessage()));
    }
}
