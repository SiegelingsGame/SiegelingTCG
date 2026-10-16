package com.sieglings.gauntlet;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Gauntlet endpoints. The run token travels in {@code X-Gauntlet-Token}; errors come back
 * as {@code {"error": "..."}} with a 200, the same convention as {@code /api/game/**}, so
 * the client can toast the message.
 */
@RestController
public class GauntletController {

    private static final Logger log = LoggerFactory.getLogger(GauntletController.class);

    @Autowired
    private GauntletService gauntlet;

    @Autowired
    private AccountService accountService;

    @GetMapping("/api/gauntlet/options")
    public Map<String, Object> options(@RequestHeader(value = "Authorization", required = false) String auth) {
        return handle(() -> {
            AccountUser user = findUser(auth);
            Map<String, Object> out = new LinkedHashMap<>(gauntlet.options(user));
            gauntlet.latestRunToken(user).ifPresent(token -> out.put("accountRunToken", token));
            return out;
        });
    }

    @PostMapping("/api/gauntlet/start")
    public Map<String, Object> start(@RequestHeader(value = "Authorization", required = false) String auth,
                                     @RequestBody Map<String, Object> req) {
        return handle(() -> gauntlet.runView(gauntlet.start(findUser(auth),
                str(req, "playerName"), str(req, "deckId"), str(req, "knightId"))));
    }

    @GetMapping("/api/gauntlet/run")
    public Map<String, Object> run(@RequestHeader(value = "X-Gauntlet-Token", required = false) String token) {
        return handle(() -> gauntlet.runView(gauntlet.view(token)));
    }

    @PostMapping("/api/gauntlet/draft/reroll")
    public Map<String, Object> reroll(@RequestHeader(value = "X-Gauntlet-Token", required = false) String token) {
        return handle(() -> gauntlet.runView(gauntlet.rerollDraft(token)));
    }

    @PostMapping("/api/gauntlet/begin")
    public Map<String, Object> begin(@RequestHeader(value = "X-Gauntlet-Token", required = false) String token) {
        return handle(() -> gauntlet.runView(gauntlet.begin(token)));
    }

    /** Opens the floor's fight; the client hands {@code soloToken} to the Battle Table. */
    @PostMapping("/api/gauntlet/battle")
    public Map<String, Object> battle(@RequestHeader(value = "X-Gauntlet-Token", required = false) String token) {
        return handle(() -> {
            String soloToken = gauntlet.startBattle(token);
            Map<String, Object> out = new LinkedHashMap<>(gauntlet.runView(gauntlet.view(token)));
            out.put("soloToken", soloToken);
            return out;
        });
    }

    @PostMapping("/api/gauntlet/reward")
    public Map<String, Object> reward(@RequestHeader(value = "X-Gauntlet-Token", required = false) String token,
                                      @RequestBody(required = false) Map<String, Object> req) {
        return handle(() -> gauntlet.runView(gauntlet.chooseReward(token, str(req, "cardId"))));
    }

    @PostMapping("/api/gauntlet/perk")
    public Map<String, Object> perk(@RequestHeader(value = "X-Gauntlet-Token", required = false) String token,
                                    @RequestBody Map<String, Object> req) {
        return handle(() -> gauntlet.runView(gauntlet.choosePerk(token, str(req, "perk"))));
    }

    @PostMapping("/api/gauntlet/forge/offer")
    public Map<String, Object> forgeOffer(@RequestHeader(value = "X-Gauntlet-Token", required = false) String token,
                                          @RequestBody Map<String, Object> req) {
        return handle(() -> {
            gauntlet.forgeOffer(token, str(req, "uid"));
            return gauntlet.runView(gauntlet.view(token));
        });
    }

    @PostMapping("/api/gauntlet/forge/apply")
    public Map<String, Object> forgeApply(@RequestHeader(value = "X-Gauntlet-Token", required = false) String token,
                                          @RequestBody Map<String, Object> req) {
        return handle(() -> {
            Object index = req == null ? null : req.get("option");
            if (!(index instanceof Number n)) {
                throw new IllegalArgumentException("Pick one of the offered upgrades.");
            }
            return gauntlet.runView(gauntlet.forgeApply(token, str(req, "uid"), n.intValue()));
        });
    }

    @PostMapping("/api/gauntlet/shop/buy")
    public Map<String, Object> buy(@RequestHeader(value = "X-Gauntlet-Token", required = false) String token,
                                   @RequestBody Map<String, Object> req) {
        return handle(() -> gauntlet.runView(gauntlet.buy(token, str(req, "itemId"), str(req, "removeUid"))));
    }

    @PostMapping("/api/gauntlet/abandon")
    public Map<String, Object> abandon(@RequestHeader(value = "X-Gauntlet-Token", required = false) String token) {
        return handle(() -> gauntlet.runView(gauntlet.abandon(token)));
    }

    private AccountUser findUser(String auth) {
        try {
            return accountService.findUser(auth);
        } catch (RuntimeException ex) {
            // Accounts are Firestore-backed; an unreachable store makes this a guest run.
            return null;
        }
    }

    private static String str(Map<String, Object> req, String key) {
        Object raw = req == null ? null : req.get(key);
        return raw == null ? null : String.valueOf(raw);
    }

    private static Map<String, Object> handle(Supplier<Map<String, Object>> action) {
        try {
            return action.get();
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        } catch (RuntimeException ex) {
            log.error("Gauntlet request failed", ex);
            return Map.of("error", "Something went wrong in the Gauntlet. Please try again.");
        }
    }
}
