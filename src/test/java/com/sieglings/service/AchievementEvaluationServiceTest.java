package com.sieglings.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AchievementEvaluationServiceTest {

    @Test
    void achievementTitleCatalogHas153UniqueEntries() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        try (InputStream stream = getClass().getClassLoader().getResourceAsStream("catalog/achievement-titles.json")) {
            List<Map<String, String>> entries = mapper.readValue(stream, new TypeReference<>() {});
            assertTrue(entries.size() >= 153);
            assertTrue(entries.stream().map(entry -> entry.get("titleId")).distinct().count() >= 153);
            assertTrue(entries.stream().map(entry -> entry.get("label")).distinct().count() >= 153);
            assertTrue(entries.stream().map(entry -> entry.get("achievementId")).distinct().count() >= 153);
        }
    }
}
