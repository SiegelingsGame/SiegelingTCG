package com.sieglings.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Folds a repo-shipped content pack ({@code cards/content-packs/*.json}) into a card-override
 * snapshot ({@code {cards, moves}}). Additive only: moves and cards whose id already exists are
 * left alone so anything a designer already edited in the dashboard wins; {@code cardPatches}
 * overwrite just the listed fields on cards that exist.
 */
public final class ContentPackMerger {

    public record Result(ObjectNode data, int movesAdded, int cardsAdded, int cardsPatched, Set<String> missingPatchIds) {}

    private ContentPackMerger() {}

    public static JsonNode loadClasspathPack(ObjectMapper mapper, String resourcePath) {
        try (InputStream stream = ContentPackMerger.class.getClassLoader().getResourceAsStream(resourcePath)) {
            if (stream == null) {
                throw new IllegalArgumentException("Content pack not found on classpath: " + resourcePath);
            }
            return mapper.readTree(stream);
        } catch (IOException ex) {
            throw new UncheckedIOException("Unable to read content pack " + resourcePath, ex);
        }
    }

    public static Result merge(ObjectMapper mapper, JsonNode snapshot, JsonNode pack) {
        ObjectNode data = snapshot != null && snapshot.isObject()
                ? ((ObjectNode) snapshot).deepCopy()
                : mapper.createObjectNode();
        ArrayNode moves = ensureArray(data, "moves");
        ArrayNode cards = ensureArray(data, "cards");

        Set<String> moveIds = idsOf(moves);
        int movesAdded = 0;
        for (JsonNode move : iterable(pack.get("moves"))) {
            if (moveIds.add(idOf(move))) {
                moves.add(move.deepCopy());
                movesAdded++;
            }
        }

        Map<String, ObjectNode> cardsById = new HashMap<>();
        for (JsonNode card : cards) {
            if (card.isObject()) {
                cardsById.put(idOf(card), (ObjectNode) card);
            }
        }
        int cardsAdded = 0;
        for (JsonNode card : iterable(pack.get("cards"))) {
            String id = idOf(card);
            if (!cardsById.containsKey(id)) {
                ObjectNode copy = card.deepCopy();
                cards.add(copy);
                cardsById.put(id, copy);
                cardsAdded++;
            }
        }

        int cardsPatched = 0;
        Set<String> missing = new HashSet<>();
        for (JsonNode patch : iterable(pack.get("cardPatches"))) {
            String id = idOf(patch);
            ObjectNode target = cardsById.get(id);
            if (target == null) {
                missing.add(id);
                continue;
            }
            Iterator<Map.Entry<String, JsonNode>> fields = patch.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if (!"id".equals(field.getKey())) {
                    target.set(field.getKey(), field.getValue().deepCopy());
                }
            }
            cardsPatched++;
        }
        return new Result(data, movesAdded, cardsAdded, cardsPatched, missing);
    }

    private static ArrayNode ensureArray(ObjectNode data, String field) {
        JsonNode node = data.get(field);
        if (node instanceof ArrayNode array) {
            return array;
        }
        return data.putArray(field);
    }

    private static Set<String> idsOf(ArrayNode array) {
        Set<String> ids = new HashSet<>();
        array.forEach(node -> ids.add(idOf(node)));
        return ids;
    }

    // Ids compare case-insensitively, matching MovesPoolService and the card catalog.
    private static String idOf(JsonNode node) {
        JsonNode id = node == null ? null : node.get("id");
        return id == null ? "" : id.asText().trim().toLowerCase(Locale.ROOT);
    }

    private static Iterable<JsonNode> iterable(JsonNode node) {
        return node != null && node.isArray() ? node : java.util.List.of();
    }
}
