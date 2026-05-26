package com.sieglings.controller;

import com.sieglings.model.Card;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.service.AccountService;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.PackCatalogService;
import com.sieglings.service.PlayerProgressionService;
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

    @GetMapping("/api/player/progression")
    public Map<String, Object> progression(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AccountUser user = accountService.requireUser(authorizationHeader);
        return buildResponse(progressionService.getOrCreate(user));
    }

    @PostMapping("/api/player/starter-pack")
    public Map<String, Object> starterPack(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                           @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            PlayerProgressionEntity progression = progressionService.chooseStarterPack(user, string(req, "packId"));
            return buildResponse(progression);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @PostMapping("/api/shop/open-pack")
    public Map<String, Object> openPack(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                        @RequestBody Map<String, Object> req) {
        try {
            AccountUser user = accountService.requireUser(authorizationHeader);
            PlayerProgressionEntity progression = progressionService.openPack(user, string(req, "packId"));
            return buildResponse(progression);
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
            return buildResponse(progression);
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
            return buildResponse(progression);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        }
    }

    @GetMapping("/api/shop/packs")
    public Map<String, Object> packs() {
        return Map.of(
                "packs", packCatalogService.serializePacks(),
                "dailyOffers", packCatalogService.serializeDailyOffers()
        );
    }

    private Map<String, Object> buildResponse(PlayerProgressionEntity progression) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("progression", progressionService.serialize(progression));
        out.put("packs", packCatalogService.serializePacks());
        out.put("dailyOffers", packCatalogService.serializeDailyOffers());
        out.put("cardCatalog", cardDefinitionService.getDeckBuilderCatalog().stream().map(this::serializeCardLite).toList());
        return out;
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
}
