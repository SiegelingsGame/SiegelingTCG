package com.sieglings.campaign;

import com.sieglings.controller.GameController;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

@RestController
public class CampaignController {

    private static final Logger log = LoggerFactory.getLogger(CampaignController.class);

    @Autowired private CampaignService campaign;
    @Autowired private AccountService accountService;
    @Autowired private GameController gameController;

    @PostConstruct
    void shareCardJson() {
        campaign.useClientCardJson(gameController::clientCardJson);
        campaign.useClientTrainerJson(gameController::clientTrainerJson);
    }

    @GetMapping("/api/campaign/options")
    public Map<String, Object> options(@RequestHeader(value = "Authorization", required = false) String auth) {
        return handle(() -> {
            AccountUser user = findUser(auth);
            Map<String, Object> out = new LinkedHashMap<>(campaign.options(user));
            campaign.latestRunToken(user).ifPresent(token -> out.put("accountRunToken", token));
            return out;
        });
    }

    @PostMapping("/api/campaign/start")
    public Map<String, Object> start(@RequestHeader(value = "Authorization", required = false) String auth,
                                     @RequestBody Map<String, Object> req) {
        return handle(() -> campaign.runView(campaign.start(findUser(auth),
                str(req, "starterId"), str(req, "playerName"))));
    }

    @GetMapping("/api/campaign/run")
    public Map<String, Object> run(@RequestHeader(value = "X-Campaign-Token", required = false) String token) {
        return handle(() -> campaign.runView(campaign.view(token)));
    }

    @PostMapping("/api/campaign/enter-land")
    public Map<String, Object> enterLand(@RequestHeader(value = "X-Campaign-Token", required = false) String token,
                                         @RequestBody Map<String, Object> req) {
        return handle(() -> campaign.runView(campaign.enterLand(token, str(req, "landId"))));
    }

    @PostMapping("/api/campaign/preset")
    public Map<String, Object> preset(@RequestHeader(value = "X-Campaign-Token", required = false) String token,
                                      @RequestBody Map<String, Object> req) {
        return handle(() -> {
            @SuppressWarnings("unchecked")
            List<String> ids = req == null || !(req.get("cardIds") instanceof List<?> list)
                    ? List.of()
                    : list.stream().map(String::valueOf).toList();
            Map<String, Integer> cells = new LinkedHashMap<>();
            if (req != null && req.get("cells") instanceof Map<?, ?> raw) {
                raw.forEach((k, v) -> {
                    if (k != null && v instanceof Number n) cells.put(String.valueOf(k), n.intValue());
                });
            }
            return campaign.runView(campaign.setPreset(token, ids, cells));
        });
    }

    @PostMapping("/api/campaign/equip")
    public Map<String, Object> equip(@RequestHeader(value = "X-Campaign-Token", required = false) String token,
                                     @RequestBody Map<String, Object> req) {
        return handle(() -> campaign.runView(campaign.equip(token, str(req, "cardId"), str(req, "itemId"))));
    }

    @PostMapping("/api/campaign/area")
    public Map<String, Object> area(@RequestHeader(value = "X-Campaign-Token", required = false) String token,
                                    @RequestBody Map<String, Object> req) {
        return handle(() -> campaign.runView(campaign.setArea(token, str(req, "area"))));
    }

    @GetMapping("/api/campaign/codex")
    public Map<String, Object> codex(@RequestHeader(value = "X-Campaign-Token", required = false) String token) {
        return handle(() -> campaign.codex(token));
    }

    @PostMapping("/api/campaign/wild/start")
    public Map<String, Object> wildStart(@RequestHeader(value = "X-Campaign-Token", required = false) String token,
                                         @RequestBody(required = false) Map<String, Object> req) {
        return handle(() -> campaign.runView(campaign.startWild(token, str(req, "cardId"), str(req, "area"))));
    }

