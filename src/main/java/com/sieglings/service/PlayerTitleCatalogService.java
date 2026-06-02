package com.sieglings.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.TrainerCard;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class PlayerTitleCatalogService {
    public enum Source {
        STARTER,
        SHOP,
        KNIGHT,
        ACHIEVEMENT
    }

    public record TitleDefinition(
            String id,
            String label,
            String description,
            Source source,
            int shopPrice,
            String starterElement,
            String knightId,
            String achievementId
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record AchievementTitleEntry(
            String achievementId,
            String titleId,
            String label,
            String description
    ) {}

    private static final String ACHIEVEMENT_TITLES_RESOURCE = "catalog/achievement-titles.json";

    @Autowired
    private CardDefinitionService cardDefinitionService;

    @Autowired
    private ObjectMapper objectMapper;

    private List<TitleDefinition> cachedDefinitions;

    public List<TitleDefinition> listDefinitions() {
        if (cachedDefinitions != null) {
            return cachedDefinitions;
        }
        List<TitleDefinition> out = new ArrayList<>();
        out.add(new TitleDefinition("title_starter_fire", "Blazing Core Duelist",
                "Earned by choosing the Fire starter pack.", Source.STARTER, 0, "FIRE", null, null));
        out.add(new TitleDefinition("title_starter_earth", "Mossgold Sentinel",
                "Earned by choosing the Earth starter pack.", Source.STARTER, 0, "EARTH", null, null));
        out.add(new TitleDefinition("title_starter_wind", "Gale-Thread Strategist",
                "Earned by choosing the Wind starter pack.", Source.STARTER, 0, "WIND", null, null));
        out.add(new TitleDefinition("title_starter_ice", "Frostglass Tactician",
                "Earned by choosing the Ice starter pack.", Source.STARTER, 0, "ICE", null, null));
        out.add(new TitleDefinition("title_starter_water", "Frostglass Tactician",
                "Earned by choosing the Water starter pack.", Source.STARTER, 0, "WATER", null, null));

        for (AchievementTitleEntry entry : loadAchievementTitles()) {
            out.add(new TitleDefinition(
                    entry.titleId(),
                    entry.label(),
                    entry.description(),
                    Source.ACHIEVEMENT,
                    0,
                    null,
                    null,
                    entry.achievementId()
            ));
        }

        out.add(new TitleDefinition("title_gilded_strategist", "Gilded Strategist",
                "A premium title from the shop.", Source.SHOP, 350, null, null, null));
        out.add(new TitleDefinition("title_coin_baron", "Siegecoin Baron",
                "A premium title from the shop.", Source.SHOP, 500, null, null, null));
        out.add(new TitleDefinition("title_sigil_warden", "Sigil Warden",
                "A premium title from the shop.", Source.SHOP, 400, null, null, null));
        out.add(new TitleDefinition("title_pack_rat", "Relentless Pack Rat",
                "A premium title from the shop.", Source.SHOP, 300, null, null, null));

        for (TrainerCard trainer : cardDefinitionService.getTrainerOptions()) {
            String knightId = normalizeTrainerId(trainer.getId());
            out.add(new TitleDefinition(
                    "title_knight_" + knightId,
                    trainer.getName(),
                    "Earned by recruiting " + trainer.getName() + ".",
                    Source.KNIGHT,
                    0,
                    null,
                    knightId,
                    null
            ));
        }
        cachedDefinitions = List.copyOf(out);
        return cachedDefinitions;
    }

    private List<AchievementTitleEntry> loadAchievementTitles() {
        try (InputStream stream = getClass().getClassLoader().getResourceAsStream(ACHIEVEMENT_TITLES_RESOURCE)) {
            if (stream == null) {
                throw new IllegalStateException("Missing achievement title catalog: " + ACHIEVEMENT_TITLES_RESOURCE);
            }
            return objectMapper.readValue(stream, new TypeReference<List<AchievementTitleEntry>>() {});
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to load achievement title catalog.", ex);
        }
    }

    public Optional<TitleDefinition> findById(String titleId) {
        if (titleId == null || titleId.isBlank()) {
            return Optional.empty();
        }
        String normalized = titleId.trim().toLowerCase(Locale.ROOT);
        return listDefinitions().stream()
                .filter(def -> def.id().equals(normalized))
                .findFirst();
    }

    public Optional<TitleDefinition> findByAchievementId(String achievementId) {
        if (achievementId == null || achievementId.isBlank()) {
            return Optional.empty();
        }
        String normalized = achievementId.trim().toLowerCase(Locale.ROOT);
        return listDefinitions().stream()
                .filter(def -> def.achievementId() != null && def.achievementId().equalsIgnoreCase(normalized))
                .findFirst();
    }

    public List<Map<String, Object>> serializeCatalog() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (TitleDefinition def : listDefinitions()) {
            out.add(serializeDefinition(def, false));
        }
        return out;
    }

    public Map<String, Object> serializeDefinition(TitleDefinition def, boolean unlocked) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", def.id());
        row.put("label", def.label());
        row.put("description", def.description());
        row.put("source", def.source().name());
        row.put("shopPrice", def.shopPrice());
        row.put("achievementId", def.achievementId());
        row.put("unlocked", unlocked);
        return row;
    }

    public String normalizeTrainerId(String trainerId) {
        return trainerId == null ? "" : trainerId.trim().toLowerCase(Locale.ROOT);
    }
}
