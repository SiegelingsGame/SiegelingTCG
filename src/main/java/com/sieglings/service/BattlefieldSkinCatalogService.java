package com.sieglings.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class BattlefieldSkinCatalogService {
    private final List<Map<String, Object>> skins;

    public BattlefieldSkinCatalogService(ObjectMapper mapper) {
        try {
            Map<String, Object> catalog = mapper.readValue(new ClassPathResource("catalog/battlefield-skins.json").getInputStream(),
                    new TypeReference<>() {});
            Object rows = catalog.get("skins");
            this.skins = rows instanceof List<?> list ? list.stream()
                    .filter(Map.class::isInstance).map(row -> (Map<String, Object>) row).toList() : List.of();
        } catch (IOException ex) {
            throw new IllegalStateException("Unable to load battlefield skin catalog.", ex);
        }
    }

    public List<Map<String, Object>> all() {
        LocalDate today = LocalDate.now(java.time.ZoneId.of("America/New_York"));
        return skins.stream().map(skin -> withAvailability(skin, today)).toList();
    }

    public Optional<Map<String, Object>> find(String id) {
        if (id == null) return Optional.empty();
        return skins.stream().filter(skin -> id.equals(skin.get("id"))).findFirst();
    }

    public List<Map<String, Object>> shopCatalog() {
        return all();
    }

    public boolean isAvailableForPurchase(String id, LocalDate today) {
        return find(id).map(skin -> isAvailableForPurchase(skin, today)).orElse(false);
    }

    private boolean isAvailableForPurchase(Map<String, Object> skin, LocalDate today) {
        if ("prestige".equals(skin.get("collection"))) return false;
        if (!"holiday".equals(skin.get("collection"))) return true;
        return switch (String.valueOf(skin.get("event"))) {
            case "October" -> today.getMonthValue() == 10;
            case "December" -> today.getMonthValue() == 12;
            case "New Year" -> (today.getMonthValue() == 12 && today.getDayOfMonth() >= 26)
                    || (today.getMonthValue() == 1 && today.getDayOfMonth() <= 3);
            case "February" -> today.getMonthValue() == 2 && today.getDayOfMonth() <= 14;
            case "Spring Festival" -> today.getMonthValue() >= 3 && today.getMonthValue() <= 5;
            case "Summer Festival" -> today.getMonthValue() >= 6 && today.getMonthValue() <= 8;
            default -> false;
        };
    }

    private Map<String, Object> withAvailability(Map<String, Object> skin, LocalDate today) {
        Map<String, Object> row = new java.util.LinkedHashMap<>(skin);
        row.put("availableForPurchase", isAvailableForPurchase(skin, today));
        return row;
    }
}
