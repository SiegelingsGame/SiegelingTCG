package com.sieglings.controller;

import com.sieglings.model.Card;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.service.AccountService;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.PackCatalogService;
import com.sieglings.service.PlayerTitleCatalogService;
import com.sieglings.service.PlayerProgressionService;
import com.sieglings.service.ProfileSettingsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class PlayerProgressionController {
    @Autowired
    private AccountService accountService;

    @Autowired
    private PlayerProgressionService progressionService;

    @Autowired
    private PackCatalogService packCatalogService;

    @Autowired
    private CardDefinitionService cardDefinitionService;

    @Autowired(required = false)
    private ProfileSettingsService profileSettingsService;

    @Autowired
    private PlayerTitleCatalogService playerTitleCatalogService;

    @GetMapping("/api/player/progression")
    public Map<String, Object> progression(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AccountUser user = accountService.requireUser(authorizationHeader);
        return buildResponse(user, progressionService.getOrCreate(user));
    }

    @PostMapping("/api/player/tutorial-complete")
    public Map<String, Object> tutorialComplete(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            return buildResponse(user, progressionService.completeTutorial(user));
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/player/starter-pack")
    public Map<String, Object> starterPack(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                           @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            PlayerProgressionEntity progression = progressionService.chooseStarterPack(user, string(req, "packId"));
            Map<String, Object> response = buildResponse(user, progression);
            if (profileSettingsService != null) {
                response.put("profileSettings", profileSettingsService.serialize(
                        profileSettingsService.save(user, starterProfileSettings(progression.getStarterPackId())),
                        user
                ));
            }
            return response;
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/shop/open-pack")
    public Map<String, Object> openPack(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                        @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            PlayerProgressionEntity progression = progressionService.openPacks(
                    user,
                    string(req, "packId"),
                    intValue(req, "count", 1),
                    string(req, "requestId")
            );
            return buildResponse(user, progression);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/shop/purchase-deck")
    public Map<String, Object> purchaseDeck(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                            @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            PlayerProgressionEntity progression = progressionService.purchaseDeck(user, string(req, "deckId"));
            return buildResponse(user, progression);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/shop/purchase-card")
    public Map<String, Object> purchaseCard(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                            @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            PlayerProgressionEntity progression = progressionService.purchaseDailyOffer(user, string(req, "offerId"));
            return buildResponse(user, progression);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/cards/craft")
    public Map<String, Object> craftCard(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                         @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            PlayerProgressionEntity progression = progressionService.craftCard(user, string(req, "cardId"));
            return buildResponse(user, progression);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/cards/holographic")
    public Map<String, Object> purchaseHolographicFinish(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                                           @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            PlayerProgressionEntity progression = progressionService.purchaseHolographicFinish(user, string(req, "cardId"));
            return buildResponse(user, progression);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/knights/buy-xp")
    public Map<String, Object> buyTrainerXp(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                              @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            PlayerProgressionEntity progression = progressionService.buyTrainerXp(user, string(req, "trainerId"));
            return buildResponse(user, progression);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/shop/purchase-title")
    public Map<String, Object> purchaseTitle(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                             @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            PlayerProgressionEntity progression = progressionService.purchaseTitle(user, string(req, "titleId"));
            return buildResponse(user, progression);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @GetMapping("/api/shop/packs")
    public Map<String, Object> packs() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("packs", packCatalogService.serializePacks());
        out.put("dailyOffers", packCatalogService.serializeDailyOffers());
        out.put("titleCatalog", playerTitleCatalogService.serializeCatalog());
        return out;
    }

    private Map<String, Object> buildResponse(AccountUser user, PlayerProgressionEntity progression) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("progression", progressionService.serialize(progression, user));
        out.put("packs", packCatalogService.serializePacks());
        out.put("dailyOffers", packCatalogService.serializeDailyOffers());
        out.put("titleCatalog", playerTitleCatalogService.serializeCatalog());
        out.put("cardCatalog", cardDefinitionService.getDeckBuilderCatalog().stream().map(this::serializeCardLite).toList());
        return out;
    }

    private Map<String, Object> starterProfileSettings(String packId) {
        String element = starterElement(packId);
        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("favoriteElement", element);
        settings.put("playerTitleId", switch (element) {
            case "WIND" -> "title_starter_wind";
            case "EARTH" -> "title_starter_earth";
            case "ICE", "WATER" -> "title_starter_ice";
            default -> "title_starter_fire";
        });
        settings.put("bio", switch (element) {
            case "WIND" -> "Wind starter chosen. Build around tempo, disruption, and fast Siegelings.";
            case "EARTH" -> "Earth starter chosen. Build around durability, healing, and strong board lines.";
            case "ICE", "WATER" -> "Ice starter chosen. Build around freezes, control, and resilient board lines.";
            default -> "Fire starter chosen. Build around pressure, direct attacks, and strong openings.";
        });
        settings.put("preferredCardBack", switch (element) {
            case "WIND" -> "Gale Sigil";
            case "EARTH" -> "Stone Sigil";
            case "ICE", "WATER" -> "Frost Sigil";
            default -> "Molten Sigil";
        });
        settings.put("favoriteSieglingId", starterFavoriteSieglingId(element));
        return settings;
    }

    private String starterElement(String packId) {
        String value = packId == null ? "" : packId.trim();
        if (!value.startsWith("pack_")) {
            return "FIRE";
        }
        String element = value.substring("pack_".length()).split("_")[0].toUpperCase(java.util.Locale.ROOT);
        return element.isBlank() ? "FIRE" : element;
    }

    private String starterFavoriteSieglingId(String element) {
        return cardDefinitionService.getDeckBuilderCatalog().stream()
                .filter(card -> "SIEGLING".equals(card.getCardType().name()))
                .filter(card -> card.getElement().name().equals(element)
                        || ("ICE".equals(element) && card.getElement().name().equals("WATER"))
                        || ("WATER".equals(element) && card.getElement().name().equals("ICE")))
                .findFirst()
                .map(Card::getId)
                .orElse("");
    }

    private Map<String, Object> serializeCardLite(Card card) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", card.getId());
        out.put("name", card.getName());
        out.put("type", card.getCardType().name());
        out.put("element", card.getElement().name());
        out.put("rarity", card.getRarity().name());
        return out;
    }

    private String string(Map<String, Object> req, String key) {
        Object value = req == null ? null : req.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private int intValue(Map<String, Object> req, String key, int fallback) {
        Object value = req == null ? null : req.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return value == null ? fallback : Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }
}
