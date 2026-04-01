package com.sieglings.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.sieglings.service.CardOverrideEditorService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class CardEditorController {

    private static final String EDITOR_TOKEN_HEADER = "X-Card-Editor-Token";

    private final CardOverrideEditorService cardOverrideEditorService;

    public CardEditorController(CardOverrideEditorService cardOverrideEditorService) {
        this.cardOverrideEditorService = cardOverrideEditorService;
    }

    @GetMapping("/api/cards/editor")
    public ResponseEntity<Map<String, Object>> getEditorState(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken) {
        return ResponseEntity.ok(cardOverrideEditorService.loadEditorState(editorToken));
    }

    @PostMapping("/api/cards/editor")
    public ResponseEntity<Map<String, Object>> saveEditorState(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @RequestBody JsonNode data) {
        try {
            return ResponseEntity.ok(cardOverrideEditorService.saveEditorState(data, editorToken));
        } catch (IllegalArgumentException ex) {
            return error(HttpStatus.BAD_REQUEST, ex.getMessage());
        } catch (IllegalStateException ex) {
            return error(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
        }
    }

    @PostMapping("/api/cards/editor/auth/bootstrap")
    public ResponseEntity<Map<String, Object>> bootstrapEditor(@RequestBody EditorBootstrapRequest request) {
        try {
            return ResponseEntity.ok(cardOverrideEditorService.bootstrapEditor(request.email(), request.password(), request.displayName()));
        } catch (IllegalArgumentException ex) {
            return error(HttpStatus.BAD_REQUEST, ex.getMessage());
        } catch (IllegalStateException ex) {
            return error(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
        }
    }

    @PostMapping("/api/cards/editor/auth/login")
    public ResponseEntity<Map<String, Object>> loginEditor(@RequestBody EditorLoginRequest request) {
        try {
            return ResponseEntity.ok(cardOverrideEditorService.loginEditor(request.email(), request.password()));
        } catch (IllegalArgumentException ex) {
            return error(HttpStatus.BAD_REQUEST, ex.getMessage());
        } catch (IllegalStateException ex) {
            return error(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
        }
    }

    @PostMapping("/api/cards/editor/auth/logout")
    public ResponseEntity<Map<String, Object>> logoutEditor(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken) {
        try {
            return ResponseEntity.ok(cardOverrideEditorService.logoutEditor(editorToken));
        } catch (IllegalStateException ex) {
            return error(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
        }
    }

    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", message));
    }

    private record EditorBootstrapRequest(String email, String password, String displayName) {}

    private record EditorLoginRequest(String email, String password) {}
}
