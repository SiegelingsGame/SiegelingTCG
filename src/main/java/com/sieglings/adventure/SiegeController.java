package com.sieglings.adventure;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST API for the Siege roguelike mode. All gameplay logic lives in
 * {@link SiegeService} / {@link SiegeCombatEngine}; this controller only shuttles
 * JSON. Runs are addressed by an opaque {@code token} the client stores locally.
 */
@RestController
public class SiegeController {

    @Autowired
    private SiegeService siege;

    /** Selectable Siegelings + SiegeKnights for the team-select screen. */
    @GetMapping("/api/siege/roster")
    public Map<String, Object> roster() {
        return siege.roster();
    }

    /** Start a run: body { knightId, sieglingIds:[...], mode? ("STANDARD"|"ENDLESS") }. */
    @PostMapping("/api/siege/run/new")
    public Map<String, Object> newRun(@RequestBody Map<String, Object> body) {
        String knightId = str(body.get("knightId"));
        List<String> sieglingIds = toStringList(body.get("sieglingIds"));
        return siege.newRun(knightId, sieglingIds, str(body.get("mode")));
    }

    @GetMapping("/api/siege/state")
    public Map<String, Object> state(@RequestParam("token") String token) {
        return siege.state(token);
    }

    /** Player declined the resume prompt: discard the saved run for good. */
    @PostMapping("/api/siege/run/abandon")
    public Map<String, Object> abandonRun(@RequestBody Map<String, Object> body) {
        siege.abandonRun(str(body.get("token")));
        return Map.of("ok", true);
    }

    /** Travel to a reachable map node: body { token, nodeId }. */
    @PostMapping("/api/siege/node/enter")
    public Map<String, Object> enterNode(@RequestBody Map<String, Object> body) {
        int nodeId;
        try {
            nodeId = Integer.parseInt(String.valueOf(body.get("nodeId")));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("nodeId is required.");
        }
        return siege.enterNode(str(body.get("token")), nodeId);
    }

    /** Pick a post-battle reward: body { token, optionId } ("skip" to decline). */
    @PostMapping("/api/siege/reward/choose")
    public Map<String, Object> chooseReward(@RequestBody Map<String, Object> body) {
        return siege.chooseReward(str(body.get("token")), str(body.get("optionId")));
    }

    /** Use one Rest Camp interaction (rest / trader goods / broker): body { token, optionId }. */
    @PostMapping("/api/siege/camp/choose")
    public Map<String, Object> campChoose(@RequestBody Map<String, Object> body) {
        return siege.campChoose(str(body.get("token")), str(body.get("optionId")));
    }

    /** Break camp and open the map back up: body { token }. */
    @PostMapping("/api/siege/camp/leave")
    public Map<String, Object> campLeave(@RequestBody Map<String, Object> body) {
        return siege.campLeave(str(body.get("token")));
    }

    /** Cache minigame: dig deeper (press your luck): body { token }. */
    @PostMapping("/api/siege/cache/dig")
    public Map<String, Object> cacheDig(@RequestBody Map<String, Object> body) {
        return siege.cacheDig(str(body.get("token")));
    }

    /** Broker stall: hire an offered Siegeling, optionally swapping out a member:
     *  body { token, optionId, replaceId? }. */
    @PostMapping("/api/siege/broker/hire")
    public Map<String, Object> brokerHire(@RequestBody Map<String, Object> body) {
        return siege.brokerHire(str(body.get("token")), str(body.get("optionId")), str(body.get("replaceId")));
    }

    /** Leave the broker stall: body { token }. */
    @PostMapping("/api/siege/broker/leave")
    public Map<String, Object> brokerLeave(@RequestBody Map<String, Object> body) {
        return siege.brokerLeave(str(body.get("token")));
    }

    /** Cache minigame: bank the loot and move on: body { token }. */
    @PostMapping("/api/siege/cache/take")
    public Map<String, Object> cacheTake(@RequestBody Map<String, Object> body) {
        return siege.cacheTake(str(body.get("token")));
    }

    /** Play a card: body { token, cardId, targetId? }. */
    @PostMapping("/api/siege/battle/play")
    public Map<String, Object> play(@RequestBody Map<String, Object> body) {
        return siege.playCard(str(body.get("token")), str(body.get("cardId")), str(body.get("targetId")));
    }

    @PostMapping("/api/siege/battle/end-turn")
    public Map<String, Object> endTurn(@RequestBody Map<String, Object> body) {
        return siege.endTurn(str(body.get("token")));
    }

