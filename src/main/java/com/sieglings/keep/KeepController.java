package com.sieglings.keep;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

@RestController
public class KeepController {
    private final AccountService accountService;
    private final KeepService keepService;

    public KeepController(AccountService accountService, KeepService keepService) {
        this.accountService = accountService;
        this.keepService = keepService;
    }

    @GetMapping("/api/keep")
    public ResponseEntity<Map<String, Object>> snapshot(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        return respond(authorizationHeader, user -> keepService.getSnapshot(user));
    }

    @PostMapping("/api/keep/collect")
    public ResponseEntity<Map<String, Object>> collect(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return respond(authorizationHeader, user -> keepService.collect(user, string(body, "stationId"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/keep/resident")
    public ResponseEntity<Map<String, Object>> resident(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return respond(authorizationHeader, user -> keepService.inviteResident(user, string(body, "stationId"),
                string(body, "residentId"), string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/keep/build")
    public ResponseEntity<Map<String, Object>> build(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return respond(authorizationHeader, user -> keepService.startBuild(user, string(body, "buildId"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/keep/lore/read")
    public ResponseEntity<Map<String, Object>> readLore(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return respond(authorizationHeader, user -> keepService.readLore(user, string(body, "loreId"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/keep/dialogue/choose")
    public ResponseEntity<Map<String, Object>> chooseDialogue(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return respond(authorizationHeader, user -> keepService.chooseDialogue(user, string(body, "conversationId"),
                string(body, "choiceId"), string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/keep/memorabilia")
    public ResponseEntity<Map<String, Object>> memorabilia(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return respond(authorizationHeader, user -> keepService.placeMemorabilia(user, string(body, "loreId"),
                bool(body, "displayed"), string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/keep/reward")
    public ResponseEntity<Map<String, Object>> reward(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return respond(authorizationHeader, user -> keepService.claimReward(user, string(body, "rewardId"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/keep/craft")
    public ResponseEntity<Map<String, Object>> craft(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return respond(authorizationHeader, user -> keepService.craft(user, string(body, "recipeId"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/keep/theme")
    public ResponseEntity<Map<String, Object>> theme(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return respond(authorizationHeader, user -> keepService.setHallTheme(user, string(body, "themeId"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/keep/decoration")
    public ResponseEntity<Map<String, Object>> decoration(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return respond(authorizationHeader, user -> keepService.placeDecoration(user, string(body, "roomId"),
                string(body, "decorationId"), bool(body, "displayed"), string(body, "requestId"), version(body)));
    }

    private ResponseEntity<Map<String, Object>> respond(String authorizationHeader,
                                                         Function<AccountUser, Map<String, Object>> operation) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            return ResponseEntity.ok(operation.apply(user));
        } catch (KeepService.StaleKeepStateException ex) {
            return error(HttpStatus.CONFLICT, ex.getMessage());
        } catch (IllegalArgumentException ex) {
            HttpStatus status = ex.getMessage() != null && ex.getMessage().startsWith("Sign in")
                    ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_REQUEST;
            return error(status, status == HttpStatus.UNAUTHORIZED
                    ? "Sign in to found your sanctuary." : ex.getMessage());
        }
    }

    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", message == null || message.isBlank() ? "My Keep request failed." : message);
        return ResponseEntity.status(status).body(body);
    }

    private static String string(Map<String, Object> body, String key) {
        Object value = body == null ? null : body.get(key);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static long version(Map<String, Object> body) {
        Object value = body == null ? null : body.get("expectedVersion");
        if (value instanceof Number number) return number.longValue();
        try { return value == null ? -1 : Long.parseLong(String.valueOf(value)); }
        catch (NumberFormatException ignored) { return -1; }
    }

    private static boolean bool(Map<String, Object> body, String key) {
        Object value = body == null ? null : body.get(key);
        return value instanceof Boolean flag ? flag : Boolean.parseBoolean(String.valueOf(value));
    }
}
