package com.sieglings.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.sieglings.service.CardEditorGateService;
import com.sieglings.service.CardOverrideEditorService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
public class CardEditorController {

    private static final String EDITOR_TOKEN_HEADER = "X-Card-Editor-Token";
    private static final String GATE_TOKEN_HEADER = "X-Card-Editor-Gate";

    private final CardOverrideEditorService cardOverrideEditorService;
    private final CardEditorGateService gateService;

    public CardEditorController(CardOverrideEditorService cardOverrideEditorService,
                                CardEditorGateService gateService) {
        this.cardOverrideEditorService = cardOverrideEditorService;
        this.gateService = gateService;
    }

    @GetMapping("/api/cards/editor")
    public ResponseEntity<Map<String, Object>> getEditorState(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken) {
        return ResponseEntity.ok(cardOverrideEditorService.loadEditorState(editorToken));
    }

    @PostMapping("/api/cards/editor")
    public ResponseEntity<Map<String, Object>> saveEditorState(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @RequestHeader(value = GATE_TOKEN_HEADER, required = false) String gateToken,
            @RequestBody JsonNode data) {
        ResponseEntity<Map<String, Object>> locked = gateRefusal(gateToken);
        if (locked != null) {
            return locked;
        }
        try {
            return ResponseEntity.ok(cardOverrideEditorService.saveEditorState(data, editorToken));
        } catch (IllegalArgumentException ex) {
            return error(HttpStatus.BAD_REQUEST, ex.getMessage());
        } catch (IllegalStateException ex) {
            return error(HttpStatus.INTERNAL_SERVER_ERROR, describeFailure(ex));
        }
    }

    @PostMapping(value = "/api/cards/editor/art", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> uploadCardArt(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @RequestHeader(value = GATE_TOKEN_HEADER, required = false) String gateToken,
            @RequestParam("cardId") String cardId,
            @RequestParam(value = "artVariant", required = false) String artVariant,
            @RequestParam("file") MultipartFile file) {
        ResponseEntity<Map<String, Object>> locked = gateRefusal(gateToken);
        if (locked != null) {
            return locked;
        }
        try {
            return ResponseEntity.ok(cardOverrideEditorService.uploadCardArt(cardId, file, artVariant, editorToken));
        } catch (IllegalArgumentException ex) {
            return error(HttpStatus.BAD_REQUEST, ex.getMessage());
        } catch (IllegalStateException ex) {
            return error(HttpStatus.INTERNAL_SERVER_ERROR, describeFailure(ex));
        } catch (Exception ex) {
            return error(HttpStatus.INTERNAL_SERVER_ERROR, describeFailure(ex));
        }
    }

    /** Whether the dashboard needs a passphrase, and whether this caller has cleared it. */
    @GetMapping("/api/cards/editor/auth/gate")
    public ResponseEntity<Map<String, Object>> gateStatus(
            @RequestHeader(value = GATE_TOKEN_HEADER, required = false) String gateToken) {
        CardEditorGateService.GateStatus status = gateService.describe(gateToken);
        return ResponseEntity.ok(Map.of(
                "required", status.configured(),
                "unlocked", status.unlocked(),
                "ttlHours", gateService.ttlHours()));
    }

    @PostMapping("/api/cards/editor/auth/gate")
    public ResponseEntity<Map<String, Object>> unlockGate(@RequestBody GateUnlockRequest request) {
        String token = gateService.unlock(request == null ? null : request.passphrase());
        if (token == null) {
            // One message for every failure mode, so the response cannot be used to
            // tell "no passphrase set" apart from "wrong passphrase".
            return error(HttpStatus.UNAUTHORIZED, "That passphrase does not open the dashboard.");
        }
        return ResponseEntity.ok(Map.of(
                "token", token,
                "ttlHours", gateService.ttlHours()));
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

    /**
     * The gate is checked on the server for writes as well as in the page, because the
     * page is a public static file: skipping its UI and posting straight to the API is
     * trivial, so a client-side-only gate would guard nothing.
     */
    private ResponseEntity<Map<String, Object>> gateRefusal(String gateToken) {
        if (gateService.isValidToken(gateToken)) {
            return null;
        }
        return error(HttpStatus.UNAUTHORIZED, "The dashboard is locked. Enter the dashboard passphrase and try again.");
    }

    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", message));
    }

    private static String describeFailure(Throwable ex) {
        Throwable current = ex;
        while (current != null) {
            if (current.getMessage() != null && !current.getMessage().isBlank()) {
                return current.getMessage();
            }
            current = current.getCause();
        }
        return "Unexpected server error.";
    }

    private record GateUnlockRequest(String passphrase) {}

    private record EditorBootstrapRequest(String email, String password, String displayName) {}

    private record EditorLoginRequest(String email, String password) {}
}
