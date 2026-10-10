package com.sieglings.service;

import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Read-only view of the canonical Siegeling registry (the RBX-matched seed table).
 * Modes outside the battle table need a creature's class and evolution links, which
 * the printed {@code SieglingCard} does not carry.
 */
public final class CreatureRegistry {

    public record Creature(String id, String name, Element element, Rarity rarity, String creatureClass,
                           String evolvesFromId, String evolvesToId, int stage) {
        public boolean isBaseForm() { return evolvesFromId == null; }
    }

    private static final Map<String, Creature> BY_ID = build();

    private CreatureRegistry() {}

    public static Optional<Creature> find(String id) {
        if (id == null) return Optional.empty();
        return Optional.ofNullable(BY_ID.get(id.trim().toLowerCase(Locale.ROOT)));
    }

    public static Collection<Creature> all() {
        return BY_ID.values();
    }

    private static Map<String, Creature> build() {
        List<GeneratedCreatureCatalog.CreatureSeed> seeds = GeneratedCreatureCatalog.seeds();
        Map<String, GeneratedCreatureCatalog.CreatureSeed> seedById = new LinkedHashMap<>();
        for (GeneratedCreatureCatalog.CreatureSeed seed : seeds) seedById.put(seed.id(), seed);
        // Lineage is written from either end in the seed table (some rows name only a
        // parent, some only a child), so both links are resolved against each other and
        // a link to an id that is not in the table ("coming soon") is dropped.
        Map<String, String> from = new LinkedHashMap<>();
        Map<String, String> to = new LinkedHashMap<>();
        for (GeneratedCreatureCatalog.CreatureSeed seed : seeds) {
            if (seed.evolvesFromId() != null && seedById.containsKey(seed.evolvesFromId())) {
                from.put(seed.id(), seed.evolvesFromId());
                to.putIfAbsent(seed.evolvesFromId(), seed.id());
            }
            if (seed.evolvesToId() != null && seedById.containsKey(seed.evolvesToId())) {
                to.put(seed.id(), seed.evolvesToId());
                from.putIfAbsent(seed.evolvesToId(), seed.id());
            }
        }
        Map<String, Creature> out = new LinkedHashMap<>();
        for (GeneratedCreatureCatalog.CreatureSeed seed : seeds) {
            int stage = 1;
            String cursor = from.get(seed.id());
            while (cursor != null && stage < 5) {
                stage++;
                cursor = from.get(cursor);
            }
            out.put(seed.id(), new Creature(seed.id(), seed.name(), seed.element(), seed.rarity(),
                    seed.role(), from.get(seed.id()), to.get(seed.id()), stage));
        }
        return java.util.Collections.unmodifiableMap(out);
    }
}
