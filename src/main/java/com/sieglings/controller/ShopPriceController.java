package com.sieglings.controller;

import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Rarity;
import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.ShopPriceCatalogService;
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
import java.util.Locale;
import java.util.Map;

/**
 * Dashboard admin endpoints for shop price overrides by (rarity, card type). Mirrors the
 * X-Card-Editor-Token guard used by the Siege item/class/event admin endpoints in SiegeController.
 */
@RestController
public class ShopPriceController {

    private static final String EDITOR_TOKEN_HEADER = "X-Card-Editor-Token";

    private final ShopPriceCatalogService shopPriceCatalogService;
    private final CardEditorAuthService editorAuth;

    public ShopPriceController(ShopPriceCatalogService shopPriceCatalogService, CardEditorAuthService editorAuth) {
        this.shopPriceCatalogService = shopPriceCatalogService;
        this.editorAuth = editorAuth;
    }

    /** Dashboard: current shop price grid (defaults merged with overrides). No auth required to view. */
    @GetMapping("/api/shop/prices")
    public Map<String, Object> listPrices() {
        return serializeGrid(shopPriceCatalogService.buildPriceGrid());
    }

    /** Dashboard: set a price override for a (rarity, card type) pair (editor-authenticated). */
    @PostMapping("/api/shop/prices")
    public Map<String, Object> setPrice(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        String updatedByEmail = editorAuth.requireEditor(editorToken).email();
        Rarity rarity = parseRarity(body.get("rarity"));
        CardType cardType = parseCardType(body.get("cardType"));
        int price = parsePrice(body.get("price"));
        return serializeGrid(shopPriceCatalogService.setPrice(rarity, cardType, price, updatedByEmail));
    }

    /** Dashboard: reset a (rarity, card type) pair back to its default price (editor-authenticated). */
    @PostMapping("/api/shop/prices/reset")
    public Map<String, Object> resetPrice(
            @RequestHeader(value = EDITOR_TOKEN_HEADER, required = false) String editorToken,
            @RequestBody Map<String, Object> body) {
        String updatedByEmail = editorAuth.requireEditor(editorToken).email();
        Rarity rarity = parseRarity(body.get("rarity"));
        CardType cardType = parseCardType(body.get("cardType"));
        return serializeGrid(shopPriceCatalogService.clearPrice(rarity, cardType, updatedByEmail));
    }

    private Map<String, Object> serializeGrid(List<ShopPriceCatalogService.PriceRow> rows) {
        List<Map<String, Object>> prices = new ArrayList<>();
        for (ShopPriceCatalogService.PriceRow row : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("rarity", row.rarity().name());
            m.put("cardType", row.cardType().name());
            m.put("defaultPrice", row.defaultPrice());
            m.put("overridePrice", row.overridePrice());
            m.put("price", row.price());
            m.put("isOverride", row.isOverride());
            prices.add(m);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("prices", prices);
        response.put("rarities", List.of(Rarity.values()).stream().map(Enum::name).toList());
        response.put("cardTypes", List.of(CardType.values()).stream().map(Enum::name).toList());
        return response;
    }

    private Rarity parseRarity(Object raw) {
        String value = raw == null ? "" : String.valueOf(raw).trim();
        try {
            return Rarity.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unknown rarity: " + raw);
        }
    }

    private CardType parseCardType(Object raw) {
        String value = raw == null ? "" : String.valueOf(raw).trim();
        try {
            return CardType.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unknown card type: " + raw);
        }
    }

    private int parsePrice(Object raw) {
        try {
            return Integer.parseInt(String.valueOf(raw));
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Price must be a whole number.");
        }
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
