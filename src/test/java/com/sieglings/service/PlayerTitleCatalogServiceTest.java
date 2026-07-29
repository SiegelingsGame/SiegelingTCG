package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.TrainerCard;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PlayerTitleCatalogServiceTest {

    @Test
    void dailyShopRotationOffersFourShopTitlesAndAdvancesEachDay() throws Exception {
        PlayerTitleCatalogService service = createService();

        List<PlayerTitleCatalogService.TitleDefinition> today = service.listDailyShopTitles(LocalDate.of(2026, 7, 29));
        List<PlayerTitleCatalogService.TitleDefinition> tomorrow = service.listDailyShopTitles(LocalDate.of(2026, 7, 30));

        assertEquals(4, today.size());
        assertTrue(today.stream().allMatch(title -> title.source() == PlayerTitleCatalogService.Source.SHOP));
        Set<String> todayIds = today.stream().map(PlayerTitleCatalogService.TitleDefinition::id).collect(java.util.stream.Collectors.toSet());
        assertFalse(tomorrow.stream().map(PlayerTitleCatalogService.TitleDefinition::id).anyMatch(todayIds::contains));
    }

    @Test
    void expandedShopCatalogHasThirtyTwoTitles() throws Exception {
        PlayerTitleCatalogService service = createService();

        long shopTitleCount = service.listDefinitions().stream()
                .filter(title -> title.source() == PlayerTitleCatalogService.Source.SHOP)
                .count();

        assertEquals(32, shopTitleCount);
    }

    private PlayerTitleCatalogService createService() throws Exception {
        PlayerTitleCatalogService service = new PlayerTitleCatalogService();
        setField(service, "cardDefinitionService", new CardDefinitionService() {
            @Override
            public List<TrainerCard> getTrainerOptions() {
                return List.of();
            }
        });
        setField(service, "objectMapper", new ObjectMapper());
        return service;
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }
}
