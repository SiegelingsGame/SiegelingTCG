package com.sieglings.controller;

import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.CardEditorGateService;
import com.sieglings.service.DailyBattleService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Events: today's Daily Battle for the hub, and the rotation the card dashboard
 * edits. Saving takes the same dashboard passphrase and editor sign-in as the
 * card editor itself.
 */
@RestController
public class EventsController {

    private static final String EDITOR_TOKEN_HEADER = "X-Card-Editor-Token";
    private static final String GATE_TOKEN_HEADER = "X-Card-Editor-Gate";

    private final DailyBattleService dailyBattles;
    private final CardDefinitionService cardDefs;
    private final CardEditorAuthService authService;
    private final CardEditorGateService gateService;

    public EventsController(DailyBattleService dailyBattles, CardDefinitionService cardDefs,
                            CardEditorAuthService authService, CardEditorGateService gateService) {
        this.dailyBattles = dailyBattles;
        this.cardDefs = cardDefs;
        this.authService = authService;
        this.gateService = gateService;
    }

    @GetMapping("/api/events/daily-battle")
    public Map<String, Object> today() {
        try {
            return dailyBattles.todayFeed(Instant.now());
        } catch (RuntimeException ex) {
            return Map.of("error", "Daily Battle is unavailable right now.");
        }
    }

    /** The whole rotation, described, plus the decks and knights the editor can choose from. */
    @GetMapping("/api/events/daily-battles")
    public Map<String, Object> rotation() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("battles", dailyBattles.list().stream().map(dailyBattles::describe).toList());
        out.put("todayIndex", DailyBattleService.indexFor(java.time.LocalDate.now(java.time.ZoneOffset.UTC), dailyBattles.list().size()));
        out.put("decks", cardDefs.getDeckOptions().stream().map(d -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", d.id());
            m.put("name", d.name());
            m.put("elements", d.elements().stream().map(Enum::name).toList());
            m.put("cards", cardDefs.buildDeckById(d.id()).stream()
                    .map(c -> Map.of("id", c.getId(), "name", c.getName())).distinct().toList());
            return m;
        }).toList());
        out.put("trainers", cardDefs.createTrainers().stream()
                .filter(t -> cardDefs.isTrainerActive(t.getId()))
                .map(t -> Map.of("id", t.getId(), "name", t.getName(),
                        "element", t.getElement() == null ? "" : t.getElement().name()))
                .toList());
        out.put("persistent", dailyBattles.isPersistent());
        return out;
    }

    @PostMapping("/api/events/daily-battles")
    public ResponseEntity<Map<String, Object>> save(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @RequestHeader(value = GATE_TOKEN_HEADER, required = false) String gateToken,
            @RequestBody Map<String, Object> body) {
        if (!gateService.isValidToken(gateToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "The dashboard is locked. Enter the dashboard passphrase and try again."));
        }
        try {
            // Same rule as the card editor: a signed-in editor is required wherever edits persist.
            if (dailyBattles.isPersistent()) authService.requireEditor(editorToken);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = body.get("battles") instanceof List<?> l ? (List<Map<String, Object>>) l : null;
            List<DailyBattleService.Entry> saved = dailyBattles.save(rows);
            return ResponseEntity.ok(Map.of("battles", saved.stream().map(dailyBattles::describe).toList()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        } catch (IllegalStateException ex) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", ex.getMessage()));
        }
    }
}
