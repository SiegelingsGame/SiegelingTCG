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

    /** Shared per-effect settings edited in the dashboard's Siege Mode workspace. */
    @Autowired
    private SiegeEffectTuningService effectTuning;

    @Autowired
    private com.sieglings.service.CardEditorAuthService editorAuth;

    /** Selectable Siegelings + SiegeKnights for the team-select screen. */
    @GetMapping("/api/siege/roster")
    public Map<String, Object> roster(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        return siege.roster(authorizationHeader);
    }

    /** Banked veteran teams for the signed-in player (flat veteran list + full teams). */
    @GetMapping("/api/siege/veterans")
    public Map<String, Object> veterans(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        return siege.veterans(authorizationHeader);
    }

    /** Endless loop-boundary extraction: bank the current team and end the run: body { token }. */
    @PostMapping("/api/siege/extract")
    public Map<String, Object> extract(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return siege.extract(str(body.get("token")), authorizationHeader);
    }

    /** Unlock a owned SiegeKnight for expedition warband selection. */
    @PostMapping("/api/siege/knight/unlock")
    public Map<String, Object> unlockKnight(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return siege.unlockKnight(authorizationHeader, str(body.get("knightId")));
    }

    /** Start a run: body { knightId, sieglingIds:[...], mode? ("STANDARD"|"ENDLESS") }. */
    @PostMapping("/api/siege/run/new")
    public Map<String, Object> newRun(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        String knightId = str(body.get("knightId"));
        List<String> sieglingIds = toStringList(body.get("sieglingIds"));
        return siege.newRun(authorizationHeader, knightId, sieglingIds, str(body.get("mode")));
    }

    /**
     * Start a Battlegrounds run from banked veterans:
     * body {@code { members:[{teamId, sourceCardId}, …3], knightTeamId }}. The 3
     * veteran Siegelings and the veteran knight are validated against the signed-in
     * player's banked teams; stats/decks come from the stored snapshot, never the body.
     */
    @PostMapping("/api/siege/battlegrounds/new")
    public Map<String, Object> newBattlegrounds(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return siege.newBattlegrounds(authorizationHeader, body.get("members"),
                str(body.get("knightTeamId")), intOf(body.get("tier"), 1));
    }

    /** Pick the pending run-start (or post-boss) Battlegrounds boon: body { token, boonId }. */
    @PostMapping("/api/siege/battlegrounds/boon")
    public Map<String, Object> pickBoon(@RequestBody Map<String, Object> body) {
        return siege.pickBoon(str(body.get("token")), str(body.get("boonId")));
    }

    /** The Warmarks shop catalog + the signed-in player's balance and owned unlocks. */
    @GetMapping("/api/siege/battlegrounds/shop")
    public Map<String, Object> battlegroundsShop(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        return siege.battlegroundsShop(authorizationHeader);
    }

    /** Spend Warmarks on a shop item: body { itemId }. Balance is validated server-side. */
    @PostMapping("/api/siege/battlegrounds/shop/buy")
    public Map<String, Object> buyBattlegroundsItem(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestBody Map<String, Object> body) {
        return siege.buyBattlegroundsItem(authorizationHeader, str(body.get("itemId")));
    }

    /** Battlegrounds leaderboard (top cleared tiers / best scores). */
    @GetMapping("/api/siege/battlegrounds/leaderboard")
    public Map<String, Object> battlegroundsLeaderboard(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        return siege.battlegroundsLeaderboard(authorizationHeader);
    }

    @GetMapping("/api/siege/state")
    public Map<String, Object> state(
            @RequestParam("token") String token,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        return siege.state(token, authorizationHeader);
    }

    /** Resolves the signed-in account's active checkpoint, regardless of device-local token. */
    @GetMapping("/api/siege/run/active")
    public Map<String, Object> activeRun(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        return siege.activeRun(authorizationHeader);
    }

    /** Player declined the resume prompt: discard the saved run for good. */
    @PostMapping("/api/siege/run/abandon")
    public Map<String, Object> abandonRun(@RequestBody Map<String, Object> body) {
        siege.abandonRun(str(body.get("token")));
        return Map.of("ok", true);
    }

    /** Persist the active expedition on demand so it can be resumed later. */
    @PostMapping("/api/siege/run/save")
    public Map<String, Object> saveRun(@RequestBody Map<String, Object> body) {
        return siege.saveRun(str(body.get("token")));
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

    /**
     * Pick which of a levelled-up Siegeling's cards to amplify:
     * body { token, optionId } ("skip" to decline the pick).
     */
    @PostMapping("/api/siege/level/amp")
    public Map<String, Object> chooseAmp(@RequestBody Map<String, Object> body) {
        return siege.chooseAmp(str(body.get("token")), str(body.get("optionId")));
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

    /** Player closed an interaction outcome popup: body { token }. */
    @PostMapping("/api/siege/result/ack")
    public Map<String, Object> resultAck(@RequestBody Map<String, Object> body) {
        return siege.resultAck(str(body.get("token")));
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

    /** Cross a Rift: rolls a new Land. Body { token }. */
    @PostMapping("/api/siege/rift/cross")
    public Map<String, Object> riftCross(@RequestBody Map<String, Object> body) {
        return siege.riftCross(str(body.get("token")));
    }

    /** Travel past a Rift: clear the stop, stay in the current Land. Body { token }. */
    @PostMapping("/api/siege/rift/pass")
    public Map<String, Object> riftPass(@RequestBody Map<String, Object> body) {
        return siege.riftPass(str(body.get("token")));
    }

    /** LINE puzzle: submit connected paths: body { token, paths:[{color, cells:[[r,c],…]}] }. */
    @PostMapping("/api/siege/minigame/line")
    public Map<String, Object> minigameLine(@RequestBody Map<String, Object> body) {
        return siege.minigameLineSubmit(str(body.get("token")), body.get("paths"));
    }

    /** RPS puzzle: throw a hand: body { token, choice: "ROCK"|"PAPER"|"SCISSORS" }. */
    @PostMapping("/api/siege/minigame/rps")
    public Map<String, Object> minigameRps(@RequestBody Map<String, Object> body) {
        return siege.minigameRpsThrow(str(body.get("token")), str(body.get("choice")));
    }

    /** MATCH puzzle: reveal one tile per tap: body { token, a }. */
    @PostMapping("/api/siege/minigame/match")
    public Map<String, Object> minigameMatch(@RequestBody Map<String, Object> body) {
        return siege.minigameMatchFlip(str(body.get("token")), intOf(body.get("a")));
    }

    /** Give up on the active puzzle for a small consolation: body { token }. */
    @PostMapping("/api/siege/minigame/giveup")
    public Map<String, Object> minigameGiveUp(@RequestBody Map<String, Object> body) {
        return siege.minigameGiveUp(str(body.get("token")));
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

    /** Use a knight-bag consumable: body { token, itemId, targetId }. */
    @PostMapping("/api/siege/knight/use")
    public Map<String, Object> useKnightItem(@RequestBody Map<String, Object> body) {
        return siege.useKnightItem(str(body.get("token")), str(body.get("itemId")), str(body.get("targetId")));
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

    /** Dashboard: list all Siege map events and outcome reference. */
    @GetMapping("/api/siege/events")
    public Map<String, Object> listEvents() {
        return siege.listEvents();
    }

    /** Dashboard: create a Siege map event (editor-authenticated). */
    @PostMapping("/api/siege/events")
    public Map<String, Object> createEvent(
            @RequestHeader(value = "X-Card-Editor-Token", required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        return siege.createEvent(editorToken, str(body.get("title")), str(body.get("icon")),
                str(body.get("prompt")), body.get("choices"));
    }

    /** The per-effect knobs a tuning request may carry. */
    private static final List<String> TUNING_FIELDS = List.of(
            SiegeEffectTuningService.FIELD_VALUE_BONUS,
            SiegeEffectTuningService.FIELD_VALUE_CAP,
            SiegeEffectTuningService.FIELD_MIN_ACTION_COST,
            SiegeEffectTuningService.FIELD_DURATION_ROUNDS);

    /** Dashboard: shared ability-effect settings (defaults merged with overrides). */
    @GetMapping("/api/siege/effects")
    public Map<String, Object> listEffectTuning() {
        return serializeTuning(effectTuning.buildSnapshot());
    }

    /**
     * Dashboard: write one effect's shared settings (editor-authenticated). Only
     * the fields present in the body are touched; a field sent as null resets
     * that one knob to its default.
     */
    @PostMapping("/api/siege/effects")
    public Map<String, Object> setEffectTuning(
            @RequestHeader(value = "X-Card-Editor-Token", required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        String email = editorAuth.requireEditor(editorToken).email();
        Effect effect = SiegeEffectTuningService.parseEffect(body.get("effect"));
        java.util.Map<String, Integer> fields = new java.util.LinkedHashMap<>();
        for (String field : TUNING_FIELDS) {
            if (body.containsKey(field)) fields.put(field, nullableInt(body.get(field), field));
        }
        if (fields.isEmpty()) throw new IllegalArgumentException("No settings were sent.");
        return serializeTuning(effectTuning.setEffect(effect, fields, email));
    }

    /** Dashboard: return one effect to its built-in settings (editor-authenticated). */
    @PostMapping("/api/siege/effects/reset")
    public Map<String, Object> resetEffectTuning(
            @RequestHeader(value = "X-Card-Editor-Token", required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        String email = editorAuth.requireEditor(editorToken).email();
        return serializeTuning(effectTuning.resetEffect(
                SiegeEffectTuningService.parseEffect(body.get("effect")), email));
    }

    /**
     * Dashboard: publish a whole screen of edits at once (editor-authenticated).
     * Body: { effects: [ { effect, valueBonus?, …, reset? } ], globals: { key: value } }.
     * Everything is validated before anything is written, so a bad number in one
     * tile fails the request instead of half-publishing the rest.
     */
    @PostMapping("/api/siege/effects/bulk")
    public Map<String, Object> saveEffectTuning(
            @RequestHeader(value = "X-Card-Editor-Token", required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        String email = editorAuth.requireEditor(editorToken).email();
        List<SiegeEffectTuningService.EffectPatch> patches = new java.util.ArrayList<>();
        Object rawEffects = body.get("effects");
        if (rawEffects instanceof List<?> list) {
            for (Object raw : list) {
                if (!(raw instanceof Map<?, ?> row)) continue;
                Effect effect = SiegeEffectTuningService.parseEffect(row.get("effect"));
                boolean reset = Boolean.TRUE.equals(row.get("reset"));
                java.util.Map<String, Integer> fields = new java.util.LinkedHashMap<>();
                if (!reset) {
                    for (String field : TUNING_FIELDS) {
                        if (row.containsKey(field)) fields.put(field, nullableInt(row.get(field), field));
                    }
                }
                patches.add(new SiegeEffectTuningService.EffectPatch(effect, fields, reset));
            }
        }
        java.util.Map<String, Integer> globals = new java.util.LinkedHashMap<>();
        if (body.get("globals") instanceof Map<?, ?> rawGlobals) {
            for (Map.Entry<?, ?> entry : rawGlobals.entrySet()) {
                String key = String.valueOf(entry.getKey());
                globals.put(key, nullableInt(entry.getValue(), key));
            }
        }
        return serializeTuning(effectTuning.applyChanges(patches, globals, email));
    }

    /** Dashboard: write one cross-effect setting, e.g. the Ultimate buff window. */
    @PostMapping("/api/siege/effects/global")
    public Map<String, Object> setEffectGlobal(
            @RequestHeader(value = "X-Card-Editor-Token", required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        String email = editorAuth.requireEditor(editorToken).email();
        String key = str(body.get("key"));
        if (key == null || key.isBlank()) throw new IllegalArgumentException("A setting key is required.");
        return serializeTuning(effectTuning.setGlobal(key, nullableInt(body.get("value"), key), email));
    }

    private Map<String, Object> serializeTuning(SiegeEffectTuningService.Snapshot snapshot) {
        List<Map<String, Object>> effects = new java.util.ArrayList<>();
        for (SiegeEffectTuningService.EffectRow row : snapshot.effects()) {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("effect", row.effect().name());
            m.put("label", row.label());
            m.put("fields", row.fields());
            m.put("defaults", Map.of(
                    "valueBonus", row.defaultValueBonus(),
                    "valueCap", row.defaultValueCap(),
                    "minActionCost", row.defaultMinActionCost(),
                    "durationRounds", row.defaultDurationRounds()));
            m.put("valueBonus", row.valueBonus());
            m.put("valueCap", row.valueCap());
            m.put("minActionCost", row.minActionCost());
            m.put("durationRounds", row.durationRounds());
            m.put("isOverride", row.isOverride());
            effects.add(m);
        }
        List<Map<String, Object>> globals = new java.util.ArrayList<>();
        for (SiegeEffectTuningService.GlobalRow row : snapshot.globals()) {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("key", row.key());
            m.put("label", row.label());
            m.put("description", row.description());
            m.put("defaultValue", row.defaultValue());
            m.put("value", row.value());
            m.put("isOverride", row.isOverride());
            globals.add(m);
        }
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("effects", effects);
        out.put("globals", globals);
        out.put("source", snapshot.backend() == null ? null : snapshot.backend().name());
        out.put("updatedBy", snapshot.updatedBy());
        out.put("updatedAt", snapshot.updatedAt());
        return out;
    }

    /** Body ints that may legitimately be null — null resets that knob. */
    private static Integer nullableInt(Object value, String field) {
        if (value == null) return null;
        if (value instanceof Number n) return n.intValue();
        String raw = String.valueOf(value).trim();
        if (raw.isEmpty()) return null;
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException(field + " must be a whole number.");
        }
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    /** Storage failures (a Firestore write that did not land) keep their message. */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleServerError(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", ex.getMessage()));
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static int intOf(Object value) {
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Expected a tile number.");
        }
    }

    /** Lenient int parse with a fallback for optional numeric body fields. */
    private static int intOf(Object value, int fallback) {
        if (value instanceof Number n) return n.intValue();
        if (value == null) return fallback;
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> toStringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return List.of();
    }
}