    @PostMapping("/api/campaign/squad")
    public Map<String, Object> squad(@RequestHeader(value = "X-Campaign-Token", required = false) String token,
                                     @RequestBody Map<String, Object> req) {
        return handle(() -> {
            List<String> slots = new java.util.ArrayList<>();
            if (req != null && req.get("slots") instanceof List<?> list) {
                for (Object o : list) slots.add(o == null ? null : String.valueOf(o));
            }
            return campaign.runView(campaign.setSquad(token, slots));
        });
    }

    @PostMapping("/api/campaign/follower")
    public Map<String, Object> follower(@RequestHeader(value = "X-Campaign-Token", required = false) String token,
                                        @RequestBody Map<String, Object> req) {
        return handle(() -> campaign.runView(campaign.setFollower(token, str(req, "cardId"))));
    }

    @GetMapping("/api/campaign/wild/battle")
    public Map<String, Object> wildBattle(@RequestHeader(value = "X-Campaign-Token", required = false) String token) {
        return handle(() -> campaign.wildBattle(token));
    }

    @PostMapping("/api/campaign/wild/play")
    public Map<String, Object> wildPlay(@RequestHeader(value = "X-Campaign-Token", required = false) String token,
                                        @RequestBody Map<String, Object> req) {
        return handle(() -> campaign.wildPlay(token, str(req, "cardId"), str(req, "targetId")));
    }

    @PostMapping("/api/campaign/wild/end-turn")
    public Map<String, Object> wildEndTurn(@RequestHeader(value = "X-Campaign-Token", required = false) String token) {
        return handle(() -> campaign.wildEndTurn(token));
    }

    @PostMapping("/api/campaign/wild/ultimate")
    public Map<String, Object> wildUltimate(@RequestHeader(value = "X-Campaign-Token", required = false) String token) {
        return handle(() -> campaign.wildUltimate(token));
    }

    @PostMapping("/api/campaign/wild/finish")
    public Map<String, Object> wildFinish(@RequestHeader(value = "X-Campaign-Token", required = false) String token) {
        return handle(() -> campaign.runView(campaign.finishWild(token)));
    }

    @PostMapping("/api/campaign/arena/start")
    public Map<String, Object> arenaStart(@RequestHeader(value = "X-Campaign-Token", required = false) String token,
                                          @RequestBody Map<String, Object> req) {
        return handle(() -> {
            String soloToken = campaign.startArena(token, str(req, "kind"), str(req, "cardId"), str(req, "area"), str(req, "roadLandId"));
            Map<String, Object> out = new LinkedHashMap<>(campaign.runView(campaign.view(token)));
            out.put("soloToken", soloToken);
            return out;
        });
    }

    @PostMapping("/api/campaign/settle")
    public Map<String, Object> settle(@RequestHeader(value = "X-Campaign-Token", required = false) String token) {
        return handle(() -> campaign.runView(campaign.settle(token)));
    }

    @PostMapping("/api/campaign/arena/retreat")
    public Map<String, Object> arenaRetreat(@RequestHeader(value = "X-Campaign-Token", required = false) String token) {
        return handle(() -> campaign.runView(campaign.retreatArena(token)));
    }

    @PostMapping("/api/campaign/abandon")
    public Map<String, Object> abandon(@RequestHeader(value = "X-Campaign-Token", required = false) String token) {
        return handle(() -> campaign.runView(campaign.abandon(token)));
    }

    private AccountUser findUser(String auth) {
        try {
            return accountService.findUser(auth);
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private Map<String, Object> handle(Supplier<Map<String, Object>> action) {
        try {
            return action.get();
        } catch (IllegalArgumentException | IllegalStateException ex) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("error", ex.getMessage());
            return err;
        } catch (Exception ex) {
            log.warn("Campaign error", ex);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("error", ex.getMessage() == null ? "Campaign failed." : ex.getMessage());
            return err;
        }
    }

    private static String str(Map<String, Object> req, String key) {
        if (req == null) return null;
        Object v = req.get(key);
        return v == null ? null : String.valueOf(v).trim();
    }
}