    /** Fire the SiegeKnight Ultimate (not a card, 0 AP, needs full Charge): body { token }. */
    @PostMapping("/api/siege/battle/ultimate")
    public Map<String, Object> knightUltimate(@RequestBody Map<String, Object> body) {
        return siege.knightUltimate(str(body.get("token")));
    }

    /** Apply a finished battle's outcome and advance the map / end the run. */
    @PostMapping("/api/siege/continue")
    public Map<String, Object> continueRun(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return siege.continueRun(str(body.get("token")), authorizationHeader);
    }

    /** Player closed the gacha-style join reveal: body { token }. */
    @PostMapping("/api/siege/recruit/ack")
    public Map<String, Object> recruitAck(@RequestBody Map<String, Object> body) {
        return siege.recruitAck(str(body.get("token")));
    }

    /** Resolve a CHESTS / WHEEL cache mini-game pick: body { token, optionId }. */
    @PostMapping("/api/siege/cache/choose")
    public Map<String, Object> cacheChoose(@RequestBody Map<String, Object> body) {
        return siege.cacheChoose(str(body.get("token")), str(body.get("optionId")));
    }

    @PostMapping("/api/siege/smith/choose")
    public Map<String, Object> smithChoose(@RequestBody Map<String, Object> body) {
        Integer scrap = null;
        Object si = body.get("scrapIndex");
        if (si != null && !"null".equals(String.valueOf(si))) {
            try { scrap = Integer.parseInt(String.valueOf(si)); } catch (NumberFormatException ignored) { }
        }
        return siege.smithChoose(str(body.get("token")), str(body.get("optionId")), scrap);
    }

    @PostMapping("/api/siege/smith/leave")
    public Map<String, Object> smithLeave(@RequestBody Map<String, Object> body) {
        return siege.smithLeave(str(body.get("token")));
    }

    @PostMapping("/api/siege/caravan/buy")
    public Map<String, Object> caravanBuy(@RequestBody Map<String, Object> body) {
        return siege.caravanBuy(str(body.get("token")), str(body.get("optionId")));
    }

    @PostMapping("/api/siege/caravan/leave")
    public Map<String, Object> caravanLeave(@RequestBody Map<String, Object> body) {
        return siege.caravanLeave(str(body.get("token")));
    }

    /** Resolve an event choice: body { token, optionId }. */
    @PostMapping("/api/siege/event/choose")
    public Map<String, Object> eventChoose(@RequestBody Map<String, Object> body) {
        return siege.eventChoose(str(body.get("token")), str(body.get("optionId")));
    }

    /** Equip an inventory item onto a Siegeling: body { token, itemId, memberId }. */
    @PostMapping("/api/siege/item/equip")
    public Map<String, Object> equipItem(@RequestBody Map<String, Object> body) {
        return siege.equipItem(str(body.get("token")), str(body.get("itemId")), str(body.get("memberId")));
    }

    @PostMapping("/api/siege/item/unequip")
    public Map<String, Object> unequipItem(@RequestBody Map<String, Object> body) {
        return siege.unequipItem(str(body.get("token")), str(body.get("memberId")));
    }

    /** Dashboard: list all Siege items. */
    @GetMapping("/api/siege/items")
    public Map<String, Object> listItems() {
        return siege.listItems();
    }

    /** Dashboard: create a Siege item (editor-authenticated). */
    @PostMapping("/api/siege/items")
    public Map<String, Object> createItem(
            @RequestHeader(value = "X-Card-Editor-Token", required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        int value;
        try { value = Integer.parseInt(String.valueOf(body.get("value"))); }
        catch (NumberFormatException e) { throw new IllegalArgumentException("Item value must be a number."); }
        return siege.createItem(editorToken, str(body.get("name")), str(body.get("icon")), str(body.get("kind")), value);
    }

    /** Dashboard: knights with their roguelike class (hash default or override). */
    @GetMapping("/api/siege/classes")
    public Map<String, Object> listClasses() {
        return siege.listKnightClasses();
    }

    /** Dashboard: assign a roguelike class to a knight (editor-authenticated). */
    @PostMapping("/api/siege/classes")
    public Map<String, Object> assignClass(
            @RequestHeader(value = "X-Card-Editor-Token", required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        return siege.assignKnightClass(editorToken, str(body.get("trainerId")), str(body.get("passive")));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    @SuppressWarnings("unchecked")
    private static List<String> toStringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return List.of();
    }
}
