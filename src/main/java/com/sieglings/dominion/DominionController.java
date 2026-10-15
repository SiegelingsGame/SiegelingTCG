package com.sieglings.dominion;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import org.springframework.http.CacheControl;
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
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/** Dominion test-mode API: account save sync plus the shared realm (guilds, operations, market). */
@RestController
public class DominionController {
    private final AccountService accountService;
    private final DominionService service;

    public DominionController(AccountService accountService, DominionService service) {
        this.accountService = accountService;
        this.service = service;
    }

    @GetMapping("/api/dominion")
    public ResponseEntity<Map<String, Object>> snapshot(@RequestHeader(value = "Authorization", required = false) String auth) {
        return respond(auth, service::snapshot);
    }

    @PostMapping("/api/dominion/save")
    public ResponseEntity<Map<String, Object>> save(@RequestHeader(value = "Authorization", required = false) String auth,
                                                    @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.putSave(user, string(body, "state"), number(body, "baseVersion"), list(body, "applied")));
    }

    /** Public: species id to card art URL, so tamed Siegelings show their portraits. */
    @GetMapping("/api/dominion/art")
    public ResponseEntity<Map<String, String>> art() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(5, TimeUnit.MINUTES)).body(service.art());
    }

    @GetMapping("/api/dominion/guild")
    public ResponseEntity<Map<String, Object>> guild(@RequestHeader(value = "Authorization", required = false) String auth) {
        return respond(auth, service::guild);
    }

    @PostMapping("/api/dominion/guild/create")
    public ResponseEntity<Map<String, Object>> createGuild(@RequestHeader(value = "Authorization", required = false) String auth,
                                                           @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.createGuild(user, string(body, "name")));
    }

    @PostMapping("/api/dominion/guild/join")
    public ResponseEntity<Map<String, Object>> joinGuild(@RequestHeader(value = "Authorization", required = false) String auth,
                                                         @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.joinGuild(user, string(body, "code")));
    }

    @PostMapping("/api/dominion/guild/leave")
    public ResponseEntity<Map<String, Object>> leaveGuild(@RequestHeader(value = "Authorization", required = false) String auth) {
        return respond(auth, service::leaveGuild);
    }

    @PostMapping("/api/dominion/guild/donate")
    public ResponseEntity<Map<String, Object>> donate(@RequestHeader(value = "Authorization", required = false) String auth,
                                                      @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.donate(user, string(body, "itemId"), (int) number(body, "qty")));
    }

    @PostMapping("/api/dominion/operation/report")
    public ResponseEntity<Map<String, Object>> report(@RequestHeader(value = "Authorization", required = false) String auth,
                                                      @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.reportOperation(user, string(body, "reportId"), string(body, "front"), number(body, "damage")));
    }

    @PostMapping("/api/dominion/operation/claim")
    public ResponseEntity<Map<String, Object>> claim(@RequestHeader(value = "Authorization", required = false) String auth) {
        return respond(auth, service::claimOperation);
    }

    @GetMapping("/api/dominion/market")
    public ResponseEntity<Map<String, Object>> market(@RequestHeader(value = "Authorization", required = false) String auth) {
        return respond(auth, service::market);
    }

    @PostMapping("/api/dominion/market/list")
    public ResponseEntity<Map<String, Object>> list(@RequestHeader(value = "Authorization", required = false) String auth,
                                                    @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.list(user, string(body, "itemId"), (int) number(body, "qty"), number(body, "price")));
    }

    @PostMapping("/api/dominion/market/buy")
    public ResponseEntity<Map<String, Object>> buy(@RequestHeader(value = "Authorization", required = false) String auth,
                                                   @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.buy(user, string(body, "listingId")));
    }

    @PostMapping("/api/dominion/market/cancel")
    public ResponseEntity<Map<String, Object>> cancel(@RequestHeader(value = "Authorization", required = false) String auth,
                                                      @RequestBody Map<String, Object> body) {
        return respond(auth, user -> service.cancel(user, string(body, "listingId")));
    }

    private ResponseEntity<Map<String, Object>> respond(String auth, Function<AccountUser, Map<String, Object>> op) {
        try {
            AccountUser user = accountService.requireUser(auth);
            return ResponseEntity.ok(op.apply(user));
        } catch (DominionService.StaleSaveException ex) {
            Map<String, Object> body = new LinkedHashMap<>(ex.current);
            body.put("error", ex.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
        } catch (IllegalArgumentException ex) {
            boolean auth401 = ex.getMessage() != null && ex.getMessage().startsWith("Sign in");
            return error(auth401 ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_REQUEST, auth401 ? "Sign in to sync Dominion." : ex.getMessage());
        } catch (RuntimeException ex) {
            // A storage blip is not a sign-out; the page keeps playing locally and retries.
            return error(HttpStatus.SERVICE_UNAVAILABLE, "Dominion could not reach the server just now. Your progress is kept on this device.");
        }
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", message == null || message.isBlank() ? "Request failed." : message);
        return ResponseEntity.status(status).body(body);
    }

    private static String string(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static long number(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        if (v instanceof Number n) return n.longValue();
        try { return v == null ? 0 : Long.parseLong(String.valueOf(v).trim()); }
        catch (NumberFormatException ignored) { return 0; }
    }

    private static List<String> list(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        List<String> out = new ArrayList<>();
        if (v instanceof List<?> items) for (Object item : items) if (item != null) out.add(String.valueOf(item));
        return out;
    }
}
