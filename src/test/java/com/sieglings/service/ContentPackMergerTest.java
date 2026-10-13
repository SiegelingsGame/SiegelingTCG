package com.sieglings.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ContentPackMergerTest {

    private static final String METAL_PACK = "cards/content-packs/metal-kit.json";
    // The live Metal Sieglings the pack assigns moves to (dashboard ids, not display names).
    private static final List<String> LIVE_METAL_IDS = List.of(
            "drillbo", "blastro", "constructo", "new-siegling", "new-siegling-2", "new-siegling-4", "siegebot");
    private static final Set<String> METAL_THEME_EFFECTS = Set.of(
            AbilityEffectKeys.DAMAGE, AbilityEffectKeys.PLAYER_DAMAGE,
            AbilityEffectKeys.SHIELD, AbilityEffectKeys.CONNECTED_ALLIES_SHIELD,
            AbilityEffectKeys.HEAL, AbilityEffectKeys.CONNECTED_ALLIES_HEAL,
            AbilityEffectKeys.HEALTH_BOOST, AbilityEffectKeys.CONNECTED_ALLIES_HEALTH_BOOST);

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void metalPackMergesIntoLiveShapedSnapshotAndValidates() throws Exception {
        JsonNode pack = ContentPackMerger.loadClasspathPack(mapper, METAL_PACK);
        ContentPackMerger.Result result = ContentPackMerger.merge(mapper, liveShapedSnapshot(), pack);

        assertEquals(pack.get("moves").size(), result.movesAdded());
        assertEquals(pack.get("cards").size(), result.cardsAdded());
        assertEquals(LIVE_METAL_IDS.size(), result.cardsPatched());
        assertTrue(result.missingPatchIds().isEmpty());

        ManualSieglingCatalog.OverrideFile file = mapper.treeToValue(result.data(), ManualSieglingCatalog.OverrideFile.class);
        ManualSieglingCatalog.validateDefinitions(file);

        MovesPoolService pool = new MovesPoolService(mapper, null);
        pool.reloadClasspathAndOverlayEditor(file.moves());
        for (ManualSieglingCatalog.ManualSieglingDefinition card : file.cards()) {
            if (!LIVE_METAL_IDS.contains(card.id())) {
                continue;
            }
            List<String> moveIds = card.moveIds();
            assertTrue(moveIds.size() >= 3 && moveIds.size() <= MovesPoolService.MAX_MOVES_PER_SIEGLING, card.id());
            List<Ability> abilities = pool.resolveAbilities(moveIds);
            assertEquals(moveIds.size(), abilities.size(), "every move id resolves for " + card.id());
            assertTrue(abilities.stream().anyMatch(a -> AbilityEffectKeys.DAMAGE.equals(a.getEffectType())),
                    card.id() + " needs a direct-damage move");
        }
    }

    @Test
    void builtMetalSieglingsCarryTheAssignedMovesAndNewCardsBuild() throws Exception {
        JsonNode pack = ContentPackMerger.loadClasspathPack(mapper, METAL_PACK);
        ContentPackMerger.Result result = ContentPackMerger.merge(mapper, liveShapedSnapshot(), pack);
        ManualSieglingCatalog.OverrideFile file = mapper.treeToValue(result.data(), ManualSieglingCatalog.OverrideFile.class);
        MovesPoolService pool = new MovesPoolService(mapper, null);
        pool.reloadClasspathAndOverlayEditor(file.moves());

        // The same path the game uses to turn stored rows into playable Metal Sieglings.
        List<com.sieglings.model.SieglingCard> metal = ManualSieglingCatalog.applyOverrides(
                com.sieglings.model.enums.Element.METAL,
                GeneratedCreatureCatalog.createGeneratedForElement(com.sieglings.model.enums.Element.METAL),
                file.cards(), pool);
        java.util.Map<String, List<String>> expected = new java.util.HashMap<>();
        for (JsonNode patch : pack.get("cardPatches")) {
            List<String> ids = new java.util.ArrayList<>();
            patch.get("moveIds").forEach(id -> ids.add(id.asText()));
            expected.put(patch.get("id").asText(), ids);
        }
        int checked = 0;
        for (com.sieglings.model.SieglingCard card : metal) {
            List<String> want = expected.get(card.getId());
            if (want == null) {
                continue;
            }
            assertEquals(want, card.getMoveIds(), card.getId());
            List<String> resolvedNames = pool.resolvePrintedAbilities(card).stream().map(Ability::getName).toList();
            assertEquals(want.size(), resolvedNames.size(), card.getId());
            assertTrue(!resolvedNames.contains("Brassguard Guard"), card.getId() + " still on the placeholder");
            checked++;
        }
        assertEquals(expected.size(), checked, "every live Metal Siegling was built");

        Set<String> spellIds = new HashSet<>();
        ManualSieglingCatalog.applySpellOverrides(GeneratedSpellCatalog.createSpells(), file.cards())
                .forEach(c -> spellIds.add(c.getId()));
        Set<String> trapIds = new HashSet<>();
        ManualSieglingCatalog.applyTrapOverrides(CardDefinitionService.createBaseTraps(), file.cards())
                .forEach(c -> trapIds.add(c.getId()));
        for (JsonNode card : pack.get("cards")) {
            Set<String> built = "SPELL".equals(card.get("type").asText()) ? spellIds : trapIds;
            assertTrue(built.contains(card.get("id").asText()), card.get("id").asText() + " builds");
        }
    }

    @Test
    void metalPackStaysOnThemeAndCostsItsOwnElement() {
        JsonNode pack = ContentPackMerger.loadClasspathPack(mapper, METAL_PACK);
        for (JsonNode move : pack.get("moves")) {
            assertEquals("METAL", move.get("element").asText(), move.get("id").asText());
            assertTrue(METAL_THEME_EFFECTS.contains(move.get("effectType").asText()), move.get("id").asText());
        }
        Set<String> trapBuckets = new HashSet<>();
        for (JsonNode card : pack.get("cards")) {
            assertTrue(METAL_THEME_EFFECTS.contains(card.get("ability").get("effectType").asText()), card.get("id").asText());
            if ("SPELL".equals(card.get("type").asText())) {
                assertEquals("METAL", card.get("costElement").asText());
            } else {
                assertTrue(trapBuckets.add(card.get("trapBucketElement").asText()), "one Metal deception per trigger element");
            }
        }
    }

    @Test
    void laterContentPackKeepsEarlierPackIdsOnTheMarker() {
        // Firestore set+merge replaces a map field. A second pack must be written
        // on top of the ids already stored, or the next boot re-applies the first
        // pack's cardPatches over dashboard edits made after it landed.
        Map<String, Object> first = CardOverrideStorageService.appliedMarker(
                null, "metal-kit-2026-10", Map.of("appliedAt", "t1"));
        Map<String, Object> second = CardOverrideStorageService.appliedMarker(
                first, "water-kit", Map.of("appliedAt", "t2"));

        assertEquals("t1", ((Map<?, ?>) second.get("metal-kit-2026-10")).get("appliedAt"));
        assertEquals("t2", ((Map<?, ?>) second.get("water-kit")).get("appliedAt"));
        assertTrue(second.containsKey("metal-kit-2026-10"));
    }

    @Test
    void mergeIsAdditiveAndRepeatable() {
        JsonNode pack = ContentPackMerger.loadClasspathPack(mapper, METAL_PACK);
        ObjectNode snapshot = liveShapedSnapshot();
        // A designer already tuned Hammer Blow live; the pack must not stomp it.
        ObjectNode tuned = ((ArrayNode) snapshot.get("moves")).addObject();
        tuned.put("id", "hammer-blow").put("name", "Hammer Blow").put("element", "METAL")
                .put("targetType", "SINGLE_ENEMY").put("effectType", "damage").put("effectValue", 5).put("energyCost", 1);

        ContentPackMerger.Result first = ContentPackMerger.merge(mapper, snapshot, pack);
        assertEquals(pack.get("moves").size() - 1, first.movesAdded());
        JsonNode hammer = null;
        for (JsonNode move : first.data().get("moves")) {
            if ("hammer-blow".equals(move.get("id").asText())) {
                hammer = move;
            }
        }
        assertEquals(5, hammer.get("effectValue").asInt());

        ContentPackMerger.Result second = ContentPackMerger.merge(mapper, first.data(), pack);
        assertEquals(0, second.movesAdded());
        assertEquals(0, second.cardsAdded());
        assertEquals(first.data().get("cards").size(), second.data().get("cards").size());
    }

    private ObjectNode liveShapedSnapshot() {
        ObjectNode data = mapper.createObjectNode();
        ArrayNode cards = data.putArray("cards");
        addMetal(cards, "drillbo", "Drillbo", "COMMON", 12, 3, null);
        addMetal(cards, "blastro", "Blastro", "UNCOMMON", 16, 4, "drillbo");
        addMetal(cards, "constructo", "Constructo", "RARE", 15, 15, null);
        addMetal(cards, "new-siegling", "Clangbro", "EPIC", 20, 20, "constructo");
        addMetal(cards, "new-siegling-2", "Tortank (Bulwark)", "RARE", 18, 5, null);
        addMetal(cards, "new-siegling-4", "Tortank (Breaker)", "RARE", 15, 12, null);
        addMetal(cards, "siegebot", "Siegebot", "LEGENDARY", 25, 25, null);
        ArrayNode moves = data.putArray("moves");
        moves.addObject().put("id", "brassguard-brassguard-guard").put("name", "Brassguard Guard").put("element", "METAL")
                .put("targetType", "PASSIVE").put("effectType", "health_boost").put("effectValue", 1).put("isPassive", true);
        return data;
    }

    private void addMetal(ArrayNode cards, String id, String name, String rarity, int health, int speed, String evolvesFrom) {
        ObjectNode card = cards.addObject();
        card.put("type", "SIEGLING").put("id", id).put("name", name).put("element", "METAL").put("rarity", rarity)
                .put("health", health).put("speed", speed).put("preferredRow", "FRONT");
        card.putArray("moveIds").add("brassguard-brassguard-guard");
        if (evolvesFrom != null) {
            card.put("evolvesFromId", evolvesFrom);
        }
    }
}
