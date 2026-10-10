package com.sieglings.chronicles;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Siegeknight Chronicles API. Every call returns the full settled snapshot. */
@RestController
public class ChroniclesController {
    private final AccountService accountService;
    private final ChroniclesService service;

    public ChroniclesController(AccountService accountService, ChroniclesService service) {
        this.accountService = accountService;
        this.service = service;
    }

    @GetMapping("/api/chronicles")
    public ResponseEntity<Map<String, Object>> snapshot(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        return respond(auth, service::getSnapshot);
    }

    @PostMapping("/api/chronicles/start")
    public ResponseEntity<Map<String, Object>> start(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.start(user, string(body, "starterId"), string(body, "knightName"),
                string(body, "requestId")));
    }

    @PostMapping("/api/chronicles/activity")
    public ResponseEntity<Map<String, Object>> activity(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.setActivity(user, string(body, "kind"), string(body, "id"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/helper")
    public ResponseEntity<Map<String, Object>> helper(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.setHelper(user, string(body, "companionId"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/party")
    public ResponseEntity<Map<String, Object>> party(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.setParty(user, list(body, "members"), string(body, "reserveId"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/tactics")
    public ResponseEntity<Map<String, Object>> tactics(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.setTactics(user, optionalInt(body, "retreatAt"), optionalInt(body, "potionAt"),
                body.containsKey("trigger") ? string(body, "trigger") : null,
                body.containsKey("techniqueId") ? string(body, "techniqueId") : null,
                body.containsKey("comboId") ? string(body, "comboId") : null,
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/craft")
    public ResponseEntity<Map<String, Object>> craft(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        Integer qty = optionalInt(body, "quantity");
        return respond(auth, user -> service.craft(user, string(body, "recipeId"), qty == null ? 1 : qty,
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/equip")
    public ResponseEntity<Map<String, Object>> equip(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.equip(user, string(body, "itemId"), string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/expedition/launch")
    public ResponseEntity<Map<String, Object>> launch(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.launch(user, string(body, "routeId"), supplies(body),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/expedition/collect")
    public ResponseEntity<Map<String, Object>> collect(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.collect(user, string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/tame")
    public ResponseEntity<Map<String, Object>> tame(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.tame(user, string(body, "sightingId"), string(body, "strategy"),
                string(body, "lureId"), string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/feed")
    public ResponseEntity<Map<String, Object>> feed(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.feed(user, string(body, "companionId"), string(body, "foodId"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/evolve")
    public ResponseEntity<Map<String, Object>> evolve(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.evolve(user, string(body, "companionId"), string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/rename")
    public ResponseEntity<Map<String, Object>> rename(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.rename(user, string(body, "companionId"), string(body, "nickname"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/build")
    public ResponseEntity<Map<String, Object>> build(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.build(user, string(body, "buildingId"), string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/loadout/save")
    public ResponseEntity<Map<String, Object>> saveLoadout(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        Integer slot = optionalInt(body, "slot");
        return respond(auth, user -> service.saveLoadout(user, slot == null ? -1 : slot, string(body, "name"),
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/loadout/apply")
    public ResponseEntity<Map<String, Object>> applyLoadout(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        Integer slot = optionalInt(body, "slot");
        return respond(auth, user -> service.applyLoadout(user, slot == null ? -1 : slot,
                string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/trial/start")
    public ResponseEntity<Map<String, Object>> startTrial(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.startTrial(user, string(body, "companionId"), string(body, "requestId"), version(body)));
    }

    @PostMapping("/api/chronicles/away/ack")
    public ResponseEntity<Map<String, Object>> ackAway(
            @RequestHeader(value = "Authorization", required = false) String auth, @RequestBody(required = false) Map<String, Object> body) {
        return respond(auth, user -> service.acknowledgeAway(user, string(body, "requestId"), version(body)));
    }

    private ResponseEntity<Map<String, Object>> respond(String auth, Function<AccountUser, Map<String, Object>> operation) {
        try {
            AccountUser user = accountService.requireUser(auth);
            return ResponseEntity.ok(operation.apply(user));
        } catch (ChroniclesService.StaleStateException ex) {
            return error(HttpStatus.CONFLICT, ex.getMessage());
        } catch (IllegalArgumentException ex) {
            HttpStatus status = ex.getMessage() != null && ex.getMessage().startsWith("Sign in")
                    ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_REQUEST;
            return error(status, status == HttpStatus.UNAUTHORIZED
                    ? "Sign in to begin your chronicle." : ex.getMessage());
        } catch (RuntimeException ex) {
            // A Firestore blip is not a sign-out; saying so keeps the page from
            // dropping a signed-in knight back to the sign-in gate.
            return error(HttpStatus.SERVICE_UNAVAILABLE,
                    "Siegeknight Chronicles could not be reached just now. Please try again in a moment.");
        }
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", message == null || message.isBlank() ? "Request failed." : message);
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

    private static Integer optionalInt(Map<String, Object> body, String key) {
        Object value = body == null ? null : body.get(key);
        if (value == null) return null;
        if (value instanceof Number number) return number.intValue();
        try { return Integer.parseInt(String.valueOf(value).trim()); }
        catch (NumberFormatException ignored) { return null; }
    }

    private static List<String> list(Map<String, Object> body, String key) {
        Object value = body == null ? null : body.get(key);
        List<String> out = new ArrayList<>();
        if (value instanceof List<?> items) for (Object item : items) out.add(item == null ? "" : String.valueOf(item));
        return out;
    }

    private static Map<String, Integer> supplies(Map<String, Object> body) {
        Object value = body == null ? null : body.get("supplies");
        Map<String, Integer> out = new LinkedHashMap<>();
        if (value instanceof Map<?, ?> map) {
            map.forEach((k, v) -> {
                if (v instanceof Number n) out.put(String.valueOf(k), n.intValue());
                else {
                    try { out.put(String.valueOf(k), Integer.parseInt(String.valueOf(v))); }
                    catch (NumberFormatException ignored) { }
                }
            });
        }
        return out;
    }
}
