package com.sieglings.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
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

    public List<Map<String, Object>> all() { return skins; }

    public Optional<Map<String, Object>> find(String id) {
        if (id == null) return Optional.empty();
        return skins.stream().filter(skin -> id.equals(skin.get("id"))).findFirst();
    }

    public List<Map<String, Object>> shopCatalog() {
        return skins.stream().filter(skin -> "holiday".equals(skin.get("collection"))
                || "premium".equals(skin.get("collection"))).toList();
    }
}
