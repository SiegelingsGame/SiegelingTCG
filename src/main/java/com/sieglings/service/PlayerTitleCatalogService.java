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
import java.time.LocalDate;
import java.time.ZoneId;

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
    private static final int DAILY_SHOP_TITLE_COUNT = 4;

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

        addShopTitles(out);

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

    /**
     * Returns the four shop-only titles available today. Titles move forward
     * in fixed groups each local calendar day, so the whole catalog appears
     * before the rotation repeats and the offer is stable for that day.
     */
    public List<TitleDefinition> listDailyShopTitles() {
        return listDailyShopTitles(LocalDate.now(ZoneId.systemDefault()));
    }

    List<TitleDefinition> listDailyShopTitles(LocalDate date) {
        List<TitleDefinition> shopTitles = listDefinitions().stream()
                .filter(def -> def.source() == Source.SHOP)
                .toList();
        if (shopTitles.isEmpty()) {
            return List.of();
        }
        int count = Math.min(DAILY_SHOP_TITLE_COUNT, shopTitles.size());
        int start = (int) Math.floorMod(date.toEpochDay() * count, shopTitles.size());
        List<TitleDefinition> offers = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            offers.add(shopTitles.get((start + index) % shopTitles.size()));
        }
        return List.copyOf(offers);
    }

    public boolean isShopTitleAvailableToday(String titleId) {
        String normalized = titleId == null ? "" : titleId.trim().toLowerCase(Locale.ROOT);
        return listDailyShopTitles().stream().anyMatch(title -> title.id().equals(normalized));
    }

    public List<Map<String, Object>> serializeDailyShopTitles() {
        return listDailyShopTitles().stream()
                .map(def -> serializeDefinition(def, false))
                .toList();
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

    private void addShopTitles(List<TitleDefinition> out) {
        addShopTitle(out, "gilded_strategist", "Gilded Strategist", 350);
        addShopTitle(out, "coin_baron", "Siegecoin Baron", 500);
        addShopTitle(out, "sigil_warden", "Sigil Warden", 400);
        addShopTitle(out, "pack_rat", "Relentless Pack Rat", 300);
        addShopTitle(out, "ember_oathkeeper", "Ember Oathkeeper", 375);
        addShopTitle(out, "frostglass_oracle", "Frostglass Oracle", 425);
        addShopTitle(out, "gale_vanguard", "Gale Vanguard", 350);
        addShopTitle(out, "mossbound_marshal", "Mossbound Marshal", 375);
        addShopTitle(out, "shadowveil_broker", "Shadowveil Broker", 450);
        addShopTitle(out, "ironwall_architect", "Ironwall Architect", 425);
        addShopTitle(out, "tidecaller", "Tidecaller", 325);
        addShopTitle(out, "thunderbound", "Thunderbound", 450);
        addShopTitle(out, "astral_cartographer", "Astral Cartographer", 475);
        addShopTitle(out, "runeweaver", "Runeweaver", 400);
        addShopTitle(out, "vaultbreaker", "Vaultbreaker", 500);
        addShopTitle(out, "crownless_champion", "Crownless Champion", 525);
        addShopTitle(out, "blazeborn", "Blazeborn", 300);
        addShopTitle(out, "wyrmwatcher", "Wyrmwatcher", 425);
        addShopTitle(out, "siege_savant", "Siege Savant", 450);
        addShopTitle(out, "decksmith", "Decksmith", 350);
        addShopTitle(out, "riftwalker", "Riftwalker", 475);
        addShopTitle(out, "aether_scholar", "Aether Scholar", 400);
        addShopTitle(out, "bannerlord", "Bannerlord", 500);
        addShopTitle(out, "guildmaster", "Guildmaster", 475);
        addShopTitle(out, "sentinel_prime", "Sentinel Prime", 525);
        addShopTitle(out, "crowned_challenger", "Crowned Challenger", 450);
        addShopTitle(out, "arcane_quartermaster", "Arcane Quartermaster", 425);
        addShopTitle(out, "wildcard_virtuoso", "Wildcard Virtuoso", 400);
        addShopTitle(out, "fortress_founder", "Fortress Founder", 550);
        addShopTitle(out, "victory_archivist", "Victory Archivist", 375);
        addShopTitle(out, "grand_tactician", "Grand Tactician", 600);
        addShopTitle(out, "golden_standard", "Golden Standard", 550);
    }

    private void addShopTitle(List<TitleDefinition> out, String id, String label, int price) {
        out.add(new TitleDefinition("title_" + id, label,
                "A premium title from the shop.", Source.SHOP, price, null, null, null));
    }
}
