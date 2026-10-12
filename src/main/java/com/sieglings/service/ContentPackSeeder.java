package com.sieglings.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Comparator;

/**
 * Ships designer content (moves, Strategies, Deceptions, move assignments) through a deploy:
 * every {@code cards/content-packs/*.json} is merged into the live dashboard document once, then
 * the dashboard owns it. Runs off the startup thread so a slow Firestore round-trip never delays
 * Cloud Run readiness.
 */
@Service
public class ContentPackSeeder {

    private static final Logger log = LoggerFactory.getLogger(ContentPackSeeder.class);
    private static final String PACK_PATTERN = "classpath*:cards/content-packs/*.json";

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService storageService;
    private final MovesPoolService movesPoolService;
    private final boolean enabled;

    public ContentPackSeeder(ObjectMapper objectMapper,
                             CardOverrideStorageService storageService,
                             MovesPoolService movesPoolService,
                             @Value("${app.content-packs.enabled:true}") boolean enabled) {
        this.objectMapper = objectMapper;
        this.storageService = storageService;
        this.movesPoolService = movesPoolService;
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void applyPacksInBackground() {
        if (!enabled) {
            return;
        }
        Thread worker = new Thread(this::applyAll, "content-pack-seeder");
        worker.setDaemon(true);
        worker.start();
    }

    void applyAll() {
        if (!storageService.isFirestoreReady()) {
            return;
        }
        Resource[] packs;
        try {
            packs = new PathMatchingResourcePatternResolver().getResources(PACK_PATTERN);
        } catch (IOException ex) {
            log.warn("Could not list content packs: {}", ex.getMessage());
            return;
        }
        Arrays.sort(packs, Comparator.comparing(r -> String.valueOf(r.getFilename())));
        for (Resource resource : packs) {
            try (InputStream stream = resource.getInputStream()) {
                JsonNode pack = objectMapper.readTree(stream);
                String packId = pack.path("id").asText("").trim();
                if (packId.isEmpty()) {
                    log.warn("Skipping content pack {} with no id", resource.getFilename());
                    continue;
                }
                boolean applied = storageService.applyContentPackOnce(packId, data -> {
                    ContentPackMerger.Result result = ContentPackMerger.merge(objectMapper, data, pack);
                    log.info("Content pack {}: +{} moves, +{} cards, {} cards patched, missing patch targets {}",
                            packId, result.movesAdded(), result.cardsAdded(), result.cardsPatched(), result.missingPatchIds());
                    return result.data();
                });
                if (applied) {
                    movesPoolService.syncFromSources();
                    log.info("Content pack {} applied to the live dashboard", packId);
                }
            } catch (Exception ex) {
                // One bad pack must not block the rest or the app; it retries on the next boot.
                log.warn("Content pack {} was not applied: {}", resource.getFilename(), ex.getMessage(), ex);
            }
        }
    }
}
