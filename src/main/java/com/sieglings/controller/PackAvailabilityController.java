package com.sieglings.controller;

import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.PackAvailabilityCatalogService;
import com.sieglings.service.PackCatalogService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Dashboard admin endpoints for switching individual shop packs on and off. Mirrors the
 * X-Card-Editor-Token guard used by {@link ShopPriceController}.
 */
@RestController
public class PackAvailabilityController {

    private static final String EDITOR_TOKEN_HEADER = "X-Card-Editor-Token";

    private final PackCatalogService packCatalogService;
    private final PackAvailabilityCatalogService packAvailabilityCatalogService;
    private final CardEditorAuthService editorAuth;

    public PackAvailabilityController(PackCatalogService packCatalogService,
                                      PackAvailabilityCatalogService packAvailabilityCatalogService,
                                      CardEditorAuthService editorAuth) {
        this.packCatalogService = packCatalogService;
        this.packAvailabilityCatalogService = packAvailabilityCatalogService;
        this.editorAuth = editorAuth;
    }

    /** Dashboard: every pack in this build with its current on/off state. No auth required to view. */
    @GetMapping("/api/shop/packs/availability")
    public Map<String, Object> listAvailability() {
        return serialize();
    }

    /** Dashboard: activate or deactivate one pack (editor-authenticated). */
    @PostMapping("/api/shop/packs/availability")
    public Map<String, Object> setAvailability(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        String updatedByEmail = editorAuth.requireEditor(editorToken).email();
        String packId = body.get("packId") == null ? "" : String.valueOf(body.get("packId")).trim();
        boolean active = parseActive(body.get("active"));
        PackCatalogService.PackDefinition pack = packCatalogService.listPacks().stream()
                .filter(candidate -> candidate.id().equalsIgnoreCase(packId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown pack: " + packId));
        if (!active) {
            guardLastPackOfItsKind(pack);
        }
        packAvailabilityCatalogService.setActive(pack.id(), active, updatedByEmail);
        return serialize();
    }

    /**
     * The shop cannot render an empty pack list, and new accounts cannot finish onboarding
     * without a starter-eligible pack, so refuse the toggle that would strand either.
     */
    private void guardLastPackOfItsKind(PackCatalogService.PackDefinition pack) {
        List<PackCatalogService.PackDefinition> remaining = packCatalogService.listAvailablePacks().stream()
                .filter(candidate -> !candidate.id().equals(pack.id()))
                .toList();
        if (remaining.isEmpty()) {
            throw new IllegalArgumentException("At least one pack must stay active.");
        }
        if (pack.starterEligible() && remaining.stream().noneMatch(PackCatalogService.PackDefinition::starterEligible)) {
            throw new IllegalArgumentException("At least one starter-eligible pack must stay active.");
        }
    }

    private Map<String, Object> serialize() {
        List<Map<String, Object>> packs = new ArrayList<>();
        for (PackCatalogService.PackDefinition pack : packCatalogService.listPacks()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", pack.id());
            row.put("name", pack.name());
            row.put("description", pack.description());
            row.put("active", pack.active());
            row.put("price", pack.price());
            row.put("elements", pack.elements().stream().map(Enum::name).toList());
            row.put("starterEligible", pack.starterEligible());
            packs.add(row);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("packs", packs);
        response.put("activeCount", packs.stream().filter(row -> Boolean.TRUE.equals(row.get("active"))).count());
        return response;
    }

    private boolean parseActive(Object raw) {
        if (raw instanceof Boolean bool) {
            return bool;
        }
        String value = raw == null ? "" : String.valueOf(raw).trim().toLowerCase();
        if ("true".equals(value)) {
            return true;
        }
        if ("false".equals(value)) {
            return false;
        }
        throw new IllegalArgumentException("Active must be true or false.");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleServerError(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", ex.getMessage()));
    }
}
