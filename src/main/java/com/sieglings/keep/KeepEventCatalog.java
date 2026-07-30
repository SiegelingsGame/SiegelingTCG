package com.sieglings.keep;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Shipped adverse-event content for the Keep's repair loop. */
@Component
public class KeepEventCatalog {
    public static final String TARGET_UPGRADE = "UPGRADE";
    public static final String TARGET_DECORATION = "DECORATION";

    public record KeepEvent(String id, String title, String kicker, String description,
                            String targetType, String targetId, String targetName,
                            int repairSeconds, int coinCost, int minHallLevel) { }

    public record CatalogFile(List<KeepEvent> events) { }

    private final ObjectMapper mapper;
    private final Map<String, KeepEvent> events = new LinkedHashMap<>();

    public KeepEventCatalog(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @PostConstruct
    public void load() {
        try (InputStream stream = new ClassPathResource("keep/keep-events.json").getInputStream()) {
            CatalogFile file = mapper.readValue(stream, CatalogFile.class);
            events.clear();
            for (KeepEvent value : file.events() == null ? List.<KeepEvent>of() : file.events()) {
                if (value.id() == null || value.id().isBlank()) throw new IllegalArgumentException("Keep event id is required.");
                if (!TARGET_UPGRADE.equals(value.targetType()) && !TARGET_DECORATION.equals(value.targetType())) {
                    throw new IllegalArgumentException("Keep event " + value.id() + " has an unknown target type.");
                }
                if (value.repairSeconds() <= 0 || value.repairSeconds() >= 600) {
                    throw new IllegalArgumentException("Keep event " + value.id() + " must rebuild in less than ten minutes.");
                }
                if (value.coinCost() <= 0) throw new IllegalArgumentException("Keep event " + value.id() + " needs a coin price.");
                if (events.putIfAbsent(value.id(), value) != null) {
                    throw new IllegalArgumentException("Duplicate Keep event id: " + value.id());
                }
            }
            if (events.size() < 20) throw new IllegalArgumentException("Keep needs at least twenty adverse events.");
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load My Keep event catalog.", ex);
        }
    }

    public KeepEvent event(String id) { return events.get(id); }
    public List<KeepEvent> allEvents() { return List.copyOf(events.values()); }
}
